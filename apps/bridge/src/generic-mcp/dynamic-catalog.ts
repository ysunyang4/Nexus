/**
 * Nexus Dynamic Tool Catalog — Single Source of Truth
 * 
 * Features:
 * 1. Single Source of Truth for Desktop UI, AI MCP Gateway, and Project Builder
 * 2. Globally Unique Tool Namespacing: "${providerId}::${toolName}"
 * 3. Atomic Catalog Swap: Complete validation before pointer swap; version increment
 * 4. Catalog Version & SHA-256 Hash tracking
 * 5. TOCTOU Mitigation: Detects stale catalog references and raises CATALOG_CHANGED
 * 6. Malformed tool rejection without degrading other valid tools
 */

import crypto from "node:crypto";
import { SecurityGuard } from "./security-guard.js";
import type {
  DynamicMcpTool,
  DynamicCatalogSnapshot,
  ToolPermissionClass,
} from "./types.js";

export class DynamicCatalog {
  private static instance: DynamicCatalog | null = null;
  private currentSnapshot: DynamicCatalogSnapshot;
  private toolsByQualifiedName: Map<string, DynamicMcpTool> = new Map();
  private toolsByProvider: Map<string, DynamicMcpTool[]> = new Map();
  private aliasMap: Map<string, string> = new Map(); // Short name -> qualifiedName (if non-ambiguous)

  private constructor() {
    this.currentSnapshot = {
      catalogVersion: 1,
      catalogHash: this.calculateHash([]),
      discoveredAt: Date.now(),
      tools: [],
      toolCount: 0,
      providersRepresented: [],
    };
  }

  public static getInstance(): DynamicCatalog {
    if (!DynamicCatalog.instance) {
      DynamicCatalog.instance = new DynamicCatalog();
    }
    return DynamicCatalog.instance;
  }

  /**
   * Atomically swap catalog tools for a designated provider
   */
  public atomicSwapProviderTools(
    providerId: string,
    providerInstanceId: string,
    rawTools: any[],
    explicitPolicy?: ToolPermissionClass
  ): {
    success: boolean;
    validCount: number;
    rejectedCount: number;
    rejectionReasons: Array<{ toolName: string; reason: string }>;
    catalogVersion: number;
    catalogHash: string;
  } {
    const validTools: DynamicMcpTool[] = [];
    const rejections: Array<{ toolName: string; reason: string }> = [];

    // 1. Validate each raw tool schema individually
    for (const raw of rawTools) {
      const toolName = raw?.name || "unnamed_tool";
      const validation = SecurityGuard.validateToolSchema(raw, providerId);

      if (!validation.valid) {
        rejections.push({
          toolName,
          reason: validation.reason || "Unknown schema violation",
        });
        continue;
      }

      const clean = validation.sanitizedTool;
      const qualifiedName = `${providerId}::${clean.name}`;
      const permInfo = SecurityGuard.classifyToolPermission(clean.name, clean.inputSchema, explicitPolicy);
      const semantics = SecurityGuard.analyzeToolSemantics(clean.name, clean.annotations);

      const dynamicTool: DynamicMcpTool = {
        toolId: qualifiedName,
        qualifiedName,
        providerId,
        providerInstanceId,
        name: clean.name,
        description: clean.description,
        inputSchema: clean.inputSchema,
        outputSchema: clean.outputSchema,
        annotations: clean.annotations,
        permissionClass: permInfo.permissionClass,
        trustLevel: permInfo.trustLevel,
        source: "external-mcp",
        catalogVersion: this.currentSnapshot.catalogVersion + 1,
        catalogHash: "",
        status: "ACTIVE",
        idempotent: semantics.idempotent,
        sideEffects: semantics.sideEffects,
      };

      validTools.push(dynamicTool);
    }

    // 2. Build new temporary tools map
    const newToolsByProvider = new Map<string, DynamicMcpTool[]>(this.toolsByProvider);
    newToolsByProvider.set(providerId, validTools);

    // 3. Assemble complete tool list across all providers
    const allTools: DynamicMcpTool[] = [];
    const newQualifiedMap = new Map<string, DynamicMcpTool>();
    const providersRepresented = new Set<string>();

    for (const [pId, tools] of newToolsByProvider) {
      if (tools.length > 0) {
        providersRepresented.add(pId);
      }
      for (const t of tools) {
        allTools.push(t);
        newQualifiedMap.set(t.qualifiedName, t);
      }
    }

    // 4. Calculate catalog SHA-256 hash
    const catalogHash = this.calculateHash(allTools);
    const newVersion = this.currentSnapshot.catalogVersion + 1;

    for (const t of allTools) {
      t.catalogVersion = newVersion;
      t.catalogHash = catalogHash;
    }

    // 5. Rebuild alias map with collision detection
    const newAliasMap = new Map<string, string>();
    const seenShortNames = new Map<string, number>();

    for (const t of allTools) {
      const count = seenShortNames.get(t.name) || 0;
      seenShortNames.set(t.name, count + 1);
    }

    for (const t of allTools) {
      if (seenShortNames.get(t.name) === 1) {
        // Unambiguous: allow short name alias
        newAliasMap.set(t.name, t.qualifiedName);
      }
    }

    // 6. ATOMIC SWAP POINTERS
    this.toolsByProvider = newToolsByProvider;
    this.toolsByQualifiedName = newQualifiedMap;
    this.aliasMap = newAliasMap;
    this.currentSnapshot = {
      catalogVersion: newVersion,
      catalogHash,
      discoveredAt: Date.now(),
      tools: allTools,
      toolCount: allTools.length,
      providersRepresented: Array.from(providersRepresented),
    };

    return {
      success: true,
      validCount: validTools.length,
      rejectedCount: rejections.length,
      rejectionReasons: rejections,
      catalogVersion: newVersion,
      catalogHash,
    };
  }

  /**
   * Remove all tools for a disconnected or deleted provider (Atomic Swap)
   */
  public removeProviderTools(providerId: string): {
    catalogVersion: number;
    catalogHash: string;
    removedCount: number;
  } {
    const existing = this.toolsByProvider.get(providerId) || [];
    const removedCount = existing.length;

    const newToolsByProvider = new Map<string, DynamicMcpTool[]>(this.toolsByProvider);
    newToolsByProvider.delete(providerId);

    const allTools: DynamicMcpTool[] = [];
    const newQualifiedMap = new Map<string, DynamicMcpTool>();
    const providersRepresented = new Set<string>();

    for (const [pId, tools] of newToolsByProvider) {
      if (tools.length > 0) providersRepresented.add(pId);
      for (const t of tools) {
        allTools.push(t);
        newQualifiedMap.set(t.qualifiedName, t);
      }
    }

    const catalogHash = this.calculateHash(allTools);
    const newVersion = this.currentSnapshot.catalogVersion + 1;

    for (const t of allTools) {
      t.catalogVersion = newVersion;
      t.catalogHash = catalogHash;
    }

    // Rebuild alias map
    const newAliasMap = new Map<string, string>();
    const seenShortNames = new Map<string, number>();
    for (const t of allTools) {
      seenShortNames.set(t.name, (seenShortNames.get(t.name) || 0) + 1);
    }
    for (const t of allTools) {
      if (seenShortNames.get(t.name) === 1) {
        newAliasMap.set(t.name, t.qualifiedName);
      }
    }

    this.toolsByProvider = newToolsByProvider;
    this.toolsByQualifiedName = newQualifiedMap;
    this.aliasMap = newAliasMap;
    this.currentSnapshot = {
      catalogVersion: newVersion,
      catalogHash,
      discoveredAt: Date.now(),
      tools: allTools,
      toolCount: allTools.length,
      providersRepresented: Array.from(providersRepresented),
    };

    return {
      catalogVersion: newVersion,
      catalogHash,
      removedCount,
    };
  }

  /**
   * Resolve tool by qualifiedName or short alias
   */
  public resolveTool(nameOrQualified: string): DynamicMcpTool | null {
    // 1. Direct qualified match
    if (this.toolsByQualifiedName.has(nameOrQualified)) {
      return this.toolsByQualifiedName.get(nameOrQualified)!;
    }

    // 2. Unambiguous alias match
    if (this.aliasMap.has(nameOrQualified)) {
      const q = this.aliasMap.get(nameOrQualified)!;
      return this.toolsByQualifiedName.get(q) || null;
    }

    return null;
  }

  /**
   * TOCTOU Guard: Validate if catalog reference from AI is fresh
   */
  public validateFreshness(
    toolNameOrQualified: string,
    expectedCatalogVersion?: number,
    expectedInstanceId?: string
  ): { fresh: boolean; error?: string; currentVersion: number; tool: DynamicMcpTool | null } {
    const tool = this.resolveTool(toolNameOrQualified);
    const currentVersion = this.currentSnapshot.catalogVersion;

    if (!tool) {
      return {
        fresh: false,
        error: `Tool '${toolNameOrQualified}' is not found in current catalog (Catalog V${currentVersion}).`,
        currentVersion,
        tool: null,
      };
    }

    if (expectedCatalogVersion !== undefined && expectedCatalogVersion !== currentVersion) {
      return {
        fresh: false,
        error: `CATALOG_CHANGED: Expected Catalog V${expectedCatalogVersion}, but active catalog is V${currentVersion}. Please refresh tool catalog.`,
        currentVersion,
        tool,
      };
    }

    if (expectedInstanceId && expectedInstanceId !== tool.providerInstanceId) {
      return {
        fresh: false,
        error: `CATALOG_CHANGED: Provider instance has restarted (${expectedInstanceId} -> ${tool.providerInstanceId}). Please refresh tool catalog.`,
        currentVersion,
        tool,
      };
    }

    return {
      fresh: true,
      currentVersion,
      tool,
    };
  }

  /**
   * List all dynamic tools formatted for AI MCP Gateway.
   * Returns pristine downstream tool names (e.g. 'gameobject-find'),
   * descriptions, and schemas without injecting internal metadata.
   * Falls back to qualifiedName only if a name collision occurs across providers.
   */
  public listExposedToolsForAi(): any[] {
    return this.currentSnapshot.tools.map((t) => {
      const isUnambiguous = this.aliasMap.has(t.name) && this.aliasMap.get(t.name) === t.qualifiedName;
      const exposedName = isUnambiguous ? t.name : t.qualifiedName;
      return {
        name: exposedName,
        description: t.description || "",
        inputSchema: t.inputSchema || { type: "object", properties: {} },
      };
    });
  }

  /**
   * Get tools by provider
   */
  public getToolsByProvider(providerId: string): DynamicMcpTool[] {
    return this.toolsByProvider.get(providerId) || [];
  }

  /**
   * Get full snapshot
   */
  public getSnapshot(): DynamicCatalogSnapshot {
    return this.currentSnapshot;
  }

  private calculateHash(tools: DynamicMcpTool[]): string {
    const sorted = [...tools].sort((a, b) => a.qualifiedName.localeCompare(b.qualifiedName));
    const normalized = sorted.map((t) => ({
      q: t.qualifiedName,
      p: t.providerId,
      s: JSON.stringify(t.inputSchema),
    }));
    return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
  }
}
