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
}

// API response types
export interface MissionWithEvents {
  mission: Mission;
  events: MissionEvent[];
}

export interface StartMissionResponse {
  missionId: string;
}

export interface EmitEventBody {
  missionId: string;
  step: number;
  agent: AgentType;
  type: EventType;
  summary: string;
  payload?: Record<string, unknown>;
}

