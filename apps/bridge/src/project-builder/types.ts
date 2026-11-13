/**
 * Nexus Universal Project Builder — Core Types & Contracts
 * 
 * Defines the standard Project Blueprint schema, execution state machine,
 * capability definitions, stage DAG, evidence tree, and delivery contracts.
 * 
 * Strictly Provider-Agnostic:
 * Decouples high-level AI Goals and Capabilities from low-level MCP Tools.
 */

export type ProjectStatus =
  | "PREPARED"
  | "RUNNING"
  | "PAUSED"
  | "VERIFYING"
  | "COMMITTED"
  | "NEEDS_REPLAN"
  | "FAILED"
  | "DELIVERED";

export type StageStatus =
  | "PREPARED"
  | "STARTED"
  | "EXECUTING"
  | "VERIFYING"
  | "COMMITTED"
  | "NEEDS_REPLAN"
  | "FAILED"
  | "BLOCKED"
  | "SKIPPED";

export type ActionStatus =
  | "PENDING"
  | "EXECUTING"
  | "VERIFYING"
  | "SUCCESS"
  | "FAILED"
  | "SKIPPED";

export type ProjectExecutionMode = "FAST" | "DEEP";

/**
 * Standard Action Verification Specification
 */
export interface ActionVerificationSpec {
  type:
    | "object_exists"
    | "exists"
    | "object_not_exists"
    | "not_exists"
    | "property_equals"
    | "state_match"
    | "file_exists"
    | "console_clean"
    | "custom";
  target?: string;
  expectedCondition?: string;
  queryParams?: Record<string, any>;
  rules?: Record<string, any>;
  fallback?: string;
}

/**
 * Single Action inside a Stage
 */
export interface StageAction {
  id: string;
  name: string;
  capability: string;
  provider?: string;
  tool?: string; // Optional direct MCP tool override
  parameters: Record<string, any>;
  verification?: ActionVerificationSpec;
}

/**
 * Stage within a Project Blueprint
 */
export interface BlueprintStage {
  id: string;
  name: string;
  goal: string;
  provider: string; // e.g. "unity-gamedev", "localbridge-core", "blender-mcp", "browser-mcp"
  dependsOn: string[]; // IDs of predecessor stages
  actions: StageAction[];
}

/**
 * Project Verification Policy
 */
export interface ProjectVerificationPolicy {
  strategy: ProjectExecutionMode;
  requiredChecks: string[];
  stopOnFailure?: boolean;
}

/**
 * Delivery Specification
 */
export interface ProjectDeliverySpec {
  type: "unity_build" | "unity_scene_commit" | "artifact_file" | "git_commit" | "composite";
  targetPath?: string;
  artifacts?: string[];
  summary?: string;
}

/**
 * Project Blueprint Definition (Provider-Agnostic)
 */
export interface ProjectBlueprint {
  projectId: string;
  name: string;
  description?: string;
  goal: string;
  requirements?: string[];
  constraints?: string[];
  providers: string[];
  capabilities: string[];
  stages: BlueprintStage[];
  dependencies?: Record<string, string[]>;
  verification?: ProjectVerificationPolicy;
  delivery?: ProjectDeliverySpec;
  metadata?: {
    author?: string;
    createdAt?: string;
    executionMode?: ProjectExecutionMode;
    tags?: string[];
    [key: string]: any;
  };
}

/**
 * Action Execution Result
 */
export interface ActionResult {
  actionId: string;
  actionName: string;
  capability: string;
  resolvedTool: string;
  provider: string;
  status: ActionStatus;
  preState?: any;
  postState?: any;
  toolResult?: any;
  verificationPassed: boolean;
  verificationDetails?: string;
  evidenceId: string;
  durationMs: number;
  error?: string;
}

/**
 * Stage Execution State
 */
export interface StageState {
  stageId: string;
  name: string;
  provider: string;
  status: StageStatus;
  dependsOn: string[];
  actions: StageAction[];
  actionResults: ActionResult[];
  verificationVerdict: "UNVERIFIED" | "VERIFIED" | "FAILED";
  evidenceId?: string;
  error?: string;
  startTime?: number;
  endTime?: number;
}

/**
 * Project-Level Ledger Entry
 */
export interface ProjectLedgerEntry {
  sequenceId: number;
  seq?: number;
  timestamp: string;
  stageId?: string;
  actionId?: string;
  evidenceId?: string;
  evidenceHash?: string;
  operationId: string;
  status: "STARTED" | "PROGRESS" | "COMMITTED" | "REJECTED" | "FAILED";
  summary: string;
  details?: any;
}

/**
 * Project-Level Evidence Tree Node
 */
export interface ProjectEvidenceNode {
  evidenceId: string;
  projectId: string;
  timestamp: string;
  rootEvidenceHash: string;
  stages: Array<{
    stageId: string;
    evidenceId: string;
    stageHash: string;
    actions: Array<{
      actionId: string;
      evidenceId: string;
      tool: string;
      preStateHash: string;
      postStateHash: string;
      verdict: "VERIFIED" | "FAILED";
    }>;
  }>;
  deliveryEvidence?: {
    evidenceId: string;
    artifactHash: string;
    summary: string;
  };
}

/**
 * Replan Request Payload (Returned to AI when complex recovery is needed)
 */
export interface ReplanPayload {
  status: "NEEDS_REPLAN";
  projectId: string;
  failedStageId: string;
  failedActionId?: string;
  error: string;
  preState?: any;
  postState?: any;
  evidenceId: string;
  committedStages: string[];
  projectContext: {
    goal: string;
    requirements?: string[];
    completedStagesCount: number;
    totalStagesCount: number;
  };
  suggestedContext: string;
}

/**
 * Delivery Artifact
 */
export interface ProjectArtifact {
  id: string;
  name: string;
  type: string;
  path?: string;
  sizeBytes?: number;
  sha256?: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

/**
 * Final Delivery Report
 */
export interface DeliveryReport {
  projectId: string;
  name: string;
  goal: string;
  status: "DELIVERED" | "FAILED";
  executionMode: ProjectExecutionMode;
  stagesCompleted: number;
  totalStages: number;
  artifacts: ProjectArtifact[];
  evidenceId: string;
  rootEvidenceHash: string;
  startedAt: string;
  completedAt: string;
  totalDurationMs: number;
  summary: string;
}

/**
 * Complete Project Runtime Instance State
 */
export interface ProjectInstance {
  projectId: string;
  name: string;
  blueprint: ProjectBlueprint;
  status: ProjectStatus;
  executionMode: ProjectExecutionMode;
  currentStageId: string | null;
  stageStates: Map<string, StageState>;
  ledger: ProjectLedgerEntry[];
  evidenceTree: ProjectEvidenceNode;
  artifacts: ProjectArtifact[];
  deliveryReport: DeliveryReport | null;
  replanContext: ReplanPayload | null;
  createdAt: string;
  updatedAt: string;
}
