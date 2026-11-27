import React, { useState } from "react";
import {
  X,
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  Github,
  Mail,
  Globe,
  Star,
  Layers,
  BookOpen,
} from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation.js";
import { openExternalUrl } from "../../api/browser-helper.js";

export interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "intro" | "projects";
}

export type SponsorModalProps = ContactModalProps;

export const ContactModal: React.FC<ContactModalProps> = ({
  isOpen,
  onClose,
  initialTab = "intro",
}) => {
  const { language, tText } = useTranslation();
  const [activeTab, setActiveTab] = useState<"intro" | "projects">(initialTab);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleOpenUrl = (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    void openExternalUrl(url);
  };

  const getNoticeText = () => {
    if (language.startsWith("zh")) {
      return "如果你想让 Nexus 变得更加强大，可以去关注我的 GitHub 账号并下载我为 Nexus 制作的专属 MCP 和 Skill，并且这些 MCP 和 Skill 我也是长期维护的。如果我的项目对你有帮助，请帮我点一颗 Star ⭐";
    }
    if (language.startsWith("ja")) {
      return "Nexusをさらに強力にしたい場合は、私のGitHubアカウントをフォローして、Nexus専用に作成されたMCPとSkillをダウンロードしてください。これらは長期的にメンテナンスされています。プロジェクトが役立った場合は、ぜひStar⭐をお願いします。";
    }
    if (language.startsWith("de")) {
      return "Wenn Sie Nexus noch leistungsfähiger machen möchten, folgen Sie meinem GitHub-Konto und laden Sie exklusive, für Nexus optimierte MCPs und Skills herunter, die ich langfristig pflege. Wenn Ihnen mein Projekt hilft, hinterlassen Sie bitte einen Star ⭐";
    }
    return "If you want to make Nexus even more powerful, follow my GitHub account and download exclusive MCPs and Skills tailored for Nexus. I actively maintain these MCPs and Skills over the long term. If my project helps you, please star the repository ⭐";
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[var(--bg-modal-overlay)] backdrop-blur-md animate-in fade-in duration-200 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-xl bg-theme-card border border-theme-subtle rounded-2xl  overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (Blue Theme) */}
        <div className="px-6 py-5 bg-theme-card border-b border-theme-subtle flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl border border-theme-subtle bg-[var(--btn-primary-bg)]/15 text-theme-primary flex items-center justify-center ">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-theme-primary tracking-tight">
                  {tText("关于 Nexus 与开源生态", "About Nexus & Ecosystem", "Nexus とエコシステムについて", "Über Nexus & Ökosystem")}
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--btn-primary-bg)]/10 text-theme-primary text-theme-primary border border-theme-subtle font-mono">
                  v1.4.1
                </span>
              </div>
              <p className="text-xs text-theme-secondary mt-0.5">
                {tText(
                  "独立开源开发 · 安全连接 AI 与本地系统的控制中枢",
                  "Independent Open Source · Connecting AI Assistants & Local Workflows",
                  "個人オープンソース開発 · AIアシスタントとローカル環境を接続",
                  "Unabhängiges Open-Source-Projekt · KI-Assistenten mit lokaler Umgebung verbinden"
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher (Wireframe Design: 2 Tabs) */}
        <div className="flex border-b border-theme-subtle bg-theme-base/50 p-1.5 gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab("intro")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition cursor-pointer ${
              activeTab === "intro"
                ? "bg-theme-card text-theme-primary text-theme-primary  border border-theme-subtle font-semibold"
                : "text-theme-secondary hover:text-theme-primary"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            {tText("介绍说明与关注", "Introduction & Follow", "紹介 & フォロー", "Einführung & Folgen")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("projects")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition cursor-pointer ${
              activeTab === "projects"
                ? "bg-theme-card text-theme-primary text-theme-primary  border border-theme-subtle font-semibold"
                : "text-theme-secondary hover:text-theme-primary"
            }`}
          >
            <Layers className="w-4 h-4" />
            {tText("项目地址与开源", "Projects & Repositories", "プロジェクト一覧", "Projekte & Repositories")}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 max-h-[62vh] overflow-y-auto">
          {activeTab === "intro" ? (
            <div className="space-y-4">
              {/* Highlight Notice Card */}
              <div className="p-4 rounded-xl border border-theme-subtle bg-theme-card space-y-2">
                <div className="flex items-center gap-2 text-theme-primary text-theme-primary font-semibold text-xs">
                  <Star className="w-4 h-4 fill-current text-theme-primary" />
                  <span>{tText("作者专属倡议", "Developer Notice", "開発者からのお願い", "Entwickler-Hinweis")}</span>
                </div>
                <p className="text-xs text-theme-primary leading-relaxed">
                  {getNoticeText()}
                </p>
                <div className="pt-1 flex items-center gap-2">
                  <a
                    href="https://github.com/ysunyang4"
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => handleOpenUrl(e, "https://github.com/ysunyang4")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--btn-primary-bg)] hover:opacity-90 text-[var(--btn-primary-text)]  transition"
                  >
                    <Github className="w-3.5 h-3.5" />
                    <span>{tText("关注 GitHub 账号", "Follow on GitHub", "GitHub をフォロー", "GitHub folgen")}</span>
                    <ExternalLink className="w-3 h-3 ml-0.5" />
                  </a>
                  <a
                    href="https://github.com/ysunyang4/Nexus"
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => handleOpenUrl(e, "https://github.com/ysunyang4/Nexus")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-theme-base border border-theme-subtle hover:bg-theme-card-hover text-theme-primary transition"
                  >
                    <Star className="w-3.5 h-3.5 text-[var(--warning)] fill-current" />
                    <span>Star Nexus</span>
                  </a>
                </div>
              </div>

              {/* Social Channels Links */}
              <div className="space-y-2 pt-1">
                <div className="text-[11px] font-semibold text-theme-muted uppercase tracking-wider px-1">
                  {tText("关注作者与社交阵地", "Connect & Social Media", "SNS & プラットフォーム", "Social Media & Kontakt")}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <a
                    href="https://blog.ycu.de5.net/"
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => handleOpenUrl(e, "https://blog.ycu.de5.net/")}
                    className="flex items-center justify-between p-3 rounded-xl border border-theme-subtle bg-theme-base/60 hover:bg-theme-card-hover border-theme-subtle transition group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-[var(--btn-primary-bg)]/10 text-theme-primary flex items-center justify-center shrink-0">
                        <Globe className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-theme-primary group-hover:text-theme-primary transition truncate">
                          {tText("个人技术博客", "Tech Blog", "技術ブログ", "Tech-Blog")}
                        </div>
                        <div className="text-[10px] text-theme-muted font-mono truncate">
                          blog.ycu.de5.net
                        </div>
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-theme-muted group-hover:text-theme-primary shrink-0" />
                  </a>

                  <a
                    href="https://linux.do/u/yang_sunny/summary"
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => handleOpenUrl(e, "https://linux.do/u/yang_sunny/summary")}
                    className="flex items-center justify-between p-3 rounded-xl border border-theme-subtle bg-theme-base/60 hover:bg-theme-card-hover border-theme-subtle transition group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-[var(--btn-primary-bg)]/10 text-[var(--warning)] flex items-center justify-center shrink-0">
                        <span className="font-bold text-[10px]">🐧</span>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-theme-primary group-hover:text-[var(--warning)] transition truncate">
                          LINUX DO
                        </div>
                        <div className="text-[10px] text-theme-muted font-mono truncate">
                          @yang_sunny
                        </div>
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-theme-muted group-hover:text-theme-primary shrink-0" />
                  </a>

                  <a
                    href="https://x.com/yngstein"
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => handleOpenUrl(e, "https://x.com/yngstein")}
                    className="flex items-center justify-between p-3 rounded-xl border border-theme-subtle bg-theme-base/60 hover:bg-theme-card-hover border-theme-subtle transition group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-slate-500/10 text-theme-primary flex items-center justify-center shrink-0">
                        <span className="font-bold text-xs">𝕏</span>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-theme-primary group-hover:text-theme-primary transition truncate">
                          X (Twitter)
                        </div>
                        <div className="text-[10px] text-theme-muted font-mono truncate">
                          @yngstein
                        </div>
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-theme-muted group-hover:text-theme-primary shrink-0" />
                  </a>

                  <a
                    href="https://afdian.com/a/ysunyang4"
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => handleOpenUrl(e, "https://afdian.com/a/ysunyang4")}
                    className="flex items-center justify-between p-3 rounded-xl border border-theme-subtle bg-theme-base/60 hover:bg-theme-card-hover border-theme-subtle transition group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-[var(--btn-primary-bg)]/10 text-theme-primary flex items-center justify-center shrink-0">
                        <span className="font-bold text-[10px]"></span>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-theme-primary group-hover:text-theme-primary transition truncate">
                          {tText("爱发电", "Afdian", "Afdian", "Afdian")}
                        </div>
                        <div className="text-[10px] text-theme-muted font-mono truncate">
                          a/ysunyang4
                        </div>
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-theme-muted group-hover:text-theme-primary shrink-0" />
                  </a>

                  <a
                    href="https://www.reddit.com/user/OutrageousRabbit3296"
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => handleOpenUrl(e, "https://www.reddit.com/user/OutrageousRabbit3296")}
                    className="flex items-center justify-between p-3 rounded-xl border border-theme-subtle bg-theme-base/60 hover:bg-theme-card-hover border-theme-subtle transition group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0">
                        <span className="font-bold text-[10px]">🤖</span>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-theme-primary group-hover:text-orange-500 transition truncate">
                          Reddit
                        </div>
                        <div className="text-[10px] text-theme-muted font-mono truncate">
                          u/OutrageousRabbit3296
                        </div>
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-theme-muted group-hover:text-theme-primary shrink-0" />
                  </a>

                  <div className="flex items-center justify-between p-3 rounded-xl border border-theme-subtle bg-theme-base/60">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-[var(--btn-primary-bg)]/10 text-theme-primary flex items-center justify-center shrink-0">
                        <Mail className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-theme-primary truncate">
                          {tText("联系邮箱", "Email", "メール", "E-Mail")}
                        </div>
                        <div className="text-[10px] text-theme-muted font-mono truncate">
                          ysunyang4@gmail.com
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy("ysunyang4@gmail.com", "mail")}
                      className="px-2 py-1 text-[11px] rounded bg-[var(--btn-primary-bg)]/10 hover:bg-[var(--btn-primary-bg)]/20 text-theme-primary text-theme-primary transition cursor-pointer flex items-center gap-1"
                    >
                      {copiedKey === "mail" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === "mail" ? tText("已复制", "Copied", "完了", "Kopiert") : tText("复制", "Copy", "コピー", "Kopieren")}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Top Card: GitHub Profile */}
              <a
                href="https://github.com/ysunyang4"
                target="_blank"
                rel="noreferrer"
                onClick={(e) => handleOpenUrl(e, "https://github.com/ysunyang4")}
                className="flex items-center justify-between p-4 rounded-xl border border-theme-subtle bg-theme-card border-theme-subtle transition group cursor-pointer "
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[var(--btn-primary-bg)]/20 text-theme-primary flex items-center justify-center shrink-0 border border-theme-subtle">
                    <Github className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-theme-primary group-hover:text-theme-primary transition">
                        Ryan Sun (@ysunyang4)
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-[var(--btn-primary-bg)]/20 text-theme-primary text-theme-primary border border-theme-subtle">
                        {tText("作者主页", "Author Profile", "作者ページ", "Autor")}
                      </span>
                    </div>
                    <div className="text-xs text-theme-secondary mt-0.5 truncate">
                      {tText(
                        "关注作者 GitHub，获取最新发布的开源项目与维护动态",
                        "Follow author on GitHub for updates and new open-source releases",
                        "GitHubでフォローして、最新の更新やリリースを確認",
                        "Folgen Sie auf GitHub für die neuesten Veröffentlichungen"
                      )}
                    </div>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-theme-secondary group-hover:text-theme-primary shrink-0" />
              </a>

              {/* Project Card 1: Nexus */}
              <a
                href="https://github.com/ysunyang4/Nexus"
                target="_blank"
                rel="noreferrer"
                onClick={(e) => handleOpenUrl(e, "https://github.com/ysunyang4/Nexus")}
                className="flex items-center justify-between p-3.5 rounded-xl border border-theme-subtle bg-theme-base/60 hover:bg-theme-card-hover border-theme-subtle transition group cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-[var(--btn-primary-bg)]/10 text-theme-primary flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-theme-primary group-hover:text-theme-primary transition">
                        Nexus (v1.4.1)
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-[var(--btn-primary-bg)]/10 text-theme-primary text-theme-primary">
                        Core System
                      </span>
                    </div>
                    <div className="text-[11px] text-theme-secondary mt-0.5 line-clamp-1">
                      {tText(
                        "本地桌面级 AI 控制中枢与通用 MCP 执行网关，将 Web 大模型安全连接至本地环境。",
                        "Local AI Control Plane & universal MCP execution bridge for authorized workflows.",
                        "ローカルAIコントロールプレーン & 承認済みワークフロー用の汎用MCP実行ブリッジ。",
                        "Lokale KI-Steuerungsebene & universelle MCP-Ausführungsbrücke."
                      )}
                    </div>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-theme-secondary group-hover:text-theme-primary shrink-0" />
              </a>

              {/* Project Card 2: WebAgent */}
              <a
                href="https://github.com/ysunyang4/webagent"
                target="_blank"
                rel="noreferrer"
                onClick={(e) => handleOpenUrl(e, "https://github.com/ysunyang4/webagent")}
                className="flex items-center justify-between p-3.5 rounded-xl border border-theme-subtle bg-theme-base/60 hover:bg-theme-card-hover border-theme-subtle transition group cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-[var(--btn-primary-bg)]/10 text-theme-primary flex items-center justify-center shrink-0">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-theme-primary group-hover:text-theme-primary transition">
                        WebAgent
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-[var(--btn-primary-bg)]/10 text-theme-primary text-theme-primary">
                        Browser Extension
                      </span>
                    </div>
                    <div className="text-[11px] text-theme-secondary mt-0.5 line-clamp-1">
                      {tText(
                        "连接 Web 端 ChatGPT / DeepSeek / Kimi 与本地 Nexus 实例的浏览器增强扩展。",
                        "Browser extension connecting ChatGPT, DeepSeek, and Kimi to local Nexus.",
                        "ChatGPT、DeepSeek、Kimi をローカル Nexus に接続するブラウザ扩展機能。",
                        "Browser-Erweiterung zur Verbindung von Web-KI mit lokalem Nexus."
                      )}
                    </div>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-theme-secondary group-hover:text-theme-primary shrink-0" />
              </a>

              {/* GitHub Issues & Discussions */}
              <a
                href="https://github.com/ysunyang4/Nexus/issues"
                target="_blank"
                rel="noreferrer"
                onClick={(e) => handleOpenUrl(e, "https://github.com/ysunyang4/Nexus/issues")}
                className="flex items-center justify-between p-3.5 rounded-xl border border-theme-subtle bg-theme-base/60 hover:bg-theme-card-hover transition group cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-slate-500/10 text-theme-secondary flex items-center justify-center shrink-0">
                    <Github className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-theme-primary group-hover:text-theme-primary transition">
                      {tText("GitHub Issues (缺陷报告与建议)", "GitHub Issues (Bug Reports & Requests)", "GitHub Issues (バグ報告 & 要求)", "GitHub Issues")}
                    </div>
                    <div className="text-[11px] text-theme-secondary mt-0.5">
                      {tText("提交错误报告或提出新功能构想", "Submit bug reports or suggest new features", "バグ報告や機能提案を送信", "Fehlerberichte oder Vorschläge einreichen")}
                    </div>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-theme-secondary group-hover:text-theme-primary shrink-0" />
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-theme-base/40 border-t border-theme-subtle flex items-center justify-between text-xs text-theme-muted">
          <span>
            {tText(
              "点击外部空白区域或右上角一键关闭",
              "Click outside or top-right to close",
              "外側をクリックして閉じます",
              "Klicken Sie außerhalb zum Schließen"
            )}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[var(--btn-primary-bg)] hover:opacity-90 text-[var(--btn-primary-text)] font-medium  transition cursor-pointer"
          >
            {tText("关闭", "Close", "閉じる", "Schließen")}
          </button>
        </div>
      </div>
    </div>
  );
};

export const SponsorModal = ContactModal;
