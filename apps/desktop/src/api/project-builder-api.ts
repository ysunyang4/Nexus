/**
 * Nexus UI 2.0 — Project Builder API Client
 * 
 * Interacts with Project Builder Engine and Generic Provider Registry on Nexus Bridge (:8787).
 * Zero Mock Principle: returns genuine states from the execution runtime.
 */

import { bridge } from "./bridge.js";

const BRIDGE_URL = "http://127.0.0.1:8787";

async function queryEndpoint<T>(endpoint: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await (bridge as any).fetchJson(endpoint, options);
    if (res !== null && res !== undefined) return res as T;
  } catch {}

  try {
    const res = await fetch(`${BRIDGE_URL}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(options?.headers || {}),
      },
    });
    if (res.ok) {
      return (await res.json()) as T;
    }
  } catch {}

  return null;
}

export interface ProjectSummary {
  projectId: string;
  name: string;
  status: string;
  executionMode: string;
  currentStageId: string | null;
  stagesCount: number;
  committedStagesCount: number;
  goal: string;
  providers: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDetail {
  projectId: string;
  name: string;
  status: string;
  executionMode: string;
  currentStageId: string | null;
  blueprint: any;
  stageStates: Array<{
    stageId: string;
    name: string;
    provider: string;
    status: string;
    dependsOn: string[];
    actions: any[];
    actionResults: any[];
    verificationVerdict: string;
    evidenceId?: string;
    error?: string;
    startTime?: number;
    endTime?: number;
  }>;
  ledger: Array<{
    sequenceId: number;
    timestamp: string;
    stageId?: string;
    actionId?: string;
    evidenceId?: string;
    operationId: string;
    status: string;
    summary: string;
    details?: any;
  }>;
  evidenceTree: any;
  artifacts: any[];
  deliveryReport: any;
  replanContext: any;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderItem {
  id: string;
  name: string;
  type: string;
  endpoint: string;
  connected: boolean;
  toolCount: number;
  capabilities: string[];
  lastPing?: string;
  metrics?: {
    initLatencyMs: number;
    listToolsLatencyMs: number;
    lastCallLatencyMs: number;
    avgCallLatencyMs: number;
    totalCalls: number;
    cachedToolCount: number;
    sessionState: string;
    sessionId?: string | null;
  };
  sessionId?: string;
}

export const projectBuilderApi = {
  async listProjects(): Promise<ProjectSummary[]> {
    const res = await queryEndpoint<{ success: boolean; projects: ProjectSummary[] }>("/api/project-builder/projects");
    return res?.projects || [];
  },

  async getProject(projectId: string): Promise<ProjectDetail | null> {
    const res = await queryEndpoint<{ success: boolean; project: ProjectDetail }>(`/api/project-builder/projects/${encodeURIComponent(projectId)}`);
    return res?.project || null;
  },

  async createProject(blueprint: any): Promise<{ success: boolean; project?: any; error?: string }> {
    const res = await queryEndpoint<any>("/api/project-builder/projects", {
      method: "POST",
      body: JSON.stringify(blueprint),
    });
    return res || { success: false, error: "Failed to create project" };
  },

  async startProject(projectId: string): Promise<boolean> {
    const res = await queryEndpoint<{ success: boolean }>(`/api/project-builder/projects/${encodeURIComponent(projectId)}/start`, {
      method: "POST",
    });
    return Boolean(res?.success);
  },

  async pauseProject(projectId: string): Promise<boolean> {
    const res = await queryEndpoint<{ success: boolean }>(`/api/project-builder/projects/${encodeURIComponent(projectId)}/pause`, {
      method: "POST",
    });
    return Boolean(res?.success);
  },

  async submitReplan(projectId: string, replannedStages: any[]): Promise<{ success: boolean; project?: any; error?: string }> {
    const res = await queryEndpoint<any>(`/api/project-builder/projects/${encodeURIComponent(projectId)}/replan`, {
      method: "POST",
      body: JSON.stringify({ replannedStages }),
    });
    return res || { success: false, error: "Replan submission failed" };
  },

  async getCapabilities(provider?: string): Promise<any[]> {
    const endpoint = provider
      ? `/api/project-builder/capabilities?provider=${encodeURIComponent(provider)}`
      : "/api/project-builder/capabilities";
    const res = await queryEndpoint<{ success: boolean; capabilities: any[] }>(endpoint);
    return res?.capabilities || [];
  },

  async listProviders(): Promise<ProviderItem[]> {
    const res = await queryEndpoint<{ success: boolean; providers: ProviderItem[] }>("/api/project-builder/providers");
    return res?.providers || [];
  },

  async registerProvider(config: {
    id: string;
    name: string;
    endpoint: string;
    transport?: string;
    token?: string;
    description?: string;
  }): Promise<{ success: boolean; toolCount?: number; error?: string }> {
    const res = await queryEndpoint<any>("/api/project-builder/providers", {
      method: "POST",
      body: JSON.stringify(config),
    });
    return res || { success: false, error: "Failed to register provider" };
  },
};

export interface McpSecurityPolicyDto {
  unrestricted_execution_mode: boolean;
  trusted_external_mcp: Record<string, boolean>;
}

export const mcpSecurityApi = {
  async getPolicy(): Promise<McpSecurityPolicyDto> {
    const res = await queryEndpoint<{ success: boolean; policy: McpSecurityPolicyDto }>("/api/mcp/security-policy");
    return res?.policy || { unrestricted_execution_mode: false, trusted_external_mcp: {} };
  },

  async setUnrestrictedMode(enabled: boolean): Promise<McpSecurityPolicyDto> {
    const res = await queryEndpoint<{ success: boolean; policy: McpSecurityPolicyDto }>("/api/mcp/security-policy/unrestricted", {
      method: "POST",
      body: JSON.stringify({ enabled }),
    });
    return res?.policy || { unrestricted_execution_mode: enabled, trusted_external_mcp: {} };
  },

  async setServerTrusted(endpointOrId: string, trusted: boolean): Promise<McpSecurityPolicyDto> {
    const res = await queryEndpoint<{ success: boolean; policy: McpSecurityPolicyDto }>("/api/mcp/security-policy/trust", {
      method: "POST",
      body: JSON.stringify({ endpointOrId, trusted }),
    });
    return res?.policy || { unrestricted_execution_mode: false, trusted_external_mcp: { [endpointOrId]: trusted } };
  },
};
