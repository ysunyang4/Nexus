import React, { useState, useMemo } from "react";
import { Search, Trash2, AlertCircle, AlertTriangle, Info, Terminal } from "lucide-react";
import type { UnityConsoleLog, UnityEvidenceDrawerData } from "../types.js";

interface UnityConsoleTabProps {
  logs: UnityConsoleLog[];
  onClear: () => void;
  onOpenEvidence: (evidence: UnityEvidenceDrawerData) => void;
}

export const UnityConsoleTab: React.FC<UnityConsoleTabProps> = ({
  logs,
  onClear,
  onOpenEvidence,
}) => {
  const [selectedLevel, setSelectedLevel] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Counts
  const counts = useMemo(() => {
    return {
      all: logs.length,
      log: logs.filter((l) => l.level === "LOG").length,
      warning: logs.filter((l) => l.level === "WARNING").length,
      error: logs.filter((l) => l.level === "ERROR").length,
      exception: logs.filter((l) => l.level === "EXCEPTION").length,
    };
  }, [logs]);

  // Filtered list
  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (selectedLevel !== "ALL" && l.level !== selectedLevel) return false;
      if (searchQuery && !l.message.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [logs, selectedLevel, searchQuery]);

  const handleRowClick = (log: UnityConsoleLog) => {
    onOpenEvidence({
      evidenceId: log.evidenceId || `ev_${log.id}`,
      operationId: `console.${log.level.toLowerCase()}`,
      capability: "console.read",
      timestamp: log.timestamp,
      preStateHash: "PRE_STABLE",
      postStateHash: log.level === "EXCEPTION" || log.level === "ERROR" ? "LOGGED_ERROR" : "LOGGED_INFO",
      evidenceHash: log.evidenceId || `ev_hash_${log.id}`,
      verificationVerdict: log.level === "EXCEPTION" || log.level === "ERROR" ? "FAILED" : "VERIFIED",
      verificationSource: "UNITY_EDITOR_RUNTIME_CONSOLE",
      stackTrace: log.stackTrace,
      logsSnapshot: [log.message],
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base overflow-hidden font-mono text-xs">
      {/* 1. Console Top Bar */}
      <div className="h-10 px-4 border-b border-theme-subtle bg-theme-sidebar/40 flex items-center justify-between select-none shrink-0 gap-4">
        {/* Level Filters */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSelectedLevel("ALL")}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
              selectedLevel === "ALL"
                ? "bg-theme-card text-theme-primary border border-theme-subtle shadow-xs"
                : "text-theme-muted hover:text-theme-primary"
            }`}
          >
            All <span className="text-[10px] opacity-70">({counts.all})</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedLevel("LOG")}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition flex items-center gap-1 ${
              selectedLevel === "LOG"
                ? "bg-sky-500/15 text-sky-400 border border-sky-500/30"
                : "text-theme-muted hover:text-theme-primary"
            }`}
          >
            <Info className="w-3 h-3 text-sky-400" />
            <span>LOG</span>
            <span className="text-[10px] opacity-70">({counts.log})</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedLevel("WARNING")}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition flex items-center gap-1 ${
              selectedLevel === "WARNING"
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                : "text-theme-muted hover:text-theme-primary"
            }`}
          >
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            <span>WARNING</span>
            <span className="text-[10px] opacity-70">({counts.warning})</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedLevel("ERROR")}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition flex items-center gap-1 ${
              selectedLevel === "ERROR"
                ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                : "text-theme-muted hover:text-theme-primary"
            }`}
          >
            <AlertCircle className="w-3 h-3 text-rose-400" />
            <span>ERROR</span>
            <span className="text-[10px] opacity-70">({counts.error})</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedLevel("EXCEPTION")}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition flex items-center gap-1 ${
              selectedLevel === "EXCEPTION"
                ? "bg-purple-500/15 text-purple-400 border border-purple-500/30"
                : "text-theme-muted hover:text-theme-primary"
            }`}
          >
            <Terminal className="w-3 h-3 text-purple-400" />
            <span>EXCEPTION</span>
            <span className="text-[10px] opacity-70">({counts.exception})</span>
          </button>
        </div>

        {/* Right Search & Clear */}
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="w-3 h-3 absolute left-2 top-2 text-theme-muted" />
            <input
              type="text"
              placeholder="搜索日志..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-theme-base pl-7 pr-2 py-0.5 rounded text-[11px] text-theme-primary placeholder-theme-muted border border-theme-subtle focus:outline-none focus:border-sky-500/50"
            />
          </div>

          <button
            type="button"
            onClick={onClear}
            className="p-1 text-theme-muted hover:text-theme-primary hover:bg-theme-card rounded transition"
            title="Clear Console"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Logs Table Header */}
      <div className="grid grid-cols-12 px-4 py-1.5 border-b border-theme-subtle bg-theme-header/50 text-[10px] font-semibold text-theme-muted uppercase tracking-wider select-none shrink-0">
        <div className="col-span-2">TIME</div>
        <div className="col-span-2">LEVEL</div>
        <div className="col-span-8">MESSAGE</div>
      </div>

      {/* 3. Logs List Body */}
      <div className="flex-1 overflow-y-auto divide-y divide-theme-subtle/50">
        {filteredLogs.length > 0 ? (
          filteredLogs.map((log) => {
            const isError = log.level === "ERROR";
            const isException = log.level === "EXCEPTION";
            const isWarning = log.level === "WARNING";

            return (
              <div
                key={log.id}
                onClick={() => handleRowClick(log)}
                className={`grid grid-cols-12 px-4 py-1.5 cursor-pointer text-[11px] transition items-center hover:bg-theme-card/70 ${
                  isException
                    ? "bg-purple-500/5 hover:bg-purple-500/10 text-purple-300"
                    : isError
                    ? "bg-rose-500/5 hover:bg-rose-500/10 text-rose-300"
                    : isWarning
                    ? "text-amber-300"
                    : "text-theme-secondary"
                }`}
              >
                <div className="col-span-2 text-theme-muted truncate">{log.timestamp}</div>
                <div className="col-span-2">
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                      isException
                        ? "bg-purple-500/20 text-purple-400 border-purple-500/30"
                        : isError
                        ? "bg-rose-500/20 text-rose-400 border-rose-500/30"
                        : isWarning
                        ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                        : "bg-theme-card text-theme-muted border-theme-subtle"
                    }`}
                  >
                    {log.level}
                  </span>
                </div>
                <div className="col-span-8 truncate font-mono flex items-center justify-between">
                  <span className="truncate">{log.message}</span>
                  {(isError || isException) && (
                    <span className="text-[10px] text-sky-400 opacity-80 shrink-0 ml-2">
                      [点击查看 Evidence]
                    </span>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center text-xs text-theme-muted font-mono space-y-1">
            <div>暂无控制台日志</div>
            <div className="text-[10px] text-theme-muted/60">
              {logs.length === 0 ? "Unity 编辑器尚未产生输出" : "无匹配筛选条件的日志"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
