import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getMissionsCollection, getEventsCollection, ensureIndexes } from "@/lib/mongo";
import { AgentType, EventType } from "@/lib/types";

export const runtime = "nodejs";

interface EmitEventBody {
  missionId: string;
  step: number;
  agent: AgentType;
  type: EventType;
  summary: string;
  payload?: Record<string, unknown>;
}

const validAgents: AgentType[] = ["Planner", "Researcher", "Executor", "Critic"];
const validTypes: EventType[] = [
  "PLAN",
  "ASSIGN",
  "TOOL_CALL",
  "TOOL_RESULT",
  "CHECKPOINT",
  "NOTE",
  "FAIL",
  "RETRY",
  "DONE",
];

export async function POST(request: NextRequest) {
  try {
    const body: EmitEventBody = await request.json();

    // Validate required fields
    if (!body.missionId || !body.step || !body.agent || !body.type || !body.summary) {
      return NextResponse.json(
        { error: "Missing required fields: missionId, step, agent, type, summary" },
        { status: 400 }
      );
    }

    // Validate ObjectId
    if (!ObjectId.isValid(body.missionId)) {
      return NextResponse.json(
        { error: "Invalid missionId format" },
        { status: 400 }
      );
    }

    // Validate agent and type
    if (!validAgents.includes(body.agent)) {
      return NextResponse.json(
        { error: `Invalid agent. Must be one of: ${validAgents.join(", ")}` },
        { status: 400 }
      );
    }

    if (!validTypes.includes(body.type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Ensure indexes exist
    await ensureIndexes();

    const missions = await getMissionsCollection();
    const events = await getEventsCollection();

    const missionObjectId = new ObjectId(body.missionId);

    // Check if mission exists
    const mission = await missions.findOne({ _id: missionObjectId });
    if (!mission) {
      return NextResponse.json(
        { error: "Mission not found" },
        { status: 404 }
      );
    }

    const now = new Date();

    // Try to insert the event (idempotent via unique index)
    try {
      await events.insertOne({
        _id: new ObjectId(),
        missionId: missionObjectId,
        ts: now,
        step: body.step,
        agent: body.agent,
        type: body.type,
        summary: body.summary,
        payload: body.payload || {},
      });
    } catch (insertError: unknown) {
      // Check if it's a duplicate key error (E11000)
      if (
        insertError &&
        typeof insertError === "object" &&
        "code" in insertError &&
        insertError.code === 11000
      ) {
        // Duplicate step for this mission - this is expected for idempotency
        console.log(`Duplicate event ignored: mission=${body.missionId}, step=${body.step}`);
        return NextResponse.json({ ok: true, duplicate: true });
      }
      throw insertError;
    }

    // Update mission: currentStep = max(currentStep, step)
    const updateFields: Record<string, unknown> = {
      updatedAt: now,
    };

    // Only update currentStep if incoming step is greater
    if (body.step > mission.currentStep) {
      updateFields.currentStep = body.step;
    }

    // Handle CHECKPOINT events
    if (body.type === "CHECKPOINT") {
      updateFields.lastCheckpointAt = now;
      updateFields["artifacts.latestSummary"] = body.summary;
    }

    // Handle DONE events
    if (body.type === "DONE") {
      updateFields.status = "done";
    }

    // Handle FAIL events (optionally mark as failed)
    // Note: We don't set status to failed immediately as there may be retries

    await missions.updateOne(
      { _id: missionObjectId },
      { $set: updateFields }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error emitting event:", error);
    return NextResponse.json(
      { error: "Failed to emit event" },
      { status: 500 }
    );
  }
}

