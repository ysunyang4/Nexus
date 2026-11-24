
process.on("unhandledRejection", (err: any) => {
  console.error("[Bridge UnhandledRejection Caught]:", err?.message || err);
});
process.on("uncaughtException", (err: any) => {
  console.error("[Bridge UncaughtException Caught]:", err?.message || err);
});
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
  OAuthStore,
  resolveBaseUrl,
  buildWwwAuthenticateHeader,
  renderOAuthConsentHtml,
  SUPPORTED_SCOPES,
  DEFAULT_SCOPES,
  isRedirectUriAllowed,
  escapeHtml,
} from "./oauth.js";
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

dotenv.config();

if (!process.env.PUBLIC_BASE_URL) {
  process.env.PUBLIC_BASE_URL = "http://127.0.0.1:8787";
}

const HOST = process.env.NEXUS_BRIDGE_HOST || "127.0.0.1";
const PORT = parseInt(process.env.PORT || process.env.NEXUS_BRIDGE_PORT || "8787", 10);
const BRIDGE_TOKEN = process.env.NEXUS_BRIDGE_TOKEN || "nexus-bridge-secure-token-2026";
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

const oauthStore = new OAuthStore();

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

function isLoopbackHost(hostHeader?: string): boolean {
  if (!hostHeader) return false;
  let host = hostHeader.toLowerCase().trim();
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    host = end !== -1 ? host.slice(1, end) : host;
  } else {
    host = host.split(":")[0];
  }
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function verifyLoopbackManagementAuth(req: http.IncomingMessage): boolean {
  const remoteAddr = req.socket.remoteAddress || "";
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

  if (!isLoopbackHost(req.headers.host)) return false;

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

function sendHtml(res: http.ServerResponse, statusCode: number, html: string, nonce?: string, baseUrl?: string) {
  const actualNonce = nonce || crypto.randomBytes(16).toString("base64");
  const effectiveBaseUrl = (baseUrl || process.env.PUBLIC_BASE_URL || "").trim();
  const connectSrcDirective = effectiveBaseUrl ? `'self' ${effectiveBaseUrl}` : "'self'";
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": `default-src 'none'; connect-src ${connectSrcDirective}; style-src 'unsafe-inline'; script-src 'nonce-${actualNonce}'; frame-ancestors 'none'`,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
  });
  res.end(html);
}

function sendErrorHtml(res: http.ServerResponse, statusCode: number, message: string) {
  const nonce = crypto.randomBytes(16).toString("base64");
  const safeMessage = escapeHtml(message);
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>OAuth Error</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #1e293b; border: 1px solid #ef4444; border-radius: 12px; padding: 32px; max-width: 480px; text-align: center; }
    h3 { margin-top: 0; color: #ef4444; }
    p { color: #94a3b8; line-height: 1.5; word-break: break-word; }
  </style>
</head>
<body>
  <div class="card">
    <h3>OAuth Error</h3>
    <p>${safeMessage}</p>
  </div>
</body>
</html>`;
  sendHtml(res, statusCode, html, nonce);
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
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, X-Requested-With, Origin, X-Request-Id"
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "WWW-Authenticate, Link, Mcp-Session-Id, Mcp-Protocol-Version, Content-Type, X-Request-Id, X-Nexus-Engine-Signature, X-Nexus-Release-Channel"
  );
  res.setHeader("X-Nexus-Engine-Signature", "nexus-kernel-sig-8829f4a");
  res.setHeader("X-Nexus-Release-Channel", "stable-canary-8829f");

  // Hard Ingress Barrier: Nexus 1.3.4 strictly supports ChatGPT only.
  // Immediately reject Claude, Anthropic, Gemini, Google-AI clients.
  const userAgentLower = userAgent.toLowerCase();
  const originLower = String(req.headers["origin"] || "").toLowerCase();
  const refererLower = String(req.headers["referer"] || "").toLowerCase();
  if (
    userAgentLower.includes("claude") ||
    userAgentLower.includes("anthropic") ||
    userAgentLower.includes("gemini") ||
    originLower.includes("claude.ai") ||
    originLower.includes("anthropic.com") ||
    originLower.includes("gemini.google.com") ||
    refererLower.includes("claude.ai") ||
    refererLower.includes("gemini.google.com")
  ) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Forbidden: Client not supported in Nexus 1.3.4 (ChatGPT only)",
        code: "CLIENT_NOT_SUPPORTED",
      })
    );
    return;
  }

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

  // Version and release distribution verification endpoint
  if (req.method === "GET" && (pathname === "/api/version" || pathname === "/version")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        service: "nexus-distribution-channel",
        latest: "1.3.4",
        channel: "stable",
        canary: NX_CANARY_SIG,
      })
    );
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
          version: "1.3.4",
          baseUrl,
          nexus: {
            connected: nexusHealth.ok,
            url: CORE_URL,
            projectsCount,
            error: nexusHealth.error,
          },
          auth: {
            bearerEnabled: Boolean(BRIDGE_TOKEN),
            oauth2Enabled: true,
            supportedGrantTypes: ["authorization_code", "refresh_token"],
          },
          endpoints: {
            mcp: `${baseUrl}/mcp`,
            protectedResourceMetadata: `${baseUrl}/.well-known/oauth-protected-resource`,
            authorizationServerMetadata: `${baseUrl}/.well-known/oauth-authorization-server`,
            authorizationEndpoint: `${baseUrl}/oauth/authorize`,
            tokenEndpoint: `${baseUrl}/oauth/token`,
            registrationEndpoint: `${baseUrl}/oauth/register`,
          },
        },
        null,
        2
      )
    );
    return;
  }

  // 3. OAuth 2.0 Protected Resource Metadata (RFC 9728)
  if (
    req.method === "GET" &&
    (pathname === "/.well-known/oauth-protected-resource" ||
      pathname === "/.well-known/oauth-protected-resource/mcp")
  ) {
    const ua = (req.headers["user-agent"] || "").toLowerCase();
    if (ua.includes("oai-tunnel-client")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify(
          {
            resource: "http://127.0.0.1:18080/mcp",
            scopes_supported: SUPPORTED_SCOPES,
            bearer_methods_supported: ["header"],
            resource_name: "Nexus MCP Bridge",
          },
          null,
          2
        )
      );
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        {
          resource: `${baseUrl}/mcp`,
          authorization_servers: [baseUrl],
          scopes_supported: SUPPORTED_SCOPES,
          bearer_methods_supported: ["header"],
          resource_name: "Nexus MCP Bridge",
          resource_documentation: `${baseUrl}/health`,
        },
        null,
        2
      )
    );
    return;
  }

  // 4. OAuth 2.0 Authorization Server Metadata (RFC 8414 & OIDC Discovery)
  if (
    req.method === "GET" &&
    (pathname === "/.well-known/oauth-authorization-server" ||
      pathname === "/.well-known/openid-configuration")
  ) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        {
          issuer: baseUrl,
          authorization_endpoint: `${baseUrl}/oauth/authorize`,
          token_endpoint: `${baseUrl}/oauth/token`,
          registration_endpoint: `${baseUrl}/oauth/register`,
          jwks_uri: `${baseUrl}/oauth/jwks.json`,
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
          scopes_supported: SUPPORTED_SCOPES,
          authorization_response_iss_parameter_supported: true,
        },
        null,
        2
      )
    );
    return;
  }

  // 5. JWKS Endpoint (RFC 7517)
  if (req.method === "GET" && pathname === "/oauth/jwks.json") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ keys: [] }));
    return;
  }

  // 6. Dynamic Client Registration (RFC 7591)
  if (req.method === "POST" && pathname === "/oauth/register") {
    try {
      const regIp = getTrustedClientIp(req);
      if (!registrationRateLimits.check(regIp)) {
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "slow_down",
            error_description: "Too many registration requests. Please wait.",
          })
        );
        return;
      }

      const rawBody = await readRequestBody(req, 10 * 1024 * 1024);
      const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);

      const authMethod =
        data.token_endpoint_auth_method === "none"
          ? "none"
          : (data.token_endpoint_auth_method || "client_secret_post");

      const client = oauthStore.registerClient({
        client_name: data.client_name,
        redirect_uris: Array.isArray(data.redirect_uris) ? data.redirect_uris : undefined,
        grant_types: Array.isArray(data.grant_types) ? data.grant_types : undefined,
        response_types: Array.isArray(data.response_types) ? data.response_types : undefined,
        token_endpoint_auth_method: authMethod,
      });

      const responsePayload: Record<string, any> = {
        client_id: client.client_id,
        client_id_issued_at: Math.floor(client.createdAt / 1000),
        client_name: client.client_name,
        redirect_uris: client.redirect_uris,
        grant_types: client.grant_types,
        response_types: client.response_types,
        token_endpoint_auth_method: authMethod,
      };

      if (data.scope) {
        responsePayload.scope = data.scope;
      }

      if (client.client_secret) {
        responsePayload.client_secret = client.client_secret;
        responsePayload.client_secret_expires_at = 0;
      }

      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify(responsePayload, null, 2));
      return;
    } catch (err: any) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_client_metadata", error_description: err.message }));
      return;
    }
  }

  // 6.0 Local Desktop List Pending OAuth Requests (requires loopback + lm_ token)
  if (req.method === "GET" && pathname === "/oauth/requests") {
    if (!verifyLoopbackManagementAuth(req)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "FORBIDDEN",
          message: "OAuth requests list requires local loopback management authorization",
        })
      );
      return;
    }

    const requests = oauthStore.listPendingAuthRequests();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ requests }));
    return;
  }

  // 6.1 Check Status of Pending OAuth Request
  if (req.method === "GET" && pathname.startsWith("/oauth/requests/") && pathname.endsWith("/status")) {
    const parts = pathname.split("/");
    const reqId = parts[3];
    const pending = oauthStore.getPendingAuthRequest(reqId);
    if (!pending) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not_found", message: "Request not found or expired" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: pending.status,
        code: pending.code,
        redirectUrl: pending.redirectUrl,
      })
    );
    return;
  }

  // 6.2 Local Desktop Resolve Pending OAuth Request (requires loopback + lm_ token)
  if (req.method === "POST" && pathname.startsWith("/oauth/requests/") && pathname.endsWith("/resolve")) {
    if (!verifyLoopbackManagementAuth(req)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "FORBIDDEN",
          message: "Approval resolution requires local management authorization",
        })
      );
      return;
    }

    const parts = pathname.split("/");
    const reqId = parts[3];
    const rawBody = await readRequestBody(req, 10 * 1024 * 1024);
    const body = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
    const action = body.action === "approve" ? "approve" : "deny";
    const pairingCode = body.pairing_code || body.pairingCode;

    const result = oauthStore.resolvePendingAuthRequest(reqId, action, pairingCode, "desktop-admin", baseUrl);
    if (!result.success) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: result.error }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        approved: action === "approve",
        code: result.code,
        redirectUrl: result.redirectUrl,
      })
    );
    return;
  }

  // 6.3 Local Desktop List OAuth Connections (requires loopback + lm_ token)
  if (req.method === "GET" && pathname === "/oauth/connections") {
    if (!verifyLoopbackManagementAuth(req)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "FORBIDDEN",
          message: "OAuth connections list requires local loopback management authorization",
        })
      );
      return;
    }

    const connections = oauthStore.listConnections();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ connections }));
    return;
  }

  // 6.4 Local Desktop Disconnect OAuth Connection (requires loopback + lm_ token)
  if (req.method === "POST" && pathname.startsWith("/oauth/connections/") && pathname.endsWith("/disconnect")) {
    if (!verifyLoopbackManagementAuth(req)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "FORBIDDEN",
          message: "Disconnecting connection requires local loopback management authorization",
        })
      );
      return;
    }

    const parts = pathname.split("/");
    const connId = parts[3];
    const result = oauthStore.disconnectConnection(connId);
    if (!result.success) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: result.error }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, message: `Connection ${connId} disconnected` }));
    return;
  }

  // 6.5 Local Desktop Refresh OAuth Connection (requires loopback + lm_ token)
  if (req.method === "POST" && pathname.startsWith("/oauth/connections/") && pathname.endsWith("/refresh")) {
    if (!verifyLoopbackManagementAuth(req)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "FORBIDDEN",
          message: "Refreshing connection requires local loopback management authorization",
        })
      );
      return;
    }

    const parts = pathname.split("/");
    const connId = parts[3];
    const result = oauthStore.refreshConnection(connId);
    if (!result.success) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: result.error }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, connection: result.connection }));
    return;
  }

  // 6.5.1 Local Desktop Clean Expired OAuth Connections (requires loopback + lm_ token)
  if (req.method === "POST" && pathname === "/oauth/connections/clean-expired") {
    if (process.env.NEXUS_OAUTH_CLEAN_ENABLED === "false") {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "DISABLED",
          message: "OAuth clean is disabled by NEXUS_OAUTH_CLEAN_ENABLED",
        })
      );
      return;
    }
    if (!verifyLoopbackManagementAuth(req)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "FORBIDDEN",
          message: "Cleaning expired connections requires local loopback management authorization",
        })
      );
      return;
    }

    const rawBody = await readRequestBody(req, 128 * 1024);
    const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
    const keepRecent = typeof data.keepRecentCount === "number" ? data.keepRecentCount : 2;
    const target = data.target || "all";
    const connectionIds = Array.isArray(data.connectionIds) ? data.connectionIds : undefined;

    const { cleanedCount, remainingCount, cleanedConnections } = oauthStore.cleanExpiredConnections({
      keepRecentCount: keepRecent,
      target,
      connectionIds,
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, cleanedCount, remainingCount, cleanedConnections }));
    return;
  }

  // 6.6 Canonical Tool Manifest Discovery Endpoint
  if (req.method === "GET" && (pathname === "/oauth/manifest" || pathname === "/.well-known/nexus-tool-manifest")) {
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
      const rawBody = await readRequestBody(req, 10 * 1024 * 1024);
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
      const rawBody = await readRequestBody(req, 10 * 1024 * 1024);
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
      const rawBody = await readRequestBody(req, 10 * 1024 * 1024);
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
      const rawBody = await readRequestBody(req, 10 * 1024 * 1024);
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
      const rawBody = await readRequestBody(req, 10 * 1024 * 1024);
      const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
      const targetId = serviceId || data.id;
      const resStart = await mgr.startService(targetId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(resStart));
      return;
    }

    if (subAction === "stop" && req.method === "POST") {
      const rawBody = await readRequestBody(req, 10 * 1024 * 1024);
      const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
      const targetId = serviceId || data.id;
      const resStop = await mgr.stopService(targetId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(resStop));
      return;
    }

    if (subAction === "restart" && req.method === "POST") {
      const rawBody = await readRequestBody(req, 10 * 1024 * 1024);
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
      const rawBody = await readRequestBody(req, 10 * 1024 * 1024);
      const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
      const targetId = serviceId || data.id;
      const resConfig = mgr.updateConfig(targetId, data);
      res.writeHead(resConfig.success ? 200 : 400, { "Content-Type": "application/json" });
      res.end(JSON.stringify(resConfig));
      return;
    }

    if (subAction === "delete" && req.method === "POST") {
      const rawBody = await readRequestBody(req, 10 * 1024 * 1024);
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
      const rawBody = await readRequestBody(req, 10 * 1024 * 1024);
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
      const rawBody = await readRequestBody(req, 10 * 1024 * 1024);
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
      const rawBody = await readRequestBody(req, 10 * 1024 * 1024);
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
    const rawBody = await readRequestBody(req, 10 * 1024 * 1024);
    const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
    const result = await launchNexusBrowser(data.url, data.ai, Boolean(data.forceRestart));
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

  if (pathname === "/api/browser/open-system" && req.method === "POST") {
    const rawBody = await readRequestBody(req, 10 * 1024 * 1024);
    const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
    const targetUrl = data.url;
    if (targetUrl && typeof targetUrl === "string") {
      try {
        if (process.platform === "win32") {
          child_process.spawn("explorer.exe", [targetUrl], { detached: true, stdio: "ignore" }).unref();
        } else if (process.platform === "darwin") {
          child_process.spawn("open", [targetUrl], { detached: true, stdio: "ignore" }).unref();
        } else {
          child_process.spawn("xdg-open", [targetUrl], { detached: true, stdio: "ignore" }).unref();
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
        return;
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
        return;
      }
    }
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Missing url parameter" }));
    return;
  }

  if (pathname === "/api/browser/open" && req.method === "POST") {
    const rawBody = await readRequestBody(req, 10 * 1024 * 1024);
    const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
    const targetUrl = data.url;
    if (targetUrl && typeof targetUrl === "string") {
      // Launch in dedicated Nexus browser with persistent profile, NOT system default
      const result = await launchNexusBrowser(targetUrl);
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
      const rawBody = await readRequestBody(req, 10 * 1024 * 1024);
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
    const rawBody = await readRequestBody(req, 10 * 1024 * 1024);
    const data = parseFormOrJsonBody(rawBody, req.headers["content-type"]);
    const enabled = Boolean(data.enabled ?? data.unrestricted_execution_mode);
    policyManager.setUnrestrictedMode(enabled);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, policy: policyManager.getPolicy() }));
    return;
  }

  if (pathname === "/api/mcp/security-policy/trust" && req.method === "POST") {
    const policyManager = McpSecurityPolicyManager.getInstance();
    const rawBody = await readRequestBody(req, 10 * 1024 * 1024);
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

  // 7. OAuth 2.0 Authorization Endpoint (RFC 6749)
  if (pathname === "/oauth/authorize") {
    if (req.method === "GET") {
      const clientId = url.searchParams.get("client_id")?.trim() || "";
      const redirectUri = url.searchParams.get("redirect_uri")?.trim() || "";
      const responseType = url.searchParams.get("response_type")?.trim() || "";
      const scope = url.searchParams.get("scope")?.trim() || DEFAULT_SCOPES;
      const state = url.searchParams.get("state")?.trim() || undefined;
      const codeChallenge = url.searchParams.get("code_challenge")?.trim() || "";
      const codeChallengeMethod = url.searchParams.get("code_challenge_method")?.trim() || "";

      if (!clientId) {
        sendErrorHtml(res, 400, "Missing required 'client_id' parameter");
        return;
      }

      if (!redirectUri) {
        sendErrorHtml(res, 400, "Missing required 'redirect_uri' parameter");
        return;
      }

      if (!codeChallenge) {
        sendErrorHtml(res, 400, "Missing required 'code_challenge' parameter (PKCE is mandatory)");
        return;
      }

      if (!codeChallengeMethod || codeChallengeMethod !== "S256") {
        sendErrorHtml(res, 400, "Invalid 'code_challenge_method'. Only 'S256' is supported.");
        return;
      }

      if (!isRedirectUriAllowed(redirectUri)) {
        sendErrorHtml(
          res,
          400,
          `Unauthorized redirect_uri '${redirectUri}'. Only authorized callbacks, configured production domain, or localhost are permitted.`
        );
        return;
      }

      let client = oauthStore.getClient(clientId);
      if (!client) {
        if (oauthStore.canAutoHeal(clientId, redirectUri)) {
          client = oauthStore.autoHealClient(clientId, redirectUri);
        } else {
          sendErrorHtml(
            res,
            400,
            `Unknown client_id '${clientId}'. Please register via /oauth/register.`
          );
          return;
        }
      }

      if (!oauthStore.isClientRedirectUriAllowed(client, redirectUri)) {
        sendErrorHtml(
          res,
          400,
          `redirect_uri '${redirectUri}' is not registered for client '${clientId}'.`
        );
        return;
      }

      if (responseType && responseType !== "code") {
        const targetUrl = new URL(redirectUri);
        targetUrl.searchParams.set("error", "unsupported_response_type");
        targetUrl.searchParams.set(
          "error_description",
          `Unsupported response_type '${responseType}'. Only 'code' is supported.`
        );
        if (typeof state === "string" && state.length > 0) targetUrl.searchParams.set("state", state);
        targetUrl.searchParams.set("iss", baseUrl);
        res.writeHead(302, { Location: targetUrl.toString() });
        res.end();
        return;
      }

      // Render Authorization Consent Screen
      const clientName = client.client_name || "AI Assistant";
      const nonce = crypto.randomBytes(16).toString("base64");
      const html = renderOAuthConsentHtml({
        baseUrl,
        clientName,
        clientId,
        redirectUri,
        scope: scope || DEFAULT_SCOPES,
        state,
        codeChallenge,
        codeChallengeMethod,
        nonce,
      });

      sendHtml(res, 200, html, nonce, baseUrl);
      return;
    }

    if (req.method === "POST") {
      const rawBody = await readRequestBody(req, 10 * 1024 * 1024);
      const body = parseFormOrJsonBody(rawBody, req.headers["content-type"]);

      const clientId = body.client_id?.trim() || "";
      const redirectUri = body.redirect_uri?.trim() || "";
      const scope = body.scope || DEFAULT_SCOPES;
      const state = body.state;
      const codeChallenge = body.code_challenge?.trim() || "";
      const codeChallengeMethod = body.code_challenge_method?.trim() || "";
      const action = body.action;

      // 1. action missing or not "approve" is strictly treated as DENIED
      if (!action || action !== "approve") {
        if (redirectUri && isRedirectUriAllowed(redirectUri)) {
          const targetUrl = new URL(redirectUri);
          targetUrl.searchParams.set("error", "access_denied");
          targetUrl.searchParams.set("error_description", "User denied authorization request");
          if (typeof state === "string" && state.length > 0) targetUrl.searchParams.set("state", state);
          targetUrl.searchParams.set("iss", baseUrl);
          res.writeHead(302, { Location: targetUrl.toString() });
          res.end();
          return;
        }
        sendErrorHtml(res, 400, "Authorization denied");
        return;
      }

      // 2. client_id must be provided and registered
      if (!clientId) {
        sendErrorHtml(res, 400, "Missing required 'client_id'");
        return;
      }

      let client = oauthStore.getClient(clientId);
      if (!client) {
        if (oauthStore.canAutoHeal(clientId, redirectUri)) {
          client = oauthStore.autoHealClient(clientId, redirectUri);
        } else {
          sendErrorHtml(res, 400, `Unknown client_id '${clientId}'`);
          return;
        }
      }

      // 3. redirect_uri must be provided and registered for this client
      if (!redirectUri) {
        sendErrorHtml(res, 400, "Missing required 'redirect_uri'");
        return;
      }

      if (!isRedirectUriAllowed(redirectUri)) {
        sendErrorHtml(res, 400, `Unauthorized redirect_uri '${redirectUri}'`);
        return;
      }

      if (!oauthStore.isClientRedirectUriAllowed(client, redirectUri)) {
        sendErrorHtml(
          res,
          400,
          `redirect_uri '${redirectUri}' is not registered for client '${clientId}'`
        );
        return;
      }

      // 4. PKCE parameters must be present and valid
      if (!codeChallenge) {
        sendErrorHtml(res, 400, "Missing required 'code_challenge' parameter (PKCE is mandatory)");
        return;
      }

      if (!codeChallengeMethod || codeChallengeMethod !== "S256") {
        sendErrorHtml(res, 400, "Invalid 'code_challenge_method'. Only 'S256' is supported.");
        return;
      }

      // 5. All authorizations require desktop approval: check rate limit first
      const acceptsJson = (req.headers.accept || "").includes("application/json");
      if (!checkAuthRateLimit(req)) {
        if (acceptsJson) {
          res.writeHead(429, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "rate_limit_exceeded",
              message: "Rate limit exceeded: Maximum 5 authorization requests per minute.",
            })
          );
          return;
        }
        sendErrorHtml(
          res,
          429,
          "Rate limit exceeded: Maximum 5 authorization requests per minute. Please try again later."
        );
        return;
      }

      try {
        const pending = oauthStore.createPendingAuthRequest({
          client_id: clientId,
          redirect_uri: redirectUri,
          scope,
          state,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
        });

        if (acceptsJson) {
          res.writeHead(202, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              status: "pending",
              requestId: pending.id,
              clientName: client.client_name,
              pairingCode: pending.pairingCode,
              pairing_code: pending.pairingCode,
              message: "Authorization request pending. Requires local approval in Nexus Desktop.",
              checkUrl: `${baseUrl}/oauth/requests/${pending.id}/status`,
            })
          );
          return;
        }

        // HTML response for browser form submission
        const nonce = crypto.randomBytes(16).toString("base64");
        const clientNameSafe = escapeHtml(client.client_name || "Client");
        const waitHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Approval Required - Nexus Desktop</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 32px; max-width: 480px; text-align: center; }
    h2 { margin-top: 0; color: #a5b4fc; }
    p { color: #94a3b8; line-height: 1.5; }
    .spinner { display: inline-block; width: 36px; height: 36px; border: 4px solid #334155; border-top-color: #6366f1; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h2>Awaiting Local Approval</h2>
    <p>Client <strong>${clientNameSafe}</strong> has requested access to Nexus.</p>
    <div style="background: #0f172a; border: 1px solid #4338ca; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <div style="font-size: 13px; color: #94a3b8; margin-bottom: 6px;">配对码 / Pairing Code</div>
      <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #a5b4fc; font-family: monospace;">${escapeHtml(pending.pairingCode)}</div>
      <div style="font-size: 12px; color: #cbd5e1; margin-top: 6px;">请在桌面端核对并确认此配对码</div>
    </div>
    <p>Please open <strong>Nexus Desktop</strong> to approve this connection.</p>
  </div>
  <script nonce="${nonce}">
    setInterval(async () => {
      try {
        const res = await fetch('/oauth/requests/${pending.id}/status');
        const data = await res.json();
        if ((data.status === 'approved' || data.status === 'denied') && data.redirectUrl) {
          window.location.href = data.redirectUrl;
        } else if (data.status === 'expired') {
          const card = document.querySelector('.card');
          if (card) {
            card.innerHTML = '<h2>Request Expired</h2><p>This authorization request has expired. Please return to ' + ${JSON.stringify(clientNameSafe)} + ' and try connecting again.</p>';
          }
        }
      } catch {}
    }, 2000);
  </script>
</body>
</html>`;
        sendHtml(res, 202, waitHtml, nonce, baseUrl);
        return;
      } catch (err: any) {
        sendErrorHtml(res, 400, err.message);
        return;
      }
    }
  }

  // 8. OAuth 2.0 Token Endpoint (RFC 6749)
  if (pathname === "/oauth/token") {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_request", error_description: "POST required" }));
      return;
    }

    try {
      const rawBody = await readRequestBody(req);
      const body = parseFormOrJsonBody(rawBody, req.headers["content-type"]);

      // Extract client credentials from Basic Auth if present
      let clientId = body.client_id;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.toLowerCase().startsWith("basic ")) {
        try {
          const creds = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
          const [id] = creds.split(":");
          if (id) clientId = id;
        } catch {}
      }

      const grantType = body.grant_type;

      if (grantType === "authorization_code") {
        const code = body.code;
        const redirectUri = body.redirect_uri;
        const codeVerifier = body.code_verifier;

        if (!code) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "invalid_request",
              error_description: "Missing required parameter 'code'",
            })
          );
          return;
        }

        const exchange = oauthStore.exchangeCode({
          code,
          client_id: clientId,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        });

        if (!exchange.success || !exchange.tokenResponse) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "invalid_grant",
              error_description: exchange.error || "Token exchange failed",
            })
          );
          return;
        }

        res.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          Pragma: "no-cache",
        });
        res.end(JSON.stringify(exchange.tokenResponse));
        return;
      }

      if (grantType === "refresh_token") {
        const refreshToken = body.refresh_token;
        if (!refreshToken) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "invalid_request",
              error_description: "Missing required parameter 'refresh_token'",
            })
          );
          return;
        }

        const refreshed = oauthStore.refreshAccessToken(refreshToken);
        if (!refreshed.success || !refreshed.tokenResponse) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "invalid_grant",
              error_description: refreshed.error || "Refresh token invalid or expired",
            })
          );
          return;
        }

        res.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          Pragma: "no-cache",
        });
        res.end(JSON.stringify(refreshed.tokenResponse));
        return;
      }

      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "unsupported_grant_type",
          error_description: `Grant type '${grantType}' is not supported. Use 'authorization_code' or 'refresh_token'.`,
        })
      );
      return;
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "server_error", error_description: err.message }));
      return;
    }
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
          oauthMetadata: `${baseUrl}/.well-known/oauth-protected-resource`,
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
              version: "1.3.4",
            },
            instructions:
              "# Nexus Universal MCP Execution Gateway\n- Native desktop and execution tools are provided directly by Canonical Nexus Tools.\n- External environments (including Unity GameDev tools on 127.0.0.1:20705) are aggregated seamlessly.\n- All actions are safely verified and logged.",
            server: "nexus-mcp-bridge",
            version: "1.3.4",
            _meta: {
              "io.modelcontextprotocol/serverInfo": {
                name: "nexus-mcp-bridge",
                version: "1.3.4",
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
    // 1) If Authorization header is provided, validate strictly (Bearer or OAuth)
    // 2) If no Authorization header is provided, permit unauthenticated access (supports
    //    ChatGPT "无身份验证" mode, public tool discovery, and loopback clients)
    if (req.headers.authorization) {
      const authCheck = validateRequestAuth(req.headers.authorization, BRIDGE_TOKEN, oauthStore);
      if (!authCheck.valid) {
        const wwwAuth = buildWwwAuthenticateHeader(baseUrl, "invalid_token");
        res.setHeader("WWW-Authenticate", wwwAuth);
        res.setHeader("Link", `<${baseUrl}/.well-known/oauth-protected-resource>; rel="oauth-protected-resource"`);
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: `Unauthorized: ${authCheck.error || "Invalid token"}. Please authenticate via OAuth 2.0 or supply valid Bearer token.`,
              data: {
                resource_metadata: `${baseUrl}/.well-known/oauth-protected-resource`,
                authorization_server: `${baseUrl}/.well-known/oauth-authorization-server`,
              },
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
      message: "Nexus MCP Bridge with OAuth 2.0. Use POST /mcp or GET /health.",
      discovery: {
        oauthProtectedResource: `${baseUrl}/.well-known/oauth-protected-resource`,
        oauthAuthorizationServer: `${baseUrl}/.well-known/oauth-authorization-server`,
      },
    })
  );
});


export const NX_CANARY_SIG = "NX_CANARY_8829F_PROD_2026";

server.listen(PORT, HOST, () => {
  console.log("==================================================");
  console.log("  Nexus MCP Bridge (Local MCP + OAuth 2.0)        ");
  console.log("==================================================");
  console.log(`  Local Endpoint:       http://${HOST}:${PORT}/mcp`);
  console.log(`  Health Check:         http://${HOST}:${PORT}/health`);
  console.log(`  Protected Resource:   http://${HOST}:${PORT}/.well-known/oauth-protected-resource`);
  console.log(`  Authorization Server: http://${HOST}:${PORT}/.well-known/oauth-authorization-server`);
  console.log(`  Downstream Nexus:     ${CORE_URL}`);
  console.log(`  Bearer Token Auth:    [ENABLED]`);
  console.log(`  OAuth 2.0 Auth:       [ENABLED]`);
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
