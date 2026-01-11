import { NextResponse } from "next/server";
import { isOpenAIConfigured } from "@/lib/openai";
import { isVoyageConfigured } from "@/lib/voyage";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    openaiConfigured: isOpenAIConfigured(),
    voyageConfigured: isVoyageConfigured(),
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  });
}

