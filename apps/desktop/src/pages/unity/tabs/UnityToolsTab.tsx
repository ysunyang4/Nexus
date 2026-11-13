import React, { useState, useMemo, useEffect } from "react";
import {
  Wrench,
  Search,
  RefreshCw,
  Shield,
  Zap,
  Code,
  Layers,
  Eye,
  CheckCircle2,
  XCircle,
  FileCode,
  ExternalLink,
} from "lucide-react";
import type {
  DynamicToolDefinition,
  DynamicToolExecutionResult,
  UnityEvidenceDrawerData,
  UnityPermissionLevel,
} from "../types.js";
import { unityApi } from "../../../api/unity-api.js";
import { DynamicSchemaForm } from "../components/DynamicSchemaForm.js";

interface UnityToolsTabProps {
  onOpenEvidence: (evidence: UnityEvidenceDrawerData) => void;
  currentPermission?: UnityPermissionLevel;
}

export const UnityToolsTab: React.FC<UnityToolsTabProps> = ({
  onOpenEvidence,
  currentPermission = "L2",
}) => {
  const [tools, setTools] = useState<DynamicToolDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedTool, setSelectedTool] = useState<DynamicToolDefinition | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [permissionFilter, setPermissionFilter] = useState<string>("ALL");
  const [showRawSchema, setShowRawSchema] = useState(false);

  // Execution states
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<DynamicToolExecutionResult | null>(null);

  // Load tools on mount
  const loadTools = async () => {
    setIsLoading(true);
    try {
      const data = await unityApi.getTools();
      setTools(data);
      if (data.length > 0 && !selectedTool) {
        // Default select gameobject-find or first tool
        const defaultTool = data.find((t) => t.name === "gameobject-find") || data[0];
        setSelectedTool(defaultTool);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTools();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await unityApi.refreshTools();
      await loadTools();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filtered tools
  const filteredTools = useMemo(() => {
    return tools.filter((tool) => {
      if (categoryFilter !== "ALL" && tool.category !== categoryFilter) return false;
      if (permissionFilter !== "ALL" && tool.requiredPermission !== permissionFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = tool.name.toLowerCase().includes(q);
        const matchesDesc = tool.description.toLowerCase().includes(q);
        if (!matchesName && !matchesDesc) return false;
      }
      return true;
    });
  }, [tools, categoryFilter, permissionFilter, searchQuery]);

  // Execute tool
  const handleExecute = async (values: Record<string, any>) => {
    if (!selectedTool) return;
    setIsExecuting(true);
    setExecutionResult(null);

    try {
      const result = await unityApi.callTool(selectedTool.name, values);
      setExecutionResult(result);
    } catch (err: any) {
      setExecutionResult({
        isError: true,
        content: [{ type: "text", text: err.message || String(err) }],
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case "LOW":
        return <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">LOW</span>;
      case "MEDIUM":
        return <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20 font-mono">MED</span>;
      case "HIGH":
        return <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">HIGH</span>;
      case "CRITICAL":
      default:
        return <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono">CRITICAL</span>;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "READ_ONLY":
        return <Eye className="w-3.5 h-3.5 text-sky-400" />;
      case "SCENE_MUTATION":
        return <Layers className="w-3.5 h-3.5 text-emerald-400" />;
      case "CODE_EXECUTION":
        return <Code className="w-3.5 h-3.5 text-purple-400" />;
      default:
        return <Wrench className="w-3.5 h-3.5 text-theme-muted" />;
    }
  };

  return (
    <div className="flex-1 flex h-full min-h-0 overflow-hidden bg-theme-base select-none">
      {/* 1. Left Tool Catalog List */}
      <div className="w-80 border-r border-theme-subtle flex flex-col bg-theme-sidebar/40 shrink-0">
        {/* Search & Filters */}
        <div className="p-3 border-b border-theme-subtle space-y-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-theme-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索 MCP 工具..."
              className="w-full pl-8 pr-2.5 py-1.5 bg-theme-base border border-theme-subtle rounded text-xs font-mono text-theme-primary placeholder-theme-muted/50 focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-[11px] text-theme-muted">
              {isLoading ? "加载中..." : `${filteredTools.length} / ${tools.length} 个动态工具`}
            </span>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
              className="p-1 rounded text-theme-muted hover:text-theme-primary hover:bg-theme-card border border-theme-subtle transition disabled:opacity-50"
              title="从 downstream MCP 刷新 Catalog"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px] font-mono">
            {["ALL", "READ_ONLY", "SCENE_MUTATION", "CODE_EXECUTION"].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-2 py-0.5 rounded transition shrink-0 ${
                  categoryFilter === cat
                    ? "bg-sky-600 text-white font-medium"
                    : "text-theme-muted hover:text-theme-primary bg-theme-base border border-theme-subtle/60"
                }`}
              >
                {cat === "ALL" ? "全部" : cat === "READ_ONLY" ? "只读" : cat === "SCENE_MUTATION" ? "场景" : "代码"}
              </button>
            ))}
          </div>

          {/* Permission Level Filter Pills */}
          <div className="flex items-center justify-between gap-1 overflow-x-auto text-[10px] font-mono pt-1 border-t border-theme-subtle/40">
            <div className="flex items-center gap-1">
              {["ALL", "L1", "L2", "L3", "L4", "L5"].map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setPermissionFilter(lvl)}
                  className={`px-1.5 py-0.5 rounded transition shrink-0 ${
                    permissionFilter === lvl
                      ? "bg-amber-600 text-white font-semibold"
                      : "text-theme-muted hover:text-theme-primary bg-theme-base border border-theme-subtle/40"
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-theme-muted shrink-0" title="当前 UI 授权级别">
              Auth: <strong className="text-sky-400">{currentPermission}</strong>
            </span>
          </div>
        </div>

        {/* Tools Scrollable List */}
        <div className="flex-1 overflow-y-auto divide-y divide-theme-subtle/30 font-mono">
          {filteredTools.map((tool) => {
            const isSelected = selectedTool?.name === tool.name;
            return (
              <div
                key={tool.name}
                onClick={() => {
                  setSelectedTool(tool);
                  setExecutionResult(null);
                }}
                className={`p-2.5 cursor-pointer transition select-none ${
                  isSelected
                    ? "bg-sky-500/15 border-l-2 border-sky-500 text-sky-400 font-medium"
                    : "hover:bg-theme-card/50 text-theme-secondary hover:text-theme-primary"
                }`}
              >
                <div className="flex items-center justify-between gap-1.5 mb-1">
                  <div className="flex items-center gap-1.5 truncate">
                    {getCategoryIcon(tool.category)}
                    <span className="text-xs truncate">{tool.name}</span>
                  </div>
                  {getRiskBadge(tool.riskLevel)}
                </div>
                <div className="flex items-center justify-between text-[10px] text-theme-muted">
                  <span className="truncate max-w-[170px]">{tool.description.replace(/^\[Unity Native Tool[^\]]*\]\s*/, "")}</span>
                  <span className="text-sky-500/80 font-bold shrink-0">{tool.requiredPermission}</span>
                </div>
              </div>
            );
          })}
          {filteredTools.length === 0 && !isLoading && (
            <div className="p-8 text-center text-xs font-mono text-theme-muted">
              未找到匹配的工具
            </div>
          )}
        </div>
      </div>

      {/* 2. Right Tool Execution & Schema Panel */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {selectedTool ? (
          <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-5">
            {/* Tool Header Details */}
            <div className="p-4 bg-theme-sidebar/40 border border-theme-subtle rounded-xl space-y-3 font-mono">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
                    {getCategoryIcon(selectedTool.category)}
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-theme-primary">{selectedTool.name}</h2>
                    <div className="text-[11px] text-theme-muted">
                      Provider: <span className="text-theme-secondary">{selectedTool.provider}</span> ({selectedTool.source})
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1 text-xs bg-theme-base px-2.5 py-1 rounded border border-theme-subtle">
                    <Shield className="w-3.5 h-3.5 text-sky-400" />
                    <span className="text-theme-muted">Required:</span>
                    <span className="font-bold text-sky-400">{selectedTool.requiredPermission}</span>
                  </div>

                  <div className="flex items-center gap-1 text-xs bg-theme-base px-2.5 py-1 rounded border border-theme-subtle">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-theme-muted">Strategy:</span>
                    <span className="text-theme-primary">{selectedTool.strategy}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowRawSchema(!showRawSchema)}
                    className="p-1.5 text-theme-muted hover:text-theme-primary hover:bg-theme-card rounded border border-theme-subtle transition"
                    title="切换查看原始 JSON Schema"
                  >
                    <FileCode className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <p className="text-xs text-theme-secondary leading-relaxed">
                {selectedTool.description}
              </p>
            </div>

            {/* Raw JSON Schema Modal / Toggle */}
            {showRawSchema && (
              <div className="p-3 bg-black/40 border border-theme-subtle rounded-lg space-y-1 font-mono text-xs">
                <div className="text-theme-muted text-[10px] uppercase">Input Schema (JSON)</div>
                <pre className="overflow-x-auto text-[11px] text-sky-300/90 max-h-48">
                  {JSON.stringify(selectedTool.inputSchema, null, 2)}
                </pre>
              </div>
            )}

            {/* Dynamic Schema Form Section */}
            <div className="p-5 bg-theme-card/30 border border-theme-subtle rounded-xl space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-theme-subtle/50 text-xs font-mono">
                <span className="font-semibold text-theme-primary uppercase tracking-wider text-[11px]">
                  参数配置 (Schema Driven Parameters)
                </span>
                <span className="text-[10px] text-theme-muted">
                  Auto-generated from downstream inputSchema
                </span>
              </div>

              <DynamicSchemaForm
                schema={selectedTool.inputSchema}
                onSubmit={handleExecute}
                isLoading={isExecuting}
                submitLabel={`调用 ${selectedTool.name}`}
              />
            </div>

            {/* Execution Result Area */}
            {executionResult && (
              <div className="p-5 bg-theme-sidebar/50 border border-theme-subtle rounded-xl space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {executionResult.isError || executionResult.permission?.status === 403 ? (
                      <XCircle className="w-4 h-4 text-rose-400" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    )}
                    <span className="font-semibold text-theme-primary">
                      {executionResult.permission?.status === 403
                        ? "403 PERMISSION_DENIED (Hard Intercepted)"
                        : executionResult.isError
                        ? "执行异常 (Execution Error)"
                        : "执行成功 (Execution Success)"}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-theme-muted text-[11px]">
                    {executionResult.durationMs !== undefined && (
                      <span>{executionResult.durationMs}ms</span>
                    )}
                    {executionResult.evidenceId && (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenEvidence({
                            evidenceId: executionResult.evidenceId!,
                            actionId: executionResult.actionId,
                            operationId: selectedTool.name,
                            capability: selectedTool.category,
                            timestamp: new Date().toLocaleTimeString(),
                            preStateHash: "PRE_VERIFIED",
                            postStateHash: executionResult.isError ? "REJECTED" : "POST_COMMITTED",
                            evidenceHash: executionResult.evidenceId!,
                            verificationVerdict: executionResult.isError ? "FAILED" : "VERIFIED",
                            verificationSource: "NEXUS_DYNAMIC_PROVIDER",
                            objectStateSnapshot: executionResult.structuredContent || executionResult.content,
                          })
                        }
                        className="text-sky-400 hover:text-sky-300 flex items-center gap-1 transition"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>查看审计证据 ({executionResult.evidenceId})</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Content Payload Output */}
                <div className="p-3 bg-black/40 border border-theme-subtle rounded text-[11px] overflow-x-auto max-h-60">
                  <pre className="text-theme-secondary">
                    {executionResult.content?.[0]?.text ||
                      JSON.stringify(executionResult.structuredContent || executionResult, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-theme-muted font-mono text-xs">
            <Wrench className="w-8 h-8 mb-2 opacity-40 text-sky-400" />
            <p>请从左侧选择一个 MCP 工具以查看详情并填写表单</p>
          </div>
        )}
      </div>
    </div>
  );
};
