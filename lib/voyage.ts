import { MissionEvent } from "./types";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/rerank";

export interface RerankResult {
  index: number;
  relevance_score: number;
}

export async function rerankEvents(
  query: string,
  events: MissionEvent[],
  topK: number = 8
): Promise<MissionEvent[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    // No Voyage key, return last N events as fallback
    return events.slice(-topK);
  }

  const model = process.env.VOYAGE_RERANK_MODEL || "rerank-2-lite";

  // Convert events to documents for reranking
  const documents = events.map(
    (e) => `Step ${e.step} [${e.agent}/${e.type}]: ${e.summary}`
  );

  try {
    const response = await fetch(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        query,
        documents,
        top_k: Math.min(topK, documents.length),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("=== VOYAGE API ERROR ===");
      console.error("Status:", response.status);
      console.error("Response:", errorText);
      try {
        const errorJson = JSON.parse(errorText);
        console.error("Error Detail:", errorJson.detail || errorJson.error);
      } catch {
        // Not JSON
      }
      console.error("========================");
      return events.slice(-topK);
    }

    const data = await response.json();
    const results: RerankResult[] = data.data || [];

    // Sort by relevance score and return corresponding events
    const rankedEvents = results
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .map((r) => events[r.index])
      .filter(Boolean);

    return rankedEvents.length > 0 ? rankedEvents : events.slice(-topK);
  } catch (error) {
    console.error("Voyage rerank error:", error);
    return events.slice(-topK);
  }
}

export function isVoyageConfigured(): boolean {
  return !!process.env.VOYAGE_API_KEY;
}

