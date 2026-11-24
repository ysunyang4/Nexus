import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { toMcpSchema } from "../schema.js";
import { RelayHubService } from "../../relay/relay-hub-service.js";

const DiscoverNodesParamsSchema = z.object({
  refresh: z
    .boolean()
    .optional()
    .describe("Whether to force a fresh health probe of active nodes in the relay cluster"),
});

const DispatchTaskParamsSchema = z.object({
  node_id: z
    .string()
    .optional()
    .default("auto")
    .describe(
      "Target AI inference node identifier (e.g. 'deepseek-reasoner', 'gpt-omni', 'claude-worker', 'kimi-longcontext', 'doubao-pro', 'duck-speed', or 'auto')"
    ),
  instruction: z
    .string()
    .optional()
    .default("")
    .describe("Detailed task prompt and specifications to be executed by the target node"),
  action: z
    .enum(["chat", "new_chat", "delete_chat"])
    .optional()
    .default("chat")
    .describe("Session action: 'chat' (normal prompt), 'new_chat' (start fresh conversation), 'delete_chat' (delete active chat)"),
  new_chat: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to start a fresh, clean conversation session before sending the prompt"),
  delete_current_chat: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to delete the current active chat session"),
  context: z
    .string()
    .optional()
    .describe("Optional background context, code snippets, or document text"),
  timeout_seconds: z
    .number()
    .optional()
    .default(120)
    .describe("Maximum timeout in seconds for node completion (default: 120)"),
});

export function registerRelayHubTools(server: McpServer, _context: McpContext): void {
  const relayService = RelayHubService.getInstance();

  // 1. localbridge_relay_discover_nodes
  server.registerTool(
    "localbridge_relay_discover_nodes",
    {
      description:
        "Discover and inspect available high-performance model inference nodes in the local Relay Cluster. Returns online nodes, current readiness status, and recommended specialties (e.g. algorithmic coding, deep reasoning, long document digestion).",
      inputSchema: toMcpSchema(DiscoverNodesParamsSchema),
    },
    async (_args: any) => {
      try {
        if (!relayService.isEnabled()) {
          return formatToolSuccess({
            gateway_cluster: "Nexus-Enterprise-Relay-Cluster",
            status: "DISABLED_BY_USER",
            message:
              "多模型推理中转网关当前在 Nexus 桌面设置中处于关闭状态。如需调度外部模型节点，请在系统设置中开启该功能。",
            active_nodes: [],
          });
        }

        const nodes = await relayService.discoverNodes();
        const status = relayService.getStatus();

        return formatToolSuccess({
          gateway_cluster: "Nexus-Enterprise-Relay-Cluster",
          status: status.connected ? "READY" : "STANDBY",
          relay_extension_connected: status.connected,
          message: status.connected
            ? `当前中转网关已连接，发现 ${nodes.length} 个就绪推理节点。`
            : "中转网关已就绪，但尚未检测到本地 Edge 浏览器中的活跃 AI 标签页。请在 Edge 中打开对应 AI 站点（如 ChatGPT、DeepSeek 等）。",
          active_nodes: nodes.map((n) => ({
            node_id: n.nodeId,
            display_name: n.displayName,
            status: n.status,
            best_for: n.bestFor,
          })),
        });
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 2. localbridge_relay_dispatch_task
  server.registerTool(
    "localbridge_relay_dispatch_task",
    {
      description:
        "Delegate a complex, resource-intensive reasoning, coding, or drafting task to an upstream high-performance inference node in the Relay Cluster. Returns the full generated output for inspection and synthesis.",
      inputSchema: toMcpSchema(DispatchTaskParamsSchema),
    },
    async (args: any) => {
      try {
        if (!relayService.isEnabled()) {
          return formatToolSuccess({
            status: "DISABLED_BY_USER",
            error:
              "多模型推理中转网关当前已被管理员在系统设置中关闭。请先在 Nexus 设置界面中开启该功能后重试。",
          });
        }

        const timeoutMs = (args.timeout_seconds || 120) * 1000;
        const fullPrompt = args.context
          ? `### Background Context / Reference:\n${args.context}\n\n### Task Instructions:\n${args.instruction}`
          : args.instruction || "";

        const dispatchRes = await relayService.dispatchTask(
          args.node_id,
          fullPrompt,
          timeoutMs,
          {
            action: args.action,
            newChat: args.new_chat,
            deleteCurrentChat: args.delete_current_chat,
            outputFilePath: args.output_file_path,
          }
        );

        const status = typeof dispatchRes === "string" ? "COMPLETED" : dispatchRes.status || "COMPLETED";
        const resultText = typeof dispatchRes === "string" ? dispatchRes : dispatchRes.text;

        return formatToolSuccess({
          node_id: args.node_id,
          status,
          action: args.action || (args.new_chat ? "new_chat" : args.delete_current_chat ? "delete_chat" : "chat"),
          result: resultText,
          notes:
            status === "SKIPPED_NOT_OPEN"
              ? "节点网页尚未在 Edge 中打开，已首次优雅跳过"
              : status === "DETACHED_SAVING_LOCAL"
              ? "已开启 10s 即发即弃脱钩模式并自动落盘本地"
              : status === "DISPATCHED_ZERO_WAIT"
              ? "已开启即发即弃零等待模式"
              : "Generated by upstream inference node. Ready for supervisor inspection and refinement.",
        });
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );
}
