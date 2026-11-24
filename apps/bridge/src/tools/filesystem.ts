import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { NexusClient } from "../nexus-client.js";
import { validatePathSandbox } from "../security.js";

export function registerFilesystemTools(server: McpServer, nexusClient: NexusClient) {
  // 1. nexus_directory_list
  server.tool(
    "nexus_directory_list",
    "List files and subdirectories under a specified directory within a managed project workspace.",
    {
      projectId: z.string().describe("Project name or project ID, e.g. 'Myweb'"),
      path: z.string().default(".").describe("Relative directory path inside the project, defaults to '.'"),
    },
    async ({ projectId, path: relPath }) => {
      try {
        const project = await nexusClient.resolveProject(projectId);

        if (project.rootPath) {
          const sandbox = validatePathSandbox(project.rootPath, relPath);
          if (!sandbox.valid) {
            return {
              content: [{ type: "text", text: `[Security Error] ${sandbox.error}` }],
              isError: true,
            };
          }
        }

        const args: Record<string, unknown> = {
          projectId: project.id,
          path: relPath || ".",
        };

        const downstreamRes = await nexusClient.callNexusTool("localbridge_directory_list", args);

        return {
          content: downstreamRes.content as any,
          isError: downstreamRes.isError,
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error listing directory: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // 2. nexus_file_read
  server.tool(
    "nexus_file_read",
    "Read full contents or sliced line ranges of a specified text file within a managed project.",
    {
      projectId: z.string().describe("Project name or project ID, e.g. 'Myweb'"),
      path: z.string().describe("Relative file path inside the project, e.g. 'src/index.ts' or 'index.html'"),
      startLine: z.number().optional().describe("1-indexed starting line number, defaults to 1"),
      maxLines: z.number().optional().describe("Maximum line count to read (1-500), defaults to 300"),
      offset: z.number().optional().describe("Alias for startLine"),
      limit: z.number().optional().describe("Alias for maxLines"),
    },
    async ({ projectId, path: relPath, startLine, maxLines, offset, limit }) => {
      try {
        const project = await nexusClient.resolveProject(projectId);

        if (project.rootPath) {
          const sandbox = validatePathSandbox(project.rootPath, relPath);
          if (!sandbox.valid) {
            return {
              content: [{ type: "text", text: `[Security Error] ${sandbox.error}` }],
              isError: true,
            };
          }
        }

        const resolvedStartLine = Math.max(1, startLine ?? offset ?? 1);
        const resolvedMaxLines = Math.min(500, Math.max(1, maxLines ?? limit ?? 300));

        const args: Record<string, unknown> = {
          projectId: project.id,
          path: relPath,
          startLine: resolvedStartLine,
          maxLines: resolvedMaxLines,
        };

        const downstreamRes = await nexusClient.callNexusTool("localbridge_file_read", args);

        return {
          content: downstreamRes.content as any,
          isError: downstreamRes.isError,
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error reading file: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // 3. nexus_file_create
  server.tool(
    "nexus_file_create",
    "Safely create a new file with specified text content within the managed project directory.",
    {
      projectId: z.string().describe("Project name or project ID, e.g. 'Myweb'"),
      path: z.string().describe("Relative path of the new file inside the project"),
      content: z.string().describe("Text content of the file"),
    },
    async ({ projectId, path: relPath, content }) => {
      try {
        const project = await nexusClient.resolveProject(projectId);

        if (project.rootPath) {
          const sandbox = validatePathSandbox(project.rootPath, relPath);
          if (!sandbox.valid) {
            return {
              content: [{ type: "text", text: `[Security Error] ${sandbox.error}` }],
              isError: true,
            };
          }
        }

        const args: Record<string, unknown> = {
          projectId: project.id,
          path: relPath,
          content,
        };

        const downstreamRes = await nexusClient.callNexusTool("localbridge_file_create", args);

        return {
          content: downstreamRes.content as any,
          isError: downstreamRes.isError,
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error creating file: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // 4. nexus_file_write
  server.tool(
    "nexus_file_write",
    "Overwrite or update the content of an existing file in the project workspace.",
    {
      projectId: z.string().describe("Project name or project ID, e.g. 'Myweb'"),
      path: z.string().describe("Relative path of the existing file inside the project"),
      content: z.string().describe("New text content to write"),
    },
    async ({ projectId, path: relPath, content }) => {
      try {
        const project = await nexusClient.resolveProject(projectId);

        if (project.rootPath) {
          const sandbox = validatePathSandbox(project.rootPath, relPath);
          if (!sandbox.valid) {
            return {
              content: [{ type: "text", text: `[Security Error] ${sandbox.error}` }],
              isError: true,
            };
          }
        }

        const args: Record<string, unknown> = {
          projectId: project.id,
          path: relPath,
          content,
        };

        const downstreamRes = await nexusClient.callNexusTool("localbridge_file_write", args);

        return {
          content: downstreamRes.content as any,
          isError: downstreamRes.isError,
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error writing file: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
