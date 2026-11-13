/**
 * Nexus Generic MCP Client Runtime — Session Manager
 * 
 * Manages downstream MCP client sessions:
 * - Session reuse and Keep-Alive lifecycle
 * - Session ID propagation (mcp-session-id)
 * - Idle expiration & eviction (2 hours default)
 * - Session invalidation upon server restart or invalid session exceptions
 * - Graceful session termination (DELETE /mcp)
 */

import crypto from "node:crypto";
import type {
  MCPSession,
  MCPSessionState,
  McpProtocolVersion,
  McpServerInfo,
  McpCapabilities,
} from "./types.js";

export class MCPSessionManager {
  private static instance: MCPSessionManager | null = null;
  private sessions: Map<string, MCPSession> = new Map();
  private maxIdleTimeMs = 2 * 60 * 60 * 1000; // 2 hours idle timeout

  private constructor() {}

  public static getInstance(): MCPSessionManager {
    if (!MCPSessionManager.instance) {
      MCPSessionManager.instance = new MCPSessionManager();
    }
    return MCPSessionManager.instance;
  }

  /**
   * Create or reset a session for a provider
   */
  public createSession(
    providerId: string,
    endpoint: string,
    protocolVersion: McpProtocolVersion = "2024-11-05",
    initialHeaders: Record<string, string> = {}
  ): MCPSession {
    const existing = this.sessions.get(providerId);
    if (existing && existing.state === "READY" && !this.isExpired(existing)) {
      return existing;
    }

    const session: MCPSession = {
      sessionId: "",
      providerId,
      state: "CONNECTING",
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      endpoint,
      protocolVersion,
      serverInfo: null,
      capabilities: null,
      headers: { ...initialHeaders },
      stats: {
        totalCalls: 0,
        failedCalls: 0,
        totalDurationMs: 0,
      },
    };

    this.sessions.set(providerId, session);
    return session;
  }

  /**
   * Get current session for a provider
   */
  public getSession(providerId: string): MCPSession | undefined {
    const session = this.sessions.get(providerId);
    if (!session) return undefined;
    if (this.isExpired(session)) {
      this.invalidateSession(providerId, "Session idle timeout expired (2 hours)");
      return undefined;
    }
    return session;
  }

  /**
   * Check if a session has expired due to idle timeout
   */
  public isExpired(session: MCPSession): boolean {
    return Date.now() - session.lastActiveAt > this.maxIdleTimeMs;
  }

  /**
   * Update session state
   */
  public updateSessionState(
    providerId: string,
    state: MCPSessionState,
    updates?: Partial<MCPSession>
  ): void {
    const session = this.sessions.get(providerId);
    if (!session) return;

    session.state = state;
    session.lastActiveAt = Date.now();

    if (updates) {
      if (updates.sessionId) session.sessionId = updates.sessionId;
      if (updates.serverInfo) session.serverInfo = updates.serverInfo;
      if (updates.capabilities) session.capabilities = updates.capabilities;
      if (updates.protocolVersion) session.protocolVersion = updates.protocolVersion;
      if (updates.headers) {
        session.headers = { ...session.headers, ...updates.headers };
      }
    }
  }

  /**
   * Set downstream session ID assigned by server
   */
  public setSessionId(providerId: string, sessionId: string): void {
    const session = this.sessions.get(providerId);
    if (session) {
      session.sessionId = sessionId;
      session.headers["mcp-session-id"] = sessionId;
      session.lastActiveAt = Date.now();
    }
  }

  /**
   * Touch session to update last active timestamp & execution stats
   */
  public touchSession(providerId: string, durationMs = 0, isFailed = false): void {
    const session = this.sessions.get(providerId);
    if (!session) return;
    session.lastActiveAt = Date.now();
    session.stats.totalCalls++;
    if (isFailed) {
      session.stats.failedCalls++;
    }
    session.stats.totalDurationMs += durationMs;
  }

  /**
   * Invalidate session (e.g. server restart detected or connection error)
   */
  public invalidateSession(providerId: string, reason?: string): void {
    const session = this.sessions.get(providerId);
    if (session) {
      session.state = "DISCONNECTED";
    }
    this.sessions.delete(providerId);
  }

  /**
   * Gracefully close session with remote DELETE request if possible
   */
  public async closeSession(providerId: string): Promise<void> {
    const session = this.sessions.get(providerId);
    if (!session) return;

    session.state = "CLOSED";
    const sessionId = session.sessionId;
    const endpoint = session.endpoint;

    try {
      await fetch(endpoint, {
        method: "DELETE",
        headers: {
          "mcp-session-id": sessionId,
        },
        signal: AbortSignal.timeout(2000),
      }).catch(() => {});
    } catch {
      // Best-effort remote close
    } finally {
      this.sessions.delete(providerId);
    }
  }

  /**
   * Check if provider has a ready, valid session
   */
  public isSessionReady(providerId: string): boolean {
    const session = this.sessions.get(providerId);
    if (!session) return false;
    if (this.isExpired(session)) {
      this.invalidateSession(providerId, "Session idle timeout expired");
      return false;
    }
    return session.state === "READY";
  }

  /**
   * List all current sessions
   */
  public getAllSessions(): MCPSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Clear all sessions
   */
  public clear(): void {
    this.sessions.clear();
  }
}
