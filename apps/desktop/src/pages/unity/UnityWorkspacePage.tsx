import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  RefreshCw,
  Power,
  Search,
  CheckCircle2,
  XCircle,
  Play,
  FileCode,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { unityApi } from "../../api/unity-api.js";
import type { DynamicToolDefinition, DynamicToolExecutionResult } from "./types.js";

export const UnityWorkspacePage: React.FC = () => {
  const [tools, setTools] = useState<DynamicToolDefinition[]>([]);
  const [selectedTool, setSelectedTool] = useState<DynamicToolDefinition | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Execution state
  const [inputArgsJson, setInputArgsJson] = useState("{}");
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<DynamicToolExecutionResult | null>(null);
  const [activeRightTab, setActiveRightTab] = useState<"schema" | "test">("schema");

  // Load status and tools
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const status = await unityApi.getStatus();
      const toolList = await unityApi.getTools();
      const connected = status.unity === "CONNECTED" || toolList.length > 0;
      setIsConnected(connected);
      setTools(toolList);

      if (toolList.length > 0 && !selectedTool) {
        setSelectedTool(toolList.find((t) => t.name === "scene-get-data") || toolList[0]);
      }
    } catch (err) {
      console.error("Failed to load provider data:", err);
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, [selectedTool]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // When selected tool changes, populate default JSON args
  useEffect(() => {
    if (selectedTool) {
      const defaultArgs: Record<string, any> = {};
      const props = selectedTool.inputSchema?.properties || {};
      for (const [key, propDef] of Object.entries(props)) {
        if ((propDef as any).default !== undefined) {
          defaultArgs[key] = (propDef as any).default;
        }
      }
      setInputArgsJson(JSON.stringify(defaultArgs, null, 2));
      setExecutionResult(null);
    }
  }, [selectedTool]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await unityApi.refreshTools();
      await loadData();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleToggleConnection = async () => {
    setIsConnecting(true);
    try {
      if (isConnected) {
        await unityApi.stopService();
        setIsConnected(false);
        setTools([]);
        setSelectedTool(null);
      } else {
        await unityApi.startService();
        await loadData();
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleExecute = async () => {
    if (!selectedTool) return;
    setIsExecuting(true);
    setExecutionResult(null);

    let parsedArgs = {};
    try {
      if (inputArgsJson.trim()) {
        parsedArgs = JSON.parse(inputArgsJson);
      }
    } catch (err: any) {
      setExecutionResult({
        isError: true,
        content: [{ type: "text", text: `Invalid JSON Arguments: ${err.message}` }],
      });
      setIsExecuting(false);
      return;
    }

    try {
      const result = await unityApi.callTool(selectedTool.name, parsedArgs);
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

  const filteredTools = useMemo(() => {
    if (!searchQuery.trim()) return tools;
    const q = searchQuery.toLowerCase();
    return tools.filter(
      (t) => t.name.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q))
    );
  }, [tools, searchQuery]);

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base overflow-hidden select-none font-sans">
      {/* 1. Header Card: Provider Status & 4 Metric Cards */}
      <div className="p-4 bg-theme-card/40 border-b border-theme-subtle shrink-0">
        <div className="max-w-7xl mx-auto space-y-3">
          {/* Top Bar: Title, Badge, Status, and Action Buttons */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  MCP Provider
                </span>
                <h1 className="text-base font-semibold text-theme-primary tracking-tight font-mono">
                  Unity GameDev MCP
                </h1>
              </div>

              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-theme-base border border-theme-subtle text-xs font-mono">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isConnected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-rose-500"
                  }`}
                />
                <span className={isConnected ? "text-emerald-400 font-medium" : "text-rose-400 font-medium"}>
                  {isConnected ? "Connected" : "Disconnected"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing || isLoading}
                className="px-3 py-1.5 rounded-lg text-xs font-mono font-medium bg-theme-base hover:bg-theme-card text-theme-secondary hover:text-theme-primary border border-theme-subtle transition flex items-center gap-1.5 disabled:opacity-50"
                title="Refresh tools from downstream MCP"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-sky-400" : ""}`} />
                <span>Refresh Tools</span>
              </button>

              <button
                type="button"
                onClick={handleToggleConnection}
                disabled={isConnecting}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center gap-1.5 transition ${
                  isConnected
                    ? "bg-rose-600/20 text-rose-300 border border-rose-500/30 hover:bg-rose-600/30"
                    : "bg-sky-600 text-white hover:bg-sky-500 shadow-sm"
                } disabled:opacity-50`}
              >
                {isConnecting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Power className="w-3.5 h-3.5" />
                )}
                <span>{isConnected ? "Disconnect" : "Connect"}</span>
              </button>
            </div>
          </div>

          {/* 4 Info Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
            <div className="p-2.5 rounded-lg bg-theme-base/60 border border-theme-subtle flex flex-col justify-between">
              <span className="text-[11px] text-theme-muted uppercase tracking-wider">Endpoint</span>
              <span className="font-semibold text-theme-primary mt-1">127.0.0.1:20705</span>
            </div>

            <div className="p-2.5 rounded-lg bg-theme-base/60 border border-theme-subtle flex flex-col justify-between">
              <span className="text-[11px] text-theme-muted uppercase tracking-wider">Transport</span>
              <span className="font-semibold text-theme-primary mt-1">Streamable HTTP</span>
            </div>

            <div className="p-2.5 rounded-lg bg-theme-base/60 border border-theme-subtle flex flex-col justify-between">
              <span className="text-[11px] text-theme-muted uppercase tracking-wider">Protocol</span>
              <span className="font-semibold text-theme-primary mt-1">2024-11-05</span>
            </div>

            <div className="p-2.5 rounded-lg bg-theme-base/60 border border-theme-subtle flex flex-col justify-between">
              <span className="text-[11px] text-theme-muted uppercase tracking-wider">Tools</span>
              <span className="font-semibold text-sky-400 mt-1">
                {isLoading ? "..." : `${tools.length} discovered`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Search Bar */}
      <div className="px-4 py-2.5 bg-theme-sidebar/30 border-b border-theme-subtle shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tools (e.g. scene-, gameobject-)..."
              className="w-full pl-9 pr-3 py-1.5 bg-theme-base border border-theme-subtle rounded-lg text-xs font-mono text-theme-primary placeholder-theme-muted/50 focus:border-sky-500 focus:outline-none transition"
            />
          </div>
          <div className="text-xs font-mono text-theme-muted">
            Showing <strong className="text-theme-primary">{filteredTools.length}</strong> of{" "}
            <strong>{tools.length}</strong> tools
          </div>
        </div>
      </div>

      {/* 3. Main Two-Pane Body: Tools List & Tool Details */}
      <div className="flex-1 flex min-h-0 max-w-7xl w-full mx-auto overflow-hidden">
        {/* Left Pane: Downstream Tools List */}
        <div className="w-72 sm:w-80 border-r border-theme-subtle flex flex-col bg-theme-sidebar/20 shrink-0">
          <div className="flex-1 overflow-y-auto divide-y divide-theme-subtle/30 font-mono text-xs">
            {filteredTools.map((tool) => {
              const isSelected = selectedTool?.name === tool.name;
              return (
                <div
                  key={tool.name}
                  onClick={() => setSelectedTool(tool)}
                  className={`p-3 cursor-pointer transition select-none flex flex-col gap-1 ${
                    isSelected
                      ? "bg-sky-500/15 border-l-2 border-sky-500 text-sky-400"
                      : "hover:bg-theme-card/50 text-theme-secondary hover:text-theme-primary"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{tool.name}</span>
                    <ArrowRight className={`w-3 h-3 shrink-0 ${isSelected ? "text-sky-400 opacity-100" : "opacity-0"}`} />
                  </div>
                  {tool.description && (
                    <span className="text-[11px] text-theme-muted line-clamp-1">
                      {tool.description}
                    </span>
                  )}
                </div>
              );
            })}

            {filteredTools.length === 0 && !isLoading && (
              <div className="p-8 text-center text-xs font-mono text-theme-muted">
                No tools matching &quot;{searchQuery}&quot;
              </div>
            )}
          </div>
        </div>

        {/* Right Pane: Tool Details & Schema / Test Tool */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-theme-base">
          {selectedTool ? (
            <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6">
              {/* Tool Header */}
              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h2 className="text-lg font-bold font-mono text-theme-primary">
                    {selectedTool.name}
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveRightTab("schema")}
                      className={`px-3 py-1 rounded text-xs font-mono transition ${
                        activeRightTab === "schema"
                          ? "bg-sky-600 text-white font-medium"
                          : "text-theme-muted hover:text-theme-primary bg-theme-card border border-theme-subtle"
                      }`}
                    >
                      Input Schema
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveRightTab("test")}
                      className={`px-3 py-1 rounded text-xs font-mono transition ${
                        activeRightTab === "test"
                          ? "bg-sky-600 text-white font-medium"
                          : "text-theme-muted hover:text-theme-primary bg-theme-card border border-theme-subtle"
                      }`}
                    >
                      Test Tool
                    </button>
                  </div>
                </div>

                <p className="text-xs text-theme-secondary leading-relaxed bg-theme-card/30 p-3 rounded-lg border border-theme-subtle/50 font-mono">
                  {selectedTool.description || "No description provided by downstream MCP."}
                </p>
              </div>

              {/* Tab 1: Input Schema View */}
              {activeRightTab === "schema" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-mono text-theme-muted">
                    <FileCode className="w-3.5 h-3.5 text-sky-400" />
                    <span>Raw Input Schema (JSON)</span>
                  </div>
                  <pre className="p-4 rounded-xl bg-theme-card/60 border border-theme-subtle text-xs font-mono text-theme-primary overflow-x-auto leading-relaxed max-h-[460px]">
                    {JSON.stringify(selectedTool.inputSchema || {}, null, 2)}
                  </pre>
                </div>
              )}

              {/* Tab 2: Test Tool Runner */}
              {activeRightTab === "test" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono text-theme-muted">
                      <span>Tool Arguments (JSON)</span>
                      <span className="text-[11px] text-theme-muted">Edit parameters below</span>
                    </div>
                    <textarea
                      value={inputArgsJson}
                      onChange={(e) => setInputArgsJson(e.target.value)}
                      rows={6}
                      className="w-full p-3 bg-theme-card/60 border border-theme-subtle rounded-xl text-xs font-mono text-theme-primary focus:border-sky-500 focus:outline-none transition resize-y"
                      placeholder="{}"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleExecute}
                      disabled={isExecuting || !isConnected}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-mono font-medium flex items-center gap-2 transition disabled:opacity-50 shadow-sm"
                    >
                      {isExecuting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                      <span>Execute Tool</span>
                    </button>
                    {!isConnected && (
                      <span className="text-xs font-mono text-amber-400">
                        Provider is disconnected. Connect to execute.
                      </span>
                    )}
                  </div>

                  {/* Execution Result */}
                  {executionResult && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-mono">
                        {executionResult.isError ? (
                          <XCircle className="w-4 h-4 text-rose-400" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        )}
                        <span className={executionResult.isError ? "text-rose-400 font-bold" : "text-emerald-400 font-bold"}>
                          {executionResult.isError ? "Execution Error" : "Execution Succeeded"}
                        </span>
                      </div>
                      <pre className="p-4 rounded-xl bg-theme-sidebar/60 border border-theme-subtle text-xs font-mono text-theme-secondary overflow-x-auto leading-relaxed max-h-[300px]">
                        {JSON.stringify(executionResult, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-theme-muted font-mono text-xs">
              Select a tool from the list to view its schema and test execution.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
