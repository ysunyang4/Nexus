import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { NexusClient } from "../nexus-client.js";

export function registerProjectTools(server: McpServer, nexusClient: NexusClient) {
  // 1. nexus_project_list
  server.tool(
    "nexus_project_list",
    "List all registered and managed local projects in Nexus LocalBridge with IDs, names, and path configurations.",
    {},
    async () => {
      try {
        const projects = await nexusClient.getProjects(true);
        const output = {
          total: projects.length,
          projects: projects.map((p) => ({
            projectId: p.id,
            name: p.name,
            rootPath: p.rootPath || "unknown",
            enabled: p.enabled,
            accessMode: p.accessMode || "read-write",
            executionMode: p.executionMode || "project-code",
          })),
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(output, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error fetching projects: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // 2. nexus_project_info
  server.tool(
    "nexus_project_info",
    "Retrieve detailed configuration and state for a specified project by project name or ID.",
    {
      projectId: z.string().describe("Project name or project ID, e.g. 'Myweb' or 'proj_367f3b4a...'"),
    },
    async ({ projectId }) => {
      try {
        const project = await nexusClient.resolveProject(projectId);
        const downstreamRes = await nexusClient.callNexusTool("localbridge_project_info", {
          projectId: project.id,
        });

        return {
          content: downstreamRes.content as any,
          isError: downstreamRes.isError,
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error getting project info: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
