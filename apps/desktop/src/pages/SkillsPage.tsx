import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Sparkles,
  Search,
  RotateCw,
  AlertTriangle,
  FolderPlus,
  Trash2,
  Loader2,
  X,
  Layers,
  ChevronRight,
  Terminal,
  FolderOpen,
  Plus,
  BookOpen,
} from "lucide-react";
import type {
  SkillMetadata,
  UserExperienceMode,
  ExternalSkillSourceConfig,
} from "../types.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { bridge } from "../api/bridge.js";
import { openExternalUrl } from "../api/browser-helper.js";

interface SkillsPageProps {
  uxMode: UserExperienceMode;
  projectId?: string;
  projectRoot?: string;
}

// Bulletproof stringifier: guarantees React Error #31 NEVER happens on any dynamic property
const toText = (val: any, fallback = "", lang = "zh-CN"): string => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (typeof val === "object") {
    const localized =
      val[lang] ||
      val["zh-CN"] ||
      val["en-US"] ||
      val["ja-JP"] ||
      val["de-DE"] ||
      val["zh"] ||
      val["en"];
    if (typeof localized === "string") return localized;
    if (localized && typeof localized !== "object") return String(localized);
    try {
      return Object.entries(val)
        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
        .join(", ");
    } catch {
      return fallback;
    }
  }
  return String(val);
};

// Safe formatting helper to guarantee React never throws Error #31
const safeFormatItem = (item: any): string => {
  if (!item) return "";
  if (typeof item === "string") return item;
  if (typeof item === "object") {
    try {
      return Object.entries(item)
        .map(([k, v]) => {
          if (typeof v === "string") return `${k}: ${v}`;
          if (Array.isArray(v)) {
            return `${k}: [${v.map((sub) => (typeof sub === "object" ? JSON.stringify(sub) : String(sub))).join(", ")}]`;
          }
          return `${k}: ${JSON.stringify(v)}`;
        })
        .join(", ");
    } catch {
      return String(item);
    }
  }
  return String(item);
};

export const SkillsPage: React.FC<SkillsPageProps> = ({
  uxMode: _uxMode,
  projectId,
  projectRoot: _projectRoot,
}) => {
  const { language, tText } = useTranslation();
  const isZh = language.startsWith("zh");

  // Skills state
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search & Navigation Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all"); // "all", "warn", or source id

  // External Sources State
  const [externalSources, setExternalSources] = useState<ExternalSkillSourceConfig[]>([]);
  const [isSourcesDrawerOpen, setIsSourcesDrawerOpen] = useState(false);
  const [customPathInput, setCustomPathInput] = useState("");
  const [isMounting, setIsMounting] = useState(false);

  // Selected Detail Skill Drawer
  const [selectedSkill, setSelectedSkill] = useState<SkillMetadata | null>(null);

  // Toast
  const [toastMessage, setToastMessage] = useState<{
    title: string;
    description?: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (
    title: string,
    description?: string,
    type: "success" | "error" = "success"
  ) => {
    setToastMessage({ title, description, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. Load External Sources
  const loadExternalSources = useCallback(async () => {
    try {
      const res = await bridge.getExternalSkillSources();
      setExternalSources(res.sources || []);
    } catch {}
  }, []);

  // 2. Load Skills
  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await bridge.listSkills({ projectId });
      setSkills(res.skills || []);
    } catch (err: any) {
      setError(err?.message || (isZh ? "获取技能失败" : "Failed to load skills"));
    } finally {
      setLoading(false);
    }
  }, [projectId, isZh]);

  useEffect(() => {
    loadSkills();
    loadExternalSources();
  }, [loadSkills, loadExternalSources]);

  // Handle Full Reload / Rescan
  const handleRescan = async () => {
    setReloading(true);
    try {
      const res = await bridge.reloadSkills();
      setSkills(res.skills || []);
      await loadExternalSources();
      showToast(isZh ? "已重新扫描已挂载的技能目录" : "Rescanned all mounted skill directories");
    } catch (err: any) {
      showToast(isZh ? "重新扫描失败" : "Rescan failed", err?.message, "error");
    } finally {
      setReloading(false);
    }
  };

  // Toggle Single Skill
  const handleToggleSkill = async (skill: SkillMetadata, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const nextState = !skill.enabled;
      await bridge.toggleSkill(skill.id, nextState);
      setSkills((prev) =>
        prev.map((s) => (s.id === skill.id ? { ...s, enabled: nextState } : s))
      );
      if (selectedSkill?.id === skill.id) {
        setSelectedSkill({ ...selectedSkill, enabled: nextState });
      }
    } catch (err: any) {
      showToast(isZh ? "切换状态失败" : "Failed to toggle skill", err?.message, "error");
    }
  };

  // Toggle Source
  const handleToggleSource = async (id: string, enabled: boolean) => {
    try {
      const res = await bridge.toggleExternalSkillSource(id, enabled);
      setExternalSources(res.sources || []);
      await loadSkills();
      showToast(isZh ? "已更新来源状态" : "Updated source status");
    } catch (err: any) {
      showToast(isZh ? "更新来源失败" : "Failed to update source", err?.message, "error");
    }
  };

  // Mount Custom External Directory
  const handleMountCustomPath = async (pathToMount?: string) => {
    const targetPath = (pathToMount || customPathInput).trim();
    if (!targetPath) return;
    setIsMounting(true);
    try {
      const res = await bridge.addExternalSkillSource(targetPath);
      setExternalSources(res.sources || []);
      if (!pathToMount) setCustomPathInput("");
      await loadSkills();
      showToast(
        isZh
          ? "已成功挂载外部技能目录 (零拷贝直读)"
          : "Successfully mounted skill directory (Zero-Copy)"
      );
    } catch (err: any) {
      showToast(isZh ? "挂载失败" : "Failed to mount directory", err?.message, "error");
    } finally {
      setIsMounting(false);
    }
  };

  // Remove / Delete External Source
  const handleRemoveSource = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await bridge.removeExternalSkillSource(id);
      setExternalSources(res.sources || []);
      await loadSkills();
      showToast(isZh ? "已成功移除该挂载目录" : "Successfully removed mounted directory");
    } catch (err: any) {
      showToast(isZh ? "移除失败" : "Failed to remove source", err?.message, "error");
    }
  };

  // Delete Individual User/Project Skill
  const handleDeleteSkill = async (skill: SkillMetadata, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await bridge.deleteSkill(
        skill.id,
        skill.source === "project" ? "project" : "user",
        skill.projectId,
        _projectRoot
      );
      if (!res.success) {
        showToast(
          tText("无法单独删除", "Cannot delete individually", "個別削除できません", "Einzeln nicht löschbar"),
          tText(
            "外部挂载目录的技能请在右上角「挂载管理 (Sources)」中卸载对应目录。",
            "Mounted external skills cannot be deleted individually. Unmount the folder in Sources Management (top-right).",
            "外部マウントディレクトリのスキルは個別削除できません。右上の「ソース管理」からマウント解除してください。",
            "Skills aus gemounteten Verzeichnissen können nicht einzeln gelöscht werden. Bitte unter Quellenverwaltung (oben rechts) aushängen."
          ),
          "error"
        );
        return;
      }
      if (selectedSkill?.id === skill.id) setSelectedSkill(null);
      await loadSkills();
      showToast(tText("已删除技能", "Skill deleted", "スキルを削除しました", "Skill gelöscht"));
    } catch (_err: any) {
      showToast(
        tText("无法单独删除", "Cannot delete individually", "個別削除できません", "Einzeln nicht löschbar"),
        tText(
          "若该技能来自外部挂载目录，请在右上角「挂载管理 (Sources)」中卸载对应目录。",
          "If this skill is from a mounted directory, unmount its folder in Sources Management (top-right).",
          "外部マウントディレクトリ由来の場合は、右上の「ソース管理」からマウント解除してください。",
          "Falls dieser Skill aus einem gemounteten Ordner stammt, hängen Sie ihn in der Quellenverwaltung (oben rechts) aus."
        ),
        "error"
      );
    }
  };

  // Filter skills based on Active Nav Filter and Search
  const filteredSkills = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return skills
      .filter((s) => {
        if (s.id.includes("copilot") || (s.name && JSON.stringify(s.name).toLowerCase().includes("copilot"))) {
          return false;
        }

        // 1. Nav Filter
        if (activeFilter === "warn") {
          if (s.isAvailable !== false && !s.readError) return false;
        } else if (activeFilter === "builtin") {
          if (s.source !== "builtin" && s.originAgent !== "gb") return false;
        } else if (activeFilter !== "all") {
          // Match specific external source by ID or path
          const matchingSource = externalSources.find((src) => src.id === activeFilter);
          if (matchingSource) {
            const normSource = matchingSource.path.toLowerCase().replace(/\\/g, "/").replace(/\/+$/, "");
            const normSkill = (s.sourcePath || "").toLowerCase().replace(/\\/g, "/");
            if (
              !normSkill.startsWith(normSource) &&
              !normSkill.includes(normSource) &&
              s.originAgent !== matchingSource.id
            ) {
              return false;
            }
          } else if (s.originAgent !== activeFilter && s.source !== activeFilter) {
            return false;
          }
        }

        // 2. Search query
        if (q) {
          const nameStr = (
            typeof s.name === "string" ? s.name : `${s.name?.["en-US"]} ${s.name?.["zh-CN"]}`
          ).toLowerCase();
          const descStr = (
            typeof s.description === "string"
              ? s.description
              : `${s.description?.["en-US"]} ${s.description?.["zh-CN"]}`
          ).toLowerCase();
          const trigStr = (s.triggers || []).map(safeFormatItem).join(" ").toLowerCase();
          const toolStr = (s.tools || []).map(safeFormatItem).join(" ").toLowerCase();
          const match =
            nameStr.includes(q) ||
            descStr.includes(q) ||
            trigStr.includes(q) ||
            toolStr.includes(q) ||
            s.id.toLowerCase().includes(q);
          if (!match) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (a.id === "nexus.meta-orchestrator") return -1;
        if (b.id === "nexus.meta-orchestrator") return 1;
        return 0;
      });
  }, [skills, activeFilter, searchQuery, externalSources]);

  // Dynamic Navigation counts
  const navCounts = useMemo(() => {
    const visibleAll = skills.filter(
      (s) => !s.id.includes("copilot") && !(s.name && JSON.stringify(s.name).toLowerCase().includes("copilot"))
    );
    const counts: Record<string, number> = {
      all: visibleAll.length,
      warn: visibleAll.filter((s) => s.isAvailable === false || Boolean(s.readError)).length,
    };
    for (const src of externalSources) {
      const normSource = src.path.toLowerCase().replace(/\\/g, "/").replace(/\/+$/, "");
      counts[src.id] = skills.filter((s) => {
        if (s.originAgent === src.id) return true;
        if (!s.sourcePath) return false;
        const normSkill = s.sourcePath.toLowerCase().replace(/\\/g, "/");
        return normSkill.startsWith(normSource) || normSkill.includes(normSource);
      }).length;
    }
    return counts;
  }, [skills, externalSources]);

  const enabledSourcesCount = externalSources.filter((s) => s.enabled).length;

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-theme-base text-theme-primary font-sans select-none overflow-hidden">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-[80] max-w-sm p-3.5 rounded-xl  bg-theme-card border border-theme-subtle text-xs flex items-start gap-2.5 animate-in slide-in-from-top-2 duration-200">
          <Sparkles className="w-4 h-4 text-theme-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-theme-primary">
              {toastMessage.title}
            </div>
            {toastMessage.description && (
              <div className="text-theme-secondary mt-0.5 text-[11px] truncate">
                {toastMessage.description}
              </div>
            )}
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-theme-muted hover:text-theme-primary"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Header Bar */}
      <header className="flex items-center gap-3 px-6 py-3.5 border-b border-theme-subtle bg-theme-base/60 shrink-0">
        <div className="flex items-center gap-2 mr-2">
          <Sparkles className="w-5 h-5 text-theme-primary" />
          <h1 className="text-base font-bold tracking-tight text-theme-primary">
            {tText("技能中心", "Skills Hub", "スキルハブ", "Skill-Zentrum")}
          </h1>
        </div>

        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tText(
              "搜索技能名称、触发词或依赖工具...",
              "Search by skill name, trigger keywords, or tools...",
              "スキル名、トリガー、ツールを検索...",
              "Nach Skill-Name, Triggern oder Tools suchen..."
            )}
            className="w-full pl-9 pr-3 py-1.5 bg-theme-card border border-theme-subtle rounded-lg text-xs text-theme-primary placeholder-theme-muted focus:outline-none border-theme-subtle"
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Skill Blog Tutorial Button */}
          <button
            type="button"
            onClick={() => {
              openExternalUrl("https://blog.ycu.de5.net/2026/11/25/skill-%E6%95%99%E7%A8%8B/").catch(() => {
                window.open("https://blog.ycu.de5.net/2026/11/25/skill-%E6%95%99%E7%A8%8B/", "_blank");
              });
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--btn-primary-bg)]/10 hover:bg-[var(--btn-primary-bg)]/20 text-theme-primary border border-theme-subtle rounded-lg text-xs font-semibold transition cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>{tText("Skill 教程", "Skill Guide", "Skill ガイド", "Skill-Anleitung")}</span>
          </button>

          {/* Open Sources Drawer Button */}
          <button
            type="button"
            onClick={() => setIsSourcesDrawerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-theme-card hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle rounded-lg text-xs font-semibold transition cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-theme-primary" />
            <span>
              {tText(
                `挂载管理 ${enabledSourcesCount}/${externalSources.length}`,
                `Sources ${enabledSourcesCount}/${externalSources.length}`,
                `ソース管理 ${enabledSourcesCount}/${externalSources.length}`,
                `Quellen ${enabledSourcesCount}/${externalSources.length}`
              )}
            </span>
          </button>

          {/* Rescan Button */}
          <button
            type="button"
            onClick={handleRescan}
            disabled={reloading || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-theme-card hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle rounded-lg text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
          >
            <RotateCw className={`w-3.5 h-3.5 ${reloading ? "animate-spin" : ""}`} />
            <span>{tText("重新扫描", "Rescan", "再スキャン", "Neu scannen")}</span>
          </button>

          {/* Mount Directory Button */}
          <button
            type="button"
            onClick={() => setIsSourcesDrawerOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[var(--btn-primary-bg)] hover:opacity-90 text-[var(--btn-primary-text)] rounded-lg text-xs font-semibold  transition cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>{tText("挂载技能目录", "Mount Directory", "ディレクトリをマウント", "Verzeichnis mounten")}</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Nav Filter Sidebar */}
        <nav className="w-56 border-r border-[var(--border-default)] bg-[var(--bg-app)] p-3 space-y-4 shrink-0 overflow-y-auto">
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition cursor-pointer ${
                activeFilter === "all"
                  ? "bg-[var(--bg-selected)] text-theme-primary font-semibold border-l-2 border-[var(--text-primary)]"
                  : "text-theme-secondary hover:bg-[var(--bg-hover)] hover:text-theme-primary"
              }`}
            >
              <span>{tText("全部技能", "All Skills", "すべてのスキル", "Alle Skills")}</span>
              <span className="font-mono text-[11px] opacity-80">{navCounts.all}</span>
            </button>
          </div>

          {/* User Mounted Sources Section */}
          {externalSources.length > 0 && (
            <div className="space-y-1">
              <h4 className="px-3 text-[11px] font-semibold text-theme-muted uppercase tracking-wider">
                {tText("已挂载目录来源", "Mounted Sources", "マウントされたソース", "Gemountete Quellen")}
              </h4>

              {externalSources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => setActiveFilter(source.id)}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                    activeFilter === source.id
                      ? "bg-[var(--bg-selected)] text-theme-primary font-semibold border-l-2 border-[var(--text-primary)]"
                      : "text-theme-secondary hover:bg-[var(--bg-hover)] hover:text-theme-primary"
                  }`}
                >
                  <span className="truncate pr-1">{source.name}</span>
                  <span className="font-mono text-[11px] opacity-80 shrink-0">
                    {navCounts[source.id] || 0}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Needs Attention Section (Only when errors exist) */}
          {navCounts.warn > 0 && (
            <div className="space-y-1">
              <h4 className="px-3 text-[11px] font-semibold text-theme-muted uppercase tracking-wider">
                {tText("需要处理", "Needs Attention", "対応が必要", "Erfordert Aufmerksamkeit")}
              </h4>
              <button
                type="button"
                onClick={() => setActiveFilter("warn")}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                  activeFilter === "warn"
                    ? "bg-[var(--bg-selected)] text-[var(--warning)] font-semibold border-l-2 border-[var(--text-primary)]"
                    : "text-theme-secondary hover:bg-[var(--bg-hover)] hover:text-theme-primary"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-[var(--warning)]" />
                  <span>{tText("读取异常 / 损坏", "Read Errors", "読み込みエラー", "Lesefehler")}</span>
                </div>
                <span className="font-mono text-[11px] opacity-75">{navCounts.warn}</span>
              </button>
            </div>
          )}
        </nav>

        {/* Center Main Content Area */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto p-5 space-y-4">
          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-lg bg-[var(--btn-primary-bg)]/10 border border-theme-subtle text-[var(--warning)] text-xs flex items-center justify-between">
              <span>{toText(error)}</span>
              <button
                onClick={() => setError(null)}
                className="text-xs text-[var(--warning)] hover:underline cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Loading State */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-theme-muted space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-theme-primary" />
              <div className="text-xs">{tText("正在加载技能列表...", "Loading skills...", "スキルを読み込み中...", "Skills werden geladen...")}</div>
            </div>
          ) : filteredSkills.length === 0 ? (
            /* Clean Empty State without promotion or spam */
            <div className="flex-1 flex flex-col items-center justify-center p-10 max-w-lg mx-auto my-auto text-center border border-dashed border-theme-subtle rounded-2xl bg-theme-card/40 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--btn-primary-bg)]/10 border border-theme-subtle flex items-center justify-center text-theme-primary ">
                <FolderOpen className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-theme-primary">
                  {tText("暂未挂载任何技能目录", "No Skill Directories Mounted", "スキルディレクトリがマウントされていません", "Keine Skill-Verzeichnisse gemountet")}
                </h3>
                <p className="text-xs text-theme-secondary leading-relaxed">
                  {tText(
                    "Nexus 技能中心采用轻量挂载架构，支持按需读取本地技能目录（包含 SKILL.md 规范），随挂随用。",
                    "Nexus Skills Hub adopts a lightweight architecture, supporting on-demand local skill directories with standard SKILL.md specs.",
                    "Nexusスキルハブは軽量なマウント構造を採用し、ローカルのSKILL.mdディレクトリを即時読み込みます。",
                    "Nexus Skills Hub unterstützt das Mounten lokaler Skill-Verzeichnisse mit SKILL.md-Spezifikationen."
                  )}
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setIsSourcesDrawerOpen(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[var(--btn-primary-bg)] hover:opacity-90 text-[var(--btn-primary-text)] rounded-xl text-xs font-semibold  transition cursor-pointer"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>{tText("挂载本地技能目录", "Mount Skill Directory", "ディレクトリをマウント", "Skill-Verzeichnis mounten")}</span>
                </button>
              </div>
            </div>
          ) : (
            /* Skills List */
            <div className="border border-theme-subtle rounded-xl divide-y divide-theme-subtle overflow-hidden bg-theme-card">
              {filteredSkills.map((skill) => {
                const displayName = toText(
                  typeof skill.name === "string"
                    ? skill.name
                    : skill.name?.[language] ||
                      skill.name?.["en-US"] ||
                      skill.name?.["zh-CN"] ||
                      skill.id,
                  skill.id,
                  language
                );
                const desc = toText(
                  typeof skill.description === "string"
                    ? skill.description
                    : skill.description?.[language] ||
                      skill.description?.["en-US"] ||
                      skill.description?.["zh-CN"] ||
                      skill.summary ||
                      "",
                  "",
                  language
                );

                const hasReadError = skill.isAvailable === false || Boolean(skill.readError);
                const isManualOnly = (skill.triggers || []).length === 0;

                return (
                  <div
                    key={skill.id}
                    onClick={() => setSelectedSkill(skill)}
                    className="flex items-center gap-3.5 px-4 py-3 cursor-pointer transition hover:bg-theme-card-hover"
                  >
                    {/* Toggle Switch */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={skill.enabled}
                      onClick={(e) => handleToggleSkill(skill, e)}
                      title={skill.enabled ? tText("已启用", "Enabled", "有効", "Aktiviert") : tText("已禁用", "Disabled", "無効", "Deaktiviert")}
                      className={`relative inline-flex items-center h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out border-2 border-transparent focus:outline-none ${
                        skill.enabled
                          ? "bg-[#10B981] hover:bg-[#059669]"
                          : "bg-neutral-300 dark:bg-neutral-700 hover:bg-neutral-400 dark:hover:bg-neutral-600"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          skill.enabled ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>

                    {/* Skill Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-theme-primary truncate">
                          {displayName}
                        </span>
                        {skill.id === "nexus.meta-orchestrator" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--btn-primary-bg)]/15 text-[var(--warning)] border border-theme-subtle shrink-0 ">
                            <Sparkles className="w-3 h-3 text-[var(--warning)]" />
                            {tText("元工具调度中枢", "Meta-Orchestrator", "メタオーケストレーター", "Meta-Orchestrator")}
                          </span>
                        )}
                        <span className="font-mono text-[11px] text-theme-muted truncate">
                          {skill.id}
                        </span>
                      </div>
                      <div className="text-[11px] text-theme-secondary truncate mt-0.5">
                        {desc}
                      </div>
                    </div>

                    {/* Right Flags & Risk Dot */}
                    <div className="flex items-center gap-2 shrink-0">
                      {hasReadError && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-theme-subtle bg-[var(--btn-primary-bg)]/10 text-[var(--warning)] font-medium">
                          {tText("读取异常", "Read Error", "読み込みエラー", "Lesefehler")}
                        </span>
                      )}

                      {isManualOnly && !hasReadError && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-theme-subtle bg-[var(--btn-primary-bg)]/10 text-[var(--warning)] font-medium">
                          {tText("仅手动", "Manual Only", "手動のみ", "Nur manuell")}
                        </span>
                      )}

                      {/* Risk Dot */}
                      <span
                        title={
                          skill.risk === "high"
                            ? tText("高风险：需要人工核准", "High Risk: Approval Required", "高リスク: 承認が必要", "Hohes Risiko: Genehmigung erforderlich")
                            : skill.risk === "medium"
                            ? tText("中风险", "Medium Risk", "中リスク", "Mittleres Risiko")
                            : tText("安全运行", "Safe / Low Risk", "安全", "Sicher / Geringes Risiko")
                        }
                        className={`w-2 h-2 rounded-full ${
                          skill.risk === "high"
                            ? "bg-[var(--btn-primary-bg)]"
                            : skill.risk === "medium"
                            ? "bg-[var(--btn-primary-bg)]"
                            : "bg-[var(--btn-primary-bg)]"
                        }`}
                      />

                      {skill.source !== "builtin" && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteSkill(skill, e)}
                          title={tText("删除技能", "Delete Skill", "スキルを削除", "Skill löschen")}
                          className="p-1 rounded-md text-theme-muted hover:text-[var(--warning)] hover:bg-[var(--btn-primary-bg)]/10 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <ChevronRight className="w-3.5 h-3.5 text-theme-muted" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* --- Right Slide-Over Detail Drawer --- */}
      {selectedSkill && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-end bg-[var(--bg-modal-overlay)] backdrop-blur-md cursor-pointer"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedSkill(null);
          }}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md h-full bg-theme-card border-l border-theme-subtle  p-6 overflow-y-auto space-y-5 animate-in slide-in-from-right duration-200 cursor-default"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-bold text-theme-primary">
                  {toText(
                    typeof selectedSkill.name === "string"
                      ? selectedSkill.name
                      : selectedSkill.name?.[language] || selectedSkill.name?.["en-US"] || selectedSkill.id,
                    selectedSkill.id,
                    language
                  )}
                </h2>
                <div className="font-mono text-xs text-theme-muted mt-0.5">
                  {toText(selectedSkill.id)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSkill(null)}
                className="p-1 rounded-lg hover:bg-theme-card-hover text-theme-muted hover:text-theme-primary cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Read Error Callout */}
            {selectedSkill.readError && (
              <div className="p-3 rounded-lg bg-[var(--btn-primary-bg)]/10 border border-theme-subtle text-[var(--warning)] text-xs space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-[var(--warning)]" />
                  <span>{tText("读取异常说明", "Read Error", "読み込みエラーの説明", "Erklärung zum Lesefehler")}</span>
                </div>
                <div className="font-mono text-[11px] leading-relaxed">
                  {toText(selectedSkill.readError)}
                </div>
              </div>
            )}

            {/* Description */}
            <div className="space-y-1 text-xs text-theme-secondary leading-relaxed">
              <div className="text-[11px] font-semibold uppercase text-theme-muted tracking-wider">
                {tText("技能描述", "Description", "スキルの説明", "Skill-Beschreibung")}
              </div>
              <div>
                {toText(
                  typeof selectedSkill.description === "string"
                    ? selectedSkill.description
                    : selectedSkill.description?.[language] ||
                      selectedSkill.description?.["en-US"] ||
                      selectedSkill.summary ||
                      tText("暂无描述", "No description provided.", "説明はありません。", "Keine Beschreibung verfügbar."),
                  tText("暂无描述", "No description provided.", "説明はありません。", "Keine Beschreibung verfügbar."),
                  language
                )}
              </div>
            </div>

            {/* Meta Tags */}
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2 py-0.5 rounded-full bg-theme-base text-theme-secondary border border-theme-subtle">
                {selectedSkill.source === "external" ? tText("外部挂载", "Mounted", "マウント済み", "Gemountet") : tText("内置", "Built-in", "内蔵", "Integriert")}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full border ${
                  selectedSkill.risk === "high"
                    ? "bg-[var(--btn-primary-bg)]/10 text-[var(--warning)] border-theme-subtle"
                    : selectedSkill.risk === "medium"
                    ? "bg-[var(--btn-primary-bg)]/10 text-[var(--warning)] border-theme-subtle"
                    : "bg-[var(--btn-primary-bg)]/10 text-theme-primary border-theme-subtle"
                }`}
              >
                {selectedSkill.risk === "high"
                  ? tText("高风险", "High Risk", "高リスク", "Hohes Risiko")
                  : selectedSkill.risk === "medium"
                  ? tText("中风险", "Medium Risk", "中リスク", "Mittleres Risiko")
                  : tText("安全 (Safe)", "Safe / Low", "安全", "Sicher / Gering")}
              </span>
            </div>

            {/* Trigger Keywords */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase text-theme-muted tracking-wider">
                {tText("触发词 (Triggers)", "Triggers", "トリガー (Triggers)", "Trigger (Auslöser)")}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {(selectedSkill.triggers || []).length > 0 ? (
                  selectedSkill.triggers.map((t, idx) => (
                    <span
                      key={idx}
                      className="text-xs px-2 py-1 rounded bg-theme-base text-theme-secondary border border-theme-subtle"
                    >
                      {safeFormatItem(t)}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-theme-muted">
                    {tText("无指定触发词", "None specified", "指定されたトリガーはありません", "Keine Trigger angegeben")}
                  </span>
                )}
              </div>
            </div>

            {/* Workflow Steps */}
            {(selectedSkill.workflow || []).length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase text-theme-muted tracking-wider">
                  {tText("工作流步骤 (Workflow)", "Workflow Steps", "ワークフローステップ", "Workflow-Schritte")}
                </h3>
                <ol className="list-decimal pl-4 space-y-1.5 text-xs text-theme-secondary/90">
                  {selectedSkill.workflow.map((step, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {safeFormatItem(step)}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Needed Tools */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase text-theme-muted tracking-wider">
                {tText("依赖的工具 (Required Tools)", "Required Tools", "必要なツール", "Erforderliche Tools")}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {(selectedSkill.tools || []).length > 0 ? (
                  selectedSkill.tools.map((tool, idx) => (
                    <span
                      key={idx}
                      className="text-xs font-mono px-2 py-1 rounded bg-[var(--btn-primary-bg)]/10 text-theme-primary border border-theme-subtle flex items-center gap-1"
                    >
                      <Terminal className="w-3 h-3 text-theme-primary" />
                      <span>{safeFormatItem(tool)}</span>
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-theme-muted">
                    {tText("未声明工具", "No specific tools required", "必要なツールは宣言されていません", "Keine speziellen Tools erforderlich")}
                  </span>
                )}
              </div>
            </div>

            {/* Physical Source Path */}
            <div className="space-y-1 pt-2 border-t border-theme-subtle">
              <div className="text-[11px] font-semibold text-theme-muted">
                {tText("物理路径", "Filesystem Path", "ファイルパス", "Dateisystempfad")}
              </div>
              <div className="text-[11px] font-mono text-theme-secondary break-all bg-theme-base/60 p-2 rounded border border-theme-subtle">
                {toText(selectedSkill.sourcePath, "N/A")}
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* --- Sources Management Drawer --- */}
      {isSourcesDrawerOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-end bg-[var(--bg-modal-overlay)] backdrop-blur-md cursor-pointer"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsSourcesDrawerOpen(false);
          }}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md h-full bg-theme-card border-l border-theme-subtle  p-6 overflow-y-auto space-y-5 animate-in slide-in-from-right duration-200 cursor-default"
          >
            <div className="flex items-center justify-between border-b border-theme-subtle pb-4">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-theme-primary" />
                <h2 className="text-sm font-bold text-theme-primary">
                  {tText("挂载管理", "Sources Management", "ソース管理", "Quellenverwaltung")}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsSourcesDrawerOpen(false)}
                className="p-1 rounded-lg hover:bg-theme-card-hover text-theme-muted hover:text-theme-primary cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-theme-secondary leading-relaxed">
              {tText(
                "挂载的目录只读取，不复制。随时可以通过垃圾桶图标解除挂载。",
                "Mounted skill directories are read with zero file duplication. You can unmount anytime.",
                "マウントされたディレクトリは読み取り専用です。いつでも解除できます。",
                "Gemountete Verzeichnisse sind schreibgeschützt. Sie können jederzeit entfernt werden."
              )}
            </p>

            {/* Mount Input Form */}
            <div className="p-3.5 rounded-xl border border-theme-subtle bg-theme-base/60 space-y-2">
              <h3 className="text-xs font-semibold text-theme-primary">
                {tText("挂载本地外部目录", "Mount Local Skill Directory", "ローカル外部ディレクトリをマウント", "Lokales Skill-Verzeichnis mounten")}
              </h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customPathInput}
                  onChange={(e) => setCustomPathInput(e.target.value)}
                  placeholder={tText(
                    "输入目录绝对路径，如 D:/my-skills",
                    "e.g.: D:/my-skills or /path/to/skills",
                    "絶対パスを入力 (例: D:/my-skills)",
                    "Absoluten Pfad eingeben, z. B. D:/my-skills"
                  )}
                  className="flex-1 px-3 py-1.5 bg-theme-base border border-theme-subtle rounded-lg text-xs font-mono text-theme-primary placeholder-theme-muted focus:outline-none border-theme-subtle"
                />
                <button
                  type="button"
                  onClick={() => handleMountCustomPath()}
                  disabled={isMounting || !customPathInput.trim()}
                  className="px-3 py-1.5 bg-[var(--btn-primary-bg)] hover:opacity-90 text-[var(--btn-primary-text)] rounded-lg text-xs font-semibold  transition disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                >
                  {isMounting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>{tText("添加", "Add", "追加", "Hinzufügen")}</span>
                </button>
              </div>
            </div>

            {/* Sources List */}
            <div className="space-y-2 pt-1">
              <h4 className="text-[11px] font-semibold text-theme-muted uppercase tracking-wider">
                {tText("当前已挂载目录清单", "Currently Mounted Sources", "現在マウントされているソース", "Aktuell gemountete Quellen")}
              </h4>
              {externalSources.length === 0 ? (
                <div className="p-6 text-center rounded-xl border border-dashed border-theme-subtle bg-theme-base/30 text-xs text-theme-muted">
                  {tText("当前未挂载任何外部目录", "No external directories mounted yet", "現在外部ディレクトリはマウントされていません", "Noch keine externen Verzeichnisse gemountet")}
                </div>
              ) : (
                externalSources.map((src) => (
                  <div
                    key={src.id}
                    className="p-3 rounded-xl border border-theme-subtle bg-theme-base/60 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-theme-primary truncate pr-2">
                        {toText(src.name)}
                      </span>

                      <div className="flex items-center gap-2">
                        {/* Delete button */}
                        <button
                          type="button"
                          onClick={(e) => handleRemoveSource(src.id, e)}
                          title={tText("删除/解绑此路径", "Delete / Unmount this path", "このパスを削除/マウント解除", "Diesen Pfad löschen / unmounten")}
                          className="p-1 rounded hover:bg-[var(--btn-primary-bg)]/20 text-[var(--warning)] transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Toggle Switch */}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={src.enabled}
                          onClick={() => handleToggleSource(src.id, !src.enabled)}
                          title={src.enabled ? tText("已启用", "Enabled", "有効", "Aktiviert") : tText("已禁用", "Disabled", "無効", "Deaktiviert")}
                          className={`relative inline-flex items-center h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out border-2 border-transparent focus:outline-none ${
                            src.enabled
                              ? "bg-[var(--btn-primary-bg)]"
                              : "bg-zinc-700 hover:bg-zinc-600"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white  ring-0 transition duration-200 ease-in-out ${
                              src.enabled ? "translate-x-4" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    <div className="font-mono text-[11px] text-theme-muted break-all">
                      {toText(src.path)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};
