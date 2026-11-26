import type http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
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
import { ProviderRuntime, DynamicCatalog, McpSecurityPolicyManager, ScriptRunner, TokenGuardrail, HandleManager, isBlenderTool, executeBlenderScript, getBlenderSceneInfo, findBlenderExecutable } from "./generic-mcp/index.js";
import { UnityGameDevMcpProvider } from "./unity-gamedev-provider.js";

export { CANONICAL_TOOL_COUNT };

/**
 * Legacy Nexus Tool Definitions (8 tools for backwards compatibility with earlier clients)
 */
export const LEGACY_NEXUS_TOOLS = [
  {
    name: "nexus_project_list",
    description: "List all registered and managed local projects in Nexus LocalBridge with IDs, names, and path configurations.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "nexus_project_info",
    description: "Retrieve detailed configuration and state for a specified project by project name or ID.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "Project name or project ID, e.g. 'Myweb' or 'proj_367f3b4a...'",
        },
      },
      required: ["projectId"],
    },
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "nexus_directory_list",
    description: "List files and subdirectories under a specified directory within a managed project workspace.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "Project name or project ID, e.g. 'Myweb'",
        },
        path: {
          type: "string",
          description: "Relative directory path inside the project, defaults to '.'",
          default: ".",
        },
      },
      required: ["projectId"],
    },
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "nexus_file_read",
    description: "Read full contents or sliced line ranges of a specified text file within a managed project.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "Project name or project ID, e.g. 'Myweb'",
        },
        path: {
          type: "string",
          description: "Relative file path inside the project, e.g. 'src/index.ts' or 'index.html'",
        },
        startLine: {
          type: "number",
          description: "1-indexed starting line number, defaults to 1",
        },
        maxLines: {
          type: "number",
          description: "Maximum line count to read (1-500), defaults to 300",
        },
        offset: {
          type: "number",
          description: "Alias for startLine",
        },
        limit: {
          type: "number",
          description: "Alias for maxLines",
        },
      },
      required: ["projectId", "path"],
    },
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "nexus_file_create",
    description: "Safely create a new file with specified text content within the managed project directory.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "Project name or project ID, e.g. 'Myweb'",
        },
        path: {
          type: "string",
          description: "Relative path of the new file inside the project",
        },
        content: {
          type: "string",
          description: "Text content of the file",
        },
      },
      required: ["projectId", "path", "content"],
    },
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "nexus_file_write",
    description: "Overwrite or update the content of an existing file in the project workspace.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "Project name or project ID, e.g. 'Myweb'",
        },
        path: {
          type: "string",
          description: "Relative path of the existing file inside the project",
        },
        content: {
          type: "string",
          description: "New text content to write",
        },
      },
      required: ["projectId", "path", "content"],
    },
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "nexus_git_status",
    description: "Inspect the current Git workspace status (branch, modified files, untracked changes) of a project.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "Project name or project ID, e.g. 'Myweb' or 'git-p1b-test'",
        },
      },
      required: ["projectId"],
    },
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "nexus_runtime_list",
    description: "List currently active or registered local persistent runtime services (e.g. dev servers, daemon processes).",
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "Project name or project ID, e.g. 'Myweb'",
        },
      },
      required: ["projectId"],
    },
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];

export const PROJECT_BUILDER_TOOLS = [
  {
    name: "nexus_project_blueprint_submit",
    description: "Submit a structured project blueprint to Nexus Project Builder and initiate automated execution with verification-first audit.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Globally unique project identifier, e.g. 'proj_unity_demo'" },
        name: { type: "string", description: "Project name" },
        goal: { type: "string", description: "Core project goal" },
        requirements: { type: "array", items: { type: "string" }, description: "List of requirements" },
        constraints: { type: "array", items: { type: "string" }, description: "Technical and environment constraints" },
        providers: { type: "array", items: { type: "string" }, description: "Required providers, e.g. ['unity-gamedev', 'localbridge-core']" },
        capabilities: { type: "array", items: { type: "string" }, description: "Referenced Capability list" },
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
          description: "Project stages and internal actions",
        },
        executionMode: { type: "string", enum: ["FAST", "DEEP"], default: "DEEP" },
      },
      required: ["name", "goal", "stages"],
    },
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "nexus_project_status",
    description: "Query real-time execution status, active stage, and audit ledger of a Project Builder instance.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project ID" },
      },
      required: ["projectId"],
    },
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "nexus_project_replan",
    description: "Submit replanned remaining stages when a project requires replanning, preserving already committed stages.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project ID" },
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
          description: "List of replanned stages replacing failed or pending ones",
        },
      },
      required: ["projectId", "replannedStages"],
    },
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "nexus_project_artifact_get",
    description: "Retrieve project deliverables, file SHA-256 hashes, evidence trees, and delivery verification reports.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project ID" },
      },
      required: ["projectId"],
    },
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "nexus_capability_list",
    description: "List all available Capability intents, providers, and mappings in the Nexus Project Builder system.",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string", description: "Optional filter by provider name, e.g. 'unity-gamedev'" },
      },
    },
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "mcp_batch_execute",
    description: "Execute a batch of MCP tool calls with sequential, parallel, or dependency-aware scheduling and fault tolerance.",
    inputSchema: {
      type: "object",
      properties: {
        operations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique operation ID, e.g. 'step1'" },
              toolName: { type: "string", description: "Name of the tool to invoke" },
              arguments: { type: "object", description: "Tool arguments object" },
              dependsOn: { type: "array", items: { type: "string" }, description: "Prerequisite operation IDs" },
              timeoutMs: { type: "number", description: "Operation timeout in milliseconds" },
            },
            required: ["id", "toolName", "arguments"],
          },
          description: "List of batch operations",
        },
        mode: {
          type: "string",
          enum: ["sequential", "parallel", "dependency"],
          description: "Execution mode, defaults to 'sequential'",
        },
        continueOnError: {
          type: "boolean",
          description: "Whether to continue remaining independent operations if one fails",
        },
        timeoutMs: {
          type: "number",
          description: "Global batch timeout in milliseconds",
        },
      },
      required: ["operations"],
    },
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
];

export const SESSION_CACHE_AND_DIRECTIVE_TOOLS = [
  {
    name: "nexus_get_active_directives",
    description: "Retrieve active prompt directives and system instructions configured in Nexus for the current session or project. Read-only operation that does not modify any state.",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["system", "project", "user", "tool"],
          description: "Optional category filter (system, project, user, tool)",
        },
        projectId: {
          type: "string",
          description: "Optional project ID filter",
        },
        project_id: {
          type: "string",
          description: "Optional alias for projectId",
        },
      },
    },
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "nexus_session_cache_save",
    description: "Save a cross-account conversation handoff package into Nexus SQLite cache with sensitive token redaction and return a short 8-char handle. Use this before switching AI accounts or starting a new session to preserve full context with minimal tokens.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Descriptive title of the working session or milestone" },
        summary: { type: "string", description: "Structured summary of completed work, key context, and current phase" },
        keyDecisions: { type: "array", items: { type: "string" }, description: "Key architectural, design, or algorithmic decisions made" },
        key_decisions: { type: "array", items: { type: "string" }, description: "Alias for keyDecisions" },
        activeFiles: { type: "array", items: { type: "string" }, description: "Key files modified, inspected, or relevant to the next step" },
        active_files: { type: "array", items: { type: "string" }, description: "Alias for activeFiles" },
        pendingTasks: { type: "array", items: { type: "string" }, description: "Pending next steps or unfinished tasks for the next agent/account" },
        pending_tasks: { type: "array", items: { type: "string" }, description: "Alias for pendingTasks" },
        rawContext: { type: "string", description: "Optional compact dialog excerpts (up to 5000 chars)" },
        raw_context: { type: "string", description: "Alias for rawContext" },
        ttlHours: { type: "number", description: "Expiration time in hours (1-168, default 24)" },
        ttl_hours: { type: "number", description: "Alias for ttlHours" },
      },
      required: ["title", "summary"],
    },
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "nexus_session_cache_load",
    description: "Load a cross-account handoff cache by handle (e.g. nx-a1b2c3d4). Restores task state, decisions, active files, and pending items. By default automatically releases the handle after retrieval to minimize token overhead.",
    inputSchema: {
      type: "object",
      properties: {
        handle: { type: "string", description: "The 8-character handoff handle (e.g. nx-a1b2c3d4)" },
        releaseAfterRead: { type: "boolean", description: "Whether to immediately release/expire the cache after reading" },
        release_after_read: { type: "boolean", description: "Alias for releaseAfterRead" },
      },
      required: ["handle"],
    },
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "nexus_session_cache_list",
    description: "List currently stored cross-account handoff cache handles with metadata (omits raw dialog text to save tokens).",
    inputSchema: {
      type: "object",
      properties: {
        includeExpired: { type: "boolean", description: "Whether to include expired handles in the list (default false)" },
        include_expired: { type: "boolean", description: "Alias for includeExpired" },
      },
    },
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "nexus_session_cache_clear",
    description: "Optional specific handle to clear. If omitted, cleans all expired and released handles.",
    inputSchema: {
      type: "object",
      properties: {
        handle: { type: "string", description: "Optional specific handle to clear" },
      },
    },
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "nexus_session_handoff",
    description: "Save an AI-synthesized, token-compressed session handoff package with verifiable anchors, verified facts vs hypotheses, verification status, and negative knowledge into Nexus SQLite cache. Returns an 8-character handle for instant cross-session resumption.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Descriptive title of the working session or milestone" },
        coreProgress: { type: "array", items: { type: "string" }, description: "Core completed achievements" },
        verifiableAnchors: { type: "object", description: "Verifiable hard anchors (activeFiles, exactSymbolsOrLines, errorOrCodeSnippets, gitCommitOrBranch)" },
        confirmedFacts: { type: "array", items: { type: "string" }, description: "Verified facts" },
        hypotheses: { type: "array", items: { type: "string" }, description: "AI hypotheses or unverified assumptions" },
        verificationStatus: { type: "object", description: "Current verification status (passed, pending)" },
        negativeKnowledge: { type: "array", items: { type: "string" }, description: "Anti-patterns and discarded solutions NOT to repeat" },
        nextSteps: { type: "array", items: { type: "string" }, description: "Prioritized next actionable steps for the next AI agent" },
        summary: { type: "string", description: "Optional overall structured summary markdown" },
        ttlHours: { type: "number", description: "Expiration time in hours (default 24)" },
      },
      required: ["title"],
    },
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];

// Pre-built cached tool list for instant responses
export const ALL_EXPOSED_TOOLS = [
  ...LEGACY_NEXUS_TOOLS,
  ...PROJECT_BUILDER_TOOLS,
  ...SESSION_CACHE_AND_DIRECTIVE_TOOLS,
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
    surfaceVersion: "1.4.0",
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
    description: "Execute Python or Node.js scripts directly controlling managed host applications (AutoCAD, Blender, Photoshop, Unity, Playwright, Windows) via unified 'nexus' namespace with zero token overhead.",
    inputSchema: {
      type: "object",
      properties: {
        runtime: {
          type: "string",
          enum: ["python", "node"],
          default: "python",
          description: "Runtime language for script execution, defaults to python",
        },
        script: {
          type: "string",
          description: "Complete script to execute (e.g. import nexus; info = nexus.cad.drawing_info(); print(info))",
        },
        timeoutMs: {
          type: "number",
          default: 30000,
          description: "Script execution timeout in milliseconds",
        },
      },
      required: ["script"],
    },
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "nexus_discover_tools",
    description: "Search native engineering tools and active external MCP tools using English keywords or natural language.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search keywords (e.g. 'process list', 'browser open', 'screenshot', 'file')",
        },
        category: {
          type: "string",
          description: "Optional category filter (e.g. 'browser', 'command', 'filesystem', 'computer-use', 'unity-gamedev')",
        },
        provider: {
          type: "string",
          description: "Optional provider filter (e.g. 'unity-gamedev', 'blender-mcp')",
        },
        detail: {
          type: "boolean",
          default: false,
          description: "Whether to return full schema details and examples. Defaults to false for token compression",
        },
        limit: {
          type: "number",
          default: 10,
          description: "Maximum number of tools to return (default 10, max 30)",
        },
      },
    },
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "nexus_execute_action",
    description: "Execute an atomic underlying action or tool with automatic aliasing, session inheritance, and data sanitization.",
    inputSchema: {
      type: "object",
      properties: {
        tool: {
          type: "string",
          description: "Exact name of the target atomic tool. Must not be a meta-tool",
        },
        arguments: {
          type: "object",
          description: "Arguments object matching the target tool schema",
          default: {},
        },
        provider: {
          type: "string",
          description: "Optional provider ID",
        },
      },
      required: ["tool"],
    },
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
];

export const EXTENDED_META_TOOLS = [
  {
    name: "nexus_relay_dispatch",
    description: "Dispatch tasks to background browser AI nodes (ChatGPT, DeepSeek) with headless execution and structured markdown return.",
    inputSchema: {
      type: "object",
      properties: {
        instruction: {
          type: "string",
          description: "Task instruction to dispatch to external AI node",
        },
        node_id: {
          type: "string",
          description: "Target AI node identifier (e.g. 'gpt-omni', 'deepseek-reasoner')",
        },
        output_file_path: {
          type: "string",
          description: "Optional destination file to persist structured markdown",
        },
      },
      required: ["instruction"],
    },
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "nexus_batch_execute",
    description: "Execute a sequential pipeline of tool operations in a single round-trip with step variable interpolation.",
    inputSchema: {
      type: "object",
      properties: {
        pipeline: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Step identifier for variable referencing" },
              tool: { type: "string", description: "Tool name to execute" },
              arguments: { type: "object", description: "Arguments object" },
            },
            required: ["tool"],
          },
          description: "Ordered array of tool invocation steps",
        },
        stopOnError: {
          type: "boolean",
          default: true,
          description: "Whether to halt the pipeline immediately if any step returns an error",
        },
        timeoutMs: {
          type: "number",
          default: 60000,
          description: "Overall pipeline execution timeout in milliseconds",
        },
      },
      required: ["pipeline"],
    },
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "nexus_wait_condition",
    description: "Wait on the server side for a specific condition (TCP port open or log file keyword) before continuing.",
    inputSchema: {
      type: "object",
      properties: {
        conditionType: {
          type: "string",
          enum: ["port", "file_match", "process_running"],
          description: "Type of condition to poll for",
        },
        target: {
          type: "string",
          description: "Port number (e.g. '8080'), file path, or process name to monitor",
        },
        expectedMatch: {
          type: "string",
          description: "Keyword or pattern to search for in file_match mode",
        },
        timeoutMs: {
          type: "number",
          default: 15000,
          description: "Maximum polling wait time in milliseconds",
        },
        pollIntervalMs: {
          type: "number",
          default: 1000,
          description: "Interval between polls in milliseconds",
        },
      },
      required: ["conditionType", "target"],
    },
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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

    const defaultLogDir = process.cwd();
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

export function calculateToolScore(
  t: any,
  query: string,
  queryTokens: string[],
  matchedConcepts: any[] = [],
  conceptExactHints: Set<string> = new Set(),
  conceptCategories: Set<string> = new Set()
): { score: number; matchedAny: boolean } {
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

    // D2. Tool Metadata Keywords Match (+80 Boost)
    if (t.keywords && Array.isArray(t.keywords)) {
      for (const kw of t.keywords) {
        const kwLower = String(kw).toLowerCase();
        if (queryTokens.some((tok) => kwLower.includes(tok) || tok.includes(kwLower))) {
          score += 80;
          matchedAny = true;
        }
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
    if (t.parameters && t.parameters.some((p: string) => queryTokens.some((tok) => p.toLowerCase().includes(tok)))) {
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

  return { score, matchedAny };
}

/**
 * Safely extracts a nested property value from an object given a dot-separated path.
 * Supports accessing top-level properties or nested structuredContent properties.
 */
export function getNestedValue(obj: any, pathStr: string): any {
  if (obj == null) return undefined;
  const parts = pathStr.split(".");
  let curr = obj;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (curr == null) return undefined;
    if (part in curr) {
      curr = curr[part];
    } else if (i === 0 && curr.structuredContent && typeof curr.structuredContent === "object" && part in curr.structuredContent) {
      curr = curr.structuredContent[part];
    } else {
      return undefined;
    }
  }
  return curr;
}

/**
 * Deterministically interpolates variables in the format ${stepId.propertyPath} into step arguments.
 * Preserves native object/array types if the entire field is a single variable interpolation.
 */
export function interpolateStepArguments(
  args: any,
  stepOutputs: Record<string, any>,
  currentStepId: string,
  stopOnError: boolean
): any {
  if (typeof args === "string") {
    // Exact single variable match e.g. "${step1.content}"
    const exactMatch = args.match(/^\$\{([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_.-]+)\}$/);
    if (exactMatch) {
      const refStepId = exactMatch[1];
      const refPath = exactMatch[2];
      const stepOut = stepOutputs[refStepId];
      if (!stepOut) {
        if (stopOnError) {
          const avail = Object.keys(stepOutputs).join(", ") || "(none)";
          throw new Error(`[Batch Interpolation Error] Step '${currentStepId}' references unknown step '${refStepId}'. Available steps: ${avail}`);
        }
        return args;
      }
      const resolved = getNestedValue(stepOut, refPath);
      if (resolved === undefined) {
        if (stopOnError) {
          const availKeys = Object.keys(stepOut);
          throw new Error(`[Batch Interpolation Error] Step '${currentStepId}' property '${refPath}' in step '${refStepId}' is undefined. Available step keys: ${availKeys.join(", ")}`);
        }
        return args;
      }
      return resolved;
    }

    // Substring interpolation e.g. "echo ${step1.output}"
    const varRegex = /\$\{([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_.-]+)\}/g;
    return args.replace(varRegex, (match, refStepId, refPath) => {
      const stepOut = stepOutputs[refStepId];
      if (!stepOut) {
        if (stopOnError) {
          const avail = Object.keys(stepOutputs).join(", ") || "(none)";
          throw new Error(`[Batch Interpolation Error] Step '${currentStepId}' references unknown step '${refStepId}'. Available steps: ${avail}`);
        }
        return match;
      }
      const resolved = getNestedValue(stepOut, refPath);
      if (resolved === undefined) {
        if (stopOnError) {
          throw new Error(`[Batch Interpolation Error] Step '${currentStepId}' property '${refPath}' in step '${refStepId}' is undefined.`);
        }
        return match;
      }
      if (typeof resolved === "object" && resolved !== null) {
        return JSON.stringify(resolved);
      }
      return String(resolved);
    });
  }

  if (Array.isArray(args)) {
    return args.map((item) => interpolateStepArguments(item, stepOutputs, currentStepId, stopOnError));
  }

  if (typeof args === "object" && args !== null) {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(args)) {
      res[k] = interpolateStepArguments(v, stepOutputs, currentStepId, stopOnError);
    }
    return res;
  }

  return args;
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
- Token Efficiency & Safety Rules (Strictly Follow):
  1. Single-Turn Batching (Recommended): For complex or multi-step tasks (Unity scene setup, Blender modeling/rendering, CAD drafting, batch file operations, test automation), NEVER loop atomic tools step-by-step. ALWAYS write a cohesive Python script and invoke via 'nexus_run_script(script=...)'. This delivers full tasks in a single turn and cuts token usage by 95%+.
  2. Targeted Discovery: Call 'nexus_discover_tools(query=...)' with clear intent keywords to get exact tool names and signatures. Avoid redundant or broad discovery queries.
  3. Strict Atomic Action Protocol (nexus_execute_action Golden Rules):
     Rule 1: Atomic Tools Only. NEVER forward top-level meta-tools (discover_tools, run_script, batch_execute, parallel_fanout, etc.) through execute_action; call them directly.
     Rule 2: Exact Tool Names. Never guess aliases. Discover first if unsure.
     Rule 3: Strict Schema Compliance. Never invent parameters or wrapper keys.
     Rule 4: Explicit User Consent Required for: Vault/credentials, wiretaps/sniffing, process inspection, external AI relay, event traps, and destructive/modifying file writes.
     Rule 5: Transparent Raw Errors. Report failure verbatim; do NOT switch tools silently.
     Rule 6: Zero Credential Leakage. Never read, echo, or extrapolate keys, tokens, or auth headers.
     Rule 7: Unreliable Result Warning. When encountering empty/abnormal responses, explicitly warn the user that results may be unreliable.
     Rule 8: Two-Line Handoff Contract. After each action, provide a 1-2 sentence execution summary and explicitly state verification status.
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
      version: "1.4.0",
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

    const isP3Enabled =
      process.env.NEXUS_TOKEN_P3_ENABLED !== "false" &&
      process.env.NEXUS_SCHEMA_SLIM_ENABLED !== "false";

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

    // Sanitize tools: dereference schemas to satisfy OpenAI / Claude schema parser
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

  async function dispatchBlenderTool(toolName: string, toolArgs: any): Promise<any> {
    const t = toolName.toLowerCase().replace(/^localbridge_/, "").replace(/^nexus_/, "");
    const args = toolArgs || {};

    if (t === "get_scene_info" || t === "scene_info") {
      const sceneRes = await getBlenderSceneInfo();
      const text = typeof sceneRes.scene === "string" ? sceneRes.scene : JSON.stringify(sceneRes.scene, null, 2);
      return {
        content: [{ type: "text", text: `[Blender Scene Info (${sceneRes.mode})]
${text}` }],
        isError: sceneRes.isError,
        structuredContent: {
          success: !sceneRes.isError,
          mode: sceneRes.mode,
          scene: sceneRes.scene,
        },
      };
    }

    const code = args.code || args.script || args.python || args.command || "";
    const blenderPort = Number(process.env.BLENDER_PORT || 9876) || 9876;
    const execRes = await executeBlenderScript(code, blenderPort);
    const resultText = execRes.output || "Executed";

    return {
      content: [{ type: "text", text: `[Blender 3D Execution (${execRes.mode})]\n${resultText}` }],
      isError: execRes.isError,
      structuredContent: {
        success: !execRes.isError,
        mode: execRes.mode,
        output: execRes.output,
      },
    };
  }

  function normalizeCanonicalToolName(rawName: string): string {
    const clean = rawName.toLowerCase().trim();
    const aliasMap: Record<string, string> = {
      "process_list": "localbridge_process_list",
      "ps": "localbridge_process_list",
      "port_kill": "localbridge_port_kill",
      "kill_process": "localbridge_process_kill",
      "process_kill": "localbridge_process_kill",
      "screenshot": "localbridge_computer_screen_snapshot",
      "screen_capture": "localbridge_computer_screen_snapshot",
      "clipboard_read": "localbridge_clipboard_read",
      "clipboard_write": "localbridge_clipboard_write",
      "system_info": "localbridge_system_info",
    };
    return aliasMap[clean] || rawName;
  }

  // 2. tools/call Request Handler
  const executeCallTool = async (request: any) => {
    let { name } = request.params;
    const { arguments: rawArgs } = request.params;
    const args = (rawArgs && typeof rawArgs === "object" ? { ...rawArgs } : {}) as Record<string, any>;

    // 0. Dispatch Blender 3D tools directly (dual-mode: socket + headless fallback)
    if (isBlenderTool(name)) {
      return await dispatchBlenderTool(name, args);
    }

    // 0.2 Dispatch Unity GameDev tools directly
    const unityProvider = UnityGameDevMcpProvider.getInstance();
    if (unityProvider.isUnityTool(name)) {
      const execResult = await unityProvider.executeTool(name, args);
      return {
        content: (execResult.content || []) as any,
        isError: execResult.isError,
        structuredContent: execResult,
      };
    }

    // 0.3 Normalize canonical un-prefixed tool names
    name = normalizeCanonicalToolName(name);

    try {
      const isP0Enabled =
        process.env.NEXUS_TOKEN_P0_ENABLED !== "false" &&
        process.env.NEXUS_TOKEN_SLIM_ENABLED !== "false";

      // 1.0 Multi-Model Relay Meta-Tool
      if (name === "nexus_relay_dispatch" || name === "relay_dispatch") {
        if (args.discover_nodes) {
          const downstreamRes = await nexusClient.callNexusTool("localbridge_relay_discover_nodes", {
            refresh: true,
          });
          return downstreamRes;
        }

        const downstreamRes = await nexusClient.callNexusTool("localbridge_relay_dispatch_task", {
          node_id: args.node_id || "auto",
          instruction: args.instruction || "",
          action: args.action || (args.new_chat ? "new_chat" : args.delete_current_chat ? "delete_chat" : "chat"),
          new_chat: Boolean(args.new_chat),
          delete_current_chat: Boolean(args.delete_current_chat),
          context: args.context,
          timeout_seconds: args.timeout_seconds || 120,
          output_file_path: args.output_file_path,
        });

        // Thinking chain removal safeguard (strips any <think> tags before returning to Claude)
        if (downstreamRes?.content && Array.isArray(downstreamRes.content)) {
          for (const item of downstreamRes.content) {
            if (item && typeof item.text === "string") {
              item.text = item.text
                .replace(/<think>[\s\S]*?<\/think>/gi, "")
                .replace(/\[thinking\][\s\S]*?\[\/thinking\]/gi, "")
                .replace(/:::thinking[\s\S]*?:::/gi, "")
                .trim();
            }
          }
        }
        return downstreamRes;
      }

      // 1.0.1 Declarative Batch Execution Meta-Tool
      if (name === "nexus_batch_execute" || name === "batch_execute") {
        const rawPipeline = args.pipeline;
        if (!Array.isArray(rawPipeline) || rawPipeline.length === 0) {
          return {
            content: [{
              type: "text",
              text: "ERR invalid_arguments: 'pipeline' must be a non-empty array of execution steps.",
            }],
            isError: true,
            structuredContent: {
              success: false,
              error: "'pipeline' must be a non-empty array of execution steps.",
            },
          };
        }

        const stopOnError = args.stop_on_error !== false; // default true
        const timeoutSeconds = Math.min(Math.max(Number(args.timeout_seconds) || 120, 1), 300);
        const startTime = Date.now();
        const deadline = startTime + timeoutSeconds * 1000;

        const stepResults: Array<{
          id: string;
          tool: string;
          status: "success" | "error" | "skipped" | "timeout";
          durationMs: number;
          output?: any;
          error?: string;
        }> = [];

        const stepOutputs: Record<string, any> = {};
        let pipelineFailed = false;
        let failedStepId: string | null = null;

        for (let i = 0; i < rawPipeline.length; i++) {
          const step = rawPipeline[i];
          const stepId = String(step?.id || `step_${i + 1}`).trim();
          const stepTool = String(step?.tool || "").trim();

          if (pipelineFailed && stopOnError) {
            stepResults.push({
              id: stepId,
              tool: stepTool,
              status: "skipped",
              durationMs: 0,
            });
            continue;
          }

          if (Date.now() >= deadline) {
            pipelineFailed = true;
            failedStepId = stepId;
            stepResults.push({
              id: stepId,
              tool: stepTool,
              status: "timeout",
              durationMs: 0,
              error: `Pipeline timed out after ${timeoutSeconds}s before executing step '${stepId}'.`,
            });
            continue;
          }

          if (!stepTool) {
            pipelineFailed = true;
            failedStepId = stepId;
            stepResults.push({
              id: stepId,
              tool: stepTool,
              status: "error",
              durationMs: 0,
              error: `Step '${stepId}' is missing required 'tool' property.`,
            });
            if (stopOnError) continue;
          }

          if (stepTool === "nexus_batch_execute" || stepTool === "batch_execute") {
            pipelineFailed = true;
            failedStepId = stepId;
            stepResults.push({
              id: stepId,
              tool: stepTool,
              status: "error",
              durationMs: 0,
              error: `Nested batch execution in step '${stepId}' is disallowed.`,
            });
            if (stopOnError) continue;
          }

          // Strict deterministic variable interpolation
          let resolvedArgs: Record<string, any> = {};
          let interpError: string | null = null;
          try {
            resolvedArgs = interpolateStepArguments(step.arguments || {}, stepOutputs, stepId, stopOnError);
          } catch (err: any) {
            interpError = err?.message || String(err);
          }

          if (interpError) {
            pipelineFailed = true;
            failedStepId = stepId;
            stepResults.push({
              id: stepId,
              tool: stepTool,
              status: "error",
              durationMs: 0,
              error: interpError,
            });
            if (stopOnError) continue;
          }

          // Execute step strictly through nexus_execute_action to ensure 100% security and audit parity!
          const stepStart = Date.now();
          let stepExecRes: any;
          try {
            stepExecRes = await executeCallTool({
              params: {
                name: "nexus_execute_action",
                arguments: {
                  tool: stepTool,
                  arguments: resolvedArgs,
                  provider: step.provider,
                  _internal: true,
                },
              },
            });
          } catch (callErr: any) {
            stepExecRes = {
              content: [{ type: "text", text: `[Step Execution Exception] ${callErr?.message || String(callErr)}` }],
              isError: true,
            };
          }
          const stepDurationMs = Date.now() - stepStart;

          const isStepError = Boolean(stepExecRes?.isError);
          const stepText = (stepExecRes?.content || [])
            .map((c: any) => c.text || "")
            .filter(Boolean)
            .join("\n");

          // Register output for subsequent step variable references
          const extractedOutput: Record<string, any> = {
            content: stepExecRes?.content,
            text: stepText,
            isError: isStepError,
            success: !isStepError,
            ...(typeof stepExecRes?.structuredContent === "object" && stepExecRes?.structuredContent !== null
              ? stepExecRes.structuredContent
              : {}),
            structuredContent: stepExecRes?.structuredContent,
          };
          stepOutputs[stepId] = extractedOutput;

          if (isStepError) {
            pipelineFailed = true;
            if (!failedStepId) failedStepId = stepId;
            stepResults.push({
              id: stepId,
              tool: stepTool,
              status: "error",
              durationMs: stepDurationMs,
              output: stepExecRes?.structuredContent || stepText.slice(0, 500),
              error: stepText || "Step returned an error",
            });
          } else {
            stepResults.push({
              id: stepId,
              tool: stepTool,
              status: "success",
              durationMs: stepDurationMs,
              output: stepExecRes?.structuredContent || stepText,
            });
          }
        }

        const totalDurationMs = Date.now() - startTime;
        const succeededCount = stepResults.filter((s) => s.status === "success").length;
        const failedCount = stepResults.filter((s) => s.status === "error" || s.status === "timeout").length;
        const skippedCount = stepResults.filter((s) => s.status === "skipped").length;

        const summaryHeader = pipelineFailed
          ? `❌ [nexus_batch_execute] 流水线执行失败 (在步骤 '${failedStepId}' 熔断中断)`
          : `✅ [nexus_batch_execute] 流水线全部 ${succeededCount} 个步骤顺序执行完毕`;

        const stepSummaries = stepResults.map((s, idx) => {
          const icon = s.status === "success" ? "✓" : s.status === "skipped" ? "○" : "✗";
          const desc = s.status === "skipped"
            ? `[SKIPPED] ${s.id} (${s.tool})`
            : s.status === "success"
            ? `[成功 ${s.durationMs}ms] ${s.id} (${s.tool})`
            : `[失败 ${s.durationMs}ms] ${s.id} (${s.tool}) -> ${s.error || "error"}`;
          return `${idx + 1}. ${icon} ${desc}`;
        }).join("\n");

        return {
          content: [{
            type: "text",
            text: `${summaryHeader}\nDuration: ${totalDurationMs}ms (Success: ${succeededCount}, Failed: ${failedCount}, Skipped: ${skippedCount})\n\nExecution Trace:\n${stepSummaries}\n\nDetailed step results available in structuredContent.`,
          }],
          isError: pipelineFailed,
          structuredContent: {
            success: !pipelineFailed,
            totalSteps: rawPipeline.length,
            succeededSteps: succeededCount,
            failedSteps: failedCount,
            skippedSteps: skippedCount,
            totalDurationMs,
            steps: stepResults,
          },
        };
      }

      // 1.0.2 Server-Side Asynchronous Wait Condition Meta-Tool
      if (name === "nexus_wait_condition" || name === "wait_condition") {
        const conditionType = String(args.condition_type || "").trim();
        const rawTarget = String(args.target || "").trim();
        const expectedPattern = typeof args.expected_pattern === "string" ? args.expected_pattern : "";
        const timeoutSeconds = Math.min(Math.max(Number(args.timeout_seconds) || 60, 1), 300);
        const pollIntervalMs = Math.min(Math.max(Number(args.poll_interval_ms) || 500, 100), 5000);

        if (!conditionType || (conditionType !== "port_open" && conditionType !== "log_contains")) {
          return {
            content: [{
              type: "text",
              text: "ERR invalid_arguments: 'condition_type' must be either 'port_open' or 'log_contains'.",
            }],
            isError: true,
            structuredContent: {
              success: false,
              error: "'condition_type' must be either 'port_open' or 'log_contains'.",
            },
          };
        }

        if (!rawTarget) {
          return {
            content: [{
              type: "text",
              text: "ERR invalid_arguments: 'target' is required (e.g. '127.0.0.1:3000' for port_open, or file path for log_contains).",
            }],
            isError: true,
            structuredContent: {
              success: false,
              error: "'target' is required.",
            },
          };
        }

        const startTime = Date.now();
        const deadline = startTime + timeoutSeconds * 1000;

        // Condition A: port_open
        if (conditionType === "port_open") {
          let host = "127.0.0.1";
          let port: number;

          if (rawTarget.includes(":")) {
            const parts = rawTarget.split(":");
            host = parts[0].trim() || "127.0.0.1";
            if (host === "localhost") host = "127.0.0.1";
            port = parseInt(parts[1], 10);
          } else {
            port = parseInt(rawTarget, 10);
          }

          if (isNaN(port) || port <= 0 || port > 65535) {
            return {
              content: [{
                type: "text",
                text: `ERR invalid_arguments: Invalid port number in target '${rawTarget}'. Must be between 1 and 65535.`,
              }],
              isError: true,
              structuredContent: {
                success: false,
                error: `Invalid port number in target '${rawTarget}'.`,
              },
            };
          }

          const probeTcpPort = (targetHost: string, targetPort: number): Promise<boolean> => {
            return new Promise((resolve) => {
              const socket = new net.Socket();
              let resolved = false;
              const cleanup = (success: boolean) => {
                if (!resolved) {
                  resolved = true;
                  socket.destroy();
                  resolve(success);
                }
              };
              socket.setTimeout(800);
              socket.on("connect", () => cleanup(true));
              socket.on("timeout", () => cleanup(false));
              socket.on("error", () => cleanup(false));
              socket.connect(targetPort, targetHost);
            });
          };

          while (Date.now() < deadline) {
            const isOpen = await probeTcpPort(host, port);
            if (isOpen) {
              const elapsedMs = Date.now() - startTime;
              return {
                content: [{
                  type: "text",
                  text: `✅ [Condition Satisfied] TCP port ${host}:${port} is ready and accepting connections (elapsed: ${elapsedMs}ms).`,
                }],
                structuredContent: {
                  satisfied: true,
                  condition_type: "port_open",
                  target: `${host}:${port}`,
                  elapsedMs,
                  timeout_seconds: timeoutSeconds,
                },
              };
            }

            const remaining = deadline - Date.now();
            if (remaining <= 0) break;
            await new Promise((r) => setTimeout(r, Math.min(pollIntervalMs, remaining)));
          }

          const elapsedMs = Date.now() - startTime;
          return {
            content: [{
              type: "text",
              text: `⏱️ [Condition Timeout] TCP port ${host}:${port} was not opened within ${timeoutSeconds}s.`,
            }],
            isError: true,
            structuredContent: {
              satisfied: false,
              condition_type: "port_open",
              target: `${host}:${port}`,
              elapsedMs,
              timeout_seconds: timeoutSeconds,
              error: `Timed out waiting for port ${host}:${port} to open after ${timeoutSeconds}s`,
            },
          };
        }

        // Condition B: log_contains
        if (conditionType === "log_contains") {
          if (!expectedPattern) {
            return {
              content: [{
                type: "text",
                text: "ERR invalid_arguments: 'expected_pattern' is required when condition_type is 'log_contains'.",
              }],
              isError: true,
              structuredContent: {
                success: false,
                error: "'expected_pattern' is required for log_contains.",
              },
            };
          }

          const targetFilePath = path.isAbsolute(rawTarget)
            ? rawTarget
            : path.resolve(process.cwd(), rawTarget);

          let regexPattern: RegExp | null = null;
          if (expectedPattern.startsWith("/") && expectedPattern.lastIndexOf("/") > 0) {
            try {
              const lastSlash = expectedPattern.lastIndexOf("/");
              const patternStr = expectedPattern.slice(1, lastSlash);
              const flags = expectedPattern.slice(lastSlash + 1);
              regexPattern = new RegExp(patternStr, flags);
            } catch {
              regexPattern = null;
            }
          }

          while (Date.now() < deadline) {
            if (fs.existsSync(targetFilePath)) {
              try {
                const stat = fs.statSync(targetFilePath);
                let content = "";
                if (stat.size > 2 * 1024 * 1024) {
                  const fd = fs.openSync(targetFilePath, "r");
                  const buf = Buffer.alloc(2 * 1024 * 1024);
                  fs.readSync(fd, buf, 0, buf.length, stat.size - buf.length);
                  fs.closeSync(fd);
                  content = buf.toString("utf-8");
                } else {
                  content = fs.readFileSync(targetFilePath, "utf-8");
                }

                let matched = false;
                let matchedSnippet = "";

                if (regexPattern) {
                  const m = content.match(regexPattern);
                  if (m) {
                    matched = true;
                    matchedSnippet = m[0];
                  }
                } else if (content.includes(expectedPattern)) {
                  matched = true;
                  const lines = content.split("\n");
                  const matchLine = lines.find((l) => l.includes(expectedPattern));
                  matchedSnippet = (matchLine || expectedPattern).trim();
                }

                if (matched) {
                  const elapsedMs = Date.now() - startTime;
                  return {
                    content: [{
                      type: "text",
                      text: `✅ [Condition Satisfied] Log file [${path.basename(targetFilePath)}] matched expected content (elapsed: ${elapsedMs}ms):\n>> ${matchedSnippet.slice(0, 300)}`,
                    }],
                    structuredContent: {
                      satisfied: true,
                      condition_type: "log_contains",
                      target: targetFilePath,
                      matchedSnippet: matchedSnippet.slice(0, 1000),
                      elapsedMs,
                      timeout_seconds: timeoutSeconds,
                    },
                  };
                }
              } catch {
                // File might be briefly locked during writes; continue polling
              }
            }

            const remaining = deadline - Date.now();
            if (remaining <= 0) break;
            await new Promise((r) => setTimeout(r, Math.min(pollIntervalMs, remaining)));
          }

          const elapsedMs = Date.now() - startTime;
          return {
            content: [{
              type: "text",
              text: `⏱️ [Condition Timeout] Log file [${path.basename(targetFilePath)}] did not match pattern '${expectedPattern}' within ${timeoutSeconds}s.`,
            }],
            isError: true,
            structuredContent: {
              satisfied: false,
              condition_type: "log_contains",
              target: targetFilePath,
              expected_pattern: expectedPattern,
              elapsedMs,
              timeout_seconds: timeoutSeconds,
              error: `Timed out waiting for pattern in file after ${timeoutSeconds}s`,
            },
          };
        }
      }

      if (name === "nexus_run_script") {
        const isRunScriptEnabled = process.env.NEXUS_RUN_SCRIPT_ENABLED !== "false";
        if (!isRunScriptEnabled) {
          return {
            content: [{
              type: "text",
              text: "ERR script_disabled: nexus_run_script is disabled via environment variable (NEXUS_RUN_SCRIPT_ENABLED=false). For single-step actions, please use nexus_execute_action(tool='<tool_name>', arguments={...})",
            }],
            isError: true,
            structuredContent: {
              success: false,
              error: "nexus_run_script is disabled by configuration (NEXUS_RUN_SCRIPT_ENABLED=false)",
            },
          };
        }
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
        if (process.env.NEXUS_TOKEN_P2_ENABLED === "false" || process.env.NEXUS_CHECKPOINT_PERSISTENCE === "false") {
          return { content: [{ type: "text", text: "Checkpoint is disabled by NEXUS_TOKEN_P2_ENABLED" }], isError: true };
        }
        const saveRes = DiskCheckpointStore.saveCheckpoint(args.name, args.data, args.description);
        return {
          content: [{
            type: "text",
            text: `[Checkpoint Saved] Name: ${saveRes.checkpointName} | File: ${saveRes.filePath} (${saveRes.sizeBytes} bytes). Restore at any time via nexus_checkpoint_load.`,
          }],
          structuredContent: saveRes,
        };
      }

      if (name === "nexus_checkpoint_load") {
        if (process.env.NEXUS_TOKEN_P2_ENABLED === "false" || process.env.NEXUS_CHECKPOINT_PERSISTENCE === "false") {
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
        if (process.env.NEXUS_TOKEN_P2_ENABLED === "false" || process.env.NEXUS_CHECKPOINT_PERSISTENCE === "false") {
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
          keywords: ((ct as any).keywords || []) as string[],
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

        // C. Universal Meta Tools (Top-Level Orchestration & Discovery - 3 Meta Tools)
        const metaCandidates = UNIVERSAL_META_TOOLS.map((mt) => ({
          name: mt.name,
          category: "meta",
          providerId: "nexus-meta",
          source: "顶层元工具 (Universal Meta)",
          description: mt.description || "",
          keywords: ["meta", "orchestrator", "chatgpt", "script", "python", "node", "discover", "execute", "tools", "action"],
          parameters: (mt.inputSchema?.properties ? Object.keys(mt.inputSchema.properties) : []).filter((p) => !INTERNAL_HOST_PARAMS.has(p)),
          required: (mt.inputSchema?.required || []).filter((p: string) => !INTERNAL_HOST_PARAMS.has(p)),
          inputSchema: mt.inputSchema,
          isExternal: false,
        }));

        // Combined Active Tool Pool: Strictly 3 Meta Tools + 332 Canonical Tools + Dynamic MCP Candidates
        const allActiveTools = [...metaCandidates, ...canonicalCandidates, ...dynamicCandidates];

        // 2. Empty Query Handling: return Full Capabilities Overview to save Tokens and guide AI
        if (!query && !providerFilter) {
          const categoryCounts: Record<string, number> = {};
          for (const t of canonicalCandidates) {
            categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
          }
          const dynamicProviders = Array.from(new Set(dynamicCandidates.map((d) => d.providerId)));
          const overview = {
            type: "capabilities_overview",
            message: "Token optimization mode active. Indexed 332 canonical tools and active external MCP providers. Use query, category, or provider for on-demand retrieval.",
            totalToolsIndexed: canonicalCandidates.length + dynamicCandidates.length,
            builtinTotal: canonicalCandidates.length,
            domains: {
              "Desktop & OS (Native Desktop & OS)": {
                "computer-use": `${categoryCounts["computer-use"] || 47} tools - 原生桌面与键鼠控制、WinRT OCR、UI元素定位与屏幕截图`,
                command: `${categoryCounts.command || 2} tools - 操作系统命令直接执行 (cmd, powershell, bash)`,
                terminal: `${categoryCounts.terminal || 7} tools - 持久化 PTY 终端会话与流式命令执行`,
                process: `${categoryCounts.process || 4} tools - 本地进程管理、运行状态与生命周期监控`,
                port: `${categoryCounts.port || 2} tools - 网络端口探测与占用管理`,
              },
              "Browser Automation (Real Browser Automation)": {
                browser: `${categoryCounts.browser || 30} tools - 真实 Chromium (Edge/Chrome) 本地自动化控制 (launch, open, click, type, screenshot 等)`,
              },
              "Filesystem, Code & Git (Filesystem, Code & Git)": {
                filesystem: `${categoryCounts.filesystem || 16} tools - 本地文件读写、检索与工程目录管理`,
                git: `${categoryCounts.git || 9} tools - 本地 Git 版本控制 (status, diff, commit, branch, log)`,
                worktree: `${categoryCounts.worktree || 5} tools - Git Worktree 独立工作区隔离开发`,
                project: `${categoryCounts.project || 2} tools - 工程项目根目录与项目配置管理`,
                code: `${categoryCounts.code || 11} tools - AST 语法树分析与局部代码重构`,
                skills: `${categoryCounts.skills || 10} tools - Nexus 技能中心能力库与拓展插件`,
              },
              "Documents & Vision (Documents & Vision)": {
                document: `${categoryCounts.document || 28} tools - Word/PDF/Markdown 文档处理与自动化生成`,
                vision: `${categoryCounts.vision || 14} tools - 本地多模态视觉分析与图元提取`,
              },
              "Agent Planning & Runtime (Agent Planning & Runtime)": {
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
              : ["(No active external MCP providers currently running; inactive tools are auto-filtered)"],
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
          {
            triggers: ["手机", "安卓", "android", "adb", "真机", "模拟器", "操作手机", "点手机", "手机截图", "投屏", "scrcpy", "mobile", "phone", "apk", "雷电", "mumu", "夜神", "root"],
            englishKeywords: ["adb", "android", "mobile"],
            exactToolHints: ["nexus_adb_controller"],
            categories: ["mobile", "android", "system"],
          },
          {
            triggers: ["逆向", "脱敏", "反混淆", "deobfuscate", "代码还原", "加密算法", "ast"],
            englishKeywords: ["deobfuscate", "reverse", "ast"],
            exactToolHints: ["nexus_deobfuscate_synthesize", "nexus_ast_semantic_patch"],
            categories: ["code", "reverse"],
          },
          {
            triggers: ["编解码", "转码", "hex", "base64", "protobuf", "哈希", "hash", "md5", "sha256", "hmac"],
            englishKeywords: ["codec", "transform", "hex", "base64", "hash"],
            exactToolHints: ["nexus_data_codec_transform"],
            categories: ["codec", "tools"],
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

          const { score, matchedAny } = calculateToolScore(
            t,
            query,
            queryTokens,
            matchedConcepts,
            conceptExactHints,
            conceptCategories
          );

          if (matchedAny && score > 0) {
            scored.push({ tool: t, score });
          }
        }

        scored.sort((a, b) => b.score - a.score);

        // 5. If no matches found: provide clean, truthful feedback instead of padding garbage tools
        if (scored.length === 0) {
          const SYNONYM_MAP: Record<string, string[]> = {
            screenshot: ["screen capture", "screen snapshot", "observe"],
            snapshot: ["screenshot", "screen capture", "observe"],
            click: ["mouse click", "mouse move", "browser click"],
            process: ["process list", "tasklist", "psutil"],
            document: ["document create", "document read", "docx", "markdown"],
            browser: ["browser open", "browser launch", "browser click"],
            file: ["file read", "file write", "directory list"],
            window: ["window list", "window focus", "observe"],
            code: ["code document symbols", "code workspace symbols"],
            terminal: ["terminal exec", "command execute"],
          };

          let suggestedKeywords: string[] = [];
          for (const [key, syns] of Object.entries(SYNONYM_MAP)) {
            if (query.includes(key) || queryTokens.some((tok) => tok.includes(key))) {
              suggestedKeywords.push(...syns);
            }
          }
          if (suggestedKeywords.length === 0) {
            suggestedKeywords = ["process list", "browser open", "screenshot", "file read", "document read", "window list"];
          }
          suggestedKeywords = Array.from(new Set(suggestedKeywords));

          const externalApps = ["blender", "photoshop", "autocad", "unity", "figma", "godot", "unreal"].filter((app) =>
            query.includes(app) || queryTokens.includes(app)
          );
          const notFoundMsg = externalApps.length > 0
            ? `未检索到匹配的工具。您查询了外部应用 [${externalApps.join(", ")}]，当前宿主端未检测到这些外部 Provider 处于运行状态（未开启的外部工具已自动过滤，避免调用失败）。如需使用，请先在宿主界面【MCP 管理】中启动对应服务。可尝试英文关键词: ${suggestedKeywords.join(", ")}`
            : `未检索到与 "${rawQuery}" 相关的工具。可尝试的同义英文词: ${suggestedKeywords.join(", ")}。常用检索对照: 进程 → process, 截图 → screenshot / screen snapshot, 点击 → click, 文档 → document, 浏览器 → browser, 文件 → file, 打开网页 → browser open, 窗口 → window。`;

          const emptyResult = {
            totalMatches: 0,
            returnedCount: 0,
            query: rawQuery,
            tools: [],
            message: notFoundMsg,
            suggestedEnglishKeywords: suggestedKeywords,
          };
          return {
            content: [{ type: "text", text: JSON.stringify(emptyResult, null, 2) }],
            structuredContent: emptyResult,
          };
        }

        const offset = Math.max(0, Number(args.offset) || 0);

        // Adaptive Score Cliff Cutoff: keep high-relevance core, prune sharp drop-offs
        const topScore = scored.length > 0 ? scored[0].score : 0;
        let effectiveScored = scored;
        if (topScore >= 25 && scored.length > 3) {
          const cliffIndex = scored.findIndex((s, idx) => idx >= 3 && s.score < topScore * 0.4);
          if (cliffIndex !== -1) {
            effectiveScored = scored.slice(0, cliffIndex);
          }
        }

        const topMatches = effectiveScored.slice(offset, offset + limit).map(({ tool: t }) => {
          const exampleArgs: Record<string, any> = {};
          for (const reqParam of (t.required || [])) {
            if (reqParam === "browserSessionId") {
              exampleArgs[reqParam] = lastActiveBrowserSessionId || "<sessionId or leave empty to auto-inherit>";
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
            name: t.name,
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

          const totalAvailable = effectiveScored.length;
          const returnedCount = topMatches.length;
          const nextOffset = offset + returnedCount;
          const hasMore = totalAvailable > nextOffset;
          const remainingCount = totalAvailable - nextOffset;
          const searchResult: Record<string, any> = {
            totalMatches: totalAvailable,
            returnedCount,
            offset,
            hasMore,
            tools: compactTools,
          };
          if (hasMore) {
            searchResult.hasMoreHint = `Most relevant matches displayed. There are ${remainingCount} additional matching tools folded. Pass offset=${nextOffset} to retrieve more.`;
          }

          const compactMeta: Record<string, any> = {
            totalMatches: totalAvailable,
            returnedCount,
            offset,
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

        // Rule 1 Enforcement: When invoked externally, top-level orchestrator meta tools must be called directly, NEVER forwarded
        const isInternalBatch = Boolean(actionArgs._internal || args._internal);
        const FORBIDDEN_META_ORCHESTRATORS = new Set([
          "nexus_discover_tools", "discover_tools",
          "nexus_run_script", "run_script",
          "nexus_batch_execute", "batch_execute",
          "nexus_parallel_fanout", "parallel_fanout",
          "nexus_relay_dispatch", "relay_dispatch",
          "nexus_wait_condition", "wait_condition",
          "nexus_session_handoff", "session_handoff"
        ]);
        if (!isInternalBatch && FORBIDDEN_META_ORCHESTRATORS.has(actionTool)) {
          return {
            content: [{
              type: "text",
              text: `❌ [ERR_META_TOOL_FORWARD_FORBIDDEN] Rule Violation: '${actionTool}' is a top-level orchestrator meta-tool. Call '${actionTool}(...)' directly at the top level instead of nesting it in nexus_execute_action!`
            }],
            isError: true,
            structuredContent: {
              success: false,
              errorCode: "ERR_META_TOOL_FORWARD_FORBIDDEN",
              tool: actionTool,
              advisory: `Call '${actionTool}' directly as a top-level tool instead of nesting it in nexus_execute_action.`
            }
          };
        }

        // Allow internal batch dispatch for run_script
        if (isInternalBatch && (actionTool === "nexus_run_script" || actionTool === "run_script")) {
          return executeCallTool({ params: { name: "nexus_run_script", arguments: actionArgs } });
        }

        // Dispatch local bridge state & schema meta actions directly in-process under nexus_execute_action
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
        if (actionTool === "nexus_session_cache_load" || actionTool === "session_cache_load") {
          return executeCallTool({ params: { name: "nexus_session_cache_load", arguments: actionArgs } });
        }
        if (actionTool === "nexus_session_cache_save" || actionTool === "session_cache_save") {
          return executeCallTool({ params: { name: "nexus_session_cache_save", arguments: actionArgs } });
        }
        if (actionTool === "nexus_session_cache_list" || actionTool === "session_cache_list") {
          return executeCallTool({ params: { name: "nexus_session_cache_list", arguments: actionArgs } });
        }
        if (actionTool === "nexus_session_cache_clear" || actionTool === "session_cache_clear") {
          return executeCallTool({ params: { name: "nexus_session_cache_clear", arguments: actionArgs } });
        }
        if (actionTool === "nexus_get_active_directives" || actionTool === "get_active_directives") {
          return executeCallTool({ params: { name: "nexus_get_active_directives", arguments: actionArgs } });
        }

        // 1.4.3 Normalize canonical names in actionTool
        actionTool = normalizeCanonicalToolName(actionTool);

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
        const enforceActionPostRules = (res: any, toolName: string) => {
          // Rule 6: Redact sensitive tokens and secrets from returning text
          if (res?.content && Array.isArray(res.content)) {
            for (const item of res.content) {
              if (item.type === "text" && item.text) {
                item.text = item.text.replace(/(?:password|secret|key|token|auth|bearer)["']?\s*[:=]\s*["']?([a-zA-Z0-9_\-\.]{12,})["']?/gi, (m: string, g1: string) => m.replace(g1, "[REDACTED_CREDENTIAL]"));
              }
            }
          }

          // Rule 7: Unreliable result detection on empty/abnormal responses
          if (!res.isError) {
            const mainText = res.content?.[0]?.text?.trim() || "";
            if (!mainText || mainText === "{}" || mainText === "[]" || mainText === "null") {
              if (!res.structuredContent) res.structuredContent = {};
              res.structuredContent.result_reliability = "POTENTIALLY_UNRELIABLE";
              if (res.content?.[0]) {
                res.content[0].text = `⚠️ [Potentially Unreliable: Empty Result] Tool '${toolName}' executed but returned an empty response:\n${mainText || "(empty)"}\nConsider checking arguments via discover_tools or verifying manually.`;
              }
            }
          }

          return res;
        };

        if (dynamicTool) {
          const execResult = await providerRuntime.executeTool(dynamicTool.qualifiedName, actionArgs);
          const fullOpt = Boolean(actionArgs.full || actionArgs._full || args.full);
          return enforceActionPostRules(TokenGuardrail.sanitizeToolResult({
            content: (execResult.content || []) as any,
            isError: execResult.isError,
            structuredContent: execResult,
          }, { sourceTool: actionTool, full: fullOpt, args: actionArgs }), actionTool);
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
            return enforceActionPostRules(TokenGuardrail.sanitizeToolResult({
              content: (execResult.content || []) as any,
              isError: execResult.isError,
              structuredContent: execResult,
            }, { sourceTool: actionTool, full: fullOpt, args: actionArgs }), actionTool);
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
        return enforceActionPostRules(TokenGuardrail.sanitizeToolResult({
          content: (coreRes.content || []) as any,
          isError: coreRes.isError,
          structuredContent: (coreRes as any).structuredContent,
        }, { sourceTool: actionTool, full: fullOpt, args: actionArgs }), actionTool);
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
    // Background audit log sync to Nexus Core
    try {
      const coreUrl = process.env.NEXUS_CORE_URL || "http://127.0.0.1:18080";
      fetch(`${coreUrl}/api/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: request?.params?.name || "unknown",
          argumentsSummary: request?.params?.arguments,
          resultSummary: { isError: Boolean(result?.isError), durationMs },
          durationMs,
          riskLevel: result?.isError ? "BLOCKED" : "SAFE",
          actorDisplayName: "Claude",
          clientId: "claude_bridge",
        }),
      }).catch(() => {});
    } catch {}
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
  // Hard Ingress Barrier: Nexus 1.4.0 strictly supports ChatGPT only.
  const userAgentLower = String(req.headers["user-agent"] || "").toLowerCase();
  const originLower = String(req.headers["origin"] || "").toLowerCase();
  const refererLower = String(req.headers["referer"] || "").toLowerCase();
  if (
    userAgentLower.includes("claude") ||
    userAgentLower.includes("anthropic") ||
    userAgentLower.includes("gemini") ||
    originLower.includes("claude.ai") ||
    originLower.includes("anthropic.com") ||
    originLower.includes("gemini.google.com") ||
    refererLower.includes("claude.ai") ||
    refererLower.includes("gemini.google.com")
  ) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Forbidden: Client not supported in Nexus 1.4.0 (ChatGPT only)",
        code: "CLIENT_NOT_SUPPORTED",
      })
    );
    return;
  }

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
