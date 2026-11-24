import React, { useState } from "react";
import { X, Sparkles, Heart, ExternalLink, Copy, Check, Github, Mail } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation.js";

export interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "community" | "contact";
}

export type SponsorModalProps = ContactModalProps;

export const ContactModal: React.FC<ContactModalProps> = ({
  isOpen,
  onClose,
  initialTab = "community",
}) => {
  const { tText } = useTranslation();
  const [activeTab, setActiveTab] = useState<"sponsor" | "community">(
    initialTab === "contact" ? "sponsor" : "community"
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const usdtAddress = "TPRrDW8DGsrDmcnWvanTbFz7XEJuywu21i";
  const binanceUid = "1292741809";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-xl bg-theme-card border border-theme-subtle rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-emerald-500/10 via-sky-500/10 to-transparent border-b border-theme-subtle flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-500 flex items-center justify-center shadow-xs">
              <Heart className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-theme-primary tracking-tight">
                  {tText("支持与开源社区", "Support & Community", "サポート & コミュニティ", "Support & Community")}
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <Sparkles className="w-3 h-3" />
                  Nexus Open Source
                </span>
              </div>
              <p className="text-xs text-theme-secondary mt-0.5">
                {tText(
                  "感谢您使用并支持 Nexus 开源项目生态",
                  "Thank you for using and supporting the Nexus ecosystem",
                  "Nexusオープンソースエコシステムのご利用とご支援に感謝します",
                  "Vielen Dank für Ihre Unterstützung des Nexus-Ökosystems"
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

        {/* Tab Switcher */}
        <div className="flex border-b border-theme-subtle bg-theme-base/50 p-1.5 gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab("sponsor")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition cursor-pointer ${
              activeTab === "sponsor"
                ? "bg-theme-card text-emerald-600 dark:text-emerald-400 shadow-xs border border-theme-subtle"
                : "text-theme-secondary hover:text-theme-primary"
            }`}
          >
            <Heart className="w-4 h-4" />
            {tText("赞助支持 (Sponsorship)", "Sponsor Project", "プロジェクト支援", "Projekt unterstützen")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("community")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition cursor-pointer ${
              activeTab === "community"
                ? "bg-theme-card text-sky-600 dark:text-sky-400 shadow-xs border border-theme-subtle"
                : "text-theme-secondary hover:text-theme-primary"
            }`}
          >
            <Github className="w-4 h-4" />
            {tText("社区与帮助 (Community & Help)", "Community & Help", "コミュニティ & ヘルプ", "Community & Hilfe")}
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {activeTab === "sponsor" ? (
            <div className="space-y-4">
              <p className="text-xs text-theme-secondary leading-relaxed">
                {tText(
                  "Nexus 为完全开源项目。所有赞助均为自愿行为，将全部用于持续的基础设施维护、模型工具集成与新特性演进。",
                  "Nexus is fully open-source. All sponsorships are voluntary and support continuous infrastructure maintenance, tool integration, and feature development.",
                  "Nexusは完全なオープンソースプロジェクトです。すべての支援は自発的なものであり、継続的な開発と維持に役立てられます。",
                  "Nexus ist ein Open-Source-Projekt. Alle Spenden sind freiwillig und unterstützen die Wartung und Entwicklung."
                )}
              </p>

              {/* USDT Card */}
              <div className="p-4 rounded-xl border border-theme-subtle bg-theme-base/60 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-theme-primary">USDT (on-chain)</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      TRON (TRC-20)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(usdtAddress, "usdt")}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 transition cursor-pointer"
                  >
                    {copiedKey === "usdt" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === "usdt" ? tText("已复制", "Copied", "コピー完了", "Kopiert") : tText("复制地址", "Copy Address", "アドレスをコピー", "Adresse kopieren")}</span>
                  </button>
                </div>
                <div className="p-2.5 rounded-lg bg-theme-card font-mono text-xs text-theme-primary select-all break-all border border-theme-subtle/60">
                  {usdtAddress}
                </div>
              </div>

              {/* Binance Pay Card */}
              <div className="p-4 rounded-xl border border-theme-subtle bg-theme-base/60 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-theme-primary">Binance Pay</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      Zero Fee Transfer
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(binanceUid, "binance")}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 transition cursor-pointer"
                  >
                    {copiedKey === "binance" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === "binance" ? tText("已复制", "Copied", "コピー完了", "Kopiert") : tText("复制 UID", "Copy UID", "UIDをコピー", "UID kopieren")}</span>
                  </button>
                </div>
                <div className="p-2.5 rounded-lg bg-theme-card font-mono text-xs text-theme-primary select-all border border-theme-subtle/60">
                  UID: <span className="font-bold">{binanceUid}</span>
                </div>
              </div>

              <p className="text-[11px] text-theme-secondary/70 italic">
                {tText(
                  "维护团队绝不会通过任何私信向您索要转账或账户凭据。",
                  "The maintainers will never contact you privately to solicit funds or credentials.",
                  "メンテナーが個別に資金や認証情報を要求することは決してありません。",
                  "Die Maintainer werden Sie niemals privat kontaktieren, um Geld oder Zugangsdaten anzufordern."
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <a
                href="https://github.com/ysunyang4/Nexus/issues"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-3.5 rounded-xl border border-theme-subtle bg-theme-base/60 hover:bg-theme-card-hover transition group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center">
                    <Github className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-theme-primary group-hover:text-sky-500 transition">
                      {tText("GitHub Issues (缺陷报告与需求)", "GitHub Issues (Bug Reports & Requests)", "GitHub Issues (バグ報告 & 要求)", "GitHub Issues")}
                    </div>
                    <div className="text-[11px] text-theme-secondary">
                      {tText("提交错误报告与功能提议", "Submit bug reports and feature suggestions", "バグ報告や機能提案を送信", "Fehlerberichte und Vorschläge einreichen")}
                    </div>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-theme-secondary group-hover:text-theme-primary" />
              </a>

              <a
                href="https://github.com/ysunyang4/Nexus/discussions"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-3.5 rounded-xl border border-theme-subtle bg-theme-base/60 hover:bg-theme-card-hover transition group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                    <Github className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-theme-primary group-hover:text-indigo-500 transition">
                      {tText("GitHub Discussions (技术交流)", "GitHub Discussions (Community Q&A)", "GitHub Discussions (コミュニティQ&A)", "GitHub Discussions")}
                    </div>
                    <div className="text-[11px] text-theme-secondary">
                      {tText("参与社区交流与最佳实践分享", "Join community Q&A and share best practices", "コミュニティQ&Aに参加してベストプラクティスを共有", "An Diskussionen teilnehmen")}
                    </div>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-theme-secondary group-hover:text-theme-primary" />
              </a>

              <div className="p-3.5 rounded-xl border border-theme-subtle bg-theme-base/60 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-theme-primary">
                      {tText("商业授权与企业支持", "Commercial Licensing & Enterprise", "商用ライセンス & 企業サポート", "Kommerzielle Lizenzierung")}
                    </div>
                    <div className="text-[11px] font-mono text-theme-secondary">
                      ysunyang4@gmail.com
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy("ysunyang4@gmail.com", "mail")}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 transition cursor-pointer"
                >
                  {copiedKey === "mail" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === "mail" ? tText("已复制", "Copied", "コピー完了", "Kopiert") : tText("复制邮箱", "Copy Email", "メールをコピー", "E-Mail kopieren")}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const SponsorModal = ContactModal;
