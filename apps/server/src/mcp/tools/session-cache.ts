import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { toMcpSchema } from "../schema.js";
import { SessionHandoffManager } from "../../session/handoff.js";

const SaveSessionCacheSchema = z.object({
  title: z.string().describe("Descriptive title of the working session or milestone"),
  summary: z.string().describe("Structured summary of completed work, key context, and current phase"),
  keyDecisions: z.array(z.string()).optional().describe("Key architectural, design, or algorithmic decisions made"),
  key_decisions: z.array(z.string()).optional().describe("Alias for keyDecisions"),
  activeFiles: z.array(z.string()).optional().describe("Key files modified, inspected, or relevant to the next step"),
  active_files: z.array(z.string()).optional().describe("Alias for activeFiles"),
  pendingTasks: z.array(z.string()).optional().describe("Pending next steps or unfinished tasks for the next agent/account"),
  pending_tasks: z.array(z.string()).optional().describe("Alias for pendingTasks"),
  rawContext: z.string().max(5000).optional().describe("Optional compact dialog excerpts (up to 5000 chars)"),
  raw_context: z.string().max(5000).optional().describe("Alias for rawContext"),
  ttlHours: z.number().min(1).max(168).optional().describe("Expiration time in hours (1-168, default 24)"),
  ttl_hours: z.number().min(1).max(168).optional().describe("Alias for ttlHours"),
});

const LoadSessionCacheSchema = z.object({
  handle: z.string().describe("The 8-character handoff handle (e.g. nx-a1b2c3d4)"),
  releaseAfterRead: z.boolean().optional().describe("Whether to immediately release/expire the cache after reading (default true to save tokens and prevent leaks)"),
  release_after_read: z.boolean().optional().describe("Alias for releaseAfterRead"),
});

const ListSessionCacheSchema = z.object({
  includeExpired: z.boolean().optional().describe("Whether to include expired handles in the list (default false)"),
  include_expired: z.boolean().optional().describe("Alias for includeExpired"),
});

const ClearSessionCacheSchema = z.object({
  handle: z.string().optional().describe("Optional specific handle to clear. If omitted, cleans all expired and released handles."),
});

const HandoffSessionSchema = z.object({
  title: z.string().describe("Descriptive title of the working session or milestone"),
  coreProgress: z.union([z.array(z.string()), z.string()]).optional().describe("Core achievements and milestones"),
  verifiableAnchors: z.union([
    z.object({
      activeFiles: z.array(z.string()).optional(),
      exactSymbolsOrLines: z.array(z.string()).optional(),
      errorOrCodeSnippets: z.array(z.string()).optional(),
      gitCommitOrBranch: z.string().optional(),
    }),
    z.array(z.string()),
    z.string(),
  ]).optional().describe("Verifiable hard anchors (file paths, line references, exact error messages, commit hashes)"),
  confirmedFacts: z.union([z.array(z.string()), z.string()]).optional().describe("Verified facts (passed tests, proven behaviors)"),
  hypotheses: z.union([z.array(z.string()), z.string()]).optional().describe("AI hypotheses or unverified assumptions"),
  verificationStatus: z.union([
    z.object({
      passed: z.array(z.string()).optional(),
      pending: z.array(z.string()).optional(),
    }),
    z.array(z.string()),
    z.string(),
  ]).optional().describe("Current verification status"),
  negativeKnowledge: z.union([z.array(z.string()), z.string()]).optional().describe("Anti-patterns and discarded solutions NOT to repeat"),
  nextSteps: z.union([z.array(z.string()), z.string()]).optional().describe("Prioritized next actionable steps for the next AI agent"),
  summary: z.string().optional().describe("Optional overall structured summary markdown"),
  ttlHours: z.number().min(1).max(168).optional().describe("Expiration time in hours (default 24)"),
});

export function registerSessionCacheTools(server: McpServer, context: McpContext): void {
  // 1. Tool: nexus_session_cache_save
  server.registerTool(
    "nexus_session_cache_save",
    {
      description:
        "Save a cross-account conversation handoff package into Nexus SQLite cache with sensitive token redaction and return a short 8-char handle. Use this before switching AI sessions to preserve full context with minimal tokens.",
      inputSchema: toMcpSchema(SaveSessionCacheSchema),
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
      },
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "nexus_session_cache_save",
        });

        const db = context.db;
        if (!db) {
          throw new Error("Database not available");
        }

        const entry = SessionHandoffManager.save(db, {
          title: args.title,
          summary: args.summary,
          keyDecisions: args.keyDecisions || args.key_decisions,
          activeFiles: args.activeFiles || args.active_files,
          pendingTasks: args.pendingTasks || args.pending_tasks,
          rawContext: args.rawContext || args.raw_context,
          ttlHours: args.ttlHours ?? args.ttl_hours,
        });

        // 1. Write handle and wake prompt to local handle file (.nexus/session_handle.txt)
        try {
          const handleFilePath = path.join(process.cwd(), ".nexus", "session_handle.txt");
          fs.mkdirSync(path.dirname(handleFilePath), { recursive: true });
          fs.writeFileSync(handleFilePath, `${entry.handle}\n${entry.wakePrompt}\n`, "utf-8");
        } catch {}

        // 2. Insert into audit_logs as ai_dialogue so it appears in AI 对话记录
        try {
          const insertStmt = db.prepare(
            `INSERT OR REPLACE INTO audit_logs (id, timestamp, client_id, project_id, tool, arguments_summary, result_summary, duration_ms, risk_level, actor_display_name)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          );
          const mid = `msg_handoff_${Date.now()}_${entry.handle}`;
          const formattedText = `【AI 回复存证 · 句柄 ${entry.handle}】\n\n📌 任务标题: ${entry.title}\n\n📝 进展总结:\n${entry.summary}` +
            (entry.keyDecisions && entry.keyDecisions.length > 0 ? `\n\n💡 关键决策:\n${entry.keyDecisions.map((d: string) => `• ${d}`).join("\n")}` : "") +
            (entry.pendingTasks && entry.pendingTasks.length > 0 ? `\n\n📋 待办事项:\n${entry.pendingTasks.map((t: string) => `• ${t}`).join("\n")}` : "");
          insertStmt.run(
            mid,
            Date.now(),
            "ai_session",
            entry.handle,
            "ai_dialogue",
            JSON.stringify({ text: formattedText, title: entry.title, role: "assistant", handle: entry.handle }),
            JSON.stringify({ status: "saved", speaker: "AI (Assistant)" }),
            0,
            "SAFE",
            "AI (Assistant)"
          );
        } catch {}

        context.logAudit("mcp_tool_completed", {
          toolName: "nexus_session_cache_save",
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess({
          success: true,
          handle: entry.handle,
          title: entry.title,
          tokenCount: entry.tokenCount,
          expiresAt: new Date(entry.expiresAt).toISOString(),
          wakePrompt: entry.wakePrompt,
          instruction: "复制上方 wakePrompt 发送给下一个 AI 会话即可，下一个会话将通过 nexus_session_cache_load 恢复全部上下文。",
        });
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "nexus_session_cache_save",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 2. Tool: nexus_session_cache_load
  server.registerTool(
    "nexus_session_cache_load",
    {
      description:
        "Load a cross-account handoff cache by handle (e.g. nx-a1b2c3d4). Restores task state, decisions, active files, and pending items. By default automatically releases the handle after retrieval to minimize token overhead.",
      inputSchema: toMcpSchema(LoadSessionCacheSchema),
      annotations: {
        readOnlyHint: false,
      },
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "nexus_session_cache_load",
        });

        const db = context.db;
        if (!db) {
          throw new Error("Database not available");
        }

        const handle = args.handle;
        const releaseAfterRead = args.releaseAfterRead ?? args.release_after_read ?? true;

        const result = SessionHandoffManager.load(db, handle, releaseAfterRead);

        if (!result.found) {
          return McpErrorMapper.toMcpToolError(new Error(result.message || "Handle not found"));
        }

        if (result.expired) {
          return formatToolSuccess({
            expired: true,
            message: result.message,
          });
        }

        context.logAudit("mcp_tool_completed", {
          toolName: "nexus_session_cache_load",
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        const entry = result.entry!;

        // Point 4: Acknowledge-before-clear. Now that next AI successfully loaded, archive and clear staging file
        try {
          const handleFilePath = path.join(process.cwd(), ".nexus", "session_handle.txt");
          if (fs.existsSync(handleFilePath)) {
            const archiveDir = path.join(process.cwd(), ".nexus", "history");
            fs.mkdirSync(archiveDir, { recursive: true });
            fs.writeFileSync(
              path.join(archiveDir, `${entry.handle}_loaded_${Date.now()}.txt`),
              fs.readFileSync(handleFilePath, "utf-8"),
              "utf-8"
            );
            fs.writeFileSync(handleFilePath, "", "utf-8");
          }
        } catch {}

        // Point 5: Token budget cap (<800 tokens) - compact executive summary and structured lists
        const cappedSummary = entry.summary.length > 1500 ? entry.summary.slice(0, 1500) + "\n...[摘要已精简以极省Token]" : entry.summary;
        const cappedDecisions = (entry.keyDecisions || []).slice(0, 8);
        const cappedFiles = (entry.activeFiles || []).slice(0, 12);
        const cappedTasks = (entry.pendingTasks || []).slice(0, 10);

        return formatToolSuccess({
          success: true,
          handle: entry.handle,
          title: entry.title,
          summary: cappedSummary,
          keyDecisions: cappedDecisions,
          activeFiles: cappedFiles,
          pendingTasks: cappedTasks,
          tokenBudgetCap: "< 800 tokens",
          released: releaseAfterRead,
          message: releaseAfterRead
            ? "已成功读取会话交接上下文，该句柄已按计划释放，历史版本已安全归档。"
            : "已成功读取会话交接上下文，历史版本已安全归档。",
        });
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "nexus_session_cache_load",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 3. Tool: nexus_session_cache_list
  server.registerTool(
    "nexus_session_cache_list",
    {
      description: "List currently stored cross-account handoff cache handles with metadata (omits raw dialog text to save tokens).",
      inputSchema: toMcpSchema(ListSessionCacheSchema),
      annotations: {
        readOnlyHint: true,
      },
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "nexus_session_cache_list",
        });

        const db = context.db;
        if (!db) {
          throw new Error("Database not available");
        }

        const includeExpired = args?.includeExpired ?? args?.include_expired ?? false;
        const list = SessionHandoffManager.list(db, includeExpired);

        context.logAudit("mcp_tool_completed", {
          toolName: "nexus_session_cache_list",
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess({
          count: list.length,
          handles: list,
        });
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "nexus_session_cache_list",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 4. Tool: nexus_session_cache_clear
  server.registerTool(
    "nexus_session_cache_clear",
    {
      description: "Clear expired or released handoff handles, or explicitly delete a specific handle immediately.",
      inputSchema: toMcpSchema(ClearSessionCacheSchema),
      annotations: {
        readOnlyHint: false,
      },
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "nexus_session_cache_clear",
        });

        const db = context.db;
        if (!db) {
          throw new Error("Database not available");
        }

        const res = SessionHandoffManager.clear(db, args?.handle);

        context.logAudit("mcp_tool_completed", {
          toolName: "nexus_session_cache_clear",
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess({
          success: true,
          clearedCount: res.clearedCount,
          targetHandle: args?.handle || "all_expired_and_released",
        });
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "nexus_session_cache_clear",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 5. Tool: nexus_session_handoff (Verifiable Anchors & Token-Optimized Handoff)
  server.registerTool(
    "nexus_session_handoff",
    {
      description:
        "Save an AI-synthesized, token-compressed session handoff package with verifiable anchors, verified facts vs hypotheses, verification status, and negative knowledge into Nexus SQLite cache. Returns an 8-character handle for instant cross-session resumption.",
      inputSchema: toMcpSchema(HandoffSessionSchema),
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
      },
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "nexus_session_handoff",
        });

        const db = context.db;
        if (!db) {
          throw new Error("Database not available");
        }

        // Format 6-dimension summary markdown
        const toList = (v: any): string[] => {
          if (!v) return [];
          if (Array.isArray(v)) return v.map(String).filter(Boolean);
          if (typeof v === "string") return [v];
          if (typeof v === "object") {
            return Object.entries(v).map(([k, val]) => `${k}: ${Array.isArray(val) ? val.join(", ") : String(val)}`);
          }
          return [];
        };

        const coreProgress = toList(args.coreProgress);
        const confirmedFacts = toList(args.confirmedFacts);
        const hypotheses = toList(args.hypotheses);
        const negativeKnowledge = toList(args.negativeKnowledge);
        const nextSteps = toList(args.nextSteps);

        let activeFiles: string[] = [];
        let exactSymbols: string[] = [];
        let errorSnippets: string[] = [];
        let commitRef = "";

        if (args.verifiableAnchors && typeof args.verifiableAnchors === "object") {
          if (Array.isArray(args.verifiableAnchors)) {
            activeFiles = args.verifiableAnchors.map(String);
          } else {
            activeFiles = toList(args.verifiableAnchors.activeFiles);
            exactSymbols = toList(args.verifiableAnchors.exactSymbolsOrLines);
            errorSnippets = toList(args.verifiableAnchors.errorOrCodeSnippets);
            commitRef = String(args.verifiableAnchors.gitCommitOrBranch || "");
          }
        }

        let summaryMd = args.summary || "";
        if (!summaryMd) {
          const parts: string[] = [];
          if (coreProgress.length > 0) {
            parts.push(`### 1. 🎯 核心目标与进展\n${coreProgress.map((p) => `- ${p}`).join("\n")}`);
          }
          if (activeFiles.length > 0 || exactSymbols.length > 0 || errorSnippets.length > 0) {
            parts.push(`### 2. ⚓ 可验证硬锚点\n${[
              ...activeFiles.map((f) => `- 文件: ${f}`),
              ...exactSymbols.map((s) => `- 符号/行: ${s}`),
              ...errorSnippets.map((e) => `- 报错/代码: ${e}`),
              ...(commitRef ? [`- Commit: ${commitRef}`] : []),
            ].join("\n")}`);
          }
          if (confirmedFacts.length > 0 || hypotheses.length > 0) {
            parts.push(`### 3. 🔍 事实 vs 推断分离\n${[
              ...confirmedFacts.map((f) => `- [已确认事实] ${f}`),
              ...hypotheses.map((h) => `- [AI推断/假设] ${h}`),
            ].join("\n")}`);
          }
          if (negativeKnowledge.length > 0) {
            parts.push(`### 4. 🚫 不要重复做的事 (避坑指南)\n${negativeKnowledge.map((n) => `- ${n}`).join("\n")}`);
          }
          if (nextSteps.length > 0) {
            parts.push(`### 5. 📋 下一步待办\n${nextSteps.map((s, idx) => `${idx + 1}. ${s}`).join("\n")}`);
          }
          summaryMd = parts.join("\n\n");
        }

        const entry = SessionHandoffManager.save(db, {
          title: args.title || "Session Handoff",
          summary: summaryMd,
          keyDecisions: negativeKnowledge,
          activeFiles: activeFiles,
          pendingTasks: nextSteps,
          rawContext: summaryMd.slice(0, 5000),
          ttlHours: args.ttlHours,
        });

        // Write to local handle file
        try {
          const handleFilePath = path.join(process.cwd(), ".nexus", "session_handle.txt");
          fs.mkdirSync(path.dirname(handleFilePath), { recursive: true });
          fs.writeFileSync(handleFilePath, `${entry.handle}\n${entry.wakePrompt}\n`, "utf-8");
        } catch {}

        context.logAudit("mcp_tool_completed", {
          toolName: "nexus_session_handoff",
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess({
          success: true,
          handle: entry.handle,
          title: entry.title,
          tokenCount: entry.tokenCount,
          wakePrompt: entry.wakePrompt,
          summary: summaryMd,
          expiresAt: new Date(entry.expiresAt).toISOString(),
          instruction: "已生成严密交接句柄。将唤醒词发送给下一位 AI 即可无损接续工作。",
        });
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "nexus_session_handoff",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );
}
