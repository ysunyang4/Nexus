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
// Nexus Official SVG Logo for OAuth 2.0 Consent Page
export const NEXUS_LOGO_SVG = `<svg class="avatar-img" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Nexus AI"><defs><linearGradient id="nxFrame" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#dbeafe"/></linearGradient><linearGradient id="nxPrompt" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#4fd4ff"/><stop offset="100%" stop-color="#4a7dff"/></linearGradient></defs><rect width="1024" height="1024" rx="220" fill="#050d1e"/><path d="M360 302 L205 362 C164 378 140 415 140 458 L140 605 C140 652 172 688 224 700 L224 646 C203 636 196 620 196 594 L196 462 C196 436 209 415 234 405 L344 362 Z" fill="url(#nxFrame)"/><path d="M412 368 L278 420 C255 430 244 450 244 476 L244 694 L390 564 C405 550 412 532 412 508 Z" fill="url(#nxFrame)"/><path d="M484 252 L750 252 C826 252 884 310 884 386 L884 584 C884 660 826 718 750 718 L298 718 L392 642 L742 642 C789 642 824 608 824 560 L824 410 C824 362 789 328 742 328 L492 328 C462 328 438 342 426 364 L388 348 C400 288 436 252 484 252 Z" fill="url(#nxFrame)"/><path d="M492 406 L622 480 C634 487 634 503 622 510 L492 584 C478 592 464 576 474 560 L562 495 L474 430 C464 414 478 398 492 406 Z" fill="url(#nxPrompt)"/><rect x="624" y="528" width="150" height="42" rx="21" fill="url(#nxPrompt)"/></svg>`;

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
        ${NEXUS_LOGO_SVG}
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
