import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getMissionsCollection, getEventsCollection } from "@/lib/mongo";

export const runtime = "nodejs";

interface ForkBody {
  parentMissionId: string;
  forkStep: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: ForkBody = await request.json();

    // Validate input
    if (!body.parentMissionId || typeof body.forkStep !== "number") {
      return NextResponse.json(
        { error: "Missing required fields: parentMissionId, forkStep" },
        { status: 400 }
      );
    }

    if (!ObjectId.isValid(body.parentMissionId)) {
      return NextResponse.json(
        { error: "Invalid parentMissionId format" },
        { status: 400 }
      );
    }

    if (body.forkStep < 1 || !Number.isInteger(body.forkStep)) {
      return NextResponse.json(
        { error: "forkStep must be an integer >= 1" },
        { status: 400 }
      );
    }

    const missions = await getMissionsCollection();
    const events = await getEventsCollection();

    const parentObjectId = new ObjectId(body.parentMissionId);

    // Load parent mission
    const parentMission = await missions.findOne({ _id: parentObjectId });
    if (!parentMission) {
      return NextResponse.json(
        { error: "Parent mission not found" },
        { status: 404 }
      );
    }

    // Load parent events up to forkStep (inclusive)
    const parentEvents = await events
      .find({ 
        missionId: parentObjectId, 
        step: { $lte: body.forkStep } 
      })
      .sort({ step: 1 })
      .toArray();

    // If no events found or forkStep is beyond available events, clamp
    if (parentEvents.length === 0) {
      return NextResponse.json(
        { error: "No events found at or before the specified forkStep" },
        { status: 400 }
      );
    }

    // Get actual max step from copied events
    const actualForkStep = parentEvents[parentEvents.length - 1].step;

    const now = new Date();
    const newMissionId = new ObjectId();

    // Find last checkpoint in copied events for artifacts
    const lastCheckpoint = [...parentEvents]
      .reverse()
      .find((e) => e.type === "CHECKPOINT");

    // Create new mission document
    const newMission = {
      _id: newMissionId,
      title: `${parentMission.title} (fork)`,
      status: "running" as const,
      currentStep: actualForkStep,
      createdAt: now,
      updatedAt: now,
      lastCheckpointAt: lastCheckpoint ? lastCheckpoint.ts : undefined,
      artifacts: {
        latestSummary: lastCheckpoint?.summary || parentMission.artifacts?.latestSummary,
      },
      branchFromMissionId: parentObjectId,
      branchFromStep: actualForkStep,
    };

    await missions.insertOne(newMission);

    // Copy events to new mission
    if (parentEvents.length > 0) {
      const forkedEvents = parentEvents.map((event) => ({
        _id: new ObjectId(),
        missionId: newMissionId,
        ts: event.ts,
        step: event.step,
        agent: event.agent,
        type: event.type,
        summary: event.summary,
        payload: event.payload,
      }));

      await events.insertMany(forkedEvents);
    }

    return NextResponse.json({ missionId: newMissionId.toString() });
  } catch (error) {
    console.error("Error forking mission:", error);
    return NextResponse.json(
      { error: "Failed to fork mission" },
      { status: 500 }
    );
  }
}

