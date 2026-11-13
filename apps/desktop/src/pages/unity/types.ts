/**
 * Nexus UI 2.0 — Unity Workspace UI Contracts
 */

export type UnityTabId = "scene" | "runtime" | "console" | "build" | "execution" | "tools";

export type UnityPermissionLevel = "L1" | "L2" | "L3" | "L4" | "L5";
export type UnityExecutionMode = "FAST" | "DEEP";
export type UnityServiceState = "STOPPED" | "STARTING" | "RUNNING" | "STOPPING" | "FAILED";
export type UnityConnectionStatus = "CONNECTED" | "DISCONNECTED" | "UNKNOWN" | "FAILED";

export interface UnityRuntimeStatusBarData {
  permission: UnityPermissionLevel;
  executionMode: UnityExecutionMode;
  serviceState: UnityServiceState;
  port: number;
  portListening: boolean;
  unity: UnityConnectionStatus;
  project: string | null;
  plugin: UnityConnectionStatus;
  ipc: UnityConnectionStatus;
  runtime: "STOPPED" | "PLAYING" | "PAUSED";
  build: "IDLE" | "BUILDING" | "SUCCESS" | "FAILED";
  error?: string | null;
}

export interface UnityHierarchyNode {
  id: string;
  name: string;
  path: string;
  active: boolean;
  tag?: string;
  layer?: number;
  hasMissingScript?: boolean;
  children?: UnityHierarchyNode[];
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface UnityTransform {
  position: Vector3;
  rotation: Vector3;
  scale: Vector3;
}

export interface UnityComponentProperty {
  key: string;
  label: string;
  value: any;
  type: "string" | "number" | "boolean" | "color" | "reference";
}

export interface UnityComponent {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  isMissingScript?: boolean;
  properties?: UnityComponentProperty[];
}

export interface UnityReference {
  fieldName: string;
  targetName: string;
  targetType: string;
  isMissing: boolean;
  isNull: boolean;
}

export interface UnityEventItem {
  eventName: string;
  listenerCount: number;
  targetMethods: string[];
}

export interface UnityInspectorData {
  objectId: string;
  objectName: string;
  active: boolean;
  tag: string;
  layer: string;
  isStatic: boolean;
  transform: UnityTransform;
  components: UnityComponent[];
  references: UnityReference[];
  events: UnityEventItem[];
}

export type UnityLogLevel = "LOG" | "WARNING" | "ERROR" | "EXCEPTION";

export interface UnityConsoleLog {
  id: string;
  timestamp: string;
  level: UnityLogLevel;
  message: string;
  stackTrace?: string;
  evidenceId?: string;
  objectPath?: string;
}

export interface UnityRuntimeStateData {
  lifecycleState: "STOPPED" | "PLAYING" | "PAUSED";
  fps: number | null;
  objectsCount: number | null;
  timeScale: number;
  memoryMB: number | null;
  activeScene: string | null;
  screenshotUrl?: string;
  runtimeObjects?: Array<{ name: string; type: string; active: boolean }>;
}

export type BuildTimelineStepId =
  | "build"
  | "artifact"
  | "release"
  | "deployment"
  | "monitoring"
  | "rollback";

export interface BuildTimelineNode {
  id: BuildTimelineStepId;
  label: string;
  status: "SUCCESS" | "VERIFIED" | "RELEASED" | "HEALTHY" | "AVAILABLE" | "IDLE" | "BUILDING" | "FAILED";
  summary: string;
  details: Record<string, any>;
}

export type LedgerActionStatus =
  | "PREPARED"
  | "STARTED"
  | "EXECUTED"
  | "VERIFIED"
  | "COMMITTED"
  | "FAILED"
  | "UNKNOWN";

export interface UnityLedgerActionItem {
  actionId: string;
  idempotencyKey: string;
  capability: string;
  operationId: string;
  status: LedgerActionStatus;
  projectId: string;
  preStateHash: string;
  postStateHash: string;
  evidenceHash: string;
  checkpointId?: string;
  timestamp: number;
  durationMs?: number;
  blueprintStage?: string;
  reconciliation?: {
    currentState: string;
    preState: string;
    postState: string;
    result: "RESOLVED_COMMITTED" | "UNRESOLVED_DRIFT";
    details?: string;
  };
}

export interface UnityEvidenceDrawerData {
  evidenceId: string;
  actionId?: string;
  operationId: string;
  capability: string;
  timestamp: string;
  preStateHash: string;
  postStateHash: string;
  evidenceHash: string;
  verificationVerdict: "VERIFIED" | "FAILED" | "UNVERIFIED";
  verificationSource: string;
  screenshotUrl?: string;
  stackTrace?: string;
  logsSnapshot?: string[];
  objectStateSnapshot?: Record<string, any>;
}

export interface DynamicToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
    [key: string]: any;
  };
  outputSchema?: any;
  category: "READ_ONLY" | "SCENE_MUTATION" | "CODE_EXECUTION" | "UNKNOWN" | string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  requiredPermission: UnityPermissionLevel;
  strategy: UnityExecutionMode;
  provider: string;
  source: string;
  version?: string;
  annotations?: Record<string, any>;
}

export interface DynamicToolListResponse {
  success: boolean;
  tools: DynamicToolDefinition[];
  count: number;
  error?: string;
}

export interface DynamicToolExecutionResult {
  content?: Array<{ type: string; text?: string; [key: string]: any }>;
  structuredContent?: any;
  isError?: boolean;
  permission?: any;
  evidenceId?: string;
  actionId?: string;
  durationMs?: number;
}
