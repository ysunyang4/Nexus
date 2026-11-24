import React, { useState, useEffect, useCallback } from "react";
import {
  Compass,
  Copy,
  Check,
  Eye,
  EyeOff,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Key,
  Globe,
  BookOpen,
  Sparkles,
  Layers,
  Lock,
} from "lucide-react";
import { bridge, type TunnelStatusDto } from "../../api/bridge.js";
import { openExternalUrl } from "../../api/browser-helper.js";
import { useTranslation } from "../../i18n/useTranslation.js";

interface WebAgentConnectionProps {
  tunnelStatus: TunnelStatusDto | null;
  onRefreshAll?: () => void;
}

export const WebAgentConnection: React.FC<WebAgentConnectionProps> = ({
  tunnelStatus,
  onRefreshAll,
}) => {
  const { language } = useTranslation();
  const isZh = language === "zh-CN";

  const [currentMcpToken, setCurrentMcpToken] = useState<string>("");
  const [showActiveToken, setShowActiveToken] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);

  // Manual token input
  const [mcpToken, setMcpToken] = useState("");
  const [isEditingToken, setIsEditingToken] = useState(false);

  // Token scopes (Default: Read-Only per v1.3.4 security requirements)
  const [tokenScopes, setTokenScopes] = useState<string[]>(["read"]);

  // Busy & message states
  const [busy, setBusy] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Auto-hide revealed token after 60 seconds
  useEffect(() => {
    let timer: any;
    if (showActiveToken) {
      timer = setTimeout(() => {
        setShowActiveToken(false);
      }, 60000);
    }
    return () => clearTimeout(timer);
  }, [showActiveToken]);

  // Load active token on mount or when tunnelStatus changes
  const loadToken = useCallback(async () => {
    try {
      const res = await bridge.tunnel.getMcpToken();
      if (res?.token) {
        setCurrentMcpToken(res.token);
      }
    } catch (e) {
      console.warn("Failed to retrieve DPAPI token:", e);
    }
  }, []);

  useEffect(() => {
    loadToken();
  }, [loadToken, tunnelStatus]);

  // Handle open external blog tutorial
  const handleOpenBlogTutorial = async () => {
    const url = "https://blog.ycu.de5.net/";
    try {
      await openExternalUrl(url);
    } catch {
      window.open(url, "_blank");
    }
  };

  // Copy local endpoint
  const handleCopyEndpoint = async () => {
    const endpoint = "http://127.0.0.1:18080/mcp";
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopiedEndpoint(true);
      setTimeout(() => setCopiedEndpoint(false), 2000);
    } catch (e) {
      console.error("Failed to copy endpoint:", e);
    }
  };

  // Copy current active token
  const handleCopyActiveToken = async () => {
    let token = currentMcpToken;
    if (!token) {
      try {
        const res = await bridge.tunnel.getMcpToken();
        if (res?.token) {
          token = res.token;
          setCurrentMcpToken(token);
        }
      } catch (e) {
        console.error("Failed to fetch token:", e);
      }
    }
    if (token) {
      await navigator.clipboard.writeText(token);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } else {
      // Auto-generate if no token exists
      await handleAutoCreateToken();
    }
  };

  // Auto-create token
  const handleAutoCreateToken = async () => {
    setBusy(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await bridge.tunnel.autoCreateToken(tokenScopes);
      if (res?.token) {
        setCurrentMcpToken(res.token);
        setShowActiveToken(true);
        setSuccessMsg(isZh ? "MCP 令牌已生成并安全保存到 DPAPI" : "Token created and saved to DPAPI");
        setIsEditingToken(false);
        if (onRefreshAll) onRefreshAll();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || (isZh ? "生成令牌失败" : "Failed to generate token"));
    } finally {
      setBusy(false);
    }
  };

  // Save manual token
  const handleSaveManualToken = async () => {
    const tok = mcpToken.trim();
    if (!tok) return;
    setBusy(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await bridge.tunnel.saveMcpToken(tok);
      setCurrentMcpToken(tok);
      setShowActiveToken(true);
      setIsEditingToken(false);
      setMcpToken("");
      setSuccessMsg(isZh ? "MCP 令牌已保存至 Windows DPAPI" : "MCP token saved to DPAPI");
      if (onRefreshAll) onRefreshAll();
    } catch (err: any) {
      setErrorMsg(err?.message || (isZh ? "保存令牌失败" : "Failed to save token"));
    } finally {
      setBusy(false);
    }
  };

  const toggleTokenScope = (sc: string) => {
    const next = tokenScopes.includes(sc)
      ? tokenScopes.length > 1
        ? tokenScopes.filter((s) => s !== sc)
        : tokenScopes
      : [...tokenScopes, sc];
    setTokenScopes(next);
  };

  const scopePresets = [
    { id: "read-only", label: isZh ? "只读 (推荐)" : "Read-Only (Recommended)", list: ["read"] },
    { id: "write-only", label: isZh ? "仅写" : "Write-Only", list: ["write"] },
    { id: "read-write", label: isZh ? "读写" : "Read & Write", list: ["read", "write"] },
    { id: "execute", label: isZh ? "执行" : "Execute", list: ["execute"] },
    { id: "full", label: isZh ? "完全控制" : "Full Control", list: ["read", "write", "execute"] },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Feedback Messages */}
      {successMsg && (
        <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs">
          <Check className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Hero Header Card */}
      <div className="p-6 bg-theme-card border border-theme-subtle rounded-2xl shadow-xs space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500/10 via-indigo-500/10 to-purple-500/10 border border-sky-500/20 flex items-center justify-center text-sky-500 shrink-0 shadow-inner">
              <Compass className="w-6 h-6 animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="font-bold text-base text-theme-primary">
                  {isZh ? "WebAgent 浏览器插件配置与授权" : "WebAgent Browser Extension"}
                </h3>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {isZh ? "本地引擎已就绪" : "Engine Ready"}
                </span>
              </div>
              <p className="text-xs text-theme-secondary mt-1 max-w-2xl leading-relaxed">
                {isZh
                  ? "WebAgent 是专用于网页端主流 AI 的浏览器插件（支持 ChatGPT、Gemini、DeepSeek 等），通过本地安全回环 (Local Loopback) 无缝连接 Nexus 本地引擎并安全调用工具。"
                  : "WebAgent is a browser extension for mainstream web AI assistants (supporting ChatGPT, Gemini, DeepSeek, etc.), connecting to Nexus via secure local loopback to execute tools."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] text-theme-muted uppercase tracking-wider font-mono">
                {isZh ? "通讯模式" : "NETWORK MODE"}
              </div>
              <div className="text-xs font-semibold text-theme-primary font-mono mt-0.5">
                Local Loopback
              </div>
            </div>
            <div className="h-8 w-px bg-theme-subtle" />
            <div className="text-right">
              <div className="text-[10px] text-theme-muted uppercase tracking-wider font-mono">
                {isZh ? "本地端点" : "LOCAL PORT"}
              </div>
              <div className="text-xs font-semibold text-sky-500 font-mono mt-0.5">
                18080
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tutorial Guidance Card (Per user instruction: 简单的写请查看详细的配置教程然后给到博客地址) */}
      <div className="p-5 bg-gradient-to-r from-sky-500/10 via-indigo-500/5 to-transparent border border-sky-500/30 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400 font-bold text-sm">
            <BookOpen className="w-4 h-4" />
            <span>{isZh ? "WebAgent 详细配置与使用教程" : "WebAgent Setup & Usage Guide"}</span>
          </div>
          <p className="text-xs text-theme-secondary leading-relaxed">
            {isZh
              ? "请查看详细的配置教程，按照步骤安装 WebAgent 浏览器插件、填入下方本地令牌与端点，即可在网页端 AI 中直接使用 Nexus 本地能力。"
              : "Please check the detailed tutorial to install the WebAgent browser extension, configure your local token and endpoint, and start using local Nexus tools."}
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenBlogTutorial}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-sky-500 hover:bg-sky-600 active:scale-[0.98] text-white rounded-xl text-xs font-bold shadow-md shadow-sky-500/20 transition shrink-0 cursor-pointer"
        >
          <span>{isZh ? "查看详细配置教程 (博客)" : "View Tutorial on Blog"}</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Local MCP Access Token (lb_...) */}
        <div className="p-6 bg-theme-card border border-theme-subtle rounded-2xl shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-sky-500" />
              <h4 className="font-bold text-sm text-theme-primary">
                {isZh ? "本地 API & MCP 访问令牌" : "Local API & MCP Access Token"}
              </h4>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-mono font-medium">
              <Lock className="w-3 h-3" />
              <span>DPAPI Secured</span>
            </div>
          </div>

          <div className="text-xs text-theme-secondary leading-relaxed bg-theme-base/60 p-3 rounded-xl border border-theme-subtle">
            <strong className="text-sky-500">Token 说明：</strong>
            {isZh
              ? "填入您的本地 MCP 访问令牌（即以 lb_ 开头的密钥）即可正常调用！点击下方按钮将自动生成并持久化。"
              : "Enter your local MCP access token (starts with lb_) into WebAgent to authenticate requests. Click below to generate and persist."}
          </div>

          {/* Active Token Display */}
          <div className="p-3.5 rounded-xl bg-theme-base/80 border border-theme-subtle space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-theme-primary flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>{isZh ? "当前生效令牌" : "Active MCP Token"}</span>
              </span>
              {(tunnelStatus?.has_mcp_token || currentMcpToken) && (
                <span className="text-[11px] text-emerald-500 font-mono">
                  {isZh ? "已持久化到 DPAPI" : "Persisted in DPAPI"}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 font-mono text-xs px-3 py-2 rounded-lg bg-theme-card border border-theme-subtle text-theme-primary truncate select-all">
                {currentMcpToken ? (
                  showActiveToken ? (
                    currentMcpToken
                  ) : currentMcpToken.length > 8 ? (
                    `${currentMcpToken.slice(0, 3)}••••••••••••${currentMcpToken.slice(-4)}`
                  ) : (
                    "••••••••••••"
                  )
                ) : tunnelStatus?.has_mcp_token ? (
                  showActiveToken ? (
                    "•••••••• (已通过 DPAPI 加密存储)"
                  ) : (
                    "lb_••••••••"
                  )
                ) : (
                  <span className="text-theme-muted italic">
                    {isZh ? "尚未生成令牌，请点击下方自动生成" : "No token created yet"}
                  </span>
                )}
              </div>

              {(currentMcpToken || tunnelStatus?.has_mcp_token) && (
                <button
                  type="button"
                  onClick={() => setShowActiveToken(!showActiveToken)}
                  className="p-2 rounded-lg border border-theme-subtle hover:bg-theme-card-hover text-theme-secondary transition"
                  title={showActiveToken ? (isZh ? "隐藏明文" : "Hide") : (isZh ? "查看明文" : "Show")}
                >
                  {showActiveToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              )}

              <button
                type="button"
                onClick={handleCopyActiveToken}
                className="flex items-center gap-1.5 px-3 py-2 bg-sky-500 hover:bg-sky-600 active:scale-95 text-white rounded-lg text-xs font-semibold transition shadow-xs"
              >
                {copiedToken ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>{isZh ? "已复制" : "Copied"}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>{isZh ? "复制" : "Copy"}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Token Scopes */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-theme-primary">
                {isZh ? "令牌权限范围 (Token Scopes)" : "Token Scopes"}
              </label>
              <div className="flex items-center gap-1">
                {scopePresets.map((preset) => {
                  const isSelected =
                    preset.list.length === tokenScopes.length &&
                    preset.list.every((s) => tokenScopes.includes(s));
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setTokenScopes([...preset.list])}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                        isSelected
                          ? "bg-sky-500 text-white font-semibold shadow-xs"
                          : "bg-theme-base hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle"
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              {[
                {
                  id: "read",
                  title: isZh ? "读取 (Read)" : "Read",
                  desc: isZh
                    ? "授权项目目录中的代码、文件与 Git 状态只读访问。"
                    : "Read files, directories, and Git status in authorized projects.",
                },
                {
                  id: "write",
                  title: isZh ? "写入 (Write)" : "Write",
                  desc: isZh
                    ? "创建、修改或修补代码文件。"
                    : "Create, edit, and modify code files.",
                },
                {
                  id: "execute",
                  title: isZh ? "执行 (Execute)" : "Execute",
                  desc: isZh
                    ? "在沙箱环境中运行构建、测试与受控工作流。"
                    : "Run build, tests, and workflows in the controlled environment.",
                },
              ].map((s) => (
                <label
                  key={s.id}
                  className="flex items-start gap-2.5 p-2.5 rounded-lg border border-theme-subtle bg-theme-base/50 hover:bg-theme-base cursor-pointer transition"
                >
                  <input
                    type="checkbox"
                    checked={tokenScopes.includes(s.id)}
                    onChange={() => toggleTokenScope(s.id)}
                    className="mt-0.5 rounded border-theme-subtle text-sky-500 focus:ring-sky-500"
                  />
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-theme-primary">{s.title}</div>
                    <div className="text-[11px] text-theme-muted leading-tight">{s.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            {tokenScopes.includes("write") && (
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[11px] flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{isZh ? "注意：包含写权限，外部模型可发起文件写入请求。" : "Warning: Write scope enables code modifications."}</span>
              </div>
            )}
            {tokenScopes.includes("execute") && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-[11px] flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{isZh ? "高危：包含执行权限，外部模型可发起命令与工作流调用。" : "High Risk: Execute scope allows workflow invocations."}</span>
              </div>
            )}
          </div>

          {/* Action Button: Auto-generate */}
          <button
            type="button"
            onClick={handleAutoCreateToken}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-sky-500/20 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            <span>
              {busy
                ? (isZh ? "正在生成..." : "Generating...")
                : (isZh ? "⚡ 自动生成专属 MCP 令牌并保存到 DPAPI" : "⚡ Auto-Generate Token & Save to DPAPI")}
            </span>
          </button>

          {/* Manual Input Toggle */}
          <div className="pt-2 border-t border-theme-subtle">
            <button
              type="button"
              onClick={() => setIsEditingToken(!isEditingToken)}
              className="text-xs text-sky-500 hover:text-sky-600 font-medium flex items-center gap-1 transition"
            >
              <span>{isEditingToken ? (isZh ? "收起手动录入" : "Hide Manual Input") : (isZh ? "手动录入已有令牌" : "Manually enter existing token")}</span>
            </button>

            {isEditingToken && (
              <div className="mt-3 space-y-2">
                <input
                  type="text"
                  value={mcpToken}
                  onChange={(e) => setMcpToken(e.target.value)}
                  placeholder="Enter MCP Token (lb_...)"
                  className="w-full text-xs font-mono px-3 py-2 rounded-lg bg-theme-base border border-theme-subtle text-theme-primary placeholder:text-theme-muted focus:outline-none focus:border-sky-500"
                />
                <button
                  type="button"
                  onClick={handleSaveManualToken}
                  disabled={busy || !mcpToken.trim()}
                  className="px-3 py-1.5 bg-theme-card-hover hover:bg-theme-subtle text-theme-primary rounded-lg text-xs font-semibold transition disabled:opacity-50"
                >
                  {isZh ? "保存到 DPAPI" : "Save"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Local Endpoint & WebAgent Connection Info */}
        <div className="space-y-6">
          <div className="p-6 bg-theme-card border border-theme-subtle rounded-2xl shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-sky-500" />
              <h4 className="font-bold text-sm text-theme-primary">
                {isZh ? "本地 MCP 服务端点" : "Local MCP Endpoint"}
              </h4>
            </div>

            <div className="text-xs text-theme-secondary leading-relaxed">
              {isZh
                ? "WebAgent 扩展直接与本机回环地址（127.0.0.1）通信，无需经过公网 Cloudflare 隧道。请将以下端点填入 WebAgent 插件配置中的 Endpoint 栏："
                : "WebAgent communicates directly over local loopback (127.0.0.1), without passing through a public tunnel. Enter this endpoint into WebAgent settings:"}
            </div>

            <div className="p-3 bg-theme-base rounded-xl border border-theme-subtle flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-theme-primary select-all">
                http://127.0.0.1:18080/mcp
              </span>
              <button
                type="button"
                onClick={handleCopyEndpoint}
                className="flex items-center gap-1 px-2.5 py-1 bg-theme-card hover:bg-theme-card-hover border border-theme-subtle text-theme-primary rounded-lg text-xs font-medium transition"
              >
                {copiedEndpoint ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{isZh ? "已复制" : "Copied"}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>{isZh ? "复制端点" : "Copy"}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Quick Steps Card */}
          <div className="p-6 bg-theme-card border border-theme-subtle rounded-2xl shadow-xs space-y-3">
            <h4 className="font-bold text-sm text-theme-primary flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-500" />
              <span>{isZh ? "配置三步法" : "3-Step Setup"}</span>
            </h4>

            <ol className="space-y-2.5 text-xs text-theme-secondary list-decimal list-inside font-medium leading-relaxed">
              <li>
                <strong className="text-theme-primary">{isZh ? "安装插件：" : "Install Extension: "}</strong>
                {isZh
                  ? "访问上方博客教程，获取并安装 WebAgent 浏览器插件扩展程序。"
                  : "Visit the blog tutorial above to install the WebAgent browser extension."}
              </li>
              <li>
                <strong className="text-theme-primary">{isZh ? "填写凭证：" : "Enter Credentials: "}</strong>
                {isZh
                  ? "在 WebAgent 插件设置中粘贴上述本地端点 (http://127.0.0.1:18080/mcp) 以及 lb_ 密钥。"
                  : "Paste the local endpoint (http://127.0.0.1:18080/mcp) and your lb_ token."}
              </li>
              <li>
                <strong className="text-theme-primary">{isZh ? "开始使用：" : "Ready to Use: "}</strong>
                {isZh
                  ? "打开任意支持的网页端 AI（如 ChatGPT、Gemini 等），即可直接调用 Nexus 本地 MCP 工具！"
                  : "Open any supported web AI (such as ChatGPT, Gemini, etc.) and start executing tools!"}
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};
