import React from "react";
import { Play, Pause, Square, Camera, Activity, Monitor } from "lucide-react";
import type { UnityRuntimeStateData } from "../types.js";

interface UnityRuntimeTabProps {
  runtimeState: UnityRuntimeStateData;
  isConnected: boolean;
  onMutateRuntime: (action: "play" | "pause" | "stop") => void;
  onCaptureScreenshot: () => void;
}

export const UnityRuntimeTab: React.FC<UnityRuntimeTabProps> = ({
  runtimeState,
  isConnected,
  onMutateRuntime,
  onCaptureScreenshot,
}) => {
  const isPlaying = runtimeState.lifecycleState === "PLAYING";
  const isPaused = runtimeState.lifecycleState === "PAUSED";
  const isStopped = runtimeState.lifecycleState === "STOPPED";

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base overflow-hidden">
      {/* 1. Top Runtime Toolbar (Compact) */}
      <div className="h-12 px-4 border-b border-theme-subtle bg-theme-sidebar/40 flex items-center justify-between select-none shrink-0 font-mono text-xs">
        <div className="flex items-center gap-3">
          {/* Controls */}
          <div className="flex items-center gap-1 bg-theme-base p-1 rounded-md border border-theme-subtle">
            <button
              type="button"
              disabled={!isConnected || isPlaying}
              onClick={() => onMutateRuntime("play")}
              title="Play"
              className={`p-1.5 rounded transition flex items-center gap-1.5 ${
                isPlaying
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "text-theme-secondary hover:text-theme-primary hover:bg-theme-card/60 disabled:opacity-40"
              }`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span className="text-[11px] font-semibold">Play</span>
            </button>

            <button
              type="button"
              disabled={!isConnected || isStopped}
              onClick={() => onMutateRuntime("pause")}
              title="Pause"
              className={`p-1.5 rounded transition flex items-center gap-1.5 ${
                isPaused
                  ? "bg-amber-500/20 text-amber-400"
                  : "text-theme-secondary hover:text-theme-primary hover:bg-theme-card/60 disabled:opacity-40"
              }`}
            >
              <Pause className="w-3.5 h-3.5 fill-current" />
              <span className="text-[11px] font-semibold">Pause</span>
            </button>

            <button
              type="button"
              disabled={!isConnected || isStopped}
              onClick={() => onMutateRuntime("stop")}
              title="Stop"
              className={`p-1.5 rounded transition flex items-center gap-1.5 ${
                isStopped
                  ? "text-theme-muted opacity-40 cursor-not-allowed"
                  : "text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
              }`}
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span className="text-[11px] font-semibold">Stop</span>
            </button>
          </div>

          <span className="text-theme-subtle">|</span>

          {/* Indicators */}
          <div className="flex items-center gap-5 text-xs">
            <div>
              <span className="text-theme-muted mr-1.5">Runtime:</span>
              <span
                className={`font-semibold ${
                  isPlaying ? "text-emerald-500" : isPaused ? "text-amber-500" : "text-theme-secondary"
                }`}
              >
                {runtimeState.lifecycleState}
              </span>
            </div>

            <div>
              <span className="text-theme-muted mr-1.5">FPS:</span>
              <span className="text-theme-primary font-semibold">
                {runtimeState.fps !== null ? runtimeState.fps : "—"}
              </span>
            </div>

            <div>
              <span className="text-theme-muted mr-1.5">Objects:</span>
              <span className="text-theme-primary font-semibold">
                {runtimeState.objectsCount !== null ? runtimeState.objectsCount : "—"}
              </span>
            </div>

            <div>
              <span className="text-theme-muted mr-1.5">TimeScale:</span>
              <span className="text-theme-primary font-semibold">
                {runtimeState.timeScale.toFixed(1)}
              </span>
            </div>
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!isConnected}
            onClick={onCaptureScreenshot}
            className="px-2.5 py-1 bg-theme-card/60 hover:bg-theme-card text-theme-primary border border-theme-subtle rounded text-xs flex items-center gap-1.5 transition disabled:opacity-40"
          >
            <Camera className="w-3.5 h-3.5 text-sky-400" />
            <span>捕获画面</span>
          </button>
        </div>
      </div>

      {/* 2. Runtime Workspace Split (左右分栏) */}
      <div className="flex-1 flex min-h-0 overflow-hidden p-4 gap-4">
        {/* Left: Runtime State & Metrics */}
        <div className="w-96 flex flex-col gap-4 shrink-0 overflow-y-auto">
          {/* Card: Runtime State Details */}
          <div className="p-3 bg-theme-card/40 border border-theme-subtle rounded-lg space-y-3 font-mono text-xs">
            <div className="flex items-center gap-2 font-semibold text-theme-primary text-xs">
              <Activity className="w-3.5 h-3.5 text-sky-400" />
              <span>Runtime Telemetry</span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] bg-theme-base/60 p-2 rounded border border-theme-subtle">
                <span className="text-theme-muted">Active Scene:</span>
                <span className="text-theme-primary font-medium truncate">
                  {runtimeState.activeScene || "—"}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] bg-theme-base/60 p-2 rounded border border-theme-subtle">
                <span className="text-theme-muted">Memory Usage:</span>
                <span className="text-theme-primary font-medium">
                  {runtimeState.memoryMB !== null ? `${runtimeState.memoryMB} MB` : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] bg-theme-base/60 p-2 rounded border border-theme-subtle">
                <span className="text-theme-muted">Play Mode:</span>
                <span
                  className={`font-semibold ${
                    isPlaying ? "text-emerald-400" : isPaused ? "text-amber-400" : "text-theme-muted"
                  }`}
                >
                  {isPlaying ? "ACTIVE" : isPaused ? "PAUSED" : "STOPPED"}
                </span>
              </div>
            </div>
          </div>

          {/* Card: Runtime Objects */}
          <div className="flex-1 p-3 bg-theme-card/40 border border-theme-subtle rounded-lg flex flex-col min-h-48 font-mono text-xs">
            <div className="flex items-center justify-between font-semibold text-theme-primary text-xs pb-2 border-b border-theme-subtle">
              <div className="flex items-center gap-2">
                <Monitor className="w-3.5 h-3.5 text-sky-400" />
                <span>Runtime Objects</span>
              </div>
              <span className="text-[10px] text-theme-muted">
                {runtimeState.runtimeObjects?.length || 0} items
              </span>
            </div>

            <div className="flex-1 overflow-y-auto pt-2 space-y-1">
              {runtimeState.runtimeObjects && runtimeState.runtimeObjects.length > 0 ? (
                runtimeState.runtimeObjects.map((obj, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-1.5 rounded bg-theme-base/40 border border-theme-subtle text-[11px]"
                  >
                    <span className="text-theme-primary truncate">{obj.name}</span>
                    <span className="text-[10px] text-theme-muted">({obj.type})</span>
                  </div>
                ))
              ) : (
                <div className="h-full flex items-center justify-center text-center text-xs text-theme-muted p-4">
                  尚未运行或无动态实例
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Viewport / Screenshot Frame */}
        <div className="flex-1 bg-theme-card/20 border border-theme-subtle rounded-lg flex flex-col overflow-hidden">
          <div className="h-9 px-3 border-b border-theme-subtle bg-theme-header/60 flex items-center justify-between text-xs font-mono">
            <span className="text-theme-muted">Viewport / Frame Capture</span>
            <span className="text-[10px] text-theme-muted">1920x1080 Standalone</span>
          </div>

          <div className="flex-1 bg-black/60 flex items-center justify-center p-4 overflow-hidden">
            {runtimeState.screenshotUrl ? (
              <img
                src={runtimeState.screenshotUrl}
                alt="Runtime Viewport"
                className="max-h-full max-w-full object-contain rounded border border-theme-subtle shadow-md"
              />
            ) : (
              <div className="text-center space-y-2 text-theme-muted font-mono text-xs">
                <Camera className="w-8 h-8 text-theme-subtle mx-auto" />
                <div>暂无画面捕获</div>
                <div className="text-[10px] text-theme-muted/60">
                  点击上方「捕获画面」拉取最新运行视口截屏
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
