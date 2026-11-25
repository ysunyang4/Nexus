// @signature NX_CANARY_8829F_PROD_2026
import React, { useState, useEffect, useCallback, useRef } from "react";
import { OctagonAlert } from "lucide-react";
import { Sidebar, type NavPage } from "./components/Sidebar.js";
import { Header } from "./components/Header.js";
import { StartupScreen } from "./components/StartupScreen.js";
import { OverviewPage } from "./pages/OverviewPage.js";
import { ProjectsPage } from "./pages/ProjectsPage.js";
import { DesktopPage } from "./pages/computer/DesktopPage.js";
import { FilesPage } from "./pages/computer/FilesPage.js";
import { ApplicationsPage } from "./pages/computer/ApplicationsPage.js";
import { BrowserPage } from "./pages/computer/BrowserPage.js";
import { ExecutionPage } from "./pages/execution/ExecutionPage.js";
import { ActionLedgerPage } from "./pages/execution/ActionLedgerPage.js";
import { RuntimePage } from "./pages/execution/RuntimePage.js";
import { McpServersPage } from "./pages/mcp/McpServersPage.js";
import { McpToolsPage } from "./pages/mcp/McpToolsPage.js";
import { ToolRegistryPage } from "./pages/mcp/ToolRegistryPage.js";
import { JobsPage } from "./pages/JobsPage.js";
import { ConnectionsPage } from "./pages/ConnectionsPage.js";
import { TokensPage } from "./pages/TokensPage.js";
import { ApprovalsPage } from "./pages/ApprovalsPage.js";
import { ActivityPage } from "./pages/ActivityPage.js";
import { SkillsPage } from "./pages/SkillsPage.js";
import { GlobalRulesPage } from "./pages/GlobalRulesPage.js";
import { StoragePage } from "./pages/StoragePage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { UnityWorkspacePage } from "./pages/unity/UnityWorkspacePage.js";
import { AuthorizeProjectModal } from "./components/modals/AuthorizeProjectModal.js";
import { CreateTokenModal } from "./components/modals/CreateTokenModal.js";
import { EmergencyStopModal } from "./components/modals/EmergencyStopModal.js";
import { ResolveApprovalModal } from "./components/modals/ResolveApprovalModal.js";
import { OnboardingModal } from "./components/modals/OnboardingModal.js";
import { FullControlModal } from "./components/modals/FullControlModal.js";
import { AppErrorBoundary } from "./components/common/AppErrorBoundary.js";
import { bridge, type TunnelStatusDto } from "./api/bridge.js";
import { useTranslation } from "./i18n/useTranslation.js";
import type {
  ServerStatus,
  McpStatus,
  Project,
  Approval,
  Job,
  RunnerInfo,
  Token,
  AuditEvent,
  ApprovalRoutingMode,
  UserExperienceMode,
  FullControlStatusDto,
  AIConnectionDto,
  StartupDiagnostics,
} from "./types.js";
import { applyServerPollResult } from "./polling-state.js";

export const App: React.FC = () => {
  const { t, language, tText } = useTranslation();
  const isZh = language.startsWith("zh");
  const [currentPage, setCurrentPage] = useState<NavPage>("overview");

  // User Experience Mode (defaults to standard for all first-time and regular users)
  const [uxMode, setUxMode] = useState<UserExperienceMode>(() => {
    const saved = localStorage.getItem("nexus_ux_mode");
    if (saved === "standard" || saved === "advanced") {
      return saved;
    }
    return "standard";
  });

  const handleUxModeChange = (nextMode: UserExperienceMode) => {
    setUxMode(nextMode);
    localStorage.setItem("nexus_ux_mode", nextMode);
  };

  // First-time onboarding wizard modal
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    return !localStorage.getItem("nexus_onboarding_completed");
  });

  // State
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [mcpStatus, setMcpStatus] = useState<McpStatus | null>(null);
  const [tunnelStatus, setTunnelStatus] = useState<TunnelStatusDto | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [runners, setRunners] = useState<RunnerInfo[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSuccessfulRefresh, setLastSuccessfulRefresh] = useState<number | null>(null);
  const lastSuccessfulRefreshRef = useRef<number | null>(null);
  const refreshGeneration = useRef(0);

  // Modals
  const [isAuthorizeModalOpen, setIsAuthorizeModalOpen] = useState(false);
  const [isCreateTokenModalOpen, setIsCreateTokenModalOpen] = useState(false);
  const [isEmergencyStopModalOpen, setIsEmergencyStopModalOpen] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(null);
  const [approvalRoutingMode, setApprovalRoutingMode] = useState<ApprovalRoutingMode>("chat");
  const [fullControlStatus, setFullControlStatus] = useState<FullControlStatusDto | null>(null);
  const [isFullControlModalOpen, setIsFullControlModalOpen] = useState(false);
  const [connections, setConnections] = useState<AIConnectionDto[]>([]);
  const [settingsInitialTab, setSettingsInitialTab] = useState<any>("general");
  const [aboutNavTrigger, setAboutNavTrigger] = useState(0);
  const [mcpGuideTrigger, setMcpGuideTrigger] = useState(0);

  const handleOpenAbout = useCallback(() => {
    setSettingsInitialTab("about");
    setCurrentPage("settings");
    setAboutNavTrigger(Date.now());
    window.dispatchEvent(new CustomEvent("nexus:navigate-about"));
  }, []);

  useEffect(() => {
    const handleNavigateMcpGuide = () => {
      setSettingsInitialTab("mcp");
      setCurrentPage("settings");
      setMcpGuideTrigger(Date.now());
    };
    window.addEventListener("nexus:navigate-mcp-guide", handleNavigateMcpGuide);
    return () => {
      window.removeEventListener("nexus:navigate-mcp-guide", handleNavigateMcpGuide);
    };
  }, []);

  // Startup Readiness State
  const [isStartupComplete, setIsStartupComplete] = useState(false);
  const [startupTimeout, setStartupTimeout] = useState(false);
  const [startupDiag, setStartupDiag] = useState<StartupDiagnostics | null>(null);
  const [startupServerReady, setStartupServerReady] = useState(false);
  const [startupRunnerReady, setStartupRunnerReady] = useState(false);
  const [startupMcpReady, setStartupMcpReady] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  // Fetch all state
  const loadData = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    try {
      const [
        statusRes,
        mcpRes,
        projRes,
        appRes,
        healthRes,
        tunnelRes,
        fcRes,
      ] = await Promise.allSettled([
        bridge.getStatus(),
        bridge.getMcpStatus(),
        bridge.listProjects(),
        bridge.listApprovals(),
        bridge.getDesktopHealth(),
        bridge.getTunnelStatus(),
        bridge.getFullControlStatus(),
      ]);

      if (generation !== refreshGeneration.current) return;

      if (healthRes.status === "fulfilled" && healthRes.value?.startup_error) {
        setStartupError(healthRes.value.startup_error);
      } else {
        setStartupError(null);
      }

      const updateStateIfChanged = (setter: any, newValue: any) => {
        setter((prev: any) => {
          if (prev === newValue) return prev;
          return JSON.stringify(prev) === JSON.stringify(newValue) ? prev : newValue;
        });
      };

      const nextServer = applyServerPollResult(
        { serverStatus: null, lastSuccessfulRefresh: lastSuccessfulRefreshRef.current },
        statusRes
      );
      if (lastSuccessfulRefreshRef.current === null && nextServer.lastSuccessfulRefresh) {
        lastSuccessfulRefreshRef.current = nextServer.lastSuccessfulRefresh;
        setLastSuccessfulRefresh(nextServer.lastSuccessfulRefresh);
      }
      updateStateIfChanged(setServerStatus, nextServer.serverStatus);
      if (mcpRes.status === "fulfilled") updateStateIfChanged(setMcpStatus, mcpRes.value);
      else updateStateIfChanged(setMcpStatus, null);
      if (projRes.status === "fulfilled") updateStateIfChanged(setProjects, projRes.value.projects || []);
      else updateStateIfChanged(setProjects, []);
      if (appRes.status === "fulfilled") updateStateIfChanged(setApprovals, appRes.value.approvals || []);
      else updateStateIfChanged(setApprovals, []);
      if (tunnelRes.status === "fulfilled") updateStateIfChanged(setTunnelStatus, tunnelRes.value);
      else updateStateIfChanged(setTunnelStatus, null);
      if (fcRes.status === "fulfilled") updateStateIfChanged(setFullControlStatus, fcRes.value);
      else updateStateIfChanged(setFullControlStatus, null);
    } catch {
      if (generation === refreshGeneration.current) {
        const updateStateIfChanged = (setter: any, newValue: any) => {
          setter((prev: any) => JSON.stringify(prev) === JSON.stringify(newValue) ? prev : newValue);
        };
        updateStateIfChanged(setServerStatus, null);
        updateStateIfChanged(setMcpStatus, null);
        updateStateIfChanged(setTunnelStatus, null);
        updateStateIfChanged(setProjects, []);
        updateStateIfChanged(setApprovals, []);
        updateStateIfChanged(setFullControlStatus, null);
      }
    }
  }, []);

  // Page-specific on-demand data loading
  useEffect(() => {
    if (!isStartupComplete) return;

    if (currentPage === "tokens") {
      bridge.listTokens().then((res) => setTokens(res.tokens || [])).catch(() => {});
    } else if (currentPage === "activity") {
      bridge.listAudit().then((res) => setAuditEvents(res.events || [])).catch(() => {});
    } else if (currentPage === "connections") {
      bridge.listAiConnections().then((res) => setConnections(res.connections || [])).catch(() => {});
      bridge.listRunners().then((res: any) => {
        const list = Array.isArray(res) ? res : Array.isArray(res?.runners) ? res.runners : [];
        setRunners(list);
      }).catch(() => {});
    } else if (currentPage === "jobs") {
      bridge.listJobs().then((res) => setJobs(res.jobs || [])).catch(() => {});
    }
  }, [currentPage, isStartupComplete]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    if (currentPage === "tokens") {
      await bridge.listTokens().then((res) => setTokens(res.tokens || [])).catch(() => {});
    } else if (currentPage === "activity") {
      await bridge.listAudit().then((res) => setAuditEvents(res.events || [])).catch(() => {});
    } else if (currentPage === "connections") {
      await bridge.listAiConnections().then((res) => setConnections(res.connections || [])).catch(() => {});
      await bridge.listRunners().then((res: any) => {
        const list = Array.isArray(res) ? res : Array.isArray(res?.runners) ? res.runners : [];
        setRunners(list);
      }).catch(() => {});
    } else if (currentPage === "jobs") {
      await bridge.listJobs().then((res) => setJobs(res.jobs || [])).catch(() => {});
    }
    const now = Date.now();
    lastSuccessfulRefreshRef.current = now;
    setLastSuccessfulRefresh(now);
    setIsRefreshing(false);
  };

  // Initial startup & readiness polling
  useEffect(() => {
    if (isStartupComplete) return;

    let cancelled = false;
    const timeoutTimer = setTimeout(async () => {
      if (!isStartupComplete && !cancelled) {
        setStartupTimeout(true);
        const diag = await bridge.getStartupDiagnostics();
        if (diag && !cancelled) setStartupDiag(diag);
      }
    }, 30000);

    const poll = async () => {
      if (cancelled || isStartupComplete) return;
      try {
        const health = await bridge.getDesktopHealth();
        if (cancelled) return;
        if (health) {
          if (health.startup_error) {
            setStartupError(health.startup_error);
            setStartupTimeout(true);
            const diag = await bridge.getStartupDiagnostics();
            if (diag && !cancelled) setStartupDiag(diag);
            return;
          }
          if (health.server_running) {
            setStartupServerReady(true);
          }
          if (health.runner_running) {
            setStartupRunnerReady(true);
          }
          if (health.ready) {
            setStartupServerReady(true);
            setStartupRunnerReady(true);
            setStartupMcpReady(true);
            clearTimeout(timeoutTimer);
            await loadData();
            if (!cancelled) {
              setIsStartupComplete(true);
            }
            return;
          }
        } else {
          // Outside Tauri (e.g. browser dev mode)
          try {
            const status = await bridge.getStatus();
            if (status) {
              setStartupServerReady(true);
              setStartupRunnerReady(true);
              setStartupMcpReady(true);
              clearTimeout(timeoutTimer);
              await loadData();
              if (!cancelled) {
                setIsStartupComplete(true);
              }
              return;
            }
          } catch {
            // Server not up yet, keep polling
          }
        }
      } catch {
        // Keep polling
      }
    };

    poll();
    const interval = setInterval(poll, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeoutTimer);
      clearInterval(interval);
    };
  }, [isStartupComplete, retryNonce, loadData]);

  // Regular data polling after startup
  useEffect(() => {
    if (!isStartupComplete) return;
    const interval = setInterval(loadData, 6000);
    return () => {
      refreshGeneration.current++;
      clearInterval(interval);
    };
  }, [isStartupComplete, loadData]);

  const handleRetryStartup = async () => {
    setStartupTimeout(false);
    setStartupError(null);
    setStartupServerReady(false);
    setStartupRunnerReady(false);
    setStartupMcpReady(false);
    setStartupDiag(null);
    await bridge.retryStartup();
    setRetryNonce((n) => n + 1);
  };

  // Toggle Global Pause
  const handleTogglePause = async () => {
    const nextPaused = !(mcpStatus?.paused ?? false);
    try {
      await bridge.setPauseState(nextPaused);
      await loadData();
    } catch (err) {
      console.error("Failed to toggle pause:", err);
    }
  };

  const handleStopFullControl = async () => {
    try {
      await bridge.stopFullControl();
      const fc = await bridge.getFullControlStatus();
      setFullControlStatus(fc);
    } catch (err) {
      console.error("Failed to stop full control:", err);
    }
  };

  // Handle Approval Routing Mode Change
  const handleChangeApprovalRoutingMode = async (mode: ApprovalRoutingMode) => {
    try {
      await bridge.setApprovalRoutingMode(mode);
      setApprovalRoutingMode(mode);
      await loadData();
    } catch (err) {
      console.error("Failed to update approval routing mode:", err);
    }
  };

  const pageTitles: Record<NavPage, { title: string; subtitle: string; breadcrumb?: string }> = {
    overview: {
      title: tText("工作台概览", "Workspace Overview", "概要", "Übersicht"),
      subtitle: tText("确定性本地执行桥接中心", "Deterministic Execution Bridge", "確定的なローカル実行ブリッジセンター", "Deterministische Ausführungsbrücke"),
      breadcrumb: tText("工作区", "WORKSPACE", "ワークスペース", "ARBEITSBEREICH"),
    },
    projects: {
      title: tText("已授权项目", "Authorized Projects", "許可されたプロジェクト", "Autorisierte Projekte"),
      subtitle: tText("项目工作区与本地目录范围", "Project Roots & Local Directory Scope", "プロジェクトルートとローカルディレクトリ範囲", "Projekt-Roots & Verzeichnisbereich"),
      breadcrumb: tText("工作区", "WORKSPACE", "ワークスペース", "ARBEITSBEREICH"),
    },
    unity: {
      title: "Unity",
      subtitle: tText("Unity 工程 IDE 工作区 • 双向 IPC 执行桥接", "Unity IDE Workspace", "Unity IDE ワークスペース", "Unity IDE-Arbeitsbereich"),
      breadcrumb: tText("应用", "APPLICATIONS", "アプリケーション", "ANWENDUNGEN"),
    },
    desktop: {
      title: tText("电脑桌面预览", "Computer Desktop", "デスクトッププレビュー", "Desktop-Vorschau"),
      subtitle: tText("Windows 桌面主机与受控交互界面", "Windows Host & Interactive Control Surface", "Windows ホスト & インタラクティブ制御サーフェス", "Windows-Host & Interaktive Steuerung"),
      breadcrumb: tText("电脑控制", "COMPUTER", "コンピューター制御", "COMPUTER"),
    },
    files: {
      title: tText("文件浏览器", "Files Explorer", "ファイルエクスプローラー", "Datei-Explorer"),
      subtitle: tText("按需资源检索与工作区目录", "On-Demand Resource Navigation", "オンデマンドリソースナビゲーション", "Ressourcennavigation"),
      breadcrumb: tText("电脑控制", "COMPUTER", "コンピューター制御", "COMPUTER"),
    },
    applications: {
      title: tText("MCP 插件中心", "MCP Plugin Center", "MCP プラグインセンター", "MCP-Plugin-Zentrum"),
      subtitle: tText("发现、安装、配置与管理标准 MCP 扩展服务", "Discover, install and manage standard MCP extensions", "MCP拡張サービスの検出・インストール・管理", "Standard-MCP-Dienste erkennen, installieren und verwalten"),
      breadcrumb: tText("应用", "APPLICATIONS", "アプリケーション", "ANWENDUNGEN"),
    },
    browser: {
      title: tText("浏览器自动化", "Browser Automation", "ブラウザ自動化", "Browser-Automatisierung"),
      subtitle: tText("Chromium CDP 确定性网页自动化工作台", "Chromium CDP Automation Workspace", "Chromium CDP 自動化ワークスペース", "Chromium CDP Automatisierungs-Arbeitsbereich"),
      breadcrumb: tText("电脑控制", "COMPUTER", "コンピューター制御", "COMPUTER"),
    },
    execution: {
      title: tText("执行管道", "Execution Pipeline", "実行パイプライン", "Ausführungs-Pipeline"),
      subtitle: tText("实时工具调用流程与确定性证据网格", "Active Tool Execution & Verification Flow", "リアルタイムツール実行と検証フロー", "Tool-Ausführung & Überprüfungsfluss"),
      breadcrumb: tText("执行管理", "EXECUTION", "実行管理", "AUSFÜHRUNG"),
    },
    ledger: {
      title: tText("操作审计账本", "Action Ledger", "アクション台帳", "Aktions-Ledger"),
      subtitle: tText("不可变操作履历与 WAL 审计留痕", "Immutable Action History & Audit Log", "不変のアクション履歴とWAL監査ログ", "Unveränderliche Aktionshistorie & Audit-Log"),
      breadcrumb: tText("执行管理", "EXECUTION", "実行管理", "AUSFÜHRUNG"),
    },
    runtime: {
      title: tText("运行时基础设施", "Runtime Infrastructure", "ランタイムインフラ", "Laufzeit-Infrastruktur"),
      subtitle: tText("Node.js 引擎、Runner 守护与 LSP 服务状态", "Node.js Engine, Runner & LSP Status", "Node.js エンジン、Runner、LSP 状態", "Node.js Engine, Runner & LSP Status"),
      breadcrumb: tText("执行管理", "EXECUTION", "実行管理", "AUSFÜHRUNG"),
    },
    "mcp-servers": {
      title: tText("MCP 服务节点", "MCP Servers", "MCP サーバーノード", "MCP-Server"),
      subtitle: tText("活动协议端点与安全网关", "Active Protocol Endpoints & Gateways", "アクティブなプロトコルエンドポイントとゲートウェイ", "Aktive Protokoll-Endpunkte & Gateways"),
      breadcrumb: "MCP",
    },
    "mcp-tools": {
      title: tText("MCP 工具库", "MCP Tools Registry", "MCP ツールレジストリ", "MCP-Tools-Register"),
      subtitle: tText("经权威验证的规范执行工具", "Canonical Verified Execution Tools", "検証済みの正規実行ツール", "Kanonisch verifizierte Ausführungstools"),
      breadcrumb: "MCP",
    },
    "mcp-registry": {
      title: tText("注册表与能力矩阵", "Capability Matrix", "機能マトリックス", "Funktionsmatrix"),
      subtitle: tText("Provider 执行绑定与证据交付契约", "Provider Mappings & Evidence Contracts", "プロバイダーマッピングと証拠契約", "Provider-Zuordnungen & Nachweisverträge"),
      breadcrumb: "MCP",
    },
    skills: {
      title: tText("技能中心", "Executable Skills", "スキルセンター", "Skill-Zentrum"),
      subtitle: tText("确定性本地任务工作流与执行规范", "Deterministic Workflows & Automation Tasks", "確定的なローカルタスクワークフローと実行仕様", "Deterministische Workflows & Automatisierungsaufgaben"),
      breadcrumb: tText("智能管理", "INTELLIGENCE", "インテリジェンス", "INTELLIGENZ"),
    },
    settings: {
      title: tText("应用设置", "Settings", "設定", "Einstellungen"),
      subtitle: tText("系统配置、安全策略与本地基础设施", "Configuration, System Trust & Local Infrastructure", "システム設定、セキュリティポリシー、ローカルインフラ", "Konfiguration, Systemsicherheit & Infrastruktur"),
      breadcrumb: tText("设置", "SETTINGS", "設定", "EINSTELLUNGEN"),
    },
    // Compatibility
    jobs: { title: tText("后台任务", "Jobs", "ジョブ", "Aufgaben"), subtitle: tText("异步任务执行列表", "Background Tasks", "バックグラウンドタスク", "Hintergrundaufgaben"), breadcrumb: tText("执行管理", "EXECUTION", "実行管理", "AUSFÜHRUNG") },
    connections: { title: tText("AI 连接中心", "Connections", "AI 接続センター", "KI-Verbindungen"), subtitle: tText("ChatGPT & 隧道连接", "External Endpoints", "外部エンドポイント", "Externe Endpunkte"), breadcrumb: "MCP" },
    tokens: { title: tText("访问令牌", "API Tokens", "アクセストークン", "API-Tokens"), subtitle: tText("安全认证与授权凭证", "Access Control", "アクセス制御", "Zugriffskontrolle"), breadcrumb: tText("设置", "SETTINGS", "設定", "EINSTELLUNGEN") },
    approvals: { title: tText("审批中心", "Approvals", "承認センター", "Genehmigungen"), subtitle: tText("待处理的敏感操作", "Pending Authorizations", "保留中の承認", "Ausstehende Autorisierungen"), breadcrumb: tText("执行管理", "EXECUTION", "実行管理", "AUSFÜHRUNG") },
    activity: { title: tText("活动记录", "Activity", "アクティビティ履歴", "Aktivitäten"), subtitle: tText("系统操作历史", "Audit History", "監査ログ", "Audit-Protokoll"), breadcrumb: tText("执行管理", "EXECUTION", "実行管理", "AUSFÜHRUNG") },
    rules: { title: tText("全局规则", "Global Rules", "グローバルルール", "Globale Regeln"), subtitle: tText("策略层级与安全边界", "Policy Hierarchy", "ポリシー階層", "Richtlinienhierarchie"), breadcrumb: tText("智能管理", "INTELLIGENCE", "インテリジェンス", "INTELLIGENZ") },
    storage: { title: tText("本地存储", "Storage", "ローカルストレージ", "Lokaler Speicher"), subtitle: tText("磁盘与持久化管理", "Local Disk Partitions", "ディスク管理", "Lokale Festplattenpartitionen"), breadcrumb: tText("设置", "SETTINGS", "設定", "EINSTELLUNGEN") },
  };

  const handleNavigate = (page: NavPage) => {
    if (page !== "projects") {
      setSelectedProjectId(null);
    }
    setCurrentPage(page);
  };

  if (!isStartupComplete) {
    return (
      <StartupScreen
        isTimeout={startupTimeout}
        startupError={startupError}
        serverReady={startupServerReady}
        runnerReady={startupRunnerReady}
        mcpReady={startupMcpReady}
        diagnostics={startupDiag}
        onRetry={handleRetryStartup}
        onOpenLogs={() => bridge.openLogsFolder()}
        onQuit={() => bridge.quitNexus()}
      />
    );
  }

  return (
    <div className="flex h-screen bg-theme-base text-theme-primary font-sans antialiased overflow-hidden select-none">
      {/* Sidebar Navigation */}
      <Sidebar
        currentPage={currentPage}
        onSelectPage={(page) => {
          if (page === "settings") {
            setSettingsInitialTab("general");
          }
          handleNavigate(page);
        }}
        serverStatus={serverStatus}
        runnersCount={serverStatus?.runners_connected ?? 0}
        uxMode={uxMode}
        onOpenAbout={handleOpenAbout}
        onOpenSponsorModal={handleOpenAbout}
        onOpenCommunityModal={handleOpenAbout}
        onOpenContactModal={handleOpenAbout}
      />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {currentPage !== "unity" && (
          <Header
            title={
              currentPage === "projects" && selectedProjectId
                ? (projects.find((p) => p.id === selectedProjectId)?.name || "Project Detail")
                : pageTitles[currentPage]?.title || "Nexus"
            }
            subtitle={
              currentPage === "projects" && selectedProjectId
                ? (projects.find((p) => p.id === selectedProjectId)?.root || pageTitles[currentPage]?.subtitle)
                : pageTitles[currentPage]?.subtitle
            }
            breadcrumb={
              currentPage === "projects" && selectedProjectId
                ? "Project Detail"
                : pageTitles[currentPage]?.breadcrumb
            }
            mcpStatus={mcpStatus}
            approvalRoutingMode={approvalRoutingMode}
            onChangeApprovalRoutingMode={handleChangeApprovalRoutingMode}
            onTogglePause={handleTogglePause}
            onTriggerEmergencyStop={() => setIsEmergencyStopModalOpen(true)}
            onRefreshAll={handleManualRefresh}
            isRefreshing={isRefreshing}
            serverAvailable={serverStatus !== null}
            lastSuccessfulRefresh={lastSuccessfulRefresh}
            uxMode={uxMode}
            fullControlStatus={fullControlStatus}
            onOpenFullControl={() => setIsFullControlModalOpen(true)}
            onStopFullControl={handleStopFullControl}
          />
        )}

        {startupError && (
          <div className="m-6 p-6 bg-red-500/10 border border-red-500/30 rounded-xl space-y-3">
            <div className="flex items-center gap-3 text-red-500">
              <OctagonAlert className="w-6 h-6 shrink-0" />
              <div>
                <div className="font-semibold text-sm">
                  Nexus Core Server failed to start / 核心服务启动失败
                </div>
                <div className="text-xs text-red-400 font-mono mt-1">
                  Reason: {startupError}
                </div>
              </div>
            </div>
            <div className="text-xs text-theme-muted space-y-1 pl-9">
              <div>&bull; Verify bundled runtime resources are intact.</div>
              <div>&bull; Ensure port 18080 is not occupied by another process.</div>
            </div>
            <div className="pl-9 pt-1">
              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition"
              >
                {isRefreshing ? t.common.refreshing : t.common.refresh}
              </button>
            </div>
          </div>
        )}

        <main className={`flex-1 min-h-0 flex flex-col ${currentPage === "skills" ? "overflow-hidden" : "overflow-y-auto"}`}>
          <AppErrorBoundary
            isZh={isZh}
            componentName="MainRoute"
            onReset={loadData}
          >
            {currentPage === "overview" && (
              <OverviewPage
                serverStatus={serverStatus}
                mcpStatus={mcpStatus}
                tunnelStatus={tunnelStatus}
                projects={projects}
                approvals={approvals}
                onNavigate={handleNavigate}
                onSelectProject={(id) => {
                  setSelectedProjectId(id);
                  setCurrentPage("projects");
                }}
                onOpenAuthorizeModal={() => setIsAuthorizeModalOpen(true)}
              />
            )}

            {currentPage === "projects" && (
              <ProjectsPage
                projects={projects}
                onOpenAuthorizeModal={() => setIsAuthorizeModalOpen(true)}
                onRefresh={loadData}
                selectedProjectId={selectedProjectId}
                onSelectProject={setSelectedProjectId}
                uxMode={uxMode}
              />
            )}

            {currentPage === "desktop" && <DesktopPage />}

            {currentPage === "files" && <FilesPage projects={projects} />}

            {currentPage === "applications" && <ApplicationsPage />}
            {currentPage === "unity" && <UnityWorkspacePage />}

            {currentPage === "browser" && <BrowserPage />}

            {currentPage === "execution" && <ExecutionPage />}

            {currentPage === "ledger" && <ActionLedgerPage />}

            {currentPage === "runtime" && <RuntimePage serverStatus={serverStatus} />}

            {currentPage === "mcp-servers" && (
              <McpServersPage mcpStatus={mcpStatus} tunnelStatus={tunnelStatus} />
            )}

            {currentPage === "mcp-tools" && <McpToolsPage />}

            {currentPage === "mcp-registry" && <ToolRegistryPage />}

            {currentPage === "skills" && (
              <SkillsPage
                uxMode={uxMode}
                projectId={selectedProjectId ?? undefined}
              />
            )}

            
            {currentPage === "settings" && (
              <SettingsPage
                tunnelStatus={tunnelStatus}
                serverStatus={serverStatus}
                mcpStatus={mcpStatus}
                onRefresh={loadData}
                uxMode={uxMode}
                onChangeUxMode={handleUxModeChange}
                onNavigate={handleNavigate}
                onOpenOnboarding={() => setShowOnboarding(true)}
                onOpenSponsorModal={handleOpenAbout}
                initialTab={settingsInitialTab}
                aboutNavTrigger={aboutNavTrigger}
                mcpGuideTrigger={mcpGuideTrigger}
              />
            )}

            {/* Backward Compatibility Aliases */}
            {currentPage === "jobs" && <JobsPage jobs={jobs} onRefresh={loadData} />}

            {currentPage === "connections" && (
              <ConnectionsPage
                serverStatus={serverStatus}
                runners={runners}
                onRefresh={loadData}
              />
            )}

            {currentPage === "tokens" && (
              <TokensPage
                tokens={tokens}
                onOpenCreateTokenModal={() => setIsCreateTokenModalOpen(true)}
                onRefresh={loadData}
              />
            )}

            {currentPage === "approvals" && (
              <ApprovalsPage
                approvals={approvals}
                onSelectApproval={(approval) => setSelectedApproval(approval)}
                onRefresh={loadData}
              />
            )}

            {currentPage === "activity" && (
              <ActivityPage
                events={auditEvents}
                approvals={approvals}
                onRefresh={loadData}
                initialFilter="all"
                onResolveApproval={async (id, action) => {
                  await bridge.resolveApproval(id, action);
                  await loadData();
                }}
                uxMode={uxMode}
              />
            )}

            {currentPage === "rules" && <GlobalRulesPage />}

            {currentPage === "storage" && <StoragePage />}
          </AppErrorBoundary>
        </main>
      </div>

      {/* Modals */}
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onAuthorizeProject={() => setIsAuthorizeModalOpen(true)}
        onDownloadLaya={async () => {
          try {
            await bridge.downloadAndEnableModel();
          } catch (err) {
            console.error("Failed to start Laya download from onboarding:", err);
          }
        }}
      />

      <AuthorizeProjectModal
        isOpen={isAuthorizeModalOpen}
        onClose={() => setIsAuthorizeModalOpen(false)}
        onSuccess={loadData}
      />

      <CreateTokenModal
        isOpen={isCreateTokenModalOpen}
        onClose={() => setIsCreateTokenModalOpen(false)}
        onSuccess={loadData}
      />

      <EmergencyStopModal
        isOpen={isEmergencyStopModalOpen}
        onClose={() => setIsEmergencyStopModalOpen(false)}
        onSuccess={loadData}
      />

      <ResolveApprovalModal
        approval={selectedApproval}
        isOpen={Boolean(selectedApproval)}
        onClose={() => setSelectedApproval(null)}
        onSuccess={loadData}
      />

      <FullControlModal
        isOpen={isFullControlModalOpen}
        onClose={() => setIsFullControlModalOpen(false)}
        onStarted={async () => {
          await loadData();
        }}
        currentProjectId={selectedProjectId || (projects.length > 0 ? projects[0].id : undefined)}
        currentProjectName={
          (projects.find((p) => p.id === selectedProjectId) || projects[0])?.name
        }
        connections={connections}
      />
    </div>
  );
};
