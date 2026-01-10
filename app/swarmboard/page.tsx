"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { demoScript } from "@/lib/demoScript";
import { Mission, MissionEvent, AgentType, EventType } from "@/lib/types";

const STORAGE_KEY = "swarmboard:missionId";
const POLL_INTERVAL = 800;

const agentLabels: Record<AgentType, string> = {
  Planner: "PLN",
  Researcher: "RSC",
  Executor: "EXE",
  Critic: "CRT",
};

export default function SwarmBoard() {
  const [mission, setMission] = useState<Mission | null>(null);
  const [events, setEvents] = useState<MissionEvent[]>([]);
  const [missionId, setMissionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scheduledStepsRef = useRef<Set<number>>(new Set());
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setMissionId(stored);
    }
  }, []);

  const fetchMission = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/missions/get?missionId=${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          localStorage.removeItem(STORAGE_KEY);
          setMissionId(null);
          setMission(null);
          setEvents([]);
          return null;
        }
        throw new Error("Failed to fetch mission");
      }
      const data = await res.json();
      setMission(data.mission);
      setEvents(data.events);
      return data;
    } catch (err) {
      console.error("Error fetching mission:", err);
      setError("Failed to fetch mission data");
      return null;
    }
  }, []);

  const emitEvent = useCallback(async (
    missionId: string,
    step: number,
    agent: AgentType,
    type: EventType,
    summary: string,
    payload: Record<string, unknown>
  ) => {
    try {
      const res = await fetch("/api/events/emit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missionId, step, agent, type, summary, payload }),
      });
      if (!res.ok) {
        console.error("Failed to emit event:", await res.text());
      }
    } catch (err) {
      console.error("Error emitting event:", err);
    }
  }, []);

  const scheduleDemoEvents = useCallback((currentMissionId: string, startFromStep: number) => {
    const eventsToSchedule = demoScript.filter(
      (e) => e.step > startFromStep && !scheduledStepsRef.current.has(e.step)
    );

    let cumulativeDelay = 0;

    eventsToSchedule.forEach((event) => {
      scheduledStepsRef.current.add(event.step);
      cumulativeDelay += event.delayMs;

      setTimeout(() => {
        emitEvent(
          currentMissionId,
          event.step,
          event.agent,
          event.type,
          event.summary,
          event.payload
        );
      }, cumulativeDelay);
    });
  }, [emitEvent]);

  const startPolling = useCallback((id: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    pollIntervalRef.current = setInterval(() => {
      fetchMission(id);
    }, POLL_INTERVAL);
  }, [fetchMission]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!missionId) return;

    fetchMission(missionId).then((data) => {
      if (data && data.mission) {
        startPolling(missionId);

        if (data.mission.status === "running") {
          scheduleDemoEvents(missionId, data.mission.currentStep);
        }
      }
    });

    return () => {
      stopPolling();
    };
  }, [missionId, fetchMission, startPolling, stopPolling, scheduleDemoEvents]);

  useEffect(() => {
    if (mission?.status === "done") {
      stopPolling();
    }
  }, [mission?.status, stopPolling]);

  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [events]);

  const handleStartDemo = async () => {
    setIsLoading(true);
    setError(null);
    scheduledStepsRef.current.clear();

    try {
      const res = await fetch("/api/missions/start", { method: "POST" });
      if (!res.ok) throw new Error("Failed to start mission");

      const data = await res.json();
      const newMissionId = data.missionId;

      localStorage.setItem(STORAGE_KEY, newMissionId);
      setMissionId(newMissionId);

      await fetchMission(newMissionId);
      startPolling(newMissionId);
      scheduleDemoEvents(newMissionId, 1);
    } catch (err) {
      console.error("Error starting demo:", err);
      setError("Failed to start demo mission");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCrash = () => {
    window.location.reload();
  };

  const handleReset = async () => {
    stopPolling();
    scheduledStepsRef.current.clear();
    localStorage.removeItem(STORAGE_KEY);
    setMissionId(null);
    setMission(null);
    setEvents([]);
    setError(null);

    try {
      await fetch("/api/dev/reset", { method: "POST" });
    } catch (err) {
      console.error("Failed to reset database:", err);
    }
  };

  const getAgentLatestEvents = (): Record<AgentType, MissionEvent | null> => {
    const result: Record<AgentType, MissionEvent | null> = {
      Planner: null,
      Researcher: null,
      Executor: null,
      Critic: null,
    };

    events.forEach((event) => {
      if (!result[event.agent] || event.step > result[event.agent]!.step) {
        result[event.agent] = event;
      }
    });

    return result;
  };

  const agentLatest = getAgentLatestEvents();
  const activeAgents = Object.entries(agentLatest).filter(([, e]) => e !== null);

  return (
    <div className="min-h-screen flex flex-col bg-cream-100 text-ink-900">
      {/* Top Bar */}
      <header className="border-b border-cream-400 bg-cream-50">
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <h1 className="text-xl font-semibold tracking-tight">SwarmBoard</h1>
              <span className="text-xs font-mono text-ink-400 border border-cream-400 px-2 py-1 rounded">
                v0.1
              </span>
              {mission && (
                <div className="flex items-center gap-4 ml-4 border-l border-cream-400 pl-6">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-sm ${
                        mission.status === "running"
                          ? "bg-ink-900 status-pulse"
                          : mission.status === "done"
                          ? "bg-ink-400"
                          : "bg-ink-300"
                      }`}
                    />
                    <span className="text-sm font-mono text-ink-500 uppercase">
                      {mission.status}
                    </span>
                  </div>
                  <span className="text-sm font-mono text-ink-400">
                    Step {mission.currentStep}/{demoScript.length}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleStartDemo}
                disabled={isLoading || mission?.status === "running"}
                className="px-4 py-2 bg-ink-900 text-cream-50 font-medium text-sm rounded-md disabled:opacity-40 disabled:cursor-not-allowed hover:bg-ink-700 active:bg-ink-800 transition-all duration-150"
              >
                {isLoading ? "Starting..." : "Start Mission"}
              </button>
              <button
                onClick={handleCrash}
                className="px-4 py-2 border border-cream-400 text-ink-500 font-medium text-sm rounded-md hover:bg-cream-200 hover:border-cream-500 hover:text-ink-900 active:bg-cream-300 transition-all duration-150"
              >
                Crash
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 border border-cream-400 text-ink-500 font-medium text-sm rounded-md hover:bg-cream-200 hover:border-cream-500 hover:text-ink-900 active:bg-cream-300 transition-all duration-150"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Info Banner */}
      <div className="border-b border-cream-400 bg-cream-50">
        <div className="max-w-[1800px] mx-auto px-6 py-2">
          <div className="flex items-center justify-center gap-8 text-xs text-ink-400 font-mono">
            <span>MongoDB Atlas = durable context engine</span>
            <span className="text-cream-400">|</span>
            <span>Refresh to prove recovery</span>
            <span className="text-cream-400">|</span>
            <span>Multi-agent orchestration</span>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="border-b border-cream-400 bg-cream-200 px-6 py-3">
          <p className="text-ink-600 text-center text-sm">{error}</p>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-[1800px] mx-auto w-full px-6 py-6">
        {!mission ? (
          /* Landing Page */
          <div className="flex items-center justify-center min-h-[600px]">
            <div className="max-w-2xl w-full">
              {/* Hero Section */}
              <div className="text-center mb-12">
                <h2 className="text-4xl font-semibold mb-3 tracking-tight">
                  SwarmBoard
                </h2>
                <p className="text-ink-400 text-lg">
                  Multi-agent mission control
                </p>
              </div>

              {/* Feature Cards */}
              <div className="grid grid-cols-3 gap-4 mb-12">
                <div className="p-5 border border-cream-400 bg-cream-50 rounded-md hover:border-cream-500 transition-colors">
                  <div className="text-xs font-mono text-ink-400 uppercase tracking-wider mb-2">Agents</div>
                  <p className="text-sm text-ink-600">Four specialized agents collaborate on complex tasks</p>
                </div>
                <div className="p-5 border border-cream-400 bg-cream-50 rounded-md hover:border-cream-500 transition-colors">
                  <div className="text-xs font-mono text-ink-400 uppercase tracking-wider mb-2">Persistence</div>
                  <p className="text-sm text-ink-600">MongoDB Atlas stores every event and checkpoint</p>
                </div>
                <div className="p-5 border border-cream-400 bg-cream-50 rounded-md hover:border-cream-500 transition-colors">
                  <div className="text-xs font-mono text-ink-400 uppercase tracking-wider mb-2">Recovery</div>
                  <p className="text-sm text-ink-600">Crash anytime — refresh and resume seamlessly</p>
                </div>
              </div>

              {/* CTA Section */}
              <div className="text-center">
                <div className="inline-block p-8 border border-cream-400 bg-cream-50 rounded-md">
                  <p className="text-ink-500 mb-6 text-sm">
                    Watch agents collaborate in real-time with full crash recovery
                  </p>
                  <button
                    onClick={handleStartDemo}
                    disabled={isLoading}
                    className="px-8 py-3 bg-ink-900 text-cream-50 font-medium rounded-md disabled:opacity-40 hover:bg-ink-700 active:bg-ink-800 transition-all duration-150"
                  >
                    {isLoading ? "Initializing..." : "Start Demo Mission"}
                  </button>
                </div>
              </div>

              {/* Stats Preview */}
              <div className="flex justify-center gap-12 mt-12 text-center">
                <div>
                  <div className="text-2xl font-mono text-ink-900">4</div>
                  <div className="text-xs font-mono text-ink-400 uppercase">Agents</div>
                </div>
                <div>
                  <div className="text-2xl font-mono text-ink-900">17</div>
                  <div className="text-xs font-mono text-ink-400 uppercase">Events</div>
                </div>
                <div>
                  <div className="text-2xl font-mono text-ink-900">~45s</div>
                  <div className="text-xs font-mono text-ink-400 uppercase">Duration</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Dashboard */
          <div className="grid grid-cols-12 gap-6 h-[calc(100vh-200px)]">
            {/* Left: Agent Cards */}
            <div className="col-span-3 space-y-3">
              <h2 className="text-xs font-mono text-ink-400 uppercase tracking-wider mb-4">
                Agents
              </h2>
              {(["Planner", "Researcher", "Executor", "Critic"] as AgentType[]).map((agent) => {
                const latestEvent = agentLatest[agent];
                const isActive = latestEvent && mission.status === "running";

                return (
                  <div
                    key={agent}
                    className={`p-4 border bg-cream-50 rounded-md transition-all duration-150 hover:border-cream-500 ${
                      isActive ? "border-ink-300" : "border-cream-400"
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-mono bg-cream-200 px-2 py-1 rounded text-ink-500">
                        {agentLabels[agent]}
                      </span>
                      <span className="font-medium text-sm">{agent}</span>
                      {isActive && (
                        <span className="ml-auto w-2 h-2 rounded-sm bg-ink-900 status-pulse" />
                      )}
                    </div>
                    {latestEvent ? (
                      <>
                        <p className="text-xs text-ink-400 font-mono mb-1">
                          {latestEvent.type}
                        </p>
                        <p className="text-sm text-ink-600 line-clamp-2">
                          {latestEvent.summary}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-ink-400">Waiting...</p>
                    )}
                  </div>
                );
              })}

              <div className="mt-4 p-4 border border-cream-400 bg-cream-50 rounded-md">
                <p className="text-xs font-mono text-ink-400 uppercase tracking-wider mb-1">
                  Active
                </p>
                <p className="text-2xl font-mono text-ink-900">
                  {activeAgents.length}
                  <span className="text-ink-400 text-lg">/4</span>
                </p>
              </div>
            </div>

            {/* Center: Timeline Feed */}
            <div className="col-span-5 flex flex-col">
              <h2 className="text-xs font-mono text-ink-400 uppercase tracking-wider mb-4">
                Event Timeline
              </h2>
              <div
                ref={timelineRef}
                className="flex-1 overflow-y-auto space-y-2 pr-2"
              >
                {events.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-ink-400 text-sm">
                    No events yet
                  </div>
                ) : (
                  events.map((event, idx) => {
                    const isLast = idx === events.length - 1;

                    return (
                      <div
                        key={event._id?.toString() || `${event.step}-${idx}`}
                        className="timeline-connector animate-fade-in"
                      >
                        <div
                          className={`p-4 border bg-cream-50 rounded-md transition-all duration-150 hover:border-cream-500 ${
                            isLast && mission.status === "running" ? "border-ink-300" : "border-cream-400"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 w-10 h-10 bg-cream-200 rounded flex items-center justify-center">
                              <span className="text-sm font-mono text-ink-500">
                                {String(event.step).padStart(2, "0")}
                              </span>
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-mono bg-cream-200 px-2 py-0.5 rounded text-ink-500">
                                  {agentLabels[event.agent]}
                                </span>
                                <span className="text-sm font-medium">{event.agent}</span>
                                <span className="text-xs font-mono text-ink-400 border border-cream-400 px-2 py-0.5 rounded">
                                  {event.type}
                                </span>
                                <span className="text-xs text-ink-400 ml-auto font-mono">
                                  {new Date(event.ts).toLocaleTimeString()}
                                </span>
                              </div>

                              <p className="text-sm text-ink-600">{event.summary}</p>

                              {event.payload && Object.keys(event.payload).length > 0 && (
                                <div className="mt-2 text-xs font-mono text-ink-400 bg-cream-200 p-2 rounded overflow-x-auto">
                                  {JSON.stringify(event.payload)}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right: Context Panel */}
            <div className="col-span-4 space-y-3">
              <h2 className="text-xs font-mono text-ink-400 uppercase tracking-wider mb-4">
                Mission Context
              </h2>

              <div className="p-5 border border-cream-400 bg-cream-50 rounded-md">
                <h3 className="font-medium mb-4">{mission.title}</h3>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ink-400">Status</span>
                    <span className="text-sm font-mono uppercase">{mission.status}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ink-400">Current Step</span>
                    <span className="text-xl font-mono">
                      {mission.currentStep}
                      <span className="text-ink-400 text-sm">/{demoScript.length}</span>
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs text-ink-400 mb-2">
                      <span>Progress</span>
                      <span>{Math.round((mission.currentStep / demoScript.length) * 100)}%</span>
                    </div>
                    <div className="h-1 bg-cream-300 rounded-sm overflow-hidden">
                      <div
                        className="h-full bg-ink-400 transition-all duration-500"
                        style={{
                          width: `${(mission.currentStep / demoScript.length) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ink-400">Started</span>
                    <span className="text-sm font-mono text-ink-600">
                      {new Date(mission.createdAt).toLocaleTimeString()}
                    </span>
                  </div>

                  {mission.lastCheckpointAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-ink-400">Last Checkpoint</span>
                      <span className="text-sm font-mono text-ink-600">
                        {new Date(mission.lastCheckpointAt).toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {mission.artifacts?.latestSummary && (
                <div className="p-5 border border-cream-400 bg-cream-50 rounded-md">
                  <h3 className="text-xs font-mono text-ink-400 uppercase tracking-wider mb-3">
                    Last Checkpoint
                  </h3>
                  <p className="text-sm text-ink-600 leading-relaxed">
                    {mission.artifacts.latestSummary}
                  </p>
                </div>
              )}

              <div className="p-4 border border-cream-400 bg-cream-50 rounded-md">
                <p className="text-xs font-mono text-ink-400 uppercase tracking-wider mb-1">
                  Mission ID
                </p>
                <p className="text-xs font-mono text-ink-500 break-all">
                  {mission._id?.toString()}
                </p>
              </div>

              <div className="p-4 border border-cream-400 bg-cream-50 rounded-md">
                <p className="text-xs font-mono text-ink-400 uppercase tracking-wider mb-1">
                  Persistence
                </p>
                <p className="text-sm text-ink-600">
                  MongoDB Atlas — {events.length} events stored
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-cream-400 bg-cream-50 py-3">
        <div className="max-w-[1800px] mx-auto px-6">
          <div className="flex items-center justify-between text-xs font-mono text-ink-400">
            <span>SwarmBoard MVP</span>
            <span>Poll: {POLL_INTERVAL}ms | Events: {events.length}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
