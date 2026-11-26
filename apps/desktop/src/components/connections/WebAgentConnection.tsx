import React, { useState } from "react";
import {
  Compass,
  Copy,
  Check,
  ExternalLink,
  Globe,
  BookOpen,
  Layers,
} from "lucide-react";
import { type TunnelStatusDto } from "../../api/bridge.js";
import { openExternalUrl } from "../../api/browser-helper.js";
import { useTranslation } from "../../i18n/useTranslation.js";

interface WebAgentConnectionProps {
  tunnelStatus: TunnelStatusDto | null;
  onRefreshAll?: () => void;
}

export const WebAgentConnection: React.FC<WebAgentConnectionProps> = ({
  tunnelStatus: _tunnelStatus,
  onRefreshAll: _onRefreshAll,
}) => {
  const { language } = useTranslation();
  const isZh = language === "zh-CN";

  const [copiedEndpoint, setCopiedEndpoint] = useState(false);

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
    const endpoint = "http://127.0.0.1:8787";
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopiedEndpoint(true);
      setTimeout(() => setCopiedEndpoint(false), 2000);
    } catch (e) {
      console.error("Failed to copy endpoint:", e);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Hero Header Card */}
      <div className="p-6 bg-theme-card border border-theme-subtle rounded-2xl  space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-theme-card border border-theme-subtle flex items-center justify-center text-theme-primary shrink-0 ">
              <Compass className="w-6 h-6 animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="font-bold text-base text-[var(--accent-brand)]">
                  {isZh ? "WebAgent 浏览器插件" : "WebAgent Browser Extension"}
                </h3>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-transparent text-[var(--success)] border border-[var(--border-default)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
                  {isZh ? "本地引擎已就绪" : "Engine Ready"}
                </span>
              </div>
              <p className="text-xs text-theme-secondary mt-1 max-w-2xl leading-relaxed">
                {isZh
                  ? "WebAgent 是专用于网页端主流 AI 的浏览器插件（支持 ChatGPT、DeepSeek、Kimi、Qwen 等），通过本地安全回环 (Local Loopback) 免密直连 Nexus MCP 网关并安全调用工具。"
                  : "WebAgent is a browser extension for mainstream web AI assistants (supporting ChatGPT, DeepSeek, Kimi, Qwen, etc.), connecting directly to Nexus MCP Gateway via zero-token local loopback."}
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
                {isZh ? "本地端口" : "LOCAL PORT"}
              </div>
              <div className="text-xs font-semibold text-theme-primary font-mono mt-0.5">
                8787
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tutorial Guidance Card */}
      <div className="p-5 bg-theme-card border border-theme-subtle rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 ">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-theme-primary text-theme-primary font-bold text-sm">
            <BookOpen className="w-4 h-4" />
            <span>{isZh ? "WebAgent 详细配置与使用教程" : "WebAgent Setup & Usage Guide"}</span>
          </div>
          <p className="text-xs text-theme-secondary leading-relaxed">
            {isZh
              ? "请查看详细的配置教程，安装最新版 WebAgent 浏览器插件并确认下方本地服务端点，即可在网页端 AI 中直接使用 Nexus 本地能力（本地回环免密直连，无需填写 Token）。"
              : "Please check the detailed tutorial to install the WebAgent browser extension, confirm the local endpoint below, and start using local Nexus tools (zero-token local loopback)."}
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenBlogTutorial}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[var(--btn-primary-bg)] hover:opacity-90 active:scale-[0.98] text-[var(--btn-primary-text)] rounded-xl text-xs font-bold   transition shrink-0 cursor-pointer"
        >
          <span>{isZh ? "查看详细配置教程 (博客)" : "View Tutorial on Blog"}</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Local MCP Endpoint */}
        <div className="p-6 bg-theme-card border border-theme-subtle rounded-2xl  space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-theme-primary" />
            <h4 className="font-bold text-sm text-theme-primary">
              {isZh ? "本地 MCP 服务端点" : "Local MCP Endpoint"}
            </h4>
          </div>

          <div className="text-xs text-theme-secondary leading-relaxed">
            {isZh
              ? "WebAgent 扩展直接与本机回环网关（127.0.0.1:8787）通信，无需经过公网隧道，也无需配置或粘贴 Token。请确认 WebAgent 插件中的服务端地址为："
              : "WebAgent communicates directly with the local loopback gateway (127.0.0.1:8787), with no public tunnel or Token required. Confirm this endpoint in WebAgent settings:"}
          </div>

          <div className="p-3 bg-theme-base rounded-xl border border-theme-subtle flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-theme-primary select-all">
              http://127.0.0.1:8787
            </span>
            <button
              type="button"
              onClick={handleCopyEndpoint}
              className="flex items-center gap-1 px-2.5 py-1 bg-theme-card hover:bg-theme-card-hover border border-theme-subtle text-theme-primary rounded-lg text-xs font-medium transition cursor-pointer"
            >
              {copiedEndpoint ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[var(--success)]" />
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

        {/* Card 2: Quick Steps Card */}
        <div className="p-6 bg-theme-card border border-theme-subtle rounded-2xl  space-y-3">
          <h4 className="font-bold text-sm text-theme-primary flex items-center gap-2">
            <Layers className="w-4 h-4 text-theme-primary" />
            <span>{isZh ? "配置三步法" : "3-Step Setup"}</span>
          </h4>

          <ol className="space-y-2.5 text-xs text-theme-secondary list-decimal list-inside font-medium leading-relaxed">
            <li>
              <strong className="text-theme-primary">{isZh ? "安装插件：" : "Install Extension: "}</strong>
              {isZh
                ? "访问上方博客教程，获取并安装最新版 WebAgent 2.0 浏览器扩展程序。"
                : "Visit the blog tutorial above to install the latest WebAgent 2.0 browser extension."}
            </li>
            <li>
              <strong className="text-theme-primary">{isZh ? "确认端点：" : "Confirm Endpoint: "}</strong>
              {isZh
                ? "打开 WebAgent 插件设置，确认服务端地址为 http://127.0.0.1:8787（本地免密直连，无需填写 Token）。"
                : "Open WebAgent settings and confirm the server URL is http://127.0.0.1:8787 (zero-token local loopback)."}
            </li>
            <li>
              <strong className="text-theme-primary">{isZh ? "开始使用：" : "Ready to Use: "}</strong>
              {isZh
                ? "打开任意支持的网页端 AI（如 ChatGPT、DeepSeek 等），即可直接调用 Nexus 本地 MCP 工具！"
                : "Open any supported web AI (such as ChatGPT, DeepSeek, etc.) and start executing local Nexus MCP tools!"}
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
};
