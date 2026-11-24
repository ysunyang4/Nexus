import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NexusClient } from "../nexus-client.js";

export function registerPromptTools(server: McpServer, nexusClient: NexusClient): void {
  server.tool(
    "nexus_get_active_directives",
    "Retrieve active prompt directives and system instructions configured in Nexus for the current session or project. Read-only operation that does not modify any state.",
    {
      category: z.enum(["system", "project", "user", "tool"]).optional().describe("Optional category filter (system, project, user, tool)"),
      projectId: z.string().optional().describe("Optional project ID filter"),
    },
    async (args) => {
      try {
        const downstreamRes = await nexusClient.callNexusTool("nexus_get_active_directives", (args || {}) as any);
        return {
          content: downstreamRes.content as any,
          isError: downstreamRes.isError,
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error retrieving active directives: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
