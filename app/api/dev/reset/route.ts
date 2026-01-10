import { NextResponse } from "next/server";
import { getMissionsCollection, getEventsCollection } from "@/lib/mongo";

export const runtime = "nodejs";

// Dev-only endpoint to reset all data
export async function POST() {
  try {
    const missions = await getMissionsCollection();
    const events = await getEventsCollection();

    // Delete all documents from both collections
    const missionsResult = await missions.deleteMany({});
    const eventsResult = await events.deleteMany({});

    return NextResponse.json({
      ok: true,
      deleted: {
        missions: missionsResult.deletedCount,
        events: eventsResult.deletedCount,
      },
    });
  } catch (error) {
    console.error("Error resetting data:", error);
    return NextResponse.json(
      { error: "Failed to reset data" },
      { status: 500 }
    );
  }
}

