import "./env.js";
import type { Page } from "playwright";
import { createAgentState } from "./agent-state.js";
import { AgentAction, AgentState, ToolAction, ToolName } from "./types.js";
import { createBrowserTools, ToolResult } from "./tools.js";
import { complete } from "./llm.js";
import { TOOL_NAMES } from "./types.js";

const MAX_STEPS = Number(process.env.AGENT_MAX_STEPS ?? 30);
const MAX_FAILURE_REPLANS = Number(process.env.MAX_FAILURE_REPLANS ?? 3);

function prompt(state: AgentState, url: string): string {
    const latest = state.observations.at(-1) ?? "";
    return `You control a web browser, one action at a time.
Site URL: ${url}
Goal: ${state.goal}
Return only one JSON object, using one of these shapes:
{"type":"tool","tool":"browser.navigate","arguments":{"url":"${url}"}}
{"type":"tool","tool":"browser.click","arguments":{"name":"exact link or button text"}}
{"type":"tool","tool":"browser.fill","arguments":{"label":"exact field label","value":"text"}}
{"type":"tool","tool":"browser.extract","arguments":{}}
{"type":"complete","summary":"<identifiers and the values the fresh read shows>"}
{"type":"clarify","question":"what is unclear"}
{"type":"approval","reason":"why a person must decide"}

Rules:
- The first action must be browser.navigate to the site URL.
- When the Next line is a JSON object, return that object exactly.
- Choose one next action from the goal, the facts, and the current observation. Never return a list.
- browser.click name must be copied exactly from a Links or Buttons line.
- browser.fill label must be copied exactly from a Fields line. Copy stored values without extra punctuation.
- Inbox lists incoming invoices and shows Received dates. Operations is where an invoice is entered and saved. Support lists requests and tickets and shows Opened dates. CRM lists customer records and their status.
- Read the record the goal says to find before changing anything. Latest or newest means the newest Received or Opened date for the customer named in the goal. A record already stored at the destination is not the source.
- Facts are working memory. Reuse them after you leave the page. When the goal applies to every matching record, keep each record and do not stop after the first.
- When Line items is one field, join every stored line item as "description: amount", one per line.
- If the goal says what a new status or note should mean, write that meaning. Do not copy a record's current status into the field you are changing.
- failedActions are actions that already failed. Do not repeat a failed action while the page URL is unchanged.
- If the observation contains Alert, the action failed. Follow the page text and choose a different listed link or button.
- A click or fill is not proof. After the change, call browser.extract. Complete only if that fresh read shows the requested result for every record the goal covers.
- The summary must say what was completed, say that browser.extract verified it, and quote the identifiers and resulting values from that read. If failedActions mentions a pending record, say the first save failed and how the later action recovered.
- clarify is valid only when the page lists no link, button, or field that can advance the goal.
- approval is valid only before an irreversible final action, such as Mark invoice final. Do not click that button until approval is granted.
- Do not submit a form while any field you can fill is still empty.
State:
${JSON.stringify(
    {
      observations: memoryObservations(state),
      facts: state.facts,
      completedActions: state.completedActions.slice(-8),
      failedActions: state.failedActions,
    },
    null,
    2,
  )}
${nextStep(latest, state)}
Return only the JSON object from the Next line.`;
}

function memoryObservations(state: AgentState): string[] {
    const recent = state.observations.slice(-3);
    const alert = [...state.observations].reverse().find((item) => /^Alert:/m.test(item));
    if (alert && !recent.includes(alert)) return [alert, ...recent];
    return recent;
}

const CHROME = /^(Inbox|Operations|Support|CRM|Back to .+|New invoice)$/;
const DETAIL_LABELS = new Set([
    "From",
    "Received",
    "Customer",
    "Invoice number",
    "Invoice date",
    "Amount",
    "Priority",
    "Status",
    "Opened",
    "CRM status to set",
]);

type RecordRow = {
    name: string;
    customer?: string;
    priority?: string;
    status?: string;
    opened?: string;
    received?: string;
    invoiceNumber?: string;
};

function field(text: string, label: string): string | undefined {
    return text.match(new RegExp(`^${label}:\\s*(\\S.*?)$`, "m"))?.[1]?.trim().replace(/[.\s]+$/, "");
}

function fieldValue(facts: string[], label: string): string | undefined {
    return facts.find((fact) => fact.startsWith(`${label}:`))?.slice(label.length + 1).trim();
}

function verifiedRead(state: AgentState): boolean {
    return state.completedActions.at(-1)?.startsWith("browser.extract") ?? false;
}

function wantsChange(goal: string): boolean {
    return /\b(save|update|add|enter|mark|set|leave|reflect)\b/i.test(goal);
}

function listed(latest: string, label: string): string[] {
    return latest.match(new RegExp(`^${label}: (.+)$`, "m"))?.[1].split(" | ") ?? [];
}

function pathname(observation: string): string {
    const url = observation.match(/^URL: (\S+)/m)?.[1];
    if (!url) return "";
    try {
      return new URL(url).pathname;
    } catch {
      return "";
    }
}

function pageTitle(observation: string): string {
    const line = (observation.split(/\n\n/)[0] ?? "")
      .split("\n")
      .find((item) => item.trim() && !item.startsWith("URL:"));
    return line?.replace(/\s+—\s+WorkPilot$/, "").trim() ?? "";
}

function pageBody(observation: string): string {
    return observation
      .split(/\n\n/)
      .filter((part) => !part.startsWith("URL:") && !/^(Links:|Buttons:|Fields:|Alert:)/.test(part))
      .join("\n");
}

function formFields(observation: string): { label: string; value: string; empty: boolean }[] {
    const block = observation.match(/\nFields:\n([\s\S]*?)(?:\n\n|$)/)?.[1] ?? "";
    return block.split("\n").flatMap((line) => {
      const match = line.match(/^(.+?):\s*(.*)$/);
      if (!match) return [];
      const empty = match[2].trim() === "(empty)" || match[2].trim() === "";
      return [{ label: match[1].trim(), value: empty ? "" : match[2].trim(), empty }];
    });
}

function noteRequested(goal: string): string | undefined {
    const match = goal.match(/\b(?:add|leave)\s+(?:an?\s+)?(.+?)\s+note\b/i);
    const phrase = match?.[1]?.trim();
    return phrase ? phrase : undefined;
}

function statusRequested(goal: string): string | undefined {
    if (/\b(being reviewed|under review)\b/i.test(goal)) return "Under Review";
    return undefined;
}

function listRecords(observation: string): RecordRow[] {
    const body = pageBody(observation);
    const links = listed(observation, "Links").filter((name) => !CHROME.test(name) && body.includes(name));
    return links.map((name) => {
      const start = body.indexOf(name);
      let end = body.length;
      for (const other of links) {
        if (other === name) continue;
        const at = body.indexOf(other, start + name.length);
        if (at > start && at < end) end = at;
      }
      const slice = body.slice(start, end);
      return {
        name,
        customer: slice.match(/Customer:\s*([^.\n|]+)/)?.[1]?.trim(),
        priority: slice.match(/Priority:\s*([A-Za-z]+)/)?.[1]?.toLowerCase(),
        status: slice.match(/Status:\s*([A-Za-z]+)/)?.[1]?.toLowerCase(),
        opened: slice.match(/Opened:\s*(\d{4}-\d{2}-\d{2})/)?.[1],
        received: slice.match(/Received:\s*(\d{4}-\d{2}-\d{2})/)?.[1],
        invoiceNumber: slice.match(/Invoice number:\s*([A-Za-z0-9-]+)/)?.[1],
      };
    });
}

function matchingRecords(goal: string, rows: RecordRow[]): RecordRow[] {
    const customers = [...new Set(rows.map((row) => row.customer).filter((name): name is string => Boolean(name)))];
    const named = customers.find((name) => goal.toLowerCase().includes(name.toLowerCase()));
    let matched = named ? rows.filter((row) => row.customer?.toLowerCase() === named.toLowerCase()) : rows;
    if (/\bhigh[-\s]?priority\b|\burgent\b/i.test(goal) && matched.some((row) => row.priority)) {
      matched = matched.filter((row) => row.priority === "high");
    }
    if (/\bunresolved\b|\bopen\b/i.test(goal) && matched.some((row) => row.status)) {
      matched = matched.filter((row) => row.status !== "resolved");
    }
    if (/\blatest\b|\bnewest\b/i.test(goal)) {
      const dated = matched.filter((row) => row.opened || row.received);
      if (dated.length > 0) {
        dated.sort((a, b) => (b.opened || b.received || "").localeCompare(a.opened || a.received || ""));
        return dated.slice(0, 1);
      }
    }
    return matched;
}

function recordKind(goal: string): "opened" | "received" | "either" {
    const opened = /\b(support|ticket|tickets|request|issue)\b/i.test(goal);
    const received = /\binvoice\b/i.test(goal);
    if (opened && !received) return "opened";
    if (received && !opened) return "received";
    return "either";
}

function sourceObservation(state: AgentState): string | undefined {
    const observations = [...state.observations].reverse();
    const opened = observations.find((observation) => listRecords(observation).some((row) => row.opened));
    const received = observations.find((observation) => listRecords(observation).some((row) => row.received));
    const kind = recordKind(state.goal);
    if (kind === "opened") return opened;
    if (kind === "received") return received;
    return opened ?? received;
}

function sourceRows(state: AgentState): RecordRow[] {
    const observation = sourceObservation(state);
    if (!observation) return [];
    return matchingRecords(state.goal, listRecords(observation));
}

function recordRead(state: AgentState, row: RecordRow): boolean {
    return state.facts.some((fact) => {
      if (!fact.startsWith("Record: ")) return false;
      const title = fact.slice("Record: ".length);
      return title === row.name || title === row.invoiceNumber;
    });
}

function sourceSatisfied(state: AgentState, row: RecordRow): boolean {
    const verified = state.facts.filter((fact) => fact.startsWith("Verified:"));
    const note = noteRequested(state.goal);
    if (note) {
      return verified.some(
        (fact) => fact.includes(row.name) && fact.toLowerCase().includes(note.toLowerCase()),
      );
    }
    const status = statusRequested(state.goal);
    if (status) {
      return verified.some(
        (fact) => fact.includes(`Status: ${status}`) && (!row.customer || fact.includes(row.customer)),
      );
    }
    if (row.invoiceNumber) {
      const mark = asksToFinalize(state.goal) ? /Status: final/ : /Status: saved/;
      return verified.some((fact) => fact.includes(row.invoiceNumber!) && mark.test(fact));
    }
    return verified.some((fact) => fact.includes(row.name));
}

function allSatisfied(state: AgentState): boolean {
    const rows = sourceRows(state);
    return rows.length > 0 && rows.every((row) => sourceSatisfied(state, row));
}

function nextUnread(state: AgentState): RecordRow | undefined {
    return sourceRows(state).find((row) => !recordRead(state, row) && !sourceSatisfied(state, row));
}

function asksToFinalize(goal: string): boolean {
    return /\bmark\b/i.test(goal) && /\bfinal\b/i.test(goal);
}

function readyToFinalize(latest: string, state: AgentState): boolean {
    return asksToFinalize(state.goal) && /Status:\s*saved/.test(latest) && listed(latest, "Buttons").includes("Mark invoice final");
}

function isMutationClick(action: string): boolean {
    return action.startsWith("browser.click") && /"(Save invoice|Update status|Add note|Confirm pending invoice|Mark invoice final)"/.test(action);
}

function suggestedControl(latest: string, alert: string): string | undefined {
    const words = alert.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
    return listed(latest, "Links").find((name) => {
      if (CHROME.test(name)) return false;
      const lowered = name.toLowerCase();
      return words.some((word) => lowered.includes(word));
    });
}

function valueForField(label: string, state: AgentState): string | undefined {
    if (label === "Note") return noteRequested(state.goal);
    if (label === "Status") {
      if (statusRequested(state.goal)) return statusRequested(state.goal);
      const requested = state.facts.find((fact) => fact.startsWith("CRM status to set:"));
      if (requested && /\bstatus\b/i.test(state.goal)) return requested.slice("CRM status to set:".length).trim();
      return undefined;
    }
    if (label === "Line items") return fieldValue(state.facts, "Line items")?.split(" | ").join("\n");
    return fieldValue(state.facts, label);
}

function nextFill(state: AgentState, latest: string): { label: string; value: string } | undefined {
    if (!formIsTarget(state, latest) || pageVerified(state, latest)) return undefined;
    for (const entry of formFields(latest)) {
      const desired = valueForField(entry.label, state);
      if (!desired || entry.value === desired) continue;
      if (desired.split("\n").every((part) => latest.includes(part))) continue;
      return { label: entry.label, value: desired };
    }
    return undefined;
}

function formIsTarget(state: AgentState, latest: string): boolean {
    const fields = formFields(latest);
    const title = pageTitle(latest);
    if (fields.some((entry) => entry.label === "Note") && noteRequested(state.goal)) {
      return sourceRows(state).some((row) => row.name === title);
    }
    if (fields.some((entry) => entry.label === "Status") && valueForField("Status", state)) {
      const customer = fieldValue(state.facts, "Customer");
      return !customer || title === customer;
    }
    if (fields.some((entry) => entry.label === "Invoice number") && recordKind(state.goal) !== "opened") {
      return Boolean(fieldValue(state.facts, "Invoice number"));
    }
    return false;
}

function outcomeVisible(observation: string, state: AgentState): boolean {
    const note = noteRequested(state.goal);
    if (note) return observation.toLowerCase().includes(note.toLowerCase());
    const status = statusRequested(state.goal);
    if (status) return observation.includes(`Status: ${status}`);
    if (/Mark invoice final/.test(state.completedActions.at(-1) ?? "")) return /Status:\s*final/.test(observation);
    if (recordKind(state.goal) !== "opened" && fieldValue(state.facts, "Invoice number")) return /Status:\s*saved/.test(observation);
    return false;
}

function pageVerified(state: AgentState, latest: string): boolean {
    const title = pageTitle(latest);
    const note = noteRequested(state.goal);
    const status = statusRequested(state.goal);
    return state.facts.some((fact) => {
      if (!fact.startsWith("Verified:")) return false;
      if (note) return (fact.startsWith(`Verified: ${title} |`) || fact === `Verified: ${title}`) && fact.toLowerCase().includes(note.toLowerCase());
      if (status) return fact.includes(`Status: ${status}`) && fact.includes(title);
      return fact.includes(title) && /Status: saved/.test(fact);
    });
}

function submitName(state: AgentState, latest: string): string | undefined {
    if (!formIsTarget(state, latest) || pageVerified(state, latest) || nextFill(state, latest)) return undefined;
    const buttons = listed(latest, "Buttons");
    if (buttons.includes("Save invoice") && formFields(latest).every((entry) => !entry.empty)) return "Save invoice";
    if (buttons.includes("Update status")) return "Update status";
    if (buttons.includes("Add note")) return "Add note";
    return undefined;
}

function linkToSource(latest: string, state: AgentState): string | undefined {
    const unread = nextUnread(state);
    if (!unread) return undefined;
    const links = listed(latest, "Links");
    if (links.includes(unread.name)) return unread.name;
    const source = sourceObservation(state);
    const area = source?.includes("/support") ? "Support" : source?.includes("/inbox") ? "Inbox" : undefined;
    const back = links.find((name) => area && new RegExp(`^Back to ${area}$`, "i").test(name));
    if (back) return back;
    if (area && links.includes(area)) return area;
    return undefined;
}

function destinationClick(latest: string, state: AgentState): string | undefined {
    if (nextUnread(state) || allSatisfied(state) || !state.facts.some((fact) => fact.startsWith("Record: "))) return undefined;
    const links = listed(latest, "Links");
    const path = pathname(latest);
    const customer = fieldValue(state.facts, "Customer");
    if (recordKind(state.goal) !== "opened" && fieldValue(state.facts, "Invoice number") && path.startsWith("/operations") && links.includes("New invoice")) {
      return "New invoice";
    }
    if (recordKind(state.goal) !== "opened" && fieldValue(state.facts, "Invoice number") && links.includes("Operations") && !path.startsWith("/operations")) {
      return "Operations";
    }
    const status = valueForField("Status", state);
    if (status && path.startsWith("/crm/") && customer && pageTitle(latest) !== customer) {
      return links.includes("Back to CRM") ? "Back to CRM" : links.includes("CRM") ? "CRM" : undefined;
    }
    if (status && path === "/crm" && customer && links.includes(customer)) return customer;
    if (status && links.includes("CRM") && !path.startsWith("/crm")) return "CRM";
    return undefined;
}

function toolHint(tool: string, args: Record<string, string>): string {
    return `Next: ${JSON.stringify({ type: "tool", tool, arguments: args })}`;
}

function completionSummary(state: AgentState, latest: string): string {
    const recovery = state.failedActions.some((entry) => /pending/i.test(entry))
      ? " The first save failed because a pending record had to be reviewed and confirmed."
      : "";
    const invoice = field(latest, "Invoice number");
    if (invoice && /Status:\s*(saved|final)/.test(latest)) {
      const customer = field(latest, "Customer") ?? "";
      const amount = field(latest, "Amount") ?? "";
      const shown = /Status:\s*final/.test(latest) ? "final" : "saved";
      return `Completed ${customer} invoice ${invoice} for ${amount}. Verified by browser.extract: Customer ${customer}, Invoice number ${invoice}, Amount ${amount}, Status: ${shown}.${recovery}`;
    }
    const names = sourceRows(state).map((row) => row.name);
    const verified = state.facts.filter((fact) => fact.startsWith("Verified:")).map((fact) => fact.replace(/^Verified:\s*/, ""));
    return `Completed and verified. Evidence: ${[...names, ...verified].join("; ")}. Final state was re-read after the update.${recovery}`;
}

function nextStep(latest: string, state: AgentState): string {
    if (state.completedActions.length === 0) return "Next: browser.navigate to the site URL.";
    const alert = latest.match(/^Alert: (.+)$/m)?.[1];
    if (alert) {
      const control = suggestedControl(latest, alert);
      return control
        ? toolHint("browser.click", { name: control })
        : "Next: click the non-navigation link named by the Alert. Do not repeat the failed action.";
    }
    if (/Status:\s*pending/.test(latest)) {
      const button = listed(latest, "Buttons").find((name) => !/^(Inbox|Operations|Support|CRM)$/.test(name));
      if (button) return toolHint("browser.click", { name: button });
    }
    const fill = nextFill(state, latest);
    if (fill) return toolHint("browser.fill", fill);
    if (isMutationClick(state.completedActions.at(-1) ?? "") && outcomeVisible(latest, state)) {
      return toolHint("browser.extract", {});
    }
    if (readyToFinalize(latest, state) && !state.approved) {
      return `Next: ${JSON.stringify({ type: "approval", reason: "Mark invoice final is irreversible. Approve before the invoice is marked final." })}`;
    }
    if (readyToFinalize(latest, state) && state.approved) {
      return toolHint("browser.click", { name: "Mark invoice final" });
    }
    if (wantsChange(state.goal) && allSatisfied(state) && verifiedRead(state)) {
      return `Next: ${JSON.stringify({ type: "complete", summary: completionSummary(state, latest) })}`;
    }
    const submit = submitName(state, latest);
    if (submit) return toolHint("browser.click", { name: submit });
    const sourceLink = linkToSource(latest, state);
    if (sourceLink) return toolHint("browser.click", { name: sourceLink });
    const destination = destinationClick(latest, state);
    if (destination) return toolHint("browser.click", { name: destination });
    if (!sourceObservation(state)) {
      const links = listed(latest, "Links");
      const kind = recordKind(state.goal);
      if (kind === "opened" && links.includes("Support")) return toolHint("browser.click", { name: "Support" });
      if (kind === "received" && links.includes("Inbox")) return toolHint("browser.click", { name: "Inbox" });
      return "Next: click the section that lists the records to find. Inbox lists invoices and shows Received dates. Support lists requests and tickets and shows Opened dates. Read that record before opening Operations or CRM.";
    }
    return "Next: use a listed link, button, or field to move the goal forward. Do not clarify.";
}

function parseAction(raw: string): AgentAction | { error: string } {
    let value: unknown;
    try {
      value = JSON.parse(extractJson(raw));
    } catch {
      return { error: "Response was not JSON." };
    }
    if (Array.isArray(value)) return { error: "Response must be one object, not a sequence." };
    if (!value || typeof value !== "object") return { error: "Response must be a JSON object." };
    const record = value as Record<string, unknown>;
    if (record.type === "complete") {
      if (typeof record.summary !== "string" || !record.summary.trim()) {
        return { error: "complete requires a summary." };
      }
      return { type: "complete", summary: record.summary };
    }
    if (record.type === "clarify") {
      if (typeof record.question !== "string" || !record.question.trim()) {
        return { error: "clarify requires a question." };
      }
      return { type: "clarify", question: record.question };
    }
    if (record.type === "approval") {
      if (typeof record.reason !== "string" || !record.reason.trim()) {
        return { error: "approval requires a reason." };
      }
      return { type: "approval", reason: record.reason };
    }
    if (record.type !== "tool") {
      if (typeof record.type === "string" && TOOL_NAMES.includes(record.type as ToolName)) {
        record.tool = record.type;
        record.type = "tool";
      } else if (typeof record.tool === "string" && TOOL_NAMES.includes(record.tool as ToolName)) {
        record.type = "tool";
      } else {
        return { error: "type must be tool, complete, clarify, or approval." };
      }
    }
    if (!TOOL_NAMES.includes(record.tool as ToolName)) return { error: "Unknown tool." };
    const args = record.arguments;
    if (!args || typeof args !== "object" || Array.isArray(args)) {
      return { error: "tool requires an arguments object." };
    }
    const arguments_ = args as Record<string, unknown>;
    const tool = record.tool as ToolName;
    if (tool === "browser.navigate") {
      const url = requiredString(arguments_, "url");
      if (!url) return { error: "browser.navigate requires arguments.url." };
      return { type: "tool", tool, arguments: { url } };
    }
    if (tool === "browser.click") {
      const name = requiredString(arguments_, "name");
      if (!name) return { error: "browser.click requires arguments.name." };
      return { type: "tool", tool, arguments: { name } };
    }
    if (tool === "browser.fill") {
      const label = requiredString(arguments_, "label");
      const text = requiredString(arguments_, "value");
      if (!label || !text) return { error: "browser.fill requires arguments.label and arguments.value." };
      return { type: "tool", tool, arguments: { label, value: text } };
    }
    return { type: "tool", tool, arguments: {} };
}

function extractJson(text: string): string {
    const withoutThoughts = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    const str = withoutThoughts.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (str?.[1]) return str[1].trim();
    const start = withoutThoughts.indexOf("{");
    const end = withoutThoughts.lastIndexOf("}");
    if (start >= 0 && end > start) return withoutThoughts.slice(start, end + 1);
    return withoutThoughts.trim();
}

function requiredString(args: Record<string, unknown>, key: string): string | undefined {
    const value = args[key];
    return typeof value === "string" && value.trim() ? value : undefined;
}

export type AgentEvent = { title: string; detail: string };

export type AgentHooks = {
    onApproval?: (reason: string) => Promise<boolean>;
    onEvent?: (event: AgentEvent) => void;
};

export async function runAgent(page: Page, goal: string, url: string, hooks?: AgentHooks): Promise<AgentState> {
    const state=createAgentState(goal)
    const tools=createBrowserTools(page)
    const limit = Number.isFinite(MAX_STEPS) && MAX_STEPS > 0 ? MAX_STEPS : 30;
    const replanLimit = Number.isFinite(MAX_FAILURE_REPLANS) && MAX_FAILURE_REPLANS > 0 ? MAX_FAILURE_REPLANS : 3;
    let steps = 0;
    let failureKey = "";
    let failureCount = 0;
    const emit = (title: string, detail: string) => hooks?.onEvent?.({ title, detail });
    console.log(`starting agent with goal: ${goal}`);
    emit("Task received", goal);
    while(state.status==="running" && steps<limit){
        let rawData: string;
        try {
          rawData = await complete(prompt(state, url));
        } catch (error) {
          state.status = "blocked";
          state.question = error instanceof Error ? error.message : String(error);
          console.log(`Agent Status(Blocked): ${state.question}`);
          break;
        }
        console.log(`\nStep ${steps + 1}`);
        console.log(nextStep(state.observations.at(-1) ?? "", state).split("\n")[0]);
        console.log(`Model Response(Decision): ${rawData.trim()}`);
        emit("LLM decision", rawData.trim());
        const parsed = parseAction(rawData);
        if ("error" in parsed) {
            if (reject(`Invalid model response: ${parsed.error}`, "invalid-response")) break;
            continue;
        }
        if (parsed.type === "complete") {
          const problem = completionError(state, parsed.summary);
          if (problem) {
              if (reject(`Invalid model response: ${problem}`, problem.startsWith("use this summary") ? "weak-summary" : "premature-complete")) break;
              continue;
          }
          state.status = "complete";
          state.summary = parsed.summary;
          console.log(`Agent Status(Complete): ${parsed.summary}`);
          emit("Completed", parsed.summary);
          break;
      }
      const latestForApproval = state.observations.at(-1) ?? "";
      const finalClick = parsed.type === "tool" && parsed.tool === "browser.click" && parsed.arguments.name === "Mark invoice final";
      if (parsed.type === "approval" || finalClick) {
          if (!readyToFinalize(latestForApproval, state)) {
            if (reject("Invalid model response: approval is only required before marking a saved invoice final.", "premature-approval")) break;
            continue;
          }
          if (!state.approved) {
            const reason = "Mark invoice final is irreversible. Approve before the invoice is marked final.";
            state.status = "awaiting_approval";
            state.question = reason;
            console.log(`Agent Status(Awaiting Approval): ${reason}`);
            emit("Approval required", reason);
            const allowed = hooks?.onApproval ? await hooks.onApproval(reason) : false;
            if (!allowed) {
              state.status = "blocked";
              state.question = "Approval denied. The invoice was not marked final.";
              console.log(`Agent Status(Blocked): ${state.question}`);
              emit("Approval denied", state.question);
              break;
            }
            state.approved = true;
            state.status = "running";
            state.question = undefined;
            console.log("Approval granted.");
            emit("Approval granted", "The final action can proceed.");
            continue;
          }
          if (parsed.type === "approval") {
            if (reject("Invalid model response: approval was granted. Click Mark invoice final.", "repeat-approval")) break;
            continue;
          }
      }
      if (parsed.type === "clarify") {
          const latest = state.observations.at(-1) ?? "";
          if (/^Links: .+/m.test(latest) || /^Buttons: .+/m.test(latest) || /^Fields:/m.test(latest)) {
              if (reject("Invalid model response: the page still has links, buttons, or fields. Use one of them instead of clarify.", "premature-clarify")) break;
              continue;
          }
          state.status = "blocked";
          state.question = parsed.question;
          console.log(`Agent Status(Blocked): ${parsed.question}`);
          break;
      }
        if (wantsChange(state.goal) && allSatisfied(state) && verifiedRead(state)) {
            if (reject(`Invalid model response: use this summary: ${completionSummary(state, state.observations.at(-1) ?? "")}`, "premature-complete")) break;
            continue;
        }
        const latestObservation = state.observations.at(-1) ?? "";
        if (!state.facts.some((fact) => fact.startsWith("Record: ")) && parsed.tool === "browser.fill") {
            if (reject("Invalid model response: read the source record before filling the form.", "fill-before-read")) break;
            continue;
        }
        const pendingFill = nextFill(state, latestObservation);
        const followedFill = pendingFill
          && parsed.tool === "browser.fill"
          && parsed.arguments.label === pendingFill.label
          && parsed.arguments.value === pendingFill.value;
        if (pendingFill && !followedFill) {
            if (reject(`Invalid model response: return ${JSON.stringify({ type: "tool", tool: "browser.fill", arguments: pendingFill })}`, "fill-before-submit")) break;
            continue;
        }
        const alert = latestObservation.match(/^Alert: (.+)$/m)?.[1];
        if (alert && parsed.tool === "browser.click" && /^(Inbox|Operations|Support|CRM|Back to .+)$/.test(parsed.arguments.name ?? "")) {
            if (reject(`Invalid model response: an alert is showing. Click the link described by the alert, not ${parsed.arguments.name}.`, "ignore-alert")) break;
            continue;
        }
        const line = `${parsed.tool} ${JSON.stringify(parsed.arguments)}`;
        const currentUrl = latestObservation.match(/^URL: (\S+)/m)?.[1] ?? "";
        const attempt = `${currentUrl} ${line}`;
        if (state.failedActions.some((entry) => entry.startsWith(`${attempt} ::`))) {
            if (reject(`Invalid model response: ${line} already failed on this page. Choose a different action from the observation.`, "repeat-failed-action")) break;
            continue;
        }
        console.log(`Tool: ${parsed.tool}`);
        console.log(`Arguments: ${JSON.stringify(parsed.arguments)}`);
        const result = await execute(tools, parsed);
        const observation = `URL: ${result.url}\n${result.observation}`;
        state.observations.push(observation);
        if (result.success) remember(state, observation, parsed);
        if (result.success) {
            state.completedActions.push(line);
            failureKey = "";
            failureCount = 0;
        } else {
            state.failedActions.push(`${result.url} ${line} :: ${result.error ?? "failed"}`);
        }
        console.log(`Tool Result(Success): ${result.success} url=${result.url}${result.error ? ` error=${result.error}` : ""}`);
        emit(result.success ? parsed.tool : "Failure", `${parsed.tool} ${JSON.stringify(parsed.arguments)}\n${result.success ? observation : result.error ?? "failed"}`);
        console.log(`Tool Result(Observation):\n${observation}`);
        console.log(`Facts: ${JSON.stringify(state.facts, null, 2)}`);
        steps += 1;
        if (!result.success && noteFailure(`${result.url} ${line}`)) break;
    }
    if (state.status === "running") {
        state.status = "step_limit";
        console.log(`Agent Status(Step Limit): ${steps}`);
    }
    return state;
    function noteFailure(key: string): boolean {
        failureCount = key === failureKey ? failureCount + 1 : 1;
        failureKey = key;
        if (failureCount < replanLimit) return false;
        state.status = "blocked";
        state.question = `Stopped after ${replanLimit} repeated failures.`;
        console.log(`Agent Status(Blocked): ${state.question}`);
        return true;
    }
    function reject(detail: string, key: string): boolean {
        state.failedActions.push(detail);
        console.log(`Model Response(Rejected): ${detail}`);
        steps += 1;
        return noteFailure(key);
    }
    function remember(state: AgentState, observation: string, action: ToolAction): void {
      const body = pageBody(observation);
      const dated = listRecords(observation).filter((row) => row.opened || row.received);
      if (dated.length > 0) {
        const seen = dated.map((row) => {
          const parts = [`Seen: ${row.name}`];
          if (row.customer) parts.push(`Customer: ${row.customer}`);
          if (row.priority) parts.push(`Priority: ${row.priority}`);
          if (row.status) parts.push(`Status: ${row.status}`);
          if (row.opened) parts.push(`Opened: ${row.opened}`);
          if (row.received) parts.push(`Received: ${row.received}`);
          if (row.invoiceNumber) parts.push(`Invoice number: ${row.invoiceNumber}`);
          return parts.join(" | ");
        });
        state.facts = [...state.facts.filter((fact) => !fact.startsWith("Seen:")), ...seen];
      }
      const customers = [...body.matchAll(/^Customer:\s*(\S.*?)$/gm)];
      if (customers.length === 1) {
        const title = pageTitle(observation);
        const lines = [...body.matchAll(/^([^:\n]{1,60}):\s*(\S.*?)$/gm)]
          .map((match) => ({ label: match[1].trim(), value: match[2].trim().replace(/[.\s]+$/, "") }))
          .filter((item) => DETAIL_LABELS.has(item.label))
          .map((item) => `${item.label}: ${item.value}`);
        const lineItems = [...body.matchAll(/^([^:\n]+):\s*(\d+\.\d+)\.?$/gm)]
          .filter((match) => !DETAIL_LABELS.has(match[1].trim()))
          .map((match) => `${match[1].trim()}: ${match[2]}`);
        if (lineItems.length > 0) lines.push(`Line items: ${lineItems.join(" | ")}`);
        if (title && lines.length > 0) upsertRecord(state, title, lines);
      }
      if (action.tool !== "browser.extract" || !isMutationClick(state.completedActions.at(-1) ?? "")) return;
      if (!outcomeVisible(observation, state)) return;
      const notes = noteLines(body);
      const parts = [`Verified: ${pageTitle(observation)}`];
      const customer = field(body, "Customer");
      const status = field(body, "Status");
      const invoice = field(body, "Invoice number");
      const amount = field(body, "Amount");
      if (customer) parts.push(`Customer: ${customer}`);
      if (status) parts.push(`Status: ${status}`);
      if (invoice) parts.push(`Invoice number: ${invoice}`);
      if (amount) parts.push(`Amount: ${amount}`);
      if (notes.length > 0) parts.push(`Notes: ${notes.join(" | ")}`);
      const verified = parts.join(" | ");
      if (!state.facts.includes(verified)) state.facts.push(verified);
    }
}

function noteLines(body: string): string[] {
    const after = body.split(/\nNotes\n/)[1];
    if (!after) return [];
    const notes: string[] = [];
    for (const line of after.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/^(Note:?|Add note|Back to )/.test(trimmed)) break;
      if (trimmed === "No notes.") break;
      notes.push(trimmed.replace(/[.\s]+$/, ""));
    }
    return notes;
}

function upsertRecord(state: AgentState, title: string, lines: string[]): void {
    const header = `Record: ${title}`;
    const kept: string[] = [];
    let skipping = false;
    for (const fact of state.facts) {
      if (fact === header) {
        skipping = true;
        continue;
      }
      if (skipping) {
        if (fact.startsWith("Record: ") || fact.startsWith("Verified:") || fact.startsWith("Seen:")) skipping = false;
        else continue;
      }
      if (!skipping) kept.push(fact);
    }
    state.facts = [...kept, header, ...lines];
}

function completionError(state: AgentState, summary: string): string | undefined {
    const latest = state.observations.at(-1) ?? "";
    const expected = completionSummary(state, latest);
    if (!wantsChange(state.goal)) {
      return state.facts.length === 0 ? "complete requires facts read from the page." : undefined;
    }
    if (!allSatisfied(state)) return "update every matching record, then browser.extract each result before complete.";
    if (!verifiedRead(state)) return "browser.extract the result before complete. A successful click is not verification.";
    const invoice = field(latest, "Invoice number");
    const sourceInvoice = fieldValue(state.facts, "Invoice number");
    if (sourceInvoice && invoice && sourceInvoice !== invoice) {
      return `this saved record is ${invoice}, but the record you read was ${sourceInvoice}.`;
    }
    if (sourceInvoice && invoice && asksToFinalize(state.goal) && !/Status:\s*final/.test(latest)) {
      return "the fresh read must show Status: final.";
    }
    if (sourceInvoice && invoice && !asksToFinalize(state.goal) && !/Status:\s*saved/.test(latest)) {
      return "the fresh read must show Status: saved.";
    }
    const note = noteRequested(state.goal);
    if (note && !latest.toLowerCase().includes(note.toLowerCase())) return "the fresh read must show the requested note.";
    const status = statusRequested(state.goal);
    if (status && !latest.includes(status)) return `the fresh read must show Status: ${status}.`;
    if (!/verif/i.test(summary)) return `use this summary: ${expected}`;
    const shownStatus = field(latest, "Status");
    if (invoice && shownStatus && !summary.toLowerCase().includes(shownStatus.toLowerCase())) return `use this summary: ${expected}`;
    const customer = field(latest, "Customer");
    if (customer && !summary.includes(customer)) return `use this summary: ${expected}`;
    if (invoice && !summary.includes(invoice)) return `use this summary: ${expected}`;
    const amount = field(latest, "Amount");
    if (amount && /Status:\s*(saved|final)/.test(latest) && !summary.includes(amount)) return `use this summary: ${expected}`;
    if (note && !summary.toLowerCase().includes(note.toLowerCase())) return `use this summary: ${expected}`;
    if (status && !summary.includes(status)) return `use this summary: ${expected}`;
    for (const row of sourceRows(state)) {
      const token = row.invoiceNumber ?? row.name;
      if (!summary.includes(token)) return `use this summary: ${expected}`;
    }
    if (state.failedActions.some((entry) => /pending/i.test(entry)) && !/pending/i.test(summary)) {
      return `use this summary: ${expected}`;
    }
    return undefined;
}

async function execute(
    tools: ReturnType<typeof createBrowserTools>,
    action: ToolAction,
  ): Promise<ToolResult> {
    switch (action.tool) {
      case "browser.navigate":
        return tools.navigate({ url: action.arguments.url });
      case "browser.extract":
        return tools.extract();
      case "browser.click":
        return tools.click({ name: action.arguments.name });
      case "browser.fill":
        return tools.fill({ label: action.arguments.label, value: action.arguments.value });
      default:
        return {
          success: false,
          url: "",
          observation: "Unknown tool.",
          error: `Unknown tool: ${action.tool}`,
        };
    }
}