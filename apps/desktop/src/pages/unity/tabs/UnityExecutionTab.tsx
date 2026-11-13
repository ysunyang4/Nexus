import React, { useState } from "react";
import {
  History,
  ShieldCheck,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import type { UnityLedgerActionItem, UnityEvidenceDrawerData } from "../types.js";

interface UnityExecutionTabProps {
  actions: UnityLedgerActionItem[];
  onOpenEvidence: (evidence: UnityEvidenceDrawerData) => void;
}

export const UnityExecutionTab: React.FC<UnityExecutionTabProps> = ({
  actions,
  onOpenEvidence,
}) => {
  const [expandedActionIds, setExpandedActionIds] = useState<Record<string, boolean>>({});

  const toggleExpand = (actionId: string) => {
    setExpandedActionIds((prev) => ({
      ...prev,
      [actionId]: !prev[actionId],
    }));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMMITTED":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
      case "VERIFIED":
        return "bg-sky-500/10 text-sky-400 border-sky-500/30";
      case "EXECUTED":
      case "STARTED":
      case "PREPARED":
        return "bg-blue-500/10 text-blue-400 border-blue-500/30";
      case "UNKNOWN":
        return "bg-amber-500/15 text-amber-400 border-amber-500/30 font-bold";
      case "FAILED":
      default:
        return "bg-rose-500/10 text-rose-400 border-rose-500/30";
    }
  };

  const handleOpenEvidence = (act: UnityLedgerActionItem) => {
    onOpenEvidence({
      evidenceId: `ev_${act.actionId}`,
      actionId: act.actionId,
      operationId: act.operationId,
      capability: act.capability,
      timestamp: new Date(act.timestamp).toLocaleTimeString(),
      preStateHash: act.preStateHash,
      postStateHash: act.postStateHash,
      evidenceHash: act.evidenceHash,
      verificationVerdict: act.status === "FAILED" ? "FAILED" : "VERIFIED",
      verificationSource: "UNITY_ACTION_LEDGER",
      objectStateSnapshot: {
        actionId: act.actionId,
        idempotencyKey: act.idempotencyKey,
        blueprintStage: act.blueprintStage,
        checkpointId: act.checkpointId,
      },
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base overflow-hidden font-mono text-xs">
      {/* 1. Execution Header */}
      <div className="h-12 px-6 border-b border-theme-subtle bg-theme-sidebar/40 flex items-center justify-between select-none shrink-0">
        <div className="flex items-center gap-2 font-semibold text-theme-primary">
          <History className="w-4 h-4 text-sky-400" />
          <span>Ledger & Blueprint Execution Audit</span>
        </div>

        <div className="flex items-center gap-4 text-theme-muted text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>COMMITTED</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>UNKNOWN</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>FAILED</span>
          </span>
          <span className="text-theme-subtle">|</span>
          <span>{actions.length} Total Actions</span>
        </div>
      </div>

      {/* 2. Actions List */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {actions.length > 0 ? (
          actions.map((act) => {
            const isExpanded = expandedActionIds[act.actionId] ?? false;
            const isUnknown = act.status === "UNKNOWN";

            return (
              <div
                key={act.actionId}
                className={`border rounded-xl transition ${
                  isUnknown
                    ? "bg-amber-500/5 border-amber-500/40"
                    : "bg-theme-card/30 border-theme-subtle hover:border-theme-subtle/80"
                }`}
              >
                {/* Action summary bar */}
                <div
                  onClick={() => toggleExpand(act.actionId)}
                  className="p-3.5 flex items-center justify-between gap-4 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      className="p-0.5 text-theme-muted hover:text-theme-primary transition"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[11px] text-theme-muted">
                        {new Date(act.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="text-theme-subtle">·</span>
                      <span className="font-semibold text-theme-primary truncate">
                        {act.operationId}
                      </span>
                      <span className="text-[10px] text-sky-400 bg-sky-500/10 px-1.5 py-0.2 rounded border border-sky-500/20">
                        {act.capability}
                      </span>
                      {act.blueprintStage && (
                        <span className="text-[10px] text-theme-muted bg-theme-base px-1.5 py-0.2 rounded border border-theme-subtle">
                          Stage: {act.blueprintStage}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded border ${getStatusBadge(
                        act.status
                      )}`}
                    >
                      ● {act.status}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEvidence(act);
                      }}
                      className="px-2 py-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded text-[11px] flex items-center gap-1 transition"
                    >
                      <ShieldCheck className="w-3 h-3" />
                      <span>Evidence</span>
                    </button>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-theme-subtle/60 space-y-3 text-[11px]">
                    {/* Execution Lifecycle Flow */}
                    <div className="flex items-center gap-2 p-2 bg-theme-base/60 rounded border border-theme-subtle text-[10px] text-theme-muted">
                      <span>PREPARED</span>
                      <ArrowRight className="w-3 h-3" />
                      <span>STARTED</span>
                      <ArrowRight className="w-3 h-3" />
                      <span>EXECUTED</span>
                      <ArrowRight className="w-3 h-3" />
                      <span>VERIFIED</span>
                      <ArrowRight className="w-3 h-3" />
                      <span className="text-emerald-400 font-bold">COMMITTED</span>
                    </div>

                    {/* Hashes and Identifiers */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <div className="text-theme-muted text-[10px]">Action ID:</div>
                        <div className="text-theme-secondary font-mono bg-theme-base p-1.5 rounded border border-theme-subtle">
                          {act.actionId}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="text-theme-muted text-[10px]">Idempotency Key:</div>
                        <div className="text-theme-secondary font-mono bg-theme-base p-1.5 rounded border border-theme-subtle">
                          {act.idempotencyKey}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="text-theme-muted text-[10px]">Pre-State Hash:</div>
                        <div className="text-theme-secondary font-mono bg-theme-base p-1.5 rounded border border-theme-subtle">
                          {act.preStateHash}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="text-theme-muted text-[10px]">Post-State Hash:</div>
                        <div className="text-emerald-400 font-mono bg-theme-base p-1.5 rounded border border-theme-subtle">
                          {act.postStateHash}
                        </div>
                      </div>
                    </div>

                    {/* UNKNOWN & Reconciliation Section */}
                    {isUnknown && act.reconciliation && (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg space-y-2">
                        <div className="flex items-center justify-between text-amber-400 font-semibold text-xs">
                          <span className="flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Action Reconciler State</span>
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/30">
                            {act.reconciliation.result}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                          <div className="bg-theme-base p-1.5 rounded border border-theme-subtle">
                            <span className="text-theme-muted">Pre:</span> {act.reconciliation.preState}
                          </div>
                          <div className="bg-theme-base p-1.5 rounded border border-theme-subtle">
                            <span className="text-theme-muted">Current:</span> {act.reconciliation.currentState}
                          </div>
                          <div className="bg-theme-base p-1.5 rounded border border-theme-subtle">
                            <span className="text-theme-muted">Post:</span> {act.reconciliation.postState}
                          </div>
                        </div>

                        {act.reconciliation.result === "UNRESOLVED_DRIFT" && (
                          <div className="p-2 bg-rose-500/20 border border-rose-500/40 rounded text-rose-300 font-bold text-center text-xs">
                            UNRESOLVED DRIFT. Further mutation blocked.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="p-12 text-center text-xs text-theme-muted font-mono space-y-1">
            <History className="w-8 h-8 text-theme-subtle mx-auto mb-2" />
            <div>暂无执行记录</div>
            <div className="text-[10px] text-theme-muted/60">
              所有经由 Ledger 的蓝图构建与变异操作将在此形成不可篡改的审计时间线
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
