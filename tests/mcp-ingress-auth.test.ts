process.env.PORT = "28787";
process.env.NEXUS_BRIDGE_PORT = "28787";
process.env.NEXUS_BRIDGE_HOST = "127.0.0.1";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type http from "node:http";

const TEST_PORT = 28787;
const BRIDGE_URL = `http://127.0.0.1:${TEST_PORT}`;

describe("MCP Ingress Loopback & Bearer Token Authentication Gate", () => {
  let isLoopbackHost: (hostHeader?: string) => boolean;
  let isDirectLocalhostRequest: (req: http.IncomingMessage) => boolean;
  let bridgeToken: string;
  let bridgeServer: any;

  beforeAll(async () => {
    const bridgeModule = await import("../apps/bridge/src/index.js");
    isLoopbackHost = bridgeModule.isLoopbackHost;
    isDirectLocalhostRequest = bridgeModule.isDirectLocalhostRequest;
    bridgeToken = bridgeModule.BRIDGE_TOKEN;
    bridgeServer = bridgeModule.server;

    // Wait for bridge HTTP server to become ready
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`${BRIDGE_URL}/health`);
        if (res.ok) break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  });

  afterAll(async () => {
    if (bridgeServer) {
      await new Promise<void>((resolve) => {
        bridgeServer.close(() => resolve());
      });
    }
  });

  describe("Unit: isDirectLocalhostRequest & isLoopbackHost", () => {
    it("recognizes loopback hosts correctly", () => {
      expect(isLoopbackHost("localhost")).toBe(true);
      expect(isLoopbackHost("localhost:20705")).toBe(true);
      expect(isLoopbackHost("127.0.0.1")).toBe(true);
      expect(isLoopbackHost("127.0.0.1:8787")).toBe(true);
      expect(isLoopbackHost("[::1]:8787")).toBe(true);
      expect(isLoopbackHost("::1")).toBe(true);

      expect(isLoopbackHost("tunnel.example.com")).toBe(false);
      expect(isLoopbackHost("localbridge.dev")).toBe(false);
      expect(isLoopbackHost("192.168.1.10:8787")).toBe(false);
      expect(isLoopbackHost(undefined)).toBe(false);
    });

    it("accepts direct loopback requests without proxy headers", () => {
      const mockReq = {
        socket: { remoteAddress: "127.0.0.1" },
        headers: { host: "127.0.0.1:8787" },
      } as unknown as http.IncomingMessage;

      expect(isDirectLocalhostRequest(mockReq)).toBe(true);
    });

    it("rejects loopback request if proxy forwarding headers are present", () => {
      const headersWithCf = {
        socket: { remoteAddress: "127.0.0.1" },
        headers: { host: "127.0.0.1:8787", "cf-connecting-ip": "203.0.113.1" },
      } as unknown as http.IncomingMessage;
      expect(isDirectLocalhostRequest(headersWithCf)).toBe(false);

      const headersWithXff = {
        socket: { remoteAddress: "127.0.0.1" },
        headers: { host: "127.0.0.1:8787", "x-forwarded-for": "198.51.100.2" },
      } as unknown as http.IncomingMessage;
      expect(isDirectLocalhostRequest(headersWithXff)).toBe(false);

      const headersWithXRealIp = {
        socket: { remoteAddress: "::1" },
        headers: { host: "localhost:8787", "x-real-ip": "198.51.100.3" },
      } as unknown as http.IncomingMessage;
      expect(isDirectLocalhostRequest(headersWithXRealIp)).toBe(false);

      const headersWithForwarded = {
        socket: { remoteAddress: "127.0.0.1" },
        headers: { host: "127.0.0.1:8787", forwarded: "for=198.51.100.4" },
      } as unknown as http.IncomingMessage;
      expect(isDirectLocalhostRequest(headersWithForwarded)).toBe(false);
    });

    it("rejects request if remote address is non-loopback", () => {
      const externalReq = {
        socket: { remoteAddress: "192.168.1.50" },
        headers: { host: "127.0.0.1:8787" },
      } as unknown as http.IncomingMessage;
      expect(isDirectLocalhostRequest(externalReq)).toBe(false);
    });

    it("rejects request if host header is non-loopback even from loopback socket", () => {
      const tunnelReq = {
        socket: { remoteAddress: "127.0.0.1" },
        headers: { host: "nexus-tunnel.trycloudflare.com" },
      } as unknown as http.IncomingMessage;
      expect(isDirectLocalhostRequest(tunnelReq)).toBe(false);
    });
  });

  describe("Integration: HTTP POST /mcp Ingress Authentication", () => {
    it("1. 本机无头放行 (Direct localhost request without Authorization header is allowed)", async () => {
      const res = await fetch(`${BRIDGE_URL}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "local_no_auth",
          method: "tools/list",
          params: {},
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.jsonrpc).toBe("2.0");
      expect(data.result).toBeDefined();
      expect(data.result.tools).toBeInstanceOf(Array);
    });

    it("2. 带 cf-connecting-ip 头的无令牌请求被拒 (Request with cf-connecting-ip without token is rejected with 401)", async () => {
      const res = await fetch(`${BRIDGE_URL}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "cf-connecting-ip": "203.0.113.195",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "cf_no_auth",
          method: "tools/list",
          params: {},
        }),
      });

      expect(res.status).toBe(401);
      const authHeader = res.headers.get("www-authenticate");
      expect(authHeader).toContain('Bearer realm="LocalBridge MCP"');

      const data = await res.json() as any;
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32000);
      expect(data.error.message).toMatch(/Unauthorized: Missing Bearer token/i);
    });

    it("2b. 带 x-forwarded-for 头的无令牌请求被拒 (Request with x-forwarded-for without token is rejected with 401)", async () => {
      const res = await fetch(`${BRIDGE_URL}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-forwarded-for": "198.51.100.5",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "xff_no_auth",
          method: "tools/list",
          params: {},
        }),
      });

      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toContain("Bearer");
    });

    it("3. 带有效令牌的远程请求放行 (Remote / proxied request with valid Bearer token is allowed)", async () => {
      expect(bridgeToken).toBeDefined();
      expect(bridgeToken.length).toBeGreaterThan(0);

      const res = await fetch(`${BRIDGE_URL}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "cf-connecting-ip": "203.0.113.195",
          Authorization: `Bearer ${bridgeToken}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "remote_valid_auth",
          method: "tools/list",
          params: {},
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.jsonrpc).toBe("2.0");
      expect(data.result).toBeDefined();
      expect(data.result.tools).toBeInstanceOf(Array);
    });

    it("4. 错误令牌被拒 (Request with invalid Bearer token is rejected with 401)", async () => {
      const res = await fetch(`${BRIDGE_URL}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: "Bearer incorrect-token-123456",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "wrong_auth",
          method: "tools/list",
          params: {},
        }),
      });

      expect(res.status).toBe(401);
      const authHeader = res.headers.get("www-authenticate");
      expect(authHeader).toContain('Bearer realm="LocalBridge MCP"');

      const data = await res.json() as any;
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32000);
      expect(data.error.message).toMatch(/Unauthorized/i);
    });
  });
});
