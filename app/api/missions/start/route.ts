import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getMissionsCollection, getEventsCollection, ensureIndexes } from "@/lib/mongo";

export const runtime = "nodejs";

export async function POST() {
  try {
    // Ensure indexes exist for idempotency
    await ensureIndexes();

    const missions = await getMissionsCollection();
    const events = await getEventsCollection();

    const now = new Date();
    const missionId = new ObjectId();

    // Create the mission
    await missions.insertOne({
      _id: missionId,
      title: "AI Trends Research Mission",
      status: "running",
      currentStep: 1,
      createdAt: now,
      updatedAt: now,
      artifacts: {},
    });

    // Insert initial PLAN event (step 1)
    await events.insertOne({
      _id: new ObjectId(),
      missionId: missionId,
      ts: now,
      step: 1,
      agent: "Planner",
      type: "PLAN",
      summary: "Mission initialized: Research and summarize latest AI trends",
      payload: { objective: "AI Trends Research", estimatedSteps: 16 },
    });

    return NextResponse.json({ missionId: missionId.toString() });
  } catch (error) {
    console.error("Error starting mission:", error);
    return NextResponse.json(
      { error: "Failed to start mission" },
      { status: 500 }
    );
  }
}

