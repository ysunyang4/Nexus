import React, { useState, useEffect } from "react";
import {
  FolderLock,
  Plus,
  Trash2,
  Shield,
  Terminal,
  AlertTriangle,
  Search,
  ChevronRight,
  Box,
  Sparkles,
} from "lucide-react";
import type { Project, UserExperienceMode } from "../types.js";
import { bridge } from "../api/bridge.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { ProjectDetailPage } from "./ProjectDetailPage.js";
import { ProjectBuilderWorkspace } from "./projects/ProjectBuilderWorkspace.js";
import { projectBuilderApi, type ProjectSummary } from "../api/project-builder-api.js";

interface ProjectsPageProps {
  projects: Project[];
  onOpenAuthorizeModal: () => void;
  onRefresh: () => void;
  selectedProjectId?: string | null;
  onSelectProject?: (projectId: string | null) => void;
  uxMode?: UserExperienceMode;
}

export const ProjectsPage: React.FC<ProjectsPageProps> = ({
  projects,
  onOpenAuthorizeModal,
  onRefresh,
  selectedProjectId: propSelectedProjectId,
  onSelectProject,
  uxMode = "standard",
}) => {
  const { t, translateError } = useTranslation();
  const [localProjects, setLocalProjects] = useState<Project[]>(projects);
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "enabled" | "disabled">("all");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<"builder" | "directories">("builder");
  const [builderProjects, setBuilderProjects] = useState<ProjectSummary[]>([]);
  const [selectedBuilderId, setSelectedBuilderId] = useState<string | null>(null);

  const loadBuilderProjects = async () => {
    try {
      const data = await projectBuilderApi.listProjects();
      setBuilderProjects(data);
    } catch {}
  };

  useEffect(() => {
    loadBuilderProjects();
  }, []);

  useEffect(() => {
    setLocalProjects(projects);
  }, [projects]);

  const activeSelectedId = propSelectedProjectId !== undefined ? propSelectedProjectId : internalSelectedId;

  const handleSelect = (id: string | null) => {
    if (onSelectProject) {
      onSelectProject(id);
    } else {
      setInternalSelectedId(id);
    }
  };

  if (selectedBuilderId) {
    return (
      <ProjectBuilderWorkspace
        projectId={selectedBuilderId}
        onBack={() => {
          setSelectedBuilderId(null);
          loadBuilderProjects();
        }}
      />
    );
  }

  // If a project is selected, render the rich detail view
  if (activeSelectedId) {
    return (
      <ProjectDetailPage
        projectId={activeSelectedId}
        onBack={() => handleSelect(null)}
        onRefreshProjects={onRefresh}
        uxMode={uxMode}
      />
    );
  }

  const handleToggleEnable = async (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextEnabled = !project.enabled;

    // Immediate optimistic update
    setLocalProjects((prev) =>
      prev.map((p) => (p.id === project.id ? { ...p, enabled: nextEnabled } : p))
    );
    setLoadingId(project.id);
    setError(null);

    try {
      if (project.enabled) {
        await bridge.disableProject(project.id);
      } else {
        await bridge.enableProject(project.id);
      }
      onRefresh();
    } catch (err: any) {
      // Revert optimistic state on failure
      setLocalProjects((prev) =>
        prev.map((p) => (p.id === project.id ? { ...p, enabled: project.enabled } : p))
      );
      setError(translateError(err.code, err.message));
    } finally {
      setLoadingId(null);
    }
  };

  const handleToggleAccess = async (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    const newMode = project.accessMode === "read-only" ? "read-write" : "read-only";
    const optimisticExecMode =
      newMode === "read-only" ? "disabled" : project.executionMode;

    // Immediate optimistic update
    setLocalProjects((prev) =>
      prev.map((p) =>
        p.id === project.id
          ? { ...p, accessMode: newMode, executionMode: optimisticExecMode }
          : p
      )
    );
    setLoadingId(project.id);
    setError(null);

    try {
      const updated = await bridge.setProjectAccess(project.id, newMode);
      setLocalProjects((prev) =>
        prev.map((p) => (p.id === project.id ? { ...p, ...updated } : p))
      );
      onRefresh();
    } catch (err: any) {
      // Revert optimistic state on failure
      setLocalProjects((prev) =>
        prev.map((p) =>
          p.id === project.id
            ? {
                ...p,
                accessMode: project.accessMode,
                executionMode: project.executionMode,
              }
            : p
        )
      );
      setError(translateError(err.code, err.message));
    } finally {
      setLoadingId(null);
    }
  };

  const handleChangeExecution = async (
    project: Project,
    newMode: "disabled" | "safe-only" | "project-code",
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    e.stopPropagation();
    const optimisticAccessMode =
      newMode === "project-code" ? "read-write" : project.accessMode;

    // Immediate optimistic update
    setLocalProjects((prev) =>
      prev.map((p) =>
        p.id === project.id
          ? {
              ...p,
              executionMode: newMode,
              accessMode: optimisticAccessMode,
            }
          : p
      )
    );
    setLoadingId(project.id);
    setError(null);

    try {
      const updated = await bridge.setProjectExecution(project.id, newMode);
      setLocalProjects((prev) =>
        prev.map((p) => (p.id === project.id ? { ...p, ...updated } : p))
      );
      onRefresh();
    } catch (err: any) {
      // Revert optimistic state on failure
      setLocalProjects((prev) =>
        prev.map((p) =>
          p.id === project.id
            ? {
                ...p,
                executionMode: project.executionMode,
                accessMode: project.accessMode,
              }
            : p
        )
      );
      setError(translateError(err.code, err.message));
    } finally {
      setLoadingId(null);
    }
  };

  const handleRemove = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Immediate optimistic update
    setLocalProjects((prev) => prev.filter((p) => p.id !== projectId));
    setLoadingId(projectId);
    setError(null);

    try {
      await bridge.removeProject(projectId);
      setDeleteConfirmId(null);
      onRefresh();
    } catch (err: any) {
      setLocalProjects(projects);
      setError(translateError(err.code, err.message));
    } finally {
      setLoadingId(null);
    }
  };

  // Filter projects based on search query and status filter
  const filteredProjects = localProjects.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.root || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.id.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (filterMode === "enabled") return p.enabled;
    if (filterMode === "disabled") return !p.enabled;
    return true;
  });

  const handleLoadSampleBlueprint = async () => {
    try {
      const sample = {
        projectId: `proj_unity_demo_${Date.now().toString().slice(-4)}`,
        name: "Unity Third Person Demo (Auto-Generated)",
        goal: "Create a verified third-person player controller and environment in active scene",
        requirements: ["Player character entity", "Main camera tracking", "Safe verified scene commit"],
        constraints: ["Keep in Tasgole active scene", "Zero compiler errors"],
        providers: ["unity-gamedev"],
        capabilities: ["create_gameobject", "find_gameobject", "inspect_object", "modify_gameobject"],
        stages: [
          {
            id: "stage_scene_setup",
            name: "Environment Setup",
            goal: "Setup base terrain and ground",
            provider: "unity-gamedev",
            dependsOn: [],
            actions: [
              {
                id: "act_create_ground",
                name: "Create Ground Plane",
                capability: "create_gameobject",
                parameters: { name: "Demo_Ground_Plane", primitiveType: "Plane" },
                verification: { type: "object_exists", target: "Demo_Ground_Plane" },
              },
            ],
          },
          {
            id: "stage_player_setup",
            name: "Player Setup",
            goal: "Instantiate player root and tag",
            provider: "unity-gamedev",
            dependsOn: ["stage_scene_setup"],
            actions: [
              {
                id: "act_create_player",
                name: "Create Player Capsule",
                capability: "create_gameobject",
                parameters: { name: "Demo_ThirdPerson_Player", primitiveType: "Capsule" },
                verification: { type: "object_exists", target: "Demo_ThirdPerson_Player" },
              },
              {
                id: "act_tag_player",
                name: "Tag Player as Player",
                capability: "modify_gameobject",
                parameters: { name: "Demo_ThirdPerson_Player", tag: "Player" },
                verification: { type: "object_exists", target: "Demo_ThirdPerson_Player" },
              },
            ],
          },
          {
            id: "stage_verification_delivery",
            name: "Final Verification & Delivery",
            goal: "Verify active scene integrity and commit artifacts",
            provider: "unity-gamedev",
            dependsOn: ["stage_player_setup"],
            actions: [
              {
                id: "act_verify_scene",
                name: "Verify Scene State",
                capability: "get_scene_data",
                parameters: {},
              },
            ],
          },
        ],
        verification: { strategy: "DEEP", requiredChecks: ["all_stages_verified"] },
        delivery: { type: "unity_scene_commit", summary: "Third person demo setup delivered" },
      };
      const created = await projectBuilderApi.createProject(sample);
      if (created.success && created.project) {
        setSelectedBuilderId(created.project.projectId);
      }
    } catch (err: any) {
      alert("Failed to load sample blueprint: " + err.message);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto select-none">
      {/* Top View Switcher */}
      <div className="flex items-center justify-between border-b border-theme-subtle pb-4 flex-wrap gap-4">
        <div className="flex items-center gap-2 font-mono text-xs">
          <button
            type="button"
            onClick={() => setActiveView("builder")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition ${
              activeView === "builder"
                ? "bg-sky-600 text-white font-semibold"
                : "text-theme-muted hover:text-theme-primary bg-theme-card/30 border border-theme-subtle"
            }`}
          >
            <Box className="w-4 h-4" />
            <span>自动化工程 (Project Builder)</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] bg-white/20">{builderProjects.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView("directories")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition ${
              activeView === "directories"
                ? "bg-sky-600 text-white font-semibold"
                : "text-theme-muted hover:text-theme-primary bg-theme-card/30 border border-theme-subtle"
            }`}
          >
            <FolderLock className="w-4 h-4" />
            <span>受控本地目录 (Workspace Folders)</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] bg-white/20">{projects.length}</span>
          </button>
        </div>

        {activeView === "builder" ? (
          <div className="flex items-center gap-2">
            <button
              onClick={handleLoadSampleBlueprint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-theme-card hover:bg-theme-card-muted border border-theme-subtle text-sky-400 font-medium rounded-lg text-xs shadow-sm transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>+ 加载示例 Unity Blueprint</span>
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenAuthorizeModal}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-medium rounded-lg text-xs shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>{t.projects.authorizeBtn || "Authorize Directory"}</span>
          </button>
        )}
      </div>

      {activeView === "builder" && (
        <div className="space-y-4 font-mono">
          <div className="flex items-center justify-between text-xs text-theme-muted">
            <span>工程蓝图清单 (Blueprints):</span>
            <button
              onClick={loadBuilderProjects}
              className="text-theme-muted hover:text-theme-primary text-xs flex items-center gap-1"
            >
              刷新
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {builderProjects.map((bp) => (
              <div
                key={bp.projectId}
                onClick={() => setSelectedBuilderId(bp.projectId)}
                className="p-5 rounded-xl border border-theme-subtle bg-theme-card/40 hover:bg-theme-card/70 hover:border-sky-500/40 cursor-pointer space-y-3 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-theme-primary">{bp.name}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20 font-semibold">
                    {bp.status}
                  </span>
                </div>

                <p className="text-xs text-theme-muted line-clamp-2">{bp.goal}</p>

                <div className="space-y-1.5 pt-2 border-t border-theme-subtle/40 text-[11px] text-theme-secondary">
                  <div className="flex justify-between">
                    <span>已提交阶段:</span>
                    <strong>{bp.committedStagesCount} / {bp.stagesCount}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Providers:</span>
                    <span className="text-sky-400">{bp.providers.join(", ")}</span>
                  </div>
                </div>
              </div>
            ))}

            {builderProjects.length === 0 && (
              <div className="p-8 text-center text-xs text-theme-muted bg-theme-card/20 border border-theme-subtle rounded-xl col-span-2 space-y-3">
                <Box className="w-8 h-8 mx-auto opacity-30 text-sky-400" />
                <p>暂无正在执行的自动化工程蓝图</p>
                <p className="text-[11px] text-theme-secondary">
                  您可以从 Web AI (ChatGPT/DeepSeek) 经由 Public MCP 提交工程蓝图，或点击上方“加载示例 Unity Blueprint”。
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeView === "directories" && (
        <div className="space-y-6">

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-xs text-red-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-theme-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.projects?.searchPlaceholder || "Search projects by name, root path, or ID..."}
            className="w-full bg-theme-input border border-theme-input rounded-lg pl-9 pr-3 py-1.5 text-xs text-theme-primary focus:outline-none focus:border-sky-500 transition font-mono"
          />
        </div>

        <div className="flex items-center gap-1 bg-theme-card-muted border border-theme-subtle rounded-lg p-1 text-xs">
          <button
            onClick={() => setFilterMode("all")}
            className={`px-2.5 py-1 rounded font-medium transition ${
              filterMode === "all"
                ? "bg-theme-card text-theme-primary shadow-sm border border-theme-subtle"
                : "text-theme-muted hover:text-theme-secondary"
            }`}
          >
            {t.common?.all || "All"} ({localProjects.length})
          </button>
          <button
            onClick={() => setFilterMode("enabled")}
            className={`px-2.5 py-1 rounded font-medium transition ${
              filterMode === "enabled"
                ? "bg-theme-card text-theme-primary shadow-sm border border-theme-subtle"
                : "text-theme-muted hover:text-theme-secondary"
            }`}
          >
            {t.common?.enable || "Enabled"} ({localProjects.filter((p) => p.enabled).length})
          </button>
          <button
            onClick={() => setFilterMode("disabled")}
            className={`px-2.5 py-1 rounded font-medium transition ${
              filterMode === "disabled"
                ? "bg-theme-card text-theme-primary shadow-sm border border-theme-subtle"
                : "text-theme-muted hover:text-theme-secondary"
            }`}
          >
            {t.common?.disable || "Disabled"} ({localProjects.filter((p) => !p.enabled).length})
          </button>
        </div>
      </div>

      {/* Projects List */}
      {filteredProjects.length === 0 ? (
        <div className="p-12 text-center bg-theme-card border border-theme-subtle rounded-xl space-y-3 shadow-sm">
          <FolderLock className="w-10 h-10 text-theme-muted mx-auto" />
          <div className="text-theme-primary font-semibold text-sm">
            {projects.length === 0
              ? t.projects?.noProjects || "No authorized projects yet"
              : "No matching projects found"}
          </div>
          <p className="text-theme-muted text-xs max-w-md mx-auto">
            {projects.length === 0
              ? t.projects?.noProjectsDesc || "Authorize a local workspace to get started."
              : "Try adjusting your search or status filter."}
          </p>
          {projects.length === 0 && (
            <button
              onClick={onOpenAuthorizeModal}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg text-xs transition shadow-sm"
            >
              {t.projects?.authorizeBtn || "Authorize Directory"}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredProjects.map((project) => {
            const isDeleting = deleteConfirmId === project.id;
            const isLoading = loadingId === project.id;

            return (
              <div
                key={project.id}
                onClick={() => handleSelect(project.id)}
                className={`p-5 bg-theme-card border rounded-xl space-y-3 transition-all duration-150 cursor-pointer group shadow-sm hover:border-theme-strong ${
                  project.enabled
                    ? "border-theme-subtle"
                    : "border-theme-subtle opacity-60"
                }`}
              >
                {/* Upper Row: Name, Path, and Actions */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-theme-primary text-base group-hover:text-sky-500 dark:group-hover:text-sky-300 transition-colors truncate">
                        {project.name}
                      </span>
                      <span className="font-mono text-xs text-theme-muted">
                        {project.id}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                          project.enabled
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                            : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                        }`}
                      >
                        {project.enabled
                          ? (t.control?.statusAuthorized || "AUTHORIZED")
                          : (t.control?.statusDisabled || "DISABLED")}
                      </span>
                    </div>
                    {project.root && (
                      <div className="text-xs font-mono text-theme-secondary bg-theme-card-muted px-2.5 py-1 rounded border border-theme-subtle inline-block select-all">
                        {project.root}
                      </div>
                    )}
                  </div>

                  {/* Actions Right */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => handleToggleEnable(project, e)}
                      disabled={isLoading}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                        project.enabled
                          ? "bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border-theme-subtle"
                          : "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-600"
                      }`}
                    >
                      {project.enabled ? (t.projectDetail?.disable || "Disable") : (t.projectDetail?.enable || "Enable")}
                    </button>

                    {isDeleting ? (
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => handleRemove(project.id, e)}
                          disabled={isLoading}
                          className="px-2.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition shadow-sm"
                        >
                          {t.projectDetail?.confirmRemove || "Confirm"}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(null);
                          }}
                          className="px-2.5 py-1.5 bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary rounded-lg text-xs border border-theme-subtle transition"
                        >
                          {t.common?.cancel || "Cancel"}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(project.id);
                        }}
                        disabled={isLoading}
                        className="p-1.5 text-theme-muted hover:text-red-500 hover:bg-theme-card-hover rounded-lg transition"
                        title={t.projectDetail?.removeProject || "Remove authorization"}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}

                    <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-sky-600 dark:text-sky-400 bg-sky-500/10 border border-sky-500/20 group-hover:bg-sky-500/20 transition">
                      <span>{t.common?.details || "Detail"}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>

                {/* Lower Row: Security & Permission Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-theme-subtle text-xs font-mono">
                  <div className="flex items-center justify-between p-2.5 bg-theme-card-muted rounded-lg border border-theme-subtle">
                    <div>
                      <div className="font-medium text-theme-secondary flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-theme-muted" />
                        <span>{t.projects?.accessMode || "Access Mode"}</span>
                      </div>
                      <div className="text-theme-muted text-[11px] mt-0.5">
                        {project.accessMode === "read-only"
                          ? (t.projects?.readOnly || "Files are protected against edits")
                          : (t.projects?.readWrite || "Full file modification authorized")}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleToggleAccess(project, e)}
                      disabled={isLoading}
                      className={`text-[11px] font-mono px-2.5 py-1 rounded cursor-pointer transition ${
                        project.accessMode === "read-only"
                          ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                          : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                      }`}
                    >
                      {project.accessMode === "read-only"
                        ? (t.projects?.readOnly || "Read-Only")
                        : (t.projects?.readWrite || "Read-Write")}
                    </button>
                  </div>

                  <div
                    className="flex items-center justify-between p-2.5 bg-theme-card-muted rounded-lg border border-theme-subtle"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div>
                      <div className="font-medium text-theme-secondary flex items-center gap-1.5">
                        <Terminal className="w-3.5 h-3.5 text-theme-muted" />
                        <span>{t.projects?.executionMode || "Execution Boundary"}</span>
                      </div>
                      <div className="text-theme-muted text-[11px] mt-0.5">
                        Mode: {project.executionMode}
                      </div>
                    </div>
                    <select
                      value={project.executionMode}
                      onChange={(e) =>
                        handleChangeExecution(
                          project,
                          e.target.value as "disabled" | "safe-only" | "project-code",
                          e
                        )
                      }
                      disabled={isLoading}
                      onClick={(e) => e.stopPropagation()}
                      className="text-[11px] font-mono text-sky-600 dark:text-sky-400 px-2 py-1 rounded bg-sky-500/10 border border-sky-500/20 focus:outline-none focus:border-sky-500 cursor-pointer"
                    >
                      <option value="safe-only">{t.projectDetail?.execSafeOnly || "safe-only"}</option>
                      <option value="project-code">{t.projectDetail?.execProjectCode || "project-code"}</option>
                      <option value="disabled">{t.projectDetail?.execDisabled || "disabled"}</option>
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>
      )}
    </div>
  );
};
