# Mission:Possible
**Mission control dashboard for multi-agent workflows** — powered by MongoDB Atlas as the durable context engine.

Mission:Possible is a persistence-first workflow manager for multi-agent systems. By leveraging MongoDB Atlas as the system of record, it logs every agent interaction as a discrete event and maintains a recoverable state. If an agent fails or the environment resets, Mission:Possible guarantees the swarm resumes exactly where it left off, turning ephemeral agent actions into durable workflows.

## Features
- **Real-time Event Timeline** — Watch agents collaborate step-by-step
- **Crash Recovery** — Refresh mid-mission and resume exactly where you left off
- **Durable Persistence** — All events and checkpoints stored in MongoDB Atlas
- **Idempotent Event Emission** — Unique index prevents duplicate steps
- **Agent Cards** — Live status for each agent
- **Progress Tracking** — Visual progress bar with checkpoint summaries

## How to Use
1. **Start Demo Mission** — Click the button to begin a ~45 second scripted demo
2. **Watch Events Flow** — See agents collaborate in real-time on the timeline
3. **Test Recovery** — Click "Crash" mid-mission, then refresh. The mission continues!
4. **Reset** — Click "Reset" to clear everything and start fresh

## Architecture Highlights
### Idempotency
- Unique compound index on events { missionId: 1, step: 1 }
- Duplicate key errors are caught and silently ignored
- mission.currentStep only updates if incoming step is greater

### Polling Strategy
- Client polls /api/missions/get every 800ms
- Events merged by step number, always sorted ascending
- Polling stops automatically when mission status is "done"

### Crash Recovery
- missionId stored in localStorage
- On page load, checks localStorage → hydrates from MongoDB
- If mission is "running", resumes demo from currentStep + 1
- Scheduled steps tracked in a Set to prevent double-scheduling

## License
MIT
