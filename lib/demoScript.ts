import { AgentType, EventType } from "./types";

export interface DemoEvent {
  step: number;
  agent: AgentType;
  type: EventType;
  summary: string;
  payload: Record<string, unknown>;
  delayMs: number; // Delay before emitting this event
}

// ~45 seconds of demo events with checkpoints, fail/retry, and done
export const demoScript: DemoEvent[] = [
  {
    step: 1,
    agent: "Planner",
    type: "PLAN",
    summary: "Mission initialized: Research and summarize latest AI trends",
    payload: { objective: "AI Trends Research", estimatedSteps: 16 },
    delayMs: 0,
  },
  {
    step: 2,
    agent: "Planner",
    type: "ASSIGN",
    summary: "Assigned Researcher to gather data from academic sources",
    payload: { assignee: "Researcher", task: "academic_search" },
    delayMs: 2500,
  },
  {
    step: 3,
    agent: "Researcher",
    type: "TOOL_CALL",
    summary: "Querying ArXiv API for recent transformer papers",
    payload: { tool: "arxiv_search", query: "transformers 2024" },
    delayMs: 2000,
  },
  {
    step: 4,
    agent: "Researcher",
    type: "TOOL_RESULT",
    summary: "Found 47 relevant papers on attention mechanisms",
    payload: { resultCount: 47, topPapers: ["Attention Is Still All You Need", "Mamba: Linear-Time Sequence Modeling"] },
    delayMs: 3000,
  },
  {
    step: 5,
    agent: "Researcher",
    type: "NOTE",
    summary: "Key trend identified: State-space models challenging transformers",
    payload: { insight: "SSM architectures gaining traction" },
    delayMs: 2000,
  },
  {
    step: 6,
    agent: "Planner",
    type: "CHECKPOINT",
    summary: "Checkpoint: Research phase 1 complete. 47 papers collected, SSM trend identified.",
    payload: { phase: 1, papersCollected: 47 },
    delayMs: 2500,
  },
  {
    step: 7,
    agent: "Executor",
    type: "TOOL_CALL",
    summary: "Summarizing top 10 papers using extraction pipeline",
    payload: { tool: "summarizer", inputCount: 10 },
    delayMs: 3000,
  },
  {
    step: 8,
    agent: "Executor",
    type: "TOOL_RESULT",
    summary: "Generated summaries for all 10 papers",
    payload: { summariesGenerated: 10, avgLength: 250 },
    delayMs: 2500,
  },
  {
    step: 9,
    agent: "Executor",
    type: "FAIL",
    summary: "Failed to connect to external citation service (timeout)",
    payload: { error: "ETIMEDOUT", service: "citation_api" },
    delayMs: 3000,
  },
  {
    step: 10,
    agent: "Executor",
    type: "RETRY",
    summary: "Retrying citation lookup with fallback service",
    payload: { attempt: 2, fallback: "semantic_scholar" },
    delayMs: 2000,
  },
  {
    step: 11,
    agent: "Executor",
    type: "TOOL_RESULT",
    summary: "Successfully retrieved citations via Semantic Scholar",
    payload: { citations: 156, successfulRetry: true },
    delayMs: 2500,
  },
  {
    step: 12,
    agent: "Critic",
    type: "NOTE",
    summary: "Reviewing summary quality: 8/10 papers meet standards",
    payload: { approved: 8, needsRevision: 2 },
    delayMs: 2500,
  },
  {
    step: 13,
    agent: "Planner",
    type: "CHECKPOINT",
    summary: "Checkpoint: Analysis complete. 8 quality summaries, 156 citations mapped.",
    payload: { phase: 2, qualitySummaries: 8, totalCitations: 156 },
    delayMs: 3000,
  },
  {
    step: 14,
    agent: "Executor",
    type: "TOOL_CALL",
    summary: "Generating final report with trend analysis",
    payload: { tool: "report_generator", format: "markdown" },
    delayMs: 2500,
  },
  {
    step: 15,
    agent: "Executor",
    type: "TOOL_RESULT",
    summary: "Final report generated: 2,400 words with visualizations",
    payload: { wordCount: 2400, charts: 3, tables: 2 },
    delayMs: 3000,
  },
  {
    step: 16,
    agent: "Critic",
    type: "NOTE",
    summary: "Final review passed. Report is comprehensive and well-structured.",
    payload: { qualityScore: 9.2, recommendation: "approved" },
    delayMs: 2000,
  },
  {
    step: 17,
    agent: "Planner",
    type: "DONE",
    summary: "Mission complete: AI Trends Report delivered successfully",
    payload: { totalDuration: "45s", eventsProcessed: 17 },
    delayMs: 2500,
  },
];

export function getEventsFromStep(startStep: number): DemoEvent[] {
  return demoScript.filter((e) => e.step >= startStep);
}

