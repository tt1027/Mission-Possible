import { NextResponse } from "next/server";
import { getMissionsCollection } from "@/lib/mongo";

export const runtime = "nodejs";

export async function GET() {
  try {
    const missions = await getMissionsCollection();

    // Get all missions, sorted by createdAt descending (newest first)
    const allMissions = await missions
      .find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    return NextResponse.json({ missions: allMissions });
  } catch (error) {
    console.error("Error listing missions:", error);
    return NextResponse.json(
      { error: "Failed to list missions" },
      { status: 500 }
    );
  }
}

