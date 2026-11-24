import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { NexusClient } from "../nexus-client.js";

export function registerRuntimeTools(server: McpServer, nexusClient: NexusClient) {
  // 1. nexus_runtime_list
  server.tool(
    "nexus_runtime_list",
    "List currently active or registered local persistent runtime services (e.g. dev servers, daemon processes).",
    {
      projectId: z.string().describe("Project name or project ID, e.g. 'Myweb'"),
    },
    async ({ projectId }) => {
      try {
        const project = await nexusClient.resolveProject(projectId);
        const downstreamRes = await nexusClient.callNexusTool("localbridge_runtime_list", {
          projectId: project.id,
        });

        return {
          content: downstreamRes.content as any,
          isError: downstreamRes.isError,
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error listing runtimes: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
