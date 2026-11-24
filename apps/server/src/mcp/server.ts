import { McpServer } from "@modelcontextprotocol/server";
import { mcpExecutionContext, type McpContext, type RequestExecutionContext } from "./context.js";
import { MCP_PROTOCOL_VERSION } from "./types.js";
import { registerProjectTools } from "./tools/project.js";
import { registerFilesystemTools } from "./tools/filesystem.js";
import { registerGitTools } from "./tools/git.js";
import { registerCommandTools } from "./tools/command.js";
import { registerJobTools } from "./tools/jobs.js";
import { registerApprovalTools } from "./tools/approvals.js";
import { registerCodeTools } from "./tools/code.js";
import { registerSessionTools } from "./tools/session.js";
import { registerWorktreeTools } from "./tools/worktree.js";
import { registerRuntimeTools } from "./tools/runtime.js";
import { registerSkillTools } from "./tools/skills.js";
import { registerLayaTools } from "./tools/laya.js";
import { registerEnvironmentTools } from "./tools/environment.js";
import { registerTerminalTools } from "./tools/terminal.js";
import { registerProcessTools } from "./tools/process.js";
import { registerPortTools } from "./tools/port.js";
import { registerAgentTaskTools } from "./tools/agent-task.js";
import { registerArtifactTools } from "./tools/artifacts.js";
import { registerCheckpointTools } from "./tools/checkpoints.js";
import { registerHygieneTools } from "./tools/hygiene.js";
import { registerComputerUseTools } from "./tools/computer-use.js";
import { registerAgentCommTools } from "./tools/agent-comm.js";
import { registerMemoryTools } from "./tools/memory.js";
import { registerValidationTools } from "./tools/validation.js";
import { registerWorkflowTools } from "./tools/workflow.js";
import { registerBrowserTools } from "./tools/browser.js";
import { registerAgentPlanTools } from "./tools/agent-plan.js";
import { registerEventTools } from "./tools/events.js";
import { registerTraceTools } from "./tools/trace.js";
import { registerVisionTools } from "./tools/vision.js";
import { registerDocumentTools } from "./tools/document.js";
import { registerToolRegistryTools } from "./tools/tool-registry.js";
import { registerRuleTools } from "./tools/rules.js";
import { registerKnowledgeTools } from "./tools/knowledge.js";
import { registerContextTools } from "./tools/context.js";
import { registerDiscoveryTools } from "./tools/discovery.js";
import { registerPromptTools } from "./tools/prompts.js";
import { registerSessionCacheTools } from "./tools/session-cache.js";
import { registerRelayHubTools } from "./tools/relay-hub.js";

import { TOOL_ANNOTATIONS } from "./annotations.js";


export interface McpServerOptions {
  name?: string;
  version?: string;
}

export function createLocalBridgeMcpServer(
  context: McpContext,
  options: McpServerOptions = {}
): McpServer {
  const server = new McpServer(
    {
      name: options.name ?? "localbridge-server",
      version: options.version ?? "0.10.0",
    },
    {
      supportedProtocolVersions: [MCP_PROTOCOL_VERSION],
    }
  );

  // Set negotiated protocol version to 2026-07-28 so the wire codec resolves server/discover and other 2026-era methods
  (server.server as any)._negotiatedProtocolVersion = MCP_PROTOCOL_VERSION;

  const SERVER_ONLY_TOOLS = new Set([
    "localbridge_project_list",
    "localbridge_project_info",
    "localbridge_rule_list",
    "localbridge_rule_get",
    "localbridge_rule_add",
    "localbridge_rule_update",
    "localbridge_rule_remove",
    "localbridge_knowledge_list",
    "localbridge_knowledge_get",
    "localbridge_knowledge_search",
    "localbridge_context_get",
    "localbridge_context_save",
    "localbridge_approval_list",
    "localbridge_approval_get",
    "localbridge_approval_status",
    "localbridge_system_status",
    "localbridge_session_list",
    "localbridge_session_status",
    "localbridge_session_events",
    "localbridge_job_list",
    "localbridge_skill_list",
    "localbridge_skill_get",
    "localbridge_skill_match",
    "nexus_session_cache_load",
    "nexus_session_cache_list",
    "nexus_session_cache_save",
    "nexus_session_cache_clear",
    "nexus_session_handoff",
    "nexus_get_active_directives",
    "localbridge_relay_discover_nodes",
    "localbridge_relay_dispatch_task",
  ]);

  // Auto-inject annotations from TOOL_ANNOTATIONS if omitted and track toolName in execution context
  const originalRegisterTool = server.registerTool.bind(server);
  server.registerTool = ((name: string, config: any, handler: any) => {
    const annotations = config.annotations ?? (TOOL_ANNOTATIONS as Record<string, any>)[name];
    const wrappedHandler = async (args: any, extra: any) => {
      if (args && typeof args === "object") {
        args._toolName = name;
      }
      const parentStore = mcpExecutionContext.getStore();
      const store: RequestExecutionContext = {
        ...parentStore,
        toolName: name,
        runnerInvoked: false,
      };

      const targetProjectId = args?.projectId ?? args?.command?.projectId;
      const isMockRpc = Boolean((context.rpcService?.request as any)?.mock);

      // Gate 1: Health Guard (Runner Preflight)
      if (!SERVER_ONLY_TOOLS.has(name) && !isMockRpc && context.runnerRegistry?.list().length === 0) {
        context.logAudit("mcp_tool_blocked", {
          toolName: name,
          projectId: targetProjectId,
          errorCode: "RUNNER_OFFLINE",
          resultStatus: "error",
          reason: "Runner is offline or unavailable",
        });
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "BLOCKED",
                code: "RUNNER_OFFLINE",
                message: `Health Guard: Runner is offline. Tool "${name}" requires an active connected runner.`,
              }),
            },
          ],
          structuredContent: {
            status: "BLOCKED",
            code: "RUNNER_OFFLINE",
          },
        };
      }

      // Gate 2: Workspace Contract (Project authorization & Path traversal protection)
      if (targetProjectId) {
        const project = context.projectService?.getProject(targetProjectId);
        if (!project && !context.projectService?.getSafetyLayerDisabled()) {
          context.logAudit("mcp_permission_denied", {
            toolName: name,
            projectId: targetProjectId,
            errorCode: "WORKSPACE_CONTRACT_VIOLATION",
            resultStatus: "error",
            reason: `Project "${targetProjectId}" not found or unauthorized`,
          });
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "PERMISSION_DENIED",
                  code: "WORKSPACE_CONTRACT_VIOLATION",
                  message: `Workspace Contract: Project "${targetProjectId}" not found or unauthorized.`,
                }),
              },
            ],
            structuredContent: {
              status: "PERMISSION_DENIED",
              code: "WORKSPACE_CONTRACT_VIOLATION",
            },
          };
        }
      }

      // Path traversal check in Workspace Contract
      const pathKeys = ["path", "relativePath", "target", "cwd", "destination", "source", "filePath"];
      for (const key of pathKeys) {
        const val = args?.[key] ?? args?.command?.[key];
        if (typeof val === "string") {
          const norm = val.replace(/\\/g, "/");
          if (norm === ".." || norm.includes("../") || norm.endsWith("/..") || norm.includes("..\\")) {
            context.logAudit("mcp_permission_denied", {
              toolName: name,
              projectId: targetProjectId,
              relativePath: val,
              errorCode: "PATH_TRAVERSAL",
              resultStatus: "error",
              reason: `Path traversal detected in parameter "${key}"`,
            });
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `Path traversal rejected: "${val}"`,
                },
              ],
              structuredContent: {
                status: "PERMISSION_DENIED",
                code: "PATH_TRAVERSAL",
              },
            };
          }
        }
      }

      // Gate 3: Job Idempotency Guard (Block retry on OUTCOME_UNKNOWN)
      if (name === "localbridge_job_start") {
        const idempKey = args?.idempotencyKey ?? store.idempotencyKey;
        if (idempKey && context.db) {
          try {
            const prevJob = context.db
              .prepare(
                "SELECT id, state FROM jobs WHERE idempotency_key = ? ORDER BY created_at DESC LIMIT 1"
              )
              .get(idempKey) as { id: string; state: string } | undefined;
            if (
              prevJob &&
              (prevJob.state === "OUTCOME_UNKNOWN" ||
                prevJob.state === "outcome_unknown" ||
                prevJob.state === "timed_out")
            ) {
              context.logAudit("mcp_tool_blocked", {
                toolName: name,
                projectId: targetProjectId,
                errorCode: "RETRY_UNSAFE_BLOCKED",
                resultStatus: "error",
                idempotencyKey: idempKey,
              });
              return {
                isError: true,
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      status: "BLOCKED",
                      code: "RETRY_UNSAFE_BLOCKED",
                      message: `Retry blocked: previous execution with idempotencyKey "${idempKey}" is in OUTCOME_UNKNOWN state.`,
                    }),
                  },
                ],
                structuredContent: {
                  status: "BLOCKED",
                  code: "RETRY_UNSAFE_BLOCKED",
                  previousJobId: prevJob.id,
                },
              };
            }
          } catch {}
        }
      }

      return mcpExecutionContext.run(store, async () => {
        const startTime = Date.now();
        try {
          const res = await handler(args, extra);
          if (!res?.isError && !store.runnerInvoked && !isMockRpc && context.runnerRegistry?.list().length > 0) {
            try {
              const runnerId = context.resolveAnyRunner();
              const conn = context.runnerRegistry.get(runnerId);
              if (!conn || !(conn.request as any)?.mock) {
                await context.request(runnerId, "system.ping", {
                  _toolName: name,
                  idempotencyKey: `srv_tool_${name}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                });
              }
            } catch {
              // Runner disconnected or unavailable
            }
          }
          const durationMs = Date.now() - startTime;
          const isError = Boolean(res?.isError);
          const relPath = typeof args?.path === "string" ? args.path : (typeof args?.relativePath === "string" ? args.relativePath : undefined);
          context.logAudit(isError ? "mcp_tool_failed" : "mcp_tool_completed", {
            toolName: name,
            projectId: targetProjectId,
            durationMs,
            resultStatus: isError ? "error" : "success",
            clientId: (store as any).clientId || "mcp_client",
            actorDisplayName: (store as any).clientId || "AI Client",
            relativePath: relPath,
          });
          return res;
        } catch (err: any) {
          const durationMs = Date.now() - startTime;
          context.logAudit("mcp_tool_failed", {
            toolName: name,
            projectId: targetProjectId,
            durationMs,
            resultStatus: "error",
            errorCode: err?.code || "ERROR",
            clientId: (store as any).clientId || "mcp_client",
            actorDisplayName: (store as any).clientId || "AI Client",
          });
          throw err;
        }
      });
    };
    return originalRegisterTool(name, { ...config, annotations }, wrappedHandler);
  }) as any;

  // Register all tools
  registerProjectTools(server, context);
  registerFilesystemTools(server, context);
  registerGitTools(server, context);
  registerCommandTools(server, context);
  registerJobTools(server, context);
  registerApprovalTools(server, context);
  registerCodeTools(server, context);
  registerSessionTools(server, context);
  registerWorktreeTools(server, context);
  registerRuntimeTools(server, context);
  registerSkillTools(server, context);
  registerLayaTools(server, context);
  registerEnvironmentTools(server, context);
  registerTerminalTools(server, context);
  registerProcessTools(server, context);
  registerPortTools(server, context);
  registerAgentTaskTools(server, context);
  registerArtifactTools(server, context);
  registerCheckpointTools(server, context);
  registerHygieneTools(server, context);
  registerComputerUseTools(server, context);
  registerAgentCommTools(server, context);
  registerMemoryTools(server, context);
  registerValidationTools(server, context);
  registerWorkflowTools(server, context);
  registerBrowserTools(server, context);
  registerAgentPlanTools(server, context);
  registerEventTools(server, context);
  registerTraceTools(server, context);
  registerVisionTools(server, context);
  registerDocumentTools(server, context);
  registerToolRegistryTools(server, context);
  registerRuleTools(server, context);
  registerKnowledgeTools(server, context);
  registerContextTools(server, context);
  registerDiscoveryTools(server, context);
  registerPromptTools(server, context);
  registerSessionCacheTools(server, context);
  registerRelayHubTools(server, context);

  return server;
}


