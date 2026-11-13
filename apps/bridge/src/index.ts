import http from "node:http";
import crypto from "node:crypto";
import child_process from "node:child_process";
import dotenv from "dotenv";
import { NexusClient } from "./nexus-client.js";
import {
  handleMcpHttpRequest,
  CANONICAL_TOOL_COUNT,
  getCanonicalToolManifest,
  hasActiveMcpSession,
  removeActiveMcpSession,
  normalizeToolName,
  lastActiveBrowserSessionId,
} from "./server.js";
import { validateRequestAuth, logMcpRequest, sanitizeLog } from "./security.js";

import {
  ProjectBuilderRuntime,
  CapabilityResolver,
  ProviderRegistry,
} from "./project-builder/index.js";
import { ProviderRuntime, DynamicCatalog, PermissionGateway, VerificationEngine, McpSecurityPolicyManager, ManagedProcessManager, RemoteMcpManager, ScriptRunner, SmartInstaller, TokenGuardrail } from "./generic-mcp/index.js";
import {
  getNexusBrowserHtml,
  launchNexusBrowser,
  resetNexusBrowserProfile,
  getNexusBrowserStatus,
  extractWebMarkdown,
  getNexusIconBuffer,
  handleNexusProxyRequest,
} from "./browser-portal.js";
import { UnityGameDevMcpProvider } from "./unity-gamedev-provider.js";

function resolveBaseUrl(req: http.IncomingMessage): string {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL;
  }
  const host = req.headers.host || "127.0.0.1:8787";
  const proto = (req.headers["x-forwarded-proto"] as string) || "http";
  return `${proto}://${host}`;
}

function getOrCreateBridgeToken(): string {
  const envToken = (process.env.NEXUS_BRIDGE_TOKEN || "").trim();
  if (envToken) {
    return envToken;
  }

  const tokenPath = process.env.NEXUS_BRIDGE_TOKEN_PATH || (
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "LocalBridge", "data", "bridge-token.key")
      : path.join(process.env.HOME || process.env.USERPROFILE || ".", ".localbridge", "data", "bridge-token.key")
  );

  if (tokenPath && fs.existsSync(tokenPath)) {
    try {
      const fileToken = fs.readFileSync(tokenPath, "utf-8").trim();
      if (fileToken) {
        return fileToken;
      }
    } catch (err) {
      console.warn("[Bridge] Failed to read existing bridge-token.key:", err);
    }
  }

  const generated = `lb_bridge_${crypto.randomBytes(24).toString("hex")}`;
  if (tokenPath) {
    try {
      fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
      fs.writeFileSync(tokenPath, generated, { encoding: "utf-8", mode: 0o600 });
      console.log(`[Bridge] Generated new random bridge token and saved to ${tokenPath}`);
    } catch (err) {
      console.warn("[Bridge] Failed to persist bridge-token.key to disk:", err);
    }
  }
  return generated;
}

dotenv.config();

if (!process.env.PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL.startsWith("http://127.0.0.1") || process.env.PUBLIC_BASE_URL.startsWith("http://localhost")) {
  process.env.PUBLIC_BASE_URL = "http://127.0.0.1:" + (process.env.PORT || "8787");
}

const HOST = process.env.NEXUS_BRIDGE_HOST || "127.0.0.1";
const PORT = parseInt(process.env.PORT || process.env.NEXUS_BRIDGE_PORT || "8787", 10);
const BRIDGE_TOKEN = getOrCreateBridgeToken();
const CORE_URL = process.env.NEXUS_CORE_URL || "http://127.0.0.1:18080";

const isResourceVerification =
  process.env.PORT === "0" && process.env.NEXUS_BRIDGE_PORT === "0";

import fs from "node:fs";
import path from "node:path";

let STARTUP_MGMT_TOKEN = (
  process.env.LOCALBRIDGE_MANAGEMENT_TOKEN ||
  process.env.NEXUS_MANAGEMENT_TOKEN ||
  ""
).trim();

if (!STARTUP_MGMT_TOKEN) {
  const tokenPath = process.env.NEXUS_MANAGEMENT_TOKEN_PATH || (
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "LocalBridge", "data", "management-token.key")
      : ""
  );
  if (tokenPath && fs.existsSync(tokenPath)) {
    try {
      STARTUP_MGMT_TOKEN = fs.readFileSync(tokenPath, "utf-8").trim();
    } catch {}
  }
}

if (!STARTUP_MGMT_TOKEN && isResourceVerification) {
  STARTUP_MGMT_TOKEN = "lm_verify_bridge_ephemeral";
}

if (!STARTUP_MGMT_TOKEN) {
  console.error(
    "FATAL: Bridge management token is missing. LOCALBRIDGE_MANAGEMENT_TOKEN, NEXUS_MANAGEMENT_TOKEN, or management-token.key must be configured."
  );
  process.exit(1);
}

const nexusClient = new NexusClient({
  coreUrl: CORE_URL,
});

ProviderRegistry.getInstance().setNexusClient(nexusClient);


export class RateLimiter {
  private limits = new Map<string, number[]>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly maxCapacity: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(maxRequests: number, windowMs: number, maxCapacity = 10000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.maxCapacity = maxCapacity;

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.windowMs);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  public check(ip: string): boolean {
    const now = Date.now();
    let timestamps = this.limits.get(ip);
    if (timestamps) {
      timestamps = timestamps.filter((t) => now - t < this.windowMs);
    } else {
      timestamps = [];
    }

    if (timestamps.length >= this.maxRequests) {
      this.limits.set(ip, timestamps);
      return false;
    }

    // Capacity management: if map reaches maxCapacity, clean up expired entries
    if (!this.limits.has(ip) && this.limits.size >= this.maxCapacity) {
      this.cleanup();
      // If still at capacity, evict the oldest key (FIFO)
      if (this.limits.size >= this.maxCapacity) {
        const oldestKey = this.limits.keys().next().value;
        if (oldestKey !== undefined) {
          this.limits.delete(oldestKey);
        }
      }
    }

    timestamps.push(now);
    this.limits.set(ip, timestamps);
    return true;
  }

  public cleanup(): void {
    const now = Date.now();
    for (const [key, timestamps] of this.limits.entries()) {
      const active = timestamps.filter((t) => now - t < this.windowMs);
      if (active.length === 0) {
        this.limits.delete(key);
      } else {
        this.limits.set(key, active);
      }
    }
  }

  public clear(): void {
    this.limits.clear();
  }

  public get size(): number {
    return this.limits.size;
  }

  public get(ip: string): number[] | undefined {
    return this.limits.get(ip);
  }

  public set(ip: string, timestamps: number[]): void {
    this.limits.set(ip, timestamps);
  }
}

export function getTrustedClientIp(req: http.IncomingMessage): string {
  const remoteAddr = req.socket.remoteAddress || "";
  const isLoopback =
    remoteAddr === "127.0.0.1" ||
    remoteAddr === "::1" ||
    remoteAddr === "::ffff:127.0.0.1";

  if (isLoopback && req.headers["cf-connecting-ip"]) {
    const raw = Array.isArray(req.headers["cf-connecting-ip"])
      ? req.headers["cf-connecting-ip"][0]
      : req.headers["cf-connecting-ip"];
    return String(raw).split(",")[0].trim();
  }
  return remoteAddr || "unknown";
}

export const authRateLimiter = new RateLimiter(5, 60 * 1000, 10000);
export const registrationRateLimits = new RateLimiter(10, 60 * 1000, 10000);

export function resetRateLimits(): void {
  authRateLimiter.clear();
  registrationRateLimits.clear();
}

function checkAuthRateLimit(req: http.IncomingMessage): boolean {
  const clientIp = getTrustedClientIp(req);
  return authRateLimiter.check(clientIp);
}

export function isLoopbackHost(hostHeader?: string): boolean {
  if (!hostHeader) return false;
  let host = hostHeader.toLowerCase().trim();
  if (host === "::1" || host === "[::1]") return true;
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    host = end !== -1 ? host.slice(1, end) : host;
  } else {
    host = host.split(":")[0];
  }
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

export function isDirectLocalhostRequest(req: http.IncomingMessage): boolean {
  const remoteAddr = req.socket?.remoteAddress || "";
  const isLoopback =
    remoteAddr === "127.0.0.1" ||
    remoteAddr === "::1" ||
    remoteAddr === "::ffff:127.0.0.1";
  if (!isLoopback) return false;

  const hasForwardingHeader = Boolean(
    req.headers["x-forwarded-for"] ||
    req.headers["cf-connecting-ip"] ||
    req.headers["forwarded"] ||
    req.headers["x-real-ip"]
  );
  if (hasForwardingHeader) return false;

  return isLoopbackHost(req.headers.host);
}

function verifyLoopbackManagementAuth(req: http.IncomingMessage): boolean {
  if (!isDirectLocalhostRequest(req)) return false;

  const mgmtToken = (
    process.env.LOCALBRIDGE_MANAGEMENT_TOKEN ||
    process.env.NEXUS_MANAGEMENT_TOKEN ||
    STARTUP_MGMT_TOKEN ||
    ""
  ).trim();
  if (!mgmtToken) return false;

  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7).trim();

  const bufToken = Buffer.from(token);
  const bufMgmt = Buffer.from(mgmtToken);
  if (bufToken.length !== bufMgmt.length) return false;
  return crypto.timingSafeEqual(bufToken, bufMgmt);
}

export function logBridgeHttpFailure(info: {
  timestamp: string;
  method: string;
  pathname: string;
  statusCode: number;
  userAgent: string;
  clientIp: string;
  requestId: string;
  errorCode?: string;
  errorMessage?: string;
}): void {
  try {
    const logDir = process.platform === "win32"
      ? path.join(process.env.LOCALAPPDATA || process.env.APPDATA || "C:\\ProgramData", "LocalBridge", "data")
      : path.join(process.env.HOME || ".", ".localbridge", "data");
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logPath = path.join(logDir, "bridge-http.log");
    const sanitizedError = sanitizeLog(info.errorMessage || "");
    const line = `[${info.timestamp}] [${info.requestId}] ${info.clientIp} ${info.method} ${info.pathname} -> ${info.statusCode} | UA: ${info.userAgent} | code: ${info.errorCode || "NONE"} | msg: ${sanitizedError}\n`;
    fs.appendFileSync(logPath, line, "utf-8");
  } catch (err: any) {
    console.warn("[BridgeLog] Failed to write bridge-http.log:", err?.message || String(err));
  }
}

/**
 * Helper to read request body as string.
 */
function readRequestBody(req: http.IncomingMessage, maxBytes = 10 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

/**
 * Parses form-urlencoded or JSON body into key-value pairs.
 */
function parseFormOrJsonBody(rawBody: string, contentType = ""): Record<string, any> {
  if (!rawBody.trim()) return {};

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(rawBody);
    } catch {
      return {};
    }
  }

  // Default to URL-encoded
  const params = new URLSearchParams(rawBody);
  const out: Record<string, any> = {};
  for (const [key, value] of params.entries()) {
    out[key] = value;
  }
  return out;
}

const server = http.createServer(async (req, res) => {
  const startTime = Date.now();
  const requestId = `req_${crypto.randomBytes(8).toString("hex")}`;
  res.setHeader("X-Request-Id", requestId);

  const baseUrl = resolveBaseUrl(req);
  const url = new URL(req.url || "/", baseUrl);
  const pathname = url.pathname;

  const clientIp =
    (req.headers["cf-connecting-ip"] as string) ||
    (req.headers["x-forwarded-for"] as string) ||
    req.socket.remoteAddress ||
    "unknown";
  const userAgent = (req.headers["user-agent"] as string) || "none";
  const authHeader = req.headers["authorization"] ? "[PRESENT]" : "[NONE]";

  console.log(
    `[HTTP IN] [${requestId}] ${req.method} ${pathname}${url.search} (IP: ${clientIp}, UA: ${userAgent}, Auth: ${authHeader}, Accept: ${req.headers["accept"] || "*/*"})`
  );

  res.on("finish", () => {
    const duration = Date.now() - startTime;
    console.log(
      `[HTTP OUT] [${requestId}] ${req.method} ${pathname} -> ${res.statusCode} (${duration}ms)`
    );
    if (res.statusCode >= 400) {
      logBridgeHttpFailure({
        timestamp: new Date().toISOString(),
        method: req.method || "UNKNOWN",
        pathname,
        statusCode: res.statusCode,
        userAgent,
        clientIp,
        requestId,
        errorCode: (res as any).__errorCode,
        errorMessage: (res as any).__errorMessage,
      });
    }
  });

  // Global CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, X-Requested-With, Origin, X-Request-Id"
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "WWW-Authenticate, Link, Mcp-Session-Id, Mcp-Protocol-Version, Content-Type, X-Request-Id"
  );

  // 1. Handle OPTIONS Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1.1 Handle HEAD Probes
  if (req.method === "HEAD" && (pathname === "/mcp" || pathname === "/health" || pathname === "/")) {
    res.writeHead(200, {
      "Content-Type": "application/json",
    });
    res.end();
    return;
  }

  // 2. GET /health or GET /
  if (req.method === "GET" && (pathname === "/health" || pathname === "/api/health" || pathname === "/")) {
    const nexusHealth = await nexusClient.checkHealth();
    let projectsCount = 0;
    if (nexusHealth.ok) {
      try {
        const projects = await nexusClient.getProjects();
        projectsCount = projects.length;
      } catch {}
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        {
          ok: true,
          service: "nexus-mcp-bridge",
          version: "1.3.1",
          baseUrl,
          nexus: {
            connected: nexusHealth.ok,
            url: CORE_URL,
            projectsCount,
            error: nexusHealth.error,
          },
          auth: {
            bearerEnabled: Boolean(BRIDGE_TOKEN),
          },
          endpoints: {
            mcp: `${baseUrl}/mcp`,
            tools: `${baseUrl}/tools/manifest`,
          },
        },
        null,
        2
      )
    );
    return;
  }

  // 6.6 Canonical Tool Manifest Discovery Endpoint
  if (req.method === "GET" && (pathname === "/tools/manifest" || pathname === "/.well-known/nexus-tool-manifest")) {
    const manifest = getCanonicalToolManifest();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(manifest, null, 2));
    return;
  }

  // 6.7 Unity GameDev External Provider & Permission Management Endpoints
  // 6.7 Unity GameDev External Provider & Permission Management Endpoints
  if (pathname === "/unity/service/status" || pathname === "/api/unity/service/status") {
    const runtime = ProviderRuntime.getInstance();
    await runtime.initializeDefaultProviders().catch(() => {});
    const p = runtime.getProvider("unity-gamedev");
    const isReady = p?.status === "READY";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        {
          providerId: "unity-gamedev",
          displayName: "Unity GameDev MCP",
          status: p?.status || "DISCONNECTED",
          connected: isReady,
          unity: isReady ? "CONNECTED" : "DISCONNECTED",
          serviceState: isReady ? "RUNNING" : "STOPPED",
          port: 20705,
          portListening: isReady,
          protocolVersion: p?.protocolVersion || "2024-11-05",
          toolsCount: p?.toolCount || 0,
          endpoint: p?.endpoint || "http://127.0.0.1:20705/mcp",
          transport: "streamableHttp",
          lastError: p?.lastError,
        },
        null,
        2
      )
    );
    return;
  }

  if (pathname === "/unity/service/permission" || pathname === "/api/unity/service/permission") {
    if (req.method === "POST") {
      const rawBody = await readRequestBody(req, 16 * 1024);
      const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
      try {
        if (data.permission) {
          PermissionGateway.getInstance().setSystemLevel(data.permission);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, permission: PermissionGateway.getInstance().getSystemLevel() }));
      } catch (err: any) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "INVALID_PERMISSION", message: err.message }));
      }
      return;
    }
  }

  if (pathname === "/unity/service/mode" || pathname === "/api/unity/service/mode") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, mode: "FAST" }));
    return;
  }

  if (pathname === "/unity/ledger" || pathname === "/api/unity/ledger") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ actions: VerificationEngine.getInstance().getLedger() }, null, 2));
    return;
  }

  if (pathname.startsWith("/unity/evidence/") || pathname.startsWith("/api/unity/evidence/")) {
    const parts = pathname.split("/");
    const evidenceId = parts[parts.length - 1];
    const evidence = VerificationEngine.getInstance().getEvidence(evidenceId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ evidence: evidence || null }, null, 2));
    return;
  }

  if (pathname === "/unity/gamedev-mcp/status" || pathname === "/api/unity/gamedev-mcp/status") {
    const runtime = ProviderRuntime.getInstance();
    const p = runtime.getProvider("unity-gamedev");
    const isReady = p?.status === "READY";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        {
          providerId: "unity-gamedev",
          displayName: "Unity GameDev MCP",
          status: p?.status || "DISCONNECTED",
          unity: isReady ? "CONNECTED" : "DISCONNECTED",
          serviceState: isReady ? "RUNNING" : "STOPPED",
          port: 20705,
          portListening: isReady,
          protocolVersion: p?.protocolVersion || "2024-11-05",
          toolsCount: p?.toolCount || 0,
          endpoint: p?.endpoint || "http://127.0.0.1:20705/mcp",
          transport: "streamableHttp",
          lastError: p?.lastError,
        },
        null,
        2
      )
    );
    return;
  }

  if (pathname === "/unity/gamedev-mcp/initialize" || pathname === "/api/unity/gamedev-mcp/initialize") {
    const runtime = ProviderRuntime.getInstance();
    await runtime.initializeDefaultProviders().catch(() => {});
    const ok = await runtime.reconnectProvider("unity-gamedev");
    const p = runtime.getProvider("unity-gamedev");
    res.writeHead(ok ? 200 : 502, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        {
          success: ok,
          status: p?.status || "DISCONNECTED",
          toolCount: p?.toolCount || 0,
          error: p?.lastError,
        },
        null,
        2
      )
    );
    return;
  }

  if (pathname === "/unity/gamedev-mcp/disconnect" || pathname === "/api/unity/gamedev-mcp/disconnect") {
    const runtime = ProviderRuntime.getInstance();
    const ok = runtime.disconnectProvider("unity-gamedev");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: ok, status: "DISCONNECTED", toolCount: 0 }, null, 2));
    return;
  }

  if (pathname === "/unity/gamedev-mcp/tools" || pathname === "/api/unity/gamedev-mcp/tools") {
    const runtime = ProviderRuntime.getInstance();
    await runtime.initializeDefaultProviders().catch(() => {});
    const catalog = DynamicCatalog.getInstance();
    const tools = catalog.getToolsByProvider("unity-gamedev");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        {
          success: true,
          count: tools.length,
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description || "",
            inputSchema: t.inputSchema || { type: "object", properties: {} },
            outputSchema: t.outputSchema,
            requiredPermission: t.permissionClass,
            provider: t.providerId,
          })),
        },
        null,
        2
      )
    );
    return;
  }

  if (pathname === "/unity/gamedev-mcp/call" || pathname === "/api/unity/gamedev-mcp/call") {
    if (req.method === "POST") {
      const runtime = ProviderRuntime.getInstance();
      const rawBody = await readRequestBody(req, 1024 * 1024);
      const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
      const name = data.name;
      const args = data.arguments || {};
      if (!name) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "MISSING_TOOL_NAME" }));
        return;
      }
      const callRes = await runtime.executeTool(`unity-gamedev::${name}`, args);
      res.writeHead(200, {
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify(callRes, null, 2));
      return;
    }
  }

  // 6.7.1 Unity Workspace Core Data Endpoints (Hierarchy, Inspector, Console, Action)
  if (pathname === "/unity/hierarchy" || pathname === "/api/unity/hierarchy") {
    const runtime = ProviderRuntime.getInstance();
    const sceneRes = await runtime.executeTool("unity-gamedev::scene-get-data", {});
    let sceneName = "Active Scene";
    if (sceneRes?.content?.[0]?.text) {
      try {
        const p = JSON.parse(sceneRes.content[0].text);
        if (p.result?.Name) sceneName = p.result.Name;
      } catch {}
    }

    const common = ["Main Camera", "Directional Light", "Global Volume", "EventSystem", "Canvas", "Player", "Environment"];
    const children: any[] = [];
    for (const name of common) {
      const fRes = await runtime.executeTool("unity-gamedev::gameobject-find", { name });
      if (fRes?.content?.[0]?.text) {
        try {
          const p = JSON.parse(fRes.content[0].text);
          const ref = p.result?.Reference || p.result;
          if (ref && ref.instanceID) {
            children.push({
              id: String(ref.instanceID),
              name: ref.name || name,
              path: ref.path || name,
              active: true,
              tag: "Untagged",
            });
          }
        } catch {}
      }
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      nodes: [
        {
          id: "scene_root",
          name: sceneName,
          path: sceneName,
          active: true,
          children: children.length > 0 ? children : undefined,
        },
      ],
    }));
    return;
  }

  if (pathname === "/unity/inspector" || pathname === "/api/unity/inspector") {
    const objectId = url.searchParams.get("objectId") || url.searchParams.get("id");
    if (!objectId || objectId === "scene_root") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ inspector: null }));
      return;
    }

    const instId = Number(objectId);
    const runtime = ProviderRuntime.getInstance();
    const objRes = await runtime.executeTool("unity-gamedev::object-get-data", { objectRef: { instanceID: instId } });
    let inspector: any = null;

    if (objRes?.content?.[0]?.text) {
      try {
        const parsed = JSON.parse(objRes.content[0].text);
        const obj = parsed.result || {};
        const props = Array.isArray(obj.props) ? obj.props : [];

        inspector = {
          objectId: String(instId),
          objectName: obj.name || `GameObject_${instId}`,
          active: Boolean(props.find((p: any) => p.name === "activeSelf")?.value ?? true),
          tag: String(props.find((p: any) => p.name === "tag")?.value || "Untagged"),
          layer: String(props.find((p: any) => p.name === "layer")?.value || "Default"),
          isStatic: Boolean(props.find((p: any) => p.name === "isStatic")?.value ?? false),
          transform: {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
          },
          components: [
            {
              id: `${instId}_transform`,
              name: "Transform",
              type: "UnityEngine.Transform",
              enabled: true,
              properties: props.map((p: any) => ({
                key: p.name,
                label: p.name,
                value: p.value,
                type: typeof p.value === "boolean" ? "boolean" : typeof p.value === "number" ? "number" : "string",
              })),
            },
          ],
          references: [],
          events: [],
        };
      } catch {}
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ inspector }));
    return;
  }

  if (pathname === "/unity/console" || pathname === "/api/unity/console") {
    const level = url.searchParams.get("level") || "ALL";
    const search = url.searchParams.get("q") || "";
    const runtime = ProviderRuntime.getInstance();
    const logRes = await runtime.executeTool("unity-gamedev::console-get-logs", {});
    let logs: any[] = [];

    if (logRes?.content?.[0]?.text) {
      try {
        const parsed = JSON.parse(logRes.content[0].text);
        const rawLogs = parsed.result || [];
        if (Array.isArray(rawLogs)) {
          logs = rawLogs
            .map((l: any, idx: number) => {
              const rawType = (l.LogType || l.type || "Log").toUpperCase();
              const normLevel =
                rawType.includes("EXCEPTION") ? "EXCEPTION" :
                rawType.includes("ERROR") ? "ERROR" :
                rawType.includes("WARN") ? "WARNING" : "LOG";
              return {
                id: `log_${idx}_${Date.now()}`,
                timestamp: l.Timestamp ? new Date(l.Timestamp).toLocaleTimeString() : new Date().toLocaleTimeString(),
                level: normLevel,
                message: l.Message || l.message || "",
                stackTrace: l.StackTrace || l.stackTrace,
              };
            })
            .filter((l: any) => {
              if (level !== "ALL" && l.level !== level) return false;
              if (search && !l.message.toLowerCase().includes(search.toLowerCase())) return false;
              return true;
            });
        }
      } catch {}
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ logs }));
    return;
  }

  if (pathname === "/unity/action/execute" || pathname === "/api/unity/action/execute") {
    if (req.method === "POST") {
      const runtime = ProviderRuntime.getInstance();
      const rawBody = await readRequestBody(req, 1024 * 1024);
      const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
      const operationId = data.operationId || data.name;
      const params = data.parameters || data.arguments || {};
      const callRes = await runtime.executeTool(`unity-gamedev::${operationId}`, params);
      res.writeHead(200, {
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify(callRes, null, 2));
      return;
    }
  }

  if (pathname === "/unity/runtime" || pathname === "/api/unity/runtime") {
    const runtime = ProviderRuntime.getInstance();
    const p = runtime.getProvider("unity-gamedev");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      runtime: {
        lifecycleState: p?.status === "READY" ? "RUNNING" : "STOPPED",
        fps: null,
        objectsCount: p?.toolCount || 0,
        timeScale: 1.0,
        memoryMB: null,
        activeScene: "Tasgole",
      },
    }));
    return;
  }

  if (pathname === "/unity/runtime/mutate" || pathname === "/api/unity/runtime/mutate") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, state: "STOPPED", note: "Runtime mutate handled natively" }));
    return;
  }

  // 6.8 Unity Dynamic Catalog Refresh & Circuit Breaker Endpoints
  if (pathname === "/unity/tools/refresh" || pathname === "/api/unity/tools/refresh") {
    if (req.method === "POST" || req.method === "GET") {
      const runtime = ProviderRuntime.getInstance();
      const refreshRes = await runtime.refreshProviderCatalog("unity-gamedev");
      res.writeHead(refreshRes.success ? 200 : 502, { "Content-Type": "application/json" });
      res.end(JSON.stringify(refreshRes, null, 2));
      return;
    }
  }

  if (pathname === "/unity/circuit-breaker" || pathname === "/api/unity/circuit-breaker") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ state: "CLOSED", failures: 0, consecutiveFailures: 0 }, null, 2));
    return;
  }

  if (pathname === "/unity/circuit-breaker/reset" || pathname === "/api/unity/circuit-breaker/reset") {
    if (req.method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, message: "Circuit breaker reset to CLOSED", status: { state: "CLOSED" } }));
      return;
    }
  }

  if (pathname === "/unity/circuit-breaker/trip" || pathname === "/api/unity/circuit-breaker/trip") {
    if (req.method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, message: "Circuit breaker tripped to OPEN", status: { state: "OPEN" } }));
      return;
    }
  }

  if (pathname === "/unity/circuit-breaker/config" || pathname === "/api/unity/circuit-breaker/config") {
    if (req.method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
      return;
    }
  }

  if (pathname === "/unity/endpoint" || pathname === "/api/unity/endpoint") {
    if (req.method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, endpoint: "http://127.0.0.1:20705/mcp" }));
      return;
    }
  }

  // 6.8 Project Builder Engine & Capability REST Endpoints (PHASE 4)
  if (pathname === "/api/project-builder/projects") {
    const pb = ProjectBuilderRuntime.getInstance();
    if (req.method === "GET") {
      const list = pb.listProjects().map((p) => ({
        projectId: p.projectId,
        name: p.name,
        status: p.status,
        executionMode: p.executionMode,
        currentStageId: p.currentStageId,
        stagesCount: p.blueprint.stages?.length || 0,
        committedStagesCount: Array.from(p.stageStates.values()).filter((s) => s.status === "COMMITTED").length,
        goal: p.blueprint.goal,
        providers: p.blueprint.providers,
        ledger: p.ledger,
        deliveryReport: p.deliveryReport,
        evidenceTree: p.evidenceTree,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, projects: list }));
      return;
    }

    if (req.method === "POST") {
      const rawBody = await readRequestBody(req, 64 * 1024);
      const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
      try {
        const instance = pb.createProject(data as any);
        if (data.autoStart !== false) {
          pb.executeProject(instance.projectId).catch(console.error);
        }
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, project: instance }));
      } catch (err: any) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message || String(err) }));
      }
      return;
    }
  }

  if (pathname.startsWith("/api/project-builder/projects/")) {
    const pb = ProjectBuilderRuntime.getInstance();
    const parts = pathname.slice("/api/project-builder/projects/".length).split("/");
    const projectId = decodeURIComponent(parts[0]);
    const action = parts[1];

    const project = pb.getProject(projectId);
    if (!project) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: `Project '${projectId}' not found` }));
      return;
    }

    if (!action && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          project: {
            ...project,
            stageStates: Array.from(project.stageStates.entries()).map(([id, state]) => ({
              ...state,
            })),
          },
        })
      );
      return;
    }

    if (action === "start" && req.method === "POST") {
      pb.executeProject(projectId).catch(console.error);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, status: "RUNNING" }));
      return;
    }

    if (action === "pause" && req.method === "POST") {
      pb.pauseProject(projectId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, status: "PAUSED" }));
      return;
    }

    if (action === "replan" && req.method === "POST") {
      const rawBody = await readRequestBody(req, 64 * 1024);
      const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
      try {
        const updated = await pb.submitReplan(projectId, data.replannedStages || []);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, project: updated }));
      } catch (err: any) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message || String(err) }));
      }
      return;
    }
  }

  if (pathname === "/api/project-builder/capabilities" && req.method === "GET") {
    const cap = CapabilityResolver.getInstance();
    const provider = url.searchParams.get("provider") || undefined;
    let list = cap.listCapabilities();
    if (provider) {
      list = list.filter((c) => c.provider.toLowerCase() === provider.toLowerCase());
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, count: list.length, capabilities: list }));
    return;
  }

  if (pathname === "/api/project-builder/providers") {
    const reg = ProviderRegistry.getInstance();
    if (req.method === "GET") {
      const list = await reg.listProviders();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, providers: list }));
      return;
    }

    if (req.method === "POST") {
      const rawBody = await readRequestBody(req, 16 * 1024);
      const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
      const regRes = await reg.registerExternalProvider(data as any);
      res.writeHead(regRes.success ? 200 : 400, { "Content-Type": "application/json" });
      res.end(JSON.stringify(regRes));
      return;
    }
  }

  // 6.8.1 Generic External MCP Provider & Dynamic Catalog Endpoints
  if (pathname === "/api/mcp/providers") {
    const runtime = ProviderRuntime.getInstance();
    if (req.method === "GET") {
      const list = runtime.listProviders();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, count: list.length, providers: list }));
      return;
    }

    if (req.method === "POST") {
      const rawBody = await readRequestBody(req, 32 * 1024);
      const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
      try {
        const result = await runtime.registerProvider(data as any);
        res.writeHead(result.success ? 200 : 400, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message || String(err) }));
      }
      return;
    }
  }

  if (pathname.startsWith("/api/mcp/providers/")) {
    const runtime = ProviderRuntime.getInstance();
    const parts = pathname.slice("/api/mcp/providers/".length).split("/");
    const providerId = decodeURIComponent(parts[0]);
    const subAction = parts[1];

    if (req.method === "GET" && !subAction) {
      const p = runtime.getProvider(providerId);
      if (!p) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: `Provider '${providerId}' not found` }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, provider: p }));
      return;
    }

    if (req.method === "DELETE" && !subAction) {
      const ok = runtime.removeProvider(providerId);
      res.writeHead(ok ? 200 : 404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: ok }));
      return;
    }

    if (subAction === "reconnect" && req.method === "POST") {
      const ok = await runtime.reconnectProvider(providerId);
      res.writeHead(ok ? 200 : 502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: ok }));
      return;
    }

    if (subAction === "metrics" && req.method === "GET") {
      const metrics = runtime.getPerformanceMetrics(providerId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, providerId, metrics }));
      return;
    }

    if (subAction === "refresh" && req.method === "POST") {
      const refreshRes = await runtime.refreshProviderCatalog(providerId);
      res.writeHead(refreshRes.success ? 200 : 502, { "Content-Type": "application/json" });
      res.end(JSON.stringify(refreshRes));
      return;
    }
  }

  // 6.8.2 Managed MCP Process & API Configuration Endpoints
  if (pathname === "/api/mcp/managed") {
    const mgr = ManagedProcessManager.getInstance();
    if (req.method === "GET") {
      const list = mgr.listServices();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, count: list.length, services: list }));
      return;
    }

    if (req.method === "POST") {
      const rawBody = await readRequestBody(req, 32 * 1024);
      const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
      const result = mgr.createCustomService(data as any);
      res.writeHead(result.success ? 200 : 400, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      return;
    }
  }

  if (pathname.startsWith("/api/mcp/managed/")) {
    const mgr = ManagedProcessManager.getInstance();
    const parts = pathname.slice("/api/mcp/managed/".length).split("/");
    const subAction = parts[0];
    const serviceId = decodeURIComponent(parts[1] || "");

    if (subAction === "start" && req.method === "POST") {
      const rawBody = await readRequestBody(req, 32 * 1024);
      const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
      const targetId = serviceId || data.id;
      const resStart = await mgr.startService(targetId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(resStart));
      return;
    }

    if (subAction === "stop" && req.method === "POST") {
      const rawBody = await readRequestBody(req, 32 * 1024);
      const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
      const targetId = serviceId || data.id;
      const resStop = await mgr.stopService(targetId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(resStop));
      return;
    }

    if (subAction === "restart" && req.method === "POST") {
      const rawBody = await readRequestBody(req, 32 * 1024);
      const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
      const targetId = serviceId || data.id;
      const resRestart = await mgr.restartService(targetId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(resRestart));
      return;
    }

    if (subAction === "logs" && req.method === "GET") {
      const targetId = serviceId || (req.url && new URL(req.url, "http://localhost").searchParams.get("id")) || "blender-mcp";
      const logs = mgr.getLogs(targetId, 200);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, id: targetId, logs }));
      return;
    }

    if (subAction === "config" && req.method === "POST") {
      const rawBody = await readRequestBody(req, 32 * 1024);
      const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
      const targetId = serviceId || data.id;
      const resConfig = mgr.updateConfig(targetId, data);
      res.writeHead(resConfig.success ? 200 : 400, { "Content-Type": "application/json" });
      res.end(JSON.stringify(resConfig));
      return;
    }

    if (subAction === "delete" && req.method === "POST") {
      const rawBody = await readRequestBody(req, 32 * 1024);
      const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
      const targetId = serviceId || data.id;
      const resDel = mgr.deleteCustomService(targetId);
      res.writeHead(resDel.success ? 200 : 400, { "Content-Type": "application/json" });
      res.end(JSON.stringify(resDel));
      return;
    }
  }

  // 6.8.2.1 Smart Auto-Installer for GitHub & Package Names
  if (pathname === "/api/mcp/auto-install" && req.method === "POST") {
    try {
      const rawBody = await readRequestBody(req, 32 * 1024);
      const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
      const installer = SmartInstaller.getInstance();
      const result = await installer.installAndDeploy({
        source: data.source || "",
        name: data.name,
        port: data.port ? Number(data.port) : undefined,
      });
      res.writeHead(result.success ? 200 : 400, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err?.message || String(err) }));
    }
    return;
  }

  // 6.8.3 Remote & Cloud MCP Endpoints with Multi-Account Profile Management
  if (pathname === "/api/mcp/remote") {
    const remoteMgr = RemoteMcpManager.getInstance();
    if (req.method === "GET") {
      const list = remoteMgr.listServices();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, count: list.length, services: list }));
      return;
    }

    if (req.method === "POST") {
      const rawBody = await readRequestBody(req, 32 * 1024);
      const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
      const result = remoteMgr.createCustomService(data);
      res.writeHead(result.success ? 200 : 400, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      return;
    }
  }

  // 6.8.4 Master & Per-Provider Token Optimization Policy Endpoints
  if (pathname === "/api/mcp/token-mode") {
    const policyMgr = McpSecurityPolicyManager.getInstance();
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          master: policyMgr.isMasterTokenOptimization(),
          providers: policyMgr.getTokenOptimizationMatrix().providers,
        })
      );
      return;
    }
    if (req.method === "POST") {
      const rawBody = await readRequestBody(req, 32 * 1024);
      const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
      if (data.master !== undefined) {
        policyMgr.setMasterTokenOptimization(Boolean(data.master));
      }
      if (data.providerId && data.enabled !== undefined) {
        policyMgr.setProviderTokenOptimization(String(data.providerId), Boolean(data.enabled));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          master: policyMgr.isMasterTokenOptimization(),
          providers: policyMgr.getTokenOptimizationMatrix().providers,
        })
      );
      return;
    }
  }

  // 6.8.5 Unified Tool Execution Bridge Endpoint (used by SDK & Meta Router)
  if (pathname === "/api/mcp/execute" && req.method === "POST") {
    const rawBody = await readRequestBody(req, 1024 * 1024);
    const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
    const rawToolName = data.tool;
    const toolName = normalizeToolName(rawToolName);
    const provider = data.provider ? String(data.provider).trim().toLowerCase() : undefined;
    const toolArgs = data.arguments && typeof data.arguments === "object" ? { ...data.arguments } : {};

    // Auto-inherit browserSessionId if missing for localbridge browser tools
    if (toolName.startsWith("localbridge_browser_") && 
        toolName !== "localbridge_browser_launch" && 
        toolName !== "localbridge_browser_list") {
      const currentSid = String(toolArgs.browserSessionId || "").trim();
      if (!currentSid || currentSid.startsWith("<") || currentSid.includes("session")) {
        if (lastActiveBrowserSessionId) {
          toolArgs.browserSessionId = lastActiveBrowserSessionId;
        }
      }
    }

    // Auto-enable saveToArtifact for screenshot/snapshot tools to prevent massive base64 payloads
    if (toolName.includes("screenshot") || toolName.includes("snapshot")) {
      toolArgs.saveToArtifact = true;
    }

    try {
      const dynamicCatalog = DynamicCatalog.getInstance();
      const providerRuntime = ProviderRuntime.getInstance();

      // Helper to safely parse JSON text responses
      const safeParse = (val: any) => {
        if (typeof val === "string") {
          try { return JSON.parse(val); } catch { return val; }
        }
        return val;
      };

      // 1. Try finding in Dynamic Catalog (External MCPs)
      let dynamicTool = dynamicCatalog.resolveTool(toolName);
      if (!dynamicTool && provider) {
        dynamicTool = dynamicCatalog.resolveTool(`${provider}::${toolName}`);
      }
      if (dynamicTool) {
        const rawExecRes = await providerRuntime.executeTool(dynamicTool.qualifiedName, toolArgs);
        const execRes = TokenGuardrail.sanitizeToolResult(rawExecRes, { sourceTool: toolName });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: !execRes.isError,
            isError: execRes.isError,
            result: execRes.content?.[0]?.text ? safeParse(execRes.content[0].text) : execRes.content,
            content: execRes.content,
            error: execRes.error,
          })
        );
        return;
      }

      // 1.5 Try Unity GameDev MCP Provider if applicable
      const isUnity = provider === "unity-gamedev" || provider === "unity" || 
        toolName.startsWith("gameobject-") || toolName.startsWith("scene-") || 
        toolName.startsWith("assets-") || toolName.startsWith("component-") || 
        toolName.startsWith("console-") || toolName.startsWith("test-");
      if (isUnity) {
        const unityProvider = UnityGameDevMcpProvider.getInstance();
        if (unityProvider.isUnityTool(toolName)) {
          const rawExecRes = await unityProvider.executeTool(toolName, toolArgs);
          const execRes = TokenGuardrail.sanitizeToolResult(rawExecRes, { sourceTool: toolName });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: !execRes.isError,
              isError: execRes.isError,
              result: execRes.content?.[0]?.text ? safeParse(execRes.content[0].text) : execRes.content,
              content: execRes.content,
              error: execRes.isError ? (execRes.content?.[0] as any)?.text : undefined,
            })
          );
          return;
        }
      }

      // 2. Try Canonical / Core tools
      const rawCoreRes = await nexusClient.callNexusTool(toolName, toolArgs);
      const coreRes = TokenGuardrail.sanitizeToolResult(rawCoreRes, { sourceTool: toolName });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: !coreRes.isError,
          isError: coreRes.isError,
          result: (coreRes as any).structuredContent || (coreRes.content?.[0] ? safeParse((coreRes.content[0] as any).text) : coreRes.content),
          content: coreRes.content,
          error: coreRes.isError ? (coreRes.content?.[0] as any)?.text : undefined,
        })
      );
      return;
    } catch (err: any) {
      let errMsg = err.message || String(err);
      if (errMsg.includes("MCP_SCOPE_DENIED") || errMsg.includes("unknown tool")) {
        errMsg = `Tool '${toolName}' is not recognized in Nexus Core. Tip: Use nexus_discover_tools() to find valid tools.`;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, isError: true, error: errMsg }));
      return;
    }
  }

  // 6.8.6 Universal Script Execution Endpoint (Python / Node with timeout watchdog)
  if (pathname === "/api/mcp/execute-script" && req.method === "POST") {
    const rawBody = await readRequestBody(req, 1024 * 1024);
    const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
    const runner = ScriptRunner.getInstance();
    const result = await runner.execute({
      runtime: data.runtime || "python",
      script: data.script || "",
      timeoutMs: data.timeoutMs || 30000,
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
    return;
  }

  if (pathname === "/nexus-browser/icon.png") {
    const iconBuf = getNexusIconBuffer();
    if (iconBuf) {
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" });
      res.end(iconBuf);
      return;
    }
    res.writeHead(404);
    res.end();
    return;
  }

  if (pathname === "/nexus-browser" || pathname === "/nexus-browser/") {
    const urlObj = new URL(req.url || "/nexus-browser", "http://localhost");
    const initialUrl = urlObj.searchParams.get("url") || "";
    const initialAi = urlObj.searchParams.get("ai") || "";
    const html = getNexusBrowserHtml(initialUrl, initialAi);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (pathname === "/proxy" || pathname === "/nexus-proxy") {
    const urlObj = new URL(req.url || "", "http://localhost");
    const targetUrl = urlObj.searchParams.get("url");
    if (!targetUrl) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Missing url parameter");
      return;
    }
    handleNexusProxyRequest(targetUrl, req, res);
    return;
  }

  if (pathname === "/api/nexus-browser/launch" && req.method === "POST") {
    const rawBody = await readRequestBody(req, 4096);
    const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
    const result = launchNexusBrowser(data.url, data.ai, Boolean(data.forceRestart));
    res.writeHead(result.success ? 200 : 500, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
    return;
  }

  if (pathname === "/api/nexus-browser/status" && req.method === "GET") {
    const status = getNexusBrowserStatus();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, ...status }));
    return;
  }

  if (pathname === "/api/nexus-browser/reset" && req.method === "POST") {
    const result = resetNexusBrowserProfile();
    res.writeHead(result.success ? 200 : 500, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
    return;
  }

  if (pathname === "/api/nexus-reader/extract" && req.method === "POST") {
    const rawBody = await readRequestBody(req, 64 * 1024);
    const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
    const result = await extractWebMarkdown(data.url || data.html || "");
    res.writeHead(result.success ? 200 : 400, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
    return;
  }

  if (pathname === "/api/browser/open" && req.method === "POST") {
    const rawBody = await readRequestBody(req, 4096);
    const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
    const targetUrl = data.url;
    if (targetUrl && typeof targetUrl === "string") {
      // Launch in dedicated Nexus browser with persistent profile, NOT system default
      const result = launchNexusBrowser(targetUrl);
      res.writeHead(result.success ? 200 : 500, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      return;
    }
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Missing url parameter" }));
    return;
  }

  if (pathname.startsWith("/api/mcp/remote/")) {
    const remoteMgr = RemoteMcpManager.getInstance();
    const parts = pathname.slice("/api/mcp/remote/".length).split("/");
    const subAction = parts[0];
    const serviceId = decodeURIComponent(parts[1] || "");

    if (subAction === "connect" && req.method === "POST") {
      const result = await remoteMgr.connectService(serviceId);
      res.writeHead(result.success ? 200 : 500, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      return;
    }

    if (subAction === "disconnect" && req.method === "POST") {
      const result = remoteMgr.disconnectService(serviceId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      return;
    }

    if (subAction === "delete" && req.method === "POST") {
      const result = remoteMgr.deleteService(serviceId);
      res.writeHead(result.success ? 200 : 400, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      return;
    }

    if (subAction === "account") {
      const actionType = parts[1]; // "add", "delete", "activate"
      const rawBody = await readRequestBody(req, 32 * 1024);
      const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);

      if (actionType === "add" && req.method === "POST") {
        const result = remoteMgr.addAccount(data.serviceId, {
          accountLabel: data.accountLabel,
          token: data.token,
          quotaNote: data.quotaNote,
        });
        res.writeHead(result.success ? 200 : 400, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      if (actionType === "delete" && req.method === "POST") {
        const result = remoteMgr.deleteAccount(data.serviceId, data.accountId);
        res.writeHead(result.success ? 200 : 400, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      if (actionType === "activate" && req.method === "POST") {
        const result = remoteMgr.activateAccount(data.serviceId, data.accountId);
        res.writeHead(result.success ? 200 : 400, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }
    }
  }

  if (pathname === "/api/mcp/batch" && req.method === "POST") {
    const runtime = ProviderRuntime.getInstance();
    const rawBody = await readRequestBody(req, 4 * 1024 * 1024);
    const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
    try {
      const batchRes = await runtime.executeBatch(data as any);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(batchRes));
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ isError: true, error: err.message || String(err) }));
    }
    return;
  }

  if (pathname === "/api/mcp/catalog" && req.method === "GET") {
    const catalog = DynamicCatalog.getInstance();
    const snapshot = catalog.getSnapshot();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, catalog: snapshot }));
    return;
  }

  if (pathname === "/api/mcp/execute" && req.method === "POST") {
    const runtime = ProviderRuntime.getInstance();
    const rawBody = await readRequestBody(req, 1024 * 1024);
    const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
    try {
      const execRes = await runtime.executeTool(data.tool, data.args || {}, data.options);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(execRes));
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ isError: true, error: err.message || String(err) }));
    }
    return;
  }

  // 6.8.2 MCP Security & Execution Policy Endpoints
  if (pathname === "/api/mcp/security-policy") {
    const policyManager = McpSecurityPolicyManager.getInstance();
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, policy: policyManager.getPolicy() }));
      return;
    }

    if (req.method === "POST") {
      const rawBody = await readRequestBody(req, 64 * 1024);
      const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
      if (typeof data.unrestricted_execution_mode === "boolean") {
        policyManager.setUnrestrictedMode(data.unrestricted_execution_mode);
      }
      if (data.trusted_external_mcp && typeof data.trusted_external_mcp === "object") {
        for (const [k, v] of Object.entries(data.trusted_external_mcp)) {
          policyManager.setServerTrusted(k, Boolean(v));
        }
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, policy: policyManager.getPolicy() }));
      return;
    }
  }

  if (pathname === "/api/mcp/security-policy/unrestricted" && req.method === "POST") {
    const policyManager = McpSecurityPolicyManager.getInstance();
    const rawBody = await readRequestBody(req, 16 * 1024);
    const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
    const enabled = Boolean(data.enabled ?? data.unrestricted_execution_mode);
    policyManager.setUnrestrictedMode(enabled);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, policy: policyManager.getPolicy() }));
    return;
  }

  if (pathname === "/api/mcp/security-policy/trust" && req.method === "POST") {
    const policyManager = McpSecurityPolicyManager.getInstance();
    const rawBody = await readRequestBody(req, 16 * 1024);
    const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
    const target = data.endpointOrId || data.endpoint || data.providerId || data.serverIdentity;
    const trusted = Boolean(data.trusted ?? true);
    if (!target) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "Missing 'endpointOrId' in request body" }));
      return;
    }
    policyManager.setServerTrusted(target, trusted);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, policy: policyManager.getPolicy() }));
    return;
  }

  // 9. GET /mcp or GET /mcp/health (Status & Probe / SSE handshake)
  if (
    req.method === "GET" &&
    (pathname === "/mcp" ||
      pathname.startsWith("/mcp/") ||
      pathname === "/mcp/health" ||
      pathname === "/api/mcp" ||
      (pathname === "/" && req.headers.accept?.includes("text/event-stream")))
  ) {
    if (req.headers.accept?.includes("text/event-stream")) {
      const headerSessionId = (
        req.headers["mcp-session-id"] ||
        (req.headers as any)["Mcp-Session-Id"] ||
        (req.headers as any)["mcp_session_id"]
      ) as string | undefined;

      // If client is opening an SSE stream for an active Streamable HTTP MCP session:
      if ((pathname === "/mcp" || pathname.startsWith("/mcp/") || pathname === "/") && headerSessionId && hasActiveMcpSession(headerSessionId)) {
        await handleMcpHttpRequest(req, res, undefined, nexusClient);
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      res.write(`event: endpoint\ndata: ${baseUrl}${pathname}\n\n`);
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        {
          ok: true,
          service: "nexus-mcp-bridge",
          endpoint: `POST ${pathname}`,
          protocol: "MCP Streamable HTTP / JSON-RPC 2.0",
          defaultProtocolVersion: "2024-11-05",
          toolsAvailable: CANONICAL_TOOL_COUNT + 8 + DynamicCatalog.getInstance().getSnapshot().toolCount,
          authRequired: false,
        },
        null,
        2
      )
    );
    return;
  }

  // 10. /mcp Standard MCP Endpoint (Streamable HTTP Session Lifecycle)
  if (pathname === "/mcp" || pathname.startsWith("/mcp/") || pathname === "/api/mcp" || (pathname === "/" && req.method === "POST")) {
    // 10.0 Support DELETE /mcp for session termination
    if (req.method === "DELETE") {
      const headerSessionId = (
        req.headers["mcp-session-id"] ||
        (req.headers as any)["Mcp-Session-Id"] ||
        (req.headers as any)["mcp_session_id"]
      ) as string | undefined;

      if (headerSessionId && hasActiveMcpSession(headerSessionId)) {
        removeActiveMcpSession(headerSessionId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, message: `Session ${headerSessionId} terminated` }));
        return;
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32601, message: "Method Not Allowed: MCP requires HTTP POST" },
          id: null,
        })
      );
      return;
    }

    // 10.1 Read JSON-RPC request body first to detect initialize & session context
    let bodyStr = "";
    try {
      bodyStr = await readRequestBody(req);
    } catch (err: any) {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Request body exceeds maximum size" },
          id: null,
        })
      );
      return;
    }

    let parsedBody: any;
    try {
      parsedBody = bodyStr.trim() ? JSON.parse(bodyStr) : undefined;
    } catch (err: any) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32700, message: `Parse error: Invalid JSON (${err.message})` },
          id: null,
        })
      );
      logMcpRequest({
        method: "POST",
        ip: req.socket.remoteAddress,
        durationMs: Date.now() - startTime,
        success: false,
        error: "Invalid JSON",
      });
      return;
    }

    // 10.1.1 Handle server/discover and openai-mcp-discover probe from legacy/tunnel clients
    const isDiscover =
      parsedBody &&
      ((typeof parsedBody === "object" &&
        !Array.isArray(parsedBody) &&
        (parsedBody.method === "server/discover" || parsedBody.method === "openai-mcp-discover")) ||
        (Array.isArray(parsedBody) &&
          parsedBody.some(
            (m: any) => m && (m.method === "server/discover" || m.method === "openai-mcp-discover")
          )));

    if (isDiscover) {
      console.log("[BRIDGE DISCOVER INCOMING]", JSON.stringify(parsedBody));
      const allSupported = [
        "2024-11-05",
        "2025-03-07",
        "2025-03-26",
        "2025-06-18",
        "2025-11-25",
        "2026-07-28",
      ];
      const buildDiscoverResponse = (reqObj: any) => {
        const clientRequestedVersion =
          reqObj?.params?._meta?.["io.modelcontextprotocol/protocolVersion"] ||
          reqObj?.params?.protocolVersion ||
          "2024-11-05";

        const negotiatedVersion = allSupported.includes(clientRequestedVersion)
          ? clientRequestedVersion
          : "2024-11-05";

        return {
          jsonrpc: "2.0",
          result: {
            protocolVersion: negotiatedVersion,
            supportedVersions: allSupported,
            capabilities: {
              tools: { listChanged: true },
              resources: { subscribe: true, listChanged: true },
              prompts: { listChanged: true },
              logging: {},
            },
            serverInfo: {
              name: "nexus-mcp-bridge",
              version: "1.3.1",
            },
            instructions:
              "# Nexus Universal MCP Execution Gateway\n- Native desktop and execution tools are provided directly by Canonical Nexus Tools.\n- External environments (including Unity GameDev tools on 127.0.0.1:20705) are aggregated seamlessly.\n- All actions are safely verified and logged.",
            server: "nexus-mcp-bridge",
            version: "1.3.1",
            _meta: {
              "io.modelcontextprotocol/serverInfo": {
                name: "nexus-mcp-bridge",
                version: "1.3.1",
              },
            },
          },
          id: reqObj?.id !== undefined ? reqObj.id : null,
        };
      };

      res.writeHead(200, { "Content-Type": "application/json" });
      if (Array.isArray(parsedBody)) {
        res.end(JSON.stringify(parsedBody.map((m: any) => buildDiscoverResponse(m))));
      } else {
        res.end(JSON.stringify(buildDiscoverResponse(parsedBody)));
      }
      logMcpRequest({
        method: Array.isArray(parsedBody) ? "batch:discover" : parsedBody.method,
        ip: req.socket.remoteAddress,
        durationMs: Date.now() - startTime,
        success: true,
      });
      return;
    }

    // 10.2 Determine authentication & session requirements
    const isInitialize =
      parsedBody &&
      ((typeof parsedBody === "object" && parsedBody.method === "initialize") ||
        (Array.isArray(parsedBody) && parsedBody.some((m: any) => m && m.method === "initialize")));

    const reqSessionId = (
      req.headers["mcp-session-id"] ||
      (req.headers as any)["Mcp-Session-Id"] ||
      (req.headers as any)["mcp_session_id"]
    ) as string | undefined;

    const hasValidSession = reqSessionId ? hasActiveMcpSession(reqSessionId) : false;
    const clientIp = getTrustedClientIp(req);
    const isLoopback = clientIp === "127.0.0.1" || clientIp === "::1" || clientIp === "::ffff:127.0.0.1";

    // Authentication Gate:
    // 1) If Authorization header is provided, validate strictly (Bearer).
    // 2) If no Authorization header is provided, ONLY permit confirmed direct localhost connections.
    //    All external, proxied, or tunneled requests without a valid Bearer token are rejected with 401.
    if (req.headers.authorization) {
      const authCheck = validateRequestAuth(req.headers.authorization, BRIDGE_TOKEN);
      if (!authCheck.valid) {
        res.setHeader("WWW-Authenticate", 'Bearer realm="LocalBridge MCP", error="invalid_token"');
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: `Unauthorized: ${authCheck.error || "Invalid token"}. Valid Bearer token required.`,
            },
            id: parsedBody?.id ?? null,
          })
        );
        logMcpRequest({
          method: parsedBody?.method || "POST",
          ip: req.socket.remoteAddress,
          durationMs: Date.now() - startTime,
          success: false,
          error: authCheck.error || "Invalid token",
        });
        return;
      }
    } else {
      if (!isDirectLocalhostRequest(req)) {
        res.setHeader("WWW-Authenticate", 'Bearer realm="LocalBridge MCP", error="invalid_token"');
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Unauthorized: Missing Bearer token for remote/tunneled MCP access. Direct localhost loopback only.",
            },
            id: parsedBody?.id ?? null,
          })
        );
        logMcpRequest({
          method: parsedBody?.method || "POST",
          ip: req.socket.remoteAddress,
          durationMs: Date.now() - startTime,
          success: false,
          error: "Missing Bearer token for non-local request",
        });
        return;
      }
    }

    // 10.3 Dispatch to MCP Server & Streamable HTTP Transport
    try {
      await handleMcpHttpRequest(req, res, parsedBody, nexusClient);
      const isToolCall = parsedBody?.method === "tools/call";
      const toolName = isToolCall ? parsedBody?.params?.name : undefined;

      logMcpRequest({
        method: parsedBody?.method || "unknown",
        tool: toolName,
        ip: req.socket.remoteAddress,
        durationMs: Date.now() - startTime,
        success: true,
      });
    } catch (err: any) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32603, message: `Internal server error: ${err.message}` },
            id: parsedBody?.id ?? null,
          })
        );
      }
      logMcpRequest({
        method: parsedBody?.method || "unknown",
        ip: req.socket.remoteAddress,
        durationMs: Date.now() - startTime,
        success: false,
        error: err.message,
      });
    }
    return;
  }

  // 11. Fallback 404 for Unknown Endpoints
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      error: "Not Found",
      message: "Nexus MCP Bridge. Use POST /mcp or GET /health.",
    })
  );
});

server.listen(PORT, HOST, () => {
  console.log("==================================================");
  console.log("  Nexus MCP Bridge                                ");
  console.log("==================================================");
  console.log(`  Local Endpoint:       http://${HOST}:${PORT}/mcp`);
  console.log(`  Health Check:         http://${HOST}:${PORT}/health`);
  console.log(`  Tool Manifest:        http://${HOST}:${PORT}/tools/manifest`);
  console.log(`  Downstream Nexus:     ${CORE_URL}`);
  console.log(`  Bearer Token Auth:    [${BRIDGE_TOKEN ? "ENABLED" : "DISABLED"}]`);
  console.log("==================================================");

  // Eagerly initialize default providers (e.g. Unity GameDev MCP)
  ProviderRuntime.getInstance()
    .initializeDefaultProviders()
    .catch((err: any) => {
      console.warn("[Bridge] Provider initialization background error:", err?.message || String(err));
    });
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[Nexus MCP Bridge] Shutting down gracefully...");
  server.close(() => {
    console.log("[Nexus MCP Bridge] Server stopped.");
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  console.log("\n[Nexus MCP Bridge] Shutting down gracefully...");
  server.close(() => {
    console.log("[Nexus MCP Bridge] Server stopped.");
    process.exit(0);
  });
});

export { server, BRIDGE_TOKEN };
