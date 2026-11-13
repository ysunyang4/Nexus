import React, { useState, useEffect } from "react";
import { Server, Plus, RefreshCw, RotateCw, Play, Shield, ShieldCheck, AlertTriangle } from "lucide-react";
import type { McpStatus, TunnelStatusDto } from "../../types.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import {
  projectBuilderApi,
  type ProviderItem,
  mcpSecurityApi,
  type McpSecurityPolicyDto,
} from "../../api/project-builder-api.js";
import { managedMcpApi } from "../../api/managed-mcp-api.js";
import { bridge } from "../../api/bridge.js";

interface McpServersPageProps {
  mcpStatus: McpStatus | null;
  tunnelStatus: TunnelStatusDto | null;
}

export const McpServersPage: React.FC<McpServersPageProps> = ({
  mcpStatus,
  tunnelStatus,
}) => {
  const { language } = useTranslation();
  const isZh = language.startsWith("zh");
  const isTunnelConnected =
    tunnelStatus?.status === "Connected" ||
    tunnelStatus?.control_plane_connected === true;

  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [securityPolicy, setSecurityPolicy] = useState<McpSecurityPolicyDto>({
    unrestricted_execution_mode: false,
    trusted_external_mcp: {},
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdatingPolicy, setIsUpdatingPolicy] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newEndpoint, setNewEndpoint] = useState("http://127.0.0.1:9099/mcp");
  const [newToken, setNewToken] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [list, policy] = await Promise.all([
        projectBuilderApi.listProviders(),
        mcpSecurityApi.getPolicy(),
      ]);
      setProviders(list);
      setSecurityPolicy(policy);
    } finally {
      setIsLoading(false);
    }
  };

  const [actionBusy, setActionBusy] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadData();
  }, []);

  const handleRefreshProvider = async (id: string) => {
    setActionBusy((prev) => ({ ...prev, [id]: true }));
    try {
      await fetch(`${bridge.getBaseUrl()}/api/mcp/providers/${encodeURIComponent(id)}/refresh`, { method: "POST" });
      await loadData();
    } finally {
      setActionBusy((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleStartManagedService = async (id: string) => {
    setActionBusy((prev) => ({ ...prev, [id]: true }));
    try {
      await managedMcpApi.startService(id);
      await new Promise((r) => setTimeout(r, 600));
      await fetch(`${bridge.getBaseUrl()}/api/mcp/providers/${encodeURIComponent(id)}/refresh`, { method: "POST" }).catch(() => {});
      await loadData();
    } finally {
      setActionBusy((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleToggleTrust = async (endpointOrId: string) => {
    setIsUpdatingPolicy(true);
    try {
      const cleanEndpoint = endpointOrId.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
      let currentVal = false;
      if (securityPolicy.trusted_external_mcp[cleanEndpoint] !== undefined) {
        currentVal = Boolean(securityPolicy.trusted_external_mcp[cleanEndpoint]);
      } else if (securityPolicy.trusted_external_mcp[endpointOrId] !== undefined) {
        currentVal = Boolean(securityPolicy.trusted_external_mcp[endpointOrId]);
      }
      const nextVal = !currentVal;
      const updated = await mcpSecurityApi.setServerTrusted(endpointOrId, nextVal);
      setSecurityPolicy(updated);
    } finally {
      setIsUpdatingPolicy(false);
    }
  };

  const handleSetUnrestricted = async (enabled: boolean) => {
    setIsUpdatingPolicy(true);
    try {
      const updated = await mcpSecurityApi.setUnrestrictedMode(enabled);
      setSecurityPolicy(updated);
    } finally {
      setIsUpdatingPolicy(false);
    }
  };

  const handleAddProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newId.trim() || !newEndpoint.trim()) return;
    setIsSubmitting(true);
    setAddError(null);
    try {
      const res = await projectBuilderApi.registerProvider({
        id: newId.trim().toLowerCase(),
        name: newName.trim() || newId.trim(),
        endpoint: newEndpoint.trim(),
        token: newToken.trim() || undefined,
      });
      if (res.success) {
        setShowAddModal(false);
        setNewId("");
        setNewName("");
        setNewEndpoint("http://127.0.0.1:9099/mcp");
        setNewToken("");
        await loadData();
      } else {
        setAddError(res.error || "连接外部 MCP 失败");
      }
    } catch (err: any) {
      setAddError(err.message || String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const builtinServers = [
    {
      id: "srv-core",
      name: isZh ? "Nexus 核心 MCP 服务 (Canonical 332)" : "Nexus Core MCP Server",
      description: isZh ? "提供 332 个受控 Canonical 工具与沙箱环境" : "Local Model Context Protocol loopback server on standard port 18080",
      endpoint: "http://127.0.0.1:18080/mcp",
      protocol: "2024-11-05",
      toolsCount: mcpStatus?.toolsCount || 332,
      status: mcpStatus && !mcpStatus.paused ? (isZh ? "已连接" : "Connected") : (isZh ? "待命" : "Standby"),
    },
    {
      id: "srv-bridge",
      name: isZh ? "Nexus 公网 MCP 网关 (Bridge)" : "Nexus Public MCP Gateway",
      description: isZh ? "面向 Web ChatGPT 与 Cloudflare 隧道的 OAuth 2.0 聚合网关" : "Protected OAuth 2.0 reverse bridge for Web AI",
      endpoint: "http://127.0.0.1:8787/mcp",
      protocol: "OAuth 2.0 / Streamable HTTP",
      toolsCount: 451,
      status: isTunnelConnected ? (isZh ? "已连接" : "Connected") : (isZh ? "待命" : "Standby"),
    },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base overflow-y-auto p-6 space-y-6 font-mono">
      <div className="flex items-center justify-between gap-4 border-b border-theme-subtle pb-4">
        <div>
          <h1 className="text-base font-semibold text-theme-primary flex items-center gap-2">
            <Server className="w-4 h-4 text-sky-500" />
            <span>{isZh ? "MCP Provider 管理器 (MCP Provider Manager)" : "MCP Provider Manager"}</span>
          </h1>
          <p className="text-xs text-theme-muted mt-0.5">
            {isZh
              ? "内置 332+ 核心能力与动态外部 MCP Providers 汇聚"
              : "Unified built-in tools & dynamic external MCP providers"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            className="p-1.5 rounded text-theme-muted hover:text-theme-primary bg-theme-card border border-theme-subtle"
            title="刷新"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-semibold shadow-sm transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isZh ? "+ 添加外部 MCP" : "+ Add MCP Provider"}</span>
          </button>
        </div>
      </div>

      {/* 1. Global MCP Safety Policy */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs uppercase text-theme-muted font-bold tracking-wider">
            {isZh ? "全局 MCP 安全策略 (Global MCP Safety)" : "Global MCP Safety"}
          </h2>
          {securityPolicy.unrestricted_execution_mode ? (
            <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span>{isZh ? "无限制模式 (Unrestricted)" : "UNRESTRICTED"}</span>
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-[10px] bg-sky-500/15 text-sky-400 border border-sky-500/30 font-semibold flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-sky-400" />
              <span>{isZh ? "受保护模式 (Protected)" : "PROTECTED"}</span>
            </span>
          )}
        </div>

        <div className="p-5 rounded-xl border border-theme-subtle bg-theme-card/30 space-y-4 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Protected Option */}
            <div
              onClick={() => handleSetUnrestricted(false)}
              className={`p-3.5 rounded-lg border cursor-pointer transition flex items-start gap-3 ${
                !securityPolicy.unrestricted_execution_mode
                  ? "bg-sky-500/10 border-sky-500/40 text-theme-primary shadow-xs"
                  : "bg-theme-card/20 border-theme-subtle text-theme-muted hover:border-theme-subtle hover:text-theme-secondary"
              }`}
            >
              <div className="pt-0.5">
                <input
                  type="radio"
                  name="global_mcp_safety"
                  checked={!securityPolicy.unrestricted_execution_mode}
                  onChange={() => handleSetUnrestricted(false)}
                  className="text-sky-500 focus:ring-sky-500 cursor-pointer"
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs font-bold flex items-center gap-1.5 text-theme-primary">
                  <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                  <span>● Protected</span>
                </div>
                <p className="text-[11px] text-theme-muted leading-relaxed">
                  {isZh
                    ? "Nexus 使用正常 Safety Layer、危险操作分类和 Approval 机制保护本地与外部环境。"
                    : "Nexus operates standard Safety Layer, dangerous operation classification and Approval mechanism."}
                </p>
              </div>
            </div>

            {/* Unrestricted Option */}
            <div
              onClick={() => handleSetUnrestricted(true)}
              className={`p-3.5 rounded-lg border cursor-pointer transition flex items-start gap-3 ${
                securityPolicy.unrestricted_execution_mode
                  ? "bg-amber-500/10 border-amber-500/50 text-amber-300 shadow-xs"
                  : "bg-theme-card/20 border-theme-subtle text-theme-muted hover:border-theme-subtle hover:text-theme-secondary"
              }`}
            >
              <div className="pt-0.5">
                <input
                  type="radio"
                  name="global_mcp_safety"
                  checked={securityPolicy.unrestricted_execution_mode}
                  onChange={() => handleSetUnrestricted(true)}
                  className="text-amber-500 focus:ring-amber-500 cursor-pointer"
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs font-bold flex items-center gap-1.5 text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span>○ Unrestricted</span>
                </div>
                <p className="text-[11px] text-theme-muted leading-relaxed">
                  {isZh
                    ? "全局跳过 MCP 工具执行的 Safety / Approval 拦截，直接允许所有 MCP 请求直通执行。"
                    : "Bypass Nexus global MCP execution Safety / Approval interception for direct execution."}
                </p>
              </div>
            </div>
          </div>

          {/* Prominent Warning Banner when Unrestricted is Active */}
          {securityPolicy.unrestricted_execution_mode && (
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 space-y-1">
              <div className="flex items-center gap-2 font-bold text-xs tracking-wide">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>⚠ Unrestricted Execution Mode</span>
              </div>
              <p className="text-xs text-amber-300/90 pl-6">
                Nexus will execute MCP requests without Safety / Approval interception.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 2. Built-in Servers */}
      <div className="space-y-3">
        <h2 className="text-xs uppercase text-theme-muted font-bold tracking-wider">
          内置核心服务 (Built-in Providers)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {builtinServers.map((srv) => (
            <div
              key={srv.id}
              className="p-5 rounded-xl border border-theme-subtle bg-theme-card/30 space-y-3 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-theme-primary">{srv.name}</span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                  ● {srv.status}
                </span>
              </div>
              <p className="text-xs text-theme-muted">{srv.description}</p>
              <div className="pt-2 border-t border-theme-subtle/40 flex items-center justify-between text-xs text-theme-secondary">
                <span className="truncate max-w-[200px]">{srv.endpoint}</span>
                <strong className="text-sky-400">{srv.toolsCount} Tools</strong>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. External Dynamic Providers */}
      <div className="space-y-3">
        <h2 className="text-xs uppercase text-theme-muted font-bold tracking-wider">
          外部接入 Providers (External MCP Providers)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {providers
            .filter((p) => p.type !== "builtin-core")
            .map((prov) => {
              const cleanEndpoint = (prov.endpoint || "").replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
              const isTrusted = Boolean(
                securityPolicy.trusted_external_mcp[cleanEndpoint] ||
                securityPolicy.trusted_external_mcp[prov.id] ||
                securityPolicy.trusted_external_mcp[prov.endpoint]
              );

              return (
                <div
                  key={prov.id}
                  className="p-5 rounded-xl border border-theme-subtle bg-theme-card/30 space-y-3 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-theme-primary">{prov.name}</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] bg-sky-500/10 text-sky-400 border border-sky-500/20">
                        {prov.id}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          prov.connected
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                        }`}
                      >
                        ● {prov.connected ? "Connected" : "Disconnected"}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRefreshProvider(prov.id)}
                        disabled={actionBusy[prov.id]}
                        className="p-1 rounded bg-theme-base hover:bg-theme-card text-theme-muted hover:text-theme-primary border border-theme-subtle transition"
                        title={isZh ? "刷新连接状态与工具数" : "Refresh Provider"}
                      >
                        <RotateCw className={`w-3 h-3 ${actionBusy[prov.id] ? "animate-spin" : ""}`} />
                      </button>
                      {!prov.connected && (
                        <button
                          type="button"
                          onClick={() => handleStartManagedService(prov.id)}
                          disabled={actionBusy[prov.id]}
                          className="flex items-center gap-1 px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-semibold shadow-xs transition"
                          title={isZh ? "启动服务进程" : "Start Process"}
                        >
                          <Play className="w-2.5 h-2.5" />
                          <span>{isZh ? "启动" : "Start"}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {!prov.connected && (
                    <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-center justify-between">
                      <span>{isZh ? "服务处于未连接状态。若为本地工具，请点击右上角【启动】；若为云端服务，请在【云端与远程服务】中连接。" : "Service disconnected. Click Start above to launch."}</span>
                    </div>
                  )}

                  <div className="text-xs text-theme-muted space-y-1">
                    <div className="flex justify-between">
                      <span>Endpoint:</span>
                      <span className="text-theme-secondary truncate max-w-[220px]">{prov.endpoint}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>动态能力数:</span>
                      <strong className="text-sky-400">
                        {prov.toolCount} Tools {prov.metrics?.cachedToolCount ? `(${prov.metrics.cachedToolCount} cached)` : ""}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Session:</span>
                      <span className="text-theme-secondary truncate max-w-[200px]" title={prov.sessionId || prov.metrics?.sessionId || "None"}>
                        {prov.sessionId || prov.metrics?.sessionId || "None"}
                      </span>
                    </div>
                    {prov.metrics && (
                      <div className="pt-2 mt-2 border-t border-theme-subtle/40 space-y-1 text-[11px]">
                        <div className="flex justify-between text-theme-secondary">
                          <span>握手 / 发现:</span>
                          <span>
                            {prov.metrics.initLatencyMs}ms / {prov.metrics.listToolsLatencyMs}ms
                          </span>
                        </div>
                        <div className="flex justify-between text-theme-secondary">
                          <span>最近调用 / 平均:</span>
                          <span className="text-emerald-400">
                            {prov.metrics.lastCallLatencyMs}ms / {prov.metrics.avgCallLatencyMs}ms ({prov.metrics.totalCalls} calls)
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="flex justify-between pt-1">
                      <span>支持 Capabilities:</span>
                      <span className="text-theme-secondary truncate max-w-[220px]">
                        {prov.capabilities.join(", ") || "tools"}
                      </span>
                    </div>
                  </div>

                  {/* Trusted External MCP Control Section */}
                  <div className="pt-3 mt-2 border-t border-theme-subtle/50 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-theme-primary flex items-center gap-1.5">
                        {isTrusted ? (
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Shield className="w-3.5 h-3.5 text-amber-400" />
                        )}
                        <span>{isZh ? "Trusted External MCP" : "Trusted External MCP"}</span>
                      </div>
                      <div className="text-[10px] text-theme-muted mt-0.5">
                        {isTrusted
                          ? isZh
                            ? "已获授权，直接执行工具无需逐操作 Approval"
                            : "Authorized for direct execution without approval"
                          : isZh
                          ? "未受信，按原有 Safety / Approval 策略执行"
                          : "Untrusted: executed under standard Safety / Approval policy"}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isUpdatingPolicy}
                      onClick={() => handleToggleTrust(cleanEndpoint || prov.endpoint || prov.id)}
                      className={`px-3 py-1 rounded-md text-[11px] font-bold transition flex items-center gap-1.5 border shadow-xs ${
                        isTrusted
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25"
                          : "bg-theme-card text-theme-muted border-theme-subtle hover:text-theme-primary hover:border-theme-primary"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${isTrusted ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"}`} />
                      <span>{isTrusted ? "TRUSTED [ON]" : "UNTRUSTED [OFF]"}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          {providers.filter((p) => p.type !== "builtin-core").length === 0 && (
            <div className="p-8 text-center text-xs text-theme-muted bg-theme-card/20 border border-theme-subtle rounded-xl col-span-2">
              暂无已连接的外部 MCP Provider，点击上方“添加外部 MCP”即可接入 Blender、Browser 或自定义 MCP。
            </div>
          )}
        </div>
      </div>

      {/* Add MCP Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 font-mono">
          <div className="w-full max-w-md bg-theme-base border border-theme-subtle rounded-xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-theme-subtle pb-3">
              <h3 className="text-sm font-bold text-theme-primary">添加外部 MCP Provider</h3>
              <button onClick={() => setShowAddModal(false)} className="text-theme-muted hover:text-theme-primary text-xs">
                ✕
              </button>
            </div>

            {addError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded text-rose-400 text-xs">
                {addError}
              </div>
            )}

            <form onSubmit={handleAddProvider} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-theme-muted block">Provider ID (唯一标识)</label>
                <input
                  type="text"
                  required
                  placeholder="例如: blender-mcp 或 browser-mcp"
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  className="w-full p-2 bg-theme-card border border-theme-subtle rounded text-theme-primary focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-theme-muted block">Provider 显示名称</label>
                <input
                  type="text"
                  placeholder="例如: Blender 3D Automation MCP"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full p-2 bg-theme-card border border-theme-subtle rounded text-theme-primary focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-theme-muted block">MCP Endpoint (Streamable HTTP / SSE)</label>
                <input
                  type="url"
                  required
                  placeholder="http://127.0.0.1:9099/mcp"
                  value={newEndpoint}
                  onChange={(e) => setNewEndpoint(e.target.value)}
                  className="w-full p-2 bg-theme-card border border-theme-subtle rounded text-theme-primary focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-theme-muted block">可选 Bearer Token (如有)</label>
                <input
                  type="password"
                  placeholder="留空即免认证"
                  value={newToken}
                  onChange={(e) => setNewToken(e.target.value)}
                  className="w-full p-2 bg-theme-card border border-theme-subtle rounded text-theme-primary focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-theme-subtle">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded text-theme-muted hover:text-theme-primary bg-theme-card border border-theme-subtle"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium shadow-sm transition disabled:opacity-50"
                >
                  {isSubmitting ? "正在握手与发现工具..." : "测试连接并登记"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
