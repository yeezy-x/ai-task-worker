export type AgentAction=ToolAction | CompleteAction | ClarifyAction;

export type ToolAction={
    type:"tool",
    tool:ToolName,
    arguments:Record<string,string>
}

export type CompleteAction={
    type:"complete",
    summary:string
}

export type ClarifyAction={
    type:"clarify",
    question:string
}
export const TOOL_NAMES = ["browser.navigate", "browser.extract", "browser.click", "browser.fill"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export type AgentStatus=| "running" | "complete" | "blocked" | "awaiting_approval" | "step_limit";

export type AgentState = {
    goal: string;
    observations: string[];
    facts: string[];
    completedActions: string[];
    failedActions: string[];
    status: AgentStatus;
    summary?: string;
    question?: string;
};