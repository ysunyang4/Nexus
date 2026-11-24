import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function getDefaultDataDir(): string {
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA || process.env.APPDATA || "C:\\ProgramData", "LocalBridge");
  }
  return path.join(process.env.HOME || ".", ".localbridge");
}

export interface OAuthConnection {
  connectionId: string;
  provider: "chatgpt" | "custom";
  clientId: string;
  clientName: string;
  accountIdentifier: string;
  scopes: string[];
  accessToken: string;
  refreshToken?: string;
  createdAt: number;
  expiresAt: number;
  lastUsedAt?: number;
  status: "connected" | "expired" | "revoked";
  metadata?: Record<string, unknown>;
}

export interface OAuthConnectionPublicDto {
  connectionId: string;
  provider: "chatgpt" | "custom";
  clientId: string;
  clientName: string;
  accountIdentifier: string;
  scopes: string[];
  tokenMasked: string;
  hasRefreshToken: boolean;
  createdAt: number;
  expiresAt: number;
  lastUsedAt?: number;
  status: "connected" | "expired" | "revoked";
  metadata?: Record<string, unknown>;
  cleanable?: boolean;
  cleanReason?: string;
  isTest?: boolean;
  isSuperseded?: boolean;
}

export interface OAuthClient {
  client_id: string;
  client_secret?: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  createdAt: number;
}

export interface AuthorizationCodeRecord {
  code: string;
  client_id: string;
  redirect_uri: string;
  scope: string;
  state?: string;
  code_challenge: string;
  code_challenge_method: "S256";
  expiresAt: number;
  used: boolean;
}

export interface OAuthAccessTokenRecord {
  access_token: string;
  token_type: "Bearer";
  client_id: string;
  scope: string;
  createdAt: number;
  expiresAt: number;
  refresh_token?: string;
}

export interface PendingAuthRequest {
  id: string;
  clientId: string;
  clientName: string;
  redirectUri: string;
  scope: string;
  state?: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  codeChallengeHash: string;
  pairingCode: string;
  pairingAttempts: number;
  createdAt: number;
  expiresAt: number;
  status: "pending" | "approved" | "denied" | "expired";
  code?: string;
  redirectUrl?: string;
  resolvedBy?: string;
}

export const SUPPORTED_SCOPES = [
  "nexus:read",
  "nexus:write",
  "nexus:project",
  "nexus:git",
  "nexus:runtime",
  "read",
  "write",
  "mcp",
  "offline_access",
  "openid",
] as const;

export const DEFAULT_SCOPES = "nexus:read nexus:write nexus:project nexus:git nexus:runtime";

/**
 * Validates whether a redirect_uri belongs to an allowed authority:
 * - OpenAI / ChatGPT official domains
 * - Localhost loopback (for local testing/tooling)
 * - Cloudflare Quick Tunnels (*.trycloudflare.com)
 * - Configured production base URL (PUBLIC_BASE_URL)
 */
export function isRedirectUriAllowed(uri: string, customBaseUrl?: string): boolean {
  if (!uri || typeof uri !== "string") return false;
  // Wildcards and fragments are strictly forbidden
  if (uri === "*" || uri.includes("*") || uri.includes("#")) return false;

  // Standard OAuth 2.0 Out-of-Band
  if (uri.startsWith("urn:ietf:wg:oauth:2.0:oob")) {
    return true;
  }

  try {
    const parsed = new URL(uri);
    const host = parsed.hostname.toLowerCase();
    const proto = parsed.protocol.toLowerCase();

    // 1. Loopback check (http or https allowed for localhost/127.0.0.1)
    if (host === "localhost" || host === "127.0.0.1") {
      return proto === "http:" || proto === "https:";
    }

    // 2. All external redirects MUST be HTTPS with valid non-empty hostname
    if (proto !== "https:" || !host) {
      return false;
    }

    // 3. ChatGPT & OpenAI official OAuth callback endpoints
    if (
      host === "chatgpt.com" ||
      host.endsWith(".chatgpt.com") ||
      host === "openai.com" ||
      host.endsWith(".openai.com")
    ) {
      return true;
    }

    // 5. Cloudflare Quick Tunnels
    if (host.endsWith(".trycloudflare.com")) {
      return true;
    }

    // 6. Configured custom domain / base URL
    const envBase = customBaseUrl || process.env.PUBLIC_BASE_URL;
    if (envBase) {
      try {
        const baseParsed = new URL(envBase);
        if (parsed.origin === baseParsed.origin || host === baseParsed.hostname.toLowerCase()) {
          return true;
        }
      } catch {}
    }

    return false;
  } catch {
    return false;
  }
}

export class OAuthStore {
  private clients = new Map<string, OAuthClient>();
  private authCodes = new Map<string, AuthorizationCodeRecord>();
  private accessTokens = new Map<string, OAuthAccessTokenRecord>();
  private refreshTokens = new Map<string, string>(); // refresh_token -> access_token
  private pendingRequests = new Map<string, PendingAuthRequest>();
  private connections = new Map<string, OAuthConnection>(); // connectionId -> OAuthConnection
  private storageFilePath: string;

  constructor(customStoragePath?: string) {
    this.storageFilePath =
      customStoragePath ||
      process.env.NEXUS_OAUTH_STORAGE_PATH ||
      path.join(getDefaultDataDir(), "data", "oauth-storage.json");
    this.initDefaultClients();
    this.loadFromDisk();
  }

  private initDefaultClients(): void {
    const defaultUris = [
      "https://chatgpt.com/api/mcp/oauth_callback",
      "https://chat.openai.com/api/mcp/oauth_callback",
      "http://localhost/callback",
      "https://localhost/callback",
    ];

    if (process.env.PUBLIC_BASE_URL) {
      try {
        const origin = new URL(process.env.PUBLIC_BASE_URL).origin;
        defaultUris.push(`${origin}/oauth/callback`);
      } catch {}
    }

    this.registerClientInternal({
      client_id: "chatgpt",
      client_name: "ChatGPT",
      redirect_uris: defaultUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });

    this.registerClientInternal({
      client_id: "mcp-default-client",
      client_name: "Default MCP Client",
      redirect_uris: defaultUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
  }

  public loadFromDisk(): void {
    try {
      if (fs.existsSync(this.storageFilePath)) {
        const raw = fs.readFileSync(this.storageFilePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.clients)) {
          for (const c of parsed.clients) {
            if (c.client_id) {
              this.clients.set(c.client_id, c);
            }
          }
        }
        if (Array.isArray(parsed.accessTokens)) {
          for (const t of parsed.accessTokens) {
            if (t.access_token) {
              this.accessTokens.set(t.access_token, t);
            }
          }
        }
        if (parsed.refreshTokens && typeof parsed.refreshTokens === "object") {
          for (const [rt, at] of Object.entries(parsed.refreshTokens)) {
            if (typeof at === "string") {
              this.refreshTokens.set(rt, at);
            }
          }
        }
        if (Array.isArray(parsed.connections)) {
          const now = Date.now();
          const oneYearMs = 365 * 24 * 3600 * 1000;
          let changed = false;
          for (const conn of parsed.connections) {
            if (conn.connectionId) {
              // Auto-revive any non-revoked connection to connected state with 1-year lifetime
              if (conn.status !== "revoked") {
                if (conn.expiresAt < now + 7 * 24 * 3600 * 1000) {
                  conn.expiresAt = now + oneYearMs;
                  changed = true;
                }
                conn.status = "connected";
                if (conn.accessToken) {
                  const existingRecord = this.accessTokens.get(conn.accessToken);
                  if (!existingRecord || existingRecord.expiresAt < now) {
                    const tokenRec: OAuthAccessTokenRecord = {
                      access_token: conn.accessToken,
                      token_type: "Bearer",
                      client_id: conn.clientId,
                      scope: Array.isArray(conn.scopes) ? conn.scopes.join(" ") : (conn.scopes || DEFAULT_SCOPES),
                      createdAt: conn.createdAt || now,
                      expiresAt: conn.expiresAt,
                      refresh_token: conn.refreshToken,
                    };
                    this.accessTokens.set(conn.accessToken, tokenRec);
                    changed = true;
                  }
                  if (conn.refreshToken) {
                    this.refreshTokens.set(conn.refreshToken, conn.accessToken);
                  }
                }
              }
              this.connections.set(conn.connectionId, conn);
            }
          }
          if (changed) {
            this.saveToDisk();
          }
        }
      }
    } catch (err: any) {
      console.warn(`[OAuthStore] Error loading storage from disk: ${err.message}`);
    }
  }

  public saveToDisk(): void {
    try {
      const dir = path.dirname(this.storageFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = {
        version: 1,
        clients: Array.from(this.clients.values()),
        accessTokens: Array.from(this.accessTokens.values()),
        refreshTokens: Object.fromEntries(this.refreshTokens.entries()),
        connections: Array.from(this.connections.values()),
        updatedAt: Date.now(),
      };
      const tmpPath = `${this.storageFilePath}.tmp_${process.pid}_${Date.now()}`;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
      fs.renameSync(tmpPath, this.storageFilePath);
    } catch (err: any) {
      console.warn(`[OAuthStore] Error saving storage to disk: ${err.message}`);
    }
  }

  public clearDynamicClientsAndTokens(): void {
    this.authCodes.clear();
    this.accessTokens.clear();
    this.refreshTokens.clear();
    this.pendingRequests.clear();
    this.clients.clear();
    this.connections.clear();
    this.initDefaultClients();
    try {
      if (fs.existsSync(this.storageFilePath)) {
        fs.unlinkSync(this.storageFilePath);
      }
    } catch {}
  }

  private registerClientInternal(client: Omit<OAuthClient, "createdAt">): OAuthClient {
    const full: OAuthClient = {
      ...client,
      createdAt: Date.now(),
    };
    this.clients.set(full.client_id, full);
    return full;
  }

  public cleanupExpiredClients(): void {
    const now = Date.now();
    const defaultIds = new Set(["chatgpt", "mcp-default-client", "client_3abcb70aed9f282b082b24b0614ccc4d"]);

    // Dynamic clients are persistent credentials (RFC 7591) and should not expire in 24 hours.
    // If client storage exceeds 500, prune only stale dynamic clients inactive for over 180 days.
    if (this.clients.size > 500) {
      for (const [clientId, client] of this.clients.entries()) {
        if (defaultIds.has(clientId)) continue;
        if (now - client.createdAt > 180 * 24 * 60 * 60 * 1000) {
          this.clients.delete(clientId);
        }
      }
    }

    for (const [code, record] of this.authCodes.entries()) {
      if (now > record.expiresAt || record.used) {
        this.authCodes.delete(code);
      }
    }

    for (const [id, req] of this.pendingRequests.entries()) {
      if (now > req.expiresAt + 60 * 1000) {
        this.pendingRequests.delete(id);
      }
    }
  }

  /**
   * Checks if an unknown client_id can be auto-healed.
   * Auto-healing is permitted if:
   * 1. It matches our dynamic client format (^client_[a-f0-9]{32}$)
   * 2. The redirect_uri is an allowed callback (e.g. ChatGPT official domain, or configured host)
   */
  public canAutoHeal(clientId: string, redirectUri: string): boolean {
    if (!clientId || !redirectUri) return false;
    if (clientId === "client_3abcb70aed9f282b082b24b0614ccc4d") {
      return isRedirectUriAllowed(redirectUri);
    }
    if (!/^client_[a-f0-9]{32}$/.test(clientId)) return false;
    return isRedirectUriAllowed(redirectUri);
  }

  /**
   * Rehydrates / auto-heals an OAuth client on-the-fly.
   */
  public autoHealClient(clientId: string, redirectUri: string, clientName?: string): OAuthClient {
    const existing = this.clients.get(clientId);
    if (existing) {
      if (!existing.redirect_uris.includes(redirectUri)) {
        existing.redirect_uris.push(redirectUri);
        this.saveToDisk();
      }
      return existing;
    }

    const name = clientName || "ChatGPT / MCP Client";
    const defaultUris = [
      redirectUri,
      "https://chatgpt.com/api/mcp/oauth_callback",
      "https://chatgpt.com/callback",
      "http://localhost/callback",
      "https://localhost/callback",
    ];
    if (process.env.PUBLIC_BASE_URL) {
      try {
        const origin = new URL(process.env.PUBLIC_BASE_URL).origin;
        defaultUris.push(`${origin}/oauth/callback`);
      } catch {}
    }

    const healed: OAuthClient = {
      client_id: clientId,
      client_name: name,
      redirect_uris: Array.from(new Set(defaultUris)),
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      createdAt: Date.now(),
    };
    this.clients.set(clientId, healed);
    this.saveToDisk();
    console.info(`[OAuthStore] Auto-healed client credentials for '${clientId}' (${name})`);
    return healed;
  }

  /**
   * Validates whether a redirect_uri is registered for a client.
   * If the redirect_uri is allowed by the security policy (e.g. Google user-bound callback,
   * official Gemini/Claude endpoint, localhost, or configured domain), it is automatically
   * registered and persisted for this client.
   */
  public isClientRedirectUriAllowed(client: OAuthClient, redirectUri: string): boolean {
    if (!client || !redirectUri) return false;
    if (client.redirect_uris.includes(redirectUri)) return true;
    if (isRedirectUriAllowed(redirectUri)) {
      client.redirect_uris.push(redirectUri);
      this.saveToDisk();
      console.info(
        `[OAuthStore] Auto-registered allowed redirect_uri '${redirectUri}' for client '${client.client_id}'`
      );
      return true;
    }
    return false;
  }

  /**
   * Registers a new OAuth client dynamically (RFC 7591 Dynamic Client Registration).
   * Enforces strict redirect_uri validation against allowed domains and limits total clients.
   */
  public registerClient(params: {
    client_name?: string;
    redirect_uris?: string[];
    grant_types?: string[];
    response_types?: string[];
    token_endpoint_auth_method?: string;
  }): OAuthClient {
    this.cleanupExpiredClients();

    if (this.clients.size >= 500) {
      throw new Error("Maximum registered OAuth clients limit reached (500). Please retry later.");
    }

    const clientName = params.client_name || "ChatGPT / MCP Client";
    const redirectUris: string[] = [];

    if (params.redirect_uris && params.redirect_uris.length > 0) {
      for (const uri of params.redirect_uris) {
        if (!isRedirectUriAllowed(uri)) {
          throw new Error(
            `Forbidden redirect_uri: '${uri}'. Must be ChatGPT/OpenAI domain, configured host, or localhost.`
          );
        }
        redirectUris.push(uri);
      }
    } else {
      redirectUris.push(
        "https://chatgpt.com/api/mcp/oauth_callback",
        "https://chatgpt.com/callback",
        "http://localhost/callback"
      );
    }

    // Reuse registered client if client_name and redirect_uris match to prevent client registration leaks
    for (const c of this.clients.values()) {
      if (c.client_name === clientName && c.redirect_uris.length === redirectUris.length && c.redirect_uris.every((u, i) => u === redirectUris[i])) {
        return c;
      }
    }

    const isPublicClient = params.token_endpoint_auth_method === "none";
    const clientId = `client_${crypto.randomBytes(16).toString("hex")}`;
    const clientSecret = isPublicClient ? undefined : `secret_${crypto.randomBytes(24).toString("hex")}`;
    const client: OAuthClient = {
      client_id: clientId,
      client_secret: clientSecret,
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: params.grant_types || ["authorization_code", "refresh_token"],
      response_types: params.response_types || ["code"],
      createdAt: Date.now(),
    };
    this.clients.set(clientId, client);
    this.saveToDisk();
    return client;
  }

  public getClient(clientId: string): OAuthClient | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Creates a pending authorization request requiring local desktop approval.
   */
  public createPendingAuthRequest(params: {
    client_id: string;
    redirect_uri: string;
    scope?: string;
    state?: string;
    code_challenge?: string;
    code_challenge_method?: "S256" | "plain";
  }): PendingAuthRequest {
    let client = this.clients.get(params.client_id);
    if (!client) {
      if (this.canAutoHeal(params.client_id, params.redirect_uri)) {
        client = this.autoHealClient(params.client_id, params.redirect_uri);
      } else {
        throw new Error(`Unknown client_id: '${params.client_id}'`);
      }
    }

    if (!isRedirectUriAllowed(params.redirect_uri)) {
      throw new Error(`Unauthorized redirect_uri: '${params.redirect_uri}'`);
    }

    if (!this.isClientRedirectUriAllowed(client, params.redirect_uri)) {
      throw new Error(
        `redirect_uri '${params.redirect_uri}' is not registered for client '${params.client_id}'`
      );
    }

    if (!params.code_challenge) {
      throw new Error("Missing required 'code_challenge' parameter (PKCE is mandatory)");
    }

    if (!params.code_challenge_method || params.code_challenge_method !== "S256") {
      throw new Error("Invalid 'code_challenge_method'. Only 'S256' is supported.");
    }

    const now = Date.now();
    for (const pendingReq of this.pendingRequests.values()) {
      if (pendingReq.status === "pending" && now > pendingReq.expiresAt) {
        pendingReq.status = "expired";
      }
    }

    const activePending = Array.from(this.pendingRequests.values()).filter(
      (r) => r.status === "pending" && now <= r.expiresAt
    );
    if (activePending.length >= 50) {
      throw new Error(
        "Pending authorization requests limit reached (50). Please resolve or wait for existing requests to expire."
      );
    }

    const id = `oauth_req_${crypto.randomBytes(16).toString("hex")}`;
    const codeChallenge = params.code_challenge;
    const codeChallengeHash = crypto.createHash("sha256").update(codeChallenge).digest("hex");
    const pairingCode = crypto.randomInt(100000, 1000000).toString();

    const req: PendingAuthRequest = {
      id,
      clientId: params.client_id,
      clientName: client.client_name,
      redirectUri: params.redirect_uri,
      scope: params.scope || DEFAULT_SCOPES,
      state: params.state,
      codeChallenge,
      codeChallengeMethod: "S256",
      codeChallengeHash,
      pairingCode,
      pairingAttempts: 0,
      createdAt: now,
      expiresAt: now + 5 * 60 * 1000, // 5 minutes expiry
      status: "pending",
    };

    this.pendingRequests.set(id, req);
    return req;
  }

  public getPendingAuthRequest(id: string): PendingAuthRequest | undefined {
    const req = this.pendingRequests.get(id);
    if (!req) return undefined;
    if (req.status === "pending" && Date.now() > req.expiresAt) {
      req.status = "expired";
    }
    return req;
  }

  public listPendingAuthRequests(): Array<{
    id: string;
    client_name: string;
    clientName: string;
    redirect_host: string;
    redirect_uri_host: string;
    created_at: number;
    createdAt: number;
    remaining_attempts: number;
    remainingAttempts: number;
    status: string;
  }> {
    const now = Date.now();
    const result: any[] = [];
    for (const req of this.pendingRequests.values()) {
      if (req.status === "pending" && now <= req.expiresAt) {
        let host = "";
        try {
          host = new URL(req.redirectUri).hostname;
        } catch {
          host = "unknown";
        }
        const remaining = Math.max(0, 3 - (req.pairingAttempts || 0));
        result.push({
          id: req.id,
          client_name: req.clientName,
          clientName: req.clientName,
          redirect_host: host,
          redirect_uri_host: host,
          redirect_uri: req.redirectUri,
          redirectUri: req.redirectUri,
          created_at: req.createdAt,
          createdAt: req.createdAt,
          expires_at: req.expiresAt,
          expiresAt: req.expiresAt,
          remaining_attempts: remaining,
          remainingAttempts: remaining,
          status: req.status,
        });
      }
    }
    return result;
  }

  public resolvePendingAuthRequest(
    id: string,
    action: "approve" | "deny",
    pairingCode?: string,
    resolvedBy = "local-desktop",
    issuer?: string
  ): { success: boolean; error?: string; code?: string; redirectUrl?: string } {
    const req = this.getPendingAuthRequest(id);
    if (!req) {
      return { success: false, error: "Pending authorization request not found" };
    }

    if (req.status !== "pending") {
      return { success: false, error: `Request is already ${req.status}` };
    }

    if (Date.now() > req.expiresAt) {
      req.status = "expired";
      return { success: false, error: "Authorization request has expired" };
    }

    const effectiveIssuer = (issuer || process.env.PUBLIC_BASE_URL || "http://127.0.0.1:8787").replace(/\/+$/, "");

    if (action === "approve") {
      if (typeof req.pairingAttempts !== "number") req.pairingAttempts = 0;
      if (req.pairingAttempts >= 3) {
        req.status = "denied";
        return {
          success: false,
          error: "Too many failed pairing code attempts. Request has been denied.",
        };
      }

      if (!pairingCode) {
        return { success: false, error: "Missing required pairing_code" };
      }

      const bufGiven = Buffer.from(String(pairingCode).trim());
      const bufActual = Buffer.from(req.pairingCode || "");
      const isMatch =
        bufGiven.length === bufActual.length &&
        bufGiven.length > 0 &&
        crypto.timingSafeEqual(bufGiven, bufActual);

      if (!isMatch) {
        req.pairingAttempts += 1;
        if (req.pairingAttempts >= 3) {
          req.status = "denied";
          return {
            success: false,
            error: "Incorrect pairing code. Maximum attempts exceeded, request denied.",
          };
        }
        return {
          success: false,
          error: `Incorrect pairing code. ${3 - req.pairingAttempts} attempt(s) remaining.`,
        };
      }
    }

    req.resolvedBy = resolvedBy;

    if (action === "deny") {
      req.status = "denied";
      const targetUrl = new URL(req.redirectUri);
      targetUrl.searchParams.set("error", "access_denied");
      targetUrl.searchParams.set("error_description", "User denied authorization request");
      if (req.state) targetUrl.searchParams.set("state", req.state);
      targetUrl.searchParams.set("iss", effectiveIssuer);
      req.redirectUrl = targetUrl.toString();
      return { success: true, redirectUrl: req.redirectUrl };
    }

    try {
      const code = this.createAuthorizationCode({
        client_id: req.clientId,
        redirect_uri: req.redirectUri,
        scope: req.scope,
        state: req.state,
        code_challenge: req.codeChallenge,
        code_challenge_method: req.codeChallengeMethod,
      });

      req.status = "approved";
      req.code = code;

      const targetUrl = new URL(req.redirectUri);
      targetUrl.searchParams.set("code", code);
      if (req.state) targetUrl.searchParams.set("state", req.state);
      targetUrl.searchParams.set("iss", effectiveIssuer);
      req.redirectUrl = targetUrl.toString();

      return { success: true, code, redirectUrl: req.redirectUrl };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Generates and stores a short-lived authorization code (valid for 5 minutes).
   * Validates client and registered redirect_uri strictly.
   */
  public createAuthorizationCode(params: {
    client_id: string;
    redirect_uri: string;
    scope?: string;
    state?: string;
    code_challenge?: string;
    code_challenge_method?: "S256" | "plain" | string;
  }): string {
    if (!isRedirectUriAllowed(params.redirect_uri)) {
      throw new Error(`Unauthorized redirect_uri: '${params.redirect_uri}'`);
    }

    let client = this.clients.get(params.client_id);
    if (!client) {
      if (this.canAutoHeal(params.client_id, params.redirect_uri)) {
        client = this.autoHealClient(params.client_id, params.redirect_uri);
      } else {
        throw new Error(`Unknown client_id: '${params.client_id}'`);
      }
    }

    if (!this.isClientRedirectUriAllowed(client, params.redirect_uri)) {
      throw new Error(
        `redirect_uri '${params.redirect_uri}' is not registered for client '${params.client_id}'`
      );
    }

    if (!params.code_challenge) {
      throw new Error("Missing required 'code_challenge' parameter (PKCE is mandatory)");
    }

    if (!params.code_challenge_method || params.code_challenge_method !== "S256") {
      throw new Error("Invalid 'code_challenge_method'. Only 'S256' is supported.");
    }

    const code = `oa_code_${crypto.randomBytes(24).toString("hex")}`;
    const record: AuthorizationCodeRecord = {
      code,
      client_id: params.client_id,
      redirect_uri: params.redirect_uri,
      scope: params.scope || DEFAULT_SCOPES,
      state: params.state,
      code_challenge: params.code_challenge,
      code_challenge_method: "S256",
      expiresAt: Date.now() + 5 * 60 * 1000,
      used: false,
    };
    this.authCodes.set(code, record);
    return code;
  }

  /**
   * Exchanges an authorization code for an Access Token and Refresh Token (RFC 6749 + PKCE RFC 7636).
   */
  public exchangeCode(params: {
    code: string;
    client_id?: string;
    redirect_uri?: string;
    code_verifier?: string;
  }): {
    success: boolean;
    error?: string;
    tokenResponse?: {
      access_token: string;
      token_type: "Bearer";
      expires_in: number;
      refresh_token: string;
      scope: string;
    };
  } {
    const record = this.authCodes.get(params.code);
    if (!record) {
      return { success: false, error: "Invalid authorization code" };
    }

    if (record.used) {
      return { success: false, error: "Authorization code has already been used" };
    }

    if (Date.now() > record.expiresAt) {
      this.authCodes.delete(params.code);
      return { success: false, error: "Authorization code has expired" };
    }

    // Strict redirect_uri verification: if record had redirect_uri, token exchange MUST provide it
    if (record.redirect_uri) {
      if (!params.redirect_uri) {
        return { success: false, error: "Missing required 'redirect_uri' parameter in token exchange" };
      }
      try {
        const recUrl = new URL(record.redirect_uri);
        const reqUrl = new URL(params.redirect_uri);
        if (recUrl.origin !== reqUrl.origin || recUrl.pathname !== reqUrl.pathname) {
          return { success: false, error: "redirect_uri mismatch with authorization request" };
        }
      } catch {
        return { success: false, error: "Malformed redirect_uri parameter" };
      }
    }

    // Strict PKCE enforcement (RFC 7636)
    if (!record.code_challenge) {
      return { success: false, error: "Authorization code lacks PKCE challenge" };
    }

    if (!params.code_verifier) {
      return { success: false, error: "Missing required 'code_verifier' parameter for PKCE" };
    }

    const RFC7636_VERIFIER_REGEX = /^[A-Za-z0-9\-._~]{43,128}$/;
    if (!RFC7636_VERIFIER_REGEX.test(params.code_verifier)) {
      return {
        success: false,
        error: "Invalid 'code_verifier': must be 43-128 unreserved characters ([A-Za-z0-9-._~]) per RFC 7636",
      };
    }

    if (record.code_challenge_method !== "S256") {
      return { success: false, error: "Unsupported code_challenge_method. Only S256 is supported" };
    }

    const hash = crypto.createHash("sha256").update(params.code_verifier).digest("base64url");
    const hashBuf = Buffer.from(hash);
    const challengeBuf = Buffer.from(record.code_challenge);
    if (hashBuf.length !== challengeBuf.length || !crypto.timingSafeEqual(hashBuf, challengeBuf)) {
      return { success: false, error: "PKCE verification failed: S256 challenge mismatch" };
    }

    // Mark code as used immediately
    record.used = true;

    // Issue Access Token & Refresh Token
    const accessToken = `mcp_oa_${crypto.randomBytes(32).toString("hex")}`;
    const refreshToken = `mcp_rt_${crypto.randomBytes(32).toString("hex")}`;
    const expiresInSeconds = 365 * 24 * 3600; // 365 days for personal desktop bridge

    const tokenRecord: OAuthAccessTokenRecord = {
      access_token: accessToken,
      token_type: "Bearer",
      client_id: record.client_id,
      scope: record.scope,
      createdAt: Date.now(),
      expiresAt: Date.now() + expiresInSeconds * 1000,
      refresh_token: refreshToken,
    };

    this.accessTokens.set(accessToken, tokenRecord);
    this.refreshTokens.set(refreshToken, accessToken);

    // Multi-Account Connection Registry
    const client = this.clients.get(record.client_id);
    const clientName = client?.client_name || "Unknown Client";
    let provider: "chatgpt" | "custom" = "custom";
    const lowerName = clientName.toLowerCase();
    const lowerRedirect = (record.redirect_uri || "").toLowerCase();
    if (lowerName.includes("chatgpt") || lowerRedirect.includes("chatgpt") || lowerRedirect.includes("openai")) {
      provider = "chatgpt";
    }

    const now = Date.now();
    const expiresAt = now + expiresInSeconds * 1000;

    // Check if an existing connection for this clientId/clientName & provider exists to reuse it
    let existingConn: OAuthConnection | undefined;
    for (const c of this.connections.values()) {
      if (
        (c.clientId === record.client_id || (c.clientName === clientName && c.metadata?.redirectUri === record.redirect_uri)) &&
        c.provider === provider
      ) {
        existingConn = c;
        break;
      }
    }

    let connectionId: string;
    let accountIdentifier: string;

    if (existingConn) {
      connectionId = existingConn.connectionId;
      accountIdentifier = existingConn.accountIdentifier;
      if (existingConn.accessToken) {
        this.accessTokens.delete(existingConn.accessToken);
      }
      if (existingConn.refreshToken) {
        this.refreshTokens.delete(existingConn.refreshToken);
      }
      existingConn.clientId = record.client_id;
      existingConn.clientName = clientName;
      existingConn.accessToken = accessToken;
      existingConn.refreshToken = refreshToken;
      existingConn.expiresAt = expiresAt;
      existingConn.lastUsedAt = now;
      existingConn.status = "connected";
      existingConn.scopes = (record.scope || DEFAULT_SCOPES).split(" ").filter(Boolean);
      existingConn.metadata = { redirectUri: record.redirect_uri };
    } else {
      const activeProviderConnections = Array.from(this.connections.values()).filter(
        (c) => c.provider === provider && c.status === "connected" && c.expiresAt > now
      );
      const accountIndex = activeProviderConnections.length + 1;
      const providerLabel = provider === "chatgpt" ? "ChatGPT" : "Client";
      accountIdentifier = `${providerLabel} Account ${String.fromCharCode(64 + Math.min(accountIndex, 26))}`;
      connectionId = `conn_${crypto.randomBytes(12).toString("hex")}`;

      const connection: OAuthConnection = {
        connectionId,
        provider,
        clientId: record.client_id,
        clientName,
        accountIdentifier,
        scopes: (record.scope || DEFAULT_SCOPES).split(" ").filter(Boolean),
        accessToken,
        refreshToken,
        createdAt: now,
        expiresAt,
        lastUsedAt: now,
        status: "connected",
        metadata: {
          redirectUri: record.redirect_uri,
        },
      };
      this.connections.set(connectionId, connection);
    }
    this.saveToDisk();

    return {
      success: true,
      tokenResponse: {
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: expiresInSeconds,
        refresh_token: refreshToken,
        scope: record.scope,
      },
    };
  }

  /**
   * Refreshes an expired or existing Access Token using a Refresh Token.
   */
  public refreshAccessToken(refreshToken: string): {
    success: boolean;
    error?: string;
    tokenResponse?: {
      access_token: string;
      token_type: "Bearer";
      expires_in: number;
      refresh_token: string;
      scope: string;
    };
  } {
    let oldAccessToken = this.refreshTokens.get(refreshToken);
    let targetConn: OAuthConnection | undefined;

    // Locate connection by refreshToken or oldAccessToken
    for (const conn of this.connections.values()) {
      if (conn.refreshToken === refreshToken || (oldAccessToken && conn.accessToken === oldAccessToken)) {
        targetConn = conn;
        break;
      }
    }

    if (!oldAccessToken && targetConn?.accessToken) {
      oldAccessToken = targetConn.accessToken;
    }

    let clientId = "";
    let scope = DEFAULT_SCOPES;

    const oldRecord = oldAccessToken ? this.accessTokens.get(oldAccessToken) : undefined;
    if (oldRecord) {
      clientId = oldRecord.client_id;
      scope = oldRecord.scope;
    } else if (targetConn) {
      clientId = targetConn.clientId;
      scope = Array.isArray(targetConn.scopes) ? targetConn.scopes.join(" ") : (targetConn.scopes || DEFAULT_SCOPES);
    } else {
      return { success: false, error: "Invalid refresh token or connection not found" };
    }

    // Issue new tokens with 1-year lifetime
    const newAccessToken = `mcp_oa_${crypto.randomBytes(32).toString("hex")}`;
    const newRefreshToken = `mcp_rt_${crypto.randomBytes(32).toString("hex")}`;
    const expiresInSeconds = 365 * 24 * 3600; // 365 days

    // Invalidate old tokens in memory
    if (oldAccessToken) {
      this.accessTokens.delete(oldAccessToken);
    }
    this.refreshTokens.delete(refreshToken);

    const newRecord: OAuthAccessTokenRecord = {
      access_token: newAccessToken,
      token_type: "Bearer",
      client_id: clientId,
      scope: scope,
      createdAt: Date.now(),
      expiresAt: Date.now() + expiresInSeconds * 1000,
      refresh_token: newRefreshToken,
    };

    this.accessTokens.set(newAccessToken, newRecord);
    this.refreshTokens.set(newRefreshToken, newAccessToken);

    if (targetConn) {
      targetConn.accessToken = newAccessToken;
      targetConn.refreshToken = newRefreshToken;
      targetConn.expiresAt = newRecord.expiresAt;
      targetConn.lastUsedAt = Date.now();
      targetConn.status = "connected";
    } else {
      for (const conn of this.connections.values()) {
        if (conn.refreshToken === refreshToken || (oldAccessToken && conn.accessToken === oldAccessToken)) {
          conn.accessToken = newAccessToken;
          conn.refreshToken = newRefreshToken;
          conn.expiresAt = newRecord.expiresAt;
          conn.lastUsedAt = Date.now();
          conn.status = "connected";
          break;
        }
      }
    }
    this.saveToDisk();

    return {
      success: true,
      tokenResponse: {
        access_token: newAccessToken,
        token_type: "Bearer",
        expires_in: expiresInSeconds,
        refresh_token: newRefreshToken,
        scope: scope,
      },
    };
  }

  /**
   * Validates an incoming OAuth Access Token.
   */
  public validateAccessToken(token: string): { valid: boolean; record?: OAuthAccessTokenRecord } {
    if (!token || !token.startsWith("mcp_oa_")) {
      return { valid: false };
    }

    let record = this.accessTokens.get(token);

    // If not in accessTokens map, look up in active connections
    if (!record) {
      for (const conn of this.connections.values()) {
        if (conn.accessToken === token && conn.status !== "revoked") {
          const autoRenewMs = 365 * 24 * 3600 * 1000;
          record = {
            access_token: token,
            token_type: "Bearer",
            client_id: conn.clientId,
            scope: Array.isArray(conn.scopes) ? conn.scopes.join(" ") : (conn.scopes || DEFAULT_SCOPES),
            createdAt: conn.createdAt || Date.now(),
            expiresAt: Math.max(conn.expiresAt, Date.now() + autoRenewMs),
            refresh_token: conn.refreshToken,
          };
          this.accessTokens.set(token, record);
          if (conn.refreshToken) {
            this.refreshTokens.set(conn.refreshToken, token);
          }
          conn.expiresAt = record.expiresAt;
          conn.status = "connected";
          conn.lastUsedAt = Date.now();
          this.saveToDisk();
          return { valid: true, record };
        }
      }
      return { valid: false };
    }

    // If expired, check if associated connection is valid and auto-renew
    if (Date.now() > record.expiresAt) {
      let associatedConn: OAuthConnection | undefined;
      for (const conn of this.connections.values()) {
        if (conn.accessToken === token) {
          associatedConn = conn;
          break;
        }
      }

      if (associatedConn && associatedConn.status !== "revoked") {
        const autoRenewMs = 365 * 24 * 3600 * 1000;
        record.expiresAt = Date.now() + autoRenewMs;
        associatedConn.expiresAt = record.expiresAt;
        associatedConn.status = "connected";
        associatedConn.lastUsedAt = Date.now();
        this.saveToDisk();
        return { valid: true, record };
      }

      this.accessTokens.delete(token);
      this.saveToDisk();
      return { valid: false };
    }

    for (const conn of this.connections.values()) {
      if (conn.accessToken === token) {
        conn.lastUsedAt = Date.now();
        break;
      }
    }

    return { valid: true, record };
  }

  public listConnections(): OAuthConnectionPublicDto[] {
    const now = Date.now();
    const cleanableMap = new Map<string, { reason: string; reasonText: string }>();
    try {
      for (const item of this.getCleanableConnections()) {
        cleanableMap.set(item.connection.connectionId, { reason: item.reason, reasonText: item.reasonText });
      }
    } catch {}

    const result: OAuthConnectionPublicDto[] = [];
    for (const conn of this.connections.values()) {
      let status = conn.status;
      if (status === "connected" && now > conn.expiresAt) {
        status = "expired";
      }
      const token = conn.accessToken || "";
      const masked = token.length > 12 ? `${token.slice(0, 7)}...${token.slice(-4)}` : "***";
      const cleanInfo = cleanableMap.get(conn.connectionId);
      result.push({
        connectionId: conn.connectionId,
        provider: conn.provider,
        clientId: conn.clientId,
        clientName: conn.clientName,
        accountIdentifier: conn.accountIdentifier,
        scopes: conn.scopes,
        tokenMasked: masked,
        hasRefreshToken: Boolean(conn.refreshToken),
        createdAt: conn.createdAt,
        expiresAt: conn.expiresAt,
        lastUsedAt: conn.lastUsedAt,
        status,
        metadata: conn.metadata,
        cleanable: Boolean(cleanInfo),
        cleanReason: cleanInfo?.reasonText,
        isTest: this.isTestConnection(conn),
        isSuperseded: cleanInfo?.reason === "superseded",
      });
    }
    return result;
  }

  public disconnectConnection(connectionId: string): { success: boolean; error?: string } {
    const conn = this.connections.get(connectionId);
    if (!conn) {
      return { success: false, error: "Connection not found" };
    }
    conn.status = "revoked";
    if (conn.accessToken) {
      this.accessTokens.delete(conn.accessToken);
    }
    if (conn.refreshToken) {
      this.refreshTokens.delete(conn.refreshToken);
    }
    this.saveToDisk();
    return { success: true };
  }

  public refreshConnection(connectionId: string): {
    success: boolean;
    error?: string;
    connection?: OAuthConnectionPublicDto;
  } {
    const conn = this.connections.get(connectionId);
    if (!conn) {
      return { success: false, error: "Connection not found" };
    }
    if (!conn.refreshToken) {
      return { success: false, error: "Connection does not have a refresh token" };
    }
    const res = this.refreshAccessToken(conn.refreshToken);
    if (!res.success || !res.tokenResponse) {
      return { success: false, error: res.error || "Failed to refresh token" };
    }
    const updated = this.listConnections().find((c) => c.connectionId === connectionId);
    return { success: true, connection: updated };
  }

  /**
   * Helper to identify automated test mock connections
   */
  public isTestConnection(conn: OAuthConnection): boolean {
    const redirect = String(conn.metadata?.redirectUri || "");
    const clientName = String(conn.clientName || "");
    const accountId = String(conn.accountIdentifier || "");
    return (
      redirect.includes("oauth_callback_b") ||
      redirect.includes("localhost/callback") ||
      redirect.includes("127.0.0.1/callback") ||
      /Account [A-D]/i.test(clientName) ||
      (/Account [A-D]/i.test(accountId) && redirect.includes("oauth_callback"))
    );
  }

  /**
   * Identifies all connections that are eligible for cleanup:
   * 1. Revoked / expired / idle over 30 days
   * 2. Automated test connections
   * 3. Superseded connections: for the same (provider, redirectUri), only keep the most recent N (default 2)
   */
  public getCleanableConnections(options: { keepRecentCount?: number } = {}): {
    connection: OAuthConnection;
    reason: "revoked" | "idle_over_30_days" | "expired" | "superseded" | "test_connection";
    reasonText: string;
  }[] {
    const keepRecent = typeof options.keepRecentCount === "number" ? options.keepRecentCount : 2;
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const cleanableList: {
      connection: OAuthConnection;
      reason: "revoked" | "idle_over_30_days" | "expired" | "superseded" | "test_connection";
      reasonText: string;
    }[] = [];
    const cleanableIds = new Set<string>();

    // 1. Check explicit invalid, idle, and test connections
    const candidateGroups = new Map<string, OAuthConnection[]>();

    for (const conn of this.connections.values()) {
      if (conn.status === "revoked") {
        cleanableList.push({
          connection: conn,
          reason: "revoked",
          reasonText: "已撤销授权",
        });
        cleanableIds.add(conn.connectionId);
        continue;
      }
      if (conn.status === "expired") {
        cleanableList.push({
          connection: conn,
          reason: "expired",
          reasonText: "连接已过期",
        });
        cleanableIds.add(conn.connectionId);
        continue;
      }
      const isIdleOver30Days = Boolean(
        (conn.lastUsedAt || conn.createdAt) && now - (conn.lastUsedAt || conn.createdAt) > thirtyDaysMs
      );
      if (isIdleOver30Days) {
        cleanableList.push({
          connection: conn,
          reason: "idle_over_30_days",
          reasonText: "闲置超过 30 天",
        });
        cleanableIds.add(conn.connectionId);
        continue;
      }
      if (this.isTestConnection(conn)) {
        cleanableList.push({
          connection: conn,
          reason: "test_connection",
          reasonText: "测试脚本模拟账号",
        });
        cleanableIds.add(conn.connectionId);
        continue;
      }

      // Group active real connections by provider + redirectUri
      const redirectUri = String(conn.metadata?.redirectUri || "default");
      const groupKey = `${conn.provider}::${redirectUri}`;
      if (!candidateGroups.has(groupKey)) {
        candidateGroups.set(groupKey, []);
      }
      candidateGroups.get(groupKey)!.push(conn);
    }

    // 2. In each (provider, redirectUri) group, only retain the most recent N active connections
    for (const [groupKey, list] of candidateGroups.entries()) {
      if (list.length > keepRecent) {
        // Sort descending by recency (lastUsedAt || createdAt)
        list.sort((a, b) => {
          const timeA = a.lastUsedAt || a.createdAt || 0;
          const timeB = b.lastUsedAt || b.createdAt || 0;
          return timeB - timeA;
        });

        // Connections beyond keepRecent are superseded
        const superseded = list.slice(keepRecent);
        for (const conn of superseded) {
          if (!cleanableIds.has(conn.connectionId)) {
            const timeStr = new Date(conn.lastUsedAt || conn.createdAt).toLocaleString("zh-CN");
            cleanableList.push({
              connection: conn,
              reason: "superseded",
              reasonText: `已由新授权取代 (同平台保留最近 ${keepRecent} 个连接，活跃于 ${timeStr})`,
            });
            cleanableIds.add(conn.connectionId);
          }
        }
      }
    }

    return cleanableList;
  }

  public getExpiredConnections(): OAuthConnection[] {
    return this.getCleanableConnections().map((item) => item.connection);
  }

  public cleanExpiredConnections(options: {
    connectionIds?: string[];
    target?: "test" | "all" | "expired" | "superseded";
    keepRecentCount?: number;
  } = {}): {
    cleanedCount: number;
    remainingCount: number;
    cleanedConnections: { connectionId: string; accountIdentifier: string; reason: string; reasonText?: string }[];
  } {
    const keepRecent = typeof options.keepRecentCount === "number" ? options.keepRecentCount : 2;
    const candidates = this.getCleanableConnections({ keepRecentCount: keepRecent });

    let toClean = candidates;
    if (options.target === "test") {
      toClean = candidates.filter((c) => c.reason === "test_connection");
    } else if (options.target === "expired") {
      toClean = candidates.filter((c) => c.reason === "revoked" || c.reason === "expired" || c.reason === "idle_over_30_days");
    } else if (options.target === "superseded") {
      toClean = candidates.filter((c) => c.reason === "superseded");
    }

    if (options.connectionIds && options.connectionIds.length > 0) {
      const idSet = new Set(options.connectionIds);
      toClean = toClean.filter((c) => idSet.has(c.connection.connectionId));
    }

    const cleanedConnections: { connectionId: string; accountIdentifier: string; reason: string; reasonText?: string }[] = [];
    for (const item of toClean) {
      const conn = item.connection;
      if (conn.accessToken) {
        this.accessTokens.delete(conn.accessToken);
      }
      if (conn.refreshToken) {
        this.refreshTokens.delete(conn.refreshToken);
      }
      this.connections.delete(conn.connectionId);
      cleanedConnections.push({
        connectionId: conn.connectionId,
        accountIdentifier: conn.accountIdentifier || conn.clientName || conn.connectionId,
        reason: item.reason,
        reasonText: item.reasonText,
      });
    }

    if (cleanedConnections.length > 0) {
      this.saveToDisk();
    }
    return { cleanedCount: cleanedConnections.length, remainingCount: this.connections.size, cleanedConnections };
  }
}

/**
 * Safe Host Header Allowlist to prevent Host Header Injection.
 */
export function isAllowedHost(hostWithOptionalPort: string): boolean {
  if (!hostWithOptionalPort) return false;
  const host = hostWithOptionalPort.split(":")[0].toLowerCase().trim();
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (host.endsWith(".trycloudflare.com")) return true;
  if (process.env.PUBLIC_BASE_URL) {
    try {
      const parsed = new URL(process.env.PUBLIC_BASE_URL);
      if (host === parsed.hostname.toLowerCase()) return true;
    } catch {}
  }
  if (process.env.ALLOWED_HOSTS) {
    const list = process.env.ALLOWED_HOSTS.split(",").map((h) => h.trim().toLowerCase());
    if (list.includes(host)) return true;
  }
  return false;
}

/**
 * Derives the canonical Public Base URL for OAuth discovery and redirects.
 * Respects PUBLIC_BASE_URL environment variable or proxy headers with strict host validation.
 * NEVER returns or synthesizes fake domains (*.nexus.localbridge.dev).
 */
export function resolveBaseUrl(req: http.IncomingMessage): string {
  if (process.env.PUBLIC_BASE_URL) {
    const configured = process.env.PUBLIC_BASE_URL.replace(/\/+$/, "");
    if (configured) return configured;
  }

  const rawForwardedHost = (req.headers["x-forwarded-host"] as string)?.split(",")[0]?.trim();
  const rawHost = rawForwardedHost || req.headers.host || "";
  const rawProto = ((req.headers["x-forwarded-proto"] as string) || "https").split(",")[0].trim().toLowerCase();

  if (rawHost && isAllowedHost(rawHost)) {
    const isLocal = rawHost.startsWith("127.0.0.1") || rawHost.startsWith("localhost");
    const effectiveProto = isLocal ? "http" : rawProto === "http" && !isLocal ? "https" : rawProto;
    return `${effectiveProto}://${rawHost}`.replace(/\/+$/, "");
  }

  return process.env.PUBLIC_BASE_URL || "http://127.0.0.1:8787";
}

/**
 * Builds the standard WWW-Authenticate header with RFC 9728 OAuth resource metadata link.
 */
export function buildWwwAuthenticateHeader(baseUrl: string, error?: string): string {
  const metadataUrl = `${baseUrl}/.well-known/oauth-protected-resource`;
  if (error) {
    return `Bearer realm="Nexus-MCP-Bridge", error="${error}", error_description="Authentication required", resource_metadata="${metadataUrl}"`;
  }
  return `Bearer realm="Nexus-MCP-Bridge", resource_metadata="${metadataUrl}"`;
}

/**
 * Renders the HTML consent page for MCP OAuth clients.
 */
// Mint Green & Cute Little Girl Avatar OAuth 2.0 Consent Page
export const GIRL_AVATAR_B64 = "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";

export function renderOAuthConsentHtml(params: {
  baseUrl: string;
  clientName: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  nonce?: string;
}): string {
  const {
    baseUrl,
    clientName,
    clientId,
    redirectUri,
    scope,
    state,
    codeChallenge,
    codeChallengeMethod,
    nonce,
  } = params;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="img-src 'self' data: https:;">
  <title>Nexus MCP Bridge — 授权请求</title>
  <style>
    :root {
      --mint-50: #f2fbf7;
      --mint-100: #e1f7ec;
      --mint-200: #c3eed9;
      --mint-300: #93dfbd;
      --mint-400: #5bc99c;
      --mint-500: #10b981;
      --mint-600: #059669;
      --mint-700: #047857;
      --mint-800: #065f46;
      --mint-900: #064e3b;
      --card-bg: rgba(255, 255, 255, 0.96);
      --border: rgba(167, 243, 208, 0.75);
      --shadow: 0 20px 45px -10px rgba(16, 185, 129, 0.18), 0 8px 16px -4px rgba(16, 185, 129, 0.08);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; }
    body {
      background: linear-gradient(135deg, #eefaf4 0%, #e6f7ef 40%, #daf4e7 100%);
      min-height: 100vh;
      color: #1e293b;
      padding: 30px 20px 40px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow-x: hidden;
    }
    .ambient-glow {
      position: fixed;
      top: -120px;
      left: 50%;
      transform: translateX(-50%);
      width: 800px;
      height: 500px;
      background: radial-gradient(circle, rgba(147, 223, 189, 0.35) 0%, rgba(240, 253, 244, 0) 70%);
      pointer-events: none;
      z-index: 0;
    }
    .oauth-wrapper {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 480px;
      background: var(--card-bg);
      backdrop-filter: blur(20px);
      border-radius: 26px;
      border: 1.5px solid var(--border);
      box-shadow: var(--shadow);
      padding: 32px 30px 28px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .avatar-wrapper {
      position: relative;
      margin-bottom: 14px;
    }
    .avatar-ring {
      width: 92px;
      height: 92px;
      border-radius: 50%;
      padding: 3px;
      background: linear-gradient(135deg, var(--mint-400), var(--mint-600));
      box-shadow: 0 8px 24px rgba(16, 185, 129, 0.28);
      display: flex;
      align-items: center;
      justify-content: center;
      animation: gentlePulse 3.5s infinite ease-in-out;
    }
    @keyframes gentlePulse {
      0%, 100% { box-shadow: 0 8px 24px rgba(16, 185, 129, 0.28); transform: scale(1); }
      50% { box-shadow: 0 12px 32px rgba(16, 185, 129, 0.42); transform: scale(1.03); }
    }
    .avatar-img {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
      background: #fff;
      border: 2px solid #ffffff;
    }
    .status-badge {
      position: absolute;
      bottom: 2px;
      right: 4px;
      background: #10b981;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 3px solid #ffffff;
      box-shadow: 0 2px 6px rgba(0,0,0,0.1);
    }
    .companion-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      background: var(--mint-100);
      color: var(--mint-800);
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 10px;
      border: 1px solid var(--mint-200);
    }
    .companion-tag svg { width: 13px; height: 13px; color: var(--mint-600); }
    .oauth-title {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.35;
      margin-bottom: 8px;
    }
    .oauth-title span {
      color: var(--mint-600);
    }
    .oauth-desc {
      font-size: 13px;
      color: #475569;
      line-height: 1.5;
      margin-bottom: 18px;
    }
    .caps-card {
      width: 100%;
      background: linear-gradient(180deg, #f7fdfa 0%, #f0fdf6 100%);
      border: 1px solid rgba(167, 243, 208, 0.85);
      border-radius: 16px;
      padding: 14px 16px;
      margin-bottom: 16px;
      text-align: left;
    }
    .caps-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(167, 243, 208, 0.5);
    }
    .caps-header-title {
      font-size: 12.5px;
      font-weight: 700;
      color: var(--mint-900);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .caps-count {
      font-size: 11px;
      font-weight: 700;
      background: var(--mint-200);
      color: var(--mint-900);
      padding: 2px 7px;
      border-radius: 10px;
    }
    .caps-list {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .caps-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #334155;
      line-height: 1.3;
    }
    .caps-check {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--mint-500);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 800;
      flex-shrink: 0;
    }
    .security-guarantee {
      width: 100%;
      background: rgba(255, 255, 255, 0.85);
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 9px 12px;
      font-size: 11.5px;
      color: #475569;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 20px;
      text-align: left;
    }
    .security-guarantee svg {
      width: 15px;
      height: 15px;
      color: var(--mint-600);
      flex-shrink: 0;
    }
    form {
      width: 100%;
    }
    .action-row {
      width: 100%;
      display: flex;
      gap: 12px;
    }
    .btn-mint-authorize {
      flex: 1.4;
      height: 44px;
      border: none;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--mint-500) 0%, var(--mint-600) 100%);
      color: #ffffff;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .btn-mint-authorize:hover {
      background: linear-gradient(135deg, var(--mint-400) 0%, var(--mint-500) 100%);
      transform: translateY(-1.5px);
      box-shadow: 0 6px 20px rgba(16, 185, 129, 0.45);
    }
    .btn-mint-deny {
      flex: 1;
      height: 44px;
      border: 1.5px solid #cbd5e1;
      border-radius: 12px;
      background: #ffffff;
      color: #64748b;
      font-size: 13.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-mint-deny:hover {
      background: #f8fafc;
      color: #334155;
      border-color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="ambient-glow"></div>
  <div class="oauth-wrapper">
    <div class="avatar-wrapper">
      <div class="avatar-ring">
        <img class="avatar-img" src="data:image/jpeg;base64,${GIRL_AVATAR_B64}" onerror="this.onerror=null;this.src='/oauth/avatar.jpg';" alt="Nexus AI 专属智能助手">
      </div>
      <div class="status-badge" title="就绪中"></div>
    </div>

    <div class="companion-tag">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
      <span>⭐ ChatGPT 专属智能助手</span>
    </div>

    <h2 class="oauth-title"><span>${escapeHtml(clientName || "ChatGPT")}</span> 正在申请连接工具箱</h2>
    <p class="oauth-desc">授权后，${escapeHtml(clientName || "ChatGPT")} 将能通过 Nexus MCP 协议为您读写项目文档、检索代码与自动化浏览，陪伴您高效完成日常工作。</p>

    <div class="caps-card">
      <div class="caps-header">
        <div class="caps-header-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          <span>已开启白名单工具能力</span>
        </div>
        <span class="caps-count">8 项授权</span>
      </div>
      <div class="caps-list">
        <div class="caps-item"><span class="caps-check">✓</span><span>读取并检索授权的项目目录与文件层级</span></div>
        <div class="caps-item"><span class="caps-check">✓</span><span>安全沙箱内分析项目源代码与依赖</span></div>
        <div class="caps-item"><span class="caps-check">✓</span><span>在项目工作区内创建与编辑文档/代码</span></div>
        <div class="caps-item"><span class="caps-check">✓</span><span>查询 Git 仓库分支与当前状态变更</span></div>
        <div class="caps-item"><span class="caps-check">✓</span><span>通过 Nexus 混合引擎协助网页检索调研</span></div>
      </div>
    </div>

    <div class="security-guarantee">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      <span><strong>安全沙箱已启用：</strong>系统底层已硬隔离高危命令与 Token 管理，确保数据无泄露风险。</span>
    </div>

    <form method="POST" action="${escapeHtml(baseUrl)}/oauth/authorize">
      <input type="hidden" name="client_id" value="${escapeHtml(clientId)}">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}">
      <input type="hidden" name="scope" value="${escapeHtml(scope)}">
      <input type="hidden" name="state" value="${escapeHtml(state || "")}">
      <input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge || "")}">
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(codeChallengeMethod || "")}">
      <input type="hidden" name="action" value="approve">

      <div class="action-row">
        <button type="submit" class="btn-mint-authorize">
          <span>🌿 允许连接 / 授权</span>
        </button>
        <button type="button" id="btn-deny" class="btn-mint-deny">
          <span>稍后再说</span>
        </button>
      </div>
    </form>
  </div>
  <script nonce="${escapeHtml(nonce || "")}">
    document.getElementById('btn-deny')?.addEventListener('click', () => window.history.back());
  </script>
</body>
</html>`;
}

export function escapeHtml(str: string): string {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  return { verifier, challenge };
}
