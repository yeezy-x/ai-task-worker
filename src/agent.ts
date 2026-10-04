import type { Page } from "playwright";
import { createAgentState } from "./agent-state.js";
import { AgentAction, AgentState, ToolAction, ToolName } from "./types.js";
import { createBrowserTools, ToolResult } from "./tools.js";
import { complete } from "./llm.js";
import { TOOL_NAMES } from "./types.js";

const MAX_STEPS = Number(process.env.AGENT_MAX_STEPS ?? 20);
const MAX_REPEATED_FAILURES = 3;

function prompt(state: AgentState, url: string): string {
    return `You can control a web browser, one action at a time.
  The site URL is ${url}.
  Goal:
  ${state.goal}
  Return only one JSON object. These are the only allowed shapes:
  {"type":"tool","tool":"browser.navigate","arguments":{"url":"https://example.com"}}
  {"type":"tool","tool":"browser.extract","arguments":{}}
  {"type":"tool","tool":"browser.click","arguments":{"name":"exact link or button text"}}
  {"type":"tool","tool":"browser.fill","arguments":{"label":"exact field label","value":"text"}}
  {"type":"complete","summary":"what was found"}
  {"type":"clarify","question":"what is unclear"}
  Rules:
  - Choose exactly one next action from the current observation.
  - browser.click name must match the visible link or button text exactly.
  - browser.fill label must match the field label exactly.
  - Use complete only after an observation already shows the requested outcome.
  - Use clarify when the page cannot answer the goal.
  - Do not return a list of actions.
  State:
  ${JSON.stringify(
    {
      observations: state.observations.slice(-4),
      facts: state.facts,
      completedActions: state.completedActions,
      failedActions: state.failedActions,
    },
    null,
    2,
  )}`;
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
    if (record.type !== "tool") return { error: "type must be tool, complete, or clarify." };
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
    const str = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (str?.[1]) return str[1].trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return text.slice(start, end + 1);
    return text.trim();
}

function requiredString(args: Record<string, unknown>, key: string): string | undefined {
    const value = args[key];
    return typeof value === "string" && value.trim() ? value : undefined;
}

export async function runAgent(page:Page,goal:string,url:string):Promise<AgentState>{
    const state=createAgentState(goal)
    const tools=createBrowserTools(page)
    const limit = Number.isFinite(MAX_STEPS) && MAX_STEPS > 0 ? MAX_STEPS : 20;
    let steps = 0;
    let failureKey = "";
    let failureCount = 0;
    console.log(`starting agent with goal: ${goal}`);
    while(state.status==="running" && steps<limit){
        const rawData=await complete(prompt(state,url))
        console.log(`Model Response(Decision): ${rawData.trim()}`);
        const parsed = parseAction(rawData);
        if ("error" in parsed) {
            const detail = `Invalid model response: ${parsed.error}`;
            state.failedActions.push(detail);
            state.observations.push(detail);
            console.log(`Model Response(Rejected): ${detail}`);
            steps += 1;
            if (noteFailure("invalid-response")) break;
            continue;
        }
        if (parsed.type === "complete") {
            state.status = "complete";
            state.summary = parsed.summary;
            console.log(`Agent Status(Complete): ${parsed.summary}`);
            break;
        }
        if (parsed.type === "clarify") {
            state.status = "blocked";
            state.question = parsed.question;
            console.log(`Agent Status(Blocked): ${parsed.question}`);
            break;
        }
        console.log(`Tool: ${parsed.tool}`);
        console.log(`Arguments: ${JSON.stringify(parsed.arguments)}`);
        const result = await execute(tools, parsed);
        const line = `${parsed.tool} ${JSON.stringify(parsed.arguments)}`;
        state.observations.push(result.observation);
        if (result.success) {
            state.completedActions.push(line);
            failureKey = "";
            failureCount = 0;
        } else {
            state.failedActions.push(`${line} :: ${result.error ?? "failed"}`);
        }
        console.log(`Tool Result(Success): ${result.success} url=${result.url}${result.error ? ` error=${result.error}` : ""}`);
        console.log(`Tool Result(Observation): ${result.observation.slice(0, 500)}`);
        steps += 1;
        if (!result.success && noteFailure(`${parsed.tool}:${JSON.stringify(parsed.arguments)}`)) break;
    }
    if (state.status === "running") {
        state.status = "step_limit";
        console.log(`Agent Status(Step Limit): ${steps}`);
      }
    return state;
    function noteFailure(key: string): boolean {
        failureCount = key === failureKey ? failureCount + 1 : 1;
        failureKey = key;
        if (failureCount < MAX_REPEATED_FAILURES) return false;
        state.status = "blocked";
        state.question = `Stopped after ${MAX_REPEATED_FAILURES} repeated failures.`;
        console.log(`Agent Status(Blocked): ${state.question}`);
        return true;
    }
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
        throw new Error(`Unknown tool: ${action.tool}`);
    }
}