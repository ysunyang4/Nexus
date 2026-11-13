import React, { useState, useEffect } from "react";
import {
  Play,
  Pause,
  RefreshCw,
  GitBranch,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  FileCode,
  Box,
  AlertTriangle,
  RotateCcw,
  Lock,
} from "lucide-react";
import { projectBuilderApi, type ProjectDetail } from "../../api/project-builder-api.js";

interface ProjectBuilderWorkspaceProps {
  projectId: string;
  onBack: () => void;
}

export type ProjectTabId =
  | "overview"
  | "graph"
  | "stages"
  | "verification"
  | "ledger"
  | "delivery"
  | "blueprint";

export const ProjectBuilderWorkspace: React.FC<ProjectBuilderWorkspaceProps> = ({
  projectId,
  onBack,
}) => {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [activeTab, setActiveTab] = useState<ProjectTabId>("overview");
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [replanJson, setReplanJson] = useState("");
  const [showReplanModal, setShowReplanModal] = useState(false);

  const loadProject = async () => {
    try {
      const data = await projectBuilderApi.getProject(projectId);
      if (data) setProject(data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProject();
    const interval = setInterval(loadProject, 2000);
    return () => clearInterval(interval);
  }, [projectId]);

  const handleStart = async () => {
    setActionLoading(true);
    try {
      await projectBuilderApi.startProject(projectId);
      await loadProject();
    } finally {
      setActionLoading(false);
    }
  };

  const handlePause = async () => {
    setActionLoading(true);
    try {
      await projectBuilderApi.pauseProject(projectId);
      await loadProject();
    } finally {
      setActionLoading(false);
    }
  };

  const handleReplanSubmit = async () => {
    if (!replanJson.trim()) return;
    setActionLoading(true);
    try {
      const parsed = JSON.parse(replanJson);
      const stages = Array.isArray(parsed) ? parsed : parsed.stages || [];
      await projectBuilderApi.submitReplan(projectId, stages);
      setShowReplanModal(false);
      setReplanJson("");
      await loadProject();
    } catch (err: any) {
      alert("Invalid JSON format: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (isLoading && !project) {
    return (
      <div className="flex-1 flex items-center justify-center bg-theme-base font-mono text-xs text-theme-muted">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-sky-400" />
        加载 Project Builder 状态...
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-theme-base font-mono text-xs text-theme-muted p-8">
        <p className="mb-4 text-rose-400">未找到工程项目: {projectId}</p>
        <button
          onClick={onBack}
          className="px-3 py-1.5 bg-theme-card border border-theme-subtle rounded text-theme-primary"
        >
          返回项目列表
        </button>
      </div>
    );
  }

  const completedStagesCount = project.stageStates.filter((s) => s.status === "COMMITTED").length;
  const totalStagesCount = project.stageStates.length;
  const progressPct = totalStagesCount > 0 ? Math.round((completedStagesCount / totalStagesCount) * 100) : 0;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DELIVERED":
      case "COMMITTED":
        return <span className="px-2 py-0.5 rounded text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-semibold">DELIVERED</span>;
      case "RUNNING":
      case "EXECUTING":
        return <span className="px-2 py-0.5 rounded text-[11px] bg-sky-500/10 text-sky-400 border border-sky-500/20 font-mono font-semibold animate-pulse">RUNNING</span>;
      case "VERIFYING":
        return <span className="px-2 py-0.5 rounded text-[11px] bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono font-semibold">VERIFYING</span>;
      case "NEEDS_REPLAN":
        return <span className="px-2 py-0.5 rounded text-[11px] bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono font-semibold">NEEDS_REPLAN</span>;
      case "FAILED":
        return <span className="px-2 py-0.5 rounded text-[11px] bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono font-semibold">FAILED</span>;
      case "BLOCKED":
        return <span className="px-2 py-0.5 rounded text-[11px] bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 font-mono">BLOCKED</span>;
      case "PAUSED":
        return <span className="px-2 py-0.5 rounded text-[11px] bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">PAUSED</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 font-mono">PREPARED</span>;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base select-none overflow-hidden">
      {/* Top Header Bar */}
      <div className="p-4 bg-theme-sidebar/50 border-b border-theme-subtle flex flex-col gap-3 font-mono">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="text-xs text-theme-muted hover:text-theme-primary px-2 py-1 bg-theme-base rounded border border-theme-subtle"
            >
              ← 返回
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-theme-primary">{project.name}</h1>
                {getStatusBadge(project.status)}
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  {project.executionMode}
                </span>
              </div>
              <p className="text-[11px] text-theme-muted mt-0.5">{project.blueprint.goal}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {project.status === "NEEDS_REPLAN" && (
              <button
                type="button"
                onClick={() => {
                  setReplanJson(
                    JSON.stringify(
                      [
                        {
                          id: `stage_replan_${Date.now()}`,
                          name: "Recovery Stage",
                          goal: "Recover failed action with corrected parameters",
                          provider: "unity-gamedev",
                          dependsOn: [],
                          actions: [],
                        },
                      ],
                      null,
                      2
                    )
                  );
                  setShowReplanModal(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-amber-600 hover:bg-amber-500 text-white font-medium shadow-sm transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>AI Replan 提交</span>
              </button>
            )}

            {project.status === "RUNNING" ? (
              <button
                type="button"
                onClick={handlePause}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-amber-600/20 text-amber-300 border border-amber-500/30 hover:bg-amber-600/30 transition"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>暂停执行</span>
              </button>
            ) : project.status !== "DELIVERED" ? (
              <button
                type="button"
                onClick={handleStart}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm transition"
              >
                <Play className="w-3.5 h-3.5" />
                <span>开始 / 继续执行</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={loadProject}
              className="p-1.5 rounded text-theme-muted hover:text-theme-primary bg-theme-base border border-theme-subtle"
              title="刷新"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-theme-muted">
            <span>
              已提交阶段: <strong className="text-theme-primary">{completedStagesCount}</strong> / {totalStagesCount}
            </span>
            <span>{progressPct}% 完成</span>
          </div>
          <div className="h-1.5 w-full bg-theme-base rounded-full overflow-hidden border border-theme-subtle">
            <div
              className="h-full bg-sky-500 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="flex items-center gap-1 overflow-x-auto pt-1 border-t border-theme-subtle text-xs">
          {[
            { id: "overview", label: "概览 (Overview)", icon: Box },
            { id: "graph", label: "执行图 (DAG Graph)", icon: GitBranch },
            { id: "stages", label: "阶段流水 (Stages)", icon: Layers },
            { id: "verification", label: "真实验证 (Verification First)", icon: ShieldCheck },
            { id: "ledger", label: "审计流水 (Ledger & Evidence)", icon: Clock },
            { id: "delivery", label: "交付成果 (Delivery)", icon: CheckCircle2 },
            { id: "blueprint", label: "蓝图源码 (Blueprint)", icon: FileCode },
          ].map((tab) => {
            const Icon = tab.icon;
            const isCurrent = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as ProjectTabId)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium transition shrink-0 ${
                  isCurrent
                    ? "bg-sky-500/15 text-sky-400 border border-sky-500/30"
                    : "text-theme-muted hover:text-theme-primary hover:bg-theme-card/50"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Tab Body */}
      <div className="flex-1 overflow-y-auto p-6 bg-theme-base font-mono">
        {/* 1. Overview Tab */}
        {activeTab === "overview" && (
          <div className="max-w-4xl space-y-6">
            <div className="p-5 bg-theme-card/30 border border-theme-subtle rounded-xl space-y-4">
              <h2 className="text-xs uppercase tracking-wider text-theme-muted font-semibold">
                项目核心目标与环境
              </h2>
              <p className="text-sm text-theme-primary leading-relaxed">{project.blueprint.goal}</p>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <span className="text-[11px] text-theme-muted block mb-1.5">需求清单 (Requirements)</span>
                  <ul className="space-y-1 text-xs text-theme-secondary list-disc list-inside">
                    {project.blueprint.requirements?.map((r: string, i: number) => (
                      <li key={i}>{r}</li>
                    )) || <li>标准自动化交付</li>}
                  </ul>
                </div>
                <div>
                  <span className="text-[11px] text-theme-muted block mb-1.5">技术约束 (Constraints)</span>
                  <ul className="space-y-1 text-xs text-theme-secondary list-disc list-inside">
                    {project.blueprint.constraints?.map((c: string, i: number) => (
                      <li key={i}>{c}</li>
                    )) || <li>保持活跃场景不变，零编译报错</li>}
                  </ul>
                </div>
              </div>
            </div>

            {/* Providers Card */}
            <div className="p-5 bg-theme-card/30 border border-theme-subtle rounded-xl space-y-3">
              <h2 className="text-xs uppercase tracking-wider text-theme-muted font-semibold">
                参与该项目的 MCP Providers
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                {project.blueprint.providers?.map((p: string) => (
                  <span
                    key={p}
                    className="px-2.5 py-1 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 text-xs font-semibold"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>

            {/* Replan Alert Card */}
            {project.replanContext && (
              <div className="p-5 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs">
                  <AlertTriangle className="w-4 h-4" />
                  <span>阶段需要 AI 重新规划 (NEEDS_REPLAN)</span>
                </div>
                <p className="text-xs text-theme-secondary leading-relaxed">
                  {project.replanContext.error}
                </p>
                <div className="text-[11px] text-theme-muted">
                  已提交完成的阶段:{" "}
                  <strong className="text-emerald-400">
                    [{project.replanContext.committedStages.join(", ")}]
                  </strong>{" "}
                  (已被安全锁定，不会重复执行)
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. Execution Graph Tab (DAG) */}
        {activeTab === "graph" && (
          <div className="max-w-4xl space-y-6">
            <div className="p-4 bg-theme-card/20 border border-theme-subtle rounded-xl space-y-2">
              <span className="text-xs text-theme-muted uppercase tracking-wider font-semibold">
                执行拓扑依赖有向无环图 (Execution Dependency DAG)
              </span>
              <p className="text-xs text-theme-secondary">
                各阶段根据 dependsOn 依赖关系进行拓扑编排。前置阶段 COMMITTED 后，依赖阶段自动解锁执行。
              </p>
            </div>

            <div className="flex flex-col gap-4">
              {project.stageStates.map((stage, idx) => (
                <div key={stage.stageId} className="flex flex-col">
                  <div className="p-4 bg-theme-sidebar/40 border border-theme-subtle rounded-xl flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-theme-base border border-theme-subtle flex items-center justify-center text-xs font-bold text-sky-400">
                        {idx + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-theme-primary">{stage.name}</span>
                          <span className="text-[10px] text-theme-muted">({stage.stageId})</span>
                        </div>
                        <div className="text-[11px] text-theme-muted mt-0.5">
                          Provider: <strong className="text-theme-secondary">{stage.provider}</strong> | 动作数:{" "}
                          {stage.actions.length}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {stage.dependsOn.length > 0 && (
                        <div className="text-[10px] text-theme-muted flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                          <span>依赖: {stage.dependsOn.join(", ")}</span>
                        </div>
                      )}
                      {getStatusBadge(stage.status)}
                    </div>
                  </div>

                  {idx < project.stageStates.length - 1 && (
                    <div className="w-full flex justify-center py-1">
                      <div className="w-0.5 h-4 bg-theme-subtle" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. Stages Tab */}
        {activeTab === "stages" && (
          <div className="max-w-4xl space-y-6">
            {project.stageStates.map((stage) => (
              <div
                key={stage.stageId}
                className="p-5 bg-theme-card/30 border border-theme-subtle rounded-xl space-y-4"
              >
                <div className="flex items-center justify-between pb-3 border-b border-theme-subtle/50">
                  <div>
                    <h3 className="text-xs font-bold text-theme-primary flex items-center gap-2">
                      <span>{stage.name}</span>
                      <span className="text-[10px] font-normal text-theme-muted">[{stage.stageId}]</span>
                    </h3>
                    <p className="text-[11px] text-theme-muted mt-0.5">Provider: {stage.provider}</p>
                  </div>
                  {getStatusBadge(stage.status)}
                </div>

                {/* Actions List */}
                <div className="space-y-2">
                  <span className="text-[10px] text-theme-muted uppercase tracking-wider block">
                    阶段包含 Actions:
                  </span>
                  {stage.actions.map((act) => {
                    const result = stage.actionResults?.find((r) => r.actionId === act.id);
                    return (
                      <div
                        key={act.id}
                        className="p-3 bg-theme-base/60 border border-theme-subtle/40 rounded-lg flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 font-semibold text-theme-primary">
                            <span>{act.name}</span>
                            <span className="text-[10px] text-sky-400 font-normal">
                              (Capability: {act.capability})
                            </span>
                          </div>
                          {result && (
                            <div className="text-[10px] text-theme-muted">
                              Resolved Tool: <strong className="text-theme-secondary">{result.resolvedTool}</strong> |
                              耗时: {result.durationMs}ms | 证据: {result.evidenceId}
                            </div>
                          )}
                        </div>

                        <div>
                          {result ? (
                            result.verificationPassed ? (
                              <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                                <CheckCircle2 className="w-3.5 h-3.5" /> 已验证
                              </span>
                            ) : (
                              <span className="text-rose-400 flex items-center gap-1 text-[11px]">
                                <XCircle className="w-3.5 h-3.5" /> 验证失败
                              </span>
                            )
                          ) : (
                            <span className="text-theme-muted text-[11px]">待命</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 4. Verification Tab */}
        {activeTab === "verification" && (
          <div className="max-w-4xl space-y-6">
            <div className="p-4 bg-theme-card/20 border border-theme-subtle rounded-xl space-y-2">
              <span className="text-xs text-theme-muted uppercase tracking-wider font-semibold">
                独立状态真实验证 (Verification First Assurance)
              </span>
              <p className="text-xs text-theme-secondary">
                Nexus 拒绝将“HTTP 200”作为成功凭证。每个动作均经由状态探针独立查询、对比前置状态与后置状态，验证真实世界物理或逻辑变更。
              </p>
            </div>

            {project.stageStates.map((stage) => (
              <div key={stage.stageId} className="p-5 bg-theme-card/30 border border-theme-subtle rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-theme-primary">{stage.name}</h3>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      stage.verificationVerdict === "VERIFIED"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"
                    }`}
                  >
                    {stage.verificationVerdict}
                  </span>
                </div>

                <div className="space-y-3 pt-2">
                  {stage.actionResults?.map((res) => (
                    <div key={res.actionId} className="p-3 bg-black/40 border border-theme-subtle rounded-lg space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sky-400">{res.actionName}</span>
                        <span className="text-[10px] text-theme-muted">Evidence: {res.evidenceId}</span>
                      </div>
                      <div className="text-[11px] text-emerald-300/90 font-medium">
                        {res.verificationDetails || "独立验证已通过"}
                      </div>
                      {res.postState && (
                        <div className="p-2 bg-theme-base/80 rounded border border-theme-subtle/50 text-[10px] text-theme-secondary overflow-x-auto max-h-32">
                          <pre>{JSON.stringify(res.postState, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  ))}
                  {(!stage.actionResults || stage.actionResults.length === 0) && (
                    <p className="text-xs text-theme-muted">阶段尚未开始执行验证</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 5. Ledger & Evidence Tab */}
        {activeTab === "ledger" && (
          <div className="max-w-4xl space-y-6">
            <div className="p-5 bg-theme-card/30 border border-theme-subtle rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-theme-primary uppercase">项目全生命周期审计流水 (Ledger)</h3>
                <span className="text-xs text-theme-muted">{project.ledger?.length || 0} 条单调递增流水</span>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto divide-y divide-theme-subtle/20 font-mono text-xs">
                {project.ledger?.map((l) => (
                  <div key={l.sequenceId} className="py-2.5 flex items-start justify-between gap-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sky-400 font-bold">#{l.sequenceId}</span>
                        <span className="text-theme-primary font-semibold">{l.operationId}</span>
                        <span className="text-[10px] text-theme-muted">{l.timestamp}</span>
                      </div>
                      <p className="text-[11px] text-theme-secondary">{l.summary}</p>
                    </div>

                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        l.status === "COMMITTED"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : l.status === "FAILED"
                          ? "bg-rose-500/10 text-rose-400"
                          : "bg-sky-500/10 text-sky-400"
                      }`}
                    >
                      {l.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 6. Delivery Tab */}
        {activeTab === "delivery" && (
          <div className="max-w-4xl space-y-6">
            {project.deliveryReport ? (
              <div className="p-6 bg-emerald-500/5 border border-emerald-500/30 rounded-xl space-y-4">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>工程项目交付成功 (Project Delivered)</span>
                </div>
                <p className="text-xs text-theme-secondary leading-relaxed">
                  {project.deliveryReport.summary}
                </p>

                <div className="p-3 bg-black/40 border border-theme-subtle rounded-lg space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between text-theme-muted">
                    <span>Root Evidence Hash:</span>
                    <strong className="text-sky-400">{project.deliveryReport.rootEvidenceHash}</strong>
                  </div>
                  <div className="flex items-center justify-between text-theme-muted">
                    <span>完成耗时:</span>
                    <span>{project.deliveryReport.totalDurationMs}ms</span>
                  </div>
                  <div className="flex items-center justify-between text-theme-muted">
                    <span>完成阶段数:</span>
                    <span>{project.deliveryReport.stagesCompleted} / {project.deliveryReport.totalStages}</span>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <span className="text-xs text-theme-muted uppercase tracking-wider block">交付产物清单:</span>
                  {project.artifacts?.map((art) => (
                    <div key={art.id} className="p-3 bg-theme-base border border-theme-subtle rounded-lg flex items-center justify-between text-xs">
                      <div>
                        <strong className="text-theme-primary">{art.name}</strong>
                        <div className="text-[10px] text-theme-muted">SHA-256: {art.sha256}</div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20">
                        {art.type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-theme-muted bg-theme-card/20 border border-theme-subtle rounded-xl">
                项目正在执行中，待所有 Stage 校验 COMMITTED 后将在此输出交付证书与产物哈希
              </div>
            )}
          </div>
        )}

        {/* 7. Blueprint Tab */}
        {activeTab === "blueprint" && (
          <div className="max-w-4xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-theme-muted uppercase tracking-wider font-semibold">
                原始 Project Blueprint JSON
              </span>
            </div>
            <pre className="p-4 bg-black/50 border border-theme-subtle rounded-xl text-xs text-sky-300/90 overflow-x-auto max-h-[600px]">
              {JSON.stringify(project.blueprint, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* AI Replan Modal */}
      {showReplanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 font-mono">
          <div className="w-full max-w-xl bg-theme-base border border-theme-subtle rounded-xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-theme-subtle pb-3">
              <h3 className="text-sm font-bold text-theme-primary flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-amber-400" />
                <span>提交 AI 重新规划阶段 (Replan Stages)</span>
              </h3>
              <button
                onClick={() => setShowReplanModal(false)}
                className="text-theme-muted hover:text-theme-primary text-xs"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-theme-secondary leading-relaxed">
              输入替换失败阶段及后续依赖的新阶段列表。之前已 COMMITTED 的阶段将被严格保留。
            </p>

            <textarea
              value={replanJson}
              onChange={(e) => setReplanJson(e.target.value)}
              rows={12}
              className="w-full p-3 bg-black/40 border border-theme-subtle rounded text-xs text-sky-300 font-mono focus:outline-none focus:border-sky-500"
            />

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-theme-subtle">
              <button
                type="button"
                onClick={() => setShowReplanModal(false)}
                className="px-3 py-1.5 rounded text-xs text-theme-muted hover:text-theme-primary bg-theme-card border border-theme-subtle"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleReplanSubmit}
                disabled={actionLoading}
                className="px-4 py-1.5 rounded text-xs bg-amber-600 hover:bg-amber-500 text-white font-medium shadow-sm transition"
              >
                确认提交并恢复执行
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
