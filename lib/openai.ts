import { AgentType, EventType, MissionEvent } from "./types";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "o3-mini"; // 150 RPM vs 3 RPM for gpt-4o-mini

export interface LLMGeneratedEvent {
  summary: string;
  payload: Record<string, unknown>;
  artifactUpdate?: {
    latestSummary?: string;
  };
}

export interface GenerateEventParams {
  missionTitle: string;
  step: number;
  agent: AgentType;
  type: EventType;
  contextEvents: MissionEvent[];
}

export async function generateEventWithOpenAI(
  params: GenerateEventParams
): Promise<LLMGeneratedEvent | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log("No OPENAI_API_KEY configured");
    return null;
  }

  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  // Build context from recent events
  const contextSummary = params.contextEvents
    .slice(-8)
    .map((e) => `Step ${e.step} [${e.agent}/${e.type}]: ${e.summary}`)
    .join("\n");

  const systemPrompt = `You are a multi-agent workflow simulator. Generate realistic event data for agent workflows.
Output STRICT JSON ONLY. No markdown, no code blocks, no explanation.
Keep summaries under 160 characters. Keep payload small (<500 bytes).`;

  const userPrompt = `Mission: "${params.missionTitle}"

Recent events:
${contextSummary || "(No previous events)"}

Generate the next event for:
- Step: ${params.step}
- Agent: ${params.agent}
- Event Type: ${params.type}

${getEventTypeGuidance(params.type)}

Output JSON format:
{
  "summary": "Brief description of what happened (max 160 chars)",
  "payload": { relevant data as key-value pairs }${params.type === "CHECKPOINT" ? ',\n  "artifactUpdate": { "latestSummary": "checkpoint summary" }' : ""}
}`;

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 200,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("=== OPENAI API ERROR ===");
      console.error("Status:", response.status);
      console.error("Model:", model);
      console.error("Response:", errorText);
      
      // Handle rate limiting with retry
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 20000;
        console.error(`Rate limited. Retry-After: ${retryAfter || "not set"}. Waiting ${waitTime}ms...`);
        
        // Wait and retry once
        await new Promise(resolve => setTimeout(resolve, waitTime + Math.random() * 3000));
        console.log("Retrying OpenAI request after rate limit...");
        
        const retryResponse = await fetch(OPENAI_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            max_tokens: 200,
            temperature: 0.7,
          }),
        });
        
        if (retryResponse.ok) {
          const retryData = await retryResponse.json();
          const retryContent = retryData.choices?.[0]?.message?.content;
          if (retryContent) {
            let jsonStr = retryContent.trim();
            if (jsonStr.startsWith("```")) {
              jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
            }
            const parsed = JSON.parse(jsonStr);
            if (parsed.summary && typeof parsed.summary === "string") {
              console.log("Retry successful!");
              return {
                summary: parsed.summary.slice(0, 160),
                payload: parsed.payload || {},
                artifactUpdate: parsed.artifactUpdate,
              };
            }
          }
        }
        console.error("Retry also failed, falling back to scripted event");
      }
      
      try {
        const errorJson = JSON.parse(errorText);
        console.error("Error Type:", errorJson.error?.type);
        console.error("Error Message:", errorJson.error?.message);
      } catch {
        // Not JSON
      }
      console.error("========================");
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error("No content in OpenAI response");
      return null;
    }

    // Parse JSON from response (handle potential markdown wrapping)
    let jsonStr = content.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    }

    const parsed = JSON.parse(jsonStr);

    // Validate required fields
    if (!parsed.summary || typeof parsed.summary !== "string") {
      console.error("Invalid summary in OpenAI response");
      return null;
    }

    // Truncate summary if needed
    const summary = parsed.summary.slice(0, 160);

    return {
      summary,
      payload: parsed.payload || {},
      artifactUpdate: parsed.artifactUpdate,
    };
  } catch (error) {
    console.error("OpenAI generation error:", error);
    return null;
  }
}

function getEventTypeGuidance(type: EventType): string {
  switch (type) {
    case "PLAN":
      return "This is a planning event. Describe the mission initialization or planning decision.";
    case "ASSIGN":
      return "This is a task assignment. Describe what task is being delegated and to whom.";
    case "TOOL_CALL":
      return "This is a tool invocation. Describe which tool/API is being called and with what parameters.";
    case "TOOL_RESULT":
      return "This is a tool result. Describe what data was returned from the tool.";
    case "CHECKPOINT":
      return "This is a checkpoint. Summarize progress so far. Include artifactUpdate with latestSummary.";
    case "NOTE":
      return "This is an observation or note. Describe an insight or status update.";
    case "FAIL":
      return "This is a failure event. Describe what went wrong (timeout, error, etc).";
    case "RETRY":
      return "This is a retry attempt. Describe the retry strategy being used.";
    case "DONE":
      return "This is the completion event. Summarize the mission outcome.";
    default:
      return "";
  }
}

export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

