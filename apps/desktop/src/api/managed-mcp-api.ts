/**
 * Nexus UI 2.0 — Managed MCP Process & API Configuration Client
 * Interacts with Nexus Bridge (:8787) /api/mcp/managed
 */

import { bridge } from "./bridge.js";

const BRIDGE_URL = "http://127.0.0.1:8787";

export interface ManagedMcpConfigDto {
  id: string;
  name: string;
  command: string;
  args: string[];
  rawCommand?: string;
  port: number;
  endpoint: string;
  autoStart?: boolean;
  env?: Record<string, string>;
  apiKeys?: {
    hunyuanSecretId?: string;
    hunyuanSecretKey?: string;
    hunyuanApiUrl?: string;
    hyper3dApiKey?: string;
    sketchfabApiKey?: string;
    polyPizzaApiKey?: string;
    blenderPort?: number;
  };
}

export interface ManagedMcpStateDto {
  config: ManagedMcpConfigDto;
  status: "STOPPED" | "STARTING" | "RUNNING" | "ERROR";
  pid?: number;
  startedAt?: number;
  lastError?: string;
  logs: string[];
  toolCount: number;
}

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
    const data = await res.json().catch(() => null);
    if (data !== null && data !== undefined) {
      return data as T;
    }
  } catch {}

  return null;
}

export const managedMcpApi = {
  async listServices(): Promise<ManagedMcpStateDto[]> {
    const res = await queryEndpoint<{ success: boolean; services: ManagedMcpStateDto[] }>("/api/mcp/managed");
    return res?.services || [];
  },

  async startService(id: string): Promise<{ success: boolean; error?: string }> {
    const res = await queryEndpoint<any>(`/api/mcp/managed/start/${encodeURIComponent(id)}`, {
      method: "POST",
    });
    return res || { success: false, error: "Failed to start service" };
  },

  async stopService(id: string): Promise<{ success: boolean; error?: string }> {
    const res = await queryEndpoint<any>(`/api/mcp/managed/stop/${encodeURIComponent(id)}`, {
      method: "POST",
    });
    return res || { success: false, error: "Failed to stop service" };
  },

  async restartService(id: string): Promise<{ success: boolean; error?: string }> {
    const res = await queryEndpoint<any>(`/api/mcp/managed/restart/${encodeURIComponent(id)}`, {
      method: "POST",
    });
    return res || { success: false, error: "Failed to restart service" };
  },

  async getLogs(id: string): Promise<string[]> {
    const res = await queryEndpoint<{ success: boolean; logs: string[] }>(`/api/mcp/managed/logs/${encodeURIComponent(id)}`);
    return res?.logs || [];
  },

  async updateConfig(id: string, updates: Partial<ManagedMcpConfigDto>): Promise<{ success: boolean; error?: string }> {
    const res = await queryEndpoint<any>(`/api/mcp/managed/config/${encodeURIComponent(id)}`, {
      method: "POST",
      body: JSON.stringify(updates),
    });
    return res || { success: false, error: "Failed to update configuration" };
  },

  async createCustomService(config: Partial<ManagedMcpConfigDto>): Promise<{ success: boolean; error?: string }> {
    const res = await queryEndpoint<any>("/api/mcp/managed", {
      method: "POST",
      body: JSON.stringify(config),
    });
    return res || { success: false, error: "Failed to create custom service" };
  },

  async deleteCustomService(id: string): Promise<{ success: boolean; error?: string }> {
    const res = await queryEndpoint<any>(`/api/mcp/managed/delete/${encodeURIComponent(id)}`, {
      method: "POST",
    });
    return res || { success: false, error: "Failed to delete custom service" };
  },

  async getTokenMode(): Promise<{ success: boolean; master: boolean; providers: Record<string, boolean> }> {
    const res = await queryEndpoint<any>("/api/mcp/token-mode");
    return res || { success: true, master: true, providers: {} };
  },

  async setTokenMode(params: { master?: boolean; providerId?: string; enabled?: boolean }): Promise<{ success: boolean; master: boolean; providers: Record<string, boolean> }> {
    const res = await queryEndpoint<any>("/api/mcp/token-mode", {
      method: "POST",
      body: JSON.stringify(params),
    });
    return res || { success: true, master: true, providers: {} };
  },

  async executeScript(params: { runtime?: "python" | "node"; script: string; timeoutMs?: number }): Promise<{ success: boolean; stdout: string; stderr: string; result?: any; error?: string; elapsedMs: number }> {
    const res = await queryEndpoint<any>("/api/mcp/execute-script", {
      method: "POST",
      body: JSON.stringify(params),
    });
    return res || { success: false, stdout: "", stderr: "Connection failed", error: "Connection to bridge failed", elapsedMs: 0 };
  },

  async autoInstall(params: {
    source: string;
    name?: string;
    port?: number;
  }): Promise<{
    success: boolean;
    serviceId?: string;
    name?: string;
    port?: number;
    toolCount?: number;
    endpoint?: string;
    error?: string;
  }> {
    const res = await queryEndpoint<any>("/api/mcp/auto-install", {
      method: "POST",
      body: JSON.stringify(params),
    });
    return res || { success: false, error: "Bridge 接口无响应或网络连接失败" };
  },
};


