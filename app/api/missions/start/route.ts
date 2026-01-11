import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getMissionsCollection, getEventsCollection, ensureIndexes } from "@/lib/mongo";
import { StartMissionBody, RunMode } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    // Parse request body (optional)
    let body: StartMissionBody = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is fine, use defaults
    }

    const runMode: RunMode = body.runMode === "real" ? "real" : "scripted";
    const title = body.title || "AI Trends Research Mission";

    // Ensure indexes exist for idempotency
    await ensureIndexes();

    const missions = await getMissionsCollection();
    const events = await getEventsCollection();

    const now = new Date();
    const missionId = new ObjectId();

    // Create the mission with runMode
    const missionDoc: Record<string, unknown> = {
      _id: missionId,
      title,
      status: "running",
      currentStep: 1,
      createdAt: now,
      updatedAt: now,
      artifacts: {},
      runMode,
    };

    // Add LLM fields if real mode
    if (runMode === "real") {
      missionDoc.llmProvider = "openai";
      missionDoc.llmModel = process.env.OPENAI_MODEL || "o3-mini";
    }

    await missions.insertOne(missionDoc);

    // Insert initial PLAN event (step 1)
    await events.insertOne({
      _id: new ObjectId(),
      missionId: missionId,
      ts: now,
      step: 1,
      agent: "Planner",
      type: "PLAN",
      summary: "Mission initialized: Research and summarize latest AI trends",
      payload: { objective: "AI Trends Research", estimatedSteps: 17 },
      source: "scripted",
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
