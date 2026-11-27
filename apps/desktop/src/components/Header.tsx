import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import type {
  McpStatus,
  ApprovalRoutingMode,
  UserExperienceMode,
  FullControlStatusDto,
} from "../types.js";
import { useTranslation } from "../i18n/useTranslation.js";

interface HeaderProps {
  title: string;
  subtitle?: string;
  breadcrumb?: string;
  mcpStatus: McpStatus | null;
  approvalRoutingMode: ApprovalRoutingMode;
  onChangeApprovalRoutingMode: (mode: ApprovalRoutingMode) => Promise<void>;
  onTogglePause: () => void;
  onTriggerEmergencyStop: () => void;
  onRefreshAll: () => void;
  isRefreshing?: boolean;
  serverAvailable: boolean;
  lastSuccessfulRefresh: number | null;
  uxMode?: UserExperienceMode;
  fullControlStatus?: FullControlStatusDto | null;
  onOpenFullControl?: () => void;
  onStopFullControl?: () => void;
  activeRunningCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  breadcrumb,
  mcpStatus,
  onTriggerEmergencyStop,
  onRefreshAll,
  isRefreshing,
  serverAvailable,
  fullControlStatus,
  onStopFullControl,
  activeRunningCount = 0,
}) => {
  const { tText } = useTranslation();
  const isPaused = mcpStatus?.paused ?? false;
  const hasActiveTasks = activeRunningCount > 0;
  const [showEmergencyTip, setShowEmergencyTip] = useState(false);
  const tipTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (tipTimerRef.current !== null) window.clearTimeout(tipTimerRef.current);
    };
  }, []);

  const handleTipMouseEnter = () => {
    if (tipTimerRef.current !== null) window.clearTimeout(tipTimerRef.current);
    tipTimerRef.current = window.setTimeout(() => setShowEmergencyTip(true), 350);
  };

  const handleTipMouseLeave = () => {
    if (tipTimerRef.current !== null) {
      window.clearTimeout(tipTimerRef.current);
      tipTimerRef.current = null;
    }
    setShowEmergencyTip(false);
  };

  const emergencyAriaLabel = tText(
    "紧急停止 (Emergency Halt)",
    "Emergency Halt",
    "緊急停止 (Emergency Halt)",
    "Not-Halt (Emergency Halt)"
  );

  const emergencyTooltipText = hasActiveTasks
    ? tText(
        `紧急停止 (Emergency Halt) — ${activeRunningCount} 个任务运行中`,
        `Emergency Halt — ${activeRunningCount} actions running`,
        `緊急停止 (Emergency Halt) — ${activeRunningCount} 件の操作を実行中`,
        `Not-Halt (Emergency Halt) — ${activeRunningCount} aktive Aktionen`
      )
    : tText(
        "紧急停止 (Emergency Halt) — 停止所有运行中的操作",
        "Emergency Halt — stops all running actions",
        "緊急停止 (Emergency Halt) — 実行中の操作をすべて停止",
        "Not-Halt (Emergency Halt) — stoppt alle laufenden Aktionen"
      );

  return (
    <header className="h-14 px-6 bg-theme-header border-b border-theme-subtle flex items-center justify-between select-none shrink-0 z-10">
      {/* Left: Breadcrumbs & View Title */}
      <div className="flex items-center gap-2.5 min-w-0">
        {breadcrumb && (
          <>
            <span className="text-xs font-mono uppercase tracking-wider text-theme-secondary">
              {breadcrumb}
            </span>
            <span className="text-theme-secondary/50 text-xs">/</span>
          </>
        )}
        <h1 className="text-sm font-semibold text-theme-primary truncate">
          {title}
        </h1>
        {subtitle && (
          <span className="hidden xl:inline text-xs text-theme-secondary truncate pl-2 border-l border-theme-subtle">
            {subtitle}
          </span>
        )}
      </div>

      {/* Right: Status Pill & Emergency Action */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Full Control Active Notice */}
        {fullControlStatus?.enabled && fullControlStatus.activeSession && (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-mono bg-[var(--btn-primary-bg)]/10 border border-theme-subtle text-[var(--warning)]">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>
              {tText(
                "完全控制生效中",
                "Full Control Active",
                "フルコントロール有効",
                "Vollzugriff aktiv"
              )}
            </span>
            {onStopFullControl && (
              <button
                onClick={onStopFullControl}
                className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--btn-primary-bg)]/20 hover:bg-[var(--btn-primary-bg)]/30 text-[var(--warning)] border border-theme-subtle transition"
              >
                {tText("停止", "Stop", "停止", "Stopp")}
              </button>
            )}
          </div>
        )}

        {/* Global Connection Status */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono border border-[var(--border-default)] bg-transparent">
          <span
            className={
              !serverAvailable || isPaused
                ? "text-[var(--warning)]"
                : "text-[var(--success)]"
            }
            aria-hidden="true"
          >
            {!serverAvailable || isPaused ? "△" : "✓"}
          </span>
          <span
            className={
              !serverAvailable || isPaused
                ? "text-[var(--warning)]"
                : "text-[var(--success)]"
            }
          >
            {!serverAvailable
              ? tText("服务离线", "Offline", "オフライン", "Offline")
              : isPaused
              ? tText("AI 已暂停", "AI Paused", "AI一時停止中", "KI pausiert")
              : tText(
                  "服务已连接",
                  "Engine Connected",
                  "接続完了",
                  "Dienst verbunden"
                )}
          </span>
        </div>

        {/* Manual Refresh Button */}
        <button
          onClick={onRefreshAll}
          disabled={isRefreshing}
          title={tText(
            "刷新系统状态",
            "Refresh Status",
            "システム状態を更新",
            "Status aktualisieren"
          )}
          className="p-1.5 rounded-md text-theme-secondary hover:text-theme-primary hover:bg-theme-card border border-theme-subtle transition disabled:opacity-40 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
        </button>

        {/* Emergency Stop Button */}
        <div className="relative">
          <button
            type="button"
            onClick={onTriggerEmergencyStop}
            onMouseEnter={handleTipMouseEnter}
            onMouseLeave={handleTipMouseLeave}
            onFocus={() => setShowEmergencyTip(true)}
            onBlur={() => setShowEmergencyTip(false)}
            aria-label={emergencyAriaLabel}
            className={`w-8 h-8 rounded-lg flex items-center justify-center border transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#DC2626]/40 ${
              hasActiveTasks
                ? "bg-[#DC2626] hover:bg-[#B91C1C] border-[#DC2626] text-white shadow-sm"
                : "bg-transparent border-[#DC2626]/75 text-[#DC2626] hover:bg-[#DC2626]/10"
            }`}
          >
            <AlertCircle className="w-4 h-4 stroke-[2.2]" />
          </button>

          {showEmergencyTip && (
            <div
              role="tooltip"
              className="absolute right-0 top-full mt-2 z-[150] whitespace-nowrap px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-theme-card text-theme-primary border border-theme-subtle shadow-lg pointer-events-none"
            >
              {emergencyTooltipText}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
