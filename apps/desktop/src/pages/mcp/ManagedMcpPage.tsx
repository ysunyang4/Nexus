import React, { useState, useEffect } from "react";
import {
  Terminal,
  Play,
  Square,
  RotateCw,
  Settings,
  Key,
  ChevronDown,
  ChevronRight,
  Plus,
  Copy,
  Check,
  CheckCircle2,
  Loader2,
  Trash2,
  FileCode,
  Sparkles,
  Zap,
} from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation.js";
import {
  managedMcpApi,
  type ManagedMcpStateDto,
} from "../../api/managed-mcp-api.js";

export const ManagedMcpPage: React.FC = () => {
  const { language } = useTranslation();
  const isZh = language.startsWith("zh");

  const [services, setServices] = useState<ManagedMcpStateDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<Record<string, boolean>>({});
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({ "blender-mcp": true });
  const [expandedConfig, setExpandedConfig] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form states for API config editing
  const [configForms, setConfigForms] = useState<Record<string, any>>({});
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<Record<string, string | null>>({});

  // Smart Auto-Installer Modal
  const [showAutoInstallModal, setShowAutoInstallModal] = useState(false);
  const [autoInstallSource, setAutoInstallSource] = useState("");
  const [autoInstallName, setAutoInstallName] = useState("");
  const [isAutoInstalling, setIsAutoInstalling] = useState(false);
  const [autoInstallStep, setAutoInstallStep] = useState<number>(0);
  const [autoInstallError, setAutoInstallError] = useState<string | null>(null);
  const [autoInstallResult, setAutoInstallResult] = useState<{
    serviceId: string;
    name: string;
    port: number;
    toolCount: number;
    endpoint: string;
  } | null>(null);

  // New Service Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newCommand, setNewCommand] = useState("");
  const [newPort, setNewPort] = useState(9099);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Import JSON Modal
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [jsonInput, setJsonInput] = useState(`{\n  "mcpServers": {\n    "playwright": {\n      "command": "npx",\n      "args": [\n        "@playwright/mcp@latest"\n      ]\n    }\n  }\n}`);
  const [jsonWrapSupergateway, setJsonWrapSupergateway] = useState(true);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const list = await managedMcpApi.listServices();
      setServices(list);
      // Initialize form data
      const initialForms: Record<string, any> = {};
      for (const s of list) {
        initialForms[s.config.id] = {
          rawCommand: s.config.rawCommand || (s.config.command + (s.config.args?.length ? " " + s.config.args.join(" ") : "")),
          blenderPort: s.config.apiKeys?.blenderPort || 9876,
          hunyuanSecretId: s.config.apiKeys?.hunyuanSecretId || "",
          hunyuanSecretKey: s.config.apiKeys?.hunyuanSecretKey || "",
          hunyuanApiUrl: s.config.apiKeys?.hunyuanApiUrl || "",
          hyper3dApiKey: s.config.apiKeys?.hyper3dApiKey || "",
          sketchfabApiKey: s.config.apiKeys?.sketchfabApiKey || "",
          polyPizzaApiKey: s.config.apiKeys?.polyPizzaApiKey || "",
          port: s.config.port || 9099,
        };
      }
      setConfigForms(initialForms);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(async () => {
      // Quiet background refresh of states
      try {
        const list = await managedMcpApi.listServices();
        setServices(list);
      } catch {}
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async (id: string) => {
    setActionBusy((prev) => ({ ...prev, [id]: true }));
    try {
      await managedMcpApi.startService(id);
      await loadData();
    } finally {
      setActionBusy((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleStop = async (id: string) => {
    setActionBusy((prev) => ({ ...prev, [id]: true }));
    try {
      await managedMcpApi.stopService(id);
      await loadData();
    } finally {
      setActionBusy((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleRestart = async (id: string) => {
    setActionBusy((prev) => ({ ...prev, [id]: true }));
    try {
      await managedMcpApi.restartService(id);
      await loadData();
    } finally {
      setActionBusy((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleSaveConfig = async (id: string) => {
    const form = configForms[id];
    if (!form) return;
    setActionBusy((prev) => ({ ...prev, [id]: true }));
    try {
      await managedMcpApi.updateConfig(id, {
        rawCommand: form.rawCommand,
        port: Number(form.port),
        endpoint: `http://127.0.0.1:${form.port}/mcp`,
        apiKeys: {
          blenderPort: Number(form.blenderPort),
          hunyuanSecretId: form.hunyuanSecretId,
          hunyuanSecretKey: form.hunyuanSecretKey,
          hunyuanApiUrl: form.hunyuanApiUrl,
          hyper3dApiKey: form.hyper3dApiKey,
          sketchfabApiKey: form.sketchfabApiKey,
          polyPizzaApiKey: form.polyPizzaApiKey,
        },
      });
      setSaveSuccessMsg((prev) => ({ ...prev, [id]: isZh ? "配置已保存成功！" : "Configuration saved successfully!" }));
      setTimeout(() => {
        setSaveSuccessMsg((prev) => ({ ...prev, [id]: null }));
      }, 4000);
      await loadData();
    } finally {
      setActionBusy((prev) => ({ ...prev, [id]: false }));
    }
  };

  const PRESET_AUTO_INSTALLS = [
    { label: "Maya 3D MCP", source: "maya-mcp-server", name: "Autodesk Maya MCP" },
    { label: "Blender MCP", source: "blender-mcp", name: "Blender 3D MCP" },
    { label: "文件系统 (FS)", source: "@modelcontextprotocol/server-filesystem", name: "Local Filesystem MCP" },
    { label: "Git 仓库管理", source: "mcp-server-git", name: "Git Repo MCP" },
    { label: "GitHub 仓库 (Maya 范例)", source: "https://github.com/cyanheads/maya-mcp-server", name: "Maya GitHub MCP" },
  ];

  const handleAutoInstall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!autoInstallSource.trim()) return;
    setIsAutoInstalling(true);
    setAutoInstallError(null);
    setAutoInstallResult(null);
    setAutoInstallStep(1);

    const stepTimer1 = setTimeout(() => setAutoInstallStep(2), 700);
    const stepTimer2 = setTimeout(() => setAutoInstallStep(3), 1600);

    try {
      const res = await managedMcpApi.autoInstall({
        source: autoInstallSource.trim(),
        name: autoInstallName.trim() || undefined,
      });

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);

      if (res.success && res.serviceId) {
        setAutoInstallStep(4);
        setAutoInstallResult({
          serviceId: res.serviceId,
          name: res.name || res.serviceId,
          port: res.port || 9112,
          toolCount: res.toolCount || 0,
          endpoint: res.endpoint || `http://127.0.0.1:${res.port || 9112}/mcp`,
        });
        await loadData();
      } else {
        setAutoInstallError(res.error || (isZh ? "安装失败，请检查安装源或网络" : "Auto-installation failed"));
      }
    } catch (err: any) {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setAutoInstallError(err.message || String(err));
    } finally {
      setIsAutoInstalling(false);
    }
  };


  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(isZh ? `确定要删除服务 "${name}" 吗？此操作无法撤销。` : `Are you sure you want to delete "${name}"?`)) {
      return;
    }
    setActionBusy((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await managedMcpApi.deleteCustomService(id);
      if (res.success) {
        await loadData();
      } else {
        alert(res.error || "删除失败");
      }
    } finally {
      setActionBusy((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newId.trim() || !newCommand.trim()) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      const raw = newCommand.trim();
      const regex = /(?:[^\s"]+|"[^"]*")+/g;
      const parts = raw.match(regex) || [raw];
      const cmd = parts[0]?.replace(/^"|"$/g, "") || "";
      const args = parts.slice(1).map((p) => p.replace(/^"|"$/g, ""));
      const res = await managedMcpApi.createCustomService({
        id: newId.trim().toLowerCase(),
        name: newName.trim() || newId.trim(),
        command: cmd,
        args,
        rawCommand: raw,
        port: Number(newPort),
        endpoint: `http://127.0.0.1:${newPort}/mcp`,
      });
      if (res.success) {
        setShowCreateModal(false);
        setNewId("");
        setNewName("");
        setNewCommand("");
        setNewPort(9099);
        await loadData();
      } else {
        setCreateError(res.error || "创建失败");
      }
    } catch (err: any) {
      setCreateError(err.message || String(err));
    } finally {
      setIsCreating(false);
    }
  };

  const handleImportJson = async (e: React.FormEvent) => {
    e.preventDefault();
    setJsonError(null);
    if (!jsonInput.trim()) return;

    try {
      const parsed = JSON.parse(jsonInput.trim());
      let serversObj: Record<string, any> = {};
      if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
        serversObj = parsed.mcpServers;
      } else if (parsed.command) {
        serversObj = { "custom-mcp": parsed };
      } else {
        serversObj = parsed;
      }

      const entries = Object.entries(serversObj);
      if (entries.length === 0) {
        throw new Error(isZh ? "未在 JSON 中找到任何有效的 mcpServers 配置" : "No valid mcpServers found in JSON");
      }

      setIsImporting(true);

      let currentMaxPort = 9099;
      for (const s of services) {
        if (s.config.port && s.config.port > currentMaxPort) {
          currentMaxPort = s.config.port;
        }
      }

      for (const [key, val] of entries) {
        if (!val || typeof val !== "object") continue;
        const rawCmd = (val.command || "npx").trim();
        const rawArgs: string[] = Array.isArray(val.args) ? val.args : [];

        currentMaxPort += 1;
        const port = currentMaxPort;
        const sId = key.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
        const sName = key.charAt(0).toUpperCase() + key.slice(1);

        let finalRawCommand = "";
        let finalCmd = rawCmd;
        let finalArgs = rawArgs;

        if (jsonWrapSupergateway && !rawCmd.includes("supergateway") && !rawArgs.some((a) => a.includes("supergateway"))) {
          const innerCommand = `${rawCmd} ${rawArgs.join(" ")}`.trim();
          finalCmd = "npx.cmd";
          finalArgs = [
            "-y",
            "supergateway",
            "--port",
            String(port),
            "--outputTransport",
            "streamableHttp",
            "--streamableHttpPath",
            "/mcp",
            "--stateful",
            "--stdio",
            innerCommand,
          ];
          finalRawCommand = `npx.cmd -y supergateway --port ${port} --outputTransport streamableHttp --streamableHttpPath /mcp --stateful --stdio "${innerCommand}"`;
        } else {
          finalRawCommand = `${rawCmd} ${rawArgs.join(" ")}`.trim();
        }

        const res = await managedMcpApi.createCustomService({
          id: sId,
          name: sName,
          command: finalCmd,
          args: finalArgs,
          rawCommand: finalRawCommand,
          port,
          endpoint: `http://127.0.0.1:${port}/mcp`,
        });

        if (!res.success) {
          throw new Error(res.error || `创建服务 ${sId} 失败`);
        }

        // Auto-start immediately so the imported tool is instantly ready for use
        await managedMcpApi.startService(sId).catch(() => {});
      }

      setShowJsonModal(false);
      await loadData();
    } catch (err: any) {
      setJsonError(err.message || String(err));
    } finally {
      setIsImporting(false);
    }
  };

  const handleCopyLogs = (id: string, logs: string[]) => {
    navigator.clipboard.writeText(logs.join("\n"));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base overflow-y-auto p-6 space-y-6 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-theme-subtle pb-4">
        <div>
          <h1 className="text-base font-semibold text-theme-primary flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-500" />
            <span>{isZh ? "MCP 进程托管与 API 配置" : "Managed MCP Processes & API Config"}</span>
          </h1>
          <p className="text-xs text-theme-muted mt-0.5">
            {isZh
              ? "无需手动编写 .bat 脚本，在 UI 中一键启动、查看控制台实时日志与配置模型 API 密钥"
              : "Zero .bat files needed: manage background MCP processes, stream logs & configure API keys visually"}
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
            <RotateCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAutoInstallModal(true);
              setAutoInstallError(null);
              setAutoInstallResult(null);
              setAutoInstallStep(0);
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-sky-600 hover:from-emerald-500 hover:to-sky-500 text-white rounded text-xs font-semibold shadow-md hover:shadow-lg transition transform active:scale-95"
          >
            <Sparkles className="w-3.5 h-3.5 text-yellow-300 animate-pulse" />
            <span>{isZh ? "🚀 智能全自动安装 (GitHub / 包名)" : "🚀 Smart Auto-Install"}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowJsonModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600/20 hover:bg-sky-600/30 text-sky-400 border border-sky-500/30 rounded text-xs font-semibold shadow-sm transition"
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>{isZh ? "+ 导入 JSON 配置" : "+ Import JSON"}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold shadow-sm transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isZh ? "+ 运行新命令服务" : "+ Run Command Service"}</span>
          </button>
        </div>
      </div>

      {/* AI Client Hint Banner */}
      <div className="p-3.5 rounded-xl border border-sky-500/30 bg-sky-500/5 text-xs text-theme-secondary flex items-start gap-2.5">
        <span className="text-sky-400 font-bold text-sm shrink-0">💡</span>
        <div className="space-y-1">
          <div className="font-semibold text-theme-primary">
            {isZh ? "为什么在外部 AI 客户端（ChatGPT / DeepSeek）要使用 8787 桥接端点？" : "Why use 8787 Bridge endpoint in external AI clients (ChatGPT / DeepSeek)?"}
          </div>
          <div className="text-theme-muted leading-relaxed">
            {isZh
              ? "Nexus 内置了高性能纯流式网关（Native Pure-Stream Gateway）与自动包管理器，零命令直接支持 GitHub 仓库与 Python/Node MCP 服务。请在外部 AI 客户端中使用 Nexus 统一桥接端点（例如 http://127.0.0.1:8787/mcp/maya 或全局网关 http://127.0.0.1:8787/mcp），Nexus 会自动透明处理会话握手并过滤控制台横幅与警告，100% 满载全部工具！"
              : "Nexus features a high-performance Native Pure-Stream Gateway and package resolver, supporting GitHub repos and Python/Node MCPs with zero terminal commands. Always connect external AI clients via the Nexus Bridge endpoints (e.g. http://127.0.0.1:8787/mcp/maya or http://127.0.0.1:8787/mcp) for 100% reliable tool loading."}
          </div>
        </div>
      </div>

      {/* Services List */}
      <div className="space-y-4">
        {services.map((svc) => {
          const isBusy = actionBusy[svc.config.id];
          const isRunning = svc.status === "RUNNING";
          const isStarting = svc.status === "STARTING";
          const isError = svc.status === "ERROR";
          const isPreset = svc.config.id === "blender-mcp" || svc.config.id === "photoshop-mcp";
          const form = configForms[svc.config.id] || {};
          const isLogsOpen = expandedLogs[svc.config.id];
          const isConfigOpen = expandedConfig[svc.config.id];
          const successMsg = saveSuccessMsg[svc.config.id];

          return (
            <div
              key={svc.config.id}
              className="p-5 rounded-xl border border-theme-subtle bg-theme-card/30 space-y-4 shadow-sm"
            >
              {/* Card Top: Title, Status Badge, Quick Controls */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-theme-subtle/50 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Terminal className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-theme-primary">{svc.config.name}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20">
                        {svc.config.id}
                      </span>
                    </div>
                    <div className="text-xs text-theme-muted mt-0.5 flex flex-wrap items-center gap-3">
                      <span>端口: <strong className="text-theme-secondary">{svc.config.port}</strong></span>
                      <span>进程端点: <strong className="text-theme-secondary truncate max-w-[160px]">{svc.config.endpoint}</strong></span>
                      <span>桥接端点: <strong className="text-sky-400 truncate max-w-[220px]">http://127.0.0.1:8787/mcp/{svc.config.id}</strong></span>
                      {svc.pid && (
                        <span>PID: <strong className="text-emerald-400">{svc.pid}</strong></span>
                      )}
                      <span>工具数: <strong className="text-sky-400">{svc.toolCount} Tools</strong></span>
                    </div>
                  </div>
                </div>

                {/* Status Indicator & Buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const cfg = JSON.stringify({
                        mcpServers: {
                          [svc.config.id]: {
                            url: `http://127.0.0.1:8787/mcp/${svc.config.id}`,
                          },
                        },
                      }, null, 2);
                      navigator.clipboard.writeText(cfg);
                      setCopiedId(`mcp-${svc.config.id}`);
                      setTimeout(() => setCopiedId(null), 2500);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-lg text-xs font-semibold transition"
                    title={isZh ? "复制用于 ChatGPT / DeepSeek 的配置 JSON" : "Copy configuration for ChatGPT / DeepSeek"}
                  >
                    {copiedId === `mcp-${svc.config.id}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedId === `mcp-${svc.config.id}` ? (isZh ? "已复制配置" : "Copied!") : (isZh ? "复制 MCP 配置" : "Copy Config")}</span>
                  </button>

                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 border ${
                      isRunning
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : isStarting
                        ? "bg-sky-500/15 text-sky-400 border-sky-500/30"
                        : isError
                        ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                        : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isRunning ? "bg-emerald-400 animate-pulse" : isStarting ? "bg-sky-400 animate-ping" : isError ? "bg-rose-400" : "bg-zinc-500"
                      }`}
                    />
                    <span>
                      {isRunning
                        ? isZh ? "运行中 (Running)" : "RUNNING"
                        : isStarting
                        ? isZh ? "启动中 (Starting)..." : "STARTING"
                        : isError
                        ? isZh ? "异常 (Error)" : "ERROR"
                        : isZh ? "已停止 (Stopped)" : "STOPPED"}
                    </span>
                  </span>

                  {/* Start / Stop / Restart Buttons */}
                  {isRunning ? (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleStop(svc.config.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/40 rounded-lg text-xs font-semibold transition"
                    >
                      {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
                      <span>{isZh ? "停止服务" : "Stop"}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleStart(svc.config.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                    >
                      {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                      <span>{isZh ? "启动服务" : "Start"}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleRestart(svc.config.id)}
                    className="p-1.5 rounded-lg bg-theme-card hover:bg-theme-card/80 text-theme-muted hover:text-theme-primary border border-theme-subtle"
                    title={isZh ? "重启服务" : "Restart"}
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${isBusy ? "animate-spin" : ""}`} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setExpandedConfig((prev) => ({ ...prev, [svc.config.id]: !prev[svc.config.id] }))}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                      isConfigOpen
                        ? "bg-sky-500/10 text-sky-400 border-sky-500/30"
                        : "bg-theme-card text-theme-muted hover:text-theme-primary border-theme-subtle"
                    }`}
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>{isZh ? "配置 API" : "API Config"}</span>
                    {isConfigOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setExpandedLogs((prev) => ({ ...prev, [svc.config.id]: !prev[svc.config.id] }))}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                      isLogsOpen
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : "bg-theme-card text-theme-muted hover:text-theme-primary border-theme-subtle"
                    }`}
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>{isZh ? "实时日志" : "Logs"}</span>
                    {isLogsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </button>

                  {!isPreset && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleDelete(svc.config.id, svc.config.name)}
                      className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition"
                      title={isZh ? "删除服务" : "Delete Service"}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Collapsible Section 1: API & Environment Configuration */}
              {isConfigOpen && (
                <div className="p-4 rounded-xl bg-theme-base/60 border border-theme-subtle space-y-4">
                  <div className="flex items-center justify-between border-b border-theme-subtle/50 pb-2">
                    <h3 className="text-xs font-bold text-theme-primary flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-sky-400" />
                      <span>{isZh ? "进程参数与环境配置 (Process & Environment Config)" : "Process & Environment Config"}</span>
                    </h3>
                    <span className="text-[11px] text-theme-muted">
                      {isZh ? "修改命令或端口后点击保存，重启即可生效" : "Save and restart to apply updated command/port"}
                    </span>
                  </div>

                  {successMsg && (
                    <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{successMsg}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    {/* Launch Command */}
                    <div className="md:col-span-2 space-y-1">
                      <label className="text-theme-muted block">{isZh ? "启动命令 (Shell Command)" : "Launch Command"}</label>
                      <textarea
                        rows={2}
                        value={form.rawCommand ?? ""}
                        onChange={(e) => setConfigForms((prev) => ({
                          ...prev,
                          [svc.config.id]: { ...prev[svc.config.id], rawCommand: e.target.value }
                        }))}
                        className="w-full p-2 bg-theme-card border border-theme-subtle rounded text-theme-primary focus:outline-none focus:border-sky-500 font-mono text-[11px]"
                        placeholder="例如: npx.cmd -y supergateway --port 9095 --outputTransport streamableHttp --streamableHttpPath /mcp --stdio &quot;photoshop-mcp.cmd&quot;"
                      />
                    </div>

                    {/* MCP HTTP Port */}
                    <div className={svc.config.id === "blender-mcp" ? "space-y-1" : "md:col-span-2 space-y-1"}>
                      <label className="text-theme-muted block">{isZh ? "MCP HTTP 服务端口 (MCP_PORT)" : "MCP HTTP Port"}</label>
                      <input
                        type="number"
                        value={form.port || 9099}
                        onChange={(e) => setConfigForms((prev) => ({
                          ...prev,
                          [svc.config.id]: { ...prev[svc.config.id], port: e.target.value }
                        }))}
                        className="w-full p-2 bg-theme-card border border-theme-subtle rounded text-theme-primary focus:outline-none focus:border-sky-500"
                        placeholder="9099"
                      />
                    </div>

                    {svc.config.id === "blender-mcp" && (
                      <>
                        {/* Blender Socket Port */}
                        <div className="space-y-1">
                          <label className="text-theme-muted block">{isZh ? "Blender 本地通信端口 (BLENDER_PORT)" : "Blender Port"}</label>
                          <input
                            type="number"
                            value={form.blenderPort || 9876}
                            onChange={(e) => setConfigForms((prev) => ({
                              ...prev,
                              [svc.config.id]: { ...prev[svc.config.id], blenderPort: e.target.value }
                            }))}
                            className="w-full p-2 bg-theme-card border border-theme-subtle rounded text-theme-primary focus:outline-none focus:border-sky-500"
                            placeholder="9876"
                          />
                        </div>

                        {/* Hunyuan3D SecretId */}
                        <div className="space-y-1">
                          <label className="text-theme-muted block">{isZh ? "腾讯混元 3D SecretId (Hunyuan3D)" : "Hunyuan3D SecretId"}</label>
                          <input
                            type="text"
                            value={form.hunyuanSecretId || ""}
                            onChange={(e) => setConfigForms((prev) => ({
                              ...prev,
                              [svc.config.id]: { ...prev[svc.config.id], hunyuanSecretId: e.target.value }
                            }))}
                            className="w-full p-2 bg-theme-card border border-theme-subtle rounded text-theme-primary focus:outline-none focus:border-sky-500"
                            placeholder="腾讯云 API 密钥 SecretId (选填)"
                          />
                        </div>

                        {/* Hunyuan3D SecretKey */}
                        <div className="space-y-1">
                          <label className="text-theme-muted block">{isZh ? "腾讯混元 3D SecretKey" : "Hunyuan3D SecretKey"}</label>
                          <input
                            type="password"
                            value={form.hunyuanSecretKey || ""}
                            onChange={(e) => setConfigForms((prev) => ({
                              ...prev,
                              [svc.config.id]: { ...prev[svc.config.id], hunyuanSecretKey: e.target.value }
                            }))}
                            className="w-full p-2 bg-theme-card border border-theme-subtle rounded text-theme-primary focus:outline-none focus:border-sky-500"
                            placeholder="腾讯云 API 密钥 SecretKey (选填)"
                          />
                        </div>

                        {/* Hyper3D / Rodin API Key */}
                        <div className="space-y-1">
                          <label className="text-theme-muted block">Hyper3D / Rodin API Key</label>
                          <input
                            type="password"
                            value={form.hyper3dApiKey || ""}
                            onChange={(e) => setConfigForms((prev) => ({
                              ...prev,
                              [svc.config.id]: { ...prev[svc.config.id], hyper3dApiKey: e.target.value }
                            }))}
                            className="w-full p-2 bg-theme-card border border-theme-subtle rounded text-theme-primary focus:outline-none focus:border-sky-500"
                            placeholder="Hyper3D.ai 生成密钥 (选填)"
                          />
                        </div>

                        {/* Sketchfab API Key */}
                        <div className="space-y-1">
                          <label className="text-theme-muted block">Sketchfab API Key</label>
                          <input
                            type="password"
                            value={form.sketchfabApiKey || ""}
                            onChange={(e) => setConfigForms((prev) => ({
                              ...prev,
                              [svc.config.id]: { ...prev[svc.config.id], sketchfabApiKey: e.target.value }
                            }))}
                            className="w-full p-2 bg-theme-card border border-theme-subtle rounded text-theme-primary focus:outline-none focus:border-sky-500"
                            placeholder="Sketchfab 资产检索密钥 (选填)"
                          />
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-theme-subtle/50">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleSaveConfig(svc.config.id)}
                      className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
                    >
                      {isBusy ? (isZh ? "正在保存..." : "Saving...") : (isZh ? "保存配置参数" : "Save Configuration")}
                    </button>
                  </div>
                </div>
              )}

              {/* Collapsible Section 2: Real-time Embedded Console Logs */}
              {isLogsOpen && (
                <div className="p-3 rounded-xl bg-black/80 border border-theme-subtle/80 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400 border-b border-zinc-800 pb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>{isZh ? "实时进程控制台 (Embedded Console Log Stream)" : "Console Log Stream"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyLogs(svc.config.id, svc.logs || [])}
                        className="flex items-center gap-1 hover:text-white transition"
                        title={isZh ? "复制全部日志" : "Copy logs"}
                      >
                        {copiedId === svc.config.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedId === svc.config.id ? (isZh ? "已复制" : "Copied") : (isZh ? "复制" : "Copy")}</span>
                      </button>
                    </div>
                  </div>

                  <div className="max-h-56 overflow-y-auto font-mono text-[11px] leading-relaxed text-zinc-300 space-y-0.5 selection:bg-sky-500 selection:text-white">
                    {svc.logs && svc.logs.length > 0 ? (
                      svc.logs.map((logLine, idx) => (
                        <div
                          key={idx}
                          className={`${
                            logLine.includes("ERROR") || logLine.includes("Failed") || logLine.includes("error")
                              ? "text-rose-400"
                              : logLine.includes("READY") || logLine.includes("successfully") || logLine.includes("Connected")
                              ? "text-emerald-400"
                              : logLine.includes("[Nexus]")
                              ? "text-sky-400"
                              : "text-zinc-300"
                          }`}
                        >
                          {logLine}
                        </div>
                      ))
                    ) : (
                      <div className="text-zinc-500 italic py-2">
                        {isZh ? "暂无日志输出，点击上方【启动服务】即可在后台静默运行" : "No logs yet. Click [Start] to run."}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {services.length === 0 && !isLoading && (
          <div className="p-8 text-center text-xs text-theme-muted bg-theme-card/20 border border-theme-subtle rounded-xl">
            {isZh ? "暂无托管的 MCP 服务，点击右上角【+ 运行新命令服务】即可接入任意命令" : "No managed MCP services."}
          </div>
        )}
      </div>

      {/* Create Custom Service Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 font-mono">
          <div className="w-full max-w-lg bg-theme-base border border-theme-subtle rounded-xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-theme-subtle pb-3">
              <h3 className="text-sm font-bold text-theme-primary flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                <span>{isZh ? "运行新受管 MCP 命令服务" : "Run New Managed MCP Command"}</span>
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-theme-muted hover:text-theme-primary text-xs">
                ✕
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded text-rose-400 text-xs">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateService} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-theme-muted block">{isZh ? "服务 ID (唯一英文标识)" : "Service ID"}</label>
                <input
                  type="text"
                  required
                  placeholder="例如: custom-mcp 或 my-tool"
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  className="w-full p-2 bg-theme-card border border-theme-subtle rounded text-theme-primary focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-theme-muted block">{isZh ? "服务显示名称" : "Display Name"}</label>
                <input
                  type="text"
                  placeholder="例如: My Custom MCP Server"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full p-2 bg-theme-card border border-theme-subtle rounded text-theme-primary focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-theme-muted block">{isZh ? "启动命令 (Shell Command)" : "Launch Command"}</label>
                <textarea
                  required
                  rows={3}
                  placeholder="例如: python -m my_mcp_server --port 9099 或 uv run ..."
                  value={newCommand}
                  onChange={(e) => setNewCommand(e.target.value)}
                  className="w-full p-2 bg-theme-card border border-theme-subtle rounded text-theme-primary focus:outline-none focus:border-emerald-500 font-mono text-[11px]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-theme-muted block">{isZh ? "绑定端口 (Port)" : "Listening Port"}</label>
                <input
                  type="number"
                  required
                  value={newPort}
                  onChange={(e) => setNewPort(Number(e.target.value))}
                  className="w-full p-2 bg-theme-card border border-theme-subtle rounded text-theme-primary focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-theme-subtle">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 rounded text-theme-muted hover:text-theme-primary bg-theme-card border border-theme-subtle"
                >
                  {isZh ? "取消" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm transition disabled:opacity-50"
                >
                  {isCreating ? (isZh ? "正在创建..." : "Creating...") : (isZh ? "创建服务面板" : "Create Service Panel")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import JSON Modal */}
      {showJsonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 font-mono">
          <div className="w-full max-w-xl bg-theme-base border border-theme-subtle rounded-xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-theme-subtle pb-3">
              <h3 className="text-sm font-bold text-theme-primary flex items-center gap-2">
                <FileCode className="w-4 h-4 text-sky-400" />
                <span>{isZh ? "导入标准 MCP JSON 配置" : "Import MCP JSON Configuration"}</span>
              </h3>
              <button onClick={() => setShowJsonModal(false)} className="text-theme-muted hover:text-theme-primary text-xs">
                ✕
              </button>
            </div>

            <p className="text-xs text-theme-muted">
              {isZh
                ? "支持粘贴 MCP 服务器配置，无需手动找文件，直接填入即可自动创建管理卡片。"
                : "Paste MCP mcpServers JSON or single server config to auto-create managed process cards."}
            </p>

            {jsonError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded text-rose-400 text-xs">
                {jsonError}
              </div>
            )}

            <form onSubmit={handleImportJson} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-theme-muted block">{isZh ? "JSON 配置内容" : "JSON Configuration"}</label>
                <textarea
                  required
                  rows={8}
                  placeholder={`{\n  "mcpServers": {\n    "playwright": {\n      "command": "npx",\n      "args": [\n        "@playwright/mcp@latest"\n      ]\n    }\n  }\n}`}
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  className="w-full p-2.5 bg-theme-card border border-theme-subtle rounded text-theme-primary focus:outline-none focus:border-sky-500 font-mono text-[11px] leading-relaxed"
                />
              </div>

              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-300">
                <input
                  type="checkbox"
                  id="wrapSupergateway"
                  checked={jsonWrapSupergateway}
                  onChange={(e) => setJsonWrapSupergateway(e.target.checked)}
                  className="rounded text-sky-600 focus:ring-0"
                />
                <label htmlFor="wrapSupergateway" className="text-[11px] cursor-pointer">
                  {isZh
                    ? "自动使用 supergateway 将 stdio 桥接为 Streamable HTTP 协议 (推荐，供 ChatGPT/DeepSeek Web 端直接调用)"
                    : "Auto-bridge stdio to Streamable HTTP via supergateway (recommended for ChatGPT / DeepSeek Web)"}
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-theme-subtle">
                <button
                  type="button"
                  onClick={() => setShowJsonModal(false)}
                  className="px-3 py-1.5 rounded text-theme-muted hover:text-theme-primary bg-theme-card border border-theme-subtle"
                >
                  {isZh ? "取消" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={isImporting}
                  className="px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium shadow-sm transition disabled:opacity-50"
                >
                  {isImporting ? (isZh ? "正在解析导入..." : "Importing...") : (isZh ? "一键导入配置" : "Import Config")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Smart Auto-Installer Modal */}
      {showAutoInstallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 font-mono backdrop-blur-sm">
          <div className="w-full max-w-xl bg-theme-base border border-theme-subtle rounded-xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-theme-subtle pb-3">
              <h3 className="text-sm font-bold text-theme-primary flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
                <span>{isZh ? "智能全自动安装 MCP 服务 (Zero-Command Installer)" : "Smart Auto-Installer (Zero Command)"}</span>
              </h3>
              <button
                onClick={() => {
                  if (!isAutoInstalling) setShowAutoInstallModal(false);
                }}
                className="text-theme-muted hover:text-theme-primary text-xs"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-theme-muted leading-relaxed">
              {isZh
                ? "零手动命令！直接输入 GitHub 仓库地址或 Python / npm 包名，Nexus 会自动在内置沙箱中拉取依赖、配置独立端口，并通过原生纯流式网关 (Pure-Stream Gateway) 过滤控制台干扰横幅，100% 满载发现全部工具。"
                : "Zero terminal commands! Paste a GitHub repository URL or Python/npm package name. Nexus automatically handles dependencies, port allocation, and pure-stream protocol handshake with full tool discovery."}
            </p>

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-theme-secondary flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-yellow-400" />
                <span>{isZh ? "一键快捷预设：" : "Quick Presets:"}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {PRESET_AUTO_INSTALLS.map((preset) => (
                  <button
                    key={preset.source}
                    type="button"
                    disabled={isAutoInstalling}
                    onClick={() => {
                      setAutoInstallSource(preset.source);
                      setAutoInstallName(preset.name);
                      setAutoInstallError(null);
                      setAutoInstallResult(null);
                    }}
                    className="px-2.5 py-1 text-[11px] bg-theme-card hover:bg-theme-subtle border border-theme-subtle hover:border-emerald-500/40 rounded-lg text-theme-secondary hover:text-emerald-400 transition"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Error Message */}
            {autoInstallError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <span>❌</span>
                  <span>{isZh ? "安装未完成" : "Installation Error"}</span>
                </div>
                <div className="text-[11px] opacity-90 break-all">{autoInstallError}</div>
              </div>
            )}

            {/* Success Result Card */}
            {autoInstallResult && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>{isZh ? `安装成功！已加载 ${autoInstallResult.toolCount} 个有效工具` : `Installed! Discovered ${autoInstallResult.toolCount} tools`}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-mono">
                    PORT {autoInstallResult.port}
                  </span>
                </div>

                <div className="space-y-1 font-mono text-[11px] text-theme-secondary bg-black/30 p-2.5 rounded-lg border border-emerald-500/20">
                  <div>服务 ID: <strong className="text-white">{autoInstallResult.serviceId}</strong></div>
                  <div>桥接端点: <strong className="text-sky-300">http://127.0.0.1:8787/mcp/{autoInstallResult.serviceId}</strong></div>
                  <div>工具数量: <strong className="text-emerald-300">{autoInstallResult.toolCount} Tools Loaded</strong></div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const cfg = JSON.stringify({
                        mcpServers: {
                          [autoInstallResult.serviceId]: {
                            url: `http://127.0.0.1:8787/mcp/${autoInstallResult.serviceId}`,
                          },
                        },
                      }, null, 2);
                      navigator.clipboard.writeText(cfg);
                      setCopiedId(`auto-${autoInstallResult.serviceId}`);
                      setTimeout(() => setCopiedId(null), 2500);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 rounded-lg text-xs font-semibold text-emerald-300 transition"
                  >
                    {copiedId === `auto-${autoInstallResult.serviceId}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedId === `auto-${autoInstallResult.serviceId}` ? (isZh ? "已复制配置" : "Copied!") : (isZh ? "复制 MCP 配置" : "Copy Config")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowAutoInstallModal(false)}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow-sm"
                  >
                    {isZh ? "完成并返回" : "Done"}
                  </button>
                </div>
              </div>
            )}

            {/* Stepper progress during install */}
            {isAutoInstalling && (
              <div className="p-4 bg-sky-500/10 border border-sky-500/30 rounded-xl space-y-2.5 text-xs">
                <div className="flex items-center gap-2 text-sky-400 font-bold">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{isZh ? "正在全自动沙箱部署与验证中..." : "Deploying in Sandbox..."}</span>
                </div>
                <div className="space-y-1.5 text-[11px] text-theme-muted pl-6">
                  <div className={autoInstallStep >= 1 ? "text-sky-300 font-medium" : "opacity-40"}>
                    {autoInstallStep >= 1 ? "✓ " : "• "} {isZh ? "1. 识别源类型 (GitHub / Python / npm)" : "1. Resolving source & package type"}
                  </div>
                  <div className={autoInstallStep >= 2 ? "text-sky-300 font-medium" : "opacity-40"}>
                    {autoInstallStep >= 2 ? "✓ " : "• "} {isZh ? "2. 动态分配独占网关端口" : "2. Allocating loopback gateway port"}
                  </div>
                  <div className={autoInstallStep >= 3 ? "text-sky-300 font-medium" : "opacity-40"}>
                    {autoInstallStep >= 3 ? "✓ " : "• "} {isZh ? "3. 启动 Native Pure-Stream Gateway 并过滤警告横幅" : "3. Starting Native Pure-Stream Gateway"}
                  </div>
                  <div className={autoInstallStep >= 4 ? "text-emerald-400 font-bold" : "opacity-40"}>
                    {autoInstallStep >= 4 ? "✓ " : "• "} {isZh ? "4. MCP 握手完成，发现并注册工具列表" : "4. Handshake complete, tools registered"}
                  </div>
                </div>
              </div>
            )}

            {!autoInstallResult && (
              <form onSubmit={handleAutoInstall} className="space-y-4 text-xs">
                <div className="space-y-1">
                  <label className="text-theme-secondary font-semibold block">
                    {isZh ? "安装源 (GitHub 仓库链接 或 包名)" : "Source (GitHub Repo URL or Package Name)"}
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isAutoInstalling}
                    placeholder="例如: https://github.com/cyanheads/maya-mcp-server 或 maya-mcp-server"
                    value={autoInstallSource}
                    onChange={(e) => setAutoInstallSource(e.target.value)}
                    className="w-full p-2.5 bg-theme-card border border-theme-subtle rounded-lg text-theme-primary focus:outline-none focus:border-emerald-500 font-mono text-[11px]"
                  />
                  <div className="text-[10px] text-theme-muted">
                    {isZh
                      ? "支持格式：https://github.com/owner/repo、maya-mcp-server、@modelcontextprotocol/server-filesystem"
                      : "Supported formats: GitHub URL, PyPI package, or npm package"}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-theme-muted block">{isZh ? "显示名称 (可选，留空自动生成)" : "Display Name (Optional)"}</label>
                  <input
                    type="text"
                    disabled={isAutoInstalling}
                    placeholder="例如: Autodesk Maya MCP"
                    value={autoInstallName}
                    onChange={(e) => setAutoInstallName(e.target.value)}
                    className="w-full p-2.5 bg-theme-card border border-theme-subtle rounded-lg text-theme-primary focus:outline-none focus:border-emerald-500 font-mono text-[11px]"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-theme-subtle">
                  <button
                    type="button"
                    disabled={isAutoInstalling}
                    onClick={() => setShowAutoInstallModal(false)}
                    className="px-3.5 py-1.5 rounded-lg text-theme-muted hover:text-theme-primary bg-theme-card border border-theme-subtle transition"
                  >
                    {isZh ? "取消" : "Cancel"}
                  </button>
                  <button
                    type="submit"
                    disabled={isAutoInstalling || !autoInstallSource.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-sky-600 hover:from-emerald-500 hover:to-sky-500 text-white font-bold shadow-md transition disabled:opacity-50 active:scale-95"
                  >
                    {isAutoInstalling ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>{isZh ? "全自动安装与验证中..." : "Installing & Verifying..."}</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                        <span>{isZh ? "🚀 一键智能安装并启动" : "🚀 Install & Start Now"}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

