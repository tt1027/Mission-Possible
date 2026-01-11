import { ObjectId } from "mongodb";

export type MissionStatus = "running" | "done" | "failed";

export type AgentType = "Planner" | "Researcher" | "Executor" | "Critic";

export type EventType =
  | "PLAN"
  | "ASSIGN"
  | "TOOL_CALL"
  | "TOOL_RESULT"
  | "CHECKPOINT"
  | "NOTE"
  | "FAIL"
  | "RETRY"
  | "DONE";

export type RunMode = "scripted" | "real";

export interface Mission {
  _id: ObjectId;
  title: string;
  status: MissionStatus;
  currentStep: number;
  createdAt: Date;
  updatedAt: Date;
  lastCheckpointAt?: Date;
  artifacts: {
    latestSummary?: string;
  };
  // Fork/branch fields
  branchFromMissionId?: ObjectId;
  branchFromStep?: number;
  // Run mode fields
  runMode: RunMode;
  llmProvider?: "openai";
  llmModel?: string;
}

export interface MissionEvent {
  _id: ObjectId;
  missionId: ObjectId;
  ts: Date;
  step: number;
  agent: AgentType;
  type: EventType;
  summary: string;
  payload: Record<string, unknown>;
  source?: "scripted" | "openai" | "fallback";
}

// API response types
export interface MissionWithEvents {
  mission: Mission;
  events: MissionEvent[];
}

export interface StartMissionResponse {
  missionId: string;
}

export interface StartMissionBody {
  title?: string;
  runMode?: RunMode;
}

export interface EmitEventBody {
  missionId: string;
  step: number;
  agent: AgentType;
  type: EventType;
  summary: string;
  payload?: Record<string, unknown>;
  source?: "scripted" | "openai" | "fallback";
}

export interface ForkMissionBody {
  parentMissionId: string;
  forkStep: number;
}

export interface ForkMissionResponse {
  missionId: string;
}

export interface TickBody {
  missionId: string;
}

export interface TickResponse {
  ok: boolean;
  step?: number;
  used?: "openai" | "fallback";
  event?: MissionEvent;
  status?: MissionStatus;
  error?: string;
}

// Step schedule for state machine
export interface StepSchedule {
  step: number;
  agent: AgentType;
  type: EventType;
}
