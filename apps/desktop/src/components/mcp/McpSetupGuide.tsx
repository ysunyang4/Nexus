import React, { useState } from "react";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe,
  HelpCircle,
  RefreshCw,
  ShieldAlert,
  Terminal,
  Trash2,
  Wrench,
  XCircle,
} from "lucide-react";
import { bridge, type McpEnvCheckResult } from "../../api/bridge.js";
import { openExternalUrl } from "../../api/browser-helper.js";
import { useTranslation } from "../../i18n/useTranslation.js";

export interface McpSetupGuideProps {
  totalToolsCount?: number;
  runningCount?: number;
  totalServicesCount?: number;
  externalProvidersCount?: number;
}

export const McpSetupGuide: React.FC<McpSetupGuideProps> = ({
  totalToolsCount = 0,
  runningCount = 0,
  totalServicesCount = 0,
  externalProvidersCount = 0,
}) => {
  const { tText } = useTranslation();
  const [envCheck, setEnvCheck] = useState<McpEnvCheckResult | null>(null);
  const [checkingEnv, setCheckingEnv] = useState(false);
  const [envError, setEnvError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
    } catch {
      // ignore clipboard failures
    }
  };

  const handleOpenExternal = async (url: string) => {
    try {
      await openExternalUrl(url);
    } catch {
      window.open(url, "_blank");
    }
  };

  const handleRunEnvCheck = async () => {
    setCheckingEnv(true);
    setEnvError(null);
    try {
      const res = await bridge.getMcpEnvCheck();
      setEnvCheck(res);
    } catch (err: any) {
      setEnvError(
        err?.message ||
          tText(
            "环境检测失败，请确认 Nexus 后端服务正在运行",
            "Environment check failed. Make sure the Nexus backend service is running.",
            "環境チェックに失敗しました。Nexus バックエンドが起動しているか確認してください。",
            "Umgebungsprüfung fehlgeschlagen. Stellen Sie sicher, dass der Nexus-Backend-Dienst läuft.",
          ),
      );
    } finally {
      setCheckingEnv(false);
    }
  };

  const CopyCmdBlock = ({
    id,
    cmd,
    label,
  }: {
    id: string;
    cmd: string;
    label?: string;
  }) => (
    <div className="rounded-lg border border-slate-200 bg-slate-950 text-slate-100 overflow-hidden">
      {label && (
        <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] font-medium text-slate-400 flex items-center justify-between">
          <span>{label}</span>
        </div>
      )}
      <div className="px-3 py-2.5 flex items-center justify-between gap-2">
        <code className="text-xs font-mono text-emerald-300 break-all select-all">
          {cmd}
        </code>
        <button
          type="button"
          onClick={() => handleCopy(id, cmd)}
          className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition-colors"
          title={tText("复制命令", "Copy command", "コマンドをコピー", "Befehl kopieren")}
        >
          {copiedId === id ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-300">
                {tText("已复制", "Copied", "コピー済み", "Kopiert")}
              </span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>{tText("复制", "Copy", "コピー", "Kopieren")}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  const renderToolBadge = (
    name: string,
    info?: {
      installed: boolean;
      ok: boolean;
      version: string | null;
      path: string | null;
      requirement?: string;
      bundled?: boolean;
    },
  ) => {
    if (!info) return null;
    return (
      <div
        key={name}
        className={`p-3 rounded-xl border text-xs ${
          info.ok
            ? "bg-emerald-50/60 border-emerald-200"
            : info.installed
              ? "bg-amber-50/70 border-amber-200"
              : "bg-rose-50/60 border-rose-200"
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="font-semibold text-slate-800">{name}</span>
          {info.ok ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold">
              <CheckCircle2 className="w-3 h-3" />
              {tText("就绪", "Ready", "準備完了", "Bereit")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-semibold">
              <XCircle className="w-3 h-3" />
              {tText("缺失 / 不兼容", "Missing", "未検出", "Fehlt")}
            </span>
          )}
        </div>
        <div className="text-[11px] font-mono text-slate-700 truncate">
          {info.version || tText("未检测到", "Not found", "見つかりません", "Nicht gefunden")}
          {info.bundled
            ? ` (${tText("内置", "Bundled", "内蔵", "Gebündelt")})`
            : ""}
        </div>
        {info.requirement && (
          <div className="text-[10px] text-slate-500 mt-0.5">
            {tText("要求", "Requires", "要件", "Erfordert")}: {info.requirement}
          </div>
        )}
        {info.path && (
          <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5" title={info.path}>
            {info.path}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header + Live Stats */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-500" />
              {tText(
                "MCP 安装与环境排障指南",
                "MCP Setup & Troubleshooting Guide",
                "MCP インストール・トラブルシューティングガイド",
                "MCP-Installations- & Fehlerbehebungsleitfaden",
              )}
            </h2>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
              {tText(
                "区分「免配置内置引擎」与「宿主软件联动插件」，提供一键环境检测、安全安装命令、国内镜像加速与常见报错排查。",
                "Separates zero-config built-in engines from host-software bridges, with one-click environment diagnostics, pinned install commands, China mirrors, and error troubleshooting.",
                "「設定不要の内蔵エンジン」と「ホストソフト連携プラグイン」を分けて解説し、ワンクリック環境診断、安全なインストールコマンド、ミラー設定、エラー対処を提供します。",
                "Trennt vorkonfigurierte integrierte Engines von Host-Software-Bridges – mit Ein-Klick-Umgebungsprüfung, gepinnten Installationsbefehlen, Mirror-Hinweisen und Fehlerbehebung.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">
              {tText("实时工具池", "Live Tool Pool", "ツールプール", "Live-Tool-Pool")}:{" "}
              <strong className="font-mono">{totalToolsCount}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
              {tText("托管服务", "Managed Services", "管理サービス", "Dienste")}:{" "}
              <strong className="font-mono">
                {runningCount}/{totalServicesCount}
              </strong>
            </span>
            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-medium">
              {tText("外部 Provider", "External Providers", "外部プロバイダー", "Externe Provider")}:{" "}
              <strong className="font-mono">{externalProvidersCount}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Environment Check */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-500" />
              {tText(
                "一键环境检测（Node / npm / uv / Python / 端口占用）",
                "One-Click Environment Check (Node / npm / uv / Python / Ports)",
                "ワンクリック環境診断（Node / npm / uv / Python / ポート）",
                "Ein-Klick-Umgebungsprüfung (Node / npm / uv / Python / Ports)",
              )}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {tText(
                "实时探测本机工具链版本与 MCP 默认端口占用状态，快速定位缺失依赖或端口冲突。",
                "Probes local toolchain versions and default MCP port bindings in real time to pinpoint missing runtimes or port conflicts.",
                "ローカルのツールチェーンと既定 MCP ポートの使用状況をリアルタイムで検出し、不足依存やポート競合を特定します。",
                "Prüft lokale Toolchain-Versionen und Standard-MCP-Ports in Echtzeit, um fehlende Laufzeiten oder Portkonflikte zu finden.",
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRunEnvCheck}
            disabled={checkingEnv}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checkingEnv ? "animate-spin" : ""}`} />
            {checkingEnv
              ? tText("正在检测...", "Checking...", "診断中...", "Prüfe...")
              : tText("运行环境检测", "Run Environment Check", "環境診断を実行", "Umgebung prüfen")}
          </button>
        </div>

        {envError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
            {envError}
          </div>
        )}

        {envCheck && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {renderToolBadge("Node.js", envCheck.tools.node)}
              {renderToolBadge("npm", envCheck.tools.npm)}
              {renderToolBadge("uv", envCheck.tools.uv)}
              {renderToolBadge("Python", envCheck.tools.python)}
              {renderToolBadge("photoshop-mcp", envCheck.tools.photoshopMcp)}
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>
                  {tText(
                    "MCP 常用端口占用检测",
                    "Default MCP Port Status",
                    "既定 MCP ポート使用状況",
                    "Standard-MCP-Portstatus",
                  )}
                </span>
                <span className="text-[11px] font-normal text-slate-400">
                  {new Date(envCheck.checkedAt).toLocaleTimeString()}
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {envCheck.ports.map((p) => {
                  const isUnityConflict = p.port === 20705 && p.inUse;
                  return (
                    <div
                      key={p.port}
                      className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono font-semibold text-slate-800 w-14">
                          :{p.port}
                        </span>
                        <span className="text-slate-700">{p.service}</span>
                        {isUnityConflict && (
                          <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                            {tText(
                              "注意：20705 已被占用，若非当前 Unity 实例请先释放",
                              "Note: 20705 is in use; free it if held by a stale process",
                              "注意: 20705 は使用中です。別プロセスなら解放してください",
                              "Hinweis: 20705 ist belegt; ggf. alten Prozess beenden",
                            )}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {p.inUse ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-medium font-mono">
                            {tText("已占用", "In Use", "使用中", "Belegt")}
                            {p.pid ? ` · PID ${p.pid}` : ""}
                            {p.processName ? ` (${p.processName})` : ""}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-medium">
                            {tText("空闲", "Free", "空き", "Frei")}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Category Split */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
            {tText("分类 1 · 免配置内置引擎", "Category 1 · Zero-Config Built-in", "分類 1 · 設定不要の内蔵エンジン", "Kategorie 1 · Vorkonfiguriert")}
          </div>
          <h4 className="text-sm font-semibold text-slate-900">
            {tText(
              "Playwright / Agentic Tools / Code Reasoning / Wikipedia",
              "Playwright / Agentic Tools / Code Reasoning / Wikipedia",
              "Playwright / Agentic Tools / Code Reasoning / Wikipedia",
              "Playwright / Agentic Tools / Code Reasoning / Wikipedia",
            )}
          </h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            {tText(
              "通过 Nexus 内置 uv 运行时自动拉取 Python 依赖，无需手动装包。注意：首次点击 Start 会下载依赖与 Playwright 浏览器内核，通常需要 1–3 分钟（国内网络建议先配置镜像源）。",
              "Managed automatically via Nexus's bundled uv runtime with no manual package install. Note: the very first Start downloads Python packages and Playwright's browser binary, typically taking 1–3 minutes.",
              "Nexus 内蔵の uv ランタイムで Python 依存関係を自動取得するため手動インストール不要です。初回 Start 時はパッケージと Playwright ブラウザの取得に通常 1〜3 分かかります。",
              "Wird automatisch über die integrierte uv-Laufzeit von Nexus verwaltet. Hinweis: Der allererste Start lädt Python-Pakete und den Playwright-Browser herunter (ca. 1–3 Minuten).",
            )}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
            {tText("分类 2 · 宿主软件联动插件", "Category 2 · Host Software Bridges", "分類 2 · ホストソフト連携", "Kategorie 2 · Host-Software-Bridges")}
          </div>
          <h4 className="text-sm font-semibold text-slate-900">
            {tText(
              "Photoshop / Unity / Blender / AutoCAD",
              "Photoshop / Unity / Blender / AutoCAD",
              "Photoshop / Unity / Blender / AutoCAD",
              "Photoshop / Unity / Blender / AutoCAD",
            )}
          </h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            {tText(
              "必须先在本地打开对应的桌面宿主软件并启用其桥接插件/监听端口，再在 Nexus 中点击 Start。未启动宿主软件时连接会显示 0 Tools 或启动超时。",
              "You must launch the corresponding host application locally and enable its bridge/listener first before clicking Start in Nexus. Otherwise tool discovery will show 0 Tools or time out.",
              "先に対象のデスクトップアプリを起動し、ブリッジ／リスナーを有効にしてから Nexus で Start を押してください。未起動だと 0 Tools やタイムアウトになります。",
              "Starten Sie zuerst die jeweilige Desktop-Anwendung und deren Bridge/Listener, bevor Sie in Nexus auf Start klicken. Sonst erscheinen 0 Tools oder Timeouts.",
            )}
          </p>
        </div>
      </div>

      {/* Host Software Setup Cards */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <Wrench className="w-4 h-4 text-indigo-500" />
          {tText(
            "各宿主软件安装与联动说明",
            "Host Application Setup Instructions",
            "各ホストソフトのインストール・連携手順",
            "Einrichtungsanleitung pro Host-Anwendung",
          )}
        </h3>

        {/* Photoshop MCP */}
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">
                Photoshop MCP (:9095)
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                @alisaitteke/photoshop-mcp@1.7.38
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={() => handleOpenExternal("https://photoshop-mcp.com")}
                className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
              >
                photoshop-mcp.com <ExternalLink className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() =>
                  handleOpenExternal("https://github.com/alisaitteke/photoshop-mcp")
                }
                className="inline-flex items-center gap-1 text-slate-600 hover:underline"
              >
                GitHub (@alisaitteke) <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Security Warning */}
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>
                {tText("安全提示：", "Security Notice: ", "セキュリティ注意: ", "Sicherheitshinweis: ")}
              </strong>
              {tText(
                "全局安装的第三方 MCP 包（作者 @alisaitteke）将以您当前系统用户的权限直接操控本地 Photoshop 与文件系统。以下命令已锁定经验证的 1.7.38 版本并显式放行 better-sqlite3 原生编译脚本。",
                "This third-party global npm package (author @alisaitteke) runs with your local user permissions and can control Photoshop and files directly. The command below pins verified version 1.7.38 and explicitly allows the better-sqlite3 install script.",
                "グローバルインストールするサードパーティ MCP（作者 @alisaitteke）は現在のユーザー権限で Photoshop とファイルを直接操作します。下のコマンドは検証済みバージョン 1.7.38 を固定し、better-sqlite3 スクリプトのみを許可します。",
                "Dieses globale Drittanbieter-Paket (Autor @alisaitteke) läuft mit Ihren lokalen Benutzerrechten und steuert Photoshop direkt. Der Befehl pinnt Version 1.7.38 und erlaubt explizit das better-sqlite3-Installationsskript.",
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            <CopyCmdBlock
              id="node-check"
              label={tText(
                "0. 检查 Node.js 版本（需 >= 18）",
                "0. Check Node.js version (requires >= 18)",
                "0. Node.js バージョン確認（18 以上が必要）",
                "0. Node.js-Version prüfen (erfordert >= 18)",
              )}
              cmd="node -v"
            />
            <CopyCmdBlock
              id="ps-install"
              label={tText(
                "1. 全局安装 Photoshop MCP（Windows 推荐用 npm.cmd）",
                "1. Install Photoshop MCP globally (use npm.cmd on Windows PowerShell)",
                "1. Photoshop MCP をグローバルインストール（Windows は npm.cmd 推奨）",
                "1. Photoshop MCP global installieren (unter Windows npm.cmd nutzen)",
              )}
              cmd="npm.cmd install -g --allow-scripts=better-sqlite3 @alisaitteke/photoshop-mcp@1.7.38"
            />
            <CopyCmdBlock
              id="ps-where"
              label={tText(
                "2. 验证可执行文件路径",
                "2. Verify executable path",
                "2. 実行ファイルパスを確認",
                "2. Ausführbaren Pfad prüfen",
              )}
              cmd="where.exe photoshop-mcp.cmd"
            />
          </div>
        </div>

        {/* Unity, Blender, AutoCAD grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Unity */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
            <div className="text-sm font-semibold text-slate-900">
              Unity GameDev MCP (:20705)
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {tText(
                "需先打开 Unity Editor 并启用桥接包。若本机 20705 端口已被残留进程占用，点击 Start 会连接失败；请先用上方「环境检测」查看占用 PID 并结束冲突进程。",
                "Open Unity Editor with the bridge package enabled first. If port 20705 is already held by another process, Start will fail—use Environment Check above to locate and stop the conflicting PID.",
                "先に Unity Editor を開きブリッジを有効にしてください。ポート 20705 が別プロセスに占有されていると起動に失敗するため、上の環境診断で PID を確認してください。",
                "Öffnen Sie zuerst den Unity Editor mit aktiver Bridge. Ist Port 20705 belegt, schlägt Start fehl – prüfen Sie die PID oben in der Umgebungsprüfung.",
              )}
            </p>
          </div>

          {/* Blender */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
            <div className="text-sm font-semibold text-slate-900">
              Blender MCP (:9099 → :9876)
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {tText(
                "Nexus 通过内置 blender_server.py（uv 托管，HTTP 端口 9099）桥接到 Blender 插件的本地 Socket 端口 9876。请先在 Blender 中启用插件并开启 9876 监听，再点击 Start。",
                "Nexus launches blender_server.py (managed by uv on HTTP port 9099) which bridges to Blender's addon socket on port 9876. Enable and start the Blender addon listener first, then click Start.",
                "Nexus は内蔵の blender_server.py（uv 管理・ポート 9099）経由で Blender アドオンの Socket 9876 に接続します。先に Blender 側でリスナーを開始してから Start を押してください。",
                "Nexus startet blender_server.py (uv, Port 9099) und verbindet sich mit dem Blender-Addon-Socket auf Port 9876. Aktivieren Sie zuerst den Listener in Blender.",
              )}
            </p>
          </div>

          {/* AutoCAD */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
            <div className="text-sm font-semibold text-slate-900">
              AutoCAD MCP (:9107)
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {tText(
                "Windows COM 自动化要求权限完全一致：Nexus 与 AutoCAD 必须同为普通用户运行，或同为「以管理员身份运行」。一方提权、另一方未提权会导致 COM 握手失败。",
                "Windows COM automation requires matching privilege levels: Nexus and AutoCAD must BOTH run as a standard user or BOTH as Administrator. Mixed elevation blocks COM calls.",
                "Windows COM 連携には権限の一致が必要です。Nexus と AutoCAD は両方とも通常ユーザー、または両方とも管理者として実行してください。",
                "Windows-COM erfordert identische Rechte: Nexus und AutoCAD müssen BEIDE als Standardbenutzer oder BEIDE als Administrator ausgeführt werden.",
              )}
            </p>
          </div>
        </div>
      </div>

      {/* China Network Mirrors + Lifecycle */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Globe className="w-4 h-4 text-sky-500" />
            {tText(
              "国内网络镜像加速（uv / npm）",
              "China Network Mirrors (uv / npm)",
              "ミラー設定（低速・タイムアウト時の高速化）",
              "Spiegelserver für langsame Netzwerke (uv / npm)",
            )}
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            {tText(
              "首次拉取 Python 依赖或 Playwright 浏览器较慢甚至超时时，可先设置清华 PyPI 源或淘宝 npm 镜像：",
              "If initial uv/PyPI downloads or npm global installs time out, configure a fast regional mirror:",
              "uv や npm の初回ダウンロードがタイムアウトする場合は、以下のミラーを指定してください：",
              "Wenn erste uv/PyPI- oder npm-Downloads fehlschlagen, verwenden Sie diese Mirror-Befehle:",
            )}
          </p>
          <CopyCmdBlock
            id="uv-mirror"
            label="PowerShell · uv / PyPI Mirror"
            cmd='$env:UV_INDEX_URL="https://pypi.tuna.tsinghua.edu.cn/simple"'
          />
          <CopyCmdBlock
            id="npm-mirror"
            label="npm · Registry Mirror"
            cmd="npm.cmd install -g --allow-scripts=better-sqlite3 @alisaitteke/photoshop-mcp@1.7.38 --registry=https://registry.npmmirror.com"
          />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-slate-700" />
            {tText(
              "查看日志、停止与卸载",
              "Logs, Stop & Uninstall",
              "ログ確認・停止・アンインストール",
              "Protokolle, Stoppen & Deinstallieren",
            )}
          </h3>
          <ul className="space-y-2.5 text-xs text-slate-600">
            <li className="flex items-start gap-2">
              <Terminal className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <span>
                <strong>{tText("查看日志：", "View Logs: ", "ログ確認: ", "Logs ansehen: ")}</strong>
                {tText(
                  "Start 失败后，点击 MCP 卡片右侧的 `>_` 日志按钮即可实时查看标准输出与报错详情。",
                  "After a failed Start, click the `>_` Logs button on any MCP card to inspect live stdout/stderr.",
                  "Start に失敗したら、MCP カード右側の `>_` ログボタンから標準出力・エラー出力を確認できます。",
                  "Klicken Sie nach einem fehlgeschlagenen Start auf `>_` auf der MCP-Karte, um stdout/stderr zu prüfen.",
                )}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>
                <strong>{tText("停止服务：", "Stop Service: ", "サービス停止: ", "Dienst stoppen: ")}</strong>
                {tText(
                  "点击卡片上的红色 Stop 按钮即可安全终止对应子进程并释放端口。",
                  "Click the red Stop button on a running card to terminate the child process and release its port.",
                  "実行中カードの赤い Stop ボタンで子プロセスを終了しポートを解放します。",
                  "Klicken Sie auf Stop, um den Kindprozess zu beenden und den Port freizugeben.",
                )}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Trash2 className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <span>
                <strong>{tText("卸载移除：", "Uninstall: ", "削除・アンインストール: ", "Deinstallieren: ")}</strong>
                {tText(
                  "点击卡片最右侧的垃圾桶图标可从 Nexus 移除配置；全局 npm 包可执行下方命令彻底卸载。",
                  "Click the Trash icon to remove the service from Nexus; for global npm packages run the uninstall command below.",
                  "ゴミ箱アイコンで Nexus から設定を削除できます。グローバル npm パッケージは下のコマンドで削除できます。",
                  "Klicken Sie auf das Papierkorb-Symbol zum Entfernen aus Nexus; globale npm-Pakete mit dem Befehl unten deinstallieren.",
                )}
              </span>
            </li>
          </ul>
          <CopyCmdBlock
            id="ps-uninstall"
            cmd="npm.cmd uninstall -g @alisaitteke/photoshop-mcp"
          />
        </div>
      </div>

      {/* Troubleshooting FAQ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-amber-500" />
          {tText(
            "常见报错速查",
            "Common Error Quick Reference",
            "よくあるエラー早見表",
            "Häufige Fehler & Lösungen",
          )}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="font-mono font-semibold text-rose-700">
              npm.ps1 cannot be loaded (ExecutionPolicy)
            </div>
            <p className="text-slate-600">
              {tText(
                "Windows PowerShell 默认禁止执行 .ps1 脚本，请改用 `npm.cmd` 代替 `npm`。",
                "Windows PowerShell blocks .ps1 scripts by default. Use `npm.cmd` instead of `npm`.",
                "PowerShell で .ps1 の実行が禁止されている場合は `npm` の代わりに `npm.cmd` を使用してください。",
                "PowerShell blockiert .ps1-Skripte standardmäßig. Verwenden Sie `npm.cmd` statt `npm`.",
              )}
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="font-mono font-semibold text-rose-700">
              spawn ... ENOENT
            </div>
            <p className="text-slate-600">
              {tText(
                "系统 PATH 中找不到对应命令或未安装全局包。请先点击上方「运行环境检测」确认缺失项。",
                "Executable not found in PATH or global package missing. Run Environment Check above to locate the gap.",
                "PATH にコマンドが見つからないかパッケージ未導入です。上の環境診断で確認してください。",
                "Programm nicht im PATH oder globales Paket fehlt. Führen Sie oben die Umgebungsprüfung aus.",
              )}
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="font-mono font-semibold text-amber-700">
              0 Tools {tText("（启动后工具数为 0）", "(0 tools after Start)", "(起動後にツール数 0)", "(0 Tools nach Start)")}
            </div>
            <p className="text-slate-600">
              {tText(
                "宿主软件（Photoshop / Unity / Blender / AutoCAD）未打开或插件监听未开启，请打开宿主并查看 `>_` 日志。",
                "Host app is not open or its listener is off. Launch the host software and inspect `>_` Logs.",
                "ホストアプリが未起動かリスナーがオフです。アプリを起動し `>_` ログを確認してください。",
                "Host-App ist nicht geöffnet oder Listener ist aus. App starten und `>_` Logs prüfen.",
              )}
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="font-mono font-semibold text-amber-700">
              EADDRINUSE / {tText("端口冲突 (20705 / 9095)", "Port conflict (20705 / 9095)", "ポート競合 (20705 / 9095)", "Portkonflikt (20705 / 9095)")}
            </div>
            <p className="text-slate-600">
              {tText(
                "旧进程仍在后台监听。用上方环境检测查看占用 PID，结束旧进程后重新 Start。",
                "A stale process is still listening. Check the owning PID via Environment Check above and terminate it.",
                "古いプロセスが残っています。上の環境診断で PID を確認し終了してから再起動してください。",
                "Ein alter Prozess belegt den Port. Prüfen Sie die PID oben und beenden Sie den Prozess.",
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
