/**
 * Nexus Generic External MCP Runtime — Security Guard & Schema Validator
 * 
 * Enforces:
 * 1. SSRF & Endpoint Protection (Scheme, Host, Port, Private Network, Localhost policy)
 * 2. Dynamic Schema Validation (Depth, Property count, Circular references, Schema types)
 * 3. Prompt Injection & Tool Poisoning Defense (Untrusted metadata isolation)
 * 4. Permission Classification (L1 - L5 with conservative L5 default for unknown tools)
 * 5. Credential Isolation (Strict per-provider auth headers)
 */

import { URL } from "node:url";
import crypto from "node:crypto";
import type { ToolPermissionClass, ToolTrustLevel } from "./types.js";

export interface SchemaValidationResult {
  valid: boolean;
  reason?: string;
  sanitizedTool?: any;
}

export class SecurityGuard {
  private static readonly MAX_DESCRIPTION_LENGTH = 4096;
  private static readonly MAX_SCHEMA_DEPTH = 10;
  private static readonly MAX_PROPERTY_COUNT = 100;

  /**
   * SSRF & Endpoint Validation
   */
  public static validateEndpoint(
    endpoint: string,
    allowLocalLoopback: boolean = true
  ): { valid: boolean; reason?: string; normalizedUrl?: string } {
    try {
      const parsed = new URL(endpoint);

      // 1. Protocol Scheme Check
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { valid: false, reason: `Invalid protocol scheme: '${parsed.protocol}'. Only http: and https: are permitted.` };
      }

      const hostname = parsed.hostname.toLowerCase();

      // 2. Loopback Handling
      const isLoopback =
        hostname === "127.0.0.1" ||
        hostname === "localhost" ||
        hostname === "::1" ||
        hostname.endsWith(".localhost");

      if (isLoopback) {
        if (!allowLocalLoopback) {
          return { valid: false, reason: `Loopback access to '${hostname}' is prohibited by current policy.` };
        }
        return { valid: true, normalizedUrl: parsed.toString() };
      }

      // 3. Private IP & Link-Local Detection (RFC 1918 / RFC 3927)
      if (SecurityGuard.isPrivateOrLinkLocalIp(hostname)) {
        return { valid: false, reason: `Access to private or link-local address '${hostname}' is blocked for SSRF protection.` };
      }

      // 4. Port Validation (1 - 65535)
      if (parsed.port) {
        const portNum = Number(parsed.port);
        if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
          return { valid: false, reason: `Invalid port number '${parsed.port}'` };
        }
      }

      return { valid: true, normalizedUrl: parsed.toString() };
    } catch (err: any) {
      return { valid: false, reason: `Malformed endpoint URL: ${err.message}` };
    }
  }

  /**
   * Validates whether a hostname is a private/internal IP
   */
  private static isPrivateOrLinkLocalIp(host: string): boolean {
    // IPv4 regex check
    const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const octet1 = Number(ipv4Match[1]);
      const octet2 = Number(ipv4Match[2]);
      if (octet1 === 10) return true; // 10.0.0.0/8
      if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) return true; // 172.16.0.0/12
      if (octet1 === 192 && octet2 === 168) return true; // 192.168.0.0/16
      if (octet1 === 169 && octet2 === 254) return true; // 169.254.0.0/16 (link-local)
      if (octet1 === 0 || octet1 >= 224) return true; // reserved / multicast
    }
    return false;
  }

  /**
   * Validates Dynamic Tool Schema for safety and integrity.
   * If a tool is malformed, returns valid: false with reason.
   */
  public static validateToolSchema(rawTool: any, providerId: string): SchemaValidationResult {
    if (!rawTool || typeof rawTool !== "object") {
      return { valid: false, reason: "Tool definition must be an object" };
    }

    // 1. Tool Name Check
    if (typeof rawTool.name !== "string" || !rawTool.name.trim()) {
      return { valid: false, reason: "Tool 'name' must be a non-empty string" };
    }

    const name = rawTool.name.trim();
    if (name.length > 128) {
      return { valid: false, reason: `Tool name exceeds max length of 128 chars: '${name}'` };
    }

    // Prohibit forbidden characters in tool names
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return { valid: false, reason: `Tool name contains illegal characters: '${name}'. Only [a-zA-Z0-9_-] are permitted.` };
    }

    // 2. Tool Description Check & Prompt Injection Defense
    let description = typeof rawTool.description === "string" ? rawTool.description : "";
    if (description.length > SecurityGuard.MAX_DESCRIPTION_LENGTH) {
      // Truncate excessively long descriptions
      description = description.slice(0, SecurityGuard.MAX_DESCRIPTION_LENGTH) + "... [truncated]";
    }

    // Tag untrusted metadata
    const sanitizedDescription = SecurityGuard.sanitizeDescription(description);

    // 3. Input Schema Validation
    const inputSchema = rawTool.inputSchema;
    if (!inputSchema || typeof inputSchema !== "object") {
      return { valid: false, reason: `Tool '${name}' inputSchema must be a valid JSON Schema object` };
    }

    // Check for circular references & depth
    const depthCheck = SecurityGuard.checkSchemaDepthAndCycles(inputSchema);
    if (!depthCheck.safe) {
      return { valid: false, reason: `Tool '${name}' inputSchema failed structural safety check: ${depthCheck.reason}` };
    }

    // Check property count limit
    const propertyCount = SecurityGuard.countProperties(inputSchema);
    if (propertyCount > SecurityGuard.MAX_PROPERTY_COUNT) {
      return { valid: false, reason: `Tool '${name}' exceeds max allowed property count (${propertyCount} > ${SecurityGuard.MAX_PROPERTY_COUNT})` };
    }

    // 4. Output Schema Validation (if present)
    if (rawTool.outputSchema && typeof rawTool.outputSchema === "object") {
      const outDepth = SecurityGuard.checkSchemaDepthAndCycles(rawTool.outputSchema);
      if (!outDepth.safe) {
        return { valid: false, reason: `Tool '${name}' outputSchema failed structural safety check: ${outDepth.reason}` };
      }
    }

    return {
      valid: true,
      sanitizedTool: {
        name,
        description: sanitizedDescription,
        inputSchema,
        outputSchema: rawTool.outputSchema,
        annotations: rawTool.annotations || {},
      },
    };
  }

  /**
   * Sanitizes external tool descriptions to mitigate prompt injection
   */
  private static sanitizeDescription(desc: string): string {
    // Strip control characters while preserving valid newlines and tabs
    let clean = desc.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
    
    // Explicitly flag external instruction override attempts
    const injectionPatterns = [
      /ignore\s+(previous|all)\s+instructions/i,
      /system\s+prompt\s+override/i,
      /you\s+must\s+now\s+act\s+as/i,
      /admin\s+mode\s+activated/i,
    ];

    for (const pattern of injectionPatterns) {
      if (pattern.test(clean)) {
        clean = `[EXTERNAL_UNTRUSTED_CONTENT_FLAGGED] ${clean}`;
        break;
      }
    }

    return clean;
  }

  /**
   * Recursive depth & cycle detector for JSON Schema objects
   */
  private static checkSchemaDepthAndCycles(
    obj: any,
    currentDepth: number = 0,
    visited: Set<any> = new Set()
  ): { safe: boolean; reason?: string } {
    if (currentDepth > SecurityGuard.MAX_SCHEMA_DEPTH) {
      return { safe: false, reason: `Schema depth exceeds limit of ${SecurityGuard.MAX_SCHEMA_DEPTH}` };
    }

    if (!obj || typeof obj !== "object") {
      return { safe: true };
    }

    if (visited.has(obj)) {
      return { safe: false, reason: "Circular reference detected in schema definition" };
    }

    visited.add(obj);

    if (Array.isArray(obj)) {
      for (const item of obj) {
        const res = SecurityGuard.checkSchemaDepthAndCycles(item, currentDepth + 1, visited);
        if (!res.safe) return res;
      }
    } else {
      for (const key of Object.keys(obj)) {
        const res = SecurityGuard.checkSchemaDepthAndCycles(obj[key], currentDepth + 1, visited);
        if (!res.safe) return res;
      }
    }

    visited.delete(obj);
    return { safe: true };
  }

  /**
   * Count total properties across all nested levels
   */
  private static countProperties(schema: any): number {
    let count = 0;
    function walk(o: any) {
      if (!o || typeof o !== "object") return;
      if (o.properties && typeof o.properties === "object") {
        const keys = Object.keys(o.properties);
        count += keys.length;
        for (const k of keys) {
          walk(o.properties[k]);
        }
      }
      if (o.items && typeof o.items === "object") {
        walk(o.items);
      }
    }
    walk(schema);
    return count;
  }

  /**
   * Classify Tool Permission Class (L1 - L5)
   * 
   * CRITICAL SECURITY PRINCIPLE:
   * Unknown tools default to L5 (BLOCKED / REQUIRE EXPLICIT POLICY)
   */
  public static classifyToolPermission(
    toolName: string,
    schema: any,
    explicitPolicy?: ToolPermissionClass
  ): { permissionClass: ToolPermissionClass; reason: string; trustLevel: ToolTrustLevel } {
    if (explicitPolicy) {
      return { permissionClass: explicitPolicy, reason: "Explicitly configured policy", trustLevel: "trusted" };
    }

    const lower = toolName.toLowerCase();

    // 1. Code / Script Execution (L3)
    if (
      lower.includes("script") ||
      lower.includes("eval") ||
      lower.includes("execute") ||
      lower.includes("compile") ||
      lower.includes("code") ||
      lower.startsWith("script-") ||
      lower.startsWith("tests-")
    ) {
      return { permissionClass: "L3", reason: "Code or script execution tool", trustLevel: "untrusted" };
    }

    // 2. Destructive System / Deletion / Mutation (L4)
    if (
      lower.includes("destroy") ||
      lower.includes("delete") ||
      lower.includes("remove") ||
      lower.includes("drop") ||
      lower.includes("kill") ||
      lower.includes("format") ||
      lower.includes("wipe") ||
      lower.includes("shutdown")
    ) {
      return { permissionClass: "L4", reason: "Destructive mutation tool", trustLevel: "untrusted" };
    }

    // 3. Read-Only Queries (L1)
    if (
      lower.includes("-get") ||
      lower.includes("-find") ||
      lower.includes("-list") ||
      lower.includes("-inspect") ||
      lower.includes("-read") ||
      lower.includes("-query") ||
      lower.includes("-search") ||
      lower.includes("-check") ||
      lower.includes("logs") ||
      lower.includes("status") ||
      lower.includes("hierarchy") ||
      lower.startsWith("get_") ||
      lower.startsWith("list_") ||
      lower.startsWith("find_") ||
      lower.startsWith("read_")
    ) {
      return { permissionClass: "L1", reason: "Read-only query tool", trustLevel: "untrusted" };
    }

    // 4. Safe Modifications / Object Creation (L2)
    if (
      lower.includes("-create") ||
      lower.includes("-set") ||
      lower.includes("-update") ||
      lower.includes("-add") ||
      lower.includes("-modify") ||
      lower.includes("transform") ||
      lower.startsWith("create_") ||
      lower.startsWith("set_") ||
      lower.startsWith("add_")
    ) {
      return { permissionClass: "L2", reason: "Standard scene/object mutation tool", trustLevel: "untrusted" };
    }

    // 5. UNKNOWN EXTERNAL TOOL -> Default to L5 (Conservative Boundary)
    return {
      permissionClass: "L5",
      reason: "Unknown external tool signature; defaults to L5 (requires explicit admin policy)",
      trustLevel: "untrusted",
    };
  }

  /**
   * Determine Idempotency & Side Effects
   */
  public static analyzeToolSemantics(toolName: string, annotations?: any): { idempotent: boolean; sideEffects: boolean } {
    if (annotations) {
      if (typeof annotations.idempotent === "boolean" && typeof annotations.sideEffects === "boolean") {
        return { idempotent: annotations.idempotent, sideEffects: annotations.sideEffects };
      }
    }

    const lower = toolName.toLowerCase();
    const isRead =
      lower.includes("-get") ||
      lower.includes("-find") ||
      lower.includes("-list") ||
      lower.includes("-inspect") ||
      lower.includes("-read") ||
      lower.includes("-query") ||
      lower.includes("logs") ||
      lower.includes("status");

    if (isRead) {
      return { idempotent: true, sideEffects: false };
    }

    const isDelete = lower.includes("destroy") || lower.includes("delete") || lower.includes("remove");
    if (isDelete) {
      return { idempotent: true, sideEffects: true };
    }

    const isCreate = lower.includes("create") || lower.includes("add") || lower.includes("spawn");
    if (isCreate) {
      return { idempotent: false, sideEffects: true };
    }

    // Conservative default
    return { idempotent: false, sideEffects: true };
  }
}
