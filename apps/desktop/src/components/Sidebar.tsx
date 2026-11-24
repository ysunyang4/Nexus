import React, { useState, useEffect } from "react";
import {
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  LayoutDashboard,
  FolderLock,
  Sparkles,
  Settings,
  AppWindow,
  HelpCircle,
} from "lucide-react";
import nexusLogo from "../assets/nexus.png";
import type { ServerStatus, UserExperienceMode } from "../types.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { openExternalUrl } from "../api/browser-helper.js";

export type NavPage =
  | "overview"
  | "projects"
  | "unity"
  | "desktop"
  | "files"
  | "applications"
  | "browser"
  | "execution"
  | "ledger"
  | "runtime"
  | "mcp-servers"
  | "mcp-tools"
  | "mcp-registry"
  | "skills"
  | "settings"
  // Legacy compatibility aliases
  | "jobs"
  | "approvals"
  | "tokens"
  | "connections"
  | "activity"
  | "rules"
  | "storage";

interface NavItem {
  id: NavPage;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeStatus?: string;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

interface SidebarProps {
  currentPage: NavPage;
  onSelectPage: (page: NavPage) => void;
  serverStatus: ServerStatus | null;
  runnersCount?: number;
  uxMode?: UserExperienceMode;
  onOpenAbout?: () => void;
  onOpenSponsorModal?: () => void;
  onOpenCommunityModal?: () => void;
  onOpenContactModal?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onSelectPage,
  serverStatus,
  runnersCount,
  uxMode: _uxMode = "standard",
  onOpenAbout,
  onOpenSponsorModal,
  onOpenCommunityModal: _onOpenCommunityModal,
  onOpenContactModal: _onOpenContactModal,
}) => {
  const { tText, isZh } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  const effectiveRunners =
    runnersCount !== undefined && runnersCount > 0
      ? runnersCount
      : serverStatus?.runners_connected || 0;

  const isHealthy = serverStatus !== null && effectiveRunners > 0;

  // Primary user-facing navigation groups with full 4-language support
  const primaryGroups: NavGroup[] = [
    {
      id: "workspace",
      label: tText("工作区", "WORKSPACE", "ワークスペース", "ARBEITSBEREICH"),
      items: [
        {
          id: "overview",
          label: tText("工作台概览", "Workspace Overview", "概要", "Übersicht"),
          icon: LayoutDashboard,
        },
        {
          id: "projects",
          label: tText("项目管理", "Projects", "プロジェクト管理", "Projekte"),
          icon: FolderLock,
        },
      ],
    },
    {
      id: "intelligence",
      label: tText("智能管理", "INTELLIGENCE", "インテリジェンス", "INTELLIGENZ"),
      items: [
        {
          id: "skills",
          label: tText("技能中心", "Skills Hub", "スキルハブ", "Skill-Zentrum"),
          icon: Sparkles,
        },
      ],
    },
    {
      id: "apps",
      label: tText("应用", "APPLICATIONS", "アプリケーション", "ANWENDUNGEN"),
      items: [
        {
          id: "applications",
          label: tText("MCP 插件中心", "MCP Center", "MCP センター", "MCP-Zentrum"),
          icon: AppWindow,
          badgeStatus: "CONNECTED",
        },
      ],
    },
  ];

  // Daily navigation groups strictly focused on Workspace, Intelligence & Apps.
  const navGroups: NavGroup[] = primaryGroups;

  // Accordion state: default workspace, intelligence and apps are expanded
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    workspace: true,
    intelligence: true,
    apps: true,
  });

  // Auto-expand group when user visits a child page
  useEffect(() => {
    for (const grp of navGroups) {
      if (grp.items.some((item) => item.id === currentPage)) {
        setExpandedGroups((prev) => {
          if (!prev[grp.id]) {
            return { ...prev, [grp.id]: true };
          }
          return prev;
        });
        break;
      }
    }
  }, [currentPage]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  return (
    <aside
      className={`h-screen bg-theme-sidebar border-r border-theme-subtle flex flex-col justify-between select-none shrink-0 z-20 transition-all duration-200 ${
        collapsed ? "w-[60px]" : "w-[228px]"
      }`}
    >
      {/* Top Header & Brand */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div
          className={`h-14 border-b border-theme-subtle flex items-center transition-all shrink-0 ${
            collapsed ? "px-2 justify-center" : "px-3.5 justify-between"
          }`}
        >
          {!collapsed ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src={nexusLogo}
                alt="Nexus"
                className="w-6 h-6 rounded-md shadow-sm object-cover border border-theme-subtle shrink-0"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = "/nexus.png";
                }}
              />
              <span className="font-semibold text-xs tracking-wider text-theme-primary">
                NEXUS
              </span>
              <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-sky-500/10 text-sky-500 dark:text-sky-400 border border-sky-500/20">
                1.3.4
              </span>
            </div>
          ) : (
            <img
              src={nexusLogo}
              alt="Nexus"
              className="w-6 h-6 rounded-md shadow-sm object-cover border border-theme-subtle"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "/nexus.png";
              }}
            />
          )}

          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded text-theme-muted hover:text-theme-primary hover:bg-theme-card-hover transition"
            title={
              collapsed
                ? tText("展开侧边栏", "Expand Sidebar", "サイドバーを展開", "Seitenleiste ausklappen")
                : tText("收起侧边栏", "Collapse Sidebar", "サイドバーを折りたたむ", "Seitenleiste einklappen")
            }
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Navigation Groups List */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-2">
          {navGroups.map((group) => {
            const isExpanded = expandedGroups[group.id] ?? true;

            if (collapsed) {
              return (
                <div key={group.id} className="space-y-1 py-1 border-b border-theme-subtle/40 last:border-b-0">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentPage === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectPage(item.id)}
                        title={item.label}
                        className={`w-full flex items-center justify-center p-2 rounded-lg transition ${
                          isActive
                            ? "bg-sky-500/10 text-sky-500 font-semibold shadow-xs border border-sky-500/20"
                            : "text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover/60 border border-transparent"
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              );
            }

            return (
              <div key={group.id} className="space-y-0.5">
                {/* 1st Level Group Header */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center justify-between px-2 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider text-theme-muted hover:text-theme-primary hover:bg-theme-card-hover/40 transition"
                >
                  <span className="font-semibold">{group.label}</span>
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3 text-theme-muted/70" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-theme-muted/70" />
                  )}
                </button>

                {/* 2nd Level Items */}
                {isExpanded && (
                  <div className="space-y-0.5 pl-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = currentPage === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onSelectPage(item.id)}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs transition ${
                            isActive
                              ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 font-medium border border-sky-500/20 shadow-xs"
                              : "text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover/50 border border-transparent"
                          }`}
                        >
                          <Icon
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? "text-sky-500" : "text-theme-muted"
                            }`}
                          />
                          <span className="truncate">{item.label}</span>
                          {item.badgeStatus && !collapsed && (
                            <span className="ml-auto flex items-center gap-1.5 text-[10px] font-mono">
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  item.badgeStatus === "CONNECTED"
                                    ? "bg-emerald-500"
                                    : item.badgeStatus === "UNKNOWN"
                                    ? "bg-amber-500"
                                    : item.badgeStatus === "FAILED"
                                    ? "bg-rose-500"
                                    : "bg-zinc-500"
                                }`}
                              />
                              <span
                                className={
                                  item.badgeStatus === "CONNECTED"
                                    ? "text-emerald-500"
                                    : item.badgeStatus === "UNKNOWN"
                                    ? "text-amber-500"
                                    : item.badgeStatus === "FAILED"
                                    ? "text-rose-500"
                                    : "text-zinc-500"
                                }
                              >
                                {item.badgeStatus === "CONNECTED"
                                  ? tText("已连接", "CONNECTED", "接続済み", "VERBUNDEN")
                                  : item.badgeStatus === "UNKNOWN"
                                  ? tText("未知", "UNKNOWN", "不明", "UNBEKANNT")
                                  : item.badgeStatus === "FAILED"
                                  ? tText("异常", "FAILED", "異常", "FEHLGESCHLAGEN")
                                  : tText("未连接", "DISCONNECTED", "未接続", "GETRENNT")}
                              </span>
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer: Settings, Help & Support */}
      <div className="p-2 border-t border-theme-subtle space-y-1 shrink-0 bg-theme-sidebar">
        {/* About Nexus Button */}
        {(onOpenAbout || onOpenSponsorModal) && (
          <button
            type="button"
            onClick={() => {
              if (onOpenAbout) {
                onOpenAbout();
              } else if (onOpenSponsorModal) {
                onOpenSponsorModal();
              }
            }}
            title={tText(
              "关于 Nexus",
              "About Nexus",
              "Nexus について",
              "Über Nexus"
            )}
            className={`w-full flex items-center rounded-md text-xs transition cursor-pointer ${
              collapsed ? "justify-center p-2" : "gap-2.5 px-3 py-1.5"
            } text-sky-600 dark:text-sky-400 hover:text-sky-700 hover:bg-sky-500/10 border border-transparent`}
          >
            <Sparkles className="w-3.5 h-3.5 text-sky-500 shrink-0" />
            {!collapsed && (
              <span className="font-medium">
                {tText(
                  "关于",
                  "About",
                  "概要",
                  "Über"
                )}
              </span>
            )}
          </button>
        )}

        {/* Help & Documentation */}
        <button
          type="button"
          onClick={() => {
            const docsUrl = isZh
              ? "https://github.com/ysunyang4/Nexus/blob/main/docs/README.zh-CN.md"
              : "https://github.com/ysunyang4/Nexus/tree/main/docs";
            void openExternalUrl(docsUrl);
          }}
          title={tText(
            "使用指南与排错文档",
            "Getting Started & Troubleshooting Docs",
            "詳細チュートリアルとドキュメント",
            "Ausführliche Tutorials & Dokumentation"
          )}
          className={`w-full flex items-center rounded-md text-xs transition cursor-pointer ${
            collapsed ? "justify-center p-2" : "gap-2.5 px-3 py-1.5"
          } text-sky-600 dark:text-sky-400 hover:text-sky-700 hover:bg-sky-500/10 border border-transparent`}
        >
          <HelpCircle className="w-3.5 h-3.5 text-sky-500 shrink-0" />
          {!collapsed && (
            <span className="font-medium">
              {tText(
                "帮助与文档",
                "Help & Docs",
                "ヘルプ & ドキュメント",
                "Hilfe & Doku"
              )}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onSelectPage("settings")}
          title={tText("应用设置", "Settings", "設定", "Einstellungen")}
          className={`w-full flex items-center rounded-md text-xs transition ${
            collapsed ? "justify-center p-2" : "gap-2.5 px-3 py-1.5"
          } ${
            currentPage === "settings"
              ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 font-medium border border-sky-500/20 shadow-xs"
              : "text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover/50 border border-transparent"
          }`}
        >
          <Settings
            className={`w-3.5 h-3.5 ${
              currentPage === "settings" ? "text-sky-500" : "text-theme-muted"
            }`}
          />
          {!collapsed && <span>{tText("应用设置", "Settings", "設定", "Einstellungen")}</span>}
        </button>

        {!collapsed ? (
          <div className="px-3 py-1.5 flex items-center justify-between text-[11px] font-mono text-theme-muted">
            <span className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isHealthy ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              <span>
                {isHealthy
                  ? tText("系统正常运行", "Engine Ready", "システム正常稼働中", "System bereit")
                  : tText("服务异常", "Standby", "サービス待機中", "Standby")}
              </span>
            </span>
            <span className="text-[10px]">v1.3.4</span>
          </div>
        ) : (
          <div
            className="py-1 flex justify-center"
            title={
              isHealthy
                ? tText("系统正常运行", "Engine Ready", "システム正常稼働中", "System bereit")
                : tText("服务异常", "Standby", "サービス待機中", "Standby")
            }
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isHealthy ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
          </div>
        )}
      </div>
    </aside>
  );
};
