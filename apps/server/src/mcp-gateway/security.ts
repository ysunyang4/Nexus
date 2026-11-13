import fs from "node:fs";
import path from "node:path";
import type { TokenService } from "../db/token-service.js";

export interface TokenValidationResult {
  valid: boolean;
  error?: string;
  statusCode?: number;
  token?: string;
}

export interface PathValidationResult {
  valid: boolean;
  error?: string;
  resolvedPath?: string;
}

/**
 * Validates an incoming Bearer Token for the MCP Gateway.
 * Supports:
 * 1. Dedicated configured Bridge Token (e.g. from env or default)
 * 2. Desktop management token
 * 3. Any active MCP token ('lb_...') stored in Nexus database
 */
function getBridgeTokenFromFile(): string {
  try {
    const tokenPath = process.env.NEXUS_BRIDGE_TOKEN_PATH || (
      process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, "LocalBridge", "data", "bridge-token.key")
        : path.join(process.env.HOME || process.env.USERPROFILE || ".", ".localbridge", "data", "bridge-token.key")
    );
    if (tokenPath && fs.existsSync(tokenPath)) {
      return fs.readFileSync(tokenPath, "utf-8").trim();
    }
  } catch {}
  return "";
}

export function validateBearerToken(
  authHeader: string | undefined,
  tokenService?: TokenService,
  configuredBridgeToken?: string
): TokenValidationResult {
  if (!authHeader) {
    return {
      valid: false,
      statusCode: 401,
      error: "Missing Authorization header. Expected 'Authorization: Bearer <token>'",
    };
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || !parts[0] || !parts[1] || parts[0].toLowerCase() !== "bearer") {
    return {
      valid: false,
      statusCode: 401,
      error: "Invalid Authorization header format. Expected 'Bearer <token>'",
    };
  }

  const token: string = parts[1];
  const activeBridgeToken =
    configuredBridgeToken ||
    process.env.NEXUS_BRIDGE_TOKEN ||
    getBridgeTokenFromFile();

  // Check 1: Dedicated Bridge Token
  if (activeBridgeToken && token === activeBridgeToken) {
    return { valid: true, token };
  }

  // Check 2: Desktop Management Token
  const mgmtToken = process.env.LOCALBRIDGE_MANAGEMENT_TOKEN;
  if (mgmtToken && token === mgmtToken) {
    return { valid: true, token };
  }

  // Check 3: Active database-backed MCP token
  if (tokenService && token.startsWith("lb_")) {
    try {
      const res = tokenService.validateMcpToken(token);
      if (res.valid) {
        return { valid: true, token };
      }
    } catch {
      // Fall through to invalid
    }
  }

  return {
    valid: false,
    statusCode: 401,
    error: "Invalid or unauthorized token. Access denied.",
  };
}

/**
 * Validates that a requested file or directory path stays strictly within the project sandbox.
 * Blocks any directory traversal attempts ('..', root escapes, etc.).
 */
export function validatePathSandbox(
  rootPath: string,
  relativePath: string
): PathValidationResult {
  if (!relativePath || relativePath === "." || relativePath === "./") {
    return { valid: true, resolvedPath: rootPath };
  }

  // Reject paths containing explicit parent directory traversal
  const normalizedInput = relativePath.replace(/\\/g, "/");
  if (
    normalizedInput === ".." ||
    normalizedInput.startsWith("../") ||
    normalizedInput.includes("/../") ||
    normalizedInput.endsWith("/..")
  ) {
    return {
      valid: false,
      error: `Path traversal violation: relative path '${relativePath}' attempts to escape project sandbox.`,
    };
  }

  // Resolve absolute path and ensure it is contained in rootPath
  const resolved = path.resolve(rootPath, relativePath);
  const normalizedRoot = path.resolve(rootPath).toLowerCase();
  const normalizedTarget = resolved.toLowerCase();

  if (
    !normalizedTarget.startsWith(normalizedRoot) ||
    (normalizedTarget.length > normalizedRoot.length &&
      normalizedTarget[normalizedRoot.length] !== path.sep &&
      normalizedTarget[normalizedRoot.length] !== "/")
  ) {
    return {
      valid: false,
      error: `Access denied: target path '${relativePath}' resolves outside authorized project root.`,
    };
  }

  return { valid: true, resolvedPath: resolved };
}

/**
 * Redacts secrets from logging strings.
 */
export function redactToken(token: string | undefined): string {
  if (!token) return "[EMPTY]";
  if (token.length <= 8) return "***";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}
