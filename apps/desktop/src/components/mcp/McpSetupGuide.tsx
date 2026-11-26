import React, { useState } from "react";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Check,
  Copy,
  ExternalLink,
  Globe,
  HelpCircle,
  RefreshCw,
  ShieldAlert,
  Terminal,
  Trash2,
  Wrench,
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
    <div className="rounded-lg border border-theme-subtle bg-theme-base text-theme-primary overflow-hidden">
      {label && (
        <div className="px-3 py-1.5 bg-theme-card border-b border-theme-subtle text-[11px] font-medium text-theme-secondary">
          {label}
        </div>
      )}
      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <code className="text-xs font-mono text-theme-primary break-all select-all">
          {cmd}
        </code>
        <button
          type="button"
          onClick={() => handleCopy(id, cmd)}
          className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-theme-subtle bg-transparent hover:bg-theme-card-hover text-theme-primary text-[11px] font-medium transition-colors cursor-pointer"
          title={tText("复制命令", "Copy command", "コマンドをコピー", "Befehl kopieren")}
        >
          {copiedId === id ? (
            <>
              <Check className="w-3.5 h-3.5 text-[var(--success)]" />
              <span className="text-[var(--success)]">
                {tText("已复制", "Copied", "コピー済み", "Kopiert")}
              </span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-theme-secondary" />
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
        className="p-3 rounded-xl border border-theme-subtle bg-theme-base text-xs"
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="font-semibold text-theme-primary">{name}</span>
          {info.ok ? (
            <span className="inline-flex items-center gap-1 text-[var(--success)] text-[11px] font-semibold">
              <span>✓</span>
              {tText("就绪", "Ready", "準備完了", "Bereit")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[var(--warning)] text-[11px] font-semibold">
              <span>△</span>
              {tText("缺失 / 不兼容", "Missing", "未検出", "Fehlt")}
            </span>
          )}
        </div>
        <div className="text-[11px] font-mono text-theme-secondary truncate">
          {info.version || tText("未检测到", "Not found", "見つかりません", "Nicht gefunden")}
          {info.bundled
            ? ` (${tText("内置", "Bundled", "内蔵", "Gebündelt")})`
            : ""}
        </div>
        {info.requirement && (
          <div className="text-[10px] text-theme-muted mt-0.5">
            {tText("要求", "Requires", "要件", "Erfordert")}: {info.requirement}
          </div>
        )}
        {info.path && (
          <div className="text-[10px] font-mono text-theme-muted truncate mt-0.5" title={info.path}>
            {info.path}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 text-theme-primary">
      {/* Header + Live Stats + Blog Button */}
      <div className="bg-theme-card rounded-2xl border border-theme-subtle p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <h2 className="text-lg font-semibold text-theme-primary flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-theme-secondary" />
              {tText(
                "MCP 通用接入与环境排障指南",
                "Universal MCP Setup & Troubleshooting Guide",
                "MCP 汎用導入・トラブルシューティングガイド",
                "Universeller MCP-Einrichtungs- & Fehlerbehebungsleitfaden",
              )}
            </h2>
            <p className="text-xs text-theme-secondary leading-relaxed">
              {tText(
                "涵盖 MCP 生态全部常见接入类型（内置 uv、npx/uvx、全局 npm、本地源码、宿主软件桥接与独立 HTTP/SSE 服务），提供基础运行环境检测、国内镜像与通用排障方法。",
                "Covers all common MCP integration patterns (built-in uv, npx/uvx, global npm, local scripts, host-app bridges, and standalone HTTP/SSE endpoints), with runtime checks and troubleshooting.",
                "MCP の主要な導入パターン（内蔵 uv、npx/uvx、グローバル npm、ローカルスクリプト、ホストアプリ連携、HTTP/SSE 接続）を網羅し、環境診断と汎用トラブルシューティングを提供します。",
                "Deckt alle gängigen MCP-Integrationstypen ab (integriertes uv, npx/uvx, globales npm, lokale Skripte, Host-App-Bridges und HTTP/SSE-Endpunkte) inklusive Umgebungsprüfung und Fehlerbehebung.",
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => handleOpenExternal("https://blog.ycu.de5.net/")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-theme-subtle bg-transparent hover:bg-theme-card-hover text-theme-primary font-semibold transition-colors cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-theme-secondary" />
              <span>{tText("博客完整教程", "Blog Tutorials", "ブログ解説", "Blog-Anleitung")}</span>
              <ExternalLink className="w-3 h-3 text-theme-secondary" />
            </button>
            <span className="px-2.5 py-1 rounded-full bg-theme-base text-theme-secondary border border-theme-subtle font-medium">
              {tText("实时工具池", "Live Tool Pool", "ツールプール", "Live-Tool-Pool")}:{" "}
              <strong className="font-mono text-theme-primary">{totalToolsCount}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-full bg-theme-base text-theme-secondary border border-theme-subtle font-medium">
              {tText("托管服务", "Managed Services", "管理サービス", "Dienste")}:{" "}
              <strong className="font-mono text-[var(--success)]">
                ✓ {runningCount}/{totalServicesCount}
              </strong>
            </span>
            <span className="px-2.5 py-1 rounded-full bg-theme-base text-theme-secondary border border-theme-subtle font-medium">
              {tText("已配置数", "Configured", "設定済み", "Konfiguriert")}:{" "}
              <strong className="font-mono text-theme-primary">{externalProvidersCount}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Environment Check (4 Base Runtimes + Ports) */}
      <div className="bg-theme-card rounded-2xl border border-theme-subtle p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-theme-primary flex items-center gap-2">
              <Activity className="w-4 h-4 text-theme-secondary" />
              {tText(
                "一键基础环境检测（Node.js / npm / uv / Python / 端口）",
                "One-Click Base Environment Check (Node.js / npm / uv / Python / Ports)",
                "ワンクリック基本環境診断（Node.js / npm / uv / Python / ポート）",
                "Ein-Klick-Basisprüfung (Node.js / npm / uv / Python / Ports)",
              )}
            </h3>
            <p className="text-xs text-theme-muted mt-0.5">
              {tText(
                "仅检测通用运行环境与本机端口占用情况，快速定位缺少的运行时或端口冲突。",
                "Probes base toolchains and local port bindings to pinpoint missing runtimes or port conflicts.",
                "基本ランタイムとローカルポートの使用状況を検出し、不足環境や競合を特定します。",
                "Prüft Basis-Laufzeiten und lokale Portbelegungen, um fehlende Tools oder Portkonflikte zu finden.",
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRunEnvCheck}
            disabled={checkingEnv}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:opacity-90 disabled:opacity-60 text-xs font-semibold transition-opacity cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checkingEnv ? "animate-spin" : ""}`} />
            {checkingEnv
              ? tText("正在检测...", "Checking...", "診断中...", "Prüfe...")
              : tText("运行环境检测", "Run Environment Check", "環境診断を実行", "Umgebung prüfen")}
          </button>
        </div>

        {envError && (
          <div className="p-3 rounded-xl border border-theme-subtle bg-theme-base text-xs text-[var(--warning)]">
            △ {envError}
          </div>
        )}

        {envCheck && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {renderToolBadge("Node.js", envCheck.tools.node)}
              {renderToolBadge("npm", envCheck.tools.npm)}
              {renderToolBadge("uv", envCheck.tools.uv)}
              {renderToolBadge("Python", envCheck.tools.python)}
            </div>

            <div className="rounded-xl border border-theme-subtle bg-theme-base overflow-hidden">
              <div className="px-4 py-2.5 bg-theme-card border-b border-theme-subtle flex items-center justify-between text-xs font-semibold text-theme-secondary">
                <span>
                  {tText(
                    "常见 MCP 端口占用检测",
                    "Common MCP Port Status",
                    "主要 MCP ポート使用状況",
                    "Häufiger MCP-Portstatus",
                  )}
                </span>
                <span className="text-[11px] font-normal text-theme-muted">
                  {new Date(envCheck.checkedAt).toLocaleTimeString()}
                </span>
              </div>
              <div className="divide-y divide-theme-subtle">
                {envCheck.ports.map((p) => (
                  <div
                    key={p.port}
                    className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-semibold text-theme-primary w-14">
                        :{p.port}
                      </span>
                      <span className="text-theme-secondary">{p.service}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.inUse ? (
                        <span className="inline-flex items-center gap-1 text-[var(--warning)] text-[11px] font-medium font-mono">
                          <span>△</span>
                          {tText("已占用", "In Use", "使用中", "Belegt")}
                          {p.pid ? ` · PID ${p.pid}` : ""}
                          {p.processName ? ` (${p.processName})` : ""}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[var(--success)] text-[11px] font-medium">
                          <span>✓</span>
                          {tText("空闲", "Free", "空き", "Frei")}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 6 Universal MCP Integration Types */}
      <div className="bg-theme-card rounded-2xl border border-theme-subtle p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-theme-primary flex items-center gap-2">
            <Wrench className="w-4 h-4 text-theme-secondary" />
            {tText(
              "各类 MCP 怎么安装与接入（按类型对号入座）",
              "How to Install & Connect Any MCP (By Type)",
              "MCP のタイプ別インストール・接続方法",
              "MCPs nach Typ installieren & verbinden",
            )}
          </h3>
          <span className="text-[11px] text-theme-muted">
            {tText(
              "覆盖本地、自托管、API Key 与宿主桥接型 MCP（不含需外部云端 OAuth 审核的服务）",
              "Covers local, self-hosted, API-key & host-bridge MCPs (excludes cloud OAuth-gated SaaS)",
              "ローカル・セルフホスト・APIキー・ホスト連携型に対応（クラウド OAuth 審査型は対象外）",
              "Deckt lokale, selbstgehostete, API-Key- & Host-Bridge-MCPs ab (ohne Cloud-OAuth-SaaS)",
            )}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Type 1 */}
          <div className="p-4 rounded-xl border border-theme-subtle bg-theme-base space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-theme-primary">
              {tText("类型 1 · 内置 uv / Python 托管型", "Type 1 · Built-in uv / Python", "タイプ 1 · 内蔵 uv / Python", "Typ 1 · Integriertes uv / Python")}
            </div>
            <p className="text-xs text-theme-secondary leading-relaxed">
              {tText(
                "启动命令为 `uv run ...`。无需手动装包，直接在「MCP 插件中心」点 Start，Nexus 会用内置 uv 自动拉取依赖（首次含浏览器内核下载时约需 1–3 分钟）。",
                "Command starts with `uv run ...`. No manual install needed—click Start in MCP Center and Nexus fetches dependencies via bundled uv (first run takes ~1–3 min).",
                "`uv run ...` 形式のプラグイン。手動インストール不要で Start を押すだけで内蔵 uv が依存関係を自動取得します（初回は 1〜3 分程度）。",
                "Startbefehl beginnt mit `uv run ...`. Keine manuelle Installation nötig – Start klicken und Nexus lädt Abhängigkeiten über uv (Erststart ca. 1–3 Min.).",
              )}
            </p>
          </div>

          {/* Type 2 */}
          <div className="p-4 rounded-xl border border-theme-subtle bg-theme-base space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-theme-primary">
              {tText("类型 2 · npx / uvx 按需拉取型", "Type 2 · npx / uvx On-Demand", "タイプ 2 · npx / uvx オンデマンド", "Typ 2 · npx / uvx Bei Bedarf")}
            </div>
            <p className="text-xs text-theme-secondary leading-relaxed">
              {tText(
                "社区 MCP 常见的免预先安装模式（`npx -y <包名>` 或 `uvx <包名>`）。Windows 下命令建议写 `npx.cmd` 避开 PowerShell 拦截，确保上方 Node / uv 检测就绪即可直接 Start。",
                "Common zero-preinstall community format (`npx -y <pkg>` or `uvx <pkg>`). On Windows use `npx.cmd` to avoid PowerShell script blocking.",
                "`npx -y <pkg>` や `uvx <pkg>` 形式。Windows では `npx.cmd` を指定すると PowerShell 制限を回避できます。",
                "Gängiges Format (`npx -y <Paket>` oder `uvx <Paket>`). Unter Windows `npx.cmd` verwenden, um PowerShell-Blockaden zu vermeiden.",
              )}
            </p>
          </div>

          {/* Type 3 */}
          <div className="p-4 rounded-xl border border-theme-subtle bg-theme-base space-y-2.5 md:col-span-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-theme-primary">
              {tText("类型 3 · 全局 npm CLI 安装型（需先在终端装包）", "Type 3 · Global npm CLI (Pre-install Required)", "タイプ 3 · グローバル npm CLI（事前インストール必要）", "Typ 3 · Globales npm-CLI (Vorab-Installation)")}
            </div>
            <p className="text-xs text-theme-secondary leading-relaxed">
              {tText(
                "当服务依赖全局可执行命令（例如 `xxx-mcp.cmd`）或原生模块时，需先在终端全局安装，再回 Nexus 点 Start。若遇到带原生编译的依赖可按提示附加 `--allow-scripts=<依赖名>`。",
                "When a server invokes a global CLI command (e.g. `xxx-mcp.cmd`) or native addons, install it globally first, verify with `where.exe`, then click Start in Nexus.",
                "グローバル CLI コマンドやネイティブモジュールを使う場合は、先にターミナルでグローバルインストールし、`where.exe` でパス確認後に Start してください。",
                "Wenn ein Server ein globales CLI (`xxx-mcp.cmd`) nutzt, zuerst global installieren, mit `where.exe` prüfen und dann in Nexus starten.",
              )}
            </p>
            <div className="p-2.5 rounded-lg border border-theme-subtle bg-theme-card text-xs text-[var(--warning)] flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {tText(
                  "安全提示：全局安装的第三方 MCP 包将以您当前系统用户的权限运行。请务必核对包名、作者与仓库来源，并建议在命令中锁定版本号（@版本号）。",
                  "Security Notice: Third-party global npm packages run with your local user permissions. Always verify author/source and pin an explicit version (@version).",
                  "セキュリティ注意: サードパーティ製グローバルパッケージは現在のユーザー権限で動作します。配布元を確認しバージョン固定（@version）を推奨します。",
                  "Sicherheitshinweis: Globale Drittanbieter-Pakete laufen mit Ihren lokalen Benutzerrechten. Quelle prüfen und Version pinnen (@version).",
                )}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <CopyCmdBlock
                id="tpl-node"
                label={tText("1. 检查 Node (>= 18)", "1. Check Node (>= 18)", "1. Node 確認 (>= 18)", "1. Node prüfen (>= 18)")}
                cmd="node -v"
              />
              <CopyCmdBlock
                id="tpl-npm-g"
                label={tText("2. 全局安装通用模板", "2. Global install template", "2. グローバル導入テンプレート", "2. Globale Installation")}
                cmd="npm.cmd install -g <package-name>@<version>"
              />
              <CopyCmdBlock
                id="tpl-where"
                label={tText("3. 校验命令在 PATH 中", "3. Verify command in PATH", "3. PATH 登録確認", "3. PATH-Prüfung")}
                cmd="where.exe <command-name>.cmd"
              />
            </div>
          </div>

          {/* Type 4 */}
          <div className="p-4 rounded-xl border border-theme-subtle bg-theme-base space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-theme-primary">
              {tText("类型 4 · 本地源码 / 自定义脚本型", "Type 4 · Local Source / Custom Script", "タイプ 4 · ローカルソース / 自作スクリプト", "Typ 4 · Lokaler Quellcode / Skript")}
            </div>
            <p className="text-xs text-theme-secondary leading-relaxed">
              {tText(
                "适用于从 GitHub 克隆或自行编写的 `.js` / `.py` MCP：先在项目目录装好依赖并构建（`pnpm install && pnpm build` 或 `pip install -r requirements.txt`），然后在「进程托管与 API 配置」填入绝对路径启动。",
                "For cloned or custom `.js` / `.py` MCP servers: install deps and build locally first, then register the absolute entrypoint path (e.g. `node D:\\...\\dist\\index.js` or `python D:\\...\\server.py`).",
                "GitHub クローンや自作スクリプトの場合、先に依存導入・ビルドを済ませ、絶対パス（`node ...` や `python ...`）を登録して起動します。",
                "Für geklonte oder eigene `.js`/`.py`-Server: lokal bauen/installieren und den absoluten Pfad im Prozess-Manager hinterlegen.",
              )}
            </p>
          </div>

          {/* Type 5 */}
          <div className="p-4 rounded-xl border border-theme-subtle bg-theme-base space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-theme-primary">
              {tText("类型 5 · 宿主软件联动桥接型", "Type 5 · Host Application Bridge", "タイプ 5 · ホストアプリ連携型", "Typ 5 · Host-Anwendungs-Bridge")}
            </div>
            <p className="text-xs text-theme-secondary leading-relaxed">
              {tText(
                "需联动本地桌面软件（设计、3D、CAD、游戏引擎、编辑器等）时遵循 3 条通用原则：① 先打开宿主软件并启用其桥接/Socket 监听再点 Start；② 端口冲突用上方「环境检测」查 PID；③ Windows COM 类联动需保证 Nexus 与宿主权限一致（同为普通用户或同为管理员）。",
                "For desktop host apps (design, 3D, CAD, game engines, IDEs): (1) open the host app & enable its bridge listener before clicking Start; (2) check port PID conflicts above; (3) for Windows COM apps, run Nexus and the host at the same elevation level.",
                "デスクトップアプリ連携時は 3 原則を確認：① 先にホスト側とブリッジを起動；② ポート競合は上の環境診断で PID 確認；③ Windows COM 連携は権限（通常／管理者）を一致させる。",
                "Für Desktop-Host-Apps: (1) Host-App und Bridge zuerst starten; (2) Portkonflikte oben prüfen; (3) bei Windows-COM identische Rechte (Standard oder Admin) verwenden.",
              )}
            </p>
          </div>

          {/* Type 6 */}
          <div className="p-4 rounded-xl border border-theme-subtle bg-theme-base space-y-2 md:col-span-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-theme-primary">
              {tText("类型 6 · 独立 HTTP / SSE 常驻服务或容器型", "Type 6 · Standalone HTTP / SSE Daemon or Container", "タイプ 6 · 独立 HTTP / SSE 常駐サーバー", "Typ 6 · Eigenständiger HTTP / SSE-Dienst")}
            </div>
            <p className="text-xs text-theme-secondary leading-relaxed">
              {tText(
                "如果 MCP 服务已在后台独立运行（如本地守护进程、Docker 容器或局域网服务），无需 Nexus 拉起子进程：直接在服务列表填写其 HTTP/SSE Endpoint 地址与鉴权 Token（如有）即可接入工具池。",
                "If an MCP server already runs independently (daemon, Docker container, or LAN service), no child process spawn is needed—connect directly using its HTTP/SSE Endpoint URL and Bearer Token.",
                "常駐プロセスや Docker 等で既に稼働している場合は、プロセス起動なしで HTTP/SSE エンドポイント URL とトークンを設定するだけで接続できます。",
                "Läuft der MCP-Server bereits eigenständig (Daemon/Docker), einfach die HTTP/SSE-URL samt Token verbinden – kein Prozessstart nötig.",
              )}
            </p>
          </div>
        </div>
      </div>

      {/* China Network Mirrors + Lifecycle */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-theme-card rounded-2xl border border-theme-subtle p-5 sm:p-6 space-y-3">
          <h3 className="text-sm font-semibold text-theme-primary flex items-center gap-2">
            <Globe className="w-4 h-4 text-theme-secondary" />
            {tText(
              "网络镜像加速（uv / npm 下载慢或超时）",
              "Regional Mirror Acceleration (uv / npm)",
              "ミラー高速化設定（uv / npm タイムアウト対策）",
              "Mirror-Beschleunigung (uv / npm)",
            )}
          </h3>
          <p className="text-xs text-theme-secondary leading-relaxed">
            {tText(
              "首次拉取 Python 依赖、Playwright 浏览器或 npm 包较慢时，可配置国内镜像源后再安装或启动：",
              "If initial Python/uv or npm downloads are slow or time out, configure a fast mirror:",
              "uv や npm の初回ダウンロードが遅い・失敗する場合は以下のミラーを設定してください：",
              "Bei langsamen uv-/npm-Downloads folgenden Mirror setzen:",
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
            cmd="npm.cmd install -g <package-name>@<version> --registry=https://registry.npmmirror.com"
          />
        </div>

        <div className="bg-theme-card rounded-2xl border border-theme-subtle p-5 sm:p-6 space-y-3">
          <h3 className="text-sm font-semibold text-theme-primary flex items-center gap-2">
            <Terminal className="w-4 h-4 text-theme-secondary" />
            {tText(
              "日志查看、停止与卸载",
              "Logs, Stop & Uninstall",
              "ログ確認・停止・削除",
              "Logs, Stoppen & Entfernen",
            )}
          </h3>
          <ul className="space-y-2.5 text-xs text-theme-secondary">
            <li className="flex items-start gap-2">
              <Terminal className="w-4 h-4 text-theme-secondary shrink-0 mt-0.5" />
              <span>
                <strong className="text-theme-primary">{tText("查看日志：", "View Logs: ", "ログ確認: ", "Logs: ")}</strong>
                {tText(
                  "Start 失败后，点击卡片右侧 `>_` 按钮即可实时查看标准输出与具体报错。",
                  "After a failed Start, click `>_` on the service card to inspect live stdout/stderr.",
                  "Start 失敗時はカード右側の `>_` ボタンでリアルタイムログを確認できます。",
                  "Nach fehlgeschlagenem Start auf `>_` klicken, um stdout/stderr live zu prüfen.",
                )}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-[var(--warning)] shrink-0 mt-0.5" />
              <span>
                <strong className="text-theme-primary">{tText("停止服务：", "Stop Service: ", "停止: ", "Stoppen: ")}</strong>
                {tText(
                  "点击 Stop 按钮可安全终止子进程并释放对应监听端口。",
                  "Click the Stop button to terminate the child process and free its port.",
                  "Stop ボタンで子プロセスを終了しポートを解放します。",
                  "Mit Stop den Kindprozess beenden und den Port freigeben.",
                )}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Trash2 className="w-4 h-4 text-theme-muted shrink-0 mt-0.5" />
              <span>
                <strong className="text-theme-primary">{tText("卸载移除：", "Uninstall: ", "削除: ", "Entfernen: ")}</strong>
                {tText(
                  "点卡片右侧垃圾桶图标从 Nexus 移除；全局 npm 包可执行下方命令卸载。",
                  "Click the Trash icon to remove from Nexus; uninstall global npm packages with the command below.",
                  "ゴミ箱アイコンで Nexus から削除できます。グローバル npm パッケージは下のコマンドで削除できます。",
                  "Über das Papierkorb-Symbol aus Nexus entfernen; globale npm-Pakete per Befehl unten deinstallieren.",
                )}
              </span>
            </li>
          </ul>
          <CopyCmdBlock
            id="tpl-uninstall"
            cmd="npm.cmd uninstall -g <package-name>"
          />
        </div>
      </div>

      {/* Universal Troubleshooting FAQ */}
      <div className="bg-theme-card rounded-2xl border border-theme-subtle p-5 sm:p-6 space-y-3">
        <h3 className="text-sm font-semibold text-theme-primary flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-[var(--warning)]" />
          {tText(
            "通用报错速查",
            "Common Error Quick Reference",
            "よくあるエラー早見表",
            "Häufige Fehler & Lösungen",
          )}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-theme-base border border-theme-subtle space-y-1">
            <div className="font-mono font-semibold text-[var(--warning)]">
              △ npm.ps1 / npx.ps1 cannot be loaded
            </div>
            <p className="text-theme-secondary">
              {tText(
                "Windows PowerShell 默认禁止执行 .ps1 脚本，请统一改用 `npm.cmd` 或 `npx.cmd`。",
                "Windows PowerShell blocks .ps1 scripts by default. Use `npm.cmd` or `npx.cmd` instead.",
                "PowerShell で .ps1 がブロックされる場合は `npm.cmd` / `npx.cmd` を使用してください。",
                "PowerShell blockiert .ps1-Skripte. Verwenden Sie `npm.cmd` oder `npx.cmd`.",
              )}
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-theme-base border border-theme-subtle space-y-1">
            <div className="font-mono font-semibold text-[var(--warning)]">
              △ spawn ... ENOENT
            </div>
            <p className="text-theme-secondary">
              {tText(
                "系统 PATH 找不到命令或全局包未安装。先点击上方「运行环境检测」确认运行时就绪。",
                "Executable missing from PATH or package not installed. Run Environment Check above first.",
                "PATH にコマンドが見つからないか未導入です。上の環境診断で確認してください。",
                "Befehl nicht im PATH oder Paket fehlt. Zuerst oben die Umgebungsprüfung ausführen.",
              )}
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-theme-base border border-theme-subtle space-y-1">
            <div className="font-mono font-semibold text-[var(--warning)]">
              △ 0 Tools {tText("（启动后工具数为 0）", "(0 tools after Start)", "(起動後にツール数 0)", "(0 Tools nach Start)")}
            </div>
            <p className="text-theme-secondary">
              {tText(
                "多为宿主软件/桥接监听未开启、或初始化报错。请确认宿主端已就绪并查看 `>_` 日志。",
                "Usually means the host app/listener is not open or initialization failed. Inspect `>_` Logs.",
                "ホストアプリやリスナーが未起動の可能性があります。`>_` ログを確認してください。",
                "Meist ist die Host-App/Bridge nicht gestartet. Prüfen Sie `>_` Logs.",
              )}
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-theme-base border border-theme-subtle space-y-1">
            <div className="font-mono font-semibold text-[var(--warning)]">
              △ EADDRINUSE / {tText("端口冲突", "Port conflict", "ポート競合", "Portkonflikt")}
            </div>
            <p className="text-theme-secondary">
              {tText(
                "旧进程仍在后台监听。用上方「环境检测」查看占用 PID，结束残留进程后再 Start。",
                "A stale process is holding the port. Check the owning PID in Environment Check above and stop it.",
                "古いプロセスがポートを占有しています。上の環境診断で PID を確認して終了してください。",
                "Ein alter Prozess belegt den Port. PID oben in der Umgebungsprüfung nachsehen und beenden.",
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
