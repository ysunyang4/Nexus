/**
 * Nexus Generic External MCP Runtime — Type Definitions & Contracts
 * 
 * Defines unified types for:
 * - Provider lifecycle state machine
 * - Transport & Protocol negotiation
 * - Dynamic Tool Catalog & Schemas
 * - Security, SSRF & Permission Gateway (L1-L5)
 * - Verification-First Engine & Monotonic Ledger
 */

export type ProviderStatus =
  | "DISCOVERING"
  | "CONNECTING"
  | "NEGOTIATING"
  | "READY"
  | "DISCONNECTED"
  | "ERROR"
  | "RECONNECTING";

export type McpTransportType = "streamableHttp" | "sse" | "stdio";

export type McpProtocolVersion =
  | "2024-11-05"
  | "2025-03-26"
  | "2025-11-25"
  | "2026-07-28"
  | string;

export type ToolPermissionClass = "L1" | "L2" | "L3" | "L4" | "L5";
export type ToolTrustLevel = "trusted" | "untrusted";
export type ToolSource = "builtin-canonical" | "builtin-project" | "external-mcp";

export interface McpServerInfo {
  name: string;
  version: string;
}

export interface McpCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { listChanged?: boolean; subscribe?: boolean };
  prompts?: { listChanged?: boolean };
  logging?: Record<string, any>;
  [key: string]: any;
}

export interface DynamicMcpTool {
  toolId: string; // Globally unique: "${providerId}::${name}"
  qualifiedName: string; // "${providerId}::${name}"
  providerId: string;
  providerInstanceId: string;
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  outputSchema?: Record<string, any>;
  annotations?: {
    audience?: string[];
    priority?: number;
    destructive?: boolean;
    idempotent?: boolean;
    sideEffects?: boolean;
    [key: string]: any;
  };
  permissionClass: ToolPermissionClass;
  trustLevel: ToolTrustLevel;
  source: ToolSource;
  catalogVersion: number;
  catalogHash: string;
  status: "ACTIVE" | "DEPRECATED" | "DISABLED";
  idempotent: boolean;
  sideEffects: boolean;
}

export interface DynamicCatalogSnapshot {
  catalogVersion: number;
  catalogHash: string; // SHA-256 of normalized tool definitions
  discoveredAt: number;
  expiresAt?: number;
  tools: DynamicMcpTool[];
  toolCount: number;
  providersRepresented: string[];
}

export interface ProviderAuthConfig {
  type: "none" | "bearer" | "header" | "oauth2";
  token?: string;
  headerName?: string;
  headerValue?: string;
}

export interface ProviderConfig {
  providerId: string;
  instanceId?: string;
  displayName: string;
  endpoint: string;
  transport: McpTransportType;
  authentication: ProviderAuthConfig;
  policy?: {
    defaultPermission?: ToolPermissionClass;
    maxConsecutiveFailures?: number;
    timeoutMs?: number;
    allowLocalLoopback?: boolean;
  };
  enabled: boolean;
}

export interface ProviderInfo {
  providerId: string;
  instanceId: string;
  displayName: string;
  endpoint: string;
  transport: McpTransportType;
  status: ProviderStatus;
  protocolVersion: McpProtocolVersion | null;
  serverInfo: McpServerInfo | null;
  capabilities: McpCapabilities | null;
  toolCount: number;
  catalogVersion: number;
  catalogHash: string;
  discoveredAt: string;
  lastSeenAt: string;
  lastError?: string;
  consecutiveFailures: number;
  metrics?: MCPPerformanceMetrics;
  sessionId?: string;
}

export interface ActionLedgerEntry {
  actionId: string;
  evidenceId: string;
  providerId: string;
  providerInstanceId: string;
  toolId: string;
  catalogVersion: number;
  downstreamRequestId?: string | number;
  permissionDecision: {
    granted: boolean;
    level: ToolPermissionClass;
    required: ToolPermissionClass;
    reason?: string;
  };
  stage: "PREPARED" | "STARTED" | "EXECUTED" | "VERIFIED" | "COMMITTED" | "REJECTED" | "FAILED" | "UNKNOWN" | "RETRY_UNSAFE";
  status: "PENDING" | "SUCCESS" | "FAILED" | "REJECTED";
  timestamp: number;
  durationMs?: number;
  argumentsHash: string;
  resultHash?: string;
  verificationState?: "UNVERIFIED" | "VERIFIED" | "FAILED" | "NOT_REQUIRED";
  summary: string;
  error?: string;
}

export interface EvidenceRecord {
  evidenceId: string;
  actionId: string;
  toolId: string;
  providerId: string;
  timestamp: number;
  status: "COMMITTED" | "REJECTED" | "FAILED";
  verificationPassed: boolean;
  preStateHash?: string;
  postStateHash?: string;
  arguments?: any;
  result?: any;
  verificationDetails?: any;
  auditReason?: string;
  signature?: string;
}

export type MCPSessionState =
  | "DISCONNECTED"
  | "CONNECTING"
  | "INITIALIZING"
  | "READY"
  | "RECONNECTING"
  | "FAILED"
  | "CLOSED";

export interface MCPSession {
  sessionId: string;
  providerId: string;
  state: MCPSessionState;
  createdAt: number;
  lastActiveAt: number;
  endpoint: string;
  protocolVersion: McpProtocolVersion;
  serverInfo?: McpServerInfo | null;
  capabilities?: McpCapabilities | null;
  headers: Record<string, string>;
  stats: {
    totalCalls: number;
    failedCalls: number;
    totalDurationMs: number;
  };
}

export interface MCPLatencyTrace {
  totalLatencyMs: number;
  transportLatencyMs: number;
  dispatchLatencyMs: number;
  downstreamLatencyMs: number;
  parseLatencyMs: number;
  timestamp: number;
  method?: string;
  toolName?: string;
}

export type MCPStructuredErrorCode =
  | "transport_error"
  | "session_error"
  | "protocol_error"
  | "tool_error"
  | "timeout"
  | "connection_lost"
  | "server_restart"
  | "invalid_arguments";

export interface MCPStructuredError {
  code: MCPStructuredErrorCode;
  message: string;
  details?: any;
  retryable: boolean;
}

export interface MCPBatchOperation {
  id: string;
  toolName: string;
  arguments: Record<string, any>;
  dependsOn?: string[];
  timeoutMs?: number;
}

export interface MCPBatchExecutionResult {
  batchId: string;
  mode: "sequential" | "parallel" | "dependency";
  totalOperations: number;
  completedCount: number;
  failedCount: number;
  totalLatencyMs: number;
  results: Record<
    string,
    {
      success: boolean;
      content?: any[];
      structuredContent?: any;
      error?: MCPStructuredError;
      latencyMs: number;
    }
  >;
  isError: boolean;
}

export interface MCPPerformanceMetrics {
  initLatencyMs: number;
  listToolsLatencyMs: number;
  lastCallLatencyMs: number;
  avgCallLatencyMs: number;
  totalCalls: number;
  recentTraces: MCPLatencyTrace[];
  cachedToolCount: number;
  sessionState: MCPSessionState;
  sessionId?: string | null;
}
