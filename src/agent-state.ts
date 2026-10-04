import { AgentState } from "./types.js";

export function createAgentState(goal: string): AgentState {
    return {
      goal,
      observations: [],
      facts: [],
      completedActions: [],
      failedActions: [],
      status: "running",
    };
}