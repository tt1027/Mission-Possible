# Mission:Possible — Project Summary

**A real-time multi-agent mission control dashboard demonstrating durable AI orchestration with MongoDB Atlas and Voyage AI.**

---

## What Is This?

Mission:Possible is a demonstration of how to build **crash-resilient, observable multi-agent AI workflows**. It simulates four specialized AI agents (Planner, Researcher, Executor, Critic) collaborating on a research mission, with every event persisted to MongoDB Atlas for complete durability and auditability.

The project showcases two run modes:
- **Demo Mode**: Pre-scripted events for instant demonstration
- **BYOK Mode**: Bring Your Own Key — GPT generates dynamic, context-aware events in real-time

---

## Why MongoDB Atlas?

MongoDB Atlas serves as the **durable context engine** — the critical backbone that makes this architecture production-ready.

### 1. Crash Recovery & Resilience

The killer feature: **crash the app mid-mission, refresh the page, and resume exactly where you left off.**

```typescript
// On page load, hydrate from MongoDB
const stored = localStorage.getItem("swarmboard:missionId");
if (stored) {
  const data = await fetchMission(stored);
  if (data.mission.status === "running") {
    // Resume from currentStep
    scheduleDemoEvents(stored, data.mission.currentStep);
  }
}
```

State isn't stored in memory or localStorage — it lives in MongoDB. The browser only stores the mission ID; everything else is fetched from the database on recovery.

### 2. Event Sourcing Architecture

All agent activity is stored as an **append-only event log**:

```typescript
// events collection
{
  _id: ObjectId,
  missionId: ObjectId,
  ts: Date,
  step: number,
  agent: "Planner" | "Researcher" | "Executor" | "Critic",
  type: "PLAN" | "ASSIGN" | "TOOL_CALL" | "CHECKPOINT" | "DONE" | ...,
  summary: string,
  payload: object,
  source: "scripted" | "openai" | "fallback"
}
```

This enables:
- **Complete audit trail** of every agent action
- **Time-travel debugging** via replay functionality
- **Branch exploration** via mission forking

### 3. Idempotent Event Emission

A unique compound index ensures no duplicate events, even under concurrent requests:

```typescript
// Unique index on events collection
{ missionId: 1, step: 1 }  // unique: true

// Duplicate key errors (E11000) are caught and silently ignored
// This makes event emission idempotent and safe for retries
```

### 4. Mission State Management

The `missions` collection tracks high-level state:

```typescript
{
  _id: ObjectId,
  title: string,
  status: "running" | "done" | "failed",
  currentStep: number,
  runMode: "scripted" | "real",
  lastCheckpointAt?: Date,
  artifacts: { latestSummary?: string },
  branchFromMissionId?: ObjectId,  // For forks
  branchFromStep?: number
}
```

### 5. Fork & Branch Workflows

MongoDB enables **mission forking** — create a new mission that branches from any checkpoint:

```typescript
// POST /api/missions/fork
// Copies all events up to forkStep, creates new mission with status "running"
const forkedEvents = parentEvents.map((event) => ({
  _id: new ObjectId(),
  missionId: newMissionId,  // New mission
  ...event  // Same step, agent, type, summary, payload
}));
await events.insertMany(forkedEvents);
```

This enables exploring "what if" scenarios without losing the original timeline.

---

## Why Voyage AI?

Voyage AI provides **intelligent context reranking** — ensuring the LLM receives the most relevant historical events, not just the most recent ones.

### The Problem: Context Window Management

When generating the next event, we need to provide context about what happened before. But:
- The context window is limited
- Recent events aren't always the most relevant
- Blindly truncating loses important information

### The Solution: Semantic Reranking

Voyage AI's `rerank-2-lite` model scores historical events by relevance to the current task:

```typescript
// lib/voyage.ts
export async function rerankEvents(
  query: string,
  events: MissionEvent[],
  topK: number = 8
): Promise<MissionEvent[]> {
  // Convert events to documents
  const documents = events.map(
    (e) => `Step ${e.step} [${e.agent}/${e.type}]: ${e.summary}`
  );

  // Call Voyage rerank API
  const response = await fetch("https://api.voyageai.com/v1/rerank", {
    body: JSON.stringify({
      model: "rerank-2-lite",
      query,  // e.g., "AI Trends Research | next step: Executor TOOL_CALL"
      documents,
      top_k: topK,
    }),
  });

  // Return events sorted by relevance_score
  return results
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .map((r) => events[r.index]);
}
```

### How It's Used

In the `/api/agents/tick` endpoint:

```typescript
// Fetch last 40 events from MongoDB
const contextEvents = await events
  .find({ missionId })
  .sort({ step: -1 })
  .limit(40)
  .toArray();

// Rerank to find the 8 most relevant
const query = `${mission.title} | next step: ${agent} ${type}`;
const rankedEvents = await rerankEvents(query, contextEvents, 8);

// Pass ranked context to OpenAI
const llmResult = await generateEventWithOpenAI({
  contextEvents: rankedEvents,
  // ...
});
```

### Benefits

1. **Better LLM Output**: GPT sees the most relevant context, not arbitrary truncation
2. **Cost Efficiency**: Send fewer tokens while maintaining quality
3. **Graceful Degradation**: If Voyage is unavailable, falls back to recency-based selection

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser Client                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Live View   │  │ Replay Mode │  │ Mission History/Fork    │ │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘ │
└─────────┼────────────────┼──────────────────────┼───────────────┘
          │                │                      │
          ▼                ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Next.js API Routes                         │
│  ┌─────────────┐  ┌─────────────┐  ┌───────────────────────┐   │
│  │ /missions/* │  │ /events/*   │  │ /agents/tick          │   │
│  │ start, get  │  │ emit        │  │ (BYOK mode)           │   │
│  │ list, fork  │  │             │  │                       │   │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬───────────┘   │
└─────────┼────────────────┼──────────────────────┼───────────────┘
          │                │                      │
          ▼                ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                        MongoDB Atlas                            │
│         (Durable Context Engine — All State Lives Here)         │
│  ┌─────────────────────┐  ┌─────────────────────────────────┐  │
│  │ missions collection │  │ events collection               │  │
│  │ - status, step      │  │ - append-only log               │  │
│  │ - artifacts         │  │ - unique index (missionId,step) │  │
│  │ - fork metadata     │  │ - source tracking               │  │
│  └─────────────────────┘  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
          │
          │ (BYOK Mode Only)
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      External AI Services                       │
│  ┌─────────────────────┐  ┌─────────────────────────────────┐  │
│  │ Voyage AI           │  │ OpenAI                          │  │
│  │ - Rerank context    │  │ - Generate event summaries      │  │
│  │ - Find relevant     │  │ - Dynamic payloads              │  │
│  │   historical events │  │ - Context-aware responses       │  │
│  └─────────────────────┘  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Features

| Feature | MongoDB Atlas Role | Voyage AI Role |
|---------|-------------------|----------------|
| **Crash Recovery** | Stores all state; browser only needs mission ID | — |
| **Event Timeline** | Append-only event log with timestamps | — |
| **Idempotency** | Unique compound index prevents duplicates | — |
| **Checkpoints** | Stores `lastCheckpointAt` and `latestSummary` | — |
| **Mission Forking** | Copies events to new mission document | — |
| **Mission History** | Query all missions, sorted by date | — |
| **Context Selection** | Provides historical events | Ranks by semantic relevance |
| **LLM Generation** | Stores generated events with source tracking | Filters context for OpenAI |

---

## Run Modes

### Demo Mode (Default)
- Pre-scripted events from `demoScript.ts`
- No API keys required
- ~45 second mission with 17 events
- Perfect for demonstrating crash recovery

### BYOK Mode (Bring Your Own Key)
- GPT-4o-mini generates event content dynamically
- Voyage AI reranks historical context
- Events marked with `source: "openai"`
- Falls back to scripted events if LLM fails

---

## Environment Variables

```bash
# Required
MONGODB_URI=mongodb+srv://...

# Optional (enables BYOK mode)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini  # default

# Optional (enables intelligent reranking)
VOYAGE_API_KEY=pa-...
VOYAGE_RERANK_MODEL=rerank-2-lite  # default
```

---

## Why This Matters

This architecture demonstrates patterns essential for **production AI agent systems**:

1. **Durability**: Agent state survives crashes, deployments, and restarts
2. **Observability**: Every action is logged and queryable
3. **Auditability**: Complete history with source attribution
4. **Recoverability**: Resume from any checkpoint
5. **Explorability**: Fork and replay to understand behavior
6. **Efficiency**: Intelligent context selection reduces costs

MongoDB Atlas isn't just a database here — it's the **source of truth** that makes multi-agent orchestration reliable. Voyage AI ensures that when we do call an LLM, we give it the best possible context.

---

## Quick Start

```bash
# Install dependencies
npm install

# Set environment variables
cp .env.example .env.local
# Add your MONGODB_URI (required)
# Add OPENAI_API_KEY and VOYAGE_API_KEY (optional, enables BYOK)

# Run development server
npm run dev

# Open http://localhost:3000/swarmboard
```

---

*Built with Next.js 14, MongoDB Atlas, Voyage AI, and OpenAI.*

