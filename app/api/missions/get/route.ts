import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getMissionsCollection, getEventsCollection } from "@/lib/mongo";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const missionId = searchParams.get("missionId");

    if (!missionId) {
      return NextResponse.json(
        { error: "missionId is required" },
        { status: 400 }
      );
    }

    // Validate ObjectId format
    if (!ObjectId.isValid(missionId)) {
      return NextResponse.json(
        { error: "Invalid missionId format" },
        { status: 400 }
      );
    }

    const missions = await getMissionsCollection();
    const events = await getEventsCollection();

    const objectId = new ObjectId(missionId);

    // Get the mission
    const mission = await missions.findOne({ _id: objectId });

    if (!mission) {
      return NextResponse.json(
        { error: "Mission not found" },
        { status: 404 }
      );
    }

    // Get events for this mission (last 200, sorted by step ascending)
    const missionEvents = await events
      .find({ missionId: objectId })
      .sort({ step: 1 })
      .limit(200)
      .toArray();

    return NextResponse.json({
      mission,
      events: missionEvents,
    });
  } catch (error) {
    console.error("Error getting mission:", error);
    return NextResponse.json(
      { error: "Failed to get mission" },
      { status: 500 }
    );
  }
}

