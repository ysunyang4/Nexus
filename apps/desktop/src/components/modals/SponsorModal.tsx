import React, { useState } from "react";
import { Heart, X, Coffee, Sparkles } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation.js";
import wechatPayImg from "../../assets/sponsor/wechat-pay.jpg";
import alipayImg from "../../assets/sponsor/alipay.jpg";

export interface SponsorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SponsorModal: React.FC<SponsorModalProps> = ({ isOpen, onClose }) => {
  const { t, language } = useTranslation();
  const isZh = language.startsWith("zh");
  const [activeTab, setActiveTab] = useState<"all" | "wechat" | "alipay">("all");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-theme-card border border-theme-subtle rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-rose-500/10 via-amber-500/10 to-transparent border-b border-theme-subtle flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-500 shadow-xs">
              <Heart className="w-5 h-5 fill-rose-500/20" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-theme-primary tracking-tight">
                  {t.sponsor?.title || (isZh ? "赞助与支持" : "Sponsor & Support")}
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/10 text-rose-500 border border-rose-500/20">
                  <Coffee className="w-3 h-3" />
                  {isZh ? "请作者喝咖啡" : "Buy me a coffee"}
                </span>
              </div>
              <p className="text-xs text-theme-secondary mt-0.5">
                {t.sponsor?.subtitle ||
                  (isZh
                    ? "如果 Nexus 对你的工作或日常开发有所帮助，欢迎赞助支持！"
                    : "If Nexus helps your workflow, consider supporting the development!")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-theme-muted hover:text-theme-primary hover:bg-theme-card-muted transition"
            aria-label={t.common?.close || "Close"}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="px-6 pt-4 pb-2 flex items-center justify-between border-b border-theme-subtle/50 text-xs">
          <div className="flex items-center gap-1 bg-theme-card-muted p-1 rounded-lg border border-theme-subtle">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1 rounded-md font-medium transition ${
                activeTab === "all"
                  ? "bg-theme-card text-theme-primary shadow-xs"
                  : "text-theme-secondary hover:text-theme-primary"
              }`}
            >
              {isZh ? "全部渠道" : "All Methods"}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("wechat")}
              className={`px-3 py-1 rounded-md font-medium transition ${
                activeTab === "wechat"
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold shadow-xs"
                  : "text-theme-secondary hover:text-theme-primary"
              }`}
            >
              {isZh ? "微信支付" : "WeChat Pay"}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("alipay")}
              className={`px-3 py-1 rounded-md font-medium transition ${
                activeTab === "alipay"
                  ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 font-semibold shadow-xs"
                  : "text-theme-secondary hover:text-theme-primary"
              }`}
            >
              {isZh ? "支付宝" : "Alipay"}
            </button>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-theme-muted">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>{isZh ? "支持手机扫一扫" : "Scan with mobile app"}</span>
          </div>
        </div>

        {/* Content: QR Code Cards */}
        <div className="p-6 overflow-y-auto space-y-4">
          <div
            className={`grid gap-4 ${
              activeTab === "all" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 max-w-sm mx-auto"
            }`}
          >
            {/* WeChat Pay Card */}
            {(activeTab === "all" || activeTab === "wechat") && (
              <div className="bg-theme-card-muted/60 border border-emerald-500/30 rounded-xl p-4 flex flex-col items-center text-center shadow-xs hover:border-emerald-500/50 transition">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold text-xs mb-3">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>{t.sponsor?.wechatPay || "微信支付 (WeChat Pay)"}</span>
                </div>
                <div className="w-56 h-56 bg-white p-2 rounded-lg border border-theme-subtle flex items-center justify-center overflow-hidden shadow-sm">
                  <img
                    src={wechatPayImg}
                    alt="WeChat Pay QR Code"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = "/sponsor/wechat-pay.jpg";
                    }}
                  />
                </div>
                <p className="text-[11px] text-theme-secondary mt-3 font-medium">
                  {t.sponsor?.wechatPayDesc || (isZh ? "使用微信扫码赞助" : "Scan with WeChat to donate")}
                </p>
              </div>
            )}

            {/* Alipay Card */}
            {(activeTab === "all" || activeTab === "alipay") && (
              <div className="bg-theme-card-muted/60 border border-sky-500/30 rounded-xl p-4 flex flex-col items-center text-center shadow-xs hover:border-sky-500/50 transition">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold text-xs mb-3">
                  <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                  <span>{t.sponsor?.alipay || "支付宝 (Alipay)"}</span>
                </div>
                <div className="w-56 h-56 bg-white p-2 rounded-lg border border-theme-subtle flex items-center justify-center overflow-hidden shadow-sm">
                  <img
                    src={alipayImg}
                    alt="Alipay QR Code"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = "/sponsor/alipay.jpg";
                    }}
                  />
                </div>
                <p className="text-[11px] text-theme-secondary mt-3 font-medium">
                  {t.sponsor?.alipayDesc || (isZh ? "使用支付宝扫码赞助" : "Scan with Alipay to donate")}
                </p>
              </div>
            )}
          </div>

          {/* Sincere thanks card */}
          <div className="p-3.5 rounded-xl bg-theme-card-muted border border-theme-subtle text-center text-xs space-y-1">
            <div className="font-semibold text-theme-primary flex items-center justify-center gap-1.5">
              <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
              <span>{t.sponsor?.thankYou || (isZh ? "感谢支持开源" : "Thank you for supporting open source!")}</span>
            </div>
            <p className="text-[11px] text-theme-muted leading-relaxed">
              {t.sponsor?.thankYouDesc ||
                (isZh
                  ? "你的每一份认可与支持，都是维持 Nexus 长期维护与持续迭代的重要动力。"
                  : "Every bit of support helps sustain maintenance, active improvements, and feature updates.")}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-theme-card-muted border-t border-theme-subtle flex items-center justify-between text-xs">
          <div className="text-[11px] text-theme-muted">
            {isZh ? "Nexus 开源项目 · 自由软件" : "Nexus Open Source Project · Free Software"}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg font-medium text-xs bg-theme-card hover:bg-theme-card-hover text-theme-primary border border-theme-subtle transition shadow-2xs"
          >
            {t.sponsor?.close || (isZh ? "关闭" : "Close")}
          </button>
        </div>
      </div>
    </div>
  );
};
