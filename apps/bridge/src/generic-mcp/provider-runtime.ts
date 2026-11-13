/**
 * Nexus Generic Provider Runtime & Unified Provider Registry
 * 
 * The Single Source of Truth for all Provider instances:
 * - Built-in: LocalBridge Core
 * - Primary External: Unity GameDev MCP (Port 20705, Streamable HTTP)
 * - Dynamically Enrolled: Arbitrary external MCP servers (Blender, Browser, Custom)
 * 
 * Features:
 * 1. Strict Lifecycle State Machine: DISCOVERING -> CONNECTING -> NEGOTIATING -> READY -> DISCONNECTED
 * 2. Protocol Negotiation across 2024-11-05, 2025-03-26, 2025-11-25, 2026-07-28
 * 3. Dynamic Catalog Integration (Atomic Swap, Zero Hardcode)
 * 4. TOCTOU & Stale Reference Guard (CATALOG_CHANGED)
 * 5. Verification-First & Monotonic Ledger Coverage
 * 6. Zero Recompile: Add new external MCP at runtime via API/UI without rebuilding Nexus
 */

import crypto from "node:crypto";
import fs from "node:fs";
import child_process from "node:child_process";
import { GenericMcpClient } from "./generic-mcp-client.js";
import { DynamicCatalog } from "./dynamic-catalog.js";
import { PermissionGateway } from "./permission-gateway.js";
import { VerificationEngine } from "./verification-engine.js";
import { MCPConnectionManager } from "./mcp-connection-manager.js";
import { MCPBatchExecutor } from "./mcp-batch-executor.js";
import { McpSecurityPolicyManager } from "./mcp-security-policy.js";
import type {
  ProviderConfig,
  ProviderInfo,
  ProviderStatus,
  DynamicMcpTool,
  MCPBatchOperation,
  MCPBatchExecutionResult,
  MCPPerformanceMetrics,
} from "./types.js";

interface ProviderHandle {
  config: ProviderConfig;
  client: GenericMcpClient;
  status: ProviderStatus;
  instanceId: string;
  protocolVersion: string | null;
  serverInfo: any | null;
  capabilities: any | null;
  toolCount: number;
  catalogVersion: number;
  catalogHash: string;
  discoveredAt: string;
  lastSeenAt: string;
  lastError?: string;
  consecutiveFailures: number;
  reconnectTimer?: any;
}

export class ProviderRuntime {
  private static instance: ProviderRuntime | null = null;
  private providers: Map<string, ProviderHandle> = new Map();
  private catalog: DynamicCatalog;
  private permissionGateway: PermissionGateway;
  private verificationEngine: VerificationEngine;
  private connectionManager: MCPConnectionManager;
  private batchExecutor: MCPBatchExecutor;
  private initialized = false;

  private constructor() {
    this.catalog = DynamicCatalog.getInstance();
    this.permissionGateway = PermissionGateway.getInstance();
    this.verificationEngine = VerificationEngine.getInstance();
    this.connectionManager = MCPConnectionManager.getInstance();
    this.batchExecutor = MCPBatchExecutor.getInstance();
  }

  public static getInstance(): ProviderRuntime {
    if (!ProviderRuntime.instance) {
      ProviderRuntime.instance = new ProviderRuntime();
    }
    return ProviderRuntime.instance;
  }

  private lastDefaultInitTime = 0;

  /**
   * Initialize standard base providers (LocalBridge Core & Unity GameDev MCP & Photoshop & Blender)
   */
  public async initializeDefaultProviders(): Promise<void> {
    const now = Date.now();
    if (now - this.lastDefaultInitTime < 30000) {
      return; // Throttle to at most once per 30 seconds to prevent blocking caller loops
    }
    this.lastDefaultInitTime = now;

    const unityHandle = this.providers.get("unity-gamedev");
    if (!unityHandle) {
      // 1. Register Unity GameDev MCP (Port 20705, Streamable HTTP)
      const unityConfig: ProviderConfig = {
        providerId: "unity-gamedev",
        displayName: "Unity GameDev MCP (Primary)",
        endpoint: "http://127.0.0.1:20705/mcp",
        transport: "streamableHttp",
        authentication: { type: "none" },
        policy: {
          defaultPermission: "L2",
          maxConsecutiveFailures: 3,
          timeoutMs: 15000,
          allowLocalLoopback: true,
        },
        enabled: true,
      };

      await this.registerProvider(unityConfig).catch((err) => {
        console.warn("[ProviderRuntime] Initial Unity Provider enrollment non-fatal error:", err.message);
      });
    } else if (unityHandle.toolCount === 0 || unityHandle.status !== "READY") {
      await this.connectAndDiscover(unityHandle, true).catch(() => {});
    }
  }

  /**
   * Force refresh dynamic tools from a specific provider
   */
  public async refreshProvider(providerId: string): Promise<boolean> {
    const handle = this.providers.get(providerId);
    if (!handle) {
      await this.initializeDefaultProviders();
      const newHandle = this.providers.get(providerId);
      return Boolean(newHandle && newHandle.toolCount > 0);
    }
    handle.client.resetCircuit();
    const res = await this.connectAndDiscover(handle, true);
    return res.success && res.toolCount > 0;
  }

  /**
   * Register a new External MCP Provider on the fly (ZERO RECOMPILE)
   */
  public async registerProvider(config: ProviderConfig): Promise<{
    success: boolean;
    provider: ProviderInfo;
    toolCount: number;
    catalogVersion: number;
    error?: string;
  }> {
    const instanceId = `inst_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const client = this.connectionManager.getOrCreateClient(config);

    const handle: ProviderHandle = {
      config,
      client,
      status: "DISCOVERING",
      instanceId,
      protocolVersion: null,
      serverInfo: null,
      capabilities: null,
      toolCount: 0,
      catalogVersion: 0,
      catalogHash: "",
      discoveredAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      consecutiveFailures: 0,
    };

    this.providers.set(config.providerId, handle);

    // Attempt initial connect & discovery
    return await this.connectAndDiscover(handle);
  }

  /**
   * Generic: Force refresh all registered dynamic providers
   */
  public async refreshAllProviders(): Promise<void> {
    await this.initializeDefaultProviders().catch(() => {});
    await Promise.all(
      Array.from(this.providers.keys()).map((id) => this.refreshProvider(id).catch(() => false))
    );
  }

  /**
   * Auto-spawn downstream server if configured and offline (e.g. Unity GameDev MCP 20705)
   */
  private async ensureDownstreamServer(providerId: string): Promise<void> {
    if (providerId !== "unity-gamedev") return;

    // Quick probe
    try {
      const probe = await fetch("http://127.0.0.1:20705/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "ping" }),
        signal: AbortSignal.timeout(800),
      });
      if (probe.status < 500) return;
    } catch {
      // not responding, attempt launch
    }

    const candidatePaths = [
      process.env.GAMEDEV_MCP_SERVER_PATH,
      "E:\\Tools\\UnityProject\\Tasgole\\Library\\mcp-server\\win-x64\\gamedev-mcp-server.exe",
    ].filter(Boolean) as string[];

    for (const exePath of candidatePaths) {
      if (fs.existsSync(exePath)) {
        try {
          const child = child_process.spawn(
            exePath,
            ["port=20705", "plugin-timeout=10000", "client-transport=streamableHttp", "auth=none"],
            { detached: true, stdio: "ignore" }
          );
          child.unref();

          for (let i = 0; i < 8; i++) {
            await new Promise((r) => setTimeout(r, 400));
            try {
              const res = await fetch("http://127.0.0.1:20705/mcp", {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
                body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "ping" }),
                signal: AbortSignal.timeout(600),
              });
              if (res.status < 500) return;
            } catch {}
          }
        } catch (spawnErr) {
          console.warn("[ProviderRuntime] Failed to spawn gamedev-mcp-server:", spawnErr);
        }
      }
    }
  }

  /**
   * Core Connect, Negotiate, Discover & Atomic Catalog Swap sequence
   */
  private async connectAndDiscover(
    handle: ProviderHandle,
    bypassCache: boolean = false
  ): Promise<{
    success: boolean;
    provider: ProviderInfo;
    toolCount: number;
    catalogVersion: number;
    error?: string;
  }> {
    handle.status = "CONNECTING";

    try {
      await this.ensureDownstreamServer(handle.config.providerId);

      // 1. Initialize & Negotiate Protocol
      handle.status = "NEGOTIATING";
      const initResult = await handle.client.initialize();

      handle.protocolVersion = initResult.protocolVersion;
      handle.serverInfo = initResult.serverInfo;
      handle.capabilities = initResult.capabilities;

      // 2. Fetch Tools List
      const listResult = await handle.client.listTools({ bypassCache });
      const rawTools = listResult.tools;

      // 3. Dynamic Catalog Atomic Swap (with Schema Safety Validation)
      const swapResult = this.catalog.atomicSwapProviderTools(
        handle.config.providerId,
        handle.instanceId,
        rawTools,
        handle.config.policy?.defaultPermission
      );

      handle.toolCount = swapResult.validCount;
      handle.catalogVersion = swapResult.catalogVersion;
      handle.catalogHash = swapResult.catalogHash;
      handle.lastSeenAt = new Date().toISOString();
      handle.lastError = undefined;
      handle.consecutiveFailures = 0;

      if (swapResult.validCount === 0) {
        handle.status = "DISCOVERING";
        this.scheduleReconnect(handle);
      } else {
        handle.status = "READY";
        if (handle.reconnectTimer) {
          clearTimeout(handle.reconnectTimer);
          handle.reconnectTimer = undefined;
        }
      }

      return {
        success: true,
        provider: this.toProviderInfo(handle),
        toolCount: swapResult.validCount,
        catalogVersion: swapResult.catalogVersion,
      };
    } catch (err: any) {
      handle.status = "DISCONNECTED";
      handle.lastError = err.message || String(err);
      handle.consecutiveFailures++;

      // In DISCONNECTED, tools are unlisted from Dynamic Catalog to ensure AI sees true state
      this.catalog.removeProviderTools(handle.config.providerId);

      // Start auto-reconnect if enabled
      this.scheduleReconnect(handle);

      return {
        success: false,
        provider: this.toProviderInfo(handle),
        toolCount: 0,
        catalogVersion: this.catalog.getSnapshot().catalogVersion,
        error: handle.lastError,
      };
    }
  }

  /**
   * Auto-Reconnect Scheduler
   */
  private scheduleReconnect(handle: ProviderHandle): void {
    if (handle.reconnectTimer) clearTimeout(handle.reconnectTimer);

    handle.reconnectTimer = setTimeout(async () => {
      if (handle.status === "DISCONNECTED" || handle.status === "DISCOVERING") {
        handle.status = "RECONNECTING";
        try {
          const res = await this.connectAndDiscover(handle, true);
          if (res.success && res.toolCount > 0) {
            console.log(`[ProviderRuntime] Provider '${handle.config.providerId}' reconnected successfully with ${res.toolCount} tools.`);
          }
        } catch {
          // Will schedule again on failure
        }
      }
    }, 3000);
  }

  /**
   * Manually trigger provider reconnect
   */
  public async reconnectProvider(providerId: string): Promise<boolean> {
    const handle = this.providers.get(providerId);
    if (!handle) return false;
    handle.client.resetCircuit();
    const res = await this.connectAndDiscover(handle);
    return res.success;
  }

  /**
   * Manually disconnect a provider and clear its tools from catalog
   */
  public disconnectProvider(providerId: string): boolean {
    const handle = this.providers.get(providerId);
    if (!handle) return false;
    handle.status = "DISCONNECTED";
    if (handle.reconnectTimer) {
      clearTimeout(handle.reconnectTimer);
      handle.reconnectTimer = null;
    }
    this.catalog.removeProviderTools(providerId);
    return true;
  }

  /**
   * Manually trigger tool catalog refresh for a provider
   */
  public async refreshProviderCatalog(providerId: string): Promise<{
    success: boolean;
    toolCount: number;
    catalogVersion: number;
    error?: string;
  }> {
    const handle = this.providers.get(providerId);
    if (!handle) return { success: false, toolCount: 0, catalogVersion: 0, error: "Provider not found" };
    return await this.connectAndDiscover(handle);
  }

  /**
   * Remove a provider and atomically retract its tools
   */
  public removeProvider(providerId: string): boolean {
    const handle = this.providers.get(providerId);
    if (!handle) return false;
    if (handle.reconnectTimer) clearTimeout(handle.reconnectTimer);
    this.catalog.removeProviderTools(providerId);
    this.connectionManager.removeClient(providerId).catch(() => {});
    this.providers.delete(providerId);
    return true;
  }

  /**
   * Disconnect / trip a provider (for test simulations or graceful shutdown)
   */
  public markProviderDisconnected(providerId: string, reason?: string): void {
    const handle = this.providers.get(providerId);
    if (!handle) return;
    handle.status = "DISCONNECTED";
    handle.lastError = reason || "Provider manually marked disconnected";
    this.catalog.removeProviderTools(providerId);
  }

  /**
   * Execute Tool via Unified Provider Framework
   * 
   * Strict Lifecycle:
   * 1. TOCTOU freshness check (CATALOG_CHANGED)
   * 2. Provider availability check (PROVIDER_UNAVAILABLE)
   * 3. Permission Gateway evaluation (L1-L5)
   * 4. Verification-First pre-state capture
   * 5. Generic MCP Client dispatch
   * 6. Post-state verification & Monotonic Ledger commit
   */
  public async executeTool(
    toolNameOrQualified: string,
    args: Record<string, any>,
    options?: {
      callerLevel?: any;
      expectedCatalogVersion?: number;
      expectedInstanceId?: string;
      verificationRule?: {
        type: "state_changed" | "object_found" | "none";
        verifyTool?: string;
        verifyArgs?: Record<string, any>;
      };
    }
  ): Promise<{
    content: any[];
    isError: boolean;
    evidenceId?: string;
    actionId?: string;
    permission?: any;
    error?: string;
    catalogVersion: number;
    durationMs?: number;
    trace?: any;
  }> {
    const currentVersion = this.catalog.getSnapshot().catalogVersion;

    // 1. TOCTOU Freshness Check
    let freshness = this.catalog.validateFreshness(
      toolNameOrQualified,
      options?.expectedCatalogVersion,
      options?.expectedInstanceId
    );

    if (!freshness.fresh || !freshness.tool) {
      // On-demand refresh for dynamic providers (e.g. Unity MCP became online)
      await this.refreshProvider("unity-gamedev").catch(() => {});
      freshness = this.catalog.validateFreshness(
        toolNameOrQualified,
        options?.expectedCatalogVersion,
        options?.expectedInstanceId
      );
    }

    if (!freshness.fresh || !freshness.tool) {
      if (typeof toolNameOrQualified === "string" && toolNameOrQualified.includes("::")) {
        const [targetProviderId] = toolNameOrQualified.split("::");
        const pHandle = this.providers.get(targetProviderId);
        if (pHandle && pHandle.status === "DISCONNECTED") {
          return {
            content: [{ type: "text", text: `[Provider Unavailable] Provider '${targetProviderId}' is DISCONNECTED.` }],
            isError: true,
            error: "PROVIDER_UNAVAILABLE",
            catalogVersion: currentVersion,
          };
        }
      }
      return {
        content: [{ type: "text", text: `[Catalog Error] ${freshness.error || "Tool not found"}` }],
        isError: true,
        error: freshness.error || "Tool not found",
        catalogVersion: freshness.currentVersion,
      };
    }

    const tool = freshness.tool;
    const handle = this.providers.get(tool.providerId);

    // 2. Provider Availability Check
    if (!handle || handle.status !== "READY") {
      return {
        content: [
          {
            type: "text",
            text: `[Provider Unavailable] Provider '${tool.providerId}' is in state '${handle?.status || "UNKNOWN"}'. Cannot execute tool '${tool.qualifiedName}'.`,
          },
        ],
        isError: true,
        error: "PROVIDER_UNAVAILABLE",
        catalogVersion: currentVersion,
      };
    }

    // 3. MCP Security & Execution Policy Evaluation (Section IV Hierarchy)
    const policyManager = McpSecurityPolicyManager.getInstance();
    const isReadOnly = tool.permissionClass === "L1";
    const policyDecision = policyManager.evaluateToolExecution(
      tool.name,
      tool.providerId,
      handle.config.endpoint,
      isReadOnly,
      args
    );

    // 4. Permission Gateway Check (Integrated with Security Policy)
    let permDecision = this.permissionGateway.evaluate(
      tool.qualifiedName,
      tool.permissionClass,
      options?.callerLevel
    );

    // If Unrestricted or Trusted, grant execution directly
    if (policyDecision.bypass || policyDecision.trusted) {
      permDecision = {
        granted: true,
        activeLevel: "L5",
        requiredLevel: tool.permissionClass,
        auditCode: "GRANTED",
      };
    } else if (!policyDecision.allowed) {
      permDecision = {
        granted: false,
        activeLevel: permDecision.activeLevel,
        requiredLevel: tool.permissionClass,
        reason: policyDecision.reason || "Safety Approval Required",
        auditCode: "BLOCKED_EXPLICIT_POLICY",
      };
    }

    // 5. Verification-First: Prepare Action in Monotonic Ledger
    const { actionId, evidenceId } = this.verificationEngine.prepareAction(
      tool,
      args,
      currentVersion,
      permDecision
    );

    if (!permDecision.granted) {
      return {
        content: [{ type: "text", text: permDecision.reason || "[Safety Approval Required]" }],
        isError: true,
        actionId,
        evidenceId,
        permission: permDecision,
        error: permDecision.reason,
        catalogVersion: currentVersion,
      };
    }

    // 5. Mark Action Started
    this.verificationEngine.markStarted(actionId);
    const startTime = Date.now();

    // 6. Pre-state capture (if verification requested)
    let preState: any = null;
    if (options?.verificationRule?.verifyTool) {
      try {
        const preRes = await handle.client.callTool(options.verificationRule.verifyTool, options.verificationRule.verifyArgs || {});
        preState = preRes.content;
      } catch {}
    }

    // 7. Dispatch Tool Call via GenericMcpClient
    const clientResult = await handle.client.callTool(tool.name, args);
    const durationMs = Date.now() - startTime;

    // 8. Post-state capture & Independent Verification
    let postState: any = null;
    let verificationPassed = !clientResult.isError;

    if (options?.verificationRule?.verifyTool && !clientResult.isError) {
      try {
        const postRes = await handle.client.callTool(options.verificationRule.verifyTool, options.verificationRule.verifyArgs || {});
        postState = postRes.content;

        if (options.verificationRule.type === "state_changed") {
          const preStr = JSON.stringify(preState);
          const postStr = JSON.stringify(postState);
          verificationPassed = preStr !== postStr;
        } else if (options.verificationRule.type === "object_found") {
          const postText = JSON.stringify(postState);
          verificationPassed = !postText.includes("not found") && !postText.includes("Error");
        }
      } catch {
        verificationPassed = false;
      }
    }

    // 9. Mark Executed & Verified in Ledger
    this.verificationEngine.markExecutedAndVerified(
      actionId,
      evidenceId,
      clientResult.content,
      clientResult.isError,
      durationMs,
      verificationPassed,
      preState,
      postState,
      clientResult.isError ? JSON.stringify(clientResult.content) : undefined
    );

    return {
      content: clientResult.content,
      isError: clientResult.isError,
      actionId,
      evidenceId,
      permission: permDecision,
      catalogVersion: currentVersion,
      durationMs,
      trace: clientResult.trace,
    };
  }

  /**
   * Generic MCP Batch Execution across registered tools
   */
  public async executeBatch(params: {
    operations: MCPBatchOperation[];
    mode?: "sequential" | "parallel" | "dependency";
    continueOnError?: boolean;
    timeoutMs?: number;
    callerLevel?: any;
  }): Promise<MCPBatchExecutionResult> {
    return await this.batchExecutor.executeBatch(
      {
        operations: params.operations,
        mode: params.mode,
        continueOnError: params.continueOnError,
        timeoutMs: params.timeoutMs,
      },
      async (toolName, args, opts) => {
        const res = await this.executeTool(toolName, args, {
          callerLevel: params.callerLevel,
        });
        return {
          content: res.content,
          isError: res.isError,
          durationMs: (res as any).durationMs,
        };
      }
    );
  }

  /**
   * Get Performance Metrics for a provider
   */
  public getPerformanceMetrics(providerId: string): MCPPerformanceMetrics | null {
    return this.connectionManager.getPerformanceMetrics(providerId);
  }

  /**
   * List all providers with live status
   */
  public listProviders(): ProviderInfo[] {
    const list: ProviderInfo[] = [];

    // Core Provider
    list.push({
      providerId: "localbridge-core",
      instanceId: "inst_core_builtin",
      displayName: "Nexus LocalBridge Core",
      endpoint: "http://127.0.0.1:18080/mcp",
      transport: "streamableHttp",
      status: "READY",
      protocolVersion: "2024-11-05",
      serverInfo: { name: "localbridge-core", version: "1.20.0" },
      capabilities: { tools: { listChanged: true } },
      toolCount: 340, // 332 Canonical + 8 Legacy
      catalogVersion: this.catalog.getSnapshot().catalogVersion,
      catalogHash: this.catalog.getSnapshot().catalogHash,
      discoveredAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      consecutiveFailures: 0,
    });

    for (const [_, handle] of this.providers) {
      list.push(this.toProviderInfo(handle));
    }

    return list;
  }

  public getProvider(providerId: string): ProviderInfo | null {
    const handle = this.providers.get(providerId);
    return handle ? this.toProviderInfo(handle) : null;
  }

  public getProviderClient(providerId: string): GenericMcpClient | null {
    const handle = this.providers.get(providerId);
    return handle ? handle.client : null;
  }

  private toProviderInfo(handle: ProviderHandle): ProviderInfo {
    return {
      providerId: handle.config.providerId,
      instanceId: handle.instanceId,
      displayName: handle.config.displayName,
      endpoint: handle.config.endpoint,
      transport: handle.config.transport,
      status: handle.status,
      protocolVersion: handle.protocolVersion,
      serverInfo: handle.serverInfo,
      capabilities: handle.capabilities,
      toolCount: handle.toolCount,
      catalogVersion: handle.catalogVersion,
      catalogHash: handle.catalogHash,
      discoveredAt: handle.discoveredAt,
      lastSeenAt: handle.lastSeenAt,
      lastError: handle.lastError,
      consecutiveFailures: handle.consecutiveFailures,
      metrics: handle.client.getPerformanceMetrics(),
      sessionId: handle.client.getSessionId() || undefined,
    };
  }
}
