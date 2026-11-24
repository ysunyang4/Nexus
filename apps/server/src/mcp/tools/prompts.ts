import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { toMcpSchema } from "../schema.js";
import type { NexusPromptRow } from "../../db/schema.js";

const GetActiveDirectivesSchema = z.object({
  category: z.enum(["system", "project", "user", "tool"]).optional().describe("Optional category filter (system, project, user, tool)"),
  projectId: z.string().optional().describe("Optional project ID filter"),
  project_id: z.string().optional().describe("Optional alias for projectId"),
});

export function registerPromptTools(server: McpServer, context: McpContext): void {
  // 1. Tool: nexus_get_active_directives
  server.registerTool(
    "nexus_get_active_directives",
    {
      description:
        "Retrieve active prompt directives and system instructions configured in Nexus for the current session or project. Read-only operation that does not modify any state.",
      inputSchema: toMcpSchema(GetActiveDirectivesSchema),
      annotations: {
        readOnlyHint: true,
      },
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "nexus_get_active_directives",
        });

        const db = context.db;
        if (!db) {
          throw new Error("Database not available");
        }

        const category = args?.category;
        const targetProjectId = args?.projectId || args?.project_id;

        let query = "SELECT id, category, name, description, content, project_id, enabled, created_at, updated_at FROM nexus_prompts WHERE enabled = 1";
        const params: any[] = [];

        if (category) {
          query += " AND category = ?";
          params.push(category);
        }

        if (targetProjectId) {
          query += " AND (project_id IS NULL OR project_id = ?)";
          params.push(targetProjectId);
        }

        query += " ORDER BY category ASC, name ASC";

        const rows = db.prepare(query).all(...params) as NexusPromptRow[];

        const directives = rows.map((r) => ({
          id: r.id,
          category: r.category,
          name: r.name,
          description: r.description || "",
          content: r.content,
          projectId: r.project_id,
        }));

        context.logAudit("mcp_tool_completed", {
          toolName: "nexus_get_active_directives",
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess({
          count: directives.length,
          directives,
        });
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "nexus_get_active_directives",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 2. Standard MCP Prompts Protocol: prompts/list & prompts/get
  try {
    // Initialize prompt capability on McpServer
    server.registerPrompt(
      "nexus_system_directives",
      {
        title: "Nexus System Directives",
        description: "Default Nexus execution directives",
      },
      async () => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Default Nexus execution directives",
            },
          },
        ],
      })
    );

    // Dynamic database-backed prompts/list handler
    server.server.setRequestHandler("prompts/list", async () => {
      const db = context.db;
      if (!db) {
        return { prompts: [] };
      }
      try {
        const rows = db
          .prepare(
            "SELECT id, category, name, description FROM nexus_prompts WHERE enabled = 1 ORDER BY name ASC"
          )
          .all() as Array<{ id: string; category: string; name: string; description: string | null }>;

        return {
          prompts: rows.map((r) => ({
            name: r.name,
            description: r.description || `[${r.category}] Prompt directive: ${r.name}`,
            arguments: [],
          })),
        };
      } catch {
        return { prompts: [] };
      }
    });

    // Dynamic database-backed prompts/get handler
    server.server.setRequestHandler("prompts/get", async (request: any) => {
      const db = context.db;
      if (!db) {
        throw new Error("Database not available");
      }
      const promptName = request?.params?.name;
      const row = db
        .prepare(
          "SELECT id, category, name, description, content FROM nexus_prompts WHERE (name = ? OR id = ?) AND enabled = 1 LIMIT 1"
        )
        .get(promptName, promptName) as NexusPromptRow | undefined;

      if (!row) {
        throw new Error(`Prompt '${promptName}' not found or is disabled`);
      }

      return {
        description: row.description || `[${row.category}] ${row.name}`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: row.content,
            },
          },
        ],
      };
    });
  } catch (err) {
    context.logger?.warn?.({ err }, "Failed to register standard MCP prompts protocol handlers");
  }
}
