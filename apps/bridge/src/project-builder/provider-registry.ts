/**
 * Nexus Generic Provider Framework & Provider Registry
 * 
 * Manages all active execution providers (Unity GameDev, LocalBridge Core,
 * and dynamically attached external MCP providers like Blender, Browser, etc.).
 * 
 * Features:
 * - Unifies directly with ProviderRuntime & DynamicCatalog as the Single Source of Truth
 * - Dynamic Discovery: initialize -> tools/list -> Dynamic Catalog
 * - Zero Rebuild: Add new external MCP servers via UI or API on the fly
 * - Unified execution dispatch, permission checks, and verification-first ledger
 */

import { ProviderRuntime } from "../generic-mcp/provider-runtime.js";
import { DynamicCatalog } from "../generic-mcp/dynamic-catalog.js";
import { UnityGameDevMcpProvider } from "../unity-gamedev-provider.js";
import { NexusClient } from "../nexus-client.js";
import type { ProviderConfig, ProviderInfo as GenericProviderInfo } from "../generic-mcp/types.js";

export interface ExternalMcpServerConfig {
  id: string;
  name: string;
  endpoint: string; // e.g. "http://127.0.0.1:9099/mcp"
  transport: "streamable-http" | "sse" | "stdio";
  authType?: "bearer" | "none";
  token?: string;
  description?: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  type: "builtin-core" | "unity-primary" | "external-mcp";
  endpoint: string;
  connected: boolean;
  toolCount: number;
  capabilities: string[];
  lastPing?: string;
  status: string;
  metrics?: any;
  sessionId?: string;
}

export class ProviderRegistry {
  private static instance: ProviderRegistry | null = null;
  private runtime: ProviderRuntime;
  private catalog: DynamicCatalog;
  private unityProvider: UnityGameDevMcpProvider;
  private nexusClient: NexusClient | null = null;

  private constructor() {
    this.runtime = ProviderRuntime.getInstance();
    this.catalog = DynamicCatalog.getInstance();
    this.unityProvider = UnityGameDevMcpProvider.getInstance();
  }

  public static getInstance(): ProviderRegistry {
    if (!ProviderRegistry.instance) {
      ProviderRegistry.instance = new ProviderRegistry();
    }
    return ProviderRegistry.instance;
  }

  public setNexusClient(client: NexusClient) {
    this.nexusClient = client;
  }

  /**
   * Register a new external MCP Provider on the fly (Zero Rebuild required)
   */
  public async registerExternalProvider(config: ExternalMcpServerConfig): Promise<{
    success: boolean;
    toolCount: number;
    tools: any[];
    error?: string;
  }> {
    const runtimeConfig: ProviderConfig = {
      providerId: config.id,
      displayName: config.name,
      endpoint: config.endpoint,
      transport: config.transport === "sse" ? "sse" : "streamableHttp",
      authentication: config.token
        ? { type: "bearer", token: config.token }
        : { type: "none" },
      policy: {
        allowLocalLoopback: true,
      },
      enabled: true,
    };

    const res = await this.runtime.registerProvider(runtimeConfig);
    const tools = this.catalog.getToolsByProvider(config.id);

    return {
      success: res.success,
      toolCount: res.toolCount,
      tools,
      error: res.error,
    };
  }

  /**
   * List all registered providers and their live connection status
   */
  public async listProviders(): Promise<ProviderInfo[]> {
    const genericList = this.runtime.listProviders();
    const list: ProviderInfo[] = [];

    for (const g of genericList) {
      list.push({
        id: g.providerId,
        name: g.displayName,
        type:
          g.providerId === "localbridge-core"
            ? "builtin-core"
            : g.providerId === "unity-gamedev"
            ? "unity-primary"
            : "external-mcp",
        endpoint: g.endpoint,
        connected: g.status === "READY",
        status: g.status,
        toolCount: g.toolCount,
        capabilities: g.capabilities ? Object.keys(g.capabilities) : [],
        lastPing: g.lastSeenAt,
        metrics: g.metrics,
        sessionId: g.sessionId,
      });
    }

    return list;
  }

  /**
   * Collect all available tool names across all providers
   */
  public async getAllAvailableToolNames(): Promise<Set<string>> {
    const set = new Set<string>();

    // Unity tools
    const unityTools = this.unityProvider.getExposedTools();
    for (const t of unityTools) {
      set.add(t.name);
    }

    // Dynamic catalog tools
    const snapshot = this.catalog.getSnapshot();
    for (const t of snapshot.tools) {
      set.add(t.name);
      set.add(t.qualifiedName);
    }

    // Core tools (Canonical + legacy)
    set.add("nexus_project_list");
    set.add("nexus_project_info");
    set.add("nexus_file_read");
    set.add("nexus_file_write");
    set.add("nexus_file_create");
    set.add("nexus_git_status");

    return set;
  }

  /**
   * Execute a tool on the designated provider
   */
  public async executeTool(
    providerId: string,
    toolName: string,
    args: Record<string, any>
  ): Promise<{
    content: any[];
    structuredContent?: any;
    isError: boolean;
    evidenceId?: string;
    actionId?: string;
    error?: string;
  }> {
    // 1. Dispatch to LocalBridge Core Server if targeted
    if (providerId === "localbridge-core") {
      if (!this.nexusClient) {
        return {
          content: [{ type: "text", text: "LocalBridge Core client not configured in ProviderRegistry" }],
          isError: true,
          error: "LocalBridge Core client not configured",
        };
      }
      try {
        let actualTool = toolName;
        if (toolName.startsWith("nexus_")) {
          actualTool = toolName.replace("nexus_", "localbridge_");
        }
        let finalArgs = { ...args };
        if (finalArgs.projectId && typeof finalArgs.projectId === "string") {
          try {
            const resolved = await this.nexusClient.resolveProject(finalArgs.projectId);
            finalArgs.projectId = resolved.id;
          } catch {}
        }
        const res = await this.nexusClient.callNexusTool(actualTool, finalArgs);
        return {
          content: (res.content || [{ type: "text", text: JSON.stringify(res) }]) as any,
          structuredContent: res,
          isError: Boolean(res.isError),
          evidenceId: `ev_core_${Date.now()}`,
          actionId: `act_core_${Date.now()}`,
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: err.message || String(err) }],
          isError: true,
          error: err.message || String(err),
        };
      }
    }

    // 2. Dispatch to Generic ProviderRuntime (Dynamic Catalog + Unified Transport)
    const qualifiedLookup = toolName.includes("::") ? toolName : `${providerId}::${toolName}`;
    const dynamicTool = this.catalog.resolveTool(qualifiedLookup) || this.catalog.resolveTool(toolName);

    if (dynamicTool) {
      const execResult = await this.runtime.executeTool(dynamicTool.qualifiedName, args);
      return {
        content: execResult.content,
        isError: execResult.isError,
        evidenceId: execResult.evidenceId,
        actionId: execResult.actionId,
        error: execResult.error,
      };
    }

    // 3. Fallback to Unity Provider for backward compatibility
    const fallbackResult = await this.unityProvider.executeTool(toolName, args);
    return {
      content: fallbackResult.content || [],
      structuredContent: fallbackResult.structuredContent,
      isError: Boolean(fallbackResult.isError),
      evidenceId: fallbackResult.evidenceId,
      actionId: fallbackResult.actionId,
      error: fallbackResult.isError ? (fallbackResult.content?.[0]?.text || "Tool Error") : undefined,
    };
  }
}
