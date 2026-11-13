import React, { useState, useEffect } from "react";
import {
  AppWindow,
  Play,
  Square,
  Trash2,
  Zap,
  RotateCw,
  Copy,
  Check,
  Terminal,
  ChevronDown,
  ChevronRight,
  Code2,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation.js";
import { managedMcpApi, type ManagedMcpStateDto } from "../../api/managed-mcp-api.js";
import { unityApi } from "../../api/unity-api.js";

const DEFAULT_PRESET_SERVICES: ManagedMcpStateDto[] = [
  { config: { id: "blender-mcp", name: "Blender 3D Automation", command: "uv", args: [], port: 9099, endpoint: "http://127.0.0.1:9099/mcp" }, status: "STOPPED", logs: [], toolCount: 0 },
  { config: { id: "photoshop-mcp", name: "Photoshop 自动化 MCP", command: "npx.cmd", args: [], port: 9095, endpoint: "http://127.0.0.1:9095/mcp" }, status: "STOPPED", logs: [], toolCount: 0 },
  { config: { id: "playwright", name: "Playwright", command: "npx.cmd", args: [], port: 9100, endpoint: "http://127.0.0.1:9100/mcp" }, status: "STOPPED", logs: [], toolCount: 0 },
  { config: { id: "agentic-tools-mcp", name: "Agentic-tools-mcp", command: "npx.cmd", args: [], port: 9103, endpoint: "http://127.0.0.1:9103/mcp" }, status: "STOPPED", logs: [], toolCount: 0 },
  { config: { id: "code-reasoning", name: "Code-reasoning", command: "npx.cmd", args: [], port: 9104, endpoint: "http://127.0.0.1:9104/mcp" }, status: "STOPPED", logs: [], toolCount: 0 },
  { config: { id: "windows-mcp", name: "Windows-MCP", command: "npx.cmd", args: [], port: 9105, endpoint: "http://127.0.0.1:9105/mcp" }, status: "STOPPED", logs: [], toolCount: 0 },
  { config: { id: "autocad", name: "Autocad", command: "uv", args: [], port: 9107, endpoint: "http://127.0.0.1:9107/mcp" }, status: "STOPPED", logs: [], toolCount: 0 },
  { config: { id: "wikipedia-mcp", name: "Wikipedia-mcp", command: "npx.cmd", args: [], port: 9108, endpoint: "http://127.0.0.1:9108/mcp" }, status: "STOPPED", logs: [], toolCount: 0 },
  { config: { id: "cloudflare-observability", name: "Cloudflare-observability", command: "npx.cmd", args: [], port: 9109, endpoint: "http://127.0.0.1:9109/mcp" }, status: "STOPPED", logs: [], toolCount: 0 },
  { config: { id: "crawl4ai", name: "Crawl4ai 极速提纯", command: "uv", args: [], port: 9111, endpoint: "http://127.0.0.1:9111/mcp" }, status: "STOPPED", logs: [], toolCount: 0 },
  { config: { id: "telegram-mcp", name: "Telegram 全能管理 (Telethon)", command: "uv", args: [], port: 9119, endpoint: "http://127.0.0.1:9119/mcp" }, status: "STOPPED", logs: [], toolCount: 136 },
];

export const ApplicationsPage: React.FC = () => {
  const { language } = useTranslation();
  const isZh = language.startsWith("zh");

  // Services list with default preset fallback
  const [services, setServices] = useState<ManagedMcpStateDto[]>(DEFAULT_PRESET_SERVICES);
  const [unityStatus, setUnityStatus] = useState<string>("DISCONNECTED");
  const [isLoading, setIsLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<Record<string, boolean>>({});
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Token Optimization Mode State (Master & Per-Provider)
  const [isMasterTokenMode, setIsMasterTokenMode] = useState<boolean>(true);
  const [providerTokenModes, setProviderTokenModes] = useState<Record<string, boolean>>({});

  // Quick Test Script Scratchpad
  const [showTester, setShowTester] = useState(false);
  const [testRuntime, setTestRuntime] = useState<"python" | "node">("python");
  const [testScript, setTestScript] = useState(
    `import nexus\n\n# 查询 AutoCAD 图纸状态\ntry:\n    info = nexus.cad.drawing_info()\n    print("AutoCAD Info:", info)\nexcept Exception as e:\n    print("CAD Notice:", e)\n`
  );
  const [testOutput, setTestOutput] = useState<string>("");
  const [isTesting, setIsTesting] = useState(false);

  // Delete Confirm Modal State
  const [deleteTarget, setDeleteTarget] = useState<ManagedMcpStateDto | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load state from backend
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [servicesList, tokenModeRes, uStatus] = await Promise.allSettled([
        managedMcpApi.listServices(),
        managedMcpApi.getTokenMode(),
        unityApi.getStatus(),
      ]);

      if (servicesList.status === "fulfilled" && Array.isArray(servicesList.value) && servicesList.value.length > 0) {
        setServices(servicesList.value);
      }
      if (tokenModeRes.status === "fulfilled") {
        setIsMasterTokenMode(tokenModeRes.value.master);
        setProviderTokenModes(tokenModeRes.value.providers || {});
      }
      if (uStatus.status === "fulfilled" && uStatus.value) {
        setUnityStatus(uStatus.value.unity);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      managedMcpApi.listServices().then((list) => {
        if (Array.isArray(list) && list.length > 0) {
          setServices(list);
        }
      }).catch(() => {});
      unityApi.getStatus().then((st) => setUnityStatus(st.unity)).catch(() => {});
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Toggle Master Token Mode
  const handleToggleMasterToken = async () => {
    const nextMaster = !isMasterTokenMode;
    setIsMasterTokenMode(nextMaster);
    try {
      const res = await managedMcpApi.setTokenMode({ master: nextMaster });
      setIsMasterTokenMode(res.master);
      setProviderTokenModes(res.providers || {});
    } catch {
      setIsMasterTokenMode(!nextMaster);
    }
  };

  // Toggle Per-Provider Token Mode
  const handleToggleProviderToken = async (providerId: string) => {
    if (!isMasterTokenMode) return; // Master switch locked
    const current = providerTokenModes[providerId] !== false; // default true
    const nextVal = !current;
    setProviderTokenModes((prev) => ({ ...prev, [providerId]: nextVal }));
    try {
      const res = await managedMcpApi.setTokenMode({ providerId, enabled: nextVal });
      setProviderTokenModes(res.providers || {});
    } catch {
      setProviderTokenModes((prev) => ({ ...prev, [providerId]: current }));
    }
  };

  // Start Service
  const handleStart = async (id: string) => {
    setActionBusy((prev) => ({ ...prev, [id]: true }));
    setServices((prev) =>
      prev.map((s) => (s.config?.id === id ? { ...s, status: "STARTING" } : s))
    );
    try {
      await managedMcpApi.startService(id);
      await loadData();
    } finally {
      setActionBusy((prev) => ({ ...prev, [id]: false }));
    }
  };

  // Stop Service
  const handleStop = async (id: string) => {
    setActionBusy((prev) => ({ ...prev, [id]: true }));
    setServices((prev) =>
      prev.map((s) => (s.config?.id === id ? { ...s, status: "STOPPED" } : s))
    );
    try {
      await managedMcpApi.stopService(id);
      await loadData();
    } finally {
      setActionBusy((prev) => ({ ...prev, [id]: false }));
    }
  };

  // Delete Service (Confirm & Delete)
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      if (deleteTarget.status === "RUNNING") {
        await managedMcpApi.stopService(deleteTarget.config.id);
      }
      await managedMcpApi.deleteCustomService(deleteTarget.config.id);
      setDeleteTarget(null);
      await loadData();
    } finally {
      setIsDeleting(false);
    }
  };

  // Copy MCP Config
  const handleCopyMcpConfig = (service?: ManagedMcpStateDto) => {
    let configObj: any;
    if (service) {
      configObj = {
        mcpServers: {
          [service.config.id]: {
            url: `http://127.0.0.1:8787/mcp/${service.config.id}`,
          },
        },
      };
    } else {
      configObj = {
        mcpServers: {
          nexus: {
            url: "http://127.0.0.1:8787/mcp",
          },
        },
      };
    }
    navigator.clipboard.writeText(JSON.stringify(configObj, null, 2));
    const targetKey = service ? service.config.id : "global";
    setCopiedId(targetKey);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Run Test Script
  const handleRunScript = async () => {
    setIsTesting(true);
    setTestOutput(isZh ? "正在通过 Nexus 执行内核调度脚本..." : "Executing script via Nexus execution kernel...");
    try {
      const res = await managedMcpApi.executeScript({
        runtime: testRuntime,
        script: testScript,
        timeoutMs: 30000,
      });
      if (res.success) {
        setTestOutput(res.stdout || (isZh ? "[执行成功，无标准输出返回]" : "[Success: No stdout returned]"));
      } else {
        setTestOutput(`[Error: ${res.error || "Failed"}]\n${res.stderr || ""}`);
      }
    } catch (err: any) {
      setTestOutput(`[Network Error]: ${err.message || String(err)}`);
    } finally {
      setIsTesting(false);
    }
  };

  // Calculate live exposed tool summary
  const totalToolsInPool = services.reduce((acc, s) => acc + (s.toolCount || 0), 0) + (unityStatus === "CONNECTED" ? 110 : 0) + 332;
  const savingServicesCount = services.filter((s) => isMasterTokenMode && providerTokenModes[s.config.id] !== false).length;

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base overflow-hidden">
      {/* 1. Header & Master Token Control Bar */}
      <div className="px-6 py-4 border-b border-theme-subtle bg-theme-card/30 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-base font-semibold text-theme-primary flex items-center gap-2">
            <AppWindow className="w-4 h-4 text-sky-500" />
            <span>{isZh ? "外部应用工作台" : "External Applications Hub"}</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-500 border border-sky-500/20">
              Universal MCP Bridge
            </span>
          </h1>
          <p className="text-xs text-theme-muted mt-0.5">
            {isZh
              ? "聚合控制本地外部 MCP 进程与宿主环境 • 双向执行网关"
              : "Unified local execution bridge & lifecycle supervision for external MCPs"}
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => handleCopyMcpConfig()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-theme-card hover:bg-theme-card-hover border border-theme-subtle text-xs text-theme-primary transition shadow-xs"
          >
            {copiedId === "global" ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-500 font-medium">{isZh ? "已复制配置" : "Copied"}</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-theme-muted" />
                <span>{isZh ? "复制全局 MCP 配置" : "Copy Global MCP Config"}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowTester(!showTester)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border shadow-xs ${
              showTester
                ? "bg-sky-500/10 text-sky-500 border-sky-500/30"
                : "bg-theme-card hover:bg-theme-card-hover border-theme-subtle text-theme-primary"
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>{isZh ? "代码执行测试器" : "Script Tester"}</span>
          </button>

          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            className="p-1.5 rounded-lg bg-theme-card hover:bg-theme-card-hover border border-theme-subtle text-theme-muted hover:text-theme-primary transition"
            title={isZh ? "刷新全部状态" : "Refresh All"}
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-sky-500" : ""}`} />
          </button>
        </div>
      </div>

      {/* 2. Master Token Optimization Switch Banner */}
      <div className="px-6 py-3.5 bg-gradient-to-r from-sky-500/5 via-indigo-500/5 to-transparent border-b border-theme-subtle shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              onClick={handleToggleMasterToken}
              className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out shrink-0 ${
                isMasterTokenMode ? "bg-emerald-500" : "bg-zinc-600/50"
              }`}
              title={isZh ? "切换全局极致 Token 优化模式" : "Toggle Master Token Optimization"}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                  isMasterTokenMode ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs text-theme-primary flex items-center gap-1">
                  <Zap className={`w-3.5 h-3.5 ${isMasterTokenMode ? "text-amber-400 fill-amber-400" : "text-zinc-400"}`} />
                  <span>{isZh ? "极致 Token 优化总控" : "Master Token Optimization"}</span>
                </span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.2 rounded-full font-medium ${
                    isMasterTokenMode
                      ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                      : "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"
                  }`}
                >
                  {isMasterTokenMode
                    ? isZh ? "🟢 已开启（推荐）" : "🟢 Enabled (Recommended)"
                    : isZh ? "⚪ 已停用（全量模式）" : "⚪ Disabled (Full Mode)"}
                </span>
              </div>
              <div className="text-[11px] text-theme-muted mt-0.5">
                {isMasterTokenMode
                  ? isZh
                    ? "当前暴露: 3 个通用执行元工具 | AI 上下文占用: < 400 Token | 节省 95%+。"
                    : "Exposing 3 universal meta-tools | Context footprint < 400 Tokens | 95%+ savings."
                  : isZh
                    ? "当前暴露: 588+ 个原生工具 | 适合无代码执行能力的传统模型。"
                    : "Exposing 588+ native tools directly | Standard legacy mode."}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono text-theme-muted self-end sm:self-center">
            <span>
              {isZh ? "总能力池:" : "Tool Pool:"}{" "}
              <strong className="text-theme-primary">{totalToolsInPool}</strong>
            </span>
            <span>&bull;</span>
            <span>
              {isZh ? "已收敛保护:" : "Collapsed:"}{" "}
              <strong className="text-emerald-500">{savingServicesCount} MCPs</strong>
            </span>
          </div>
        </div>
      </div>

      {/* 3. Main Workspace Area: Applications Cards Grid */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((s) => {
            if (!s || !s.config) return null;
            const isSaving = isMasterTokenMode && providerTokenModes[s.config.id] !== false;
            const isRunning = s.status === "RUNNING";
            const isBusy = actionBusy[s.config.id] || false;
            const isLogOpen = expandedLogs[s.config.id] || false;

            return (
              <div
                key={s.config.id}
                className={`flex flex-col rounded-xl border bg-theme-card transition shadow-xs hover:border-theme-subtle/80 ${
                  isRunning
                    ? "border-emerald-500/30"
                    : s.status === "ERROR"
                    ? "border-rose-500/30"
                    : "border-theme-subtle"
                }`}
              >
                {/* Card Top: Title, ID & Status Indicator */}
                <div className="p-4 border-b border-theme-subtle/50 flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-theme-primary truncate">
                        {s.config.name}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-theme-subtle/40 text-theme-muted truncate">
                        {s.config.id}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-theme-muted flex items-center gap-2">
                      <span>Port: :{s.config.port}</span>
                      <span>&bull;</span>
                      <span>{s.toolCount || 0} Tools</span>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono shrink-0 font-medium ${
                      isRunning
                        ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                        : s.status === "STARTING"
                        ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                        : s.status === "ERROR"
                        ? "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                        : "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isRunning
                          ? "bg-emerald-500 animate-pulse"
                          : s.status === "STARTING"
                          ? "bg-amber-500 animate-pulse"
                          : s.status === "ERROR"
                          ? "bg-rose-500"
                          : "bg-zinc-400"
                      }`}
                    />
                    <span>{isRunning ? "运行中" : s.status === "STARTING" ? "启动中" : s.status === "ERROR" ? "异常" : "已停止"}</span>
                  </span>
                </div>

                {/* Card Middle: 4 Pure Essential Action Buttons */}
                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    {/* [按键 1] ⚡ 节约 Token 开关 (针对该工具独立开启/关闭) */}
                    <div className="flex items-center justify-between p-2 rounded-lg bg-theme-base/60 border border-theme-subtle/50">
                      <div className="flex items-center gap-2 min-w-0">
                        <Zap className={`w-3.5 h-3.5 shrink-0 ${isSaving ? "text-amber-400" : "text-zinc-400"}`} />
                        <span className="text-xs font-medium text-theme-primary truncate">
                          {isZh ? "节约 Token 开关" : "Token Optimization"}
                        </span>
                      </div>

                      <button
                        type="button"
                        disabled={!isMasterTokenMode}
                        onClick={() => handleToggleProviderToken(s.config.id)}
                        className={`text-[11px] font-mono px-2.5 py-1 rounded transition flex items-center gap-1.5 font-medium ${
                          !isMasterTokenMode
                            ? "bg-zinc-500/10 text-zinc-500 cursor-not-allowed border border-zinc-500/20"
                            : isSaving
                            ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/30"
                            : "bg-zinc-500/10 hover:bg-zinc-500/20 text-zinc-400 border border-zinc-500/20"
                        }`}
                        title={
                          !isMasterTokenMode
                            ? isZh ? "总开关未开启，该选项已跟随全局全量暴露" : "Master switch disabled"
                            : isSaving ? isZh ? "点击关闭该工具的 Token 节约" : "Click to disable" : isZh ? "点击开启该工具的 Token 节约" : "Click to enable"
                        }
                      >
                        <span>{isSaving ? "🟢 开启" : "⚪ 关闭"}</span>
                      </button>
                    </div>

                    {/* [按键 2, 3, 4] 开启、关闭、删除 三大快捷动作 */}
                    <div className="grid grid-cols-3 gap-2">
                      {/* [按键 2] ▶ 开启 */}
                      <button
                        type="button"
                        disabled={isRunning || isBusy}
                        onClick={() => handleStart(s.config.id)}
                        className={`w-full py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                          isRunning
                            ? "bg-theme-subtle/30 text-theme-muted cursor-not-allowed border border-transparent"
                            : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs"
                        }`}
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>{isZh ? "开启" : "Start"}</span>
                      </button>

                      {/* [按键 3] ⏹ 关闭 */}
                      <button
                        type="button"
                        disabled={!isRunning || isBusy}
                        onClick={() => handleStop(s.config.id)}
                        className={`w-full py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                          !isRunning
                            ? "bg-theme-subtle/30 text-theme-muted cursor-not-allowed border border-transparent"
                            : "bg-rose-600 hover:bg-rose-500 text-white shadow-xs"
                        }`}
                      >
                        <Square className="w-3 h-3 fill-current" />
                        <span>{isZh ? "关闭" : "Stop"}</span>
                      </button>

                      {/* [按键 4] 🗑 删除 */}
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setDeleteTarget(s)}
                        className="w-full py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 bg-theme-base hover:bg-rose-500/10 text-theme-muted hover:text-rose-500 border border-theme-subtle hover:border-rose-500/30 transition shadow-xs"
                        title={isZh ? "从托管中删除此应用" : "Delete application"}
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>{isZh ? "删除" : "Delete"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Bottom Strip: Single-click copy & Log expand toggle */}
                  <div className="pt-2 border-t border-theme-subtle/40 flex items-center justify-between text-[11px] text-theme-muted">
                    <button
                      type="button"
                      onClick={() => handleCopyMcpConfig(s)}
                      className="hover:text-theme-primary flex items-center gap-1 transition"
                    >
                      {copiedId === s.config.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-500" />
                          <span className="text-emerald-500">{isZh ? "已复制" : "Copied"}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>{isZh ? "复制配置" : "Copy"}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedLogs((prev) => ({ ...prev, [s.config.id]: !prev[s.config.id] }))
                      }
                      className="hover:text-theme-primary flex items-center gap-1 transition"
                    >
                      <Terminal className="w-3 h-3" />
                      <span>{isLogOpen ? (isZh ? "收起日志" : "Logs") : (isZh ? "查看日志" : "Logs")}</span>
                      {isLogOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                  </div>
                </div>

                {/* Collapsible Console Log View */}
                {isLogOpen && (
                  <div className="p-3 bg-zinc-950 border-t border-theme-subtle font-mono text-[11px] text-zinc-300 max-h-40 overflow-y-auto rounded-b-xl space-y-1">
                    {s.logs && s.logs.length > 0 ? (
                      s.logs.slice(-20).map((line, idx) => (
                        <div key={idx} className="whitespace-pre-wrap break-all leading-tight">
                          {line}
                        </div>
                      ))
                    ) : (
                      <div className="text-zinc-600 italic">{isZh ? "[暂无控制台日志输出]" : "[No logs yet]"}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 4. Interactive Script Execution Scratchpad (when toggled) */}
        {showTester && (
          <div className="p-5 rounded-xl border border-sky-500/30 bg-theme-card/60 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sky-500" />
                <span className="font-semibold text-xs text-theme-primary">
                  {isZh ? "交互式多应用调度测试器 (nexus_run_script)" : "Interactive Script Runner"}
                </span>
                <span className="text-[10px] text-theme-muted font-mono">
                  {isZh ? "支持 Python / Node.js 跨应用无感调度" : "Python / Node.js Host Automation"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={testRuntime}
                  onChange={(e) => setTestRuntime(e.target.value as any)}
                  className="bg-theme-base border border-theme-subtle text-theme-primary text-xs rounded-md px-2 py-1 font-mono"
                >
                  <option value="python">Python (SDK)</option>
                  <option value="node">Node.js (Proxy)</option>
                </select>

                <button
                  type="button"
                  disabled={isTesting}
                  onClick={handleRunScript}
                  className="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-md text-xs font-medium flex items-center gap-1.5 transition shadow-xs"
                >
                  <Play className={`w-3 h-3 fill-current ${isTesting ? "animate-spin" : ""}`} />
                  <span>{isTesting ? (isZh ? "执行中..." : "Running...") : (isZh ? "运行脚本" : "Run")}</span>
                </button>
              </div>
            </div>

            <textarea
              value={testScript}
              onChange={(e) => setTestScript(e.target.value)}
              rows={5}
              className="w-full p-3 bg-zinc-950 text-emerald-400 font-mono text-xs rounded-lg border border-theme-subtle focus:border-sky-500 focus:outline-none resize-y"
              placeholder={isZh ? "在此输入 Python 或 Node 代码..." : "Enter code here..."}
            />

            {testOutput && (
              <div className="p-3 bg-zinc-950/80 rounded-lg border border-theme-subtle font-mono text-xs text-zinc-300 max-h-48 overflow-y-auto whitespace-pre-wrap">
                {testOutput}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Delete Confirm Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-theme-card border border-theme-subtle rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start gap-3 text-rose-500">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-sm text-theme-primary">
                  {isZh ? "确认删除该托管应用？" : "Delete Application?"}
                </h3>
                <p className="text-xs text-theme-muted mt-1 leading-relaxed">
                  {isZh
                    ? `您即将删除应用「${deleteTarget.config.name}」(${deleteTarget.config.id})。如果正在运行，将自动终止进程并释放端口。`
                    : `Are you sure you want to delete '${deleteTarget.config.name}'?`}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                className="px-3.5 py-1.5 rounded-lg border border-theme-subtle text-xs text-theme-primary hover:bg-theme-card-hover transition"
              >
                {isZh ? "取消" : "Cancel"}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition shadow-xs"
              >
                {isDeleting ? (isZh ? "删除中..." : "Deleting...") : (isZh ? "确认删除" : "Confirm Delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
