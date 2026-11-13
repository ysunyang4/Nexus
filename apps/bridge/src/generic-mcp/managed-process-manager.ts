/**
 * Nexus Generic MCP — Managed Process & Service Supervisor
 * 
 * Provides native, zero-flicker process lifecycle management for local MCP servers (e.g. Blender MCP, custom python/node tools).
 * Features:
 * 1. Zero Console Window Flashes: Uses Windows CREATE_NO_WINDOW & hidden pipes.
 * 2. Embedded Real-time Logs: Captures stdout/stderr into ring buffer for UI display.
 * 3. Visual API & Env Configuration: Manages API Keys (Hunyuan3D, Hyper3D, Sketchfab) and ports without touching system env.
 * 4. Graceful Cleanup: Process tree termination on Windows (taskkill /T /F) ensures ports are immediately freed.
 * 5. Native Pure-Stream Stdio Gateway: Directly converts any Stdio tool into clean Streamable-HTTP without supergateway.
 */

import child_process from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { ProviderRuntime } from "./provider-runtime.js";
import { NativeStdioGateway } from "./native-stdio-gateway.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ManagedMcpConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  rawCommand?: string;
  port: number;
  endpoint: string;
  autoStart?: boolean;
  env?: Record<string, string>;
  apiKeys?: {
    hunyuanSecretId?: string;
    hunyuanSecretKey?: string;
    hunyuanApiUrl?: string;
    hyper3dApiKey?: string;
    sketchfabApiKey?: string;
    polyPizzaApiKey?: string;
    blenderPort?: number;
  };
}

export interface ManagedMcpState {
  config: ManagedMcpConfig;
  status: "STOPPED" | "STARTING" | "RUNNING" | "ERROR";
  pid?: number;
  startedAt?: number;
  lastError?: string;
  logs: string[];
  toolCount: number;
}

export const PRESET_TOOL_COUNTS: Record<string, number> = {
  "blender-mcp": 9,
  "photoshop-mcp": 127,
  "windows-mcp": 20,
  "autocad": 24,
  "crawl4ai": 3,
  "wikipedia-mcp": 4,
  "playwright": 6,
  "agentic-tools-mcp": 6,
  "code-reasoning": 5,
  "cloudflare-observability": 5,
  "maya": 4,
  "telegram-mcp": 136,
};

export function parseCommandLineTokens(cmdStr: string): { command: string; args: string[] } {
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";

  for (let i = 0; i < cmdStr.length; i++) {
    const c = cmdStr[i];
    if (inQuotes) {
      if (c === quoteChar) {
        inQuotes = false;
      } else {
        current += c;
      }
    } else {
      if (c === '"' || c === "'") {
        inQuotes = true;
        quoteChar = c;
      } else if (/\s/.test(c)) {
        if (current.length > 0) {
          tokens.push(current);
          current = "";
        }
      } else {
        current += c;
      }
    }
  }
  if (current.length > 0) {
    tokens.push(current);
  }

  if (tokens.length === 0) {
    return { command: "", args: [] };
  }
  return {
    command: tokens[0],
    args: tokens.slice(1),
  };
}

export function isDirectHttpService(config: ManagedMcpConfig): boolean {
  if (config.id === "blender-mcp" || config.id === "windows-mcp" || config.id === "autocad" || config.id === "telegram-mcp") {
    return true;
  }
  if (["crawl4ai", "wikipedia-mcp", "playwright", "agentic-tools-mcp", "code-reasoning", "cloudflare-observability"].includes(config.id)) {
    return true;
  }
  const cmdStr = (config.rawCommand || config.command + " " + (config.args || []).join(" ")).toLowerCase();
  if (cmdStr.includes("streamable-http") || cmdStr.includes("--transport streamable-http") || cmdStr.includes("--transport http")) {
    return true;
  }
  return false;
}

export function unwrapSupergateway(config: ManagedMcpConfig): { command: string; args: string[] } {
  let cmd = config.command;
  let args = [...(config.args || [])];
  const raw = config.rawCommand || (cmd + " " + args.join(" "));

  if (raw.includes("supergateway")) {
    const stdioIdx = args.indexOf("--stdio");
    if (stdioIdx !== -1 && stdioIdx + 1 < args.length) {
      const targetCmdStr = args.slice(stdioIdx + 1).join(" ").replace(/^"|"$/g, "");
      const parsed = parseCommandLineTokens(targetCmdStr);
      return { command: parsed.command || targetCmdStr, args: parsed.args };
    }
    const match = raw.match(/--stdio\s+["']?([^"']+)["']?/);
    if (match && match[1]) {
      const parsed = parseCommandLineTokens(match[1]);
      return { command: parsed.command || match[1], args: parsed.args };
    }
  }

  return { command: cmd, args };
}

export class ManagedProcessManager {
  private static instance: ManagedProcessManager | null = null;
  private services: Map<string, ManagedMcpState> = new Map();
  private childProcesses: Map<string, child_process.ChildProcess> = new Map();
  private gateways: Map<string, NativeStdioGateway> = new Map();
  private configFilePath: string;
  private nexusDataDir: string;

  private constructor() {
    const localAppData =
      process.env.LOCALAPPDATA ||
      (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Local") : "C:\\AppData\\Local");
    const nexusDataDir = path.join(localAppData, "Nexus");
    if (!fs.existsSync(nexusDataDir)) {
      try { fs.mkdirSync(nexusDataDir, { recursive: true }); } catch {}
    }
    this.nexusDataDir = nexusDataDir;
    this.configFilePath = path.join(nexusDataDir, "managed-mcp-services.json");

    this.deployServerScripts();
    this.initDefaultPresets();
    this.loadPersistedConfigs();
  }

  private deployServerScripts(): void {
    const targetDir = path.join(this.nexusDataDir, "servers");
    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
    } catch {}

    const candidateDirs = [
      path.resolve(__dirname, "servers"),
      path.resolve(__dirname, "../src/generic-mcp/servers"),
      path.resolve(process.cwd(), "apps/bridge/src/generic-mcp/servers"),
      path.resolve(process.cwd(), "resources/bridge/servers"),
      path.resolve(process.cwd(), "apps/desktop/src-tauri/resources/bridge/servers"),
      path.resolve(__dirname, "../../desktop/src-tauri/resources/bridge/servers"),
    ];

    const scriptFiles = [
      "crawl4ai_server.py",
      "wikipedia_server.py",
      "playwright_server.py",
      "agentic_tools_server.py",
      "code_reasoning_server.py",
      "cloudflare_server.py",
    ];

    for (const file of scriptFiles) {
      const dest = path.join(targetDir, file);
      for (const dir of candidateDirs) {
        const src = path.join(dir, file);
        if (fs.existsSync(src)) {
          try {
            fs.copyFileSync(src, dest);
            break;
          } catch {}
        }
      }
    }
  }

  private getServerScriptPath(fileName: string): string {
    const deployed = path.join(this.nexusDataDir, "servers", fileName);
    if (fs.existsSync(deployed)) {
      return deployed;
    }
    const candidateDirs = [
      path.resolve(__dirname, "servers"),
      path.resolve(__dirname, "../src/generic-mcp/servers"),
      path.resolve(process.cwd(), "apps/bridge/src/generic-mcp/servers"),
      path.resolve(process.cwd(), "resources/bridge/servers"),
      path.resolve(process.cwd(), "apps/desktop/src-tauri/resources/bridge/servers"),
    ];
    for (const dir of candidateDirs) {
      const src = path.join(dir, fileName);
      if (fs.existsSync(src)) return src;
    }
    return deployed;
  }

  private repairServiceConfig(config: ManagedMcpConfig): ManagedMcpConfig {
    const isWindows = process.platform === "win32";
    const crawlPath = this.getServerScriptPath("crawl4ai_server.py");
    const wikiPath = this.getServerScriptPath("wikipedia_server.py");
    const playwrightPath = this.getServerScriptPath("playwright_server.py");
    const agenticPath = this.getServerScriptPath("agentic_tools_server.py");
    const reasoningPath = this.getServerScriptPath("code_reasoning_server.py");
    const cfPath = this.getServerScriptPath("cloudflare_server.py");

    switch (config.id) {
      case "blender-mcp":
        config.name = "Blender 3D Automation";
        config.command = "uv";
        config.args = [
          "run",
          "--with",
          "mcp-for-blender",
          "python",
          "-c",
          "import os; os.environ['BLENDER_PORT']=os.environ.get('BLENDER_PORT', '9876'); from blender_mcp.server import mcp; mcp.settings.host='127.0.0.1'; mcp.settings.port=int(os.environ.get('MCP_PORT', '9099')); mcp.run(transport='streamable-http')",
        ];
        config.rawCommand = 'uv run --with mcp-for-blender python -c "import os; os.environ[\'BLENDER_PORT\']=os.environ.get(\'BLENDER_PORT\', \'9876\'); from blender_mcp.server import mcp; mcp.settings.host=\'127.0.0.1\'; mcp.settings.port=int(os.environ.get(\'MCP_PORT\', \'9099\')); mcp.run(transport=\'streamable-http\')"';
        config.port = 9099;
        config.endpoint = "http://127.0.0.1:9099/mcp";
        break;

      case "photoshop-mcp":
        config.name = "Photoshop 自动化 MCP";
        config.command = isWindows ? "photoshop-mcp.cmd" : "photoshop-mcp";
        config.args = [];
        config.rawCommand = isWindows ? "photoshop-mcp.cmd" : "photoshop-mcp";
        config.port = 9095;
        config.endpoint = "http://127.0.0.1:9095/mcp";
        break;

      case "windows-mcp":
        config.name = "Windows-MCP";
        config.command = "uv";
        config.args = [
          "run",
          "--with",
          "windows-mcp",
          "python",
          "-m",
          "windows_mcp",
          "serve",
          "--transport",
          "streamable-http",
          "--host",
          "127.0.0.1",
          "--port",
          "9105",
          "--allow-insecure-remote",
          "--stateless-http"
        ];
        config.rawCommand = "uv run --with windows-mcp python -m windows_mcp serve --transport streamable-http --host 127.0.0.1 --port 9105 --allow-insecure-remote --stateless-http";
        config.port = 9105;
        config.endpoint = "http://127.0.0.1:9105/mcp";
        break;

      case "autocad":
        config.name = "Autocad";
        config.command = "uv";
        config.args = [
          "run",
          "--with",
          "mcp>=1.26.0",
          "--with",
          "autocad-mcp",
          "python",
          "-c",
          "from autocad_mcp.server import mcp; mcp.settings.host='127.0.0.1'; mcp.settings.port=9107; mcp.run(transport='streamable-http')"
        ];
        config.rawCommand = 'uv run --with mcp>=1.26.0 --with autocad-mcp python -c "from autocad_mcp.server import mcp; mcp.settings.host=\'127.0.0.1\'; mcp.settings.port=9107; mcp.run(transport=\'streamable-http\')"';
        config.port = 9107;
        config.endpoint = "http://127.0.0.1:9107/mcp";
        break;

      case "playwright":
        config.name = "Playwright";
        config.command = "uv";
        config.args = ["run", "--with", "mcp<2,>=1.26.0", "python", playwrightPath];
        config.rawCommand = `uv run --with "mcp<2,>=1.26.0" python "${playwrightPath}"`;
        config.port = 9100;
        config.endpoint = "http://127.0.0.1:9100/mcp";
        break;

      case "agentic-tools-mcp":
        config.name = "Agentic-tools-mcp";
        config.command = "uv";
        config.args = ["run", "--with", "mcp<2,>=1.26.0", "python", agenticPath];
        config.rawCommand = `uv run --with "mcp<2,>=1.26.0" python "${agenticPath}"`;
        config.port = 9103;
        config.endpoint = "http://127.0.0.1:9103/mcp";
        break;

      case "code-reasoning":
        config.name = "Code-reasoning";
        config.command = "uv";
        config.args = ["run", "--with", "mcp<2,>=1.26.0", "python", reasoningPath];
        config.rawCommand = `uv run --with "mcp<2,>=1.26.0" python "${reasoningPath}"`;
        config.port = 9104;
        config.endpoint = "http://127.0.0.1:9104/mcp";
        break;

      case "wikipedia-mcp":
        config.name = "Wikipedia-mcp";
        config.command = "uv";
        config.args = ["run", "--with", "mcp<2,>=1.26.0", "python", wikiPath];
        config.rawCommand = `uv run --with "mcp<2,>=1.26.0" python "${wikiPath}"`;
        config.port = 9108;
        config.endpoint = "http://127.0.0.1:9108/mcp";
        break;

      case "cloudflare-observability":
        config.name = "Cloudflare-observability";
        config.command = "uv";
        config.args = ["run", "--with", "mcp<2,>=1.26.0", "python", cfPath];
        config.rawCommand = `uv run --with "mcp<2,>=1.26.0" python "${cfPath}"`;
        config.port = 9109;
        config.endpoint = "http://127.0.0.1:9109/mcp";
        break;

      case "crawl4ai":
        config.name = "Crawl4ai 极速提纯";
        config.command = "uv";
        config.args = ["run", "--with", "mcp<2,>=1.26.0", "python", crawlPath];
        config.rawCommand = `uv run --with "mcp<2,>=1.26.0" python "${crawlPath}"`;
        config.port = 9111;
        config.endpoint = "http://127.0.0.1:9111/mcp";
        break;

      case "maya":
        config.name = "Maya";
        config.command = "uv";
        config.args = ["run", "--with", "maya-mcp-server", "maya-mcp-server"];
        config.rawCommand = 'uv run --with "maya-mcp-server" maya-mcp-server';
        config.port = 9112;
        config.endpoint = "http://127.0.0.1:9112/mcp";
        break;

      case "telegram-mcp": {
        const tgDir = path.join(this.nexusDataDir, "servers", "telegram-mcp");
        const pythonExe = path.join(tgDir, ".venv", "Scripts", "python.exe");
        config.name = "Telegram 全能管理 (Telethon)";
        const mainPy = path.join(tgDir, "main.py");
        if (fs.existsSync(pythonExe)) {
          config.command = pythonExe;
          config.args = [mainPy, "--transport", "http", "--port", "9119", "--host", "127.0.0.1"];
        } else {
          config.command = "uv";
          config.args = ["--directory", tgDir, "run", mainPy, "--transport", "http", "--port", "9119", "--host", "127.0.0.1"];
        }
        config.rawCommand = `${config.command} ${config.args.join(" ")}`;
        config.port = 9119;
        config.endpoint = "http://127.0.0.1:9119/mcp";
        break;
      }
      
      default:
        // For custom services: unwrap supergateway if present
        if (config.rawCommand?.includes("supergateway") || (config.args && config.args.includes("supergateway"))) {
          const unwrapped = unwrapSupergateway(config);
          config.command = unwrapped.command;
          config.args = unwrapped.args;
          config.rawCommand = `${unwrapped.command} ${unwrapped.args.join(" ")}`.trim();
        }
        break;
    }
    return config;
  }

  public static getInstance(): ManagedProcessManager {
    if (!ManagedProcessManager.instance) {
      ManagedProcessManager.instance = new ManagedProcessManager();
    }
    return ManagedProcessManager.instance;
  }

  private initDefaultPresets(): void {
    const rawIds = [
      "blender-mcp",
      "photoshop-mcp",
      "windows-mcp",
      "autocad",
      "playwright",
      "agentic-tools-mcp",
      "code-reasoning",
      "wikipedia-mcp",
      "cloudflare-observability",
      "crawl4ai",
      "maya",
      "telegram-mcp",
    ];

    for (const id of rawIds) {
      const initialConfig: ManagedMcpConfig = {
        id,
        name: id,
        command: "uv",
        args: [],
        port: 9000,
        endpoint: "",
        autoStart: false,
        apiKeys: id === "blender-mcp" ? {
          blenderPort: 9876,
          hunyuanSecretId: "",
          hunyuanSecretKey: "",
          hunyuanApiUrl: "",
          hyper3dApiKey: "",
          sketchfabApiKey: "",
          polyPizzaApiKey: "",
        } : {},
        env: {},
      };
      const repaired = this.repairServiceConfig(initialConfig);
      if (!this.services.has(repaired.id)) {
        this.services.set(repaired.id, {
          config: repaired,
          status: "STOPPED",
          logs: [],
          toolCount: PRESET_TOOL_COUNTS[repaired.id] || 0,
        });
      }
    }
  }

  private loadPersistedConfigs(): void {
    try {
      if (fs.existsSync(this.configFilePath)) {
        const raw = fs.readFileSync(this.configFilePath, "utf8");
        const list: ManagedMcpConfig[] = JSON.parse(raw);
        for (let item of list) {
          item = this.repairServiceConfig(item);
          const existing = this.services.get(item.id);
          if (existing) {
            existing.config = item;
            if (!existing.toolCount || existing.toolCount === 0) {
              existing.toolCount = PRESET_TOOL_COUNTS[item.id] || 0;
            }
          } else {
            this.services.set(item.id, {
              config: item,
              status: "STOPPED",
              logs: [],
              toolCount: PRESET_TOOL_COUNTS[item.id] || 0,
            });
          }
        }
      }
    } catch (err) {
      console.warn("[ManagedProcessManager] Error loading persisted configs:", err);
    }
  }

  private persistConfigs(): void {
    try {
      const list = Array.from(this.services.values()).map((s) => s.config);
      fs.writeFileSync(this.configFilePath, JSON.stringify(list, null, 2), "utf8");
    } catch (err) {
      console.warn("[ManagedProcessManager] Error saving configs:", err);
    }
  }

  public listServices(): ManagedMcpState[] {
    const runtime = ProviderRuntime.getInstance();
    return Array.from(this.services.values()).map((s) => {
      const prov = runtime.getProvider(s.config.id);
      const dynamicCount = prov?.toolCount || 0;
      const finalCount = dynamicCount > 0 ? dynamicCount : (s.toolCount || PRESET_TOOL_COUNTS[s.config.id] || 0);
      if (s.status === "RUNNING" && (!s.toolCount || s.toolCount === 0)) {
        this.registerToRuntime(s).catch(() => {});
      }
      return {
        ...s,
        toolCount: finalCount,
      };
    });
  }

  public getService(id: string): ManagedMcpState | null {
    return this.services.get(id) || null;
  }

  public async startService(id: string): Promise<{ success: boolean; error?: string }> {
    const service = this.services.get(id);
    if (!service) {
      return { success: false, error: `Service '${id}' not found` };
    }

    if (service.status === "RUNNING" || service.status === "STARTING") {
      return { success: true };
    }

    // Ensure port is free before starting on Windows
    if (process.platform === "win32") {
      try {
        const netstatOut = child_process.execSync(`netstat -ano | findstr :${service.config.port}`, { encoding: "utf8" });
        const lines = netstatOut.split(/\r?\n/).filter((l) => l.includes("LISTENING"));
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pidStr = parts[parts.length - 1];
          const killPid = parseInt(pidStr, 10);
          if (killPid && killPid !== process.pid) {
            child_process.execSync(`taskkill /pid ${killPid} /T /F`, { stdio: "ignore" });
          }
        }
        await new Promise((r) => setTimeout(r, 400));
      } catch {}
    }

    service.status = "STARTING";
    service.lastError = undefined;

    // Ensure bundled Node runtime directory and uv engine are available in PATH
    const nodeDir = path.dirname(process.execPath);
    const uvCandidateDirs = [
      nodeDir,
      path.resolve(process.cwd(), "resources/runtime"),
      path.resolve(process.cwd(), "apps/desktop/src-tauri/resources/runtime"),
      path.resolve(__dirname, "../../desktop/src-tauri/resources/runtime"),
      path.resolve(__dirname, "../resources/runtime"),
      path.resolve(__dirname, "../../../resources/runtime"),
      path.resolve(nodeDir, "../runtime"),
      path.join(process.env.LOCALAPPDATA || "", "uv"),
      path.join(process.env.USERPROFILE || "", ".cargo", "bin"),
      path.join(process.env.USERPROFILE || "", ".local", "bin"),
    ];
    let resolvedPath = process.env.PATH || process.env.Path || "";
    for (const d of [nodeDir, ...uvCandidateDirs]) {
      if (d && fs.existsSync(d) && !resolvedPath.includes(d)) {
        resolvedPath = `${d}${path.delimiter}${resolvedPath}`;
      }
    }

    // Prepare injected environment variables
    const injectedEnv: Record<string, string> = {
      ...process.env as any,
      PATH: resolvedPath,
      Path: resolvedPath,
      MCP_PORT: String(service.config.port),
      BLENDER_PORT: String(service.config.apiKeys?.blenderPort || 9876),
      PYTHONWARNINGS: "ignore",
      PYTHONUNBUFFERED: "1",
      FASTMCP_SHOW_CLI_BANNER: "false",
      FASTMCP_CHECK_FOR_UPDATES: "off",
      ...(service.config.env || {}),
    };

    if (service.config.apiKeys?.hunyuanSecretId) {
      injectedEnv.HUNYUAN_SECRET_ID = service.config.apiKeys.hunyuanSecretId;
      injectedEnv.TENCENTCLOUD_SECRET_ID = service.config.apiKeys.hunyuanSecretId;
    }
    if (service.config.apiKeys?.hunyuanSecretKey) {
      injectedEnv.HUNYUAN_SECRET_KEY = service.config.apiKeys.hunyuanSecretKey;
      injectedEnv.TENCENTCLOUD_SECRET_KEY = service.config.apiKeys.hunyuanSecretKey;
    }
    if (service.config.apiKeys?.hyper3dApiKey) {
      injectedEnv.HYPER3D_API_KEY = service.config.apiKeys.hyper3dApiKey;
    }
    if (service.config.apiKeys?.sketchfabApiKey) {
      injectedEnv.SKETCHFAB_API_KEY = service.config.apiKeys.sketchfabApiKey;
    }
    if (service.config.apiKeys?.polyPizzaApiKey) {
      injectedEnv.POLYPIZZA_API_KEY = service.config.apiKeys.polyPizzaApiKey;
    }

    try {
      // 1. If service is a Stdio MCP server (custom service, photoshop, maya, etc.), run via Native Pure-Stream Gateway
      if (!isDirectHttpService(service.config)) {
        const unwrapped = unwrapSupergateway(service.config);
        this.appendLog(id, `[Nexus] Launching via Native Pure-Stream Gateway on port ${service.config.port}...`);
        
        const gw = new NativeStdioGateway({
          serviceId: id,
          command: unwrapped.command,
          args: unwrapped.args,
          port: service.config.port,
          env: injectedEnv,
          onLog: (line) => this.appendLog(id, line),
          onExit: (code) => {
            service.status = "STOPPED";
            service.pid = undefined;
            gw.close().catch(() => {});
            this.gateways.delete(id);
            this.appendLog(id, `[Nexus] Service stopped (exit code: ${code})`);
          },
          onError: (err) => {
            service.status = "ERROR";
            service.lastError = err.message;
            this.appendLog(id, `[Nexus] Gateway error: ${err.message}`);
          },
        });

        this.gateways.set(id, gw);
        await gw.start();

        service.pid = gw.pid;
        service.startedAt = Date.now();
        service.status = "RUNNING";
        this.appendLog(id, `[Nexus] Service is READY and listening on port ${service.config.port}`);

        await this.registerToRuntime(service);
        return { success: true };
      }

      // 2. Direct HTTP server services (Blender FastMCP, Windows-MCP, AutoCAD FastMCP, Python Micro-servers)
      let execCmd = service.config.command;
      let execArgs = (service.config.args && service.config.args.length > 0) ? [...service.config.args] : [];
      const isWindows = process.platform === "win32";

      if (execArgs.length === 0 && service.config.rawCommand && service.config.rawCommand.trim()) {
        const parsed = parseCommandLineTokens(service.config.rawCommand.trim());
        if (parsed.command) {
          execCmd = parsed.command;
          execArgs = parsed.args;
        }
      }

      if (execCmd === "uv" || execCmd === "uv.exe") {
        for (const dir of uvCandidateDirs) {
          if (dir) {
            const uvExe = path.join(dir, isWindows ? "uv.exe" : "uv");
            if (fs.existsSync(uvExe)) {
              execCmd = uvExe;
              break;
            }
          }
        }
      }

      const serviceCwd = service.config.id === "telegram-mcp"
        ? path.join(this.nexusDataDir, "servers", "telegram-mcp")
        : undefined;

      let child: child_process.ChildProcess;

      if (execArgs.length > 0) {
        const isScriptOrCmd = isWindows && (
          execCmd.endsWith(".cmd") ||
          execCmd.endsWith(".bat") ||
          execCmd.toLowerCase() === "npx" ||
          execCmd.toLowerCase() === "npm" ||
          execCmd.toLowerCase() === "pnpm" ||
          execCmd.toLowerCase() === "yarn"
        );
        child = child_process.spawn(execCmd, execArgs, {
          cwd: serviceCwd,
          env: injectedEnv,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
          shell: isScriptOrCmd,
        });
      } else if (service.config.rawCommand && service.config.rawCommand.trim()) {
        let cmd = service.config.rawCommand.trim();
        child = child_process.spawn(cmd, [], {
          cwd: serviceCwd,
          env: injectedEnv,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
          shell: true,
        });
      } else {
        child = child_process.spawn(execCmd, [], {
          cwd: serviceCwd,
          env: injectedEnv,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
          shell: false,
        });
      }

      service.pid = child.pid;
      service.startedAt = Date.now();
      this.childProcesses.set(id, child);

      child.stdout?.on("data", (chunk: Buffer) => {
        this.appendLog(id, chunk.toString("utf8"));
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        this.appendLog(id, chunk.toString("utf8"));
      });

      child.on("exit", (code) => {
        service.status = "STOPPED";
        service.pid = undefined;
        this.childProcesses.delete(id);
        this.appendLog(id, `[Nexus] Service stopped (exit code: ${code})`);
      });

      child.on("error", (err) => {
        service.status = "ERROR";
        service.lastError = err.message;
        this.appendLog(id, `[Nexus] Service process error: ${err.message}`);
      });

      const initialReady = await this.waitForPort(service.config.port, 5, 400);
      if (initialReady) {
        service.status = "RUNNING";
        this.appendLog(id, `[Nexus] Service is READY and listening on port ${service.config.port}`);
        await this.registerToRuntime(service);
        return { success: true };
      }

      service.status = "STARTING";
      this.monitorPortAsync(service);
      return { success: true };
    } catch (err: any) {
      service.status = "ERROR";
      service.lastError = err.message || String(err);
      this.appendLog(id, `[Nexus] Failed to start service: ${service.lastError}`);
      return { success: false, error: service.lastError };
    }
  }

  private async registerToRuntime(service: ManagedMcpState): Promise<void> {
    const runtime = ProviderRuntime.getInstance();
    try {
      const res = await runtime.registerProvider({
        providerId: service.config.id,
        displayName: service.config.name,
        endpoint: service.config.endpoint,
        transport: "streamableHttp",
        authentication: { type: "none" },
        policy: {
          defaultPermission: "L2",
          maxConsecutiveFailures: 3,
          timeoutMs: 15000,
          allowLocalLoopback: true,
        },
        enabled: true,
      });
      if (res && res.toolCount > 0) {
        service.toolCount = res.toolCount;
      } else if (!service.toolCount) {
        service.toolCount = PRESET_TOOL_COUNTS[service.config.id] || 0;
      }
      this.appendLog(service.config.id, `[Nexus] Registered to catalog successfully (${service.toolCount} tools ready)`);
    } catch (err: any) {
      if (!service.toolCount) {
        service.toolCount = PRESET_TOOL_COUNTS[service.config.id] || 0;
      }
      this.appendLog(service.config.id, `[Nexus] Catalog enrollment note: ${err.message}`);
    }
  }

  private monitorPortAsync(service: ManagedMcpState): void {
    const id = service.config.id;
    let attempts = 0;
    const maxAttempts = 90;
    const timer = setInterval(async () => {
      attempts++;
      if (service.status !== "STARTING") {
        clearInterval(timer);
        return;
      }
      const ready = await this.waitForPort(service.config.port, 1, 300);
      if (ready) {
        clearInterval(timer);
        service.status = "RUNNING";
        this.appendLog(id, `[Nexus] Service is READY and listening on port ${service.config.port}`);
        await this.registerToRuntime(service);
      } else if (attempts >= maxAttempts) {
        clearInterval(timer);
        if (service.status === "STARTING") {
          service.status = "ERROR";
          service.lastError = "Port check timed out (45s)";
          this.appendLog(id, `[Nexus] Timed out waiting for ${service.config.endpoint}`);
        }
      }
    }, 500);
  }

  public async stopService(id: string): Promise<{ success: boolean; error?: string }> {
    const service = this.services.get(id);
    if (!service) {
      return { success: false, error: `Service '${id}' not found` };
    }

    // 1. If managed by NativeStdioGateway, shut it down
    if (this.gateways.has(id)) {
      const gw = this.gateways.get(id)!;
      await gw.close();
      this.gateways.delete(id);
    }

    // 2. Kill standalone child process if any
    const child = this.childProcesses.get(id);
    const pid = service.pid || child?.pid;

    if (pid) {
      this.appendLog(id, `[Nexus] Terminating process tree for PID ${pid}...`);
      try {
        if (process.platform === "win32") {
          child_process.execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
        } else {
          child?.kill("SIGKILL");
        }
      } catch {}
    }

    // 3. Ensure port is completely free on Windows
    if (process.platform === "win32") {
      try {
        const netstatOut = child_process.execSync(`netstat -ano | findstr :${service.config.port}`, { encoding: "utf8" });
        const lines = netstatOut.split(/\r?\n/).filter((l) => l.includes("LISTENING"));
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pidStr = parts[parts.length - 1];
          const killPidNum = parseInt(pidStr, 10);
          if (killPidNum && killPidNum !== process.pid) {
            child_process.execSync(`taskkill /pid ${killPidNum} /T /F`, { stdio: "ignore" });
          }
        }
      } catch {}
    }

    service.status = "STOPPED";
    service.pid = undefined;
    this.childProcesses.delete(id);
    this.appendLog(id, `[Nexus] Service '${service.config.name}' is STOPPED.`);

    try {
      const runtime = ProviderRuntime.getInstance();
      runtime.removeProvider(id);
    } catch {}

    return { success: true };
  }

  public async restartService(id: string): Promise<{ success: boolean; error?: string }> {
    await this.stopService(id);
    await new Promise((r) => setTimeout(r, 800));
    return await this.startService(id);
  }

  public updateConfig(id: string, updates: Partial<ManagedMcpConfig>): { success: boolean; error?: string } {
    const service = this.services.get(id);
    if (!service) {
      return { success: false, error: `Service '${id}' not found` };
    }

    service.config = {
      ...service.config,
      ...updates,
      apiKeys: {
        ...(service.config.apiKeys || {}),
        ...(updates.apiKeys || {}),
      },
    };

    if (updates.rawCommand !== undefined) {
      service.config.rawCommand = updates.rawCommand.trim();
    }
    if (updates.command !== undefined) {
      service.config.command = updates.command;
    }
    if (updates.args !== undefined) {
      service.config.args = updates.args;
    }
    if (updates.port !== undefined) {
      service.config.port = Number(updates.port);
      service.config.endpoint = `http://127.0.0.1:${updates.port}/mcp`;
    }

    this.persistConfigs();
    this.appendLog(id, `[Nexus] Configuration updated.`);
    return { success: true };
  }

  public createCustomService(config: ManagedMcpConfig): { success: boolean; error?: string } {
    if (!config.id || (!config.command && !config.rawCommand)) {
      return { success: false, error: "Service ID and command are required" };
    }

    const cleanId = config.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (this.services.has(cleanId)) {
      return { success: false, error: `Service with ID '${cleanId}' already exists` };
    }

    config.id = cleanId;
    config.port = config.port || 9112;
    config.endpoint = config.endpoint || `http://127.0.0.1:${config.port}/mcp`;
    if (config.rawCommand) {
      config.rawCommand = config.rawCommand.trim();
    }

    this.services.set(cleanId, {
      config,
      status: "STOPPED",
      logs: [`[Nexus] Custom service '${config.name}' created. Ready to launch.`],
      toolCount: PRESET_TOOL_COUNTS[cleanId] || 0,
    });

    this.persistConfigs();
    return { success: true };
  }

  public deleteCustomService(id: string): { success: boolean; error?: string } {
    if (id === "blender-mcp") {
      return { success: false, error: "Cannot delete built-in preset service" };
    }
    this.stopService(id);
    this.services.delete(id);
    this.persistConfigs();
    return { success: true };
  }

  public getLogs(id: string, tail: number = 100): string[] {
    const s = this.services.get(id);
    if (!s) return [];
    return s.logs.slice(-tail);
  }

  public clearLogs(id: string): void {
    const s = this.services.get(id);
    if (s) {
      s.logs = [];
    }
  }

  private appendLog(id: string, text: string): void {
    const s = this.services.get(id);
    if (!s) return;

    const lines = text.split(/\r?\n/).filter(Boolean);
    const timestamp = new Date().toLocaleTimeString();
    for (const l of lines) {
      s.logs.push(`[${timestamp}] ${l}`);
    }

    if (s.logs.length > 400) {
      s.logs = s.logs.slice(-400);
    }
  }

  private async waitForPort(port: number, maxAttempts: number, intervalMs: number): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      const isUp = await new Promise<boolean>((resolve) => {
        const sock = new net.Socket();
        sock.setTimeout(Math.max(intervalMs - 50, 100));
        sock.on("connect", () => {
          sock.destroy();
          resolve(true);
        });
        sock.on("error", () => {
          sock.destroy();
          resolve(false);
        });
        sock.on("timeout", () => {
          sock.destroy();
          resolve(false);
        });
        sock.connect(port, "127.0.0.1");
      });
      if (isUp) return true;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return false;
  }
}
