/**
 * Nexus Generic MCP Client Runtime — Connection Manager
 * 
 * Central coordinator for all downstream MCP server connections:
 * - Client instance pooling & lifecycle
 * - Session reuse & Keep-Alive orchestration
 * - Reconnect loops and connection health telemetry
 * - Global performance metrics aggregation
 * - Delegation to SessionManager, ToolCache, and BatchExecutor
 */

import { GenericMcpClient } from "./generic-mcp-client.js";
import { MCPSessionManager } from "./mcp-session-manager.js";
import { MCPToolCache } from "./mcp-tool-cache.js";
import { MCPBatchExecutor } from "./mcp-batch-executor.js";
import type {
  ProviderConfig,
  MCPPerformanceMetrics,
  MCPSessionState,
} from "./types.js";

export class MCPConnectionManager {
  private static instance: MCPConnectionManager | null = null;
  private clients: Map<string, GenericMcpClient> = new Map();
  private sessionManager: MCPSessionManager;
  private toolCache: MCPToolCache;
  private batchExecutor: MCPBatchExecutor;

  private constructor() {
    this.sessionManager = MCPSessionManager.getInstance();
    this.toolCache = MCPToolCache.getInstance();
    this.batchExecutor = MCPBatchExecutor.getInstance();
  }

  public static getInstance(): MCPConnectionManager {
    if (!MCPConnectionManager.instance) {
      MCPConnectionManager.instance = new MCPConnectionManager();
    }
    return MCPConnectionManager.instance;
  }

  /**
   * Get existing client for provider if available
   */
  public getClient(providerId: string): GenericMcpClient | undefined {
    return this.clients.get(providerId);
  }

  /**
   * Get or instantiate client for provider config
   */
  public getOrCreateClient(config: ProviderConfig): GenericMcpClient {
    let client = this.clients.get(config.providerId);
    if (!client) {
      client = new GenericMcpClient(config);
      this.clients.set(config.providerId, client);
    }
    return client;
  }

  /**
   * Check connection health for a provider
   */
  public async checkHealth(
    providerId: string
  ): Promise<{ healthy: boolean; latencyMs: number; sessionState: MCPSessionState }> {
    const client = this.clients.get(providerId);
    if (!client) {
      return { healthy: false, latencyMs: -1, sessionState: "DISCONNECTED" };
    }

    const pingRes = await client.ping();
    const session = this.sessionManager.getSession(providerId);
    const sessionState = session ? session.state : (pingRes.healthy ? "READY" : "DISCONNECTED");

    return {
      healthy: pingRes.healthy,
      latencyMs: pingRes.latencyMs,
      sessionState,
    };
  }

  /**
   * Perform reconnect and re-discovery for a provider
   */
  public async reconnect(providerId: string): Promise<boolean> {
    const client = this.clients.get(providerId);
    if (!client) return false;

    try {
      this.sessionManager.invalidateSession(providerId, "Manual reconnect triggered");
      this.toolCache.invalidate(providerId);
      await client.initialize();
      await client.listTools({ bypassCache: true });
      return true;
    } catch (err: any) {
      console.warn(`[MCPConnectionManager] Reconnect failed for provider '${providerId}':`, err.message);
      return false;
    }
  }

  /**
   * Get performance metrics for a specific provider
   */
  public getPerformanceMetrics(providerId: string): MCPPerformanceMetrics | null {
    const client = this.clients.get(providerId);
    if (!client) return null;
    return client.getPerformanceMetrics();
  }

  /**
   * Get performance metrics across all connected providers
   */
  public getAllMetrics(): Record<string, MCPPerformanceMetrics> {
    const res: Record<string, MCPPerformanceMetrics> = {};
    for (const [providerId, client] of this.clients.entries()) {
      res[providerId] = client.getPerformanceMetrics();
    }
    return res;
  }

  /**
   * Remove and clean up client connection
   */
  public async removeClient(providerId: string): Promise<void> {
    const client = this.clients.get(providerId);
    if (client) {
      await this.sessionManager.closeSession(providerId).catch(() => {});
      this.toolCache.invalidate(providerId);
      this.clients.delete(providerId);
    }
  }

  public getSessionManager(): MCPSessionManager {
    return this.sessionManager;
  }

  public getToolCache(): MCPToolCache {
    return this.toolCache;
  }

  public getBatchExecutor(): MCPBatchExecutor {
    return this.batchExecutor;
  }
}
