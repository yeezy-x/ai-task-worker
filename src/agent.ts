import { chromium, type Browser, type Page } from "playwright";
import type { AgentDecision, AgentState, Completion, Observation, ToolCall, ToolName } from "./types.js";

const toolNames: ToolName[] = ["browser.navigate", "browser.read", "browser.click", "browser.fill", "browser.select"];
const modelConfig = () => ({
  key: process.env.GEMINI_API_KEY,
  baseUrl: (process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai/").replace(/\/$/, ""),
  model: process.env.GEMINI_MODEL ?? "gemini-3.5-flash"
});

const instructions = (baseUrl: string) => `You are WorkPilot, a careful autonomous worker inside a simulated company. Complete the user's goal using the browser tools, one action per response. Never invent facts or claim success until you have independently read the final browser state after the last change.

You may only navigate within ${baseUrl}. The company apps are /inbox, /crm, /support, and /operations. Pages deliberately expose stable data-testid selectors. Read pages before interacting. When a tool error occurs, inspect its observation and choose a different safe action; do not repeat a failed mutation unchanged. Extract and retain useful details as short facts.

Return strict JSON only, matching exactly one of:
{"type":"tool","tool":"browser.navigate|browser.read|browser.click|browser.fill|browser.select","input":{"url"|"selector"|"value":"..."},"reasoning":"...","facts":["..."]}
{"type":"complete","summary":"...","evidence":["actual verified fact"],"facts":["..."]}
{"type":"approval","reason":"...","facts":["..."]}

Tool inputs: navigate requires url (a path or full local URL); read accepts optional selector; click requires selector; fill requires selector and value; select requires selector and value. Use the exact form controls and buttons rendered in pages. Completion will be rejected by the server unless a browser.read happened after the last write.`;

function cleanJson(text: string) {
  const candidate = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(candidate) as AgentDecision;
}

async function decide(state: AgentState, baseUrl: string): Promise<AgentDecision> {
  const config = modelConfig();
  if (!config.key) throw new Error("GEMINI_API_KEY is not configured. Add it to .env before running an autonomous task.");
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: instructions(baseUrl) },
        { role: "user", content: JSON.stringify({ goal: state.goal, facts: state.facts, completedActions: state.completedActions.map((item) => item.summary), failedActions: state.failedActions.map((item) => item.summary), latestObservations: state.observations.slice(-6) }) }
      ]
    })
  });
  if (!response.ok) throw new Error(`Model request failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return cleanJson(payload.choices?.[0]?.message?.content ?? "");
}

function validate(decision: AgentDecision) {
  if (decision.type === "tool") {
    if (!toolNames.includes(decision.tool) || typeof decision.reasoning !== "string" || !decision.input) throw new Error("The model selected an invalid tool action.");
    const input = decision.input;
    if (decision.tool === "browser.navigate" && !input.url) throw new Error("navigate requires input.url");
    if (["browser.read", "browser.click", "browser.fill", "browser.select"].includes(decision.tool) && decision.tool !== "browser.read" && !input.selector) throw new Error(`${decision.tool} requires input.selector`);
    if (["browser.fill", "browser.select"].includes(decision.tool) && input.value === undefined) throw new Error(`${decision.tool} requires input.value`);
  }
}

function observation(action: string, ok: boolean, summary: string, detail: Record<string, unknown> = {}): Observation {
  return { at: new Date().toISOString(), action, ok, summary, detail };
}

class BrowserTools {
  constructor(private readonly page: Page, private readonly baseUrl: string) {}
  private url(raw: string) {
    const url = new URL(raw, this.baseUrl);
    if (url.origin !== this.baseUrl) throw new Error("Navigation outside the local simulated company is not allowed.");
    return url.toString();
  }
  private async preview() { return (await this.page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 4000); }
  async run(call: ToolCall): Promise<Observation> {
    try {
      if (call.tool === "browser.navigate") {
        await this.page.goto(this.url(call.input.url), { waitUntil: "domcontentloaded" });
        return observation(call.tool, true, `Opened ${new URL(this.page.url()).pathname}.`, { url: this.page.url(), text: await this.preview() });
      }
      if (call.tool === "browser.read") {
        const text = call.input.selector ? await this.page.locator(call.input.selector).first().innerText() : await this.preview();
        return observation(call.tool, true, `Read ${call.input.selector ?? "the current page"}.`, { url: this.page.url(), text: text.slice(0, 5000) });
      }
      if (call.tool === "browser.fill") {
        await this.page.locator(call.input.selector).fill(call.input.value);
        return observation(call.tool, true, `Filled ${call.input.selector}.`, { selector: call.input.selector, value: call.input.value });
      }
      if (call.tool === "browser.select") {
        await this.page.locator(call.input.selector).selectOption({ label: call.input.value }).catch(() => this.page.locator(call.input.selector).selectOption(call.input.value));
        return observation(call.tool, true, `Selected ${call.input.value} in ${call.input.selector}.`, { selector: call.input.selector, value: call.input.value });
      }
      await Promise.all([this.page.waitForLoadState("domcontentloaded").catch(() => undefined), this.page.locator(call.input.selector).click()]);
      const pageText = await this.preview();
      const failure = await this.page.locator("[data-testid='operations-error']").count() ? await this.page.locator("[data-testid='operations-error']").innerText() : "";
      return failure
        ? observation(call.tool, false, `Click produced application error: ${failure}`, { selector: call.input.selector, url: this.page.url(), text: pageText, error: failure })
        : observation(call.tool, true, `Clicked ${call.input.selector}.`, { selector: call.input.selector, url: this.page.url(), text: pageText });
    } catch (error) {
      return observation(call.tool, false, `${call.tool} failed: ${error instanceof Error ? error.message : String(error)}`, { selector: call.input.selector, url: this.page.url() });
    }
  }
}

export class TaskRunner {
  readonly state: AgentState;
  private browser?: Browser;
  private stopped = false;
  constructor(private readonly baseUrl: string, goal: string, private readonly onUpdate: (state: AgentState) => void) {
    this.state = { id: crypto.randomUUID(), goal, status: "running", observations: [], facts: [], completedActions: [], failedActions: [], startedAt: new Date().toISOString(), evidence: [] };
  }
  private publish() { this.onUpdate(structuredClone(this.state)); }
  private add(obs: Observation, mutation = false) {
    this.state.observations.push(obs);
    (obs.ok ? this.state.completedActions : this.state.failedActions).push(obs);
    if (mutation && obs.ok) this.state.lastMutationAt = this.state.observations.length;
    if (obs.action === "browser.read" && this.state.lastMutationAt && this.state.observations.length > this.state.lastMutationAt && obs.ok) this.state.verificationAt = this.state.observations.length;
    this.publish();
  }
  async run() {
    this.publish();
    try {
      this.browser = await chromium.launch({ headless: false, slowMo: 700 });
      const page = await this.browser.newPage();
      const tools = new BrowserTools(page, this.baseUrl);
      for (let step = 0; step < 32 && !this.stopped; step += 1) {
        const decision = await decide(this.state, this.baseUrl);
        validate(decision);
        for (const fact of decision.facts ?? []) if (typeof fact === "string" && !this.state.facts.includes(fact)) this.state.facts.push(fact);
        if (decision.type === "approval") {
          this.state.status = "needs_approval";
          this.add(observation("approval", true, decision.reason, {}));
          return;
        }
        if (decision.type === "complete") {
          if (!this.state.lastMutationAt || !this.state.verificationAt || this.state.verificationAt <= this.state.lastMutationAt) {
            this.add(observation("completion", false, "Completion rejected: perform a browser.read after the final change to verify actual state.", {}));
            continue;
          }
          this.state.status = "completed";
          this.state.finalSummary = decision.summary;
          this.state.evidence = decision.evidence;
          this.state.finishedAt = new Date().toISOString();
          this.publish();
          return;
        }
        const isMutation = ["browser.click", "browser.fill", "browser.select"].includes(decision.tool);
        this.add(await tools.run(decision), isMutation);
      }
      if (!this.stopped) {
        this.state.status = "step_limit";
        this.state.finishedAt = new Date().toISOString();
        this.add(observation("system", false, "Safe step limit reached before verified completion.", {}));
      }
    } catch (error) {
      this.state.status = "failed";
      this.state.finishedAt = new Date().toISOString();
      this.add(observation("system", false, error instanceof Error ? error.message : String(error), {}));
    } finally { await this.browser?.close(); }
  }
}
