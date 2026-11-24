import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { NexusClient } from "../nexus-client.js";

export function registerGitTools(server: McpServer, nexusClient: NexusClient) {
  // 1. nexus_git_status
  server.tool(
    "nexus_git_status",
    "Inspect the current Git workspace status (branch, modified files, untracked changes) of a project.",
    {
      projectId: z.string().describe("Project name or project ID, e.g. 'Myweb' or 'git-p1b-test'"),
    },
    async ({ projectId }) => {
      try {
        const project = await nexusClient.resolveProject(projectId);
        const downstreamRes = await nexusClient.callNexusTool("localbridge_git_status", {
          projectId: project.id,
        });

        return {
          content: downstreamRes.content as any,
          isError: downstreamRes.isError,
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error checking git status: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
