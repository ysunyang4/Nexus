/**
 * Nexus Generic MCP — Remote & Cloud MCP Service Manager
 * 
 * Manages remote MCP endpoints (e.g. MCP.so cloud tools like HTML/CSS to Image),
 * supports multi-account profiles with token rotation for free tier quotas,
 * and handles dynamic connect/disconnect into DynamicCatalog.
 */

import fs from "node:fs";
import path from "node:path";
import { ProviderRuntime } from "./provider-runtime.js";
import type { ProviderConfig, ProviderAuthConfig } from "./types.js";

function getDefaultDataDir(): string {
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA || process.env.APPDATA || "C:\\ProgramData", "LocalBridge");
  }
  return path.join(process.env.HOME || ".", ".localbridge");
}

export interface RemoteMcpAccountProfile {
  id: string;
  accountLabel: string; // e.g. "email1@example.com" or "账号 A"
  token: string; // API Key or Bearer Token
  quotaNote?: string; // e.g. "注册赠送 $5" or "剩余 100 次"
  isActive: boolean;
  createdAt: number;
}

export interface RemoteMcpConfig {
  id: string;
  name: string;
  description?: string;
  websiteUrl?: string; // Provider website for signup/login
  endpoint: string; // Remote Streamable HTTP or SSE URL
  transport: "streamableHttp" | "sse";
  enabled: boolean;
  accounts: RemoteMcpAccountProfile[];
  createdAt: number;
}

export interface RemoteMcpState {
  config: RemoteMcpConfig;
  status: "CONNECTED" | "CONNECTING" | "DISCONNECTED" | "ERROR";
  lastError?: string;
  toolCount: number;
  lastProbeTime?: number;
}

export class RemoteMcpManager {
  private static instance: RemoteMcpManager | null = null;
  private services: Map<string, RemoteMcpState> = new Map();
  private storageFilePath: string;

  private constructor() {
    this.storageFilePath = path.join(getDefaultDataDir(), "data", "remote-mcp-services.json");
    this.initDefaultPresets();
    this.loadPersistedConfigs();
  }

  public static getInstance(): RemoteMcpManager {
    if (!RemoteMcpManager.instance) {
      RemoteMcpManager.instance = new RemoteMcpManager();
    }
    return RemoteMcpManager.instance;
  }

  private initDefaultPresets(): void {
    // Preset: HTML/CSS to Image from MCP.so
    const hctiPreset: RemoteMcpConfig = {
      id: "hcti-image",
      name: "HTML/CSS to Image",
      description: "基于 HTML、CSS 或网页 URL 生成高质量高清图片、网页截图与 PDF（来自 MCP.so 云端服务）",
      websiteUrl: "https://htmlcsstoimage.com",
      endpoint: "https://mcp.hcti.io",
      transport: "streamableHttp",
      enabled: false,
      accounts: [
        {
          id: "acc_demo_1",
          accountLabel: "体验账号 (Demo Account)",
          token: "",
          quotaNote: "注册赠送体验额度",
          isActive: true,
          createdAt: Date.now(),
        },
      ],
      createdAt: Date.now(),
    };

    this.services.set("hcti-image", {
      config: hctiPreset,
      status: "DISCONNECTED",
      toolCount: 0,
    });
  }

  private loadPersistedConfigs(): void {
    try {
      if (fs.existsSync(this.storageFilePath)) {
        const raw = fs.readFileSync(this.storageFilePath, "utf8");
        const list: RemoteMcpConfig[] = JSON.parse(raw);
        for (const item of list) {
          const existing = this.services.get(item.id);
          this.services.set(item.id, {
            config: {
              ...item,
              accounts: Array.isArray(item.accounts) ? item.accounts : [],
            },
            status: "DISCONNECTED",
            toolCount: existing?.toolCount || 0,
          });
        }
      }
    } catch (err: any) {
      console.warn("[RemoteMcpManager] Failed to load persisted configs:", err.message);
    }
  }

  private persistConfigs(): void {
    try {
      const dir = path.dirname(this.storageFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const list = Array.from(this.services.values()).map((s) => s.config);
      fs.writeFileSync(this.storageFilePath, JSON.stringify(list, null, 2), "utf8");
    } catch (err: any) {
      console.error("[RemoteMcpManager] Failed to persist configs:", err);
    }
  }

  public listServices(): RemoteMcpState[] {
    return Array.from(this.services.values()).map((s) => ({
      ...s,
      config: {
        ...s.config,
        // Mask tokens in accounts for UI security
        accounts: s.config.accounts.map((a) => ({
          ...a,
          token: a.token ? (a.token.length > 8 ? `${a.token.slice(0, 4)}...${a.token.slice(-4)}` : "******") : "",
        })),
      },
    }));
  }

  public getRawService(id: string): RemoteMcpState | undefined {
    return this.services.get(id);
  }

  public async connectService(id: string): Promise<{ success: boolean; toolCount?: number; error?: string }> {
    const s = this.services.get(id);
    if (!s) return { success: false, error: `Service '${id}' not found` };

    s.status = "CONNECTING";
    s.lastError = undefined;

    const activeAccount = s.config.accounts.find((a) => a.isActive);
    const token = (activeAccount?.token || "").trim();

    if (!token) {
      s.status = "ERROR";
      s.lastError = "未配置 API Key / Token。该云端服务需要登录凭证，请点击上方【官网注册登录】获取体验金密钥，并在下方账号配置中填入。";
      return { success: false, error: s.lastError };
    }

    let authConfig: ProviderAuthConfig = { type: "none" };
    if (token.includes(":") && !token.startsWith("Bearer ") && !token.startsWith("http")) {
      authConfig = {
        type: "header",
        headerName: "Authorization",
        headerValue: `Basic ${Buffer.from(token).toString("base64")}`,
      };
    } else {
      authConfig = {
        type: "bearer",
        token: token.replace(/^Bearer\s+/i, ""),
      };
    }

    const providerConfig: ProviderConfig = {
      providerId: `remote-${s.config.id}`,
      displayName: s.config.name,
      endpoint: s.config.endpoint,
      transport: s.config.transport || "streamableHttp",
      authentication: authConfig,
      policy: {
        defaultPermission: "L2",
        maxConsecutiveFailures: 3,
        timeoutMs: 15000,
        allowLocalLoopback: false,
      },
      enabled: true,
    };

    try {
      const runtime = ProviderRuntime.getInstance();
      const res = await runtime.registerProvider(providerConfig);
      if (res.success && res.toolCount > 0) {
        s.status = "CONNECTED";
        s.toolCount = res.toolCount;
        s.config.enabled = true;
        s.lastProbeTime = Date.now();
        this.persistConfigs();
        return { success: true, toolCount: res.toolCount };
      } else {
        s.status = "ERROR";
        let errMsg = res.error || "Failed to discover remote tools from endpoint";
        if (errMsg.includes("401") || errMsg.toLowerCase().includes("unauthorized")) {
          errMsg = "HTTP 401 未授权：API Key 无效或未生效。请检查填写的密钥是否正确，或点击【官网注册登录】重新获取。";
        }
        s.lastError = errMsg;
        s.config.enabled = false;
        return { success: false, error: s.lastError };
      }
    } catch (err: any) {
      s.status = "ERROR";
      let errMsg = err.message || String(err);
      if (errMsg.includes("401") || errMsg.toLowerCase().includes("unauthorized")) {
        errMsg = "HTTP 401 未授权：API Key 无效或未生效。请检查填写的密钥是否正确，或点击【官网注册登录】重新获取。";
      }
      s.lastError = errMsg;
      s.config.enabled = false;
      return { success: false, error: s.lastError };
    }
  }

  public disconnectService(id: string): { success: boolean } {
    const s = this.services.get(id);
    if (s) {
      s.status = "DISCONNECTED";
      s.config.enabled = false;
      s.toolCount = 0;
      this.persistConfigs();

      try {
        const runtime = ProviderRuntime.getInstance();
        runtime.removeProvider(`remote-${s.config.id}`);
      } catch {}
    }
    return { success: true };
  }

  public createCustomService(input: Partial<RemoteMcpConfig>): { success: boolean; error?: string; service?: RemoteMcpConfig } {
    if (!input.id || !input.endpoint) {
      return { success: false, error: "Missing id or endpoint" };
    }
    const cleanId = input.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    if (this.services.has(cleanId)) {
      return { success: false, error: `Service ID '${cleanId}' already exists` };
    }

    const newConfig: RemoteMcpConfig = {
      id: cleanId,
      name: input.name?.trim() || cleanId,
      description: input.description?.trim() || "",
      websiteUrl: input.websiteUrl?.trim() || "",
      endpoint: input.endpoint.trim(),
      transport: input.transport || "streamableHttp",
      enabled: false,
      accounts: Array.isArray(input.accounts) && input.accounts.length > 0 ? input.accounts : [
        {
          id: `acc_${Date.now()}`,
          accountLabel: "默认账号",
          token: "",
          quotaNote: "",
          isActive: true,
          createdAt: Date.now(),
        },
      ],
      createdAt: Date.now(),
    };

    this.services.set(cleanId, {
      config: newConfig,
      status: "DISCONNECTED",
      toolCount: 0,
    });

    this.persistConfigs();
    return { success: true, service: newConfig };
  }

  public deleteService(id: string): { success: boolean; error?: string } {
    this.disconnectService(id);
    this.services.delete(id);
    this.persistConfigs();
    return { success: true };
  }

  public addAccount(serviceId: string, account: { accountLabel: string; token: string; quotaNote?: string }): { success: boolean; error?: string } {
    const s = this.services.get(serviceId);
    if (!s) return { success: false, error: `Service '${serviceId}' not found` };

    const newAcc: RemoteMcpAccountProfile = {
      id: `acc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      accountLabel: account.accountLabel.trim() || `账号 ${s.config.accounts.length + 1}`,
      token: account.token.trim(),
      quotaNote: account.quotaNote?.trim() || "",
      isActive: s.config.accounts.length === 0, // active if first account
      createdAt: Date.now(),
    };

    s.config.accounts.push(newAcc);
    this.persistConfigs();

    // If active and connected, hot-reload token
    if (newAcc.isActive && s.status === "CONNECTED") {
      this.connectService(serviceId).catch(() => {});
    }

    return { success: true };
  }

  public deleteAccount(serviceId: string, accountId: string): { success: boolean; error?: string } {
    const s = this.services.get(serviceId);
    if (!s) return { success: false, error: `Service '${serviceId}' not found` };

    const idx = s.config.accounts.findIndex((a) => a.id === accountId);
    if (idx === -1) return { success: false, error: "Account not found" };

    const wasActive = s.config.accounts[idx].isActive;
    s.config.accounts.splice(idx, 1);

    // If deleted account was active, activate the first remaining account if any
    if (wasActive && s.config.accounts.length > 0) {
      s.config.accounts[0].isActive = true;
    }

    this.persistConfigs();

    if (s.status === "CONNECTED") {
      this.connectService(serviceId).catch(() => {});
    }

    return { success: true };
  }

  public activateAccount(serviceId: string, accountId: string): { success: boolean; error?: string } {
    const s = this.services.get(serviceId);
    if (!s) return { success: false, error: `Service '${serviceId}' not found` };

    for (const a of s.config.accounts) {
      a.isActive = (a.id === accountId);
    }

    this.persistConfigs();

    if (s.status === "CONNECTED") {
      this.connectService(serviceId).catch(() => {});
    }

    return { success: true };
  }
}
