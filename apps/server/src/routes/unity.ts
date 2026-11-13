import type { FastifyPluginAsync } from "fastify";
import { UnityBuilderServiceManager } from "./unity-service-manager.js";
import type { UnityPermissionLevel, UnityExecutionMode } from "./unity-permission-gate.js";
import { UnityGameDevMcpProvider } from "../adapters/unity-gamedev-provider.js";

const BRIDGE_URL = "http://127.0.0.1:8787";

async function proxyToBridge<T = any>(endpoint: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${BRIDGE_URL}${endpoint}`, {
      ...options,
      signal: AbortSignal.timeout(6000),
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
    });
    if (res.ok) {
      return (await res.json()) as T;
    }
  } catch {}
  return null;
}

export const unityRoutes: FastifyPluginAsync = async (fastify) => {
  const manager = UnityBuilderServiceManager.getInstance();

  // 1. Service & Connection Status (prioritize live Bridge Gateway :8787)
  fastify.get("/unity/service/status", async (_request, reply) => {
    const bridgeStatus = await proxyToBridge("/api/unity/service/status");
    if (bridgeStatus) {
      return reply.status(200).send(bridgeStatus);
    }
    return reply.status(200).send(manager.getStatus());
  });

  fastify.get("/unity/status", async (_request, reply) => {
    const bridgeStatus = await proxyToBridge("/api/unity/service/status");
    if (bridgeStatus) {
      return reply.status(200).send(bridgeStatus);
    }
    return reply.status(200).send(manager.getStatus());
  });

  // 2. Service Lifecycle (Start / Stop)
  fastify.post<{ Body: { port?: number } }>("/unity/service/start", async (request, reply) => {
    const bridgeRes = await proxyToBridge("/api/unity/gamedev-mcp/initialize", { method: "POST" });
    if (bridgeRes) {
      return reply.status(200).send(bridgeRes);
    }
    const port = request.body?.port || 20705;
    const result = await manager.startService(port);
    if (!result.success) {
      return reply.status(409).send(result);
    }
    return reply.status(200).send(result);
  });

  fastify.post("/unity/service/stop", async (_request, reply) => {
    const result = await manager.stopService();
    return reply.status(200).send(result);
  });

  // 3. Permission Level Control (L1 - L5)
  fastify.post<{ Body: { permission: UnityPermissionLevel } }>("/unity/service/permission", async (request, reply) => {
    const perm = request.body?.permission;
    try {
      await proxyToBridge("/api/unity/service/permission", {
        method: "POST",
        body: JSON.stringify({ permission: perm }),
      });
      const res = manager.setPermission(perm);
      return reply.status(200).send(res);
    } catch (err: any) {
      return reply.status(400).send({ error: "INVALID_PERMISSION", message: err.message });
    }
  });

  // 4. Execution Mode Control (FAST / DEEP)
  fastify.post<{ Body: { executionMode: UnityExecutionMode } }>("/unity/service/mode", async (request, reply) => {
    const mode = request.body?.executionMode;
    try {
      await proxyToBridge("/api/unity/service/mode", {
        method: "POST",
        body: JSON.stringify({ executionMode: mode }),
      });
      const res = manager.setExecutionMode(mode);
      return reply.status(200).send(res);
    } catch (err: any) {
      return reply.status(400).send({ error: "INVALID_EXECUTION_MODE", message: err.message });
    }
  });

  // 5. Hard Permission Guard on Action Execution
  fastify.post<{
    Body: {
      operationId: string;
      parameters?: any;
      capabilityId?: string;
    };
  }>("/unity/action/execute", async (request, reply) => {
    const { operationId, parameters = {}, capabilityId = "unity.action" } = request.body || {};
    if (!operationId) {
      return reply.status(400).send({ error: "MISSING_OPERATION_ID" });
    }

    const bridgeRes = await proxyToBridge("/api/unity/action/execute", {
      method: "POST",
      body: JSON.stringify({ operationId, parameters, capabilityId }),
    });
    if (bridgeRes) {
      return reply.status(200).send(bridgeRes);
    }

    const result = await manager.executeAction(operationId, parameters, capabilityId);
    return reply.status(result.status).send(result);
  });

  // 6. Runtime Mutate (play / pause / stop)
  fastify.post<{ Body: { action: "play" | "pause" | "stop" } }>("/unity/runtime/mutate", async (request, reply) => {
    const action = request.body?.action || "play";
    const bridgeRes = await proxyToBridge("/api/unity/runtime/mutate", {
      method: "POST",
      body: JSON.stringify({ action }),
    });
    if (bridgeRes) {
      return reply.status(200).send(bridgeRes);
    }
    const res = await manager.executeAction(`runtime.${action}`, { action }, "unity.runtime");
    if (!res.allowed) {
      return reply.status(403).send(res);
    }
    return reply.status(res.status).send({ success: res.status === 200, state: res.result?.state || "STOPPED", ...res });
  });

  // 7. Build Execution
  fastify.post("/unity/build/execute", async (request, reply) => {
    const res = await manager.executeAction("build.execute", request.body || {}, "unity.build");
    if (!res.allowed) {
      return reply.status(403).send(res);
    }
    return reply.status(res.status).send(res);
  });

  // 8. Release Creation
  fastify.post("/unity/release/create", async (request, reply) => {
    const res = await manager.executeAction("release.create", request.body || {}, "unity.release");
    if (!res.allowed) {
      return reply.status(403).send(res);
    }
    return reply.status(res.status).send(res);
  });

  // 9. Rollback Execution
  fastify.post("/unity/rollback/execute", async (request, reply) => {
    const res = await manager.executeAction("version.rollback", request.body || {}, "unity.version");
    if (!res.allowed) {
      return reply.status(403).send(res);
    }
    return reply.status(res.status).send(res);
  });

  // 10. Read-only Data Queries (Hierarchy, Inspector, Console, Ledger, Evidence, Timeline)
  fastify.get("/unity/hierarchy", async (_request, reply) => {
    const bridgeHier = await proxyToBridge("/api/unity/hierarchy");
    if (bridgeHier) {
      return reply.status(200).send(bridgeHier);
    }
    if (!manager.isConnected()) {
      return reply.status(200).send({ nodes: [] });
    }
    const res = await manager.executeAction("hierarchy.query", {}, "unity.hierarchy");
    return reply.status(200).send({ nodes: res.result?.nodes || [] });
  });

  fastify.get<{ Querystring: { objectId?: string } }>("/unity/inspector", async (request, reply) => {
    const objectId = request.query?.objectId;
    if (objectId) {
      const bridgeInsp = await proxyToBridge(`/api/unity/inspector?objectId=${encodeURIComponent(objectId)}`);
      if (bridgeInsp) {
        return reply.status(200).send(bridgeInsp);
      }
    }
    if (!manager.isConnected() || !objectId) {
      return reply.status(200).send({ inspector: null });
    }
    const res = await manager.executeAction("gameobject.query", { objectId }, "unity.inspector");
    return reply.status(200).send({ inspector: res.result?.inspector || null });
  });

  fastify.get("/unity/console", async (_request, reply) => {
    const bridgeConsole = await proxyToBridge("/api/unity/console");
    if (bridgeConsole) {
      return reply.status(200).send(bridgeConsole);
    }
    return reply.status(200).send({ logs: [] });
  });

  fastify.get("/unity/ledger", async (_request, reply) => {
    const bridgeLedger = await proxyToBridge("/api/unity/ledger");
    if (bridgeLedger) {
      return reply.status(200).send(bridgeLedger);
    }
    return reply.status(200).send({ actions: manager.getLedger() });
  });

  fastify.get<{ Params: { evidenceId: string } }>("/unity/evidence/:evidenceId", async (request, reply) => {
    const bridgeEvidence = await proxyToBridge(`/api/unity/evidence/${request.params.evidenceId}`);
    if (bridgeEvidence) {
      return reply.status(200).send(bridgeEvidence);
    }
    const evidence = manager.getEvidence(request.params.evidenceId);
    return reply.status(200).send({ evidence });
  });

  fastify.get("/unity/build/timeline", async (_request, reply) => {
    return reply.status(200).send({ nodes: manager.getTimeline() });
  });

  // =========================================================================
  // GameDev MCP External Provider / Proxy (Downstream Unity-MCP Server)
  // =========================================================================
  const gamedevProvider = UnityGameDevMcpProvider.getInstance();

  fastify.get("/unity/gamedev-mcp/status", async (_request, reply) => {
    const bridgeRes = await proxyToBridge("/api/unity/gamedev-mcp/status");
    if (bridgeRes) return reply.status(200).send(bridgeRes);
    return reply.status(200).send(gamedevProvider.getStatus());
  });

  fastify.post("/unity/gamedev-mcp/initialize", async (_request, reply) => {
    const bridgeRes = await proxyToBridge("/api/unity/gamedev-mcp/initialize", { method: "POST" });
    if (bridgeRes) {
      return reply.status(bridgeRes.success ? 200 : 502).send(bridgeRes);
    }
    const res = await gamedevProvider.initialize();
    return reply.status(res.success ? 200 : 502).send(res);
  });

  fastify.get("/unity/gamedev-mcp/tools", async (_request, reply) => {
    const bridgeRes = await proxyToBridge("/api/unity/gamedev-mcp/tools");
    if (bridgeRes) return reply.status(bridgeRes.success ? 200 : 502).send(bridgeRes);
    const res = await gamedevProvider.listTools();
    return reply.status(res.success ? 200 : 502).send(res);
  });

  fastify.post<{ Body: { name: string; arguments?: Record<string, any> } }>(
    "/unity/gamedev-mcp/call",
    async (request, reply) => {
      const { name, arguments: args = {} } = request.body || {};
      if (!name) {
        return reply.status(400).send({ error: "MISSING_TOOL_NAME" });
      }
      const bridgeRes = await proxyToBridge("/api/unity/gamedev-mcp/call", {
        method: "POST",
        body: JSON.stringify({ name, arguments: args }),
      });
      if (bridgeRes) return reply.status(bridgeRes.success ? 200 : 502).send(bridgeRes);
      const res = await gamedevProvider.callTool(name, args);
      return reply.status(res.success ? 200 : 502).send(res);
    }
  );

  // 9. Generic MCP Provider & Dynamic Catalog Proxy
  fastify.get("/mcp/providers", async (_request, reply) => {
    const bridgeRes = await proxyToBridge("/api/mcp/providers");
    if (bridgeRes) return reply.status(200).send(bridgeRes);
    return reply.status(200).send({ success: true, count: 0, providers: [] });
  });

  fastify.post("/mcp/providers/register", async (request, reply) => {
    const bridgeRes = await proxyToBridge("/api/mcp/providers", {
      method: "POST",
      body: JSON.stringify(request.body || {}),
    });
    if (bridgeRes) return reply.status(bridgeRes.success ? 200 : 400).send(bridgeRes);
    return reply.status(502).send({ success: false, error: "Bridge unavailable" });
  });

  fastify.get("/mcp/catalog", async (_request, reply) => {
    const bridgeRes = await proxyToBridge("/api/mcp/catalog");
    if (bridgeRes) return reply.status(200).send(bridgeRes);
    return reply.status(200).send({ success: true, catalog: { tools: [], toolCount: 0 } });
  });
};
