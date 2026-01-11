import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getMissionsCollection, getEventsCollection } from "@/lib/mongo";
import { TickBody, TickResponse, MissionEvent, Mission } from "@/lib/types";
import { getAgentAndTypeForStep, isFinalStep, getTotalSteps } from "@/lib/stepSchedule";
import { generateEventWithOpenAI } from "@/lib/openai";
import { rerankEvents } from "@/lib/voyage";
import { demoScript } from "@/lib/demoScript";

export const runtime = "nodejs";

const CONTEXT_EVENTS_LIMIT = 40;
const RERANK_TOP_K = 8;

export async function POST(request: NextRequest) {
  try {
    const body: TickBody = await request.json();
    const { missionId } = body;

    if (!missionId) {
      return NextResponse.json({ error: "Missing missionId" }, { status: 400 });
    }

    if (!ObjectId.isValid(missionId)) {
      return NextResponse.json({ error: "Invalid missionId format" }, { status: 400 });
    }

    const missionObjectId = new ObjectId(missionId);
    const missions = await getMissionsCollection();
    const events = await getEventsCollection();

    // Load mission
    const mission = await missions.findOne({ _id: missionObjectId }) as Mission | null;
    if (!mission) {
      return NextResponse.json({ error: "Mission not found" }, { status: 404 });
    }

    // If mission is not running, return no-op
    if (mission.status !== "running") {
      return NextResponse.json<TickResponse>({
        ok: true,
        status: mission.status,
      });
    }

    const nextStep = mission.currentStep + 1;

    // Check if we're past the total steps
    if (nextStep > getTotalSteps()) {
      return NextResponse.json<TickResponse>({
        ok: true,
        status: "done",
      });
    }

    // Get agent and type from state machine
    const schedule = getAgentAndTypeForStep(nextStep);
    if (!schedule) {
      // Should not happen, but fallback
      return NextResponse.json<TickResponse>({
        ok: true,
        status: mission.status,
      });
    }

    const { agent, type } = schedule;
    const now = new Date();

    // Check if event already exists for this step (idempotency)
    const existingEvent = await events.findOne({
      missionId: missionObjectId,
      step: nextStep,
    });

    if (existingEvent) {
      // Already processed, return existing
      return NextResponse.json<TickResponse>({
        ok: true,
        step: nextStep,
        used: existingEvent.source === "openai" ? "openai" : "fallback",
        event: existingEvent as MissionEvent,
      });
    }

    // Try to generate with OpenAI
    let summary: string;
    let payload: Record<string, unknown>;
    let artifactUpdate: { latestSummary?: string } | undefined;
    let usedSource: "openai" | "fallback" = "fallback";

    // Fetch context events for LLM
    const contextEvents = await events
      .find({ missionId: missionObjectId })
      .sort({ step: -1 })
      .limit(CONTEXT_EVENTS_LIMIT)
      .toArray() as MissionEvent[];

    // Reverse to chronological order
    contextEvents.reverse();

    // Optional: Rerank with Voyage
    let rankedEvents = contextEvents;
    if (contextEvents.length > 0) {
      const query = `${mission.title} | next step: ${agent} ${type}`;
      rankedEvents = await rerankEvents(query, contextEvents, RERANK_TOP_K);
    }

    // Try OpenAI generation
    const llmResult = await generateEventWithOpenAI({
      missionTitle: mission.title,
      step: nextStep,
      agent,
      type,
      contextEvents: rankedEvents,
    });

    if (llmResult) {
      summary = llmResult.summary;
      payload = llmResult.payload;
      artifactUpdate = llmResult.artifactUpdate;
      usedSource = "openai";
    } else {
      // Fallback to scripted event
      const scriptedEvent = demoScript.find((e) => e.step === nextStep);
      if (scriptedEvent) {
        summary = scriptedEvent.summary;
        payload = scriptedEvent.payload;
      } else {
        // Generic fallback if no scripted event exists
        summary = `${agent} completed ${type} for step ${nextStep}`;
        payload = { step: nextStep, agent, type };
      }
      usedSource = "fallback";
    }

    // Insert the event
    const eventDoc = {
      _id: new ObjectId(),
      missionId: missionObjectId,
      ts: now,
      step: nextStep,
      agent,
      type,
      summary,
      payload,
      source: usedSource,
    };

    try {
      await events.insertOne(eventDoc);
    } catch (insertError: unknown) {
      // Handle duplicate key error (concurrent requests)
      if (
        insertError &&
        typeof insertError === "object" &&
        "code" in insertError &&
        insertError.code === 11000
      ) {
        // Return existing event
        const existing = await events.findOne({
          missionId: missionObjectId,
          step: nextStep,
        });
        return NextResponse.json<TickResponse>({
          ok: true,
          step: nextStep,
          used: "fallback",
          event: existing as MissionEvent,
        });
      }
      throw insertError;
    }

    // Update mission
    const updateFields: Record<string, unknown> = {
      updatedAt: now,
      currentStep: nextStep,
    };

    // Handle CHECKPOINT
    if (type === "CHECKPOINT") {
      updateFields.lastCheckpointAt = now;
      if (artifactUpdate?.latestSummary) {
        updateFields["artifacts.latestSummary"] = artifactUpdate.latestSummary;
      } else {
        updateFields["artifacts.latestSummary"] = summary;
      }
    }

    // Handle DONE
    if (type === "DONE" || isFinalStep(nextStep)) {
      updateFields.status = "done";
    }

    await missions.updateOne(
      { _id: missionObjectId },
      { $set: updateFields }
    );

    // Log stats for debugging (remove later)
    console.log(`[TICK] Step ${nextStep}/${getTotalSteps()} | Agent: ${agent} | Type: ${type} | Source: ${usedSource}`);

    return NextResponse.json<TickResponse>({
      ok: true,
      step: nextStep,
      used: usedSource,
      event: eventDoc as MissionEvent,
    });
  } catch (error) {
    console.error("Error in tick:", error);
    return NextResponse.json(
      { error: "Failed to advance mission" },
      { status: 500 }
    );
  }
}

