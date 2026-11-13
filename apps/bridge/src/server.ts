import type http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  CANONICAL_TOOL_DEFINITIONS,
  CANONICAL_TOOL_COUNT,
  type CanonicalToolDefinition,
} from "@localbridge/protocol";
import { NexusClient } from "./nexus-client.js";
import { validatePathSandbox } from "./security.js";
import {
  ProjectBuilderRuntime,
  CapabilityResolver,
  ProviderRegistry,
  type ProjectBlueprint,
} from "./project-builder/index.js";
import { ProviderRuntime, DynamicCatalog, McpSecurityPolicyManager, ScriptRunner, TokenGuardrail, HandleManager } from "./generic-mcp/index.js";
import { UnityGameDevMcpProvider } from "./unity-gamedev-provider.js";

export { CANONICAL_TOOL_COUNT };

/**
 * Legacy Nexus Tool Definitions (8 tools for backwards compatibility with earlier clients)
 */
export const LEGACY_NEXUS_TOOLS = [
  {
    name: "nexus_project_list",
    description: "列出当前 Nexus LocalBridge 中所有已登记并受控的本地项目，包含项目 ID、名称及路径信息",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "nexus_project_info",
    description: "获取指定项目的详细配置信息（支持输入项目名称如 'Myweb' 或项目 ID）",
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "项目名称或项目 ID，例如 'Myweb' 或 'proj_367f3b4a...'",
        },
      },
      required: ["projectId"],
    },
  },
  {
    name: "nexus_directory_list",
    description: "列出项目指定目录下的子文件与子目录清单",
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "项目名称或项目 ID，例如 'Myweb'",
        },
        path: {
          type: "string",
          description: "项目内的相对目录路径，默认为当前根目录 '.'",
          default: ".",
        },
      },
      required: ["projectId"],
    },
  },
  {
    name: "nexus_file_read",
    description: "读取项目内指定文本文件的完整内容或分行切片",
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "项目名称或项目 ID，例如 'Myweb'",
        },
        path: {
          type: "string",
          description: "文件在项目内的相对路径，例如 'src/index.ts' 或 'index.html'",
        },
        startLine: {
          type: "number",
          description: "起始读取行号（1-indexed），默认从第 1 行开始",
        },
        maxLines: {
          type: "number",
          description: "最大读取行数（1-500），默认 300 行",
        },
        offset: {
          type: "number",
          description: "起始行（兼容参数，等同于 startLine）",
        },
        limit: {
          type: "number",
          description: "读取行数（兼容参数，等同于 maxLines）",
        },
      },
      required: ["projectId", "path"],
    },
  },
  {
    name: "nexus_file_create",
    description: "在受管项目目录内安全创建新文件",
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "项目名称或项目 ID，例如 'Myweb'",
        },
        path: {
          type: "string",
          description: "新文件在项目内的相对路径",
        },
        content: {
          type: "string",
          description: "文件的文本内容",
        },
      },
      required: ["projectId", "path", "content"],
    },
  },
  {
    name: "nexus_file_write",
    description: "重写或更新项目目录内现有文件的内容",
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "项目名称或项目 ID，例如 'Myweb'",
        },
        path: {
          type: "string",
          description: "现有文件在项目内的相对路径",
        },
        content: {
          type: "string",
          description: "新的文本内容",
        },
      },
      required: ["projectId", "path", "content"],
    },
  },
  {
    name: "nexus_git_status",
    description: "查询受管项目的当前 Git 工作区状态（分支、修改状态、未跟踪文件等）",
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "项目名称或项目 ID，例如 'Myweb' 或 'git-p1b-test'",
        },
      },
      required: ["projectId"],
    },
  },
  {
    name: "nexus_runtime_list",
    description: "查询项目中当前激活或已注册的本地持久化运行时服务列表（如 Web 开发服务器、常驻后台服务）",
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "项目名称或项目 ID，例如 'Myweb'",
        },
      },
      required: ["projectId"],
    },
  },
];

export const PROJECT_BUILDER_TOOLS = [
  {
    name: "nexus_project_blueprint_submit",
    description: "向 Nexus Project Builder 提交结构化项目工程蓝图（Project Blueprint）并启动执行。Nexus 自动化执行阶段依赖图、动态 Capability 解析、独立状态验证（Verification First）与防篡改审计记录。",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "项目全局唯一标识，如 'proj_unity_demo'" },
        name: { type: "string", description: "项目名称" },
        goal: { type: "string", description: "项目核心目标" },
        requirements: { type: "array", items: { type: "string" }, description: "需求清单" },
        constraints: { type: "array", items: { type: "string" }, description: "技术与环境约束" },
        providers: { type: "array", items: { type: "string" }, description: "涉及的 Provider，例如 ['unity-gamedev', 'localbridge-core']" },
        capabilities: { type: "array", items: { type: "string" }, description: "使用的 Capability 列表" },
        stages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              goal: { type: "string" },
              provider: { type: "string" },
              dependsOn: { type: "array", items: { type: "string" } },
              actions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    capability: { type: "string" },
                    parameters: { type: "object" },
                    verification: { type: "object" },
                  },
                  required: ["id", "name", "capability", "parameters"],
                },
              },
            },
            required: ["id", "name", "goal", "provider", "actions"],
          },
          description: "项目执行阶段及各阶段内部 Actions",
        },
        executionMode: { type: "string", enum: ["FAST", "DEEP"], default: "DEEP" },
      },
      required: ["name", "goal", "stages"],
    },
  },
  {
    name: "nexus_project_status",
    description: "查询指定 Project Builder 项目的实时运行状态、当前激活 Stage、各阶段完成情况、审计流水与证据节点。",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "项目 ID" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "nexus_project_replan",
    description: "当项目处于 NEEDS_REPLAN 状态时，向 Nexus 提交重规划的剩余阶段定义。已成功 COMMITTED 的阶段将被严格保留，无需从头重跑。",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "项目 ID" },
        replannedStages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              goal: { type: "string" },
              provider: { type: "string" },
              dependsOn: { type: "array", items: { type: "string" } },
              actions: { type: "array", items: { type: "object" } },
            },
            required: ["id", "name", "goal", "provider", "actions"],
          },
          description: "替换失败及后续依赖的新阶段列表",
        },
      },
      required: ["projectId", "replannedStages"],
    },
  },
  {
    name: "nexus_project_artifact_get",
    description: "获取已交付项目的交付物清单、文件 SHA-256 哈希、全量证据树及最终交付证书报告。",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "项目 ID" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "nexus_capability_list",
    description: "列出当前 Nexus Project Builder 体系中所有可供 AI 规划引用的 Capability 意图能力及其所属 Provider 和映射描述。",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string", description: "按 Provider 筛选，如 'unity-gamedev'" },
      },
    },
  },
  {
    name: "mcp_batch_execute",
    description: "执行一组 MCP 工具调用，支持串行 (sequential)、并行 (parallel) 及依赖感知 (dependency) 执行模式，具备完整的执行追踪、部分失败容错与结果汇总。",
    inputSchema: {
      type: "object",
      properties: {
        operations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "操作唯一ID，如 'step1'" },
              toolName: { type: "string", description: "要调用的工具名称" },
              arguments: { type: "object", description: "工具参数" },
              dependsOn: { type: "array", items: { type: "string" }, description: "依赖的前置操作ID列表" },
              timeoutMs: { type: "number", description: "单次操作超时毫秒数" },
            },
            required: ["id", "toolName", "arguments"],
          },
          description: "批量操作清单",
        },
        mode: {
          type: "string",
          enum: ["sequential", "parallel", "dependency"],
          description: "执行模式，默认为 'sequential'",
        },
        continueOnError: {
          type: "boolean",
          description: "遇到单个操作失败时是否继续执行后续无依赖操作，默认为 false",
        },
        timeoutMs: {
          type: "number",
          description: "整个批处理的最大超时毫秒数",
        },
      },
      required: ["operations"],
    },
  },
];

// Pre-built cached tool list for instant responses
export const ALL_EXPOSED_TOOLS = [
  ...LEGACY_NEXUS_TOOLS,
  ...PROJECT_BUILDER_TOOLS,
  ...CANONICAL_TOOL_DEFINITIONS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
];

export interface CanonicalToolManifest {
  toolCount: number;
  sortedToolNames: string[];
  toolNamesHash: string;
  schemaHash: string;
  surfaceVersion: string;
  protocolVersion: string;
  generatedAt: string;
}

/**
 * Computes the Canonical Tool Manifest dynamically from currently registered and exposed tools.
 * NEVER hardcodes tool counts or hashes.
 */
export function getCanonicalToolManifest(): CanonicalToolManifest {
  const sortedToolNames = ALL_EXPOSED_TOOLS.map((t) => t.name).sort();
  const toolNamesHash = crypto.createHash("sha256").update(sortedToolNames.join(",")).digest("hex");

  const schemaPayload = sortedToolNames.map((name) => {
    const tool = ALL_EXPOSED_TOOLS.find((t) => t.name === name);
    return { name, schema: tool?.inputSchema || {} };
  });
  const schemaHash = crypto.createHash("sha256").update(JSON.stringify(schemaPayload)).digest("hex");

  return {
    toolCount: ALL_EXPOSED_TOOLS.length,
    sortedToolNames,
    toolNamesHash,
    schemaHash,
    surfaceVersion: "1.3.1",
    protocolVersion: "2024-11-05",
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Recursively dereferences and sanitizes a JSON Schema for MCP clients (especially OpenAI Function Calling).
 * - Inlines all '#/$defs/...' and '#/definitions/...' references
 * - Detects and breaks cyclic/recursive references (e.g. SerializedMember) by converting them to open objects
 * - Completely strips '$defs' and 'definitions'
 * - Guarantees no stray '$ref' remains in the schema
 * - Ensures valid root object schema
 */
export function dereferenceJsonSchema(schema: any): any {
  if (!schema || typeof schema !== "object") return schema;

  function resolveRef(refStr: string) {
    if (typeof refStr !== "string") return undefined;
    const parts = refStr.replace(/^#\//, "").split("/");
    let cur: any = schema;
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in cur) {
        cur = cur[p];
      } else {
        return undefined;
      }
    }
    return cur;
  }

  function walk(node: any, seenRefs = new Set<string>(), depth = 0): any {
    if (node === null || typeof node !== "object") {
      return node;
    }
    if (depth > 32) {
      if (Array.isArray(node)) return [];
      return { type: "object" };
    }
    if (Array.isArray(node)) {
      return node.map((item) => walk(item, new Set(seenRefs), depth + 1));
    }
    if (node.$ref && typeof node.$ref === "string") {
      const refStr = node.$ref;
      if (seenRefs.has(refStr)) {
        // Recursive cycle detected (e.g. SerializedMember -> SerializedMember)
        // OpenAI Function Calling strictly forbids recursive references. Fallback to generic object.
        return {
          type: "object",
          description: node.description || "Nested object structure",
        };
      }
      const target = resolveRef(refStr);
      if (target) {
        const { $ref, ...rest } = node;
        const nextSeen = new Set(seenRefs);
        nextSeen.add(refStr);
        const resolved = walk(target, nextSeen, depth + 1);
        return {
          ...resolved,
          ...rest,
        };
      } else {
        // Unresolvable ref: fallback to generic object
        return {
          type: "object",
          description: node.description || "Object",
        };
      }
    }
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "$defs" || k === "definitions") {
        continue;
      }
      result[k] = walk(v, seenRefs, depth + 1);
    }
    return result;
  }

  const flattened = walk(schema, new Set(), 0);
  delete flattened.$defs;
  delete flattened.definitions;

  function stripAnyRemainingRefs(obj: any) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        stripAnyRemainingRefs(item);
      }
      return;
    }
    for (const key of Object.keys(obj)) {
      if (key === "$ref") {
        delete obj[key];
        if (!obj.type) obj.type = "object";
      } else if (key === "$defs" || key === "definitions") {
        delete obj[key];
      } else if (typeof obj[key] === "object") {
        stripAnyRemainingRefs(obj[key]);
      }
    }
  }
  stripAnyRemainingRefs(flattened);

  // Guarantee OpenAI Function Calling schema validity for every object node
  function ensureValidSchema(node: any) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) {
        ensureValidSchema(item);
      }
      return;
    }
    // required must be an array of strings
    if (node.required !== undefined) {
      if (!Array.isArray(node.required)) {
        delete node.required;
      } else {
        node.required = node.required.filter((r: any) => typeof r === "string");
        if (node.required.length === 0) {
          delete node.required;
        }
      }
    }
    // properties must be an object
    if (
      node.properties !== undefined &&
      (typeof node.properties !== "object" || Array.isArray(node.properties) || node.properties === null)
    ) {
      node.properties = {};
    }
    for (const val of Object.values(node)) {
      if (typeof val === "object" && val !== null) {
        ensureValidSchema(val);
      }
    }
  }
  ensureValidSchema(flattened);

  if (!flattened.type) {
    flattened.type = "object";
  }
  if (!flattened.properties || typeof flattened.properties !== "object") {
    flattened.properties = {};
  }

  return flattened;
}

export const UNIVERSAL_META_TOOLS = [
  {
    name: "nexus_run_script",
    description: "[状态: 🟢 极致 Token 优化] 【推荐首选 · 零 Token 浪费】执行 Python 或 Node.js 脚本以直接操控受管宿主应用（AutoCAD、Blender、Photoshop、Unity、Playwright、Windows 系统）。内置 'nexus' 统一命名空间 (nexus.cad, nexus.blender, nexus.ps, nexus.unity, nexus.browser, nexus.windows, nexus.core)。对于多步工程任务（如 3D 建模、Unity 关卡搭建、批处理、CAD 绘图、长流程测试），强烈推荐直接编写完整脚本单次执行完毕（单轮即可交付），节省 95%+ 上下文 Token，避免反复单步调用造成上下文爆炸与额度超限。",
    inputSchema: {
      type: "object",
      properties: {
        runtime: {
          type: "string",
          enum: ["python", "node"],
          default: "python",
          description: "执行脚本运行时语言，默认为 python",
        },
        script: {
          type: "string",
          description: "待执行的完整代码脚本（例如: import nexus; info = nexus.cad.drawing_info(); print(info)）",
        },
        timeoutMs: {
          type: "number",
          default: 30000,
          description: "单次脚本超时限制（毫秒），默认 30000ms，超时将触发守护熔断",
        },
      },
      required: ["script"],
    },
  },
  {
    name: "nexus_discover_tools",
    description: "[状态: 🟢 极致 Token 优化] 全局按需检索 Nexus 内置 332 个原生工程工具与当前处于运行状态的外部 MCP 工具。支持中英文意图搜索（如 '打开网页', 'unity', '截图'）。留空查询可查看完整能力大纲看板。检索到目标后，如需多步组合请立即使用 nexus_run_script 批量执行。",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "搜索关键词或意图（如 '打开网页', 'bilibili', 'unity', 'cmd', '截图', '文件'）",
        },
        category: {
          type: "string",
          description: "可选按分类过滤（如 'browser', 'command', 'filesystem', 'computer-use', 'unity-gamedev', 'blender-mcp'）",
        },
        provider: {
          type: "string",
          description: "可选按 Provider 标识过滤（如 'unity-gamedev', 'blender-mcp', 'photoshop-mcp'）",
        },
        detail: {
          type: "boolean",
          default: false,
          description: "是否返回完整参数细节 Schema 与调用示例。默认为 false（启用 Nexus 紧凑工具签名模式以减少 Token 占用），设为 true 可查看完整 Schema",
        },
        limit: {
          type: "number",
          default: 10,
          description: "返回的最大工具匹配数量，默认 10，上限 30",
        },
      },
    },
  },
  {
    name: "nexus_execute_action",
    description: "[状态: 🟢 极致 Token 优化] 【单步原子工具 · 仅限单点查询/微调】动态执行单个底层原子工具。服务端支持工具名自动别名归一、浏览器会话状态自动继承、大文本安全截断与图像 Base64 自动脱敏保存。注意：严禁循环多步调用原子工具进行大批量创作或场景搭建（会导致 Token 极速超限），多步复杂工程务必使用 nexus_run_script 编写脚本批量执行。",
    inputSchema: {
      type: "object",
      properties: {
        tool: {
          type: "string",
          description: "工具真实名称或常见别名（例如 'localbridge_browser_open', 'localbridge_browser_launch', 'gameobject-create-configured'）",
        },
        arguments: {
          type: "object",
          description: "工具参数对象",
          default: {},
        },
        provider: {
          type: "string",
          description: "可选的所属 Provider 标识",
        },
      },
      required: ["tool"],
    },
  },
];

export const CANONICAL_TOOL_MAP = new Map<string, CanonicalToolDefinition>(
  CANONICAL_TOOL_DEFINITIONS.map((t) => [t.name, t])
);

export let lastActiveBrowserSessionId: string | null = null;

export function setLastActiveBrowserSessionId(id: string | null): void {
  lastActiveBrowserSessionId = id;
}

export function normalizeToolName(rawTool: string): string {
  const t = (rawTool || "").trim();
  if (!t) return t;
  if (CANONICAL_TOOL_MAP.has(t)) return t;

  // Dynamic catalog exact match
  const dynamicCatalog = DynamicCatalog.getInstance();
  if (dynamicCatalog.resolveTool(t)) return t;

  // Prefix check
  const withPrefix = `localbridge_${t}`;
  if (CANONICAL_TOOL_MAP.has(withPrefix)) return withPrefix;

  // Hyphen to underscore prefix check
  const withUnderscores = `localbridge_${t.replace(/-/g, "_")}`;
  if (CANONICAL_TOOL_MAP.has(withUnderscores)) return withUnderscores;

  // Underscore to hyphen check for external dynamic tools (e.g. assets_find -> assets-find)
  const withHyphens = t.replace(/_/g, "-");
  if (dynamicCatalog.resolveTool(withHyphens)) return withHyphens;

  // Common synonym mappings
  const synonyms: Record<string, string> = {
    browser_navigate: "localbridge_browser_open",
    "browser-navigate": "localbridge_browser_open",
    navigate: "localbridge_browser_open",
    open_url: "localbridge_browser_open",
    "open-url": "localbridge_browser_open",
    browser_launch: "localbridge_browser_launch",
    launch_browser: "localbridge_browser_launch",
    open_browser: "localbridge_browser_launch",
    browser_open: "localbridge_browser_open",
    browser_close: "localbridge_browser_close",
    browser_list: "localbridge_browser_list",
    browser_click: "localbridge_browser_click",
    browser_type: "localbridge_browser_type",
    browser_screenshot: "localbridge_browser_screenshot",
    command_run: "localbridge_command_run",
    run_command: "localbridge_command_run",
    cmd_run: "localbridge_command_run",
    cmd: "localbridge_command_run",
    exec: "localbridge_command_run",
  };

  const lower = t.toLowerCase();
  if (synonyms[lower]) {
    return synonyms[lower];
  }

  return t;
}

export interface ToolTelemetryEntry {
  timestamp: string;
  tool: string;
  arguments?: any;
  durationMs: number;
  isError: boolean;
  contentChars: number;
  structuredContentChars: number;
  totalChars: number;
  contentBytes: number;
  structuredContentBytes: number;
  totalBytes: number;
}

export function logToolTelemetry(entry: {
  tool: string;
  arguments?: any;
  result: any;
  durationMs: number;
}): void {
  if (process.env.NEXUS_TOKEN_LOG_ENABLED === "false") {
    return;
  }

  try {
    const { tool, arguments: toolArgs, result, durationMs } = entry;
    const isError = Boolean(result?.isError);

    let contentChars = 0;
    let contentBytes = 0;
    if (Array.isArray(result?.content)) {
      for (const item of result.content) {
        if (item && typeof item.text === "string") {
          contentChars += item.text.length;
          contentBytes += Buffer.byteLength(item.text, "utf8");
        }
      }
    }

    let structuredContentChars = 0;
    let structuredContentBytes = 0;
    if (result?.structuredContent !== undefined && result?.structuredContent !== null) {
      const scStr =
        typeof result.structuredContent === "string"
          ? result.structuredContent
          : JSON.stringify(result.structuredContent);
      structuredContentChars = scStr.length;
      structuredContentBytes = Buffer.byteLength(scStr, "utf8");
    }

    const serializedResult = JSON.stringify(result ?? {});
    const totalChars = serializedResult.length;
    const totalBytes = Buffer.byteLength(serializedResult, "utf8");

    const record: ToolTelemetryEntry = {
      timestamp: new Date().toISOString(),
      tool: tool || "unknown",
      arguments: toolArgs,
      durationMs,
      isError,
      contentChars,
      structuredContentChars,
      totalChars,
      contentBytes,
      structuredContentBytes,
      totalBytes,
    };

    const defaultLogDir = process.env.NEXUS_LOG_DIR || process.cwd();
    const logPath =
      process.env.NEXUS_TOKEN_LOG_PATH || path.resolve(defaultLogDir, "nexus-token-telemetry.jsonl");
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify(record) + "\n", "utf8");
  } catch (err) {
    console.error("[Telemetry] Failed to write token log:", err);
  }
}

export class DiskCheckpointStore {
  private static checkpointDir: string = "";

  public static getCheckpointDir(): string {
    if (!this.checkpointDir) {
      const base =
        process.env.LOCALAPPDATA ||
        process.env.APPDATA ||
        path.join(process.env.USERPROFILE || process.env.HOME || os.tmpdir(), ".localbridge");
      this.checkpointDir = path.join(base, "LocalBridge", "checkpoints");
      try {
        fs.mkdirSync(this.checkpointDir, { recursive: true });
      } catch {
        this.checkpointDir = path.join(os.tmpdir(), "nexus-checkpoints");
        try {
          fs.mkdirSync(this.checkpointDir, { recursive: true });
        } catch {}
      }
    }
    return this.checkpointDir;
  }

  public static saveCheckpoint(
    name: string,
    data: any,
    description?: string
  ): { success: boolean; filePath: string; checkpointName: string; sizeBytes: number } {
    const dir = this.getCheckpointDir();
    const cleanName = (name || `cp_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
    const filePath = path.join(dir, `${cleanName}.json`);
    const payload = {
      name: cleanName,
      description: description || "",
      savedAt: new Date().toISOString(),
      timestamp: Date.now(),
      data,
    };
    const jsonStr = JSON.stringify(payload, null, 2);
    fs.writeFileSync(filePath, jsonStr, "utf8");
    return {
      success: true,
      filePath: filePath.replace(/\\/g, "/"),
      checkpointName: cleanName,
      sizeBytes: Buffer.byteLength(jsonStr, "utf8"),
    };
  }

  public static loadCheckpoint(name: string): any {
    const dir = this.getCheckpointDir();
    const cleanName = (name || "").replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
    const filePath = path.join(dir, `${cleanName}.json`);
    if (!fs.existsSync(filePath)) {
      return { error: `Checkpoint "${name}" does not exist on disk at ${filePath.replace(/\\/g, "/")}` };
    }
    try {
      const content = fs.readFileSync(filePath, "utf8");
      return JSON.parse(content);
    } catch (err: any) {
      return { error: `Failed to read checkpoint: ${err?.message || String(err)}` };
    }
  }

  public static listCheckpoints(): any[] {
    const dir = this.getCheckpointDir();
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    const list: any[] = [];
    for (const file of files) {
      try {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        const content = fs.readFileSync(fullPath, "utf8");
        const parsed = JSON.parse(content);
        list.push({
          name: parsed.name || file.replace(".json", ""),
          description: parsed.description || "",
          savedAt: parsed.savedAt || stat.mtime.toISOString(),
          sizeBytes: stat.size,
          filePath: fullPath.replace(/\\/g, "/"),
        });
      } catch {}
    }
    return list;
  }
}

/**
 * Creates and registers all Nexus tools (or Minimal Meta Tools under Token Optimization Mode) into an MCP Server.
 * Supports isolated targetProviderId filtering for dedicated provider endpoints (e.g. /mcp/autocad).
 */
export function createMcpServer(nexusClient: NexusClient, targetProviderId?: string): Server {
  const providerRuntime = ProviderRuntime.getInstance();
  const dynamicCatalog = DynamicCatalog.getInstance();
  const policyManager = McpSecurityPolicyManager.getInstance();
  ProviderRegistry.getInstance().setNexusClient(nexusClient);

  const cleanTargetId = targetProviderId?.trim().toLowerCase();
  const isMasterTokenMode = policyManager.isMasterTokenOptimization();

  // Dynamic Instructions stating token mode status clearly
  let instructionsText = "";
  if (isMasterTokenMode) {
    instructionsText = `
[NEXUS EXECUTION STATUS: 🟢 ULTRA TOKEN OPTIMIZATION MODE ACTIVATED]
- Master Token Optimization: 🟢 ENABLED (Tokens reduced by 95%+, context footprint < 400 Tokens).
- Built-in Host Capabilities (332 Canonical Tools Always Ready on Local Host):
  * Browser Automation  : 🟢 Active (Persistent Chromium/Edge session, tab control, CDP navigation, DOM inspection)
  * System Command Exec : 🟢 Active (Direct PowerShell/Cmd/Bash terminal commands, background runner)
  * Filesystem Control  : 🟢 Active (Protected workspace read/write, code search, AST modification)
  * Computer Use / OCR  : 🟢 Active (Desktop UI mouse/keyboard actions, WinRT OCR visual capture)
  * Document & Worktree : 🟢 Active (Office/PDF generators, Git branch worktree isolation)
- External MCP Provider Status:
  * Unity (:20705)     : ${policyManager.isProviderTokenOptimization("unity-gamedev") ? "🟢 SAVING ON (nexus.unity / discover)" : "⚪ SAVING OFF (Native tools exposed)"}
  * Blender (:9099)    : ${policyManager.isProviderTokenOptimization("blender-mcp") ? "🟢 SAVING ON (nexus.blender / discover)" : "⚪ SAVING OFF (Native tools exposed)"}
  * Photoshop (:9095)  : ${policyManager.isProviderTokenOptimization("photoshop-mcp") ? "🟢 SAVING ON (nexus.ps / discover)" : "⚪ SAVING OFF (Native tools exposed)"}
  * AutoCAD (:9107)    : ${policyManager.isProviderTokenOptimization("autocad") ? "🟢 SAVING ON (nexus.cad / discover)" : "⚪ SAVING OFF (Native tools exposed)"}
  * Playwright (:9100) : ${policyManager.isProviderTokenOptimization("playwright") ? "🟢 SAVING ON (nexus.browser / discover)" : "⚪ SAVING OFF (Native tools exposed)"}
  * Telegram (:9119)   : ${policyManager.isProviderTokenOptimization("telegram-mcp") ? "🟢 SAVING ON (nexus.telegram / discover)" : "⚪ SAVING OFF (Native tools exposed)"}
- Token Efficiency Rules (Strictly Follow to Conserve Context):
  1. Single-Turn Batching (Recommended): For complex or multi-step tasks (Unity scene setup, Blender modeling/rendering, CAD drafting, batch file operations, test automation), NEVER loop atomic tools step-by-step. ALWAYS write a cohesive Python script and invoke via 'nexus_run_script(script=...)'. This delivers full tasks in a single turn and cuts token usage by 95%+.
  2. Targeted Discovery: Call 'nexus_discover_tools(query=...)' with clear intent keywords to get exact tool names and signatures. Avoid redundant or broad discovery queries.
  3. Atomic Invocation (Lightweight Only): Use 'nexus_execute_action(tool=..., arguments=...)' ONLY for single-point status inspection or quick atomic actions. Large payloads (screenshots/logs) are automatically saved to local files and middle-truncated by Nexus Token Guardrail.
`.trim();
  } else {
    instructionsText = `
[NEXUS EXECUTION STATUS: ⚪ FULL TOOLS MODE (LEGACY)]
- Master Token Optimization: ⚪ DISABLED (All native tools exposed directly in tools list).
- Call individual tools directly via standard Model Context Protocol function calling.
`.trim();
  }

  const server = new Server(
    {
      name: cleanTargetId ? `nexus-mcp-bridge [${cleanTargetId}]` : "nexus-mcp-bridge",
      version: "1.3.1",
    },
    {
      capabilities: {
        tools: {
          listChanged: true,
        },
      },
      instructions: instructionsText,
    }
  );

  // 1. tools/list Request Handler
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    // 1.1 Non-blocking background provider healthcheck
    void providerRuntime.initializeDefaultProviders().catch(() => {});

    const isP3Enabled = process.env.NEXUS_TOKEN_P3_ENABLED !== "false";

    const dehydrateSchema = (schema: any) => {
      if (!isP3Enabled || !schema || typeof schema !== "object") return dereferenceJsonSchema(schema);
      const cloned = JSON.parse(JSON.stringify(dereferenceJsonSchema(schema)));
      if (cloned.properties && typeof cloned.properties === "object") {
        for (const [prop, propDef] of Object.entries<any>(cloned.properties)) {
          if (propDef && typeof propDef.description === "string" && propDef.description.length > 80) {
            propDef.description = propDef.description.slice(0, 77) + "...";
          }
        }
      }
      return cloned;
    };

    // Sanitize tools: dereference schemas to satisfy standard MCP schema parser
    const sanitizeTool = (t: any) => ({
      name: t.name,
      description: isP3Enabled && t.description && t.description.length > 200
        ? t.description.slice(0, 197) + "..."
        : t.description,
      inputSchema: dehydrateSchema(t.inputSchema),
      ...(t.annotations ? { annotations: t.annotations } : {}),
    });

    // Dedicated provider mode (e.g. /mcp/autocad, /mcp/photoshop, /mcp/blender)
    if (cleanTargetId) {
      const isProviderSaving = policyManager.isProviderTokenOptimization(cleanTargetId);
      if (isMasterTokenMode && isProviderSaving) {
        return {
          tools: UNIVERSAL_META_TOOLS.map(sanitizeTool),
        };
      }

      const providerTools = dynamicCatalog.getToolsByProvider(cleanTargetId);
      const exposedTools = providerTools.map((t) => sanitizeTool({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        annotations: t.annotations,
      }));
      return {
        tools: exposedTools,
      };
    }

    // Unified Gateway Mode (/mcp)
    // 1.2 Under Master Token Optimization Mode
    if (isMasterTokenMode) {
      const metaTools = UNIVERSAL_META_TOOLS.map(sanitizeTool);

      // Include native tools for any provider where token saving is explicitly turned OFF
      const dynamicTools = dynamicCatalog.listExposedToolsForAi();
      for (const dt of dynamicTools) {
        const resolved = dynamicCatalog.resolveTool(dt.name);
        const provId = resolved?.providerId || "";
        if (provId && !policyManager.isProviderTokenOptimization(provId)) {
          metaTools.push(sanitizeTool(dt));
        }
      }

      const cursorStr = request?.params?.cursor;
      if (!cursorStr) {
        return {
          tools: metaTools,
        };
      }

      const offset = parseInt(cursorStr, 10) || 0;
      const PAGE_SIZE = 100;
      const paged = metaTools.slice(offset, offset + PAGE_SIZE);
      const hasMore = offset + PAGE_SIZE < metaTools.length;
      return {
        tools: paged,
        ...(hasMore ? { nextCursor: String(offset + PAGE_SIZE) } : {}),
      };
    }

    // 1.3 Full Legacy Tools Mode (588+ tools exposed directly)
    const dynamicTools = dynamicCatalog.listExposedToolsForAi();
    const toolMap = new Map<string, any>();
    const isUnityTool = (t: any) => {
      const resolved = dynamicCatalog.resolveTool(t.name);
      return resolved?.providerId === "unity-gamedev";
    };

    const specializedTools = dynamicTools.filter((t) => !isUnityTool(t));
    const unityTools = dynamicTools.filter(isUnityTool);

    for (const t of specializedTools) {
      toolMap.set(t.name, sanitizeTool(t));
    }
    for (const t of unityTools) {
      toolMap.set(t.name, sanitizeTool(t));
    }
    for (const t of ALL_EXPOSED_TOOLS) {
      if (!toolMap.has(t.name)) {
        toolMap.set(t.name, sanitizeTool(t));
      }
    }

    const allTools = Array.from(toolMap.values());
    const cursorStr = request?.params?.cursor;
    if (!cursorStr) {
      return {
        tools: allTools,
      };
    }

    const offset = parseInt(cursorStr, 10) || 0;
    const PAGE_SIZE = 100;
    const pagedTools = allTools.slice(offset, offset + PAGE_SIZE);
    const hasMore = offset + PAGE_SIZE < allTools.length;
    return {
      tools: pagedTools,
      ...(hasMore ? { nextCursor: String(offset + PAGE_SIZE) } : {}),
    };
  });

  // 2. tools/call Request Handler
  const executeCallTool = async (request: any) => {
    const { name, arguments: rawArgs } = request.params;
    const args = (rawArgs && typeof rawArgs === "object" ? { ...rawArgs } : {}) as Record<string, any>;

    try {
      // 2.0.0.1 Universal Meta-Tools Execution
      const isP0Enabled = process.env.NEXUS_TOKEN_P0_ENABLED !== "false";

      if (name === "nexus_run_script") {
        const runner = ScriptRunner.getInstance();
        const execRes = await runner.execute({
          runtime: args.runtime || "python",
          script: args.script || "",
          timeoutMs: args.timeoutMs || 30000,
        });

        let outputText = execRes.stdout || "Script executed successfully with no output.";
        let structuredRes: any = execRes;
        if (!execRes.success) {
          const rawErr = execRes.error || execRes.stderr || "Script execution failed";
          if (isP0Enabled) {
            const errLines = rawErr.trim().split("\n").filter(Boolean);
            const keyError = (errLines[errLines.length - 1] || rawErr).trim();
            outputText = `[Script Execution Error] ${keyError}\nTip: Run nexus_discover_tools(query=...) to inspect valid APIs.`;
            structuredRes = {
              success: false,
              error: keyError,
              stderr: keyError,
              stdout: execRes.stdout || "",
            };
          } else {
            outputText = `[Script Execution Error]\n${rawErr}`;
          }
        }

        return TokenGuardrail.sanitizeToolResult({
          content: [
            {
              type: "text",
              text: outputText,
            },
          ],
          isError: !execRes.success,
          structuredContent: structuredRes,
        }, { sourceTool: "nexus_run_script", full: Boolean(args.full), args });
      }

      // P3 On-Demand Tool Schema Resolution
      if (name === "nexus_get_tool_schema") {
        const rawToolName = String(args.tool || args.name || "").trim();
        const normName = normalizeToolName(rawToolName);
        const canonical = CANONICAL_TOOL_MAP.get(normName) || CANONICAL_TOOL_MAP.get(rawToolName);
        const dynamic = dynamicCatalog.resolveTool(normName) || dynamicCatalog.resolveTool(rawToolName);

        if (!canonical && !dynamic) {
          return {
            content: [{ type: "text", text: `Tool "${rawToolName}" not found.` }],
            isError: true,
          };
        }

        const schema = canonical?.inputSchema || dynamic?.inputSchema || {};
        const desc = canonical?.description || dynamic?.description || "";
        const resObj = {
          tool: canonical?.name || dynamic?.name || normName,
          description: desc,
          inputSchema: schema,
        };

        return {
          content: [{
            type: "text",
            text: JSON.stringify(resObj, null, 2),
          }],
          structuredContent: resObj,
        };
      }

      // P1 Handle-ization Reader Tool
      if (name === "nexus_handle_read") {
        const handleId = String(args.handleId || "").trim();
        const offset = Math.max(0, parseInt(args.offset, 10) || 0);
        const limit = Math.min(100, Math.max(1, parseInt(args.limit, 10) || 20));
        let filter: any = args.filter;
        if (typeof filter === "string") {
          filter = filter.trim();
        }

        const readRes = HandleManager.readHandle(handleId, offset, limit, filter);
        const summaryText = readRes.error
          ? `ERR ${readRes.error}`
          : `[句柄读取成功] 句柄: ${handleId} | 命中 ${readRes.items.length}/${readRes.filteredCount} 项 (总记录: ${readRes.totalCount}, offset: ${readRes.offset}, limit: ${readRes.limit})。详细条目请查阅 structuredContent.items。`;
        return {
          content: [{
            type: "text",
            text: summaryText,
          }],
          isError: Boolean(readRes.error),
          structuredContent: readRes,
        };
      }

      // P2 Disk-Persisted Checkpoint Tools
      if (name === "nexus_checkpoint_save") {
        if (process.env.NEXUS_TOKEN_P2_ENABLED === "false") {
          return { content: [{ type: "text", text: "Checkpoint is disabled by NEXUS_TOKEN_P2_ENABLED" }], isError: true };
        }
        const saveRes = DiskCheckpointStore.saveCheckpoint(args.name, args.data, args.description);
        return {
          content: [{
            type: "text",
            text: `[Checkpoint Saved] 名称: ${saveRes.checkpointName} | 磁盘文件: ${saveRes.filePath} (${saveRes.sizeBytes} 字节)。服务重启后可通过 nexus_checkpoint_load 随时恢复。`,
          }],
          structuredContent: saveRes,
        };
      }

      if (name === "nexus_checkpoint_load") {
        if (process.env.NEXUS_TOKEN_P2_ENABLED === "false") {
          return { content: [{ type: "text", text: "Checkpoint is disabled by NEXUS_TOKEN_P2_ENABLED" }], isError: true };
        }
        const loadRes = DiskCheckpointStore.loadCheckpoint(args.name);
        if (loadRes.error) {
          return {
            content: [{ type: "text", text: `[Checkpoint Load Error] ${loadRes.error}` }],
            isError: true,
            structuredContent: loadRes,
          };
        }
        return {
          content: [{
            type: "text",
            text: JSON.stringify(loadRes, null, 2),
          }],
          structuredContent: loadRes,
        };
      }

      if (name === "nexus_checkpoint_list") {
        if (process.env.NEXUS_TOKEN_P2_ENABLED === "false") {
          return { content: [{ type: "text", text: "Checkpoint is disabled by NEXUS_TOKEN_P2_ENABLED" }], isError: true };
        }
        const listRes = DiskCheckpointStore.listCheckpoints();
        return {
          content: [{
            type: "text",
            text: JSON.stringify(listRes, null, 2),
          }],
          structuredContent: { count: listRes.length, checkpoints: listRes },
        };
      }

      if (name === "nexus_discover_tools") {
        const rawQuery = String(args.query || "").trim();
        const query = rawQuery.toLowerCase();
        const providerFilter = (args.provider || args.category || "").toLowerCase().trim();
        const defaultLimit = isP0Enabled ? 6 : 10;
        const limit = Math.min(30, Math.max(1, args.limit || defaultLimit));

        const INTERNAL_HOST_PARAMS = new Set([
          "taskId",
          "executionId",
          "idempotencyKey",
          "failVerification",
          "requireScreenChange",
          "testScreenHash",
          "testPostScreenHash",
        ]);

        // 1. Collect all candidates:
        // A. Built-in Canonical Tools (332)
        const canonicalCandidates = CANONICAL_TOOL_DEFINITIONS.map((ct) => ({
          name: ct.name,
          category: ct.category || "system",
          providerId: ct.providerId || "builtin",
          source: "内置核心 (Canonical)",
          description: ct.description || "",
          parameters: (ct.inputSchema?.properties ? Object.keys(ct.inputSchema.properties) : []).filter((p) => !INTERNAL_HOST_PARAMS.has(p)),
          required: (ct.inputSchema?.required || []).filter((p) => !INTERNAL_HOST_PARAMS.has(p)),
          inputSchema: ct.inputSchema,
          isExternal: false,
        }));

        // B. External MCP Tools (ONLY currently running/connected providers from dynamicCatalog)
        const allDynamic = dynamicCatalog.listExposedToolsForAi();
        const dynamicCandidates = allDynamic.map((dt) => {
          const res = dynamicCatalog.resolveTool(dt.name);
          const provId = res?.providerId || "external";
          return {
            name: dt.name,
            category: provId,
            providerId: provId,
            source: `外部MCP (${provId})`,
            description: dt.description || "",
            parameters: (dt.inputSchema?.properties ? Object.keys(dt.inputSchema.properties) : []).filter((p) => !INTERNAL_HOST_PARAMS.has(p)),
            required: (dt.inputSchema?.required || []).filter((p: string) => !INTERNAL_HOST_PARAMS.has(p)),
            inputSchema: dt.inputSchema,
            isExternal: true,
          };
        });

        // Combined Active Tool Pool
        const allActiveTools = [...canonicalCandidates, ...dynamicCandidates];

        // 2. Empty Query Handling: return Full Capabilities Overview to save Tokens and guide AI
        if (!query && !providerFilter) {
          const categoryCounts: Record<string, number> = {};
          for (const t of canonicalCandidates) {
            categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
          }
          const dynamicProviders = Array.from(new Set(dynamicCandidates.map((d) => d.providerId)));
          const overview = {
            type: "capabilities_overview",
            message: "当前处于极致 Token 优化模式。已索引全部 332 个内置核心工具与当前处于运行状态的外部 MCP 工具。请使用 query、category 或 provider 进行精准按需检索。",
            totalToolsIndexed: canonicalCandidates.length + dynamicCandidates.length,
            builtinTotal: canonicalCandidates.length,
            domains: {
              "🖥️ 桌面与操作系统 (Native Desktop & OS)": {
                "computer-use": `${categoryCounts["computer-use"] || 47} tools - 原生桌面与键鼠控制、WinRT OCR、UI元素定位与屏幕截图`,
                command: `${categoryCounts.command || 2} tools - 操作系统命令直接执行 (cmd, powershell, bash)`,
                terminal: `${categoryCounts.terminal || 7} tools - 持久化 PTY 终端会话与流式命令执行`,
                process: `${categoryCounts.process || 4} tools - 本地进程管理、运行状态与生命周期监控`,
                port: `${categoryCounts.port || 2} tools - 网络端口探测与占用管理`,
              },
              "🌐 真实浏览器自动化 (Real Browser Automation)": {
                browser: `${categoryCounts.browser || 30} tools - 真实 Chromium (Edge/Chrome) 本地自动化控制 (launch, open, click, type, screenshot 等)`,
              },
              "📁 文件工程与代码仓库 (Filesystem, Code & Git)": {
                filesystem: `${categoryCounts.filesystem || 16} tools - 本地文件读写、检索与工程目录管理`,
                git: `${categoryCounts.git || 9} tools - 本地 Git 版本控制 (status, diff, commit, branch, log)`,
                worktree: `${categoryCounts.worktree || 5} tools - Git Worktree 独立工作区隔离开发`,
                project: `${categoryCounts.project || 2} tools - 工程项目根目录与项目配置管理`,
                code: `${categoryCounts.code || 11} tools - AST 语法树分析与局部代码重构`,
                skills: `${categoryCounts.skills || 10} tools - Nexus 技能中心能力库与拓展插件`,
              },
              "📄 文档处理与多模态 (Documents & Vision)": {
                document: `${categoryCounts.document || 28} tools - Word/PDF/Markdown 文档处理与自动化生成`,
                vision: `${categoryCounts.vision || 14} tools - 本地多模态视觉分析与图元提取`,
              },
              "🤖 智能体协同与规划 (Agent Planning & Runtime)": {
                "agent-task": `${categoryCounts["agent-task"] || 20} tools - 任务编排与子任务流转`,
                "agent-plan": `${categoryCounts["agent-plan"] || 20} tools - 结构化多阶段任务规划`,
                "agent-comm": `${categoryCounts["agent-comm"] || 10} tools - 智能体间消息传递与事件广播`,
                memory: `${categoryCounts.memory || 10} tools - 长短期记忆与上下文持久化`,
                artifacts: `${categoryCounts.artifacts || 9} tools - 产物生成与归档管理`,
                session: `${categoryCounts.session || 7} tools - 会话持久化与状态恢复`,
                jobs: `${categoryCounts.jobs || 7} tools - 后台异步作业监控`,
                trace: `${categoryCounts.trace || 7} tools - 执行链路追踪与故障取证`,
                discovery: `${categoryCounts.discovery || 7} tools - 工具动态发现与元数据自省`,
                events: `${categoryCounts.events || 6} tools - 事件总线发布订阅`,
                runtime: `${categoryCounts.runtime || 6} tools - 运行时环境隔离与配置`,
                checkpoints: `${categoryCounts.checkpoints || 5} tools - 状态快照与回滚点`,
                hygiene: `${categoryCounts.hygiene || 5} tools - 工作区健康巡检与清理`,
                workflow: `${categoryCounts.workflow || 5} tools - 自动化工作流编排`,
                rules: `${categoryCounts.rules || 5} tools - 规则与合规约束`,
                "tool-registry": `${categoryCounts["tool-registry"] || 4} tools - 动态工具注册表`,
                knowledge: `${categoryCounts.knowledge || 3} tools - 本地知识库检索`,
                context: `${categoryCounts.context || 3} tools - 上下文预算管理`,
                environment: `${categoryCounts.environment || 2} tools - 系统环境变量管理`,
                laya: `${categoryCounts.laya || 2} tools - Laya 引擎专属支持`,
                approvals: `${categoryCounts.approvals || 1} tools - 敏感操作审批流`,
                validation: `${categoryCounts.validation || 1} tools - 模式验证与完整性校验`,
              },
            },
            activeExternalMcp: dynamicProviders.length > 0 
              ? dynamicProviders.map((p) => `${p} (${dynamicCandidates.filter((d) => d.providerId === p).length} tools · 🟢 运行中)`)
              : ["(暂无运行中的外部 MCP，未开启的外部工具已被自动过滤)"],
          };
          return {
            content: [{ type: "text", text: JSON.stringify(overview, null, 2) }],
            structuredContent: overview,
          };
        }

        // 3. Synonym / Intent Semantic Mapping
        const SEMANTIC_CONCEPTS = [
          {
            triggers: ["截图", "截屏", "抓屏", "录屏", "屏幕", "快照", "screenshot", "snapshot", "screen capture", "capture screen"],
            englishKeywords: ["screenshot", "snapshot"],
            exactToolHints: ["localbridge_computer_screenshot", "localbridge_computer_screen_snapshot", "localbridge_browser_screenshot", "localbridge_computer_observe"],
            categories: ["computer-use", "browser", "vision"],
          },
          {
            triggers: ["鼠标", "点击", "单击", "双击", "右键", "悬停", "拖拽", "click", "mouse", "hover", "drag", "press"],
            englishKeywords: ["mouse", "click"],
            exactToolHints: ["localbridge_computer_mouse_click", "localbridge_computer_mouse_move", "localbridge_browser_click"],
            categories: ["computer-use", "browser"],
          },
          {
            triggers: ["键盘", "打字", "输入", "按键", "文本输入", "type", "keyboard", "input", "key press", "shortcut"],
            englishKeywords: ["keyboard", "type"],
            exactToolHints: ["localbridge_computer_keyboard_type", "localbridge_computer_keyboard_key", "localbridge_browser_type"],
            categories: ["computer-use", "browser"],
          },
          {
            triggers: ["浏览器", "打开网页", "网页", "上网", "网站", "页面", "url", "browser", "playwright", "chrome", "edge", "web", "html", "navigate", "bilibili", "b站", "百度", "谷歌"],
            englishKeywords: ["browser", "navigate"],
            exactToolHints: ["localbridge_browser_open", "localbridge_browser_launch", "localbridge_browser_click", "localbridge_browser_type", "localbridge_browser_find"],
            categories: ["browser"],
          },
          {
            triggers: ["命令", "终端", "命令行", "脚本", "执行", "控制台", "cmd", "powershell", "bash", "shell", "terminal", "command", "exec", "cli", "run command"],
            englishKeywords: ["command", "terminal", "exec", "shell"],
            exactToolHints: ["localbridge_command_execute", "localbridge_terminal_create", "localbridge_terminal_exec"],
            categories: ["command", "terminal"],
          },
          {
            triggers: ["文件", "读取", "写入", "查看文件", "保存", "创建文件", "删除", "目录", "文件夹", "file", "filesystem", "read file", "write file", "dir", "directory", "folder"],
            englishKeywords: ["file", "directory"],
            exactToolHints: ["localbridge_filesystem_file_read", "localbridge_filesystem_file_write", "localbridge_filesystem_directory_list"],
            categories: ["filesystem"],
          },
          {
            triggers: ["git", "分支", "提交", "暂存", "合并", "版本", "仓库", "commit", "branch", "diff", "checkout", "stash", "worktree", "log"],
            englishKeywords: ["git", "branch", "commit", "diff", "worktree"],
            exactToolHints: ["localbridge_git_status", "localbridge_git_commit", "localbridge_git_branch_list", "localbridge_git_diff"],
            categories: ["git", "worktree"],
          },
          {
            triggers: ["窗口", "激活窗口", "查找窗口", "最小化", "最大化", "置顶", "桌面窗口", "window", "focus window", "list windows", "app window"],
            englishKeywords: ["window"],
            exactToolHints: ["localbridge_computer_window_list", "localbridge_computer_window_focus", "localbridge_computer_window_close"],
            categories: ["computer-use"],
          },
          {
            triggers: ["ocr", "文字识别", "屏幕识图", "识字", "找图", "定位文字", "locate ui", "text recognition"],
            englishKeywords: ["ocr", "locate_ui"],
            exactToolHints: ["localbridge_computer_locate_ui", "localbridge_vision_analyze"],
            categories: ["computer-use", "vision"],
          },
          {
            triggers: ["文档", "word", "pdf", "docx", "表格", "excel", "ppt", "document", "markdown", "生成报告", "写文档"],
            englishKeywords: ["document", "pdf", "word", "markdown"],
            categories: ["document"],
          },
          {
            triggers: ["unity", "游戏", "游戏开发", "gameobject", "scene", "prefab", "transform", "shader", "material"],
            englishKeywords: ["unity", "gameobject"],
            categories: ["unity-gamedev"],
          },
          {
            triggers: ["blender", "建模", "3d", "渲染", "mesh", "cube", "render", "模型"],
            englishKeywords: ["blender"],
            categories: ["blender-mcp"],
          },
          {
            triggers: ["photoshop", "ps", "图层", "切图", "画布", "layer", "canvas", "psd", "修图"],
            englishKeywords: ["photoshop"],
            categories: ["photoshop-mcp"],
          },
          {
            triggers: ["cad", "autocad", "dwg", "dxf", "图纸", "工程制图"],
            englishKeywords: ["autocad", "cad"],
            categories: ["autocad"],
          },
        ];

        const queryTokens = query.split(/[\s,，;；|]+/g).filter(Boolean);
        const matchedConcepts = SEMANTIC_CONCEPTS.filter((c) =>
          c.triggers.some((trig) => query.includes(trig) || queryTokens.includes(trig))
        );

        const conceptExactHints = new Set(matchedConcepts.flatMap((c) => c.exactToolHints || []));
        const conceptCategories = new Set(matchedConcepts.flatMap((c) => c.categories || []));

        // 4. Weighted Precision Scoring Algorithm
        const scored: Array<{ tool: any; score: number }> = [];

        for (const t of allActiveTools) {
          if (providerFilter) {
            const matchesProvider = t.providerId.toLowerCase().includes(providerFilter) ||
                                    t.category.toLowerCase().includes(providerFilter);
            if (!matchesProvider) continue;
          }

          let score = 0;
          let matchedAny = false;
          const nameLower = t.name.toLowerCase();
          const cleanName = nameLower.replace(/^localbridge_/, "");
          const descLower = (t.description || "").toLowerCase();
          const catLower = (t.category || "").toLowerCase();

          if (query) {
            // A. Exact Concept Hint Match (Top Priority)
            if (conceptExactHints.has(t.name)) {
              score += 150;
              matchedAny = true;
            }

            // B. Exact Name Match
            if (cleanName === query || nameLower === query) {
              score += 120;
              matchedAny = true;
            }

            // C. Query Token Match in Tool Name
            for (const tok of queryTokens) {
              if (cleanName.includes(tok) || nameLower.includes(tok)) {
                score += 60;
                matchedAny = true;
              }
            }

            // D. Query Token Match in Description
            for (const tok of queryTokens) {
              if (descLower.includes(tok)) {
                score += 25;
                matchedAny = true;
              }
            }

            // E. Concept English Keywords in Tool Name (restricted to concept categories)
            for (const c of matchedConcepts) {
              if (c.categories && !c.categories.includes(catLower)) continue;
              for (const kw of (c.englishKeywords || [])) {
                if (cleanName.includes(kw)) {
                  score += 40;
                  matchedAny = true;
                }
              }
            }

            // F. Concept Category Match Boost
            if (conceptCategories.has(catLower)) {
              score += 15;
            }

            // G. Parameter Name Match
            if (t.parameters.some((p: string) => queryTokens.some((tok) => p.toLowerCase().includes(tok)))) {
              score += 10;
              matchedAny = true;
            }

            // High frequency core verbs tie-breaker ONLY IF already matched
            if (matchedAny && /(launch|open|run|click|type|find|list|create|exec)/i.test(cleanName)) {
              score += 5;
            }
          } else {
            // Category or provider filter only
            score = 10;
            matchedAny = true;
          }

          if (matchedAny && score > 0) {
            scored.push({ tool: t, score });
          }
        }

        scored.sort((a, b) => b.score - a.score);

        // 5. If no matches found: provide clean, truthful feedback instead of padding garbage tools
        if (scored.length === 0) {
          const externalApps = ["blender", "photoshop", "autocad", "unity", "figma", "godot", "unreal"].filter((app) =>
            query.includes(app) || queryTokens.includes(app)
          );
          const notFoundMsg = externalApps.length > 0
            ? `未检索到匹配的工具。您查询了外部应用 [${externalApps.join(", ")}]，当前宿主端未检测到这些外部 Provider 处于运行状态（未开启的外部工具已自动过滤，避免调用失败）。如需使用，请先在宿主界面【MCP 管理】中启动对应服务。`
            : `未检索到与 "${rawQuery}" 相关的工具。`;

          const emptyResult = {
            totalMatches: 0,
            returnedCount: 0,
            query: rawQuery,
            tools: [],
            message: notFoundMsg,
          };
          return {
            content: [{ type: "text", text: JSON.stringify(emptyResult, null, 2) }],
            structuredContent: emptyResult,
          };
        }

        const topMatches = scored.slice(0, limit).map(({ tool: t }) => {
          const exampleArgs: Record<string, any> = {};
          for (const reqParam of (t.required || [])) {
            if (reqParam === "browserSessionId") {
              exampleArgs[reqParam] = lastActiveBrowserSessionId || "<sessionId 或留空自动继承>";
            } else if (reqParam === "url") {
              exampleArgs[reqParam] = "https://www.bilibili.com";
            } else if (reqParam === "projectId") {
              exampleArgs[reqParam] = "default";
            } else if (reqParam === "command" || reqParam === "cmd") {
              exampleArgs[reqParam] = "dir";
            } else {
              exampleArgs[reqParam] = `<${reqParam}>`;
            }
          }

          return {
            tool: t.name,
            source: t.source,
            category: t.category,
            description: t.description,
            parameters: t.parameters,
            required: t.required,
            callExample: {
              tool: t.name,
              arguments: exampleArgs,
            },
          };
        });

        const isDetail = Boolean(args.detail) || topMatches.length === 1;

        if (!isDetail) {
          // Nexus Compact Tool Summary Mode
          const compactTools = topMatches.map((t) => {
            const reqSet = new Set(t.required || []);
            const paramsFormatted = (t.parameters || []).map((p: string) => reqSet.has(p) ? `${p}*` : p);
            const sig = `${t.tool}(${paramsFormatted.join(", ")})`;
            return `${sig} - ${t.description}`;
          });

          const hasMore = scored.length > topMatches.length;
          const searchResult: Record<string, any> = {
            totalMatches: scored.length,
            returnedCount: topMatches.length,
            hasMore,
            tools: compactTools,
          };
          if (hasMore) {
            searchResult.hasMoreHint = `还有 ${scored.length - topMatches.length} 个相关工具未显示。若需精确筛选可使用 query='具体能力'。`;
          }

          const compactMeta: Record<string, any> = {
            totalMatches: scored.length,
            returnedCount: topMatches.length,
            hasMore,
          };
          if (hasMore) {
            compactMeta.hasMoreHint = searchResult.hasMoreHint;
          }

          return {
            content: [{
              type: "text",
              text: JSON.stringify(searchResult, null, 2),
            }],
            structuredContent: isP0Enabled ? compactMeta : {
              ...searchResult,
              detailedTools: topMatches,
            },
          };
        }

        const searchResult = {
          totalMatches: scored.length,
          returnedCount: topMatches.length,
          tools: topMatches,
        };

        const structuredMeta = {
          totalMatches: scored.length,
          returnedCount: topMatches.length,
          hasMore: scored.length > topMatches.length,
        };

        return {
          content: [{
            type: "text",
            text: JSON.stringify(searchResult, null, 2),
          }],
          structuredContent: isP0Enabled ? structuredMeta : searchResult,
        };
      }

      if (name === "nexus_execute_action") {
        let actionTool = normalizeToolName(String(args.tool || ""));
        let actionArgs: Record<string, any> = {};

        if (typeof args.arguments === "object" && args.arguments !== null) {
          actionArgs = { ...args.arguments };
        } else if (typeof args.arguments === "string") {
          try {
            actionArgs = JSON.parse(args.arguments);
          } catch {
            actionArgs = {};
          }
        }

        // If arguments was passed flat at root level
        if (Object.keys(actionArgs).length === 0) {
          for (const [k, v] of Object.entries(args)) {
            if (k !== "tool" && k !== "arguments" && k !== "provider") {
              actionArgs[k] = v;
            }
          }
        }

        // Dispatch local bridge meta actions directly in-process under nexus_execute_action
        if (actionTool === "nexus_get_tool_schema" || actionTool === "get_tool_schema") {
          return executeCallTool({ params: { name: "nexus_get_tool_schema", arguments: actionArgs } });
        }
        if (actionTool === "nexus_handle_read" || actionTool === "handle_read") {
          return executeCallTool({ params: { name: "nexus_handle_read", arguments: actionArgs } });
        }
        if (actionTool === "nexus_checkpoint_save" || actionTool === "checkpoint_save") {
          return executeCallTool({ params: { name: "nexus_checkpoint_save", arguments: actionArgs } });
        }
        if (actionTool === "nexus_checkpoint_load" || actionTool === "checkpoint_load") {
          return executeCallTool({ params: { name: "nexus_checkpoint_load", arguments: actionArgs } });
        }
        if (actionTool === "nexus_checkpoint_list" || actionTool === "checkpoint_list") {
          return executeCallTool({ params: { name: "nexus_checkpoint_list", arguments: actionArgs } });
        }

        // Auto-inherit browserSessionId if missing or placeholder
        if (actionTool.startsWith("localbridge_browser_") && 
            actionTool !== "localbridge_browser_launch" && 
            actionTool !== "localbridge_browser_list") {
          let currentSid = String(actionArgs.browserSessionId || "").trim();
          if (!currentSid || currentSid.startsWith("<") || currentSid.includes("session")) {
            if (lastActiveBrowserSessionId) {
              actionArgs.browserSessionId = lastActiveBrowserSessionId;
            } else {
              // Try to find an active ready session from core
              try {
                const listRes = await nexusClient.callNexusTool("localbridge_browser_list", {});
                const listData = (listRes as any)?.structuredContent || (listRes?.content?.[0]?.text ? JSON.parse(listRes.content[0].text) : null);
                const ready = listData?.sessions?.find((s: any) => s.status === "ready" || s.status === "active");
                if (ready?.browserSessionId) {
                  lastActiveBrowserSessionId = ready.browserSessionId;
                  actionArgs.browserSessionId = ready.browserSessionId;
                }
              } catch {}
            }
          }
          // If still no session and this is browser open, launch one automatically
          if (!actionArgs.browserSessionId && actionTool === "localbridge_browser_open") {
            try {
              const launchRes = await nexusClient.callNexusTool("localbridge_browser_launch", { headless: false });
              const launchData = (launchRes as any)?.structuredContent || (launchRes?.content?.[0]?.text ? JSON.parse(launchRes.content[0].text) : null);
              const sid = launchData?.browserSessionId || (launchRes?.content?.[0]?.text?.match(/BROWSER-[0-9A-Z]+/i)?.[0]);
              if (sid) {
                lastActiveBrowserSessionId = sid;
                actionArgs.browserSessionId = sid;
              }
            } catch {}
          }
        }

        // Auto-enable saveToArtifact for screenshot/snapshot tools to prevent massive base64 payloads
        if (actionTool.includes("screenshot") || actionTool.includes("snapshot")) {
          actionArgs.saveToArtifact = true;
        }

        const actionProvider = args.provider;

        let dynamicTool = dynamicCatalog.resolveTool(actionTool);
        if (!dynamicTool && actionProvider) {
          dynamicTool = dynamicCatalog.resolveTool(`${actionProvider}::${actionTool}`);
        }
        if (dynamicTool) {
          const execResult = await providerRuntime.executeTool(dynamicTool.qualifiedName, actionArgs);
          const fullOpt = Boolean(actionArgs.full || actionArgs._full || args.full);
          return TokenGuardrail.sanitizeToolResult({
            content: (execResult.content || []) as any,
            isError: execResult.isError,
            structuredContent: execResult,
          }, { sourceTool: actionTool, full: fullOpt, args: actionArgs });
        }

        // 1.5 Try Unity GameDev MCP Provider if applicable
        if (actionProvider === "unity-gamedev" || actionProvider === "unity" || 
            actionTool.startsWith("gameobject-") || actionTool.startsWith("scene-") || 
            actionTool.startsWith("assets-") || actionTool.startsWith("component-") || 
            actionTool.startsWith("console-") || actionTool.startsWith("test-")) {
          const unityProvider = UnityGameDevMcpProvider.getInstance();
          if (unityProvider.isUnityTool(actionTool)) {
            const execResult = await unityProvider.executeTool(actionTool, actionArgs);
            const fullOpt = Boolean(actionArgs.full || actionArgs._full || args.full);
            return TokenGuardrail.sanitizeToolResult({
              content: (execResult.content || []) as any,
              isError: execResult.isError,
              structuredContent: execResult,
            }, { sourceTool: actionTool, full: fullOpt, args: actionArgs });
          }
        }

        let coreRes: any;
        try {
          coreRes = await nexusClient.callNexusTool(actionTool, actionArgs);
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          if (errMsg.includes("MCP_SCOPE_DENIED") || errMsg.includes("403") || errMsg.includes("not recognized") || errMsg.includes("unknown tool")) {
            return {
              content: [
                {
                  type: "text",
                  text: `Nexus Error: Tool '${actionTool}' is not recognized or not authorized under provider '${actionProvider || "core"}'. Tip: Use nexus_discover_tools(query='${actionTool}') or dir(nexus.${actionProvider || "core"}) in nexus_run_script to inspect valid tools.`,
                },
              ],
              isError: true,
            };
          }
          throw err;
        }

        // If open or action failed due to closed session, auto launch and retry once
        if (actionTool.startsWith("localbridge_browser_") && 
            actionTool !== "localbridge_browser_launch" &&
            (coreRes.isError || JSON.stringify(coreRes).includes("is closed"))) {
          try {
            const launchRes = await nexusClient.callNexusTool("localbridge_browser_launch", { headless: false });
            const launchData = (launchRes as any)?.structuredContent || (launchRes?.content?.[0]?.text ? JSON.parse(launchRes.content[0].text) : null);
            const sid = launchData?.browserSessionId || (launchRes?.content?.[0]?.text?.match(/BROWSER-[0-9A-Z]+/i)?.[0]);
            if (sid) {
              lastActiveBrowserSessionId = sid;
              actionArgs.browserSessionId = sid;
              coreRes = await nexusClient.callNexusTool(actionTool, actionArgs);
            }
          } catch {}
        }

        // Auto-capture browserSessionId from result if available
        try {
          if (actionTool === "localbridge_browser_launch") {
            const sid = (coreRes as any)?.structuredContent?.browserSessionId || (coreRes?.content?.[0]?.text?.match(/BROWSER-[0-9A-Z]+/i)?.[0]);
            if (sid) lastActiveBrowserSessionId = sid;
          } else if (actionTool === "localbridge_browser_list") {
            const listData = (coreRes as any)?.structuredContent || (coreRes?.content?.[0]?.text ? JSON.parse(coreRes.content[0].text) : null);
            const ready = listData?.sessions?.find((s: any) => s.status === "ready" || s.status === "active");
            if (ready?.browserSessionId) {
              lastActiveBrowserSessionId = ready.browserSessionId;
            }
          }
        } catch {}

        const fullOpt = Boolean(actionArgs.full || actionArgs._full || args.full);
        return TokenGuardrail.sanitizeToolResult({
          content: (coreRes.content || []) as any,
          isError: coreRes.isError,
          structuredContent: (coreRes as any).structuredContent,
        }, { sourceTool: actionTool, full: fullOpt, args: actionArgs });
      }

      // 2.0.0 Handle Generic MCP Batch Execution
      if (name === "mcp_batch_execute") {
        try {
          const batchRes = await providerRuntime.executeBatch({
            operations: args.operations || [],
            mode: args.mode,
            continueOnError: args.continueOnError,
            timeoutMs: args.timeoutMs,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(batchRes, null, 2) }],
            isError: batchRes.isError,
            structuredContent: batchRes,
          };
        } catch (err: any) {
          return {
            content: [{ type: "text", text: `[Batch Execution Exception] ${err?.message || String(err)}` }],
            isError: true,
          };
        }
      }

      // 2.0 Handle Dynamic External MCP Tools via DynamicCatalog & ProviderRuntime
      let dynamicTool = dynamicCatalog.resolveTool(name);
      if (!dynamicTool) {
        await providerRuntime.refreshAllProviders().catch(() => {});
        dynamicTool = dynamicCatalog.resolveTool(name);
      }
      if (dynamicTool) {
        try {
          const execResult = await providerRuntime.executeTool(dynamicTool.qualifiedName, args, {
            expectedCatalogVersion: args._expectedCatalogVersion,
            expectedInstanceId: args._expectedInstanceId,
          });
          return {
            content: (execResult.content || []) as any,
            isError: execResult.isError,
          };
        } catch (err: any) {
          return {
            content: [{ type: "text", text: `[External MCP Exception] ${err?.message || String(err)}` }],
            isError: true,
          };
        }
      }

      // 2.0.1 Handle Project Builder Tools (PHASE 4)
      if (
        name === "nexus_project_blueprint_submit" ||
        name === "nexus_project_status" ||
        name === "nexus_project_replan" ||
        name === "nexus_project_artifact_get" ||
        name === "nexus_capability_list"
      ) {
        const pb = ProjectBuilderRuntime.getInstance();
        const cap = CapabilityResolver.getInstance();

        if (name === "nexus_project_blueprint_submit") {
          const bp: ProjectBlueprint = {
            projectId: args.projectId || `proj_${Date.now()}`,
            name: args.name || "Untitled Project",
            goal: args.goal || "",
            requirements: args.requirements || [],
            constraints: args.constraints || [],
            providers: args.providers || ["unity-gamedev"],
            capabilities: args.capabilities || [],
            stages: args.stages || [],
            metadata: { executionMode: args.executionMode || "DEEP" },
          };
          const instance = pb.createProject(bp);
          const executionPromise = pb.executeProject(instance.projectId);
          await Promise.race([executionPromise, new Promise((res) => setTimeout(res, 1500))]);

          const current = pb.getProject(instance.projectId) || instance;
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    projectId: current.projectId,
                    status: current.status,
                    currentStageId: current.currentStageId,
                    stages: Array.from(current.stageStates.values()).map((s) => ({
                      id: s.stageId,
                      name: s.name,
                      status: s.status,
                      verdict: s.verificationVerdict,
                    })),
                    ledgerCount: current.ledger.length,
                    replanContext: current.replanContext,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        if (name === "nexus_project_status") {
          const proj = pb.getProject(args.projectId);
          if (!proj) {
            return {
              content: [{ type: "text", text: JSON.stringify({ error: `Project '${args.projectId}' not found` }) }],
              isError: true,
            };
          }
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    projectId: proj.projectId,
                    name: proj.name,
                    status: proj.status,
                    executionMode: proj.executionMode,
                    currentStageId: proj.currentStageId,
                    stages: Array.from(proj.stageStates.values()).map((s) => ({
                      id: s.stageId,
                      name: s.name,
                      status: s.status,
                      verdict: s.verificationVerdict,
                      actionsCount: s.actions.length,
                      completedActionsCount: s.actionResults.filter((a) => a.verificationPassed).length,
                      evidenceId: s.evidenceId,
                      error: s.error,
                    })),
                    replanContext: proj.replanContext,
                    deliveryReport: proj.deliveryReport,
                    ledgerSummary: proj.ledger.slice(-5),
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        if (name === "nexus_project_replan") {
          const updated = await pb.submitReplan(args.projectId, args.replannedStages || []);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    projectId: updated.projectId,
                    status: updated.status,
                    stages: Array.from(updated.stageStates.values()).map((s) => ({
                      id: s.stageId,
                      name: s.name,
                      status: s.status,
                      verdict: s.verificationVerdict,
                    })),
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        if (name === "nexus_project_artifact_get") {
          const proj = pb.getProject(args.projectId);
          if (!proj) {
            return {
              content: [{ type: "text", text: JSON.stringify({ error: `Project '${args.projectId}' not found` }) }],
              isError: true,
            };
          }
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    projectId: proj.projectId,
                    artifacts: proj.artifacts,
                    deliveryReport: proj.deliveryReport,
                    evidenceTree: proj.evidenceTree,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        if (name === "nexus_capability_list") {
          let list = cap.listCapabilities();
          if (args.provider) {
            list = list.filter((c) => c.provider.toLowerCase() === args.provider.toLowerCase());
          }
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ total: list.length, capabilities: list }, null, 2),
              },
            ],
          };
        }
      }

      // 2.1 Handle Legacy 8 Tools
      switch (name) {
        case "nexus_project_list": {
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
        }

        case "nexus_project_info": {
          const project = await nexusClient.resolveProject(args.projectId);
          const downstreamRes = await nexusClient.callNexusTool("localbridge_project_info", {
            projectId: project.id,
          });
          return {
            content: downstreamRes.content as any,
            isError: downstreamRes.isError,
          };
        }

        case "nexus_directory_list": {
          const project = await nexusClient.resolveProject(args.projectId);
          const relPath = args.path || ".";
          if (project.rootPath) {
            const sandbox = validatePathSandbox(project.rootPath, relPath);
            if (!sandbox.valid) {
              return {
                content: [{ type: "text", text: `[Security Error] ${sandbox.error}` }],
                isError: true,
              };
            }
          }
          const downstreamRes = await nexusClient.callNexusTool("localbridge_directory_list", {
            projectId: project.id,
            path: relPath,
          });
          return {
            content: downstreamRes.content as any,
            isError: downstreamRes.isError,
          };
        }

        case "nexus_file_read": {
          const project = await nexusClient.resolveProject(args.projectId);
          const relPath = args.path;
          if (project.rootPath) {
            const sandbox = validatePathSandbox(project.rootPath, relPath);
            if (!sandbox.valid) {
              return {
                content: [{ type: "text", text: `[Security Error] ${sandbox.error}` }],
                isError: true,
              };
            }
          }
          const resolvedStartLine = Math.max(1, args.startLine ?? args.offset ?? 1);
          const resolvedMaxLines = Math.min(500, Math.max(1, args.maxLines ?? args.limit ?? 300));
          const downstreamRes = await nexusClient.callNexusTool("localbridge_file_read", {
            projectId: project.id,
            path: relPath,
            startLine: resolvedStartLine,
            maxLines: resolvedMaxLines,
          });
          return {
            content: downstreamRes.content as any,
            isError: downstreamRes.isError,
          };
        }

        case "nexus_file_create": {
          const project = await nexusClient.resolveProject(args.projectId);
          const relPath = args.path;
          if (project.rootPath) {
            const sandbox = validatePathSandbox(project.rootPath, relPath);
            if (!sandbox.valid) {
              return {
                content: [{ type: "text", text: `[Security Error] ${sandbox.error}` }],
                isError: true,
              };
            }
          }
          const downstreamRes = await nexusClient.callNexusTool("localbridge_file_create", {
            projectId: project.id,
            path: relPath,
            content: args.content,
          });
          return {
            content: downstreamRes.content as any,
            isError: downstreamRes.isError,
          };
        }

        case "nexus_file_write": {
          const project = await nexusClient.resolveProject(args.projectId);
          const relPath = args.path;
          if (project.rootPath) {
            const sandbox = validatePathSandbox(project.rootPath, relPath);
            if (!sandbox.valid) {
              return {
                content: [{ type: "text", text: `[Security Error] ${sandbox.error}` }],
                isError: true,
              };
            }
          }
          const downstreamRes = await nexusClient.callNexusTool("localbridge_file_write", {
            projectId: project.id,
            path: relPath,
            content: args.content,
          });
          return {
            content: downstreamRes.content as any,
            isError: downstreamRes.isError,
          };
        }

        case "nexus_git_status": {
          const project = await nexusClient.resolveProject(args.projectId);
          const downstreamRes = await nexusClient.callNexusTool("localbridge_git_status", {
            projectId: project.id,
          });
          return {
            content: downstreamRes.content as any,
            isError: downstreamRes.isError,
          };
        }

        case "nexus_runtime_list": {
          const project = await nexusClient.resolveProject(args.projectId);
          const downstreamRes = await nexusClient.callNexusTool("localbridge_runtime_list", {
            projectId: project.id,
          });
          return {
            content: downstreamRes.content as any,
            isError: downstreamRes.isError,
          };
        }
      }

      // 2.2 Canonical Nexus Tools (332 tools directly dispatched to Core)
      // Auto-resolve projectId if provided as friendly project name
      if (typeof args.projectId === "string" && !args.projectId.startsWith("proj_") && args.projectId !== "drive-c") {
        try {
          const project = await nexusClient.resolveProject(args.projectId);
          args.projectId = project.id;
        } catch {
          // If project resolution fails, preserve original argument so Core can return standard error
        }
      }

      // Global Unrestricted Execution Mode bypass for Core tools
      const policyManager = McpSecurityPolicyManager.getInstance();
      if (policyManager.isUnrestrictedMode()) {
        if (!args.approvalId) {
          args.approvalId = `app_unrestricted_bypass_${Date.now()}`;
        }
      }

      const downstreamRes = await nexusClient.callNexusTool(name, args);
      return {
        content: (downstreamRes.content || []) as any,
        isError: downstreamRes.isError,
        ...(downstreamRes as any).structuredContent ? { structuredContent: (downstreamRes as any).structuredContent } : {},
      };
    } catch (err: any) {
      let errMsg = err?.message || String(err);
      if (errMsg.includes("MCP_SCOPE_DENIED") || errMsg.includes("no authorized scope mapping")) {
        errMsg = `Tool '${name}' is not recognized or not authorized. Tip: Use nexus_discover_tools() or dir(nexus) in nexus_run_script to inspect available tools.`;
      }
      return {
        content: [
          {
            type: "text",
            text: `Error executing tool "${name}": ${errMsg}`,
          },
        ],
        isError: true,
      };
    }
  };

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const startTime = Date.now();
    let result: any;
    try {
      result = await executeCallTool(request);
    } catch (err: any) {
      result = {
        content: [
          {
            type: "text",
            text: `Error executing tool "${request?.params?.name}": ${err?.message || String(err)}`,
          },
        ],
        isError: true,
      };
    }
    const durationMs = Date.now() - startTime;
    logToolTelemetry({
      tool: request?.params?.name || "unknown",
      arguments: request?.params?.arguments,
      result,
      durationMs,
    });
    return result;
  });

  return server;
}

export interface McpSessionEntry {
  sessionId: string;
  server: Server;
  transport: StreamableHTTPServerTransport;
  createdAt: number;
  lastActive: number;
}

const activeMcpSessions = new Map<string, McpSessionEntry>();

export function getActiveMcpSession(sessionId: string): McpSessionEntry | undefined {
  return activeMcpSessions.get(sessionId);
}

export function hasActiveMcpSession(sessionId: string): boolean {
  return activeMcpSessions.has(sessionId);
}

export function removeActiveMcpSession(sessionId: string): boolean {
  const session = activeMcpSessions.get(sessionId);
  if (session) {
    try {
      session.transport.close().catch(() => {});
      session.server.close().catch(() => {});
    } catch {}
    return activeMcpSessions.delete(sessionId);
  }
  return false;
}

// Periodic cleanup of idle MCP sessions (idle > 2 hours)
const SESSION_EXPIRATION_MS = 2 * 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of activeMcpSessions.entries()) {
    if (now - session.lastActive > SESSION_EXPIRATION_MS) {
      removeActiveMcpSession(id);
    }
  }
}, 60 * 1000).unref();

/**
 * Dispatches an incoming HTTP request following the standard MCP Streamable HTTP session lifecycle.
 * - Handles initialize requests by creating a session, generating Mcp-Session-Id, and returning 200 OK.
 * - Handles subsequent requests by binding to the established session transport.
 * - Falls back to a stateless transport for requests without session management.
 */
export async function handleMcpHttpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: any,
  nexusClient: NexusClient
): Promise<void> {
  // Normalize Accept header to accommodate standard MCP clients (OpenAI oai-tunnel-client, curl, etc.)
  // WebStandardStreamableHTTPServerTransport requires both application/json and text/event-stream
  const currentAccept = req.headers.accept || "";
  if (!currentAccept.includes("text/event-stream") || !currentAccept.includes("application/json")) {
    req.headers.accept = "application/json, text/event-stream";
    if (Array.isArray(req.rawHeaders)) {
      let found = false;
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        if (req.rawHeaders[i].toLowerCase() === "accept") {
          req.rawHeaders[i + 1] = "application/json, text/event-stream";
          found = true;
        }
      }
      if (!found) {
        req.rawHeaders.push("accept", "application/json, text/event-stream");
      }
    }
  }

  // Normalize Content-Type header to application/json if missing or non-standard (e.g. oai-tunnel-client)
  const currentCt = req.headers["content-type"] || "";
  if (!currentCt || !currentCt.toLowerCase().includes("application/json")) {
    req.headers["content-type"] = "application/json";
    if (Array.isArray(req.rawHeaders)) {
      let found = false;
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        if (req.rawHeaders[i].toLowerCase() === "content-type") {
          req.rawHeaders[i + 1] = "application/json";
          found = true;
        }
      }
      if (!found) {
        req.rawHeaders.push("content-type", "application/json");
      }
    }
  }

  // Normalize MCP-Protocol-Version to a supported standard version
  // If missing or non-standard (e.g. 2026-07-28 from Core/tunnel-client), clamp to 2024-11-05
  const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05", "2024-10-07"];
  const incomingProto = (
    req.headers["mcp-protocol-version"] ||
    (req.headers as any)["Mcp-Protocol-Version"]
  ) as string | undefined;

  if (!incomingProto || !SUPPORTED_VERSIONS.includes(incomingProto)) {
    req.headers["mcp-protocol-version"] = "2024-11-05";
    if (Array.isArray(req.rawHeaders)) {
      let found = false;
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        if (req.rawHeaders[i].toLowerCase() === "mcp-protocol-version") {
          req.rawHeaders[i + 1] = "2024-11-05";
          found = true;
        }
      }
      if (!found) {
        req.rawHeaders.push("mcp-protocol-version", "2024-11-05");
      }
    }
  } else {
    req.headers["mcp-protocol-version"] = incomingProto;
  }

  // Check if incoming request is an initialize request
  const isInit =
    body &&
    ((typeof body === "object" && body.method === "initialize") ||
      (Array.isArray(body) && body.some((m: any) => m && m.method === "initialize")));

  // Extract session ID from headers or query parameters
  const headerSessionId = (
    req.headers["mcp-session-id"] ||
    (req.headers as any)["Mcp-Session-Id"] ||
    (req.headers as any)["mcp_session_id"]
  ) as string | undefined;

  let sessionId = headerSessionId;
  if (!sessionId) {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
      sessionId = url.searchParams.get("sessionId") || url.searchParams.get("mcpSessionId") || undefined;
    } catch {}
  }
  // Extract target provider ID if request is routed to a dedicated provider endpoint (e.g. /mcp/autocad or ?provider=autocad)
  let targetProviderId: string | undefined;
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    if (url.pathname.startsWith("/mcp/") && url.pathname !== "/mcp/health") {
      targetProviderId = url.pathname.slice("/mcp/".length).trim().toLowerCase();
    } else if (url.searchParams.get("provider")) {
      targetProviderId = url.searchParams.get("provider")!.trim().toLowerCase();
    }
  } catch {}
  if (!targetProviderId && req.headers["x-mcp-provider"]) {
    targetProviderId = String(req.headers["x-mcp-provider"]).trim().toLowerCase();
  }

  if (isInit) {
    // 1. Initialize Handshake: Generate a fresh Mcp-Session-Id and bind to session store
    const newSessionId = crypto.randomUUID();
    const mcpServer = createMcpServer(nexusClient, targetProviderId);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
      enableJsonResponse: true,
      keepAliveMs: 3000,
    } as any);

    await mcpServer.connect(transport);

    const sessionEntry: McpSessionEntry = {
      sessionId: newSessionId,
      server: mcpServer,
      transport,
      createdAt: Date.now(),
      lastActive: Date.now(),
    };
    activeMcpSessions.set(newSessionId, sessionEntry);

    res.setHeader("Mcp-Session-Id", newSessionId);
    res.setHeader(
      "Access-Control-Expose-Headers",
      "WWW-Authenticate, Link, Mcp-Session-Id, Mcp-Protocol-Version, Content-Type"
    );

    await transport.handleRequest(req, res, body);
    return;
  }

  // 2. Subsequent requests with existing session ID
  if (sessionId && activeMcpSessions.has(sessionId)) {
    const session = activeMcpSessions.get(sessionId)!;
    session.lastActive = Date.now();
    res.setHeader("Mcp-Session-Id", sessionId);
    res.setHeader(
      "Access-Control-Expose-Headers",
      "WWW-Authenticate, Link, Mcp-Session-Id, Mcp-Protocol-Version, Content-Type"
    );

    // If client is opening an SSE stream, ensure immediate flush so proxy/client never hangs
    if (req.method === "GET" && req.headers.accept?.includes("text/event-stream")) {
      const origWriteHead = res.writeHead.bind(res);
      res.writeHead = function (statusCode: any, ...rest: any[]) {
        const ret = origWriteHead(statusCode, ...rest);
        if (typeof (res as any).flushHeaders === "function") {
          try { (res as any).flushHeaders(); } catch {}
        }
        try {
          res.write(": connected\n\n");
        } catch {}
        return ret;
      } as any;
    }

    await session.transport.handleRequest(req, res, body);
    return;
  }

  // 3. Fallback: Stateless MCP Server & Transport (for standalone scripts/tests or stale sessions)
  // Strip stale session ID headers so the stateless transport does not reject them
  if (req.headers["mcp-session-id"]) {
    delete req.headers["mcp-session-id"];
  }
  if ((req.headers as any)["Mcp-Session-Id"]) {
    delete (req.headers as any)["Mcp-Session-Id"];
  }
  if ((req.headers as any)["mcp_session_id"]) {
    delete (req.headers as any)["mcp_session_id"];
  }
  if (Array.isArray(req.rawHeaders)) {
    const filtered: string[] = [];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const k = req.rawHeaders[i].toLowerCase();
      if (k !== "mcp-session-id" && k !== "mcp_session_id") {
        filtered.push(req.rawHeaders[i], req.rawHeaders[i + 1]);
      }
    }
    req.rawHeaders = filtered;
  }

  const mcpServer = createMcpServer(nexusClient, targetProviderId);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    keepAliveMs: 3000,
  } as any);

  const cleanup = () => {
    try {
      transport.close().catch(() => {});
      mcpServer.close().catch(() => {});
    } catch {}
  };

  res.on("finish", cleanup);
  res.on("close", cleanup);

  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, body);
}
