"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { demoScript } from "@/lib/demoScript";
import { Mission, MissionEvent, AgentType, EventType } from "@/lib/types";

const STORAGE_KEY = "swarmboard:missionId";
const POLL_INTERVAL = 800;
const REPLAY_BASE_INTERVAL = 450;

type ViewMode = "live" | "replay";
type ReplaySpeed = 1 | 2 | 4;

const agentLabels: Record<AgentType, string> = {
  Planner: "PLN",
  Researcher: "RSC",
  Executor: "EXE",
  Critic: "CRT",
};

export default function SwarmBoard() {
  // Core state
  const [mission, setMission] = useState<Mission | null>(null);
  const [events, setEvents] = useState<MissionEvent[]>([]);
  const [missionId, setMissionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Crash simulation state
  const [isCrashed, setIsCrashed] = useState(false);
  const [crashedAtStep, setCrashedAtStep] = useState<number | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);

  // Replay state
  const [mode, setMode] = useState<ViewMode>("live");
  const [replaySpeed, setReplaySpeed] = useState<ReplaySpeed>(1);
  const [replayEvents, setReplayEvents] = useState<MissionEvent[]>([]);
  const [visibleEvents, setVisibleEvents] = useState<MissionEvent[]>([]);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayFinished, setReplayFinished] = useState(false);
  const [replayFromCheckpoint, setReplayFromCheckpoint] = useState(false);

  // Fork modal state
  const [showForkModal, setShowForkModal] = useState(false);
  const [forkStep, setForkStep] = useState(1);
  const [isForking, setIsForking] = useState(false);

  // History panel state
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [allMissions, setAllMissions] = useState<Mission[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Refs
  const scheduledStepsRef = useRef<Set<number>>(new Set());
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const replayIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Get last checkpoint step
  const getLastCheckpointStep = useCallback((evts: MissionEvent[]): number | null => {
    const checkpoint = [...evts].reverse().find((e) => e.type === "CHECKPOINT");
    return checkpoint ? checkpoint.step : null;
  }, []);

  const lastCheckpointStep = getLastCheckpointStep(events);

  // Load missionId from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setMissionId(stored);
    }
  }, []);

  // Fetch mission data
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

  // Fetch all missions for history
  const fetchAllMissions = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch("/api/missions/list");
      if (!res.ok) throw new Error("Failed to fetch missions");
      const data = await res.json();
      setAllMissions(data.missions || []);
    } catch (err) {
      console.error("Error fetching missions:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // Emit event
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

  // Schedule demo events
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

  // Polling
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

  // Replay logic
  const stopReplay = useCallback(() => {
    if (replayIntervalRef.current) {
      clearInterval(replayIntervalRef.current);
      replayIntervalRef.current = null;
    }
  }, []);

  const startReplay = useCallback((fromCheckpoint: boolean = false) => {
    if (events.length === 0) return;
    
    stopPolling();
    stopReplay();
    
    const eventsToReplay = [...events];
    let startIndex = 0;
    
    if (fromCheckpoint) {
      const checkpointIdx = eventsToReplay.findIndex((e) => e.type === "CHECKPOINT");
      if (checkpointIdx >= 0) {
        const lastCheckpointIdx = [...eventsToReplay]
          .map((e, i) => ({ e, i }))
          .filter(({ e }) => e.type === "CHECKPOINT")
          .pop()?.i || 0;
        startIndex = lastCheckpointIdx;
      }
    }
    
    setReplayEvents(eventsToReplay);
    setReplayIndex(startIndex);
    setVisibleEvents(eventsToReplay.slice(0, startIndex));
    setReplayFinished(false);
    setReplayFromCheckpoint(fromCheckpoint);
    setMode("replay");
  }, [events, stopPolling, stopReplay]);

  // Replay tick effect
  useEffect(() => {
    if (mode !== "replay" || replayFinished) return;

    const interval = REPLAY_BASE_INTERVAL / replaySpeed;
    
    replayIntervalRef.current = setInterval(() => {
      setReplayIndex((prev) => {
        const nextIndex = prev + 1;
        if (nextIndex > replayEvents.length) {
          setReplayFinished(true);
          return prev;
        }
        setVisibleEvents(replayEvents.slice(0, nextIndex));
        return nextIndex;
      });
    }, interval);

    return () => {
      if (replayIntervalRef.current) {
        clearInterval(replayIntervalRef.current);
      }
    };
  }, [mode, replaySpeed, replayEvents, replayFinished]);

  const exitReplay = useCallback(() => {
    stopReplay();
    setMode("live");
    setReplayEvents([]);
    setVisibleEvents([]);
    setReplayIndex(0);
    setReplayFinished(false);
    
    if (missionId) {
      startPolling(missionId);
    }
  }, [stopReplay, missionId, startPolling]);

  const restartReplay = useCallback(() => {
    startReplay(replayFromCheckpoint);
  }, [startReplay, replayFromCheckpoint]);

  // Hydrate on missionId change (live mode only)
  useEffect(() => {
    if (!missionId || isCrashed || mode !== "live") return;

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
  }, [missionId, isCrashed, mode, fetchMission, startPolling, stopPolling, scheduleDemoEvents]);

  // Stop polling when mission done
  useEffect(() => {
    if (mission?.status === "done" && mode === "live") {
      stopPolling();
    }
  }, [mission?.status, mode, stopPolling]);

  // Auto-scroll timeline
  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [events, visibleEvents]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
      stopReplay();
    };
  }, [stopPolling, stopReplay]);

  // Handlers
  const handleStartDemo = async () => {
    setIsLoading(true);
    setError(null);
    scheduledStepsRef.current.clear();
    exitReplay();

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
    stopPolling();
    stopReplay();
    scheduledStepsRef.current.clear();
    setCrashedAtStep(mission?.currentStep || 0);
    setIsCrashed(true);
  };

  const handleRecover = async () => {
    setIsRecovering(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setIsCrashed(false);
    setIsRecovering(false);
    setMode("live");
    
    if (missionId) {
      const data = await fetchMission(missionId);
      if (data && data.mission) {
        startPolling(missionId);
        if (data.mission.status === "running") {
          scheduleDemoEvents(missionId, data.mission.currentStep);
        }
      }
    }
  };

  const handleReset = async () => {
    stopPolling();
    stopReplay();
    scheduledStepsRef.current.clear();
    localStorage.removeItem(STORAGE_KEY);
    setMissionId(null);
    setMission(null);
    setEvents([]);
    setError(null);
    setIsCrashed(false);
    setCrashedAtStep(null);
    setMode("live");
    setAllMissions([]);

    try {
      await fetch("/api/dev/reset", { method: "POST" });
    } catch (err) {
      console.error("Failed to reset database:", err);
    }
  };

  // Fork handlers
  const handleOpenForkModal = () => {
    setForkStep(mission?.currentStep || 1);
    setShowForkModal(true);
  };

  const handleFork = async () => {
    if (!missionId || !mission) return;
    
    setIsForking(true);
    try {
      const res = await fetch("/api/missions/fork", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentMissionId: missionId, forkStep }),
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to fork mission");
      }
      
      const data = await res.json();
      const newMissionId = data.missionId;
      
      exitReplay();
      localStorage.setItem(STORAGE_KEY, newMissionId);
      setMissionId(newMissionId);
      scheduledStepsRef.current.clear();
      
      const missionData = await fetchMission(newMissionId);
      if (missionData && missionData.mission) {
        startPolling(newMissionId);
        if (missionData.mission.status === "running") {
          scheduleDemoEvents(newMissionId, missionData.mission.currentStep);
        }
      }
      
      setShowForkModal(false);
    } catch (err) {
      console.error("Error forking:", err);
      setError(err instanceof Error ? err.message : "Failed to fork mission");
    } finally {
      setIsForking(false);
    }
  };

  // History handlers
  const handleOpenHistory = () => {
    setShowHistoryPanel(true);
    fetchAllMissions();
  };

  const handleSelectMission = async (selectedMissionId: string) => {
    exitReplay();
    stopPolling();
    scheduledStepsRef.current.clear();
    
    localStorage.setItem(STORAGE_KEY, selectedMissionId);
    setMissionId(selectedMissionId);
    
    const data = await fetchMission(selectedMissionId);
    if (data && data.mission) {
      startPolling(selectedMissionId);
      if (data.mission.status === "running") {
        scheduleDemoEvents(selectedMissionId, data.mission.currentStep);
      }
    }
    
    setShowHistoryPanel(false);
  };

  // Derive display events based on mode
  const displayEvents = mode === "replay" ? visibleEvents : events;

  // Get agent latest from display events
  const getAgentLatestEvents = (evts: MissionEvent[]): Record<AgentType, MissionEvent | null> => {
    const result: Record<AgentType, MissionEvent | null> = {
      Planner: null,
      Researcher: null,
      Executor: null,
      Critic: null,
    };
    evts.forEach((event) => {
      if (!result[event.agent] || event.step > result[event.agent]!.step) {
        result[event.agent] = event;
      }
    });
    return result;
  };

  const agentLatest = getAgentLatestEvents(displayEvents);
  const activeAgents = Object.entries(agentLatest).filter(([, e]) => e !== null);

  const replayCheckpointSummary = mode === "replay" 
    ? [...visibleEvents].reverse().find((e) => e.type === "CHECKPOINT")?.summary 
    : null;

  // Crash Screen
  if (isCrashed) {
    return (
      <div className="min-h-screen bg-white flex flex-col font-mono">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-2xl px-8">
            <h1 className="text-6xl font-bold text-gray-800 mb-4">502</h1>
            <h2 className="text-2xl text-gray-600 mb-8">Bad Gateway</h2>
            
            <div className="bg-gray-100 border border-gray-300 p-6 mb-8 text-left text-sm text-gray-700">
              <p className="mb-2">The server encountered a temporary error and could not complete your request.</p>
              <p className="mb-4">Please try again in 30 seconds.</p>
              <hr className="border-gray-300 my-4" />
              <p className="text-gray-500 text-xs">nginx/1.24.0</p>
            </div>

            <div className="bg-cream-100 border border-cream-400 p-6 rounded-md text-left mb-6">
              <p className="text-sm text-ink-600 mb-2">
                <span className="font-semibold">Application crashed at step {crashedAtStep}/{demoScript.length}</span>
              </p>
              <p className="text-sm text-ink-500 mb-4">
                All progress has been persisted to MongoDB Atlas. Click below to recover and continue from where you left off.
              </p>
              <div className="flex items-center gap-2 text-xs text-ink-400">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <span>MongoDB Atlas: Connected</span>
                <span className="mx-2">|</span>
                <span>{events.length} events preserved</span>
              </div>
            </div>

            <button
              onClick={handleRecover}
              disabled={isRecovering}
              className="px-8 py-3 bg-ink-900 text-cream-50 font-medium rounded-md hover:bg-ink-700 active:bg-ink-800 transition-all duration-150 disabled:opacity-60"
            >
              {isRecovering ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-cream-50 border-t-transparent rounded-full animate-spin"></span>
                  Recovering from MongoDB...
                </span>
              ) : (
                "Recover & Continue Mission"
              )}
            </button>

            <p className="text-xs text-gray-400 mt-6">
              This demonstrates crash recovery — state is restored from MongoDB, not browser memory.
            </p>
          </div>
        </div>

        <div className="bg-gray-800 text-gray-300 text-xs py-2 px-4 flex items-center justify-between">
          <span>Connection lost to swarmboard.local</span>
          <span className="text-gray-500">ERR_CONNECTION_REFUSED</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-cream-100 text-ink-900">
      {/* Top Bar */}
      <header className="border-b border-cream-400 bg-cream-50">
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-semibold tracking-tight">SwarmBoard</h1>
              
              {/* Mode Badge */}
              <span className={`text-xs font-mono px-2 py-1 rounded ${
                mode === "replay" 
                  ? "bg-purple-100 text-purple-700 border border-purple-300" 
                  : "bg-cream-200 text-ink-500 border border-cream-400"
              }`}>
                {mode === "replay" ? "REPLAY" : "LIVE"}
              </span>

              {mission && mode === "live" && (
                <div className="flex items-center gap-4 ml-2 border-l border-cream-400 pl-4">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-sm ${
                      mission.status === "running" ? "bg-ink-900 status-pulse" 
                        : mission.status === "done" ? "bg-ink-400" : "bg-ink-300"
                    }`} />
                    <span className="text-sm font-mono text-ink-500 uppercase">{mission.status}</span>
                  </div>
                  <span className="text-sm font-mono text-ink-400">
                    Step {mission.currentStep}/{demoScript.length}
                  </span>
                </div>
              )}

              {mode === "replay" && (
                <div className="flex items-center gap-4 ml-2 border-l border-cream-400 pl-4">
                  <span className="text-sm font-mono text-purple-600">
                    {replayFinished ? "Replay finished" : `Replaying ${visibleEvents.length}/${replayEvents.length}`}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* History Button */}
              <button
                onClick={handleOpenHistory}
                className="px-3 py-2 border border-cream-400 text-ink-500 font-medium text-sm rounded-md hover:bg-cream-200 hover:border-cream-500 hover:text-ink-900 transition-all duration-150"
              >
                History
              </button>

              {/* Replay Controls */}
              {mission && events.length > 0 && mode === "live" && (
                <>
                  <button
                    onClick={() => startReplay(false)}
                    className="px-3 py-2 border border-cream-400 text-ink-500 font-medium text-sm rounded-md hover:bg-cream-200 hover:border-cream-500 hover:text-ink-900 transition-all duration-150"
                  >
                    Replay
                  </button>
                  {lastCheckpointStep && (
                    <button
                      onClick={() => startReplay(true)}
                      className="px-3 py-2 border border-cream-400 text-ink-500 font-medium text-sm rounded-md hover:bg-cream-200 hover:border-cream-500 hover:text-ink-900 transition-all duration-150"
                      title={`Replay from checkpoint (step ${lastCheckpointStep})`}
                    >
                      Replay from CP
                    </button>
                  )}
                </>
              )}

              {mode === "replay" && (
                <>
                  <div className="flex items-center border border-cream-400 rounded-md overflow-hidden">
                    {([1, 2, 4] as ReplaySpeed[]).map((speed) => (
                      <button
                        key={speed}
                        onClick={() => setReplaySpeed(speed)}
                        className={`px-3 py-2 text-sm font-mono ${
                          replaySpeed === speed 
                            ? "bg-purple-100 text-purple-700" 
                            : "bg-cream-50 text-ink-500 hover:bg-cream-100"
                        }`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                  
                  {replayFinished && (
                    <button
                      onClick={restartReplay}
                      className="px-3 py-2 border border-cream-400 text-ink-500 font-medium text-sm rounded-md hover:bg-cream-200 hover:border-cream-500 hover:text-ink-900 transition-all duration-150"
                    >
                      Replay Again
                    </button>
                  )}
                  
                  <button
                    onClick={exitReplay}
                    className="px-3 py-2 border border-cream-400 text-ink-500 font-medium text-sm rounded-md hover:bg-cream-200 hover:border-cream-500 hover:text-ink-900 transition-all duration-150"
                  >
                    Exit Replay
                  </button>
                </>
              )}

              {mode === "live" && (
                <>
                  {mission && (
                    <button
                      onClick={handleOpenForkModal}
                      className="px-3 py-2 border border-cream-400 text-ink-500 font-medium text-sm rounded-md hover:bg-cream-200 hover:border-cream-500 hover:text-ink-900 transition-all duration-150"
                    >
                      Fork
                    </button>
                  )}

                  <button
                    onClick={handleStartDemo}
                    disabled={isLoading || mission?.status === "running"}
                    className="px-4 py-2 bg-ink-900 text-cream-50 font-medium text-sm rounded-md disabled:opacity-40 disabled:cursor-not-allowed hover:bg-ink-700 active:bg-ink-800 transition-all duration-150"
                  >
                    {isLoading ? "Starting..." : "Start Mission"}
                  </button>
                  <button
                    onClick={handleCrash}
                    disabled={!mission || mission.status !== "running"}
                    className="px-3 py-2 border border-cream-400 text-ink-500 font-medium text-sm rounded-md hover:bg-red-50 hover:border-red-300 hover:text-red-600 active:bg-red-100 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-cream-400 disabled:hover:text-ink-500"
                  >
                    Crash
                  </button>
                  <button
                    onClick={handleReset}
                    className="px-3 py-2 border border-cream-400 text-ink-500 font-medium text-sm rounded-md hover:bg-cream-200 hover:border-cream-500 hover:text-ink-900 active:bg-cream-300 transition-all duration-150"
                  >
                    Reset
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Branch Info Banner */}
      {mission?.branchFromMissionId && mode === "live" && (
        <div className="border-b border-blue-200 bg-blue-50">
          <div className="max-w-[1800px] mx-auto px-6 py-2">
            <div className="flex items-center justify-center gap-2 text-xs text-blue-600 font-mono">
              <span>Forked from</span>
              <span className="bg-blue-100 px-2 py-0.5 rounded">{mission.branchFromMissionId.toString().slice(-8)}</span>
              <span>at step {mission.branchFromStep}</span>
            </div>
          </div>
        </div>
      )}

      {/* Info Banner */}
      <div className="border-b border-cream-400 bg-cream-50">
        <div className="max-w-[1800px] mx-auto px-6 py-2">
          <div className="flex items-center justify-center gap-8 text-xs text-ink-400 font-mono">
            <span>MongoDB Atlas = durable context engine</span>
            <span className="text-cream-400">|</span>
            <span>Replay, Fork, or Crash to explore</span>
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

      {/* History Panel */}
      {showHistoryPanel && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 pt-20">
          <div className="bg-cream-50 border border-cream-400 rounded-md w-full max-w-2xl mx-4 max-h-[70vh] flex flex-col">
            <div className="p-4 border-b border-cream-400 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Mission History</h3>
              <button
                onClick={() => setShowHistoryPanel(false)}
                className="text-ink-400 hover:text-ink-900 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {isLoadingHistory ? (
                <div className="flex items-center justify-center py-8">
                  <span className="w-6 h-6 border-2 border-ink-400 border-t-transparent rounded-full animate-spin"></span>
                </div>
              ) : allMissions.length === 0 ? (
                <div className="text-center py-8 text-ink-400">
                  No missions yet. Start one!
                </div>
              ) : (
                <div className="space-y-2">
                  {allMissions.map((m) => {
                    const isCurrentMission = m._id?.toString() === missionId;
                    const isFork = !!m.branchFromMissionId;
                    
                    return (
                      <button
                        key={m._id?.toString()}
                        onClick={() => handleSelectMission(m._id.toString())}
                        className={`w-full p-4 border rounded-md text-left transition-all duration-150 ${
                          isCurrentMission 
                            ? "border-ink-400 bg-cream-200" 
                            : "border-cream-400 bg-cream-50 hover:border-cream-500 hover:bg-cream-100"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm truncate">{m.title}</span>
                              {isCurrentMission && (
                                <span className="text-xs bg-ink-900 text-cream-50 px-2 py-0.5 rounded">Current</span>
                              )}
                              {isFork && (
                                <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded">Fork</span>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-3 text-xs text-ink-400 font-mono">
                              <span className={`uppercase ${
                                m.status === "running" ? "text-green-600" 
                                  : m.status === "done" ? "text-ink-500" 
                                  : "text-red-500"
                              }`}>
                                {m.status}
                              </span>
                              <span>Step {m.currentStep}/{demoScript.length}</span>
                              <span>{new Date(m.createdAt).toLocaleString()}</span>
                            </div>
                            
                            {isFork && m.branchFromMissionId && (
                              <div className="mt-2 text-xs text-blue-500">
                                Forked from ...{m.branchFromMissionId.toString().slice(-8)} at step {m.branchFromStep}
                              </div>
                            )}
                          </div>
                          
                          <div className="text-xs font-mono text-ink-300">
                            ...{m._id?.toString().slice(-8)}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-cream-400 bg-cream-100 text-xs text-ink-400 text-center font-mono">
              {allMissions.length} mission{allMissions.length !== 1 ? "s" : ""} total
            </div>
          </div>
        </div>
      )}

      {/* Fork Modal */}
      {showForkModal && mission && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-cream-50 border border-cream-400 rounded-md p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Fork Mission</h3>
            
            <div className="mb-4">
              <p className="text-sm text-ink-500 mb-2">Parent Mission</p>
              <p className="text-xs font-mono text-ink-400 bg-cream-200 p-2 rounded">
                {missionId?.slice(-12)}...
              </p>
            </div>

            <div className="mb-4">
              <label className="text-sm text-ink-500 block mb-2">Fork from step</label>
              <input
                type="number"
                min={1}
                max={mission.currentStep}
                value={forkStep}
                onChange={(e) => setForkStep(Math.max(1, Math.min(mission.currentStep, parseInt(e.target.value) || 1)))}
                className="w-full px-3 py-2 border border-cream-400 rounded-md text-sm font-mono focus:outline-none focus:border-ink-400"
              />
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setForkStep(mission.currentStep)}
                className="flex-1 px-3 py-2 text-xs border border-cream-400 rounded-md hover:bg-cream-100 transition-colors"
              >
                Current Step ({mission.currentStep})
              </button>
              {lastCheckpointStep && (
                <button
                  onClick={() => setForkStep(lastCheckpointStep)}
                  className="flex-1 px-3 py-2 text-xs border border-cream-400 rounded-md hover:bg-cream-100 transition-colors"
                >
                  Last Checkpoint ({lastCheckpointStep})
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowForkModal(false)}
                className="flex-1 px-4 py-2 border border-cream-400 text-ink-500 font-medium text-sm rounded-md hover:bg-cream-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleFork}
                disabled={isForking}
                className="flex-1 px-4 py-2 bg-ink-900 text-cream-50 font-medium text-sm rounded-md hover:bg-ink-700 disabled:opacity-50 transition-colors"
              >
                {isForking ? "Forking..." : "Create Fork"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-[1800px] mx-auto w-full px-6 py-6">
        {!mission ? (
          /* Landing Page */
          <div className="flex items-center justify-center min-h-[600px]">
            <div className="max-w-2xl w-full">
              <div className="text-center mb-12">
                <h2 className="text-4xl font-semibold mb-3 tracking-tight">SwarmBoard</h2>
                <p className="text-ink-400 text-lg">Multi-agent mission control</p>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-12">
                <div className="p-5 border border-cream-400 bg-cream-50 rounded-md hover:border-cream-500 transition-colors">
                  <div className="text-xs font-mono text-ink-400 uppercase tracking-wider mb-2">Agents</div>
                  <p className="text-sm text-ink-600">Four specialized agents collaborate on complex tasks</p>
                </div>
                <div className="p-5 border border-cream-400 bg-cream-50 rounded-md hover:border-cream-500 transition-colors">
                  <div className="text-xs font-mono text-ink-400 uppercase tracking-wider mb-2">Replay & Fork</div>
                  <p className="text-sm text-ink-600">Replay past runs or fork from any step</p>
                </div>
                <div className="p-5 border border-cream-400 bg-cream-50 rounded-md hover:border-cream-500 transition-colors">
                  <div className="text-xs font-mono text-ink-400 uppercase tracking-wider mb-2">Recovery</div>
                  <p className="text-sm text-ink-600">Crash anytime — recover and resume seamlessly</p>
                </div>
              </div>

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
          <div className="grid grid-cols-12 gap-6 h-[calc(100vh-220px)] min-h-0">
            {/* Left: Agent Cards */}
            <div className="col-span-3 space-y-3 overflow-y-auto">
              <h2 className="text-xs font-mono text-ink-400 uppercase tracking-wider mb-4">
                Agents {mode === "replay" && <span className="text-purple-500">(Replay)</span>}
              </h2>
              {(["Planner", "Researcher", "Executor", "Critic"] as AgentType[]).map((agent) => {
                const latestEvent = agentLatest[agent];
                const isActive = latestEvent && (mode === "replay" ? !replayFinished : mission.status === "running");

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
                        <span className={`ml-auto w-2 h-2 rounded-sm status-pulse ${mode === "replay" ? "bg-purple-500" : "bg-ink-900"}`} />
                      )}
                    </div>
                    {latestEvent ? (
                      <>
                        <p className="text-xs text-ink-400 font-mono mb-1">{latestEvent.type}</p>
                        <p className="text-sm text-ink-600 line-clamp-2">{latestEvent.summary}</p>
                      </>
                    ) : (
                      <p className="text-sm text-ink-400">Waiting...</p>
                    )}
                  </div>
                );
              })}

              <div className="mt-4 p-4 border border-cream-400 bg-cream-50 rounded-md">
                <p className="text-xs font-mono text-ink-400 uppercase tracking-wider mb-1">Active</p>
                <p className="text-2xl font-mono text-ink-900">
                  {activeAgents.length}<span className="text-ink-400 text-lg">/4</span>
                </p>
              </div>
            </div>

            {/* Center: Timeline Feed */}
            <div className="col-span-5 flex flex-col min-h-0">
              <h2 className="text-xs font-mono text-ink-400 uppercase tracking-wider mb-4">
                Event Timeline {mode === "replay" && <span className="text-purple-500">({visibleEvents.length}/{replayEvents.length})</span>}
              </h2>
              <div ref={timelineRef} className="flex-1 overflow-y-auto space-y-2 pr-2">
                {displayEvents.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-ink-400 text-sm">
                    {mode === "replay" ? "Starting replay..." : "No events yet"}
                  </div>
                ) : (
                  displayEvents.map((event, idx) => {
                    const isLast = idx === displayEvents.length - 1;
                    const isHighlighted = isLast && (mode === "replay" ? !replayFinished : mission.status === "running");

                    return (
                      <div
                        key={event._id?.toString() || `${event.step}-${idx}`}
                        className="timeline-connector animate-fade-in"
                      >
                        <div
                          className={`p-4 border bg-cream-50 rounded-md transition-all duration-150 hover:border-cream-500 ${
                            isHighlighted 
                              ? mode === "replay" ? "border-purple-400" : "border-ink-300" 
                              : "border-cream-400"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`flex-shrink-0 w-10 h-10 rounded flex items-center justify-center ${
                              mode === "replay" ? "bg-purple-100" : "bg-cream-200"
                            }`}>
                              <span className={`text-sm font-mono ${mode === "replay" ? "text-purple-600" : "text-ink-500"}`}>
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
            <div className="col-span-4 space-y-3 overflow-y-auto">
              <h2 className="text-xs font-mono text-ink-400 uppercase tracking-wider mb-4">
                {mode === "replay" ? "Replay Context" : "Mission Context"}
              </h2>

              <div className="p-5 border border-cream-400 bg-cream-50 rounded-md">
                <h3 className="font-medium mb-4">{mission.title}</h3>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ink-400">Mode</span>
                    <span className={`text-sm font-mono uppercase ${mode === "replay" ? "text-purple-600" : "text-ink-900"}`}>
                      {mode}
                    </span>
                  </div>

                  {mode === "replay" ? (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-ink-400">Replay Step</span>
                      <span className="text-xl font-mono text-purple-600">
                        {visibleEvents.length}<span className="text-ink-400 text-sm">/{replayEvents.length}</span>
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-ink-400">Current Step</span>
                      <span className="text-xl font-mono">
                        {mission.currentStep}<span className="text-ink-400 text-sm">/{demoScript.length}</span>
                      </span>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between text-xs text-ink-400 mb-2">
                      <span>Progress</span>
                      <span>
                        {mode === "replay" 
                          ? Math.round((visibleEvents.length / replayEvents.length) * 100) || 0
                          : Math.round((mission.currentStep / demoScript.length) * 100)
                        }%
                      </span>
                    </div>
                    <div className="h-1 bg-cream-300 rounded-sm overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${mode === "replay" ? "bg-purple-400" : "bg-ink-400"}`}
                        style={{
                          width: `${mode === "replay" 
                            ? (visibleEvents.length / replayEvents.length) * 100 || 0
                            : (mission.currentStep / demoScript.length) * 100
                          }%`,
                        }}
                      />
                    </div>
                  </div>

                  {mode === "replay" && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-ink-400">Speed</span>
                      <span className="text-sm font-mono text-purple-600">{replaySpeed}x</span>
                    </div>
                  )}

                  {mode === "live" && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-ink-400">Status</span>
                      <span className="text-sm font-mono uppercase">{mission.status}</span>
                    </div>
                  )}
                </div>
              </div>

              {(mode === "replay" ? replayCheckpointSummary : mission.artifacts?.latestSummary) && (
                <div className="p-5 border border-cream-400 bg-cream-50 rounded-md">
                  <h3 className="text-xs font-mono text-ink-400 uppercase tracking-wider mb-3">
                    {mode === "replay" ? "Replay Checkpoint" : "Last Checkpoint"}
                  </h3>
                  <p className="text-sm text-ink-600 leading-relaxed">
                    {mode === "replay" ? replayCheckpointSummary : mission.artifacts?.latestSummary}
                  </p>
                </div>
              )}

              <div className="p-4 border border-cream-400 bg-cream-50 rounded-md">
                <p className="text-xs font-mono text-ink-400 uppercase tracking-wider mb-1">Mission ID</p>
                <p className="text-xs font-mono text-ink-500 break-all">{mission._id?.toString()}</p>
              </div>

              <div className="p-4 border border-cream-400 bg-cream-50 rounded-md">
                <p className="text-xs font-mono text-ink-400 uppercase tracking-wider mb-1">Persistence</p>
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
            <span>
              {mode === "replay" 
                ? `Replay: ${replaySpeed}x | ${visibleEvents.length}/${replayEvents.length} events` 
                : `Poll: ${POLL_INTERVAL}ms | Events: ${events.length}`
              }
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
