/**
 * Nexus MCP Security Policy Manager
 * 
 * Manages:
 * 1. Global Unrestricted Execution Mode (OFF/ON)
 * 2. Per-Server Trusted External MCP Policy (bound to explicit Server/Endpoint identity)
 * 3. File-backed persistent storage across Nexus restarts (mcp-security-policy.json)
 * 4. Deterministic policy evaluation hierarchy:
 *    Priority 1: Unrestricted Execution Mode (if ON -> allow direct MCP execution)
 *    Priority 2: External MCP Trusted status (if Trusted -> allow direct execution)
 *    Priority 3: Untrusted -> Enforce existing Safety / Approval policy (mutative operations require approval)
 *    Priority 4: Unknown / Error -> Default to Protected mode
 */

import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";

export interface McpSecurityPolicy {
  unrestricted_execution_mode: boolean;
  master_token_optimization: boolean; // Master Token Optimization Toggle (default: true)
  provider_token_optimization: Record<string, boolean>; // Per-MCP provider token optimization toggles
  trusted_external_mcp: Record<string, boolean>; // Key: normalized endpoint identity (e.g. "127.0.0.1:20705")
}

export interface PolicyDecisionResult {
  allowed: boolean;
  bypass: boolean;
  trusted: boolean;
  mode: "unrestricted" | "trusted" | "safety_approval" | "protected";
  auditCode:
    | "BYPASS_UNRESTRICTED"
    | "TRUSTED_EXTERNAL_MCP"
    | "READ_ONLY_PERMITTED"
    | "APPROVED_EXECUTION"
    | "SAFETY_APPROVAL_REQUIRED";
  reason?: string;
  endpoint?: string;
}

function getDefaultDataDir(): string {
  if (process.platform === "win32") {
    return path.join(
      process.env.LOCALAPPDATA || process.env.APPDATA || "C:\\ProgramData",
      "LocalBridge",
      "data"
    );
  }
  return path.join(process.env.HOME || ".", ".localbridge", "data");
}

/**
 * Normalizes endpoint or server ID into a canonical endpoint identity:
 * e.g. "http://127.0.0.1:20705/mcp" -> "127.0.0.1:20705"
 * e.g. "http://localhost:20705" -> "127.0.0.1:20705"
 * e.g. "127.0.0.1:20705" -> "127.0.0.1:20705"
 */
export function normalizeEndpointIdentity(endpointOrId: string): string {
  if (!endpointOrId || typeof endpointOrId !== "string") return "";
  let clean = endpointOrId.trim();

  // If full URL provided, extract host (hostname:port)
  if (clean.includes("://")) {
    try {
      const u = new URL(clean);
      let host = u.host.toLowerCase();
      if (host.startsWith("localhost:")) {
        host = "127.0.0.1:" + host.slice("localhost:".length);
      } else if (host === "localhost") {
        host = "127.0.0.1";
      }
      return host;
    } catch {}
  }

  // Strip protocol prefix if present
  clean = clean.replace(/^(http|https):\/\//i, "");
  // Strip trailing path if present
  clean = clean.replace(/\/.*$/, "").trim().toLowerCase();

  if (clean.startsWith("localhost:")) {
    clean = "127.0.0.1:" + clean.slice("localhost:".length);
  } else if (clean === "localhost") {
    clean = "127.0.0.1";
  }

  return clean;
}

export class McpSecurityPolicyManager {
  private static instance: McpSecurityPolicyManager | null = null;
  private policy: McpSecurityPolicy;
  private storageFilePath: string;

  private constructor(customStoragePath?: string) {
    const dataDir = customStoragePath ? path.dirname(customStoragePath) : getDefaultDataDir();
    this.storageFilePath = customStoragePath || path.join(dataDir, "mcp-security-policy.json");

    // Default policy: Protected mode (unrestricted=false) and empty trusted list, token optimization default ON
    this.policy = {
      unrestricted_execution_mode: false,
      master_token_optimization: true,
      provider_token_optimization: {},
      trusted_external_mcp: {},
    };

    this.loadFromDisk();
  }

  public static getInstance(customStoragePath?: string): McpSecurityPolicyManager {
    if (!McpSecurityPolicyManager.instance) {
      McpSecurityPolicyManager.instance = new McpSecurityPolicyManager(customStoragePath);
    }
    return McpSecurityPolicyManager.instance;
  }

  /**
   * Reset instance (mainly for test suites)
   */
  public static resetInstance(): void {
    McpSecurityPolicyManager.instance = null;
  }

  public getPolicy(): McpSecurityPolicy {
    return {
      unrestricted_execution_mode: Boolean(this.policy.unrestricted_execution_mode),
      master_token_optimization: this.policy.master_token_optimization ?? true,
      provider_token_optimization: { ...this.policy.provider_token_optimization },
      trusted_external_mcp: { ...this.policy.trusted_external_mcp },
    };
  }

  public isUnrestrictedMode(): boolean {
    return Boolean(this.policy.unrestricted_execution_mode);
  }

  public setUnrestrictedMode(enabled: boolean): void {
    this.policy.unrestricted_execution_mode = Boolean(enabled);
    this.saveToDisk();
  }

  /**
   * Master Token Optimization Switch
   */
  public isMasterTokenOptimization(): boolean {
    return this.policy.master_token_optimization ?? true;
  }

  public setMasterTokenOptimization(enabled: boolean): void {
    this.policy.master_token_optimization = Boolean(enabled);
    this.saveToDisk();
  }

  /**
   * Per-provider Token Optimization Switch (hierarchically gated by master)
   */
  public isProviderTokenOptimization(providerId: string): boolean {
    if (!this.isMasterTokenOptimization()) {
      return false; // Master switch OFF disables all token optimization
    }
    if (!providerId) return true;
    const cleanId = providerId.trim().toLowerCase();
    if (this.policy.provider_token_optimization[cleanId] !== undefined) {
      return Boolean(this.policy.provider_token_optimization[cleanId]);
    }
    return true; // Default ON for every provider
  }

  public setProviderTokenOptimization(providerId: string, enabled: boolean): void {
    if (!providerId) return;
    const cleanId = providerId.trim().toLowerCase();
    this.policy.provider_token_optimization[cleanId] = Boolean(enabled);
    this.saveToDisk();
  }

  public getTokenOptimizationMatrix(): { master: boolean; providers: Record<string, boolean> } {
    return {
      master: this.isMasterTokenOptimization(),
      providers: { ...this.policy.provider_token_optimization },
    };
  }

  /**
   * Checks whether a specific External MCP Server / Endpoint is explicitly trusted
   */
  public isServerTrusted(endpointOrId: string): boolean {
    if (!endpointOrId) return false;
    const normalized = normalizeEndpointIdentity(endpointOrId);

    // 1. Direct normalized endpoint check (e.g. "127.0.0.1:20705")
    if (this.policy.trusted_external_mcp[normalized] === true) {
      return true;
    }

    // 2. Raw key check (e.g. providerId "unity-gamedev" or verbatim endpoint)
    const rawKey = endpointOrId.trim();
    if (this.policy.trusted_external_mcp[rawKey] === true) {
      return true;
    }

    return false;
  }

  /**
   * Sets the trusted status for an external MCP Server / Endpoint
   */
  public setServerTrusted(endpointOrId: string, trusted: boolean): void {
    if (!endpointOrId) return;
    const normalized = normalizeEndpointIdentity(endpointOrId);
    if (normalized) {
      this.policy.trusted_external_mcp[normalized] = Boolean(trusted);
    }
    // Also record by raw key if it looks like a provider identifier
    const rawKey = endpointOrId.trim();
    if (rawKey && rawKey !== normalized) {
      this.policy.trusted_external_mcp[rawKey] = Boolean(trusted);
    }

    this.saveToDisk();
  }

  /**
   * Deterministic Policy Evaluation Hierarchy (Section IV)
   */
  public evaluateToolExecution(
    toolName: string,
    providerId: string,
    endpoint: string,
    isReadOnly: boolean,
    args: Record<string, any> = {}
  ): PolicyDecisionResult {
    const normalizedEndpoint = normalizeEndpointIdentity(endpoint) || endpoint;

    // 1. Priority 1: Unrestricted Execution Mode (Global bypass)
    if (this.isUnrestrictedMode()) {
      return {
        allowed: true,
        bypass: true,
        trusted: false,
        mode: "unrestricted",
        auditCode: "BYPASS_UNRESTRICTED",
        reason: "Unrestricted Execution Mode is ON: Bypassing Nexus MCP safety and approval interception.",
        endpoint: normalizedEndpoint,
      };
    }

    // 2. Priority 2: Check if External MCP Server is explicitly Trusted
    const isTrusted = this.isServerTrusted(endpoint) || this.isServerTrusted(providerId);

    if (isTrusted) {
      return {
        allowed: true,
        bypass: false,
        trusted: true,
        mode: "trusted",
        auditCode: "TRUSTED_EXTERNAL_MCP",
        reason: `External MCP server '${normalizedEndpoint}' is explicitly TRUSTED: Executing tool '${toolName}' directly without approval interception.`,
        endpoint: normalizedEndpoint,
      };
    }

    // 3. Priority 3: Untrusted External MCP -> Follow Standard Safety & Approval Policy
    // Read-only queries (L1) are allowed without approval
    if (isReadOnly) {
      return {
        allowed: true,
        bypass: false,
        trusted: false,
        mode: "protected",
        auditCode: "READ_ONLY_PERMITTED",
        reason: `Read-only tool '${toolName}' permitted under standard safety policy.`,
        endpoint: normalizedEndpoint,
      };
    }

    // Mutative operations require human / operator approval when Untrusted
    const approvalId = args?.approvalId;
    if (typeof approvalId === "string" && approvalId.trim().length > 0) {
      return {
        allowed: true,
        bypass: false,
        trusted: false,
        mode: "safety_approval",
        auditCode: "APPROVED_EXECUTION",
        reason: `Mutative operation '${toolName}' authorized via provided approval '${approvalId}'.`,
        endpoint: normalizedEndpoint,
      };
    }

    // No approval supplied for mutative operation -> Safety Approval Required
    return {
      allowed: false,
      bypass: false,
      trusted: false,
      mode: "safety_approval",
      auditCode: "SAFETY_APPROVAL_REQUIRED",
      reason: `[Safety Approval Required] External MCP server '${normalizedEndpoint}' is UNTRUSTED. Operation '${toolName}' requires operator approval or server trust authorization.`,
      endpoint: normalizedEndpoint,
    };
  }

  /**
   * Load policy from persistent storage
   */
  public loadFromDisk(): void {
    try {
      if (fs.existsSync(this.storageFilePath)) {
        const raw = fs.readFileSync(this.storageFilePath, "utf-8");
        const parsed = JSON.parse(raw);

        this.policy = {
          unrestricted_execution_mode: Boolean(parsed.unrestricted_execution_mode),
          master_token_optimization: parsed.master_token_optimization !== undefined ? Boolean(parsed.master_token_optimization) : true,
          provider_token_optimization:
            parsed.provider_token_optimization && typeof parsed.provider_token_optimization === "object"
              ? parsed.provider_token_optimization
              : {},
          trusted_external_mcp:
            parsed.trusted_external_mcp && typeof parsed.trusted_external_mcp === "object"
              ? parsed.trusted_external_mcp
              : {},
        };
      }
    } catch (err: any) {
      console.warn(`[McpSecurityPolicy] Error loading policy from ${this.storageFilePath}: ${err.message}. Using safe defaults.`);
      this.policy = {
        unrestricted_execution_mode: false,
        master_token_optimization: true,
        provider_token_optimization: {},
        trusted_external_mcp: {},
      };
    }
  }

  /**
   * Atomically save policy to persistent storage
   */
  public saveToDisk(): void {
    try {
      const dir = path.dirname(this.storageFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const tmpFile = `${this.storageFilePath}.tmp_${process.pid}_${Date.now()}`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.policy, null, 2), "utf-8");
      fs.renameSync(tmpFile, this.storageFilePath);
    } catch (err: any) {
      console.error(`[McpSecurityPolicy] Failed to save policy to ${this.storageFilePath}: ${err.message}`);
    }
  }
}
