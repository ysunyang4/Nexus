/**
 * Nexus Generic MCP — Smart Auto-Installer for GitHub & Package Names
 * 
 * Supports 1-click automatic sandbox installation & zero-command deployment:
 * 1. GitHub Repositories: e.g. "https://github.com/owner/maya-mcp-server" (via bundled uv git resolver)
 * 2. PyPI / Python MCPs: e.g. "maya-mcp-server", "mcp-server-git"
 * 3. npm / Node MCPs: e.g. "@modelcontextprotocol/server-filesystem"
 * 
 * Automatically allocates ports, configures clean execution parameters,
 * runs through Native Pure-Stream Gateway, and verifies discovered tool counts.
 */

import net from "node:net";
import { ManagedProcessManager, type ManagedMcpConfig } from "./managed-process-manager.js";

export interface AutoInstallRequest {
  source: string;
  name?: string;
  port?: number;
}

export interface AutoInstallResult {
  success: boolean;
  serviceId?: string;
  name?: string;
  port?: number;
  toolCount?: number;
  endpoint?: string;
  error?: string;
}

export class SmartInstaller {
  private static instance: SmartInstaller | null = null;

  public static getInstance(): SmartInstaller {
    if (!SmartInstaller.instance) {
      SmartInstaller.instance = new SmartInstaller();
    }
    return SmartInstaller.instance;
  }

  /**
   * Find the next available TCP port on 127.0.0.1
   */
  public async findAvailablePort(startPort = 9112): Promise<number> {
    const mgr = ManagedProcessManager.getInstance();
    const existingPorts = new Set(mgr.listServices().map((s) => s.config.port));

    let candidate = startPort;
    while (candidate < 9200) {
      if (!existingPorts.has(candidate)) {
        const isFree = await new Promise<boolean>((resolve) => {
          const s = new net.Socket();
          s.setTimeout(200);
          s.on("connect", () => {
            s.destroy();
            resolve(false); // port occupied
          });
          s.on("error", () => {
            s.destroy();
            resolve(true); // port free
          });
          s.on("timeout", () => {
            s.destroy();
            resolve(true); // port free
          });
          s.connect(candidate, "127.0.0.1");
        });
        if (isFree) return candidate;
      }
      candidate++;
    }
    return 9112;
  }

  /**
   * Auto-install and deploy an MCP from GitHub URL or package name
   */
  public async installAndDeploy(req: AutoInstallRequest): Promise<AutoInstallResult> {
    const rawSource = req.source.trim();
    if (!rawSource) {
      return { success: false, error: "安装源不能为空（请输入 GitHub 链接或包名）" };
    }

    const isWindows = process.platform === "win32";
    let isGitHub = false;
    let gitUrl = "";
    let baseName = "";

    // 1. Detect GitHub URL
    if (rawSource.startsWith("http://") || rawSource.startsWith("https://") || rawSource.startsWith("git@") || rawSource.startsWith("github.com/")) {
      isGitHub = true;
      gitUrl = rawSource.startsWith("github.com/") ? `https://${rawSource}` : rawSource;
      const parts = gitUrl.replace(/\.git$/, "").split("/").filter(Boolean);
      baseName = parts[parts.length - 1] || "github-mcp";
    } else if (rawSource.startsWith("github:")) {
      isGitHub = true;
      const slug = rawSource.slice("github:".length);
      gitUrl = `https://github.com/${slug}`;
      const parts = slug.split("/").filter(Boolean);
      baseName = parts[parts.length - 1] || "github-mcp";
    } else {
      baseName = rawSource;
    }

    // Clean Service ID
    const cleanId = baseName.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/^-+|-+$/g, "") || `mcp-${Date.now()}`;
    const displayName = req.name?.trim() || (baseName.charAt(0).toUpperCase() + baseName.slice(1).replace(/[-_]/g, " "));

    // 2. Allocate Port
    const port = req.port || await this.findAvailablePort(9112);

    // 3. Determine Execution Command & Arguments
    let command = "uv";
    let args: string[] = [];
    let rawCommand = "";

    if (isGitHub) {
      // GitHub repo: run via uv with git+ URL
      command = "uv";
      const pkgSpec = `git+${gitUrl}`;
      args = ["run", "--with", pkgSpec, baseName];
      rawCommand = `uv run --with "${pkgSpec}" ${baseName}`;
    } else if (rawSource.startsWith("@") || rawSource.endsWith("-mcp-server-node") || rawSource.startsWith("npm:")) {
      // npm package
      const npmPkg = rawSource.replace(/^npm:/, "");
      command = isWindows ? "npx.cmd" : "npx";
      args = ["-y", npmPkg];
      rawCommand = `${command} -y ${npmPkg}`;
    } else {
      // Python PyPI package (e.g. maya-mcp-server, mcp-server-git, etc.)
      command = "uv";
      args = ["run", "--with", rawSource, rawSource];
      rawCommand = `uv run --with "${rawSource}" ${rawSource}`;
    }

    const config: ManagedMcpConfig = {
      id: cleanId,
      name: displayName,
      command,
      args,
      rawCommand,
      port,
      endpoint: `http://127.0.0.1:${port}/mcp`,
      autoStart: false,
    };

    const mgr = ManagedProcessManager.getInstance();

    // If existing service, update its config
    if (mgr.getService(cleanId)) {
      mgr.updateConfig(cleanId, config);
    } else {
      const createRes = mgr.createCustomService(config);
      if (!createRes.success) {
        return { success: false, error: createRes.error };
      }
    }

    // 4. Start the service (Pure-Stream Gateway will launch it and filter stdout)
    const startRes = await mgr.startService(cleanId);
    if (!startRes.success) {
      return {
        success: false,
        error: `服务启动失败: ${startRes.error || "未知异常"}`,
        serviceId: cleanId,
        port,
      };
    }

    // 5. Query verified toolCount
    const finalState = mgr.getService(cleanId);
    const toolCount = finalState?.toolCount || 0;

    return {
      success: true,
      serviceId: cleanId,
      name: displayName,
      port,
      toolCount,
      endpoint: config.endpoint,
    };
  }
}
