/**
 * Nexus UI 2.0 — Remote & Cloud MCP API Client
 * Interacts with Nexus Bridge (:8787) /api/mcp/remote
 */

import { bridge } from "./bridge.js";

const BRIDGE_URL = "http://127.0.0.1:8787";

export interface RemoteMcpAccountProfileDto {
  id: string;
  accountLabel: string;
  token: string;
  quotaNote?: string;
  isActive: boolean;
  createdAt: number;
}

export interface RemoteMcpConfigDto {
  id: string;
  name: string;
  description?: string;
  websiteUrl?: string;
  endpoint: string;
  transport: "streamableHttp" | "sse";
  enabled: boolean;
  accounts: RemoteMcpAccountProfileDto[];
  createdAt: number;
}

export interface RemoteMcpStateDto {
  config: RemoteMcpConfigDto;
  status: "CONNECTED" | "CONNECTING" | "DISCONNECTED" | "ERROR";
  lastError?: string;
  toolCount: number;
  lastProbeTime?: number;
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
    if (res.ok) {
      return (await res.json()) as T;
    }
  } catch {}

  return null;
}

export const remoteMcpApi = {
  async listServices(): Promise<RemoteMcpStateDto[]> {
    const res = await queryEndpoint<{ success: boolean; services: RemoteMcpStateDto[] }>("/api/mcp/remote");
    return res?.services || [];
  },

  async createService(config: Partial<RemoteMcpConfigDto>): Promise<{ success: boolean; error?: string }> {
    const res = await queryEndpoint<any>("/api/mcp/remote", {
      method: "POST",
      body: JSON.stringify(config),
    });
    return res || { success: false, error: "Failed to create remote service" };
  },

  async connectService(id: string): Promise<{ success: boolean; toolCount?: number; error?: string }> {
    const res = await queryEndpoint<any>(`/api/mcp/remote/connect/${encodeURIComponent(id)}`, {
      method: "POST",
    });
    return res || { success: false, error: "Failed to connect to remote service" };
  },

  async disconnectService(id: string): Promise<{ success: boolean; error?: string }> {
    const res = await queryEndpoint<any>(`/api/mcp/remote/disconnect/${encodeURIComponent(id)}`, {
      method: "POST",
    });
    return res || { success: false, error: "Failed to disconnect remote service" };
  },

  async deleteService(id: string): Promise<{ success: boolean; error?: string }> {
    const res = await queryEndpoint<any>(`/api/mcp/remote/delete/${encodeURIComponent(id)}`, {
      method: "POST",
    });
    return res || { success: false, error: "Failed to delete remote service" };
  },

  async addAccount(serviceId: string, account: { accountLabel: string; token: string; quotaNote?: string }): Promise<{ success: boolean; error?: string }> {
    const res = await queryEndpoint<any>("/api/mcp/remote/account/add", {
      method: "POST",
      body: JSON.stringify({ serviceId, ...account }),
    });
    return res || { success: false, error: "Failed to add account profile" };
  },

  async deleteAccount(serviceId: string, accountId: string): Promise<{ success: boolean; error?: string }> {
    const res = await queryEndpoint<any>("/api/mcp/remote/account/delete", {
      method: "POST",
      body: JSON.stringify({ serviceId, accountId }),
    });
    return res || { success: false, error: "Failed to delete account profile" };
  },

  async activateAccount(serviceId: string, accountId: string): Promise<{ success: boolean; error?: string }> {
    const res = await queryEndpoint<any>("/api/mcp/remote/account/activate", {
      method: "POST",
      body: JSON.stringify({ serviceId, accountId }),
    });
    return res || { success: false, error: "Failed to activate account" };
  },
};
