import { AgentType, EventType, StepSchedule } from "./types";

// State machine: defines which agent + event type for each step
// This ensures deterministic progression regardless of LLM output
export const stepSchedule: StepSchedule[] = [
  { step: 1, agent: "Planner", type: "PLAN" },
  { step: 2, agent: "Planner", type: "ASSIGN" },
  { step: 3, agent: "Researcher", type: "TOOL_CALL" },
  { step: 4, agent: "Researcher", type: "TOOL_RESULT" },
  { step: 5, agent: "Critic", type: "NOTE" },
  { step: 6, agent: "Planner", type: "CHECKPOINT" },
  { step: 7, agent: "Executor", type: "TOOL_CALL" },
  { step: 8, agent: "Executor", type: "TOOL_RESULT" },
  { step: 9, agent: "Researcher", type: "FAIL" },
  { step: 10, agent: "Executor", type: "RETRY" },
  { step: 11, agent: "Executor", type: "TOOL_RESULT" },
  { step: 12, agent: "Critic", type: "NOTE" },
  { step: 13, agent: "Planner", type: "CHECKPOINT" },
  { step: 14, agent: "Executor", type: "TOOL_CALL" },
  { step: 15, agent: "Executor", type: "TOOL_RESULT" },
  { step: 16, agent: "Critic", type: "NOTE" },
  { step: 17, agent: "Planner", type: "DONE" },
];

export function getScheduleForStep(step: number): StepSchedule | null {
  return stepSchedule.find((s) => s.step === step) || null;
}

export function getAgentAndTypeForStep(
  step: number
): { agent: AgentType; type: EventType } | null {
  const schedule = getScheduleForStep(step);
  if (!schedule) return null;
  return { agent: schedule.agent, type: schedule.type };
}

export function isFinalStep(step: number): boolean {
  const schedule = getScheduleForStep(step);
  return schedule?.type === "DONE";
}

export function getTotalSteps(): number {
  return stepSchedule.length;
}

