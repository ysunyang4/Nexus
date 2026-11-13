/**
 * Nexus Generic MCP Client Runtime — Tool Schema Cache
 * 
 * High-performance, TTL-managed Tool Schema Cache:
 * - Eliminates redundant tools/list network trips
 * - Safe fallback: retains last-known-good cache if downstream refresh fails
 * - Granular invalidation by provider or global
 * - Hash verification for tool schema changes
 */

import crypto from "node:crypto";

export interface CachedToolEntry {
  providerId: string;
  tools: any[];
  toolCount: number;
  cachedAt: number;
  expiresAt: number;
  hash: string;
}

export class MCPToolCache {
  private static instance: MCPToolCache | null = null;
  private cache: Map<string, CachedToolEntry> = new Map();
  private lastKnownGood: Map<string, CachedToolEntry> = new Map();
  private defaultTtlMs = 10 * 60 * 1000; // 10 minutes default TTL

  private constructor() {}

  public static getInstance(): MCPToolCache {
    if (!MCPToolCache.instance) {
      MCPToolCache.instance = new MCPToolCache();
    }
    return MCPToolCache.instance;
  }

  /**
   * Compute normalized hash of tool definitions
   */
  public static computeHash(tools: any[]): string {
    const normalized = tools.map((t) => ({
      name: t.name,
      description: t.description || "",
      inputSchema: t.inputSchema || {},
    }));
    return crypto
      .createHash("sha256")
      .update(JSON.stringify(normalized))
      .digest("hex");
  }

  /**
   * Get fresh cached tools if not expired
   */
  public get(providerId: string): any[] | null {
    const entry = this.cache.get(providerId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      return null; // Expired
    }
    return entry.tools;
  }

  /**
   * Set cached tools for a provider
   */
  public set(providerId: string, tools: any[], ttlMs?: number): CachedToolEntry {
    const now = Date.now();
    const effectiveTtl = ttlMs ?? this.defaultTtlMs;
    const hash = MCPToolCache.computeHash(tools);

    const entry: CachedToolEntry = {
      providerId,
      tools: [...tools],
      toolCount: tools.length,
      cachedAt: now,
      expiresAt: now + effectiveTtl,
      hash,
    };

    this.cache.set(providerId, entry);
    this.lastKnownGood.set(providerId, entry);
    return entry;
  }

  /**
   * Get last-known-good tools even if cache expired (safe fallback)
   */
  public getLastKnownGood(providerId: string): any[] | null {
    const entry = this.lastKnownGood.get(providerId) || this.cache.get(providerId);
    return entry ? entry.tools : null;
  }

  /**
   * Invalidate cache for a specific provider or all providers
   */
  public invalidate(providerId?: string): void {
    if (providerId) {
      this.cache.delete(providerId);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Get cached tool count for a provider
   */
  public getToolCount(providerId: string): number {
    const entry = this.cache.get(providerId) || this.lastKnownGood.get(providerId);
    return entry ? entry.toolCount : 0;
  }

  /**
   * Check if valid cache exists
   */
  public hasValidCache(providerId: string): boolean {
    const entry = this.cache.get(providerId);
    if (!entry) return false;
    return Date.now() <= entry.expiresAt;
  }

  /**
   * Get cache telemetry stats
   */
  public getStats(): Record<string, { count: number; ageMs: number; isExpired: boolean; hash: string }> {
    const stats: Record<string, { count: number; ageMs: number; isExpired: boolean; hash: string }> = {};
    const now = Date.now();
    for (const [id, entry] of this.cache.entries()) {
      stats[id] = {
        count: entry.toolCount,
        ageMs: now - entry.cachedAt,
        isExpired: now > entry.expiresAt,
        hash: entry.hash,
      };
    }
    return stats;
  }
}
