import path from "node:path";

export interface SecurityConfig {
  bridgeToken: string;
}


/**
 * Validates the Authorization Bearer token.
 * Returns true if valid, false if invalid or missing.
 */
export function validateBearerToken(
  authHeader: string | undefined,
  expectedToken: string
): { valid: boolean; error?: string } {
  if (!authHeader) {
    return { valid: false, error: "Missing Authorization header" };
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return { valid: false, error: "Invalid Authorization format. Expected 'Bearer <TOKEN>'" };
  }

  const providedToken = parts[1];
  if (providedToken !== expectedToken) {
    return { valid: false, error: "Invalid or unauthorized token" };
  }

  return { valid: true };
}

/**
 * Validates an incoming Authorization header against the Bridge static Bearer token (NEXUS_BRIDGE_TOKEN).
 */
export function validateRequestAuth(
  authHeader: string | undefined,
  staticToken: string
): { valid: boolean; authType?: "bearer"; error?: string } {
  if (!authHeader) {
    return { valid: false, error: "Missing Authorization header" };
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return { valid: false, error: "Invalid Authorization format. Expected 'Bearer <TOKEN>'" };
  }

  const token = parts[1];

  if (staticToken && token === staticToken) {
    return { valid: true, authType: "bearer" };
  }

  return { valid: false, error: "Invalid or unauthorized token" };
}

export function validatePathSandbox(
  projectRoot: string,
  relativePath: string
): { valid: boolean; resolvedPath?: string; error?: string } {
  if (!relativePath || typeof relativePath !== "string") {
    return { valid: false, error: "Path must be a non-empty string" };
  }

  // Normalize slashes
  const normalized = relativePath.replace(/\\/g, "/");

  // Explicit check for dangerous patterns
  if (
    normalized.includes("../") ||
    normalized.startsWith("../") ||
    normalized === ".." ||
    normalized.includes("/..")
  ) {
    return {
      valid: false,
      error: "Path traversal forbidden: '..' is not allowed in path",
    };
  }

  // Resolve absolute path and verify boundary
  const resolved = path.resolve(projectRoot, relativePath);
  const normalizedRoot = path.resolve(projectRoot);

  const relativeToRoot = path.relative(normalizedRoot, resolved);
  if (relativeToRoot === ".." || relativeToRoot.startsWith(".." + path.sep) || path.isAbsolute(relativeToRoot)) {
    return {
      valid: false,
      error: "Access denied: Path resolves outside the project root directory",
    };
  }

  return { valid: true, resolvedPath: resolved };
}

/**
 * Redacts sensitive credentials and tokens from logs.
 */
export function sanitizeLog(text: string): string {
  if (!text) return "";
  return text
    .replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, "Bearer [REDACTED]")
    .replace(/lb_[a-f0-9]{32,}/gi, "lb_[REDACTED]")
    .replace(/lm_[a-f0-9]{32,}/gi, "lm_[REDACTED]")
    .replace(/"token":\s*"[^"]+"/gi, '"token":"[REDACTED]"');
}

/**
 * Structured request logger for MCP invocations.
 */
export function logMcpRequest(info: {
  method?: string;
  tool?: string;
  ip?: string;
  durationMs?: number;
  success: boolean;
  error?: string;
}) {
  const timestamp = new Date().toISOString();
  const status = info.success ? "SUCCESS" : "FAILED";
  const toolName = info.tool ? ` tool=${info.tool}` : "";
  const duration = info.durationMs !== undefined ? ` ${info.durationMs}ms` : "";
  const err = info.error ? ` error="${info.error}"` : "";

  console.log(
    `[${timestamp}] [MCP] ${info.ip || "127.0.0.1"} ${info.method || "POST"} ${status}${toolName}${duration}${err}`
  );
}
