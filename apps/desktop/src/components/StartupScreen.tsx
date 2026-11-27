import React from "react";
import nexusLogo from "../assets/nexus.png";
import {
  Loader2,
  AlertOctagon,
  RefreshCw,
  FolderOpen,
  LogOut,
  Server,
  Cpu,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import type { StartupDiagnostics } from "../types.js";

interface StartupScreenProps {
  isTimeout: boolean;
  startupError: string | null;
  serverReady: boolean;
  runnerReady: boolean;
  mcpReady: boolean;
  diagnostics: StartupDiagnostics | null;
  onRetry: () => void;
  onOpenLogs: () => void;
  onQuit: () => void;
}

export const StartupScreen: React.FC<StartupScreenProps> = ({
  isTimeout,
  startupError,
  serverReady,
  runnerReady,
  mcpReady,
  diagnostics,
  onRetry,
  onOpenLogs,
  onQuit,
}) => {
  const isFailed = isTimeout || Boolean(startupError);
  const isZh = (() => {
    try {
      return (
        typeof localStorage !== "undefined" &&
        localStorage.getItem("localbridge_language") === "zh-CN"
      );
    } catch {
      return false;
    }
  })();

  const steps = [
    {
      id: "server",
      title: isZh ? "核心服务引擎 (Core Server)" : "Core Server Engine",
      subtitle: isZh ? "Fastify 127.0.0.1:18080 · 独立进程监控" : "Fastify 127.0.0.1:18080 · Standalone Process",
      icon: Server,
      status: startupError
        ? "failed"
        : serverReady
        ? "ready"
        : "starting",
    },
    {
      id: "runner",
      title: isZh ? "执行中枢节点 (Execution Node)" : "Execution Node",
      subtitle: isZh ? "WebSocket 实时安全执行与调度隧道" : "WebSocket Real-time Dispatch Tunnel",
      icon: Cpu,
      status: startupError
        ? "failed"
        : runnerReady
        ? "ready"
        : serverReady
        ? "starting"
        : "waiting",
    },
    {
      id: "mcp",
      title: isZh ? "安全与桥接工具链 (MCP Tools)" : "MCP Tools & Bridge",
      subtitle: isZh ? "332 项标准化安全与执行元工具" : "332 Canonical & Extended MCP Tools",
      icon: ShieldCheck,
      status: startupError
        ? "failed"
        : mcpReady
        ? "ready"
        : runnerReady
        ? "starting"
        : "waiting",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-app)] text-[var(--text-primary)] font-sans select-none overflow-hidden p-6">
      <div className="relative w-full max-w-xl bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-8">
        {/* Nexus Branding */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <img
              src={nexusLogo}
              alt="Nexus"
              className="w-10 h-10 rounded-xl object-cover border border-[var(--border-subtle)]"
            />
            <div>
              <div className="font-bold text-base tracking-wide flex items-center gap-2 text-[var(--text-primary)]">
                NEXUS CONTROL CENTER
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--bg-surface-raised)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                  v1.4.1
                </span>
              </div>
              <div className="text-xs text-[var(--text-secondary)]">Production Runtime Supervisor</div>
            </div>
          </div>
          <div className="text-right">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full border border-[var(--border-default)] bg-transparent ${
                isFailed
                  ? "text-[var(--warning)]"
                  : "text-[var(--success)]"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isFailed ? "bg-[var(--warning)]" : "bg-[var(--success)]"
                }`}
              />
              {isFailed ? "STARTUP_FAILED" : "BOOTSTRAPPING"}
            </span>
          </div>
        </div>

        {/* Normal Loading View */}
        {!isFailed ? (
          <div className="space-y-6">
            <div className="text-center space-y-1">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">
                {isZh ? "正在启动 Nexus…" : "Starting Nexus Control Center…"}
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                {isZh
                  ? "正在启动并初始化本地服务与运行时，请稍候..."
                  : "Initializing local services, execution node and MCP bridge, please wait..."}
              </p>
            </div>

            {/* Stepper */}
            <div className="space-y-3 bg-[var(--bg-surface-raised)] border border-[var(--border-subtle)] rounded-xl p-4">
              {steps.map((s) => {
                const Icon = s.icon;
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          s.status === "ready"
                            ? "bg-theme-card text-[var(--success)]"
                            : s.status === "starting"
                            ? "bg-theme-card text-theme-primary"
                            : s.status === "failed"
                            ? "bg-theme-card text-[var(--warning)]"
                            : "bg-theme-card text-theme-secondary"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-medium text-theme-primary">
                          {s.title}
                        </div>
                        <div className="text-[11px] text-theme-secondary">
                          {s.subtitle}
                        </div>
                      </div>
                    </div>

                    <div>
                      {s.status === "ready" ? (
                        <div className="flex items-center gap-1.5 text-xs text-[var(--success)] font-mono">
                          <span>✓</span>
                          <span>Ready</span>
                        </div>
                      ) : s.status === "starting" ? (
                        <div className="flex items-center gap-1.5 text-xs text-theme-primary font-mono">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Starting</span>
                        </div>
                      ) : s.status === "failed" ? (
                        <div className="flex items-center gap-1.5 text-xs text-[var(--warning)] font-mono">
                          <span>△</span>
                          <span>Failed</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs text-theme-secondary font-mono">
                          <span>○</span>
                          <span>Waiting</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-center gap-2 text-[11px] font-mono text-theme-secondary">
              <Loader2 className="w-3 h-3 animate-spin text-theme-primary" />
              <span>Checking loopback health at http://127.0.0.1:18080/health...</span>
            </div>
          </div>
        ) : (
          /* Failure View */
          <div className="space-y-6">
            <div className="flex items-start gap-4 p-4 bg-[var(--btn-primary-bg)]/10 border border-theme-subtle rounded-xl">
              <AlertOctagon className="w-6 h-6 text-[var(--warning)] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-[var(--warning)]">
                  {isZh ? "Nexus 启动失败" : "Nexus Startup Failed"}
                </h3>
                <p className="text-xs text-[var(--warning)]/80">
                  {isZh ? "Core Server 未能就绪。" : "Core Server or Runtime could not be initialized."}
                </p>
                {startupError && (
                  <div className="text-[11px] font-mono text-[var(--warning)] mt-2 bg-theme-card p-2 rounded border border-theme-subtle break-all">
                    {startupError}
                  </div>
                )}
              </div>
            </div>

            {/* Diagnostic Details */}
            <div className="space-y-3 bg-[#0d1322]/90 border border-theme-subtle rounded-xl p-4 text-xs font-mono">
              <div className="flex items-center gap-2 text-slate-300 font-semibold mb-2">
                <Terminal className="w-4 h-4 text-theme-primary" />
                <span>{isZh ? "启动诊断信息" : "Startup Diagnostics"}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 py-1 border-b border-theme-subtle">
                <span className="text-theme-secondary">Resource Root:</span>
                <span className="col-span-2 text-slate-200 break-all">
                  {diagnostics?.resource_root || "Not Detected"}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 py-1 border-b border-theme-subtle">
                <span className="text-theme-secondary">Server Exit Code:</span>
                <span className="col-span-2 text-slate-200">
                  {diagnostics?.server_exit_code !== undefined &&
                  diagnostics?.server_exit_code !== null
                    ? diagnostics.server_exit_code
                    : "None (Active or failed to launch)"}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 py-1 border-b border-theme-subtle">
                <span className="text-theme-secondary">Port State:</span>
                <span className="col-span-2 text-slate-200">
                  {diagnostics?.port_state || "127.0.0.1:18080 (UNKNOWN)"}
                </span>
              </div>

              {diagnostics?.last_stderr && (
                <div className="pt-2">
                  <div className="text-theme-secondary mb-1">Last stderr:</div>
                  <pre className="bg-[var(--bg-app)] p-2.5 rounded border border-theme-subtle text-[11px] text-[var(--warning)] max-h-32 overflow-y-auto whitespace-pre-wrap font-mono">
                    {diagnostics.last_stderr}
                  </pre>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={onRetry}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--btn-primary-bg)] hover:opacity-90 text-[var(--btn-primary-text)] rounded-lg text-xs font-medium transition  "
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{isZh ? "重试" : "Retry"}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenLogs}
                  className="flex items-center gap-2 px-3.5 py-2 bg-theme-card hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition border border-theme-subtle"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>{isZh ? "查看日志" : "View Logs"}</span>
                </button>
                <button
                  type="button"
                  onClick={onQuit}
                  className="flex items-center gap-2 px-3.5 py-2 bg-theme-card hover:bg-theme-card text-[var(--warning)] rounded-lg text-xs font-medium transition border border-theme-subtle"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{isZh ? "退出 Nexus" : "Quit"}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
