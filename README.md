# SwarmBoard 🚀

**Mission control dashboard for multi-agent workflows** — powered by MongoDB Atlas as the durable context engine.

![SwarmBoard](https://img.shields.io/badge/Stack-Next.js%20%2B%20MongoDB%20Atlas-success) ![Version](https://img.shields.io/badge/Version-0.1%20MVP-blue)

## Features

- **Real-time Event Timeline** — Watch agents collaborate step-by-step
- **Crash Recovery** — Refresh mid-mission and resume exactly where you left off
- **Durable Persistence** — All events and checkpoints stored in MongoDB Atlas
- **Idempotent Event Emission** — Unique index prevents duplicate steps
- **Agent Cards** — Live status for Planner, Researcher, Executor, and Critic
- **Progress Tracking** — Visual progress bar with checkpoint summaries

## Tech Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Database**: MongoDB Atlas (official Node.js driver, no ODM)
- **Runtime**: Node.js (server-side API routes)

## Prerequisites

- Node.js 18+ installed
- MongoDB Atlas account (free tier works!)

## Setup

### 1. Clone and Install

```bash
cd swarmboard
npm install
```

### 2. Configure MongoDB Atlas

1. Go to [MongoDB Atlas](https://cloud.mongodb.com)
2. Create a free cluster (or use an existing one)
3. Create a database user with read/write access
4. Whitelist your IP address (or use `0.0.0.0/0` for development)
5. Get your connection string from "Connect" → "Connect your application"

### 3. Environment Variables

Create a `.env.local` file in the project root:

```bash
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/swarmboard?retryWrites=true&w=majority
```

Replace `<username>`, `<password>`, and `<cluster>` with your actual values.

### 4. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000/swarmboard](http://localhost:3000/swarmboard) in your browser.

## How to Use

1. **Start Demo Mission** — Click the button to begin a ~45 second scripted demo
2. **Watch Events Flow** — See agents collaborate in real-time on the timeline
3. **Test Recovery** — Click "💥 Crash" mid-mission, then refresh. The mission continues!
4. **Reset** — Click "Reset" to clear everything and start fresh

## Demo Script

The demo simulates an "AI Trends Research" mission with 17 events:

- **PLAN** → Mission initialization
- **ASSIGN** → Task delegation to agents
- **TOOL_CALL** / **TOOL_RESULT** → Simulated API calls
- **CHECKPOINT** (×2) → Durable progress snapshots
- **FAIL** / **RETRY** → Error handling and recovery
- **NOTE** → Agent observations
- **DONE** → Mission completion

## Data Model

### `missions` Collection

```typescript
{
  _id: ObjectId,
  title: string,
  status: "running" | "done" | "failed",
  currentStep: number,
  createdAt: Date,
  updatedAt: Date,
  lastCheckpointAt?: Date,
  artifacts: { latestSummary?: string }
}
```

### `events` Collection (append-only)

```typescript
{
  _id: ObjectId,
  missionId: ObjectId,
  ts: Date,
  step: number,
  agent: "Planner" | "Researcher" | "Executor" | "Critic",
  type: "PLAN" | "ASSIGN" | "TOOL_CALL" | "TOOL_RESULT" | "CHECKPOINT" | "NOTE" | "FAIL" | "RETRY" | "DONE",
  summary: string,
  payload: object
}
```

**Unique Index**: `{ missionId: 1, step: 1 }` ensures idempotent event insertion.

## API Endpoints

| Method | Endpoint              | Description                          |
| ------ | --------------------- | ------------------------------------ |
| POST   | `/api/missions/start` | Create a new mission                 |
| GET    | `/api/missions/get`   | Get mission + events by `missionId`  |
| POST   | `/api/events/emit`    | Emit an event (idempotent)           |
| POST   | `/api/dev/reset`      | Clear all data (dev only)            |

## Architecture Highlights

### Idempotency

- Unique compound index on `events { missionId: 1, step: 1 }`
- Duplicate key errors are caught and silently ignored
- `mission.currentStep` only updates if incoming step is greater

### Polling Strategy

- Client polls `/api/missions/get` every 800ms
- Events merged by step number, always sorted ascending
- Polling stops automatically when mission status is "done"

### Crash Recovery

- `missionId` stored in `localStorage`
- On page load, checks localStorage → hydrates from MongoDB
- If mission is "running", resumes demo from `currentStep + 1`
- Scheduled steps tracked in a `Set` to prevent double-scheduling

## File Structure

```
swarmboard/
├── app/
│   ├── api/
│   │   ├── missions/
│   │   │   ├── start/route.ts
│   │   │   └── get/route.ts
│   │   ├── events/
│   │   │   └── emit/route.ts
│   │   └── dev/
│   │       └── reset/route.ts
│   ├── swarmboard/
│   │   └── page.tsx
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── lib/
│   ├── mongo.ts
│   ├── types.ts
│   └── demoScript.ts
├── tailwind.config.ts
├── package.json
└── README.md
```

## Production Deployment

For Vercel deployment:

1. Add `MONGODB_URI` to your Vercel project's environment variables
2. Deploy with `vercel --prod`

Make sure your MongoDB Atlas cluster allows connections from Vercel's IP ranges (or use `0.0.0.0/0` for simplicity).

## License

MIT

