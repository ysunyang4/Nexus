import crypto from "node:crypto";
import type Database from "better-sqlite3";
import type { NexusSessionCacheRow } from "../db/schema.js";

export interface SessionCacheSaveInput {
  title: string;
  summary: string;
  keyDecisions?: string[];
  key_decisions?: string[];
  activeFiles?: string[];
  active_files?: string[];
  pendingTasks?: string[];
  pending_tasks?: string[];
  rawContext?: string;
  raw_context?: string;
  ttlHours?: number;
  ttl_hours?: number;
}

export interface SessionCacheEntry {
  handle: string;
  title: string;
  summary: string;
  keyDecisions: string[];
  activeFiles: string[];
  pendingTasks: string[];
  rawContext?: string | null;
  tokenCount: number;
  createdAt: number;
  expiresAt: number;
  accessedAt?: number | null;
  accessCount: number;
  wakePrompt: string;
}

export class SessionHandoffManager {
  /**
   * Redact sensitive API keys, tokens, and authorization headers.
   */
  public static redactSensitiveTokens(input: string): string {
    if (!input) return "";
    let result = input;
    // Nexus / LocalBridge auth tokens
    result = result.replace(/lb_[a-zA-Z0-9_-]{16,}/gi, "[REDACTED_LB_TOKEN]");
    // OpenAI / Anthropic / Gemini API keys
    result = result.replace(/sk-[a-zA-Z0-9_\-]{20,}/g, "[REDACTED_API_KEY]");
    // GitHub PAT
    result = result.replace(/ghp_[a-zA-Z0-9]{36,}/g, "[REDACTED_GH_TOKEN]");
    // Generic Bearer tokens
    result = result.replace(/Bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi, "Bearer [REDACTED_TOKEN]");
    // JWT tokens
    result = result.replace(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, "[REDACTED_JWT]");
    // AWS Access Key ID (AKIA, ASIA, etc.)
    result = result.replace(/\b(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\b/g, "[REDACTED_AWS_KEY]");
    // Private Key PEM block / header
    result = result.replace(/-----BEGIN[ A-Z0-9_-]*PRIVATE KEY-----[\s\S]*?-----END[ A-Z0-9_-]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]");
    result = result.replace(/-----BEGIN[ A-Z0-9_-]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]");
    // Database connection URI password (postgres://user:password@host...)
    result = result.replace(/([a-zA-Z0-9+.-]+:\/\/[^:\s\/]+):([^@\s\/]+)@/g, "$1:[REDACTED_PASSWORD]@");
    // Assignment passwords (password: '...', password = "...", password=secret)
    result = result.replace(/(password|passwd|pwd)\s*([:=])\s*(['"])(.*?)\3/gi, "$1$2$3[REDACTED_PASSWORD]$3");
    result = result.replace(/(password|passwd|pwd)\s*=\s*([^\s,;}{'"]+)/gi, "$1=[REDACTED_PASSWORD]");
    return result;
  }

  /**
   * Generate an 8-character hex handle: nx-xxxxxxxx
   */
  public static generateHandle(): string {
    return `nx-${crypto.randomBytes(4).toString("hex")}`;
  }

  /**
   * Estimate token count from text using ~3.5 chars/token approximation.
   */
  public static estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 3.5);
  }

  /**
   * Format single-line wake prompt for second LLM conversation.
   */
  public static formatWakePrompt(handle: string, title: string): string {
    return `Nexus会话交接句柄: ${handle}（${title}）。请调用 nexus_session_cache_load 加载上下文并接续工作。`;
  }

  /**
   * Save a handoff cache entry into SQLite.
   */
  public static save(db: Database.Database, input: SessionCacheSaveInput): SessionCacheEntry {
    this.cleanupExpired(db);

    const handle = this.generateHandle();
    const rawTitle = input.title?.trim() || "Untitled Handoff Session";
    const rawSummary = input.summary?.trim() || "";

    const keyDecisions = (input.keyDecisions || input.key_decisions || []).map((d) =>
      this.redactSensitiveTokens(String(d).trim())
    ).filter(Boolean);

    const activeFiles = (input.activeFiles || input.active_files || []).map((f) =>
      this.redactSensitiveTokens(String(f).trim())
    ).filter(Boolean);

    const pendingTasks = (input.pendingTasks || input.pending_tasks || []).map((t) =>
      this.redactSensitiveTokens(String(t).trim())
    ).filter(Boolean);

    let rawContext = input.rawContext || input.raw_context || null;
    if (rawContext) {
      rawContext = this.redactSensitiveTokens(rawContext);
      if (rawContext.length > 5000) {
        rawContext = rawContext.slice(0, 5000) + "\n...[CONTEXT_TRUNCATED_AT_5000_CHARS]";
      }
    }

    const title = this.redactSensitiveTokens(rawTitle);
    const summary = this.redactSensitiveTokens(rawSummary);

    // Calculate TTL
    let ttlHours = input.ttlHours ?? input.ttl_hours ?? 24;
    if (typeof ttlHours !== "number" || Number.isNaN(ttlHours)) ttlHours = 24;
    ttlHours = Math.max(1, Math.min(168, ttlHours)); // Clamp between 1h and 7 days

    const now = Date.now();
    const expiresAt = now + ttlHours * 60 * 60 * 1000;

    // Estimate combined tokens
    const textBlob = `${title}\n${summary}\n${keyDecisions.join("\n")}\n${activeFiles.join("\n")}\n${pendingTasks.join("\n")}\n${rawContext || ""}`;
    const tokenCount = this.estimateTokens(textBlob);

    db.prepare(`
      INSERT INTO nexus_session_cache (
        handle, title, summary, key_decisions, active_files, pending_tasks,
        raw_context, token_count, created_at, expires_at, accessed_at, access_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)
    `).run(
      handle,
      title,
      summary,
      JSON.stringify(keyDecisions),
      JSON.stringify(activeFiles),
      JSON.stringify(pendingTasks),
      rawContext,
      tokenCount,
      now,
      expiresAt
    );

    return {
      handle,
      title,
      summary,
      keyDecisions,
      activeFiles,
      pendingTasks,
      rawContext,
      tokenCount,
      createdAt: now,
      expiresAt,
      accessedAt: null,
      accessCount: 0,
      wakePrompt: this.formatWakePrompt(handle, title),
    };
  }

  /**
   * Load an entry by handle, updating access count and optionally releasing after read.
   */
  public static load(
    db: Database.Database,
    handle: string,
    releaseAfterRead = true
  ): {
    found: boolean;
    expired?: boolean;
    message?: string;
    entry?: SessionCacheEntry;
  } {
    const cleanHandle = handle?.trim().toLowerCase();
    if (!cleanHandle || !/^nx-[a-z0-9]{8}$/i.test(cleanHandle)) {
      return {
        found: false,
        message: `Invalid handle format: "${handle}". Expected format: nx-xxxxxxxx (8 hex chars).`,
      };
    }

    const row = db
      .prepare("SELECT * FROM nexus_session_cache WHERE handle = ?")
      .get(cleanHandle) as NexusSessionCacheRow | undefined;

    if (!row) {
      return {
        found: false,
        message: `Handoff cache with handle "${cleanHandle}" was not found.`,
      };
    }

    const now = Date.now();
    if (row.expires_at <= now) {
      return {
        found: true,
        expired: true,
        message: `Handoff cache "${cleanHandle}" has expired or was already released (expiredAt: ${new Date(row.expires_at).toISOString()}).`,
      };
    }

    // Update access tracking
    const newAccessCount = row.access_count + 1;
    const newExpiresAt = releaseAfterRead ? now : row.expires_at;

    db.prepare(`
      UPDATE nexus_session_cache
      SET access_count = ?, accessed_at = ?, expires_at = ?
      WHERE handle = ?
    `).run(newAccessCount, now, newExpiresAt, cleanHandle);

    let keyDecisions: string[] = [];
    let activeFiles: string[] = [];
    let pendingTasks: string[] = [];

    try {
      if (row.key_decisions) keyDecisions = JSON.parse(row.key_decisions);
    } catch {}
    try {
      if (row.active_files) activeFiles = JSON.parse(row.active_files);
    } catch {}
    try {
      if (row.pending_tasks) pendingTasks = JSON.parse(row.pending_tasks);
    } catch {}

    const entry: SessionCacheEntry = {
      handle: row.handle,
      title: row.title,
      summary: row.summary,
      keyDecisions,
      activeFiles,
      pendingTasks,
      rawContext: row.raw_context,
      tokenCount: row.token_count,
      createdAt: row.created_at,
      expiresAt: newExpiresAt,
      accessedAt: now,
      accessCount: newAccessCount,
      wakePrompt: this.formatWakePrompt(row.handle, row.title),
    };

    return {
      found: true,
      expired: false,
      entry,
    };
  }

  /**
   * List valid session caches.
   */
  public static list(
    db: Database.Database,
    includeExpired = false
  ): Array<Omit<SessionCacheEntry, "rawContext">> {
    const now = Date.now();
    const query = includeExpired
      ? "SELECT handle, title, summary, key_decisions, active_files, pending_tasks, token_count, created_at, expires_at, accessed_at, access_count FROM nexus_session_cache ORDER BY created_at DESC"
      : "SELECT handle, title, summary, key_decisions, active_files, pending_tasks, token_count, created_at, expires_at, accessed_at, access_count FROM nexus_session_cache WHERE expires_at > ? ORDER BY created_at DESC";

    const rows = (includeExpired
      ? db.prepare(query).all()
      : db.prepare(query).all(now)) as NexusSessionCacheRow[];

    return rows.map((r) => {
      let keyDecisions: string[] = [];
      let activeFiles: string[] = [];
      let pendingTasks: string[] = [];
      try {
        if (r.key_decisions) keyDecisions = JSON.parse(r.key_decisions);
      } catch {}
      try {
        if (r.active_files) activeFiles = JSON.parse(r.active_files);
      } catch {}
      try {
        if (r.pending_tasks) pendingTasks = JSON.parse(r.pending_tasks);
      } catch {}

      return {
        handle: r.handle,
        title: r.title,
        summary: r.summary,
        keyDecisions,
        activeFiles,
        pendingTasks,
        tokenCount: r.token_count,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        accessedAt: r.accessed_at,
        accessCount: r.access_count,
        wakePrompt: this.formatWakePrompt(r.handle, r.title),
      };
    });
  }

  /**
   * Clear a specific handle or all expired/released handles.
   */
  public static clear(db: Database.Database, targetHandle?: string): { clearedCount: number } {
    if (targetHandle) {
      const res = db.prepare("DELETE FROM nexus_session_cache WHERE handle = ?").run(targetHandle.trim());
      return { clearedCount: res.changes };
    }

    const now = Date.now();
    const res = db
      .prepare("DELETE FROM nexus_session_cache WHERE expires_at <= ? OR access_count > 0")
      .run(now);
    return { clearedCount: res.changes };
  }

  /**
   * Clean up expired entries that have already been accessed.
   */
  public static cleanupExpired(db: Database.Database): number {
    try {
      const now = Date.now();
      const res = db
        .prepare("DELETE FROM nexus_session_cache WHERE expires_at < ? AND access_count > 0")
        .run(now);
      return res.changes;
    } catch {
      return 0;
    }
  }
}
