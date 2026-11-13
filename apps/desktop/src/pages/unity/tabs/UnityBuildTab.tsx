import React, { useState } from "react";
import {
  PackageCheck,
  Play,
  RotateCcw,
  CheckCircle2,
  Clock,
  AlertCircle,
  Send,
} from "lucide-react";
import type { BuildTimelineNode, BuildTimelineStepId } from "../types.js";

interface UnityBuildTabProps {
  timeline: BuildTimelineNode[];
  isConnected: boolean;
  onTriggerBuild: () => void;
  onTriggerRelease: () => void;
  onTriggerRollback: () => void;
}

export const UnityBuildTab: React.FC<UnityBuildTabProps> = ({
  timeline,
  isConnected,
  onTriggerBuild,
  onTriggerRelease,
  onTriggerRollback,
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<BuildTimelineStepId>("build");

  const selectedNode = timeline.find((n) => n.id === selectedNodeId) || timeline[0];

  const getNodeIcon = (status: string) => {
    switch (status) {
      case "SUCCESS":
      case "VERIFIED":
      case "RELEASED":
      case "HEALTHY":
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case "BUILDING":
        return <Clock className="w-4 h-4 text-sky-500 animate-spin" />;
      case "FAILED":
        return <AlertCircle className="w-4 h-4 text-rose-500" />;
      case "AVAILABLE":
        return <RotateCcw className="w-4 h-4 text-sky-400" />;
      case "IDLE":
      default:
        return <span className="w-2.5 h-2.5 rounded-full border border-theme-muted bg-theme-base" />;
    }
  };

  const getNodeStatusBadge = (status: string) => {
    switch (status) {
      case "SUCCESS":
      case "VERIFIED":
      case "RELEASED":
      case "HEALTHY":
        return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "BUILDING":
        return "bg-sky-500/10 text-sky-400 border-sky-500/20 animate-pulse";
      case "FAILED":
        return "bg-rose-500/10 text-rose-500 border-rose-500/20";
      case "AVAILABLE":
        return "bg-sky-500/10 text-sky-400 border-sky-500/20";
      case "IDLE":
      default:
        return "bg-theme-card text-theme-muted border-theme-subtle";
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base overflow-hidden font-mono text-xs">
      {/* 1. Header Toolbar */}
      <div className="h-12 px-6 border-b border-theme-subtle bg-theme-sidebar/40 flex items-center justify-between select-none shrink-0">
        <div className="flex items-center gap-2 font-semibold text-theme-primary">
          <PackageCheck className="w-4 h-4 text-sky-400" />
          <span>P5 Production Lifecycle Timeline</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!isConnected}
            onClick={onTriggerBuild}
            className="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-40"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>执行构建</span>
          </button>

          <button
            type="button"
            disabled={!isConnected}
            onClick={onTriggerRelease}
            className="px-3 py-1 bg-theme-card hover:bg-theme-card-hover text-theme-primary border border-theme-subtle rounded text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-40"
          >
            <Send className="w-3.5 h-3.5 text-sky-400" />
            <span>创建发布</span>
          </button>

          <button
            type="button"
            disabled={!isConnected}
            onClick={onTriggerRollback}
            className="px-3 py-1 bg-theme-card hover:bg-theme-card-hover text-amber-400 border border-theme-subtle rounded text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>受控回滚</span>
          </button>
        </div>
      </div>

      {/* 2. Main Timeline Split View */}
      <div className="flex-1 flex min-h-0 overflow-hidden p-6 gap-6">
        {/* Left: Vertical Lifecycle Timeline */}
        <div className="w-80 flex flex-col shrink-0 border border-theme-subtle rounded-xl bg-theme-sidebar/30 p-4 overflow-y-auto">
          <div className="text-[11px] font-semibold text-theme-muted uppercase tracking-wider mb-4 pb-2 border-b border-theme-subtle">
            Lifecycle Sequence
          </div>

          <div className="relative pl-3 space-y-6">
            {/* Vertical connector line */}
            <div className="absolute left-[19px] top-3 bottom-3 w-0.5 bg-theme-subtle" />

            {timeline.map((node) => {
              const isSelected = selectedNode?.id === node.id;
              return (
                <div
                  key={node.id}
                  onClick={() => setSelectedNodeId(node.id)}
                  className={`relative flex items-start gap-3.5 cursor-pointer p-2 rounded-lg transition ${
                    isSelected
                      ? "bg-theme-card border border-sky-500/30 shadow-xs"
                      : "hover:bg-theme-card/40 border border-transparent"
                  }`}
                >
                  {/* Step status dot */}
                  <div className="relative z-10 bg-theme-base rounded-full p-1 border border-theme-subtle shrink-0">
                    {getNodeIcon(node.status)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-semibold text-xs truncate ${isSelected ? "text-sky-400" : "text-theme-primary"}`}>
                        {node.label}
                      </span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${getNodeStatusBadge(node.status)}`}>
                        {node.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-theme-muted truncate mt-0.5">
                      {node.summary}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Step Detailed Inspection Panel */}
        <div className="flex-1 border border-theme-subtle rounded-xl bg-theme-card/30 p-6 flex flex-col overflow-y-auto">
          {selectedNode ? (
            <div className="space-y-4 max-w-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-theme-subtle">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-theme-card rounded border border-theme-subtle">
                    {getNodeIcon(selectedNode.status)}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-theme-primary">{selectedNode.label} Inspection</h3>
                    <div className="text-xs text-theme-muted">{selectedNode.summary}</div>
                  </div>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded border font-mono ${getNodeStatusBadge(selectedNode.status)}`}>
                  {selectedNode.status}
                </span>
              </div>

              {/* Node Details Fields */}
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-theme-muted uppercase tracking-wider">
                  Node Configuration & Evidence
                </div>

                {Object.keys(selectedNode.details).length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(selectedNode.details).map(([k, v]) => (
                      <div
                        key={k}
                        className="bg-theme-base/60 p-2.5 rounded border border-theme-subtle flex flex-col gap-1"
                      >
                        <span className="text-[10px] text-theme-muted uppercase">{k}</span>
                        <span className="text-xs font-mono text-theme-primary break-all">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-theme-base/40 p-4 rounded border border-theme-subtle text-center text-theme-muted text-xs">
                    该生命周期节点尚未执行或无详情记录
                  </div>
                )}
              </div>

              {/* Architectural Safety Notice */}
              <div className="p-3 bg-sky-500/5 border border-sky-500/20 rounded-lg text-[11px] text-theme-secondary space-y-1">
                <div className="font-semibold text-sky-400">P5 Lifecycle Controlled Invariant</div>
                <div>
                  所有构建与发布操作严格经过 Action Ledger，产物必须具有独立 64 位 SHA-256 校验和。出现异常时通过受控恢复与回滚链路保障工程状态一致性。
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-theme-muted text-xs">
              请在左侧选择一个生命周期节点查看详情
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
