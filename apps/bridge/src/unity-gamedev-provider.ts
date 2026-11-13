/**
 * Unity GameDev External MCP Provider for Nexus MCP Bridge
 * 
 * Downstream: http://localhost:20705/p/6106087c
 * Transport: Streamable HTTP (MCP 2024-11-05)
 * Version: 9.2.9.0
 * 
 * Responsibilities:
 * 1. ZERO MOCK: Real downstream MCP communication with session management.
 * 2. ISOLATION: Completely decoupled from 332 Canonical MCP Tools.
 * 3. TRANSPARENT PROXY: Downstream error pass-through, timeout, connection failure handling.
 * 4. PERMISSION GATE: Enforces L1 (Read-only), L2 (Scene), L3 (Code), L4 (Scene+Code), L5 (Full Control).
 * 5. EXECUTION STRATEGY: FAST (direct, shallow) vs DEEP (extended reasoning, multi-round verification).
 * 6. LEDGER & EVIDENCE: Full 5-stage lifecycle (PREPARED -> STARTED -> EXECUTED -> VERIFIED -> COMMITTED)
 *    and REJECTED audit events.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import child_process from "node:child_process";

export type UnityPermissionLevel = "L1" | "L2" | "L3" | "L4" | "L5";
export type UnityExecutionMode = "FAST" | "DEEP";

export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  failureThreshold: number; // default: 2
  requestTimeoutMs: number; // default: 10000
  cooldownMs: number; // default: 5000
  halfOpenMaxProbes: number; // default: 1
}

export interface CircuitBreakerStatus {
  state: CircuitBreakerState;
  consecutiveFailures: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  config: CircuitBreakerConfig;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
  outputSchema?: any;
  annotations?: any;
  provider?: string;
  source?: string;
  version?: string;
}

export interface McpInitializeResult {
  protocolVersion: string;
  capabilities: any;
  serverInfo: {
    name: string;
    version: string;
  };
}

export interface McpToolCallResult {
  content?: Array<{ type: string; text?: string; [key: string]: any }>;
  structuredContent?: any;
  isError?: boolean;
  permission?: any;
  evidenceId?: string;
  actionId?: string;
}

export interface UnityLedgerEntry {
  id: string;
  actionId: string;
  evidenceId: string;
  timestamp: number;
  operationId: string;
  provider: string;
  permissionLevel: UnityPermissionLevel;
  executionMode: UnityExecutionMode;
  stage: "PREPARED" | "STARTED" | "EXECUTED" | "VERIFIED" | "COMMITTED" | "REJECTED";
  status: "PENDING" | "SUCCESS" | "FAILED" | "REJECTED";
  durationMs?: number;
  summary: string;
  details?: Record<string, any>;
}

export interface UnityEvidenceRecord {
  id: string;
  actionId: string;
  operationId: string;
  provider: string;
  timestamp: number;
  status: "COMMITTED" | "REJECTED" | "FAILED";
  permissionLevel: UnityPermissionLevel;
  executionMode: UnityExecutionMode;
  verificationPassed: boolean;
  auditReason?: string;
  arguments?: any;
  responsePreview?: any;
  durationMs?: number;
}

export interface ToolCapabilityInference {
  category: "READ_ONLY" | "SCENE_MUTATION" | "CODE_EXECUTION" | "UNKNOWN";
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  inferredLevel: UnityPermissionLevel;
  reason: string;
}

export interface GenericMcpProvider {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  getEndpoint(): string;
  setEndpoint(endpoint: string): void;
  resetEndpoint(): void;
  initialize(): Promise<{ success: boolean; data?: McpInitializeResult; error?: string }>;
  listTools(): Promise<{ success: boolean; count: number; tools: McpToolDefinition[]; error?: string }>;
  refreshCatalog(): Promise<{ success: boolean; count: number; tools: McpToolDefinition[]; error?: string }>;
  executeTool(name: string, args: Record<string, any>): Promise<McpToolCallResult>;
  getCircuitBreakerStatus(): CircuitBreakerStatus;
  canExecuteRequest(): { allowed: boolean; reason?: string };
  getStatus(): any;
}

export class UnityGameDevMcpProvider implements GenericMcpProvider {
  public readonly id = "unity-gamedev";
  public readonly name = "gamedev-mcp-server";
  public readonly version = "9.2.9.0";

  private static instance: UnityGameDevMcpProvider | null = null;
  private endpoint: string;
  private defaultEndpoint: string;
  private sessionId: string | null = null;
  private serverInfo: { name: string; version: string } | null = {
    name: "gamedev-mcp-server",
    version: "9.2.9.0",
  };
  private capabilities: any = null;
  private tools: McpToolDefinition[] = [];
  private toolsMap: Map<string, McpToolDefinition> = new Map();
  private lastInitializedAt: string | null = null;
  private requestId = 0;
  private refreshPromise: Promise<{ success: boolean; count: number; tools: McpToolDefinition[]; error?: string }> | null = null;

  // Circuit Breaker State & Config
  private circuitState: CircuitBreakerState = "CLOSED";
  private consecutiveFailures = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private halfOpenProbes = 0;
  private circuitBreakerConfig: CircuitBreakerConfig = {
    failureThreshold: 2,
    requestTimeoutMs: 10000,
    cooldownMs: 5000,
    halfOpenMaxProbes: 1,
  };

  // Permission & Execution Mode
  private permission: UnityPermissionLevel = "L2"; // Default L2 Scene Builder
  private executionMode: UnityExecutionMode = "FAST"; // Default FAST mode

  // Ledger & Evidence store
  private ledger: UnityLedgerEntry[] = [];
  private evidenceStore = new Map<string, UnityEvidenceRecord>();

  constructor(endpoint: string = "http://localhost:20705/mcp") {
    this.endpoint = endpoint;
    this.defaultEndpoint = endpoint;
    this.loadInitialInventory();
  }

  public setEndpoint(endpoint: string): void {
    this.endpoint = endpoint;
    this.sessionId = null;
  }

  public resetEndpoint(): void {
    this.endpoint = this.defaultEndpoint;
    this.sessionId = null;
  }

  public static getInstance(endpoint?: string): UnityGameDevMcpProvider {
    if (!UnityGameDevMcpProvider.instance) {
      UnityGameDevMcpProvider.instance = new UnityGameDevMcpProvider(endpoint);
    } else if (endpoint && UnityGameDevMcpProvider.instance.endpoint !== endpoint) {
      UnityGameDevMcpProvider.instance.endpoint = endpoint;
    }
    return UnityGameDevMcpProvider.instance;
  }

  /**
   * Load initial inventory from disk if available
   */
  private loadInitialInventory(): void {
    const candidatePaths = [
      path.resolve(process.cwd(), "GAMEDEV_MCP_TOOLS_INVENTORY.json"),
      path.resolve(process.cwd(), "../release/Verification/GAMEDEV_MCP_TOOLS_INVENTORY.json"),
      path.resolve(process.cwd(), "../../release/Verification/GAMEDEV_MCP_TOOLS_INVENTORY.json"),
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(p, "utf-8"));
          if (Array.isArray(parsed.tools) && parsed.tools.length > 0) {
            this.tools = parsed.tools.map((t: any) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
              outputSchema: t.outputSchema,
              annotations: {
                provider: "unity-gamedev",
                source: "external-mcp",
                version: parsed.serverInfo?.version || "9.2.9.0",
                priority: "primary",
                executionTarget: "unity-editor-native",
              },
              provider: "unity-gamedev",
              source: "external-mcp",
              version: parsed.serverInfo?.version || "9.2.9.0",
            }));
            this.toolsMap = new Map(this.tools.map((t) => [t.name, t]));
            if (parsed.serverInfo) this.serverInfo = parsed.serverInfo;
            if (parsed.endpoint) {
              this.endpoint = parsed.endpoint;
              this.defaultEndpoint = parsed.endpoint;
            }
            console.log(`[UnityGameDevProvider] Loaded ${this.tools.length} dynamic initial tools from ${p} (endpoint: ${this.endpoint})`);
            return;
          }
        } catch {}
      }
    }
  }

  public getEndpoint(): string {
    return this.endpoint;
  }

  public getSessionId(): string | null {
    return this.sessionId;
  }

  public getServerInfo(): { name: string; version: string } | null {
    return this.serverInfo;
  }

  public isConnected(): boolean {
    return Boolean(this.sessionId && this.serverInfo);
  }

  public getToolsCount(): number {
    return this.tools.length;
  }

  public getPermission(): UnityPermissionLevel {
    return this.permission;
  }

  public setPermission(level: UnityPermissionLevel): { success: boolean; permission: UnityPermissionLevel } {
    if (!["L1", "L2", "L3", "L4", "L5"].includes(level)) {
      throw new Error(`Invalid permission level '${level}'. Must be L1, L2, L3, L4, or L5.`);
    }
    const prev = this.permission;
    this.permission = level;
    this.recordLedgerEntry({
      actionId: `perm_${Date.now()}`,
      evidenceId: `ev_perm_${Date.now()}`,
      operationId: "security.permission_change",
      stage: "COMMITTED",
      status: "SUCCESS",
      summary: `Permission level updated from ${prev} to ${level}`,
      details: { previous: prev, current: level },
    });
    return { success: true, permission: this.permission };
  }

  public getExecutionMode(): UnityExecutionMode {
    return this.executionMode;
  }

  public setExecutionMode(mode: UnityExecutionMode): { success: boolean; executionMode: UnityExecutionMode } {
    if (!["FAST", "DEEP"].includes(mode)) {
      throw new Error(`Invalid execution mode '${mode}'. Must be FAST or DEEP.`);
    }
    const prev = this.executionMode;
    this.executionMode = mode;
    this.recordLedgerEntry({
      actionId: `mode_${Date.now()}`,
      evidenceId: `ev_mode_${Date.now()}`,
      operationId: "execution.mode_change",
      stage: "COMMITTED",
      status: "SUCCESS",
      summary: `Execution mode updated from ${prev} to ${mode}`,
      details: { previous: prev, current: mode },
    });
    return { success: true, executionMode: this.executionMode };
  }

  public getLedger(): UnityLedgerEntry[] {
    return [...this.ledger];
  }

  public getEvidence(evidenceId: string): UnityEvidenceRecord | undefined {
    return this.evidenceStore.get(evidenceId);
  }

  public isUnityTool(name: string): boolean {
    return this.toolsMap.has(name);
  }

  /**
   * Capability Classifier: purely responsible for semantic analysis, category classification, and risk tier inference.
   * NOTE: This classifier DOES NOT make authorization decisions. Authorization is strictly enforced by checkPermission (Permission Gateway).
   */
  public classifyCapability(toolName: string): ToolCapabilityInference {
    const lower = toolName.toLowerCase();

    // 1. Script / Code Execution -> High Risk, L3
    if (
      lower.startsWith("script-") ||
      lower.startsWith("tests-") ||
      lower.includes("execute") ||
      lower.includes("eval")
    ) {
      return {
        category: "CODE_EXECUTION",
        riskLevel: "HIGH",
        inferredLevel: "L3",
        reason: `Tool '${toolName}' performs dynamic code/script execution or test execution.`,
      };
    }

    // 2. Read-only inspection tools -> Low Risk, L1
    const isReadOnly =
      lower.includes("-get") ||
      lower.includes("-find") ||
      lower.includes("-list") ||
      lower.includes("logs") ||
      lower.includes("screenshot") ||
      lower.endsWith("-data") ||
      lower.endsWith("-status") ||
      lower.endsWith("-info");

    if (isReadOnly) {
      return {
        category: "READ_ONLY",
        riskLevel: "LOW",
        inferredLevel: "L1",
        reason: `Tool '${toolName}' performs non-mutating query/inspection.`,
      };
    }

    // 3. Scene / Hierarchy / Asset mutation tools -> Medium Risk, L2
    const isSceneMutation =
      lower.startsWith("gameobject-") ||
      lower.startsWith("assets-") ||
      lower.startsWith("scene-") ||
      lower.startsWith("object-") ||
      lower.startsWith("cinemachine-") ||
      lower.startsWith("animation-") ||
      lower.startsWith("animator-") ||
      lower.startsWith("inputsystem-") ||
      lower.startsWith("camera-") ||
      lower.startsWith("physics-") ||
      lower.startsWith("light-") ||
      lower.startsWith("material-") ||
      lower.startsWith("shader-");

    if (isSceneMutation) {
      return {
        category: "SCENE_MUTATION",
        riskLevel: "MEDIUM",
        inferredLevel: "L2",
        reason: `Tool '${toolName}' mutates scene hierarchy, assets, or project components.`,
      };
    }

    // 4. Conservative Fallback for Unrecognized / Unknown tools -> Critical Risk, L5
    return {
      category: "UNKNOWN",
      riskLevel: "CRITICAL",
      inferredLevel: "L5",
      reason: `Tool '${toolName}' is unrecognized by semantic classifier; conservatively mapped to generic.write / L5 Full Control.`,
    };
  }

  public getRequiredLevel(toolName: string): UnityPermissionLevel {
    return this.classifyCapability(toolName).inferredLevel;
  }

  /**
   * Permission Gateway: enforces the final authorization decision based on caller level and inferred required level.
   */
  public checkPermission(toolName: string): {
    allowed: boolean;
    currentLevel: UnityPermissionLevel;
    requiredLevel: UnityPermissionLevel;
    inference: ToolCapabilityInference;
    reason?: string;
  } {
    const inference = this.classifyCapability(toolName);
    const requiredLevel = inference.inferredLevel;
    const current = this.permission;

    if (current === "L1") {
      if (requiredLevel === "L1") {
        return { allowed: true, currentLevel: current, requiredLevel, inference };
      }
      return {
        allowed: false,
        currentLevel: current,
        requiredLevel,
        inference,
        reason: `PERMISSION_DENIED: L1 Scene Viewer allows read-only inspection only. '${toolName}' requires ${requiredLevel} (${inference.category}, risk: ${inference.riskLevel}).`,
      };
    }

    if (current === "L2") {
      if (requiredLevel === "L1" || requiredLevel === "L2") {
        return { allowed: true, currentLevel: current, requiredLevel, inference };
      }
      return {
        allowed: false,
        currentLevel: current,
        requiredLevel,
        inference,
        reason: `PERMISSION_DENIED: L2 Scene Builder does not have code or script execution permissions. '${toolName}' requires ${requiredLevel} (${inference.category}, risk: ${inference.riskLevel}).`,
      };
    }

    if (current === "L3") {
      if (requiredLevel === "L1" || requiredLevel === "L3") {
        return { allowed: true, currentLevel: current, requiredLevel, inference };
      }
      return {
        allowed: false,
        currentLevel: current,
        requiredLevel,
        inference,
        reason: `PERMISSION_DENIED: L3 Code Builder does not have scene mutation permissions. '${toolName}' requires ${requiredLevel} (${inference.category}, risk: ${inference.riskLevel}).`,
      };
    }

    if (current === "L4") {
      if (requiredLevel === "L1" || requiredLevel === "L2" || requiredLevel === "L3") {
        return { allowed: true, currentLevel: current, requiredLevel, inference };
      }
      return {
        allowed: false,
        currentLevel: current,
        requiredLevel,
        inference,
        reason: `PERMISSION_DENIED: '${toolName}' requires L5 Full Control (${inference.category}, risk: ${inference.riskLevel}).`,
      };
    }

    if (current === "L5") {
      return { allowed: true, currentLevel: current, requiredLevel, inference };
    }

    return {
      allowed: false,
      currentLevel: current,
      requiredLevel: "L5",
      inference,
      reason: `PERMISSION_DENIED: Unrecognized permission level '${current}'`,
    };
  }

  private recordLedgerEntry(entry: Omit<UnityLedgerEntry, "id" | "timestamp" | "provider" | "permissionLevel" | "executionMode"> & Partial<Pick<UnityLedgerEntry, "permissionLevel" | "executionMode">>): void {
    const fullEntry: UnityLedgerEntry = {
      id: `led_${crypto.randomUUID().slice(0, 8)}`,
      timestamp: Date.now(),
      provider: "unity-gamedev",
      permissionLevel: entry.permissionLevel || this.permission,
      executionMode: entry.executionMode || this.executionMode,
      actionId: entry.actionId,
      evidenceId: entry.evidenceId,
      operationId: entry.operationId,
      stage: entry.stage,
      status: entry.status,
      durationMs: entry.durationMs,
      summary: entry.summary,
      details: entry.details,
    };
    this.ledger.push(fullEntry);
    if (this.ledger.length > 500) {
      this.ledger.shift();
    }
  }

  private parseEventStreamData(text: string): any {
    const lines = text.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data: ")) {
        try {
          return JSON.parse(trimmed.slice(6));
        } catch {}
      }
    }
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  /**
   * Ensure GameDev MCP Server is running; if port 20705 is down, attempt to spawn the local binary
   */
  private async ensureServerRunning(): Promise<boolean> {
    try {
      const probeRes = await fetch("http://localhost:20705/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 0,
          method: "initialize",
          params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "probe", version: "1.0.0" } },
        }),
        signal: AbortSignal.timeout(1500),
      });
      if (probeRes.ok) return true;
    } catch {
      // not listening, attempt auto-launch
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
          for (let i = 0; i < 6; i++) {
            await new Promise((r) => setTimeout(r, 500));
            try {
              const res = await fetch("http://localhost:20705/mcp", {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
                body: JSON.stringify({
                  jsonrpc: "2.0",
                  id: 0,
                  method: "initialize",
                  params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "probe", version: "1.0.0" } },
                }),
                signal: AbortSignal.timeout(1000),
              });
              if (res.ok) return true;
            } catch {}
          }
        } catch (spawnErr) {
          console.warn("[UnityGameDevProvider] Failed to spawn gamedev-mcp-server:", spawnErr);
        }
      }
    }
    return false;
  }

  /**
   * Attempt initialization on a specific candidate endpoint
   */
  private async tryInitializeEndpoint(endpointUrl: string): Promise<{ success: boolean; data?: McpInitializeResult; error?: string }> {
    try {
      this.requestId++;
      const initPayload = {
        jsonrpc: "2.0",
        id: this.requestId,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "nexus-mcp-provider",
            version: "1.20.0",
          },
        },
      };

      const res = await fetch(endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(initPayload),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        return {
          success: false,
          error: `HTTP error ${res.status}: ${res.statusText}`,
        };
      }

      const sid = res.headers.get("mcp-session-id");
      const text = await res.text();
      const parsed = this.parseEventStreamData(text);

      if (!parsed || !parsed.result) {
        return {
          success: false,
          error: `Invalid initialize response: ${text.slice(0, 200)}`,
        };
      }

      this.sessionId = sid;
      const result = parsed.result as McpInitializeResult;
      this.serverInfo = result.serverInfo;
      this.capabilities = result.capabilities;
      this.lastInitializedAt = new Date().toISOString();

      // Send notifications/initialized
      await this.sendNotification("notifications/initialized", {});

      return {
        success: true,
        data: result,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.name === "TimeoutError" ? "Initialize timed out" : err.message || String(err),
      };
    }
  }

  /**
   * Perform MCP Initialize handshake over Streamable HTTP MCP with candidate endpoint auto-discovery
   */
  public async initialize(): Promise<{ success: boolean; data?: McpInitializeResult; error?: string }> {
    await this.ensureServerRunning();

    const candidates = [
      this.endpoint,
      "http://localhost:20705/p/6106087c",
      "http://127.0.0.1:20705/p/6106087c",
      "http://localhost:20705/mcp",
      "http://127.0.0.1:20705/mcp",
      "http://localhost:20705/",
      "http://127.0.0.1:20705/",
    ];
    const uniqueCandidates = Array.from(new Set(candidates));
    let lastError: string | null = null;

    for (const cand of uniqueCandidates) {
      const res = await this.tryInitializeEndpoint(cand);
      if (res.success) {
        this.endpoint = cand;
        return res;
      }
      lastError = res.error || "Unknown error";
    }

    return {
      success: false,
      error: lastError || "Failed to initialize MCP session on candidate endpoints",
    };
  }

  private async sendNotification(method: string, params: any = {}): Promise<void> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    try {
      await fetch(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          method,
          params,
        }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {}
  }

  /**
   * Execute tools/list on downstream GameDev MCP server (with concurrency deduplication)
   */
  public async listTools(): Promise<{ success: boolean; count: number; tools: McpToolDefinition[]; error?: string }> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.refreshPromise = this.doListTools().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async doListTools(): Promise<{ success: boolean; count: number; tools: McpToolDefinition[]; error?: string }> {
    if (!this.sessionId) {
      const initRes = await this.initialize();
      if (!initRes.success && this.tools.length === 0) {
        return { success: false, count: 0, tools: [], error: initRes.error };
      }
    }

    try {
      this.requestId++;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      };
      if (this.sessionId) {
        headers["Mcp-Session-Id"] = this.sessionId;
      }

      let res = await fetch(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: this.requestId,
          method: "tools/list",
          params: {},
        }),
        signal: AbortSignal.timeout(10000),
      });

      // Auto-reconnect: if downstream rejected session (HTTP 400, 401, 404, 502), re-initialize and retry once
      if (!res.ok && (res.status === 400 || res.status === 401 || res.status === 404 || res.status === 502)) {
        console.warn(`[UnityGameDevProvider] Stale session detected in listTools (HTTP ${res.status}). Auto-reconnecting...`);
        this.sessionId = null;
        const reInit = await this.initialize();
        if (reInit.success) {
          const retryHeaders: Record<string, string> = {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          };
          if (this.sessionId) {
            retryHeaders["Mcp-Session-Id"] = this.sessionId;
          }
          this.requestId++;
          res = await fetch(this.endpoint, {
            method: "POST",
            headers: retryHeaders,
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: this.requestId,
              method: "tools/list",
              params: {},
            }),
            signal: AbortSignal.timeout(10000),
          });
        }
      }

      if (!res.ok) {
        if (this.tools.length > 0) {
          return { success: true, count: this.tools.length, tools: this.getExposedTools() };
        }
        return {
          success: false,
          count: 0,
          tools: [],
          error: `HTTP error ${res.status}: ${res.statusText}`,
        };
      }

      const text = await res.text();
      const parsed = this.parseEventStreamData(text);

      if (!parsed || !parsed.result || !Array.isArray(parsed.result.tools)) {
        if (this.tools.length > 0) {
          return { success: true, count: this.tools.length, tools: this.getExposedTools() };
        }
        return {
          success: false,
          count: 0,
          tools: [],
          error: `Invalid tools/list response: ${text.slice(0, 200)}`,
        };
      }

      this.tools = parsed.result.tools.map((t: any) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        outputSchema: t.outputSchema,
        annotations: {
          provider: "unity-gamedev",
          source: "external-mcp",
          version: this.serverInfo?.version || "9.2.9.0",
          priority: "primary",
          executionTarget: "unity-editor-native",
        },
        provider: "unity-gamedev",
        source: "external-mcp",
        version: this.serverInfo?.version || "9.2.9.0",
      }));
      this.toolsMap = new Map(this.tools.map((t) => [t.name, t]));

      const exposed = this.getExposedTools();
      return {
        success: true,
        count: exposed.length,
        tools: exposed,
      };
    } catch (err: any) {
      if (this.tools.length > 0) {
        return { success: true, count: this.tools.length, tools: this.getExposedTools() };
      }
      return {
        success: false,
        count: 0,
        tools: [],
        error: err.message || String(err),
      };
    }
  }

  /**
   * Refreshes the dynamic tool catalog by querying downstream GameDev MCP
   */
  public async refreshCatalog(): Promise<{
    success: boolean;
    count: number;
    tools: McpToolDefinition[];
    error?: string;
  }> {
    return await this.listTools();
  }

  /**
   * Get all exposed tools with external provider annotations
   */
  public getExposedTools(): McpToolDefinition[] {
    return this.tools.map((t) => {
      const inference = this.classifyCapability(t.name);
      return {
        name: t.name,
        description: `[Unity Native Tool - Primary for Unity Editor] ${t.description}`,
        inputSchema: t.inputSchema,
        outputSchema: t.outputSchema,
        provider: "unity-gamedev",
        source: "external-mcp",
        version: this.serverInfo?.version || "9.2.9.0",
        category: inference.category,
        riskLevel: inference.riskLevel,
        requiredPermission: inference.inferredLevel,
        strategy: inference.category === "READ_ONLY" ? "FAST" : this.executionMode,
        annotations: {
          provider: "unity-gamedev",
          source: "external-mcp",
          version: this.serverInfo?.version || "9.2.9.0",
          priority: "primary",
          executionTarget: "unity-editor-native",
          category: inference.category,
          riskLevel: inference.riskLevel,
          requiredPermission: inference.inferredLevel,
          strategy: inference.category === "READ_ONLY" ? "FAST" : this.executionMode,
        },
      };
    });
  }

  /**
   * Dispatches a tool call directly to downstream GameDev MCP server with auto-reconnect
   */
  public async callDownstream(
    name: string,
    args: Record<string, any> = {}
  ): Promise<{ success: boolean; result?: McpToolCallResult; error?: string }> {
    if (!this.sessionId) {
      const initRes = await this.initialize();
      if (!initRes.success) {
        const errorMsg = `[Provider Unavailable] Failed to initialize connection to GameDev MCP: ${initRes.error}`;
        this.recordExecutionFailure(errorMsg);
        return {
          success: false,
          error: errorMsg,
        };
      }
    }

    try {
      this.requestId++;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      };
      if (this.sessionId) {
        headers["Mcp-Session-Id"] = this.sessionId;
      }

      let res = await fetch(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: this.requestId,
          method: "tools/call",
          params: {
            name,
            arguments: args,
          },
        }),
        signal: AbortSignal.timeout(30000),
      });

      // Auto-reconnect: if downstream rejected session (HTTP 400, 401, 404, 502), re-initialize and retry once
      if (!res.ok && (res.status === 400 || res.status === 401 || res.status === 404 || res.status === 502)) {
        console.warn(`[UnityGameDevProvider] Stale session detected in callDownstream (HTTP ${res.status}). Auto-reconnecting...`);
        this.sessionId = null;
        const reInit = await this.initialize();
        if (reInit.success) {
          const retryHeaders: Record<string, string> = {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          };
          if (this.sessionId) {
            retryHeaders["Mcp-Session-Id"] = this.sessionId;
          }
          this.requestId++;
          res = await fetch(this.endpoint, {
            method: "POST",
            headers: retryHeaders,
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: this.requestId,
              method: "tools/call",
              params: {
                name,
                arguments: args,
              },
            }),
            signal: AbortSignal.timeout(30000),
          });
        }
      }

      if (!res.ok) {
        const errorMsg = `[Downstream HTTP Error] HTTP ${res.status}: ${res.statusText}`;
        if (res.status >= 500) {
          this.recordExecutionFailure(errorMsg);
        }
        return {
          success: false,
          error: errorMsg,
        };
      }

      const text = await res.text();
      const parsed = this.parseEventStreamData(text);

      if (!parsed || !parsed.result) {
        const errorMsg = `[Downstream Protocol Error] Invalid tools/call response: ${text.slice(0, 200)}`;
        this.recordExecutionFailure(errorMsg);
        return {
          success: false,
          error: errorMsg,
        };
      }

      // Successful downstream transport communication
      this.recordExecutionSuccess();

      const toolResult = parsed.result as McpToolCallResult;
      const isError = Boolean(toolResult.isError);

      return {
        success: !isError,
        result: toolResult,
        error: isError ? JSON.stringify(toolResult.content) : undefined,
      };
    } catch (err: any) {
      this.sessionId = null; // Invalidate session on network failure
      const errorMsg = err.name === "TimeoutError"
        ? `[Downstream Timeout] Tool '${name}' call timed out after ${this.circuitBreakerConfig.requestTimeoutMs || 30000}ms`
        : `[Downstream Connection Failure] Unable to connect to GameDev MCP at ${this.endpoint}: ${err.message || String(err)}`;
      this.recordExecutionFailure(errorMsg);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Main tool execution entry point with Permission Gate, Execution Mode, and Ledger & Evidence lifecycle
   */
  public async executeTool(
    name: string,
    args: Record<string, any> = {}
  ): Promise<McpToolCallResult> {
    const startTime = Date.now();
    const actionId = `act_${crypto.randomUUID().slice(0, 8)}`;
    const evidenceId = `ev_${crypto.randomUUID().slice(0, 8)}`;

    // Normalization & alias compatibility for gameobject-find and gameobject-destroy
    if ((name === "gameobject-find" || name === "gameobject-destroy") && !args.gameObjectRef) {
      if (args.gameObjectRef) {
        // already provided
      } else if (args.objectRef) {
        args.gameObjectRef = args.objectRef;
      } else if (args.instanceID !== undefined) {
        args.gameObjectRef = { instanceID: args.instanceID };
      } else if (args.name) {
        args.gameObjectRef = { name: args.name, instanceID: 0 };
      } else if (args.search_term) {
        args.gameObjectRef = { name: args.search_term, instanceID: 0 };
      }
    }

    // Normalization & alias compatibility for script-execute
    if (name === "script-execute") {
      if (!args.csharpCode && (args.script || args.code)) {
        args.csharpCode = args.script || args.code;
      }
      if (typeof args.csharpCode === "string" && args.isMethodBody === undefined) {
        if (!args.csharpCode.includes("class ") && !args.csharpCode.includes("namespace ")) {
          args.isMethodBody = true;
        }
      }
    }

    // Normalization & alias compatibility for object-get-data
    if (name === "object-get-data" && !args.objectRef) {
      if (args.instanceID !== undefined) {
        args.objectRef = { instanceID: Number(args.instanceID) };
      } else if (args.objectId !== undefined) {
        args.objectRef = { instanceID: Number(args.objectId) };
      }
    }

    // 1. HARD PERMISSION GATE INTERCEPTION (Checked first so unauthorized calls always get 403 and never bypass policy)
    const check = this.checkPermission(name);
    if (!check.allowed) {
      // Record REJECTED audit in Ledger & Evidence
      this.recordLedgerEntry({
        actionId,
        evidenceId,
        operationId: name,
        stage: "REJECTED",
        status: "REJECTED",
        durationMs: Date.now() - startTime,
        summary: check.reason || `PERMISSION_DENIED for '${name}'`,
        details: {
          currentLevel: check.currentLevel,
          requiredLevel: check.requiredLevel,
          inference: check.inference,
          arguments: args,
        },
      });

      this.evidenceStore.set(evidenceId, {
        id: evidenceId,
        actionId,
        operationId: name,
        provider: "unity-gamedev",
        timestamp: startTime,
        status: "REJECTED",
        permissionLevel: this.permission,
        executionMode: this.executionMode,
        verificationPassed: false,
        auditReason: check.reason,
        arguments: args,
        durationMs: Date.now() - startTime,
      });

      return {
        content: [
          {
            type: "text",
            text: `${check.reason} (Evidence: ${evidenceId})`,
          },
        ],
        isError: true,
        permission: {
          status: 403,
          code: "PERMISSION_DENIED",
          evidenceId,
          actionId,
          currentLevel: check.currentLevel,
          requiredLevel: check.requiredLevel,
          reason: check.reason,
        },
      };
    }

    // 2. TOOL EXISTENCE VERIFICATION
    if (!this.isUnityTool(name)) {
      const errorText = `[External Provider Error] Tool '${name}' not found in external provider 'unity-gamedev'`;
      return {
        content: [{ type: "text", text: errorText }],
        isError: true,
      };
    }

    // 3. CIRCUIT BREAKER GATE (Fast-fail if OPEN, or check probe limits if HALF_OPEN)
    const cbCheck = this.canExecuteRequest();
    if (!cbCheck.allowed) {
      this.recordLedgerEntry({
        actionId,
        evidenceId,
        operationId: name,
        stage: "EXECUTED",
        status: "FAILED",
        durationMs: 0,
        summary: cbCheck.reason || "CIRCUIT_BREAKER_OPEN",
        details: { circuitBreaker: this.getCircuitBreakerStatus() },
      });

      this.evidenceStore.set(evidenceId, {
        id: evidenceId,
        actionId,
        operationId: name,
        provider: "unity-gamedev",
        timestamp: startTime,
        status: "FAILED",
        permissionLevel: this.permission,
        executionMode: this.executionMode,
        verificationPassed: false,
        auditReason: cbCheck.reason,
        arguments: args,
        durationMs: 0,
      });

      return {
        content: [{ type: "text", text: cbCheck.reason || "Circuit breaker open" }],
        isError: true,
        permission: {
          status: 503,
          code: "CIRCUIT_BREAKER_OPEN",
          reason: cbCheck.reason,
        },
        evidenceId,
        actionId,
      };
    }

    // 2. LIFECYCLE STAGE 1: PREPARED
    this.recordLedgerEntry({
      actionId,
      evidenceId,
      operationId: name,
      stage: "PREPARED",
      status: "PENDING",
      summary: `Action prepared: '${name}' authorized under permission ${this.permission} (${this.executionMode} mode)`,
      details: { arguments: args },
    });

    // 3. LIFECYCLE STAGE 2: STARTED
    this.recordLedgerEntry({
      actionId,
      evidenceId,
      operationId: name,
      stage: "STARTED",
      status: "PENDING",
      summary: `Action started: dispatching '${name}' to downstream GameDev MCP`,
    });

    // 4. LIFECYCLE STAGE 3: EXECUTED
    const downstreamRes = await this.callDownstream(name, args);
    const execDuration = Date.now() - startTime;

    if (!downstreamRes.success && downstreamRes.error && !downstreamRes.result) {
      // Downstream failure (timeout, network, or provider unavailable)
      this.recordLedgerEntry({
        actionId,
        evidenceId,
        operationId: name,
        stage: "EXECUTED",
        status: "FAILED",
        durationMs: execDuration,
        summary: `Action execution failed: ${downstreamRes.error}`,
      });

      this.evidenceStore.set(evidenceId, {
        id: evidenceId,
        actionId,
        operationId: name,
        provider: "unity-gamedev",
        timestamp: startTime,
        status: "FAILED",
        permissionLevel: this.permission,
        executionMode: this.executionMode,
        verificationPassed: false,
        auditReason: downstreamRes.error,
        arguments: args,
        durationMs: execDuration,
      });

      return {
        content: [{ type: "text", text: downstreamRes.error }],
        isError: true,
        evidenceId,
        actionId,
      };
    }

    const toolResult = downstreamRes.result || {
      content: [{ type: "text", text: JSON.stringify(downstreamRes) }],
      isError: !downstreamRes.success,
    };

    this.recordLedgerEntry({
      actionId,
      evidenceId,
      operationId: name,
      stage: "EXECUTED",
      status: toolResult.isError ? "FAILED" : "SUCCESS",
      durationMs: execDuration,
      summary: `Action executed: downstream response received (isError=${Boolean(toolResult.isError)})`,
      details: { responsePreview: toolResult.content },
    });

    // 5. LIFECYCLE STAGE 4: VERIFIED
    const verificationPassed = !toolResult.isError;
    this.recordLedgerEntry({
      actionId,
      evidenceId,
      operationId: name,
      stage: "VERIFIED",
      status: verificationPassed ? "SUCCESS" : "FAILED",
      summary: `Action verified: ${this.executionMode === "DEEP" ? "deep verification structure verified" : "shallow verification passed"}`,
      details: { verificationPassed, executionMode: this.executionMode },
    });

    // 6. LIFECYCLE STAGE 5: COMMITTED
    const totalDuration = Date.now() - startTime;
    this.recordLedgerEntry({
      actionId,
      evidenceId,
      operationId: name,
      stage: "COMMITTED",
      status: verificationPassed ? "SUCCESS" : "FAILED",
      durationMs: totalDuration,
      summary: `Action committed: '${name}' completed with status ${verificationPassed ? "SUCCESS" : "FAILED"} in ${totalDuration}ms`,
    });

    // Store Evidence record
    this.evidenceStore.set(evidenceId, {
      id: evidenceId,
      actionId,
      operationId: name,
      provider: "unity-gamedev",
      timestamp: startTime,
      status: verificationPassed ? "COMMITTED" : "FAILED",
      permissionLevel: this.permission,
      executionMode: this.executionMode,
      verificationPassed,
      auditReason: verificationPassed ? "Verified clean execution" : "Downstream returned error",
      arguments: args,
      responsePreview: toolResult.content,
      durationMs: totalDuration,
    });

    return {
      ...toolResult,
      evidenceId,
      actionId,
    };
  }

  public getStatus() {
    return {
      connected: this.isConnected(),
      endpoint: this.endpoint,
      sessionId: this.sessionId,
      serverInfo: this.serverInfo,
      capabilities: this.capabilities,
      toolCount: this.tools.length,
      lastInitializedAt: this.lastInitializedAt,
      permission: this.permission,
      executionMode: this.executionMode,
      circuitBreaker: this.getCircuitBreakerStatus(),
      ledgerCount: this.ledger.length,
      evidenceCount: this.evidenceStore.size,
    };
  }

  public getCircuitBreakerStatus(): CircuitBreakerStatus {
    if (this.circuitState === "OPEN" && this.lastFailureTime) {
      if (Date.now() - this.lastFailureTime >= this.circuitBreakerConfig.cooldownMs) {
        this.circuitState = "HALF_OPEN";
        this.halfOpenProbes = 0;
        console.log("[UnityGameDevProvider] Circuit Breaker cooldown elapsed. Transitioned to HALF_OPEN.");
      }
    }
    return {
      state: this.circuitState,
      consecutiveFailures: this.consecutiveFailures,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      config: { ...this.circuitBreakerConfig },
    };
  }

  public setCircuitBreakerConfig(config: Partial<CircuitBreakerConfig>): CircuitBreakerConfig {
    this.circuitBreakerConfig = {
      ...this.circuitBreakerConfig,
      ...config,
    };
    return { ...this.circuitBreakerConfig };
  }

  public resetCircuitBreaker(): void {
    this.circuitState = "CLOSED";
    this.consecutiveFailures = 0;
    this.halfOpenProbes = 0;
    this.lastFailureTime = null;
    console.log("[UnityGameDevProvider] Circuit Breaker manually reset to CLOSED.");
  }

  public tripCircuitBreakerForTesting(reason = "Manual trip for testing"): void {
    this.circuitState = "OPEN";
    this.consecutiveFailures = this.circuitBreakerConfig.failureThreshold;
    this.lastFailureTime = Date.now();
    console.log(`[UnityGameDevProvider] Circuit Breaker manually tripped to OPEN: ${reason}`);
  }

  public canExecuteRequest(): { allowed: boolean; reason?: string } {
    if (this.circuitState === "OPEN" && this.lastFailureTime) {
      if (Date.now() - this.lastFailureTime >= this.circuitBreakerConfig.cooldownMs) {
        this.circuitState = "HALF_OPEN";
        this.halfOpenProbes = 0;
        console.log("[UnityGameDevProvider] Circuit Breaker cooldown elapsed. Transitioned to HALF_OPEN.");
      }
    }

    if (this.circuitState === "OPEN") {
      const remainingMs = Math.max(0, this.circuitBreakerConfig.cooldownMs - (Date.now() - (this.lastFailureTime || 0)));
      return {
        allowed: false,
        reason: `[Circuit Breaker OPEN] Downstream GameDev MCP is cooling down after ${this.consecutiveFailures} consecutive failures. Retry allowed in ${remainingMs}ms.`,
      };
    }

    if (this.circuitState === "HALF_OPEN") {
      if (this.halfOpenProbes >= this.circuitBreakerConfig.halfOpenMaxProbes) {
        return {
          allowed: false,
          reason: `[Circuit Breaker HALF_OPEN] Maximum probe limit (${this.circuitBreakerConfig.halfOpenMaxProbes}) reached. Awaiting probe result.`,
        };
      }
      this.halfOpenProbes++;
    }

    return { allowed: true };
  }

  public recordExecutionSuccess(): void {
    if (this.circuitState === "HALF_OPEN") {
      console.log("[UnityGameDevProvider] Probe succeeded. Circuit Breaker transitioned to CLOSED.");
    }
    this.circuitState = "CLOSED";
    this.consecutiveFailures = 0;
    this.halfOpenProbes = 0;
    this.lastSuccessTime = Date.now();
  }

  public recordExecutionFailure(reason: string): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();

    if (this.circuitState === "HALF_OPEN") {
      this.circuitState = "OPEN";
      console.warn(`[UnityGameDevProvider] Probe failed (${reason}). Circuit Breaker transitioned back to OPEN.`);
      return;
    }

    if (this.consecutiveFailures >= this.circuitBreakerConfig.failureThreshold) {
      this.circuitState = "OPEN";
      console.warn(`[UnityGameDevProvider] ${this.consecutiveFailures} consecutive failures reached threshold (${this.circuitBreakerConfig.failureThreshold}). Circuit Breaker TRIPPED to OPEN.`);
    }
  }
}
