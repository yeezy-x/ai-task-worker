export type Status = "running" | "needs_approval" | "completed" | "failed" | "step_limit";

export type ToolName = "browser.navigate" | "browser.read" | "browser.click" | "browser.fill" | "browser.select";

export type ToolCall = {
  type: "tool";
  tool: ToolName;
  input: Record<string, string>;
  reasoning: string;
  facts?: string[];
};

export type Completion = {
  type: "complete";
  summary: string;
  evidence: string[];
  facts?: string[];
};

export type ApprovalRequest = { type: "approval"; reason: string; facts?: string[] };
export type AgentDecision = ToolCall | Completion | ApprovalRequest;

export type Observation = {
  at: string;
  action: string;
  ok: boolean;
  summary: string;
  detail: Record<string, unknown>;
};

export type AgentState = {
  id: string;
  goal: string;
  status: Status;
  observations: Observation[];
  facts: string[];
  completedActions: Observation[];
  failedActions: Observation[];
  startedAt: string;
  finishedAt?: string;
  finalSummary?: string;
  evidence: string[];
  lastMutationAt?: number;
  verificationAt?: number;
};
