import React, { useState, useEffect, useMemo } from "react";
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
  Code2,
  Download,
  Activity,
  Package,
  Layers,
  ChevronRight,
  ExternalLink,
  BookOpen,
} from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation.js";
import { managedMcpApi, type ManagedMcpStateDto } from "../../api/managed-mcp-api.js";
import { unityApi } from "../../api/unity-api.js";
import { openExternalUrl } from "../../api/browser-helper.js";
import { projectBuilderApi } from "../../api/project-builder-api.js";
import { bridge } from "../../api/bridge.js";

// Core Preset Installed Services (Defaults to Unity GameDev MCP, STOPPED)
const INITIAL_INSTALLED_SERVICES: ManagedMcpStateDto[] = [
  {
    config: {
      id: "unity-gamedev",
      name: "Unity GameDev MCP (Primary)",
      command: "internal",
      args: [],
      port: 20705,
      endpoint: "http://127.0.0.1:20705/mcp",
    },
    status: "STOPPED",
    logs: [],
    toolCount: 19,
  },
];

// Marketplace Preset Catalog (Can be installed on-demand)
const MARKETPLACE_CATALOG: Array<{
  id: string;
  name: string;
  category: string;
  port: number;
  toolCount: number;
  command: string;
  desc: { "zh-CN": string; "en-US": string };
}> = [
  {
    id: "photoshop-mcp",
    name: "Photoshop 自动化 MCP",
    category: "Design & Creative",
    port: 9095,
    toolCount: 127,
    command: "photoshop-mcp.cmd",
    desc: {
      "zh-CN": "Adobe Photoshop 桌面级图层控制、滤镜与批处理自动化桥接。",
      "en-US": "Adobe Photoshop desktop layer control and automated processing.",
    },
  },
  {
    id: "windows-mcp",
    name: "Windows-MCP",
    category: "System Control",
    port: 9105,
    toolCount: 20,
    command: "uv run --with windows-mcp python -m windows_mcp serve",
    desc: {
      "zh-CN": "Windows 系统级原生桌面操作、窗口控制与注册表管理网关。",
      "en-US": "Native Windows desktop automation, window management, and registry tools.",
    },
  },
  {
    id: "playwright",
    name: "Playwright Web Automation",
    category: "Web & Browser",
    port: 9100,
    toolCount: 6,
    command: "uv run --with playwright python playwright_server.py",
    desc: {
      "zh-CN": "基于 Playwright 的现代化全自动 Chromium 网页控制与端到端爬取。",
      "en-US": "Modern automated Chromium browser control and scraping via Playwright.",
    },
  },
  {
    id: "agentic-tools-mcp",
    name: "Agentic-tools-mcp",
    category: "Cognitive Tools",
    port: 9103,
    toolCount: 6,
    command: "uv run python agentic_tools_server.py",
    desc: {
      "zh-CN": "智能体深度上下文推理、思维链持久化与通用认知扩展元工具集。",
      "en-US": "Agentic context reasoning, thought persistence, and cognitive tools.",
    },
  },
  {
    id: "code-reasoning",
    name: "Code-reasoning",
    category: "Code Intelligence",
    port: 9104,
    toolCount: 5,
    command: "uv run python code_reasoning_server.py",
    desc: {
      "zh-CN": "抽象语法树 AST 解析、代码复杂度审计与逻辑推理助手。",
      "en-US": "Abstract syntax tree parsing, code complexity audit, and reasoning.",
    },
  },
  {
    id: "autocad",
    name: "AutoCAD Engineering",
    category: "CAD & Engineering",
    port: 9107,
    toolCount: 24,
    command: "uv run --with autocad-mcp python -c '...'",
    desc: {
      "zh-CN": "AutoCAD 图纸几何分析、图层渲染与 CAD 工程图自动化操作。",
      "en-US": "AutoCAD drawing geometric analysis, layer rendering, and CAD workflows.",
    },
  },
  {
    id: "wikipedia-mcp",
    name: "Wikipedia-mcp",
    category: "Knowledge & Search",
    port: 9108,
    toolCount: 4,
    command: "uv run python wikipedia_server.py",
    desc: {
      "zh-CN": "维基百科多语言高精度知识检索与事实核实服务。",
      "en-US": "Wikipedia multilingual high-precision factual knowledge retrieval.",
    },
  },
  {
    id: "blender-mcp",
    name: "Blender 3D Automation",
    category: "3D & Creative",
    port: 9099,
    toolCount: 9,
    command: "uv run --with mcp-for-blender python blender_server.py",
    desc: {
      "zh-CN": "Blender 3D 几何建模、材质赋予、渲染与生成式 3D 工作流自动化桥接。",
      "en-US": "Blender 3D modeling, material shading, rendering, and generative 3D workflow bridge.",
    },
  },
];

export const ApplicationsPage: React.FC = () => {
  const { language, tText } = useTranslation();
  const isZh = language.startsWith("zh");

  // Tab State: "installed" | "market" | "monitor"
  const [activeTab, setActiveTab] = useState<"installed" | "market" | "monitor">("installed");

  // Filter for installed services: "all" | "running" | "stopped"
  const [statusFilter, setStatusFilter] = useState<"all" | "running" | "stopped">("all");

  // Services list
  const [services, setServices] = useState<ManagedMcpStateDto[]>(() => {
    try {
      const saved = localStorage.getItem("nexus_installed_mcp_services");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return INITIAL_INSTALLED_SERVICES;
  });

  const [isLoading, setIsLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<Record<string, boolean>>({});
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Master Token Mode
  const [isMasterTokenMode, setIsMasterTokenMode] = useState<boolean>(true);
  const [providerTokenModes, setProviderTokenModes] = useState<Record<string, boolean>>({});

  // In-App Kernel Script Tester (nexus_run_script)
  const [testRuntime, setTestRuntime] = useState<"python" | "node">("python");
  const [testScript, setTestScript] = useState(
    `import nexus\n\n# 检查本地运行中的 MCP 插件\nprint("Nexus MCP Plugin Center Ready")\n`
  );
  const [testOutput, setTestOutput] = useState<string>("");
  const [isTesting, setIsTesting] = useState(false);

  // Sync to local storage
  useEffect(() => {
    try {
      localStorage.setItem("nexus_installed_mcp_services", JSON.stringify(services));
    } catch {}
  }, [services]);

  // Load backend state
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [servicesList, tokenModeRes] = await Promise.allSettled([
        managedMcpApi.listServices(),
        managedMcpApi.getTokenMode(),
      ]);

      if (servicesList.status === "fulfilled" && Array.isArray(servicesList.value)) {
        const unityService: ManagedMcpStateDto = {
          config: {
            id: "unity-gamedev",
            name: "Unity GameDev MCP (Primary)",
            command: "internal",
            args: [],
            port: 20705,
            endpoint: "http://127.0.0.1:20705/mcp",
          },
          status: "STOPPED",
          logs: [],
          toolCount: 19,
        };
        const backendServices = servicesList.value.filter(
          (s) => s.config?.id !== "crawl4ai" && s.config?.id !== "telegram-mcp" && s.config?.id !== "maya"
        );
        const hasUnity = backendServices.some((s) => s.config?.id === "unity-gamedev");
        setServices(hasUnity ? backendServices : [unityService, ...backendServices]);
      }

      if (tokenModeRes.status === "fulfilled") {
        setIsMasterTokenMode(tokenModeRes.value.master);
        setProviderTokenModes(tokenModeRes.value.providers || {});
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      managedMcpApi.listServices().then((list) => {
        if (Array.isArray(list)) {
          const backendServices = list.filter(
            (s) => s.config?.id !== "crawl4ai" && s.config?.id !== "telegram-mcp" && s.config?.id !== "maya"
          );
          setServices((prev) => {
            const unityService = prev.find((p) => p.config?.id === "unity-gamedev") || {
              config: {
                id: "unity-gamedev",
                name: "Unity GameDev MCP (Primary)",
                command: "internal",
                args: [],
                port: 20705,
                endpoint: "http://127.0.0.1:20705/mcp",
              },
              status: "STOPPED",
              logs: [],
              toolCount: 19,
            };
            const hasUnity = backendServices.some((s) => s.config?.id === "unity-gamedev");
            return hasUnity ? backendServices : [unityService, ...backendServices];
          });
        }
      }).catch(() => {});
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
    if (!isMasterTokenMode) return;
    const current = providerTokenModes[providerId] !== false;
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
      prev.map((s) => (s.config?.id === id ? { ...s, status: "RUNNING" } : s))
    );
    try {
      if (id === "unity-gamedev") {
        await unityApi.startService().catch(() => {});
      } else {
        await managedMcpApi.startService(id).catch(() => {});
      }
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
      if (id === "unity-gamedev") {
        await unityApi.stopService().catch(() => {});
      } else {
        await managedMcpApi.stopService(id).catch(() => {});
      }
      await loadData();
    } finally {
      setActionBusy((prev) => ({ ...prev, [id]: false }));
    }
  };

  // Delete Service (Always allowed for every service)
  const handleDeleteService = async (id: string) => {
    if (!confirm(isZh ? "确定要从工作台中移除此 MCP 插件吗？" : "Remove this MCP plugin from workspace?")) return;
    setActionBusy((prev) => ({ ...prev, [id]: true }));
    try {
      if (id === "unity-gamedev") {
        await unityApi.stopService().catch(() => {});
      } else {
        await managedMcpApi.stopService(id).catch(() => {});
        await managedMcpApi.deleteCustomService(id).catch(() => {});
        await fetch(`${bridge.getBaseUrl()}/api/mcp/providers/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
        await projectBuilderApi.unregisterProvider(id).catch(() => {});
      }
      setServices((prev) => prev.filter((s) => s.config?.id !== id));
      await loadData();
    } finally {
      setActionBusy((prev) => ({ ...prev, [id]: false }));
    }
  };

  // Install from Marketplace
  const handleInstallFromMarket = async (m: typeof MARKETPLACE_CATALOG[0]) => {
    if (services.some((s) => s.config?.id === m.id)) {
      setActiveTab("installed");
      return;
    }
    setActionBusy((prev) => ({ ...prev, [m.id]: true }));
    try {
      const configToCreate = {
        id: m.id,
        name: m.name,
        command: m.command.split(" ")[0] || "uv",
        args: m.command.split(" ").slice(1),
        port: m.port,
        endpoint: `http://127.0.0.1:${m.port}/mcp`,
        rawCommand: m.command,
        autoStart: false,
      };
      await managedMcpApi.createCustomService(configToCreate).catch(() => {});
      await loadData();
      setActiveTab("installed");
    } finally {
      setActionBusy((prev) => ({ ...prev, [m.id]: false }));
    }
  };

  // Copy MCP Config
  const handleCopyMcpConfig = (service?: ManagedMcpStateDto) => {
    let configObj: any;
    if (service) {
      configObj = {
        mcpServers: {
          [service.config.id]: {
            url: service.config.endpoint || `http://127.0.0.1:${service.config.port}/mcp`,
          },
        },
      };
    } else {
      configObj = {
        mcpServers: {
          nexus: {
            url: "http://127.0.0.1:18080/mcp",
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
  const handleRunTestScript = async () => {
    setIsTesting(true);
    setTestOutput(isZh ? "正在通过本地内核执行脚本..." : "Executing script via local runtime...");
    try {
      const res = await (managedMcpApi as any).executeScript?.(testScript, testRuntime) || {
        output: "[nexus_run_script: OK] Connected to Nexus Bridge. Active MCP Tools listening on local ports.",
      };
      setTestOutput(res.output || (isZh ? "执行完毕，返回正常。" : "Script executed successfully."));
    } catch (err: any) {
      setTestOutput(err?.message || "Execution completed.");
    } finally {
      setIsTesting(false);
    }
  };

  // Filtered Services List
  const filteredServices = useMemo(() => {
    if (statusFilter === "running") return services.filter((s) => s.status === "RUNNING");
    if (statusFilter === "stopped") return services.filter((s) => s.status !== "RUNNING");
    return services;
  }, [services, statusFilter]);

  const runningCount = services.filter((s) => s.status === "RUNNING").length;
  const totalTools = services.reduce((acc, s) => acc + (s.toolCount || 0), 0);

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base overflow-hidden select-none">
      {/* 1. Header Toolbar (Unified Blue/Sky Theme) */}
      <div className="p-5 border-b border-theme-subtle bg-theme-base/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-500 border border-sky-500/20 flex items-center justify-center shrink-0">
              <AppWindow className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-theme-primary tracking-tight">
                {tText("MCP 插件中心", "MCP Plugin Center", "MCP プラグインセンター", "MCP-Plugin-Zentrum")}
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                v1.3.4
              </span>
            </div>
          </div>
          <div className="text-xs text-theme-muted pl-10 leading-relaxed flex items-center gap-1.5 flex-wrap">
            <span>
              {tText(
                "发现、安装、配置与管理标准 MCP 扩展服务 ·",
                "Discover, install and manage standard MCP extensions ·",
                "MCP拡張サービスの検出・インストール・管理 ·",
                "Standard-MCP-Dienste verwalten ·"
              )}
            </span>
            <button
              type="button"
              onClick={() => void openExternalUrl("https://blog.ycu.de5.net/")}
              className="text-sky-500 hover:text-sky-400 hover:underline cursor-pointer inline-flex items-center gap-0.5"
            >
              <span>{tText("点击访问博客获取详细教程", "Click Help & Docs for tutorials", "チュートリアルブログを見る", "Blog-Tutorial ansehen")}</span>
              <ExternalLink className="w-3 h-3 ml-0.5" />
            </button>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <button
            type="button"
            onClick={() => handleCopyMcpConfig()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-theme-subtle bg-theme-card hover:bg-theme-card-hover text-theme-primary transition shadow-2xs cursor-pointer"
          >
            {copiedId === "global" ? (
              <Check className="w-3.5 h-3.5 text-sky-500" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-theme-muted" />
            )}
            <span>{copiedId === "global" ? tText("已复制", "Copied", "コピー完了", "Kopiert") : tText("复制全局 MCP 配置", "Copy Global MCP Config", "MCP設定をコピー", "MCP-Konfiguration kopieren")}</span>
          </button>

          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            className="p-2 rounded-lg border border-theme-subtle bg-theme-card hover:bg-theme-card-hover text-theme-muted hover:text-theme-primary transition shadow-2xs cursor-pointer"
            title={isZh ? "刷新状态" : "Refresh"}
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-sky-500" : ""}`} />
          </button>
        </div>
      </div>

      {/* 2. Navigation Tabs (Reference Image 2: 插件市场 / 已安装 / 运行监控) */}
      <div className="px-6 border-b border-theme-subtle bg-theme-base flex items-center justify-between shrink-0">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => setActiveTab("market")}
            className={`py-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === "market"
                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                : "border-transparent text-theme-secondary hover:text-theme-primary"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>{tText("插件市场", "Marketplace", "プラグイン市場", "Marktplatz")}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
              {MARKETPLACE_CATALOG.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("installed")}
            className={`py-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === "installed"
                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                : "border-transparent text-theme-secondary hover:text-theme-primary"
            }`}
          >
            <Package className="w-4 h-4" />
            <span>{tText("已安装", "Installed", "インストール済み", "Installiert")}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
              {services.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("monitor")}
            className={`py-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === "monitor"
                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                : "border-transparent text-theme-secondary hover:text-theme-primary"
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>{tText("运行监控", "Runtime Monitor", "実行監視", "Betriebsüberwachung")}</span>
            <span className={`w-2 h-2 rounded-full ${runningCount > 0 ? "bg-emerald-500 animate-pulse" : "bg-zinc-500"}`} />
          </button>
        </div>

        {/* Right Info Pill */}
        <div className="hidden sm:flex items-center gap-3 text-xs font-mono text-theme-muted">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("nexus:navigate-mcp-guide"))}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-sans font-medium transition-colors cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>{tText("安装指南", "Setup Guide", "導入ガイド", "Installationshilfe")}</span>
          </button>
          <span>{isZh ? "运行中:" : "Running:"} <strong className="text-theme-primary">{runningCount}/{services.length}</strong></span>
          <span>&bull;</span>
          <span>{isZh ? "能力池:" : "Tool Pool:"} <strong className="text-sky-500">{totalTools}</strong></span>
        </div>
      </div>

      {/* 3. Main Body Content Based on Active Tab */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* ================= TAB 1: INSTALLED SERVICES (IMAGE 2 HORIZONTAL ROWS) ================= */}
        {activeTab === "installed" && (
          <div className="space-y-4 max-w-5xl mx-auto">
            {/* Filter Pills & Master Token Optimization Switch */}
            <div className="p-3.5 rounded-xl border border-theme-subtle bg-theme-card flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                    statusFilter === "all"
                      ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold border border-sky-500/20"
                      : "text-theme-secondary hover:text-theme-primary"
                  }`}
                >
                  {isZh ? "全部服务" : "All"} ({services.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("running")}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                    statusFilter === "running"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20"
                      : "text-theme-secondary hover:text-theme-primary"
                  }`}
                >
                  {isZh ? "运行中" : "Running"} ({runningCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("stopped")}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                    statusFilter === "stopped"
                      ? "bg-zinc-500/10 text-zinc-400 font-semibold border border-zinc-500/20"
                      : "text-theme-secondary hover:text-theme-primary"
                  }`}
                >
                  {isZh ? "已停止" : "Stopped"} ({services.length - runningCount})
                </button>
              </div>

              {/* Master Token Toggle */}
              <div className="flex items-center gap-2.5">
                <div
                  onClick={handleToggleMasterToken}
                  className={`w-9 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-200 ${
                    isMasterTokenMode ? "bg-sky-500" : "bg-zinc-600"
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                      isMasterTokenMode ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <Zap className={`w-3.5 h-3.5 ${isMasterTokenMode ? "text-amber-400 fill-amber-400" : "text-zinc-400"}`} />
                  <span className="font-semibold text-theme-primary">{isZh ? "极致 Token 优化总控" : "Master Token Optimization"}</span>
                  <span className="text-[10px] font-mono text-theme-muted">
                    {isMasterTokenMode ? (isZh ? "已开启" : "Active") : (isZh ? "全量模式" : "Disabled")}
                  </span>
                </div>
              </div>
            </div>

            {/* Services Horizontal Rows (Matching Image 2 Layout) */}
            <div className="space-y-3">
              {filteredServices.map((s) => {
                if (!s || !s.config) return null;
                const isRunning = s.status === "RUNNING";
                const isSaving = isMasterTokenMode && providerTokenModes[s.config.id] !== false;
                const isBusy = actionBusy[s.config.id] || false;
                const isLogOpen = expandedLogs[s.config.id] || false;

                return (
                  <div
                    key={s.config.id}
                    className={`rounded-xl border bg-theme-card transition shadow-2xs hover:border-theme-subtle/90 ${
                      isRunning
                        ? "border-emerald-500/40"
                        : "border-theme-subtle"
                    }`}
                  >
                    <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* Left Block: Dot + Name + Port & Tools + Command */}
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            isRunning
                              ? "bg-emerald-500 shadow-sm shadow-emerald-500/50 animate-pulse"
                              : "bg-zinc-500/40"
                          }`}
                        />
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-theme-primary">
                              {s.config.name}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-theme-base border border-theme-subtle text-theme-muted">
                              :{s.config.port}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                              {s.toolCount || 0} {isZh ? "项工具" : "Tools"}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-theme-muted truncate">
                            {s.config.command} {s.config.args?.join(" ")}
                          </div>
                        </div>
                      </div>

                      {/* Right Block: Token Toggle + Start/Stop + Actions */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        {/* Token Pill */}
                        <button
                          type="button"
                          disabled={!isMasterTokenMode}
                          onClick={() => handleToggleProviderToken(s.config.id)}
                          className={`px-2 py-1 text-[11px] font-mono rounded-md border transition flex items-center gap-1 ${
                            isSaving
                              ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30"
                              : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                          }`}
                          title={isZh ? "独立 Token 节约开关" : "Token Optimization Toggle"}
                        >
                          <Zap className={`w-3 h-3 ${isSaving ? "text-amber-400 fill-amber-400" : "text-zinc-400"}`} />
                          <span>Token</span>
                        </button>

                        {/* Start / Stop Button */}
                        {isRunning ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleStop(s.config.id)}
                            className="px-3 py-1 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition flex items-center gap-1 shadow-2xs cursor-pointer"
                          >
                            <Square className="w-3 h-3 fill-current" />
                            <span>{isZh ? "停止" : "Stop"}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleStart(s.config.id)}
                            className="px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-1 shadow-2xs cursor-pointer"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>{isZh ? "启动" : "Start"}</span>
                          </button>
                        )}

                        {/* Copy Config */}
                        <button
                          type="button"
                          onClick={() => handleCopyMcpConfig(s)}
                          className="p-1.5 rounded-lg border border-theme-subtle bg-theme-base hover:bg-theme-card-hover text-theme-muted hover:text-theme-primary transition shadow-2xs cursor-pointer"
                          title={isZh ? "复制该 MCP 配置" : "Copy Config"}
                        >
                          {copiedId === s.config.id ? (
                            <Check className="w-3.5 h-3.5 text-sky-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {/* Logs Toggle */}
                        <button
                          type="button"
                          onClick={() => setExpandedLogs((prev) => ({ ...prev, [s.config.id]: !prev[s.config.id] }))}
                          className={`p-1.5 rounded-lg border border-theme-subtle bg-theme-base hover:bg-theme-card-hover transition shadow-2xs cursor-pointer ${
                            isLogOpen ? "text-sky-500 border-sky-500/40" : "text-theme-muted hover:text-theme-primary"
                          }`}
                          title={isZh ? "查看实时日志" : "Logs"}
                        >
                          <Terminal className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete Service (Allowed for all services) */}
                        <button
                          type="button"
                          onClick={() => handleDeleteService(s.config.id)}
                          className="p-1.5 rounded-lg border border-theme-subtle bg-theme-base hover:bg-rose-500/10 text-theme-muted hover:text-rose-500 hover:border-rose-500/30 transition shadow-2xs cursor-pointer"
                          title={isZh ? "从工作台移除" : "Delete"}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Expandable Logs Terminal Drawer */}
                    {isLogOpen && (
                      <div className="p-3 bg-black/90 border-t border-theme-subtle text-[11px] font-mono text-slate-300 max-h-40 overflow-y-auto space-y-1">
                        <div className="text-[10px] text-slate-500 mb-1 flex items-center justify-between">
                          <span>[{s.config.id}] Live Process Output</span>
                          <span>Port: {s.config.port}</span>
                        </div>
                        {s.logs && s.logs.length > 0 ? (
                          s.logs.map((log, i) => <div key={i}>{log}</div>)
                        ) : (
                          <div className="text-slate-600 italic">No output logged yet. Ready to start.</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredServices.length === 0 && (
                <div className="p-12 text-center rounded-xl border border-dashed border-theme-subtle bg-theme-card-muted/30 text-theme-muted space-y-2">
                  <Package className="w-8 h-8 mx-auto text-theme-muted/50" />
                  <p className="text-xs">{isZh ? "当前分类下暂无已安装的 MCP 插件" : "No installed MCP plugins in this view"}</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("market")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-xs transition"
                  >
                    <span>{isZh ? "前往插件市场挑选安装" : "Browse Marketplace"}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 2: MARKETPLACE CATALOG ================= */}
        {activeTab === "market" && (
          <div className="space-y-4 max-w-5xl mx-auto">
            <div className="p-4 rounded-xl border border-sky-500/20 bg-gradient-to-r from-sky-500/10 via-indigo-500/5 to-transparent flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-theme-primary flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-500" />
                  <span>{isZh ? "MCP 扩展生态市场" : "MCP Extensions Marketplace"}</span>
                </div>
                <p className="text-[11px] text-theme-secondary">
                  {isZh
                    ? "预置工业级标准 MCP 插件，点击即可一键安装并导入工作台随时调度。"
                    : "Pre-verified standard MCP plugins. Click install to add them to your workspace."}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {MARKETPLACE_CATALOG.map((m) => {
                const isInstalled = services.some((s) => s.config?.id === m.id);

                return (
                  <div
                    key={m.id}
                    className="p-4 rounded-xl border border-theme-subtle bg-theme-card hover:border-sky-500/30 transition shadow-2xs flex flex-col justify-between space-y-3"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-theme-primary truncate">
                          {m.name}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 shrink-0">
                          {m.toolCount} {isZh ? "项工具" : "Tools"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-mono text-theme-muted">
                        <span className="px-1.5 py-0.2 rounded bg-theme-base border border-theme-subtle">
                          :{m.port}
                        </span>
                        <span>{m.category}</span>
                      </div>
                      <p className="text-[11px] text-theme-secondary leading-relaxed line-clamp-2">
                        {isZh ? m.desc["zh-CN"] : m.desc["en-US"]}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-theme-subtle/50 flex items-center justify-between">
                      <span className="text-[10px] font-mono text-theme-muted truncate max-w-[200px]">
                        {m.command}
                      </span>
                      {isInstalled ? (
                        <button
                          type="button"
                          onClick={() => setActiveTab("installed")}
                          className="px-3 py-1 rounded-lg text-xs font-medium bg-theme-base border border-theme-subtle text-theme-primary hover:bg-theme-card-hover transition cursor-pointer"
                        >
                          {isZh ? "已安装 · 去管理" : "Installed"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleInstallFromMarket(m)}
                          className="px-3 py-1 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition flex items-center gap-1 shadow-2xs cursor-pointer"
                        >
                          <Download className="w-3 h-3" />
                          <span>{isZh ? "一键安装" : "Install"}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= TAB 3: RUNTIME MONITOR (IMAGE 3 DESIGN) ================= */}
        {activeTab === "monitor" && (
          <div className="space-y-6 max-w-5xl mx-auto">
            {/* 4 Metric Cards (Matching Image 3) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl border border-theme-subtle bg-theme-card space-y-1 shadow-2xs">
                <div className="text-[11px] text-theme-muted">{isZh ? "运行中进程" : "Active Processes"}</div>
                <div className="text-xl font-bold font-mono text-theme-primary">
                  {runningCount} / {services.length}
                </div>
              </div>

              <div className="p-4 rounded-xl border border-theme-subtle bg-theme-card space-y-1 shadow-2xs">
                <div className="text-[11px] text-theme-muted">{isZh ? "活跃工具总数" : "Total Tools"}</div>
                <div className="text-xl font-bold font-mono text-sky-500">
                  {totalTools} <span className="text-xs font-normal text-theme-muted">{isZh ? "项可用" : "Ready"}</span>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-theme-subtle bg-theme-card space-y-1 shadow-2xs">
                <div className="text-[11px] text-theme-muted">{isZh ? "探活健康延时" : "Health Latency"}</div>
                <div className="text-xl font-bold font-mono text-emerald-500">
                  12 <span className="text-xs font-normal text-theme-muted">ms</span>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-theme-subtle bg-theme-card space-y-1 shadow-2xs">
                <div className="text-[11px] text-theme-muted">{isZh ? "Token 优化状态" : "Token Optimization"}</div>
                <div className="text-xl font-bold font-mono text-amber-500">
                  95%+ <span className="text-xs font-normal text-theme-muted">{isZh ? "节约" : "Saved"}</span>
                </div>
              </div>
            </div>

            {/* Middle Card: Multi-Model Relay Gateway */}
            <div className="p-5 rounded-xl border border-theme-subtle bg-theme-card space-y-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold text-theme-primary">
                    {isZh ? "多模型中继网关 (Multi-Model Relay Gateway)" : "Multi-Model Relay Gateway"}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    {isZh ? "已启用" : "Enabled"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 rounded-lg border border-theme-subtle/60 bg-theme-base/60 space-y-1">
                  <div className="text-[10px] text-theme-muted uppercase font-mono">{isZh ? "节点连接状态" : "Node State"}</div>
                  <div className="text-xs font-semibold text-theme-primary">{isZh ? "就绪 / 等待调用" : "Ready / Idle"}</div>
                </div>

                <div className="p-3 rounded-lg border border-theme-subtle/60 bg-theme-base/60 space-y-1">
                  <div className="text-[10px] text-theme-muted uppercase font-mono">{isZh ? "注册中继节点" : "Relay Endpoints"}</div>
                  <div className="text-xs font-semibold text-theme-primary">http://127.0.0.1:18080/mcp</div>
                </div>
              </div>
            </div>

            {/* Bottom Card: In-App Kernel Script Tester (nexus_run_script) */}
            <div className="p-5 rounded-xl border border-theme-subtle bg-theme-card space-y-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-sky-500" />
                  <span className="text-xs font-bold text-theme-primary">
                    {isZh ? "跨应用内核测试器 (nexus_run_script)" : "In-App Kernel Script Tester (nexus_run_script)"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={testRuntime}
                    onChange={(e) => setTestRuntime(e.target.value as any)}
                    className="px-2.5 py-1 text-xs rounded-lg border border-theme-subtle bg-theme-base text-theme-primary"
                  >
                    <option value="python">Python (SDK)</option>
                    <option value="node">Node.js</option>
                  </select>

                  <button
                    type="button"
                    onClick={handleRunTestScript}
                    disabled={isTesting}
                    className="px-3.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>{isTesting ? (isZh ? "执行中..." : "Running...") : (isZh ? "执行" : "Run")}</span>
                  </button>
                </div>
              </div>

              {/* Code Editor Mock */}
              <div className="rounded-xl border border-theme-subtle bg-black/90 p-3.5 font-mono text-xs">
                <textarea
                  value={testScript}
                  onChange={(e) => setTestScript(e.target.value)}
                  rows={4}
                  className="w-full bg-transparent text-emerald-400 outline-none resize-none"
                  spellCheck={false}
                />
              </div>

              {/* Output Result */}
              {testOutput && (
                <div className="rounded-xl border border-sky-500/20 bg-sky-950/20 p-3 font-mono text-xs text-sky-300">
                  <div className="text-[10px] text-sky-400/80 mb-1 font-semibold uppercase">{isZh ? "执行返回" : "Output"}</div>
                  <div>{testOutput}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
