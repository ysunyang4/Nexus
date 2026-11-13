/**
 * Nexus Generic MCP — Native Pure-Stream Stdio-to-HTTP Gateway
 * 
 * Replaces external supergateway / third-party wrappers with a robust, zero-dependency,
 * in-process Streamable-HTTP bridge for ANY Stdio-based MCP server (Python, uv, uvx, Node, Go, Rust).
 * 
 * Key Advantages:
 * 1. Pure-Stream Stdout Cleaner: Automatically strips non-JSON CLI banners, update boxes,
 *    and deprecation warnings (e.g. FastMCP ASCII art, AuthlibDeprecationWarning).
 * 2. Windows Safe Spawning: Directly executes binaries without shell quote-stripping corruption.
 * 3. Environment Inoculation: Injects FASTMCP_SHOW_CLI_BANNER=false, FASTMCP_CHECK_FOR_UPDATES=off,
 *    PYTHONWARNINGS=ignore, PYTHONUNBUFFERED=1 to keep stdio channels 100% pure JSON-RPC.
 * 4. Spec-Compliant Streamable-HTTP: Supports initialize, tools/list, tools/call, session IDs,
 *    and keep-alive SSE framing.
 */

import http from "node:http";
import child_process from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface StdioGatewayOptions {
  serviceId: string;
  command: string;
  args: string[];
  port: number;
  env?: Record<string, string>;
  onLog?: (line: string) => void;
  onExit?: (code: number | null) => void;
  onError?: (err: Error) => void;
}

export class NativeStdioGateway {
  private options: StdioGatewayOptions;
  private server: http.Server | null = null;
  private child: child_process.ChildProcess | null = null;
  private pendingRequests: Map<string | number, {
    resolve: (res: any) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }> = new Map();
  private stdoutBuffer = "";
  private isClosing = false;
  private currentSessionId: string = crypto.randomUUID();

  constructor(options: StdioGatewayOptions) {
    this.options = options;
  }

  public get pid(): number | undefined {
    return this.child?.pid;
  }

  public async start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        this.spawnChildProcess();

        this.server = http.createServer((req, res) => {
          this.handleHttpRequest(req, res);
        });

        this.server.on("error", (err) => {
          this.options.onLog?.(`[Gateway Error] Server listener error: ${err.message}`);
          if (!this.isClosing) {
            reject(err);
          }
        });

        this.server.listen(this.options.port, "127.0.0.1", () => {
          this.options.onLog?.(`[Gateway] Pure-Stream HTTP listener bound to http://127.0.0.1:${this.options.port}/mcp`);
          resolve();
        });
      } catch (err: any) {
        reject(err);
      }
    });
  }

  private resolveExecutable(cmd: string): string {
    const isWin = process.platform === "win32";
    if (cmd === "uv" || cmd === "uv.exe" || cmd === "uvx" || cmd === "uvx.exe") {
      const candidateDirs = [
        path.join(process.env.LOCALAPPDATA || "", "uv"),
        path.join(process.env.USERPROFILE || "", ".local", "bin"),
        path.join(process.env.USERPROFILE || "", ".cargo", "bin"),
        path.resolve(process.cwd(), "resources/runtime"),
        path.resolve(process.cwd(), "apps/desktop/src-tauri/resources/runtime"),
        path.dirname(process.execPath),
      ];
      for (const dir of candidateDirs) {
        const exe = path.join(dir, isWin ? (cmd.startsWith("uvx") ? "uvx.exe" : "uv.exe") : cmd);
        if (fs.existsSync(exe)) return exe;
      }
    }
    return cmd;
  }

  private spawnChildProcess(): void {
    let execCmd = this.resolveExecutable(this.options.command);
    let execArgs = [...this.options.args];

    // Auto-detect and rewrite uvx into resolved uv.exe run --with
    if (this.options.command === "uvx" || this.options.command === "uvx.exe") {
      const uvExe = this.resolveExecutable("uv");
      if (execArgs.length > 0) {
        const pkgName = execArgs[0];
        const restArgs = execArgs.slice(1);
        execCmd = uvExe;
        execArgs = ["run", "--with", pkgName, pkgName, ...restArgs];
      }
    }

    // Inoculate environment against non-JSON outputs
    const injectedEnv: Record<string, string> = {
      ...process.env as any,
      PYTHONWARNINGS: "ignore",
      PYTHONUNBUFFERED: "1",
      FASTMCP_SHOW_CLI_BANNER: "false",
      FASTMCP_CHECK_FOR_UPDATES: "off",
      MCP_PORT: String(this.options.port),
      ...(this.options.env || {}),
    };

    // Ensure uv and node directories are present in PATH
    const uvDirs = [
      path.join(process.env.LOCALAPPDATA || "", "uv"),
      path.join(process.env.USERPROFILE || "", ".local", "bin"),
      path.join(process.env.USERPROFILE || "", ".cargo", "bin"),
      path.resolve(process.cwd(), "resources/runtime"),
      path.resolve(process.cwd(), "apps/desktop/src-tauri/resources/runtime"),
      path.dirname(process.execPath),
    ];
    let curPath = injectedEnv.PATH || injectedEnv.Path || "";
    for (const d of uvDirs) {
      if (d && fs.existsSync(d) && !curPath.includes(d)) {
        curPath = `${d}${path.delimiter}${curPath}`;
      }
    }
    injectedEnv.PATH = curPath;
    injectedEnv.Path = curPath;

    this.options.onLog?.(`[Gateway] Spawning Stdio process: ${execCmd} ${execArgs.join(" ")}`);

    this.child = child_process.spawn(execCmd, execArgs, {
      env: injectedEnv,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });

    this.child.stdout?.on("data", (chunk: Buffer) => {
      this.handleStdoutChunk(chunk);
    });

    this.child.stderr?.on("data", (chunk: Buffer) => {
      const str = chunk.toString("utf8");
      this.options.onLog?.(`[STDERR] ${str.trim()}`);
    });

    this.child.on("exit", (code) => {
      this.options.onLog?.(`[Gateway] Stdio process exited (code: ${code})`);
      if (!this.isClosing) {
        // Reject all outstanding requests
        for (const [id, req] of this.pendingRequests) {
          clearTimeout(req.timer);
          req.reject(new Error(`MCP server process exited with code ${code}`));
        }
        this.pendingRequests.clear();
        this.options.onExit?.(code);
      }
    });

    this.child.on("error", (err) => {
      this.options.onLog?.(`[Gateway] Child process error: ${err.message}`);
      this.options.onError?.(err);
    });
  }

  private handleStdoutChunk(chunk: Buffer): void {
    this.stdoutBuffer += chunk.toString("utf8");
    const lines = this.stdoutBuffer.split(/\r?\n/);
    this.stdoutBuffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Extract JSON-RPC payload
      let parsedJson: any = null;
      if (line.startsWith("{") && line.endsWith("}")) {
        try {
          parsedJson = JSON.parse(line);
        } catch {}
      } else {
        // Try searching for embedded JSON in case of prefix/suffix noise
        const firstBrace = line.indexOf("{");
        const lastBrace = line.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          try {
            parsedJson = JSON.parse(line.slice(firstBrace, lastBrace + 1));
          } catch {}
        }
      }

      if (parsedJson && parsedJson.jsonrpc === "2.0") {
        if (parsedJson.id !== undefined && parsedJson.id !== null) {
          const pending = this.pendingRequests.get(parsedJson.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingRequests.delete(parsedJson.id);
            pending.resolve(parsedJson);
            continue;
          }
        }
        // Notification from server
        this.options.onLog?.(`[JSON-RPC Notification] ${parsedJson.method || "message"}`);
      } else {
        // Clean non-JSON CLI banner, logging, or deprecation notices
        this.options.onLog?.(`[Service Log] ${line}`);
      }
    }
  }

  private sendJsonRpc(msg: any, timeoutMs = 25000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.child || !this.child.stdin || this.child.killed) {
        return reject(new Error("Stdio process is not running"));
      }

      const timer = setTimeout(() => {
        if (this.pendingRequests.has(msg.id)) {
          this.pendingRequests.delete(msg.id);
          reject(new Error(`Timeout waiting for response to ${msg.method} (id=${msg.id}) after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      this.pendingRequests.set(msg.id, { resolve, reject, timer });

      try {
        const payload = JSON.stringify(msg) + "\n";
        this.child.stdin.write(payload, "utf8", (err) => {
          if (err) {
            clearTimeout(timer);
            this.pendingRequests.delete(msg.id);
            reject(err);
          }
        });
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(msg.id);
        reject(err);
      }
    });
  }

  private async handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Standard CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, Mcp-Protocol-Version, Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);

    if (req.method === "GET") {
      if (req.headers.accept?.includes("text/event-stream")) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Mcp-Session-Id": this.currentSessionId,
        });
        res.write(`event: endpoint\ndata: http://127.0.0.1:${this.options.port}/mcp\n\n`);
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, status: "ready", transport: "streamableHttp", service: this.options.serviceId }));
      return;
    }

    if (req.method === "DELETE") {
      this.currentSessionId = crypto.randomUUID();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, message: "Session closed" }));
      return;
    }

    if (req.method === "POST") {
      let bodyStr = "";
      req.on("data", (chunk) => {
        bodyStr += chunk.toString("utf8");
      });

      req.on("end", async () => {
        try {
          const body = JSON.parse(bodyStr);

          // Header session ID handling
          const incomingSessionId = (req.headers["mcp-session-id"] || req.headers["mcp_session_id"]) as string | undefined;
          if (incomingSessionId) {
            this.currentSessionId = incomingSessionId;
          }

          if (body.method === "initialize") {
            // Initiate handshake with child process
            const resp = await this.sendJsonRpc(body);

            // Automatically send notifications/initialized
            try {
              this.child?.stdin?.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
            } catch {}

            res.setHeader("Mcp-Session-Id", this.currentSessionId);
            res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
            res.setHeader("Cache-Control", "no-cache, no-transform");
            res.writeHead(200);
            res.end(`event: message\ndata: ${JSON.stringify(resp)}\n\n`);
            return;
          }

          if (body.id !== undefined && body.id !== null) {
            // Request requiring response
            const resp = await this.sendJsonRpc(body);
            res.setHeader("Mcp-Session-Id", this.currentSessionId);
            res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
            res.setHeader("Cache-Control", "no-cache, no-transform");
            res.writeHead(200);
            res.end(`event: message\ndata: ${JSON.stringify(resp)}\n\n`);
            return;
          }

          // Notification (fire and forget)
          if (this.child?.stdin) {
            this.child.stdin.write(JSON.stringify(body) + "\n");
          }
          res.writeHead(202, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", result: {} }));
        } catch (err: any) {
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              jsonrpc: "2.0",
              id: null,
              error: { code: -32603, message: err.message || "Internal Gateway Error" }
            }));
          }
        }
      });
      return;
    }

    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  public async close(): Promise<void> {
    this.isClosing = true;

    // Reject remaining pending requests
    for (const [id, req] of this.pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error("Gateway closing"));
    }
    this.pendingRequests.clear();

    // Close HTTP Server
    if (this.server) {
      try {
        await new Promise<void>((r) => this.server?.close(() => r()));
      } catch {}
      this.server = null;
    }

    // Terminate child process
    if (this.child) {
      const pid = this.child.pid;
      if (pid) {
        try {
          if (process.platform === "win32") {
            child_process.execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
          } else {
            this.child.kill("SIGKILL");
          }
        } catch {}
      }
      this.child = null;
    }
  }
}
