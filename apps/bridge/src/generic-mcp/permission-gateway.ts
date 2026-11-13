/**
 * Nexus Generic External MCP — Permission Gateway
 * 
 * Enforces:
 * 1. Multi-level Authorization Hierarchy: L1 <= L2 <= L3 <= L4 <= L5
 * 2. Conservative Security Boundary:
 *    - Auto-Discovery does NOT grant auto-authorization.
 *    - Unknown external tools require L5 / EXPLICIT ADMIN POLICY.
 * 3. Backend Enforcement: Check is executed before transport dispatch.
 * 4. Auditing: Every authorization evaluation produces a traceable decision.
 */

import type { ToolPermissionClass } from "./types.js";

export interface PermissionEvaluationResult {
  granted: boolean;
  activeLevel: ToolPermissionClass;
  requiredLevel: ToolPermissionClass;
  reason?: string;
  auditCode: "GRANTED" | "BLOCKED_INSUFFICIENT_LEVEL" | "BLOCKED_EXPLICIT_POLICY" | "BLOCKED_UNKNOWN_TOOL";
}

const PERMISSION_WEIGHTS: Record<ToolPermissionClass, number> = {
  L1: 1, // Read-Only
  L2: 2, // Safe Scene/State Mutation
  L3: 3, // Code / Script Execution
  L4: 4, // Destructive System Mutation
  L5: 5, // Full Control / Administrative
};

export class PermissionGateway {
  private static instance: PermissionGateway | null = null;
  private currentSystemLevel: ToolPermissionClass = "L2"; // Default safe working mode
  private blockedTools: Set<string> = new Set();
  private explicitOverrides: Map<string, ToolPermissionClass> = new Map();

  private constructor() {}

  public static getInstance(): PermissionGateway {
    if (!PermissionGateway.instance) {
      PermissionGateway.instance = new PermissionGateway();
    }
    return PermissionGateway.instance;
  }

  public getSystemLevel(): ToolPermissionClass {
    return this.currentSystemLevel;
  }

  public setSystemLevel(level: ToolPermissionClass): void {
    this.currentSystemLevel = level;
  }

  public setToolOverride(qualifiedName: string, level: ToolPermissionClass): void {
    this.explicitOverrides.set(qualifiedName, level);
  }

  public blockTool(qualifiedName: string): void {
    this.blockedTools.add(qualifiedName);
  }

  public unblockTool(qualifiedName: string): void {
    this.blockedTools.delete(qualifiedName);
  }

  /**
   * Evaluate whether a tool execution is permitted
   */
  public evaluate(
    qualifiedName: string,
    toolRequiredLevel: ToolPermissionClass,
    callerLevel?: ToolPermissionClass
  ): PermissionEvaluationResult {
    // 1. Explicit tool block list
    if (this.blockedTools.has(qualifiedName)) {
      return {
        granted: false,
        activeLevel: callerLevel || this.currentSystemLevel,
        requiredLevel: toolRequiredLevel,
        reason: `Tool '${qualifiedName}' is explicitly blocked by administrative policy.`,
        auditCode: "BLOCKED_EXPLICIT_POLICY",
      };
    }

    // 2. Check override level if configured
    const effectiveRequired = this.explicitOverrides.get(qualifiedName) || toolRequiredLevel;
    const activeLevel = callerLevel || this.currentSystemLevel;

    const activeWeight = PERMISSION_WEIGHTS[activeLevel] || 1;
    const requiredWeight = PERMISSION_WEIGHTS[effectiveRequired] || 5;

    // 3. Hierarchy check
    if (activeWeight >= requiredWeight) {
      return {
        granted: true,
        activeLevel,
        requiredLevel: effectiveRequired,
        auditCode: "GRANTED",
      };
    }

    // 4. Inadequate permission level
    return {
      granted: false,
      activeLevel,
      requiredLevel: effectiveRequired,
      reason: `Permission denied: Tool requires ${effectiveRequired}, but active system level is ${activeLevel}. Elevation required.`,
      auditCode: "BLOCKED_INSUFFICIENT_LEVEL",
    };
  }
}
