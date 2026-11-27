import React, { useState, useEffect } from "react";
import {
  FolderLock,
  Plus,
  Radio,
  Server,
  Cpu,
  ShieldCheck,
  ChevronRight,
  Brain,
  Sparkles,
  ShieldAlert,
  Zap,
} from "lucide-react";
import type {
  ServerStatus,
  McpStatus,
  TunnelStatusDto,
  Project,
  Approval,
  Job,
  IntelligenceStatusDto,
  UserExperienceMode,
  FullControlStatusDto,
} from "../types.js";
import { bridge } from "../api/bridge.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { ApprovalCard } from "../components/ApprovalCard.js";

interface ControlPageProps {
  serverStatus: ServerStatus | null;
  mcpStatus: McpStatus | null;
  tunnelStatus: TunnelStatusDto | null;
  projects: Project[];
  approvals: Approval[];
  jobs: Job[];
  onNavigate: (page: any) => void;
  onSelectProject: (projectId: string) => void;
  onOpenAuthorizeModal: () => void;
  onOpenCreateTokenModal: () => void;
  onOpenEmergencyStopModal: () => void;
  onQuickResolveApproval: (id: string, action: "approve" | "deny") => Promise<void>;
  uxMode?: UserExperienceMode;
  fullControlStatus?: FullControlStatusDto | null;
  onRefresh?: () => Promise<void> | void;
  onOpenFullControlModal?: () => void;
}

// Project summary card for the Recent Work section
const RecentProjectCard: React.FC<{
  project: Project;
  onOpen: () => void;
  isAdvanced?: boolean;
}> = ({ project, onOpen }) => {
  const { t } = useTranslation();

  return (
    <div
      onClick={onOpen}
      className="p-4 rounded-xl bg-theme-card border border-theme-subtle hover:border-theme-strong transition-all duration-150 cursor-pointer group  flex items-center justify-between gap-4"
    >
      <div className="space-y-1 min-w-0">
        <div className="flex items-center gap-2.5">
          <span className="font-semibold text-theme-primary text-sm tracking-tight group-hover:text-theme-primary dark:group-hover:text-theme-primary transition-colors truncate">
            {project.name}
          </span>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
              project.enabled
                ? "bg-[var(--btn-primary-bg)]/10 text-[var(--success)] text-[var(--success)] border border-theme-subtle"
                : "bg-[var(--btn-primary-bg)]/10 text-[var(--warning)] text-[var(--warning)] border border-theme-subtle"
            }`}
          >
            {project.enabled
              ? (t.control?.statusAuthorized || "AUTHORIZED")
              : (t.control?.statusDisabled || "DISABLED")}
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-theme-card-muted text-theme-muted border border-theme-subtle">
            {project.accessMode === "read-write" ? "RW" : "RO"}
          </span>
        </div>
        <div className="text-xs text-theme-muted font-mono truncate max-w-lg">
          {project.root}
        </div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-theme-muted group-hover:text-theme-primary bg-theme-card-muted group-hover:bg-theme-card-hover border border-theme-subtle transition shrink-0"
      >
        <span>{t.control?.openProject || "Open"}</span>
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export const ControlPage: React.FC<ControlPageProps> = ({
  serverStatus,
  mcpStatus,
  tunnelStatus,
  projects,
  approvals,
  jobs,
  onNavigate,
  onSelectProject,
  onOpenAuthorizeModal,
  onOpenCreateTokenModal,
  onOpenEmergencyStopModal,
  onQuickResolveApproval,
  uxMode = "standard",
  fullControlStatus,
  onRefresh,
  onOpenFullControlModal,
}) => {
  const { t } = useTranslation();
  const isAdvanced = uxMode === "advanced";
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [intelStatus, setIntelStatus] = useState<IntelligenceStatusDto | null>(null);

  useEffect(() => {
    bridge.getIntelligenceStatus().then(setIntelStatus).catch(() => {});
  }, []);

  const pendingApprovals = approvals.filter((a) => a.status === "pending");
  const isTunnelConnected =
    tunnelStatus?.status === "Connected" ||
    tunnelStatus?.control_plane_connected === true;

  const handleApprove = async (id: string) => {
    setResolvingId(id);
    try {
      await onQuickResolveApproval(id, "approve");
    } finally {
      setResolvingId(null);
    }
  };

  const handleDeny = async (id: string) => {
    setResolvingId(id);
    try {
      await onQuickResolveApproval(id, "deny");
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto select-none">
      {/* Full Control Active Banner */}
      {fullControlStatus?.activeSession && (
        <section className="p-4 rounded-xl bg-[var(--btn-primary-bg)]/10 border-2 border-theme-subtle border-theme-subtle text-[var(--warning)] text-[var(--warning)]  space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-[var(--btn-primary-bg)]/20 text-[var(--warning)] text-[var(--warning)]">
                <ShieldAlert className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-[var(--warning)] text-[var(--warning)]">
                    完全控制模式进行中 (Full Control Active)
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--btn-primary-bg)]/20 text-[var(--warning)] text-[var(--warning)] font-semibold border border-theme-subtle">
                    {fullControlStatus.activeSession.scope === "device" ? "整台设备 (Device-Wide)" : "当前项目 (Project-Scoped)"}
                  </span>
                </div>
                <p className="text-xs text-[var(--warning)]/80 text-[var(--warning)]/80">
                  AI 客户端已获临时完全控制权，允许执行二进制删除、递归目录清理与自动化本地文件系统操作。
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                onClick={async () => {
                  if (fullControlStatus.activeSession?.id) {
                    await bridge.stopFullControl(fullControlStatus.activeSession.id);
                    if (onRefresh) await onRefresh();
                  }
                }}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--btn-primary-bg)] hover:opacity-90 text-[var(--btn-primary-text)] transition "
              >
                立即恢复安全模式
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-theme-subtle text-xs font-mono">
            <div>
              <span className="text-[var(--warning)]/70 text-[var(--warning)]/70 text-[10px] block">授权客户端</span>
              <span className="font-semibold text-[var(--warning)] text-[var(--warning)] truncate block">
                {fullControlStatus.activeSession.clientName || fullControlStatus.activeSession.clientId}
              </span>
            </div>
            <div>
              <span className="text-[var(--warning)]/70 text-[var(--warning)]/70 text-[10px] block">目标范围</span>
              <span className="truncate block font-semibold text-[var(--warning)] text-[var(--warning)]">
                {fullControlStatus.activeSession.scope === "device"
                  ? "整台设备本地存储"
                  : fullControlStatus.activeSession.projectName || fullControlStatus.activeSession.projectId || "当前项目"}
              </span>
            </div>
            <div>
              <span className="text-[var(--warning)]/70 text-[var(--warning)]/70 text-[10px] block">生效时间</span>
              <span className="text-[var(--warning)] text-[var(--warning)]">
                {new Date(fullControlStatus.activeSession.startedAt).toLocaleTimeString()}
              </span>
            </div>
            <div>
              <span className="text-[var(--warning)]/70 text-[var(--warning)]/70 text-[10px] block">自动失效</span>
              <span className="text-[var(--warning)] text-[var(--warning)]">
                {fullControlStatus.activeSession.expiresAt
                  ? `预计 ${new Date(fullControlStatus.activeSession.expiresAt).toLocaleTimeString()}`
                  : "手动关闭为止"}
              </span>
            </div>
          </div>
        </section>
      )}
      {/* ================= STANDARD MODE TOP HERO ================= */}
      {!isAdvanced ? (
        <section className="space-y-6">
          {/* Greeting & Subtitle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-bold text-theme-primary tracking-tight">
                  {t.overview?.greetingReady || "Nexus is ready"}
                </h1>
                {intelStatus?.provider === "laya" && intelStatus?.status === "ready" && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[var(--btn-primary-bg)]/10 text-theme-primary text-theme-primary border border-theme-subtle">
                    <Brain className="w-3 h-3 text-theme-primary" />
                    <span>Laya · {t.intelligence?.advisoryOnly || "Advisory Only"}</span>
                  </span>
                )}
              </div>
              <p className="text-sm text-theme-muted">
                {t.overview?.greetingSubtitle || "Your local AI environment is ready to assist."}
              </p>
            </div>

            {/* Primary Action Button */}
            <div>
              {projects.length > 0 ? (
                <button
                  onClick={() => onSelectProject(projects[0].id)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-[var(--btn-primary-bg)] hover:opacity-90 text-[var(--btn-primary-text)] transition "
                >
                  <span>{t.overview?.primaryCtaOpen || "Open Project"}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={onOpenAuthorizeModal}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-[var(--btn-primary-bg)] hover:opacity-90 text-[var(--btn-primary-text)] transition "
                >
                  <Plus className="w-4 h-4" />
                  <span>{t.overview?.primaryCtaAuthorize || "Authorize Project"}</span>
                </button>
              )}
            </div>
          </div>

          {/* 3 Core Questions Status Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* 1. Current Project */}
            <div className="p-4 rounded-xl bg-theme-card border border-theme-subtle flex items-center justify-between">
              <div className="space-y-1 min-w-0">
                <div className="text-[11px] font-mono uppercase tracking-wider text-theme-muted">
                  {t.overview?.currentProjectTitle || "Current Project"}
                </div>
                <div className="text-sm font-semibold text-theme-primary truncate">
                  {projects.length > 0 ? projects[0].name : (t.overview?.noProjectSelected || "No Project Selected")}
                </div>
                <div className="text-xs text-theme-muted truncate">
                  {projects.length > 0 ? (t.control?.statusAuthorized || "Authorized") : (t.control?.authorizeProject || "Authorize a directory")}
                </div>
              </div>
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${projects.length > 0 ? "bg-[var(--btn-primary-bg)]" : "bg-[var(--btn-primary-bg)]"}`} />
            </div>

            {/* 2. ChatGPT Connection */}
            <div className="p-4 rounded-xl bg-theme-card border border-theme-subtle flex items-center justify-between">
              <div className="space-y-1 min-w-0">
                <div className="text-[11px] font-mono uppercase tracking-wider text-theme-muted">
                  {t.overview?.chatGptConnectionTitle || "ChatGPT Connection"}
                </div>
                <div className="text-sm font-semibold text-theme-primary truncate">
                  ChatGPT
                </div>
                <div className="text-xs text-theme-muted truncate">
                  {isTunnelConnected || (mcpStatus?.mcpActive && !mcpStatus?.paused)
                    ? (t.overview?.aiConnected || "Connected")
                    : (t.overview?.aiDisconnected || "Standby")}
                </div>
              </div>
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isTunnelConnected || (mcpStatus?.mcpActive && !mcpStatus?.paused) ? "bg-[var(--btn-primary-bg)]" : "bg-slate-400 dark:bg-slate-600"}`} />
            </div>

            {/* 3. Nexus Services */}
            <div className="p-4 rounded-xl bg-theme-card border border-theme-subtle flex items-center justify-between">
              <div className="space-y-1 min-w-0">
                <div className="text-[11px] font-mono uppercase tracking-wider text-theme-muted">
                  {t.overview?.localServicesTitle || "Nexus Services"}
                </div>
                <div className="text-sm font-semibold text-theme-primary truncate">
                  {serverStatus ? (t.overview?.localServicesHealthy || "Running smoothly") : (t.control?.serverOffline || "Offline")}
                </div>
                <div className="text-xs text-theme-muted truncate font-mono">
                  127.0.0.1:18080 · Safe Sandbox
                </div>
              </div>
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${serverStatus ? "bg-[var(--btn-primary-bg)]" : "bg-[var(--btn-primary-bg)]"}`} />
            </div>
          </div>

          {/* 1-2-3 Getting Started Guide */}
          <div className="p-5 rounded-xl bg-theme-card border border-theme-subtle space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-theme-primary" />
              <h2 className="text-xs font-mono uppercase tracking-wider text-theme-primary font-semibold">
                {t.overview?.gettingStartedTitle || "Getting Started"}
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-theme-card-muted border border-theme-subtle">
                <div className="w-6 h-6 rounded-full bg-[var(--btn-primary-bg)]/15 text-theme-primary text-theme-primary flex items-center justify-center text-xs font-bold shrink-0">
                  1
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-theme-primary">
                    {t.overview?.step1GuideTitle || "Authorize a Project"}
                  </div>
                  <div className="text-[11px] text-theme-muted leading-relaxed">
                    {t.overview?.step1GuideDesc || "Choose a local folder and assign access permissions."}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-theme-card-muted border border-theme-subtle">
                <div className="w-6 h-6 rounded-full bg-[var(--btn-primary-bg)]/15 text-theme-primary text-theme-primary flex items-center justify-center text-xs font-bold shrink-0">
                  2
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-theme-primary">
                    {t.overview?.step2GuideTitle || "Connect AI"}
                  </div>
                  <div className="text-[11px] text-theme-muted leading-relaxed">
                    {t.overview?.step2GuideDesc || "Pair ChatGPT or remote agent securely through controlled tunnel."}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-theme-card-muted border border-theme-subtle">
                <div className="w-6 h-6 rounded-full bg-[var(--btn-primary-bg)]/15 text-theme-primary text-theme-primary flex items-center justify-center text-xs font-bold shrink-0">
                  3
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-theme-primary">
                    {t.overview?.step3GuideTitle || "Start Working"}
                  </div>
                  <div className="text-[11px] text-theme-muted leading-relaxed">
                    {t.overview?.step3GuideDesc || "Let AI search code safely while sensitive actions require confirmation."}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        /* ================= ADVANCED MODE TOP 5-CARD COCKPIT ================= */
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Tunnel Card */}
          <div className="p-3.5 rounded-xl bg-theme-card border border-theme-subtle flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted flex items-center gap-1.5">
                <Radio className="w-3 h-3 text-theme-primary" />
                <span>{t.control?.secureTunnel || "Secure Tunnel"}</span>
              </div>
              <div className="text-xs font-semibold text-theme-primary">
                {isTunnelConnected
                  ? (t.control?.tunnelConnected || "Connected")
                  : (t.control?.tunnelStandby || "Standby")}
              </div>
              <div className="text-[10px] font-mono text-theme-muted">
                {tunnelStatus?.network_mode === "custom"
                  ? (t.control?.proxyCustom || "Custom Proxy")
                  : tunnelStatus?.network_mode === "direct"
                    ? (t.control?.proxyDirect || "Direct")
                    : (t.control?.proxySystem || "System Proxy")}
              </div>
            </div>
            <span
              className={`w-2 h-2 rounded-full ${
                isTunnelConnected ? "bg-[var(--btn-primary-bg)]" : "bg-slate-400 dark:bg-slate-500"
              }`}
            />
          </div>

          {/* Control Plane Card */}
          <div className="p-3.5 rounded-xl bg-theme-card border border-theme-subtle flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted flex items-center gap-1.5">
                <Server className="w-3 h-3 text-theme-muted" />
                <span>{t.control?.controlPlane || "Control Plane"}</span>
              </div>
              <div className="text-xs font-semibold text-theme-primary">
                {serverStatus
                  ? (t.control?.serverOnline || "Online")
                  : (t.control?.serverOffline || "Offline")}
              </div>
              <div className="text-[10px] font-mono text-theme-muted">
                127.0.0.1:18080
              </div>
            </div>
            <span
              className={`w-2 h-2 rounded-full ${
                serverStatus ? "bg-[var(--btn-primary-bg)]" : "bg-[var(--btn-primary-bg)]"
              }`}
            />
          </div>

          {/* Runner Card */}
          <div className="p-3.5 rounded-xl bg-theme-card border border-theme-subtle flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted flex items-center gap-1.5">
                <Cpu className="w-3 h-3 text-theme-muted" />
                <span>{t.control?.localRunner || "Local Runner"}</span>
              </div>
              <div className="text-xs font-semibold text-theme-primary">
                {serverStatus?.runners_connected || 0} {t.control?.runnerConnected || "Connected"}
              </div>
              <div className="text-[10px] font-mono text-theme-muted">
                Node v{serverStatus?.version || "1.4.1"}
              </div>
            </div>
            <span
              className={`w-2 h-2 rounded-full ${
                (serverStatus?.runners_connected || 0) > 0
                  ? "bg-[var(--btn-primary-bg)]"
                  : "bg-[var(--btn-primary-bg)]"
              }`}
            />
          </div>

          {/* MCP Card */}
          <div className="p-3.5 rounded-xl bg-theme-card border border-theme-subtle flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3 text-theme-muted" />
                <span>{t.control?.mcpProtocol || "MCP Protocol"}</span>
              </div>
              <div className="text-xs font-semibold text-theme-primary">
                {mcpStatus?.paused
                  ? (t.control?.mcpPaused || "Execution Paused")
                  : `${mcpStatus?.toolsCount ?? 332} ${t.control?.mcpToolsActive || "Tools Active"}`}
              </div>
              <div className="text-[10px] font-mono text-theme-muted">
                v{mcpStatus?.protocolVersion || "2024-11-05"}
              </div>
            </div>
            <span
              className={`w-2 h-2 rounded-full ${
                mcpStatus?.paused
                  ? "bg-[var(--btn-primary-bg)]"
                  : mcpStatus?.mcpActive
                    ? "bg-[var(--btn-primary-bg)]"
                    : "bg-[var(--btn-primary-bg)]"
              }`}
            />
          </div>

          {/* Decision Intelligence (Laya) Compact Card */}
          <div className="p-3.5 rounded-xl bg-theme-card border border-theme-subtle flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted flex items-center gap-1.5">
                <Brain className="w-3 h-3 text-theme-primary" />
                <span>{t.control?.intelligencePill || "Decision Intelligence"}</span>
              </div>
              <div className="text-xs font-semibold text-theme-primary">
                {intelStatus?.provider === "laya" && intelStatus?.status === "ready"
                  ? `Laya · ${t.control?.intelligenceReady || "Ready"}`
                  : intelStatus?.provider === "laya"
                    ? `Laya · ${t.intelligence?.statusLoading || "Loading"}`
                    : (t.control?.intelligenceDisabled || "Disabled")}
              </div>
              <div className="text-[10px] font-mono text-theme-muted truncate max-w-[120px]">
                {(intelStatus?.latencyMs || intelStatus?.inferenceTimeMs) ? `${intelStatus.latencyMs || intelStatus.inferenceTimeMs}ms` : "mmBERT-base"}
              </div>
            </div>
            <span
              className={`w-2 h-2 rounded-full ${
                intelStatus?.status === "ready"
                  ? "bg-[var(--btn-primary-bg)]"
                  : intelStatus?.status === "loading"
                    ? "bg-[var(--btn-primary-bg)] animate-pulse"
                    : "bg-slate-400 dark:bg-slate-600"
              }`}
            />
          </div>
        </section>
      )}

      {/* Pending Approvals Banner (If any) */}
      {pendingApprovals.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--btn-primary-bg)] animate-pulse" />
              <h2 className="text-xs font-mono uppercase tracking-wider text-[var(--warning)] text-[var(--warning)] font-semibold">
                {t.control?.pendingApprovals || "Pending Operator Approvals"} ({pendingApprovals.length})
              </h2>
            </div>
            <button
              onClick={() => onNavigate("activity")}
              className="text-xs text-theme-muted hover:text-theme-primary transition"
            >
              {t.control?.viewInActivity || "View in Activity timeline ›"}
            </button>
          </div>

          <div className="space-y-2">
            {pendingApprovals.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                projectName={
                  projects.find((p) => p.id === approval.projectId)?.name
                }
                onApprove={handleApprove}
                onDeny={handleDeny}
                isProcessing={resolvingId === approval.id}
              />
            ))}
          </div>
        </section>
      )}


      {/* Recent Work (最近工作区) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-theme-primary tracking-tight">
              {isAdvanced ? (t.control?.recentWork || "Recent Work") : (t.overview?.recentWorkTitle || "Recent Work")}
            </h2>
            <p className="text-xs text-theme-muted">
              {isAdvanced
                ? (t.control?.recentWorkDesc || "Live status across authorized projects, active runtimes, workflows, and code intelligence.")
                : (t.projects?.subtitle || "Manage authorized workspace directories for AI collaboration.")}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenAuthorizeModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-theme-card hover:bg-theme-card-hover text-theme-primary border border-theme-subtle transition "
            >
              <Plus className="w-3.5 h-3.5 text-theme-primary" />
              <span>{t.control?.authorizeProject || "Authorize Project"}</span>
            </button>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="p-10 rounded-xl bg-theme-card border border-theme-subtle text-center space-y-3 ">
            <FolderLock className="w-8 h-8 text-theme-muted mx-auto" />
            <div className="text-sm font-medium text-theme-primary">
              {t.control?.noAuthorizedProjects || "No Authorized Projects"}
            </div>
            <p className="text-xs text-theme-muted max-w-sm mx-auto">
              {t.control?.noAuthorizedProjectsDesc ||
                "Authorize a local project directory so ChatGPT and the local MCP runner can inspect code, run tests, and manage persistent runtimes safely."}
            </p>
            <button
              onClick={onOpenAuthorizeModal}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--btn-primary-bg)] hover:opacity-90 text-[var(--btn-primary-text)] transition "
            >
              {t.control?.authorizeFirstProject || "Authorize First Project"}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {projects.map((project) => (
              <RecentProjectCard
                key={project.id}
                project={project}
                onOpen={() => onSelectProject(project.id)}
                isAdvanced={isAdvanced}
              />
            ))}
          </div>
        )}
      </section>

      {/* Quick Actions Footer Strip (Advanced Mode: Full, Standard Mode: Minimal) */}
      {isAdvanced ? (
        <section className="pt-4 border-t border-theme-subtle flex items-center justify-between flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenCreateTokenModal}
              className="text-theme-muted hover:text-theme-secondary transition font-mono text-[11px]"
            >
              {t.control?.generateToken || "+ Generate Token"}
            </button>
            <span className="text-theme-muted/30">|</span>
            <button
              onClick={() => onNavigate("settings")}
              className="text-theme-muted hover:text-theme-secondary transition font-mono text-[11px]"
            >
              {t.control?.tunnelOutboundSettings || "Tunnel & Outbound Settings"}
            </button>
            <span className="text-theme-muted/30">|</span>
            <button
              onClick={() => onNavigate("activity")}
              className="text-theme-muted hover:text-theme-secondary transition font-mono text-[11px]"
            >
              {t.control?.auditLog || "Audit Log"} ({jobs.length} {t.control?.jobsExecuted || "jobs executed"})
            </button>
            {onOpenFullControlModal && (
              <>
                <span className="text-theme-muted/30">|</span>
                <button
                  onClick={onOpenFullControlModal}
                  className="text-[var(--warning)] text-[var(--warning)] hover:text-[var(--warning)] font-mono text-[11px] transition flex items-center gap-1"
                >
                  <Zap className="w-3 h-3" />
                  <span>完全控制模式</span>
                </button>
              </>
            )}
          </div>

          <button
            onClick={onOpenEmergencyStopModal}
            className="text-[var(--warning)] hover:text-[var(--warning)] text-[var(--warning)] dark:hover:text-[var(--warning)] font-mono text-[11px] transition"
          >
            {t.control?.emergencyHaltAll || "Emergency Halt All"}
          </button>
        </section>
      ) : (
        <section className="pt-4 border-t border-theme-subtle flex items-center justify-between flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate("activity")}
              className="text-theme-muted hover:text-theme-secondary transition text-xs"
            >
              {t.control?.auditLog || "Activity & Audit"}
            </button>
            <span className="text-theme-muted/30">|</span>
            <button
              onClick={() => onNavigate("settings")}
              className="text-theme-muted hover:text-theme-secondary transition text-xs"
            >
              {t.settings?.title || "Settings"}
            </button>
          </div>

          <span className="text-theme-muted text-[11px]">
            Nexus v{serverStatus?.version || "1.4.1"} · Standard Mode
          </span>
        </section>
      )}
    </div>
  );
};

