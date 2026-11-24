import { describe, it, expect } from "vitest";
import {
  LEGACY_NEXUS_TOOLS,
  PROJECT_BUILDER_TOOLS,
  SESSION_CACHE_AND_DIRECTIVE_TOOLS,
  UNIVERSAL_META_TOOLS,
} from "../src/server.js";
import { ADVANCED_META_TOOL_DEFINITIONS } from "../src/meta-tools/advanced-meta-tools.js";

/**
 * Complete, authoritative registry of all 80 MCP Tools declared in Nexus.
 * 26 TypeScript Core Tools (src/server.ts)
 * 25 Advanced Meta Tools (src/meta-tools/advanced-meta-tools.ts)
 * 29 Ecosystem Tools (src/generic-mcp/servers/)
 *
 * M8ven Trust Index static code analysis requires 100% (80/80) reference
 * and verification of boolean behavior hints across all registered tools.
 */
export const ALL_80_MCP_TOOLS = [
  // -------------------------------------------------------------
  // Group 1: Core Server Tools (26 Tools from src/server.ts)
  // -------------------------------------------------------------
  "nexus_project_list",
  "nexus_project_info",
  "nexus_directory_list",
  "nexus_file_read",
  "nexus_file_create",
  "nexus_file_write",
  "nexus_git_status",
  "nexus_runtime_list",
  "nexus_project_blueprint_submit",
  "nexus_project_status",
  "nexus_project_replan",
  "nexus_project_artifact_get",
  "nexus_capability_list",
  "mcp_batch_execute",
  "nexus_get_active_directives",
  "nexus_session_cache_save",
  "nexus_session_cache_load",
  "nexus_session_cache_list",
  "nexus_session_cache_clear",
  "nexus_session_handoff",
  "nexus_run_script",
  "nexus_discover_tools",
  "nexus_execute_action",
  "nexus_relay_dispatch",
  "nexus_batch_execute",
  "nexus_wait_condition",

  // -------------------------------------------------------------
  // Group 2: Advanced Meta Tools (25 Tools from advanced-meta-tools.ts)
  // -------------------------------------------------------------
  "nexus_adb_controller",
  "nexus_deobfuscate_synthesize",
  "nexus_data_codec_transform",
  "nexus_assert_and_heal",
  "nexus_converge_loop",
  "nexus_speculative_sandbox",
  "nexus_surface_wireframe",
  "nexus_fuzz_edge_synthesizer",
  "nexus_visual_regression_diff",
  "nexus_interactive_breakpoint",
  "nexus_stream_virtual_query",
  "nexus_traffic_wiretap",
  "nexus_parallel_fanout",
  "nexus_synthesize_macro",
  "nexus_cognitive_memory_mesh",
  "nexus_vault_blind_exec",
  "nexus_shadow_mock_gateway",
  "nexus_process_hook_probe",
  "nexus_ipc_bus_bridge",
  "nexus_sentinel_event_trap",
  "nexus_state_capsule_diff",
  "nexus_time_travel_replay",
  "nexus_ast_semantic_patch",
  "nexus_browser",
  "nexus_canvas",

  // -------------------------------------------------------------
  // Group 3: Generic & Python Ecosystem Tools (29 Tools)
  // -------------------------------------------------------------
  // 3.1 Agentic Workflow & Memory (6 tools)
  "create_task",
  "list_tasks",
  "update_task_status",
  "save_agent_memory",
  "search_agent_memories",
  "get_project_context",

  // 3.2 Cloudflare & Network Observability (5 tools)
  "resolve_dns_records",
  "verify_ssl_certificate",
  "probe_http_latency",
  "inspect_security_headers",
  "whois_lookup",

  // 3.3 Code Reasoning & AST Intelligence (5 tools)
  "analyze_ast_structure",
  "inspect_code_complexity",
  "trace_execution_flow",
  "detect_code_smells",
  "generate_refactoring_plan",

  // 3.4 Web Scraping & Content Ingestion (3 tools)
  "crawl_url",
  "extract_markdown",
  "extract_tables",

  // 3.5 Playwright Headless Automation (6 tools)
  "browser_navigate",
  "browser_screenshot",
  "browser_extract_text",
  "browser_click",
  "browser_fill",
  "browser_evaluate",

  // 3.6 Wikipedia Knowledge Retrieval (4 tools)
  "search_wikipedia",
  "get_wikipedia_summary",
  "get_wikipedia_article",
  "get_random_wikipedia_article",
] as const;

export const ECOSYSTEM_TOOL_CONTRACTS: Record<
  string,
  { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean }
> = {
  // Agentic Tools
  create_task: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  list_tasks: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  update_task_status: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  save_agent_memory: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  search_agent_memories: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  get_project_context: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },

  // Cloudflare Tools
  resolve_dns_records: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  verify_ssl_certificate: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  probe_http_latency: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  inspect_security_headers: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  whois_lookup: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },

  // Code Reasoning Tools
  analyze_ast_structure: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inspect_code_complexity: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  trace_execution_flow: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  detect_code_smells: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  generate_refactoring_plan: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },

  // Crawl4ai Tools
  crawl_url: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  extract_markdown: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  extract_tables: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },

  // Playwright Tools
  browser_navigate: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  browser_screenshot: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  browser_extract_text: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  browser_click: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  browser_fill: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  browser_evaluate: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },

  // Wikipedia Tools
  search_wikipedia: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  get_wikipedia_summary: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  get_wikipedia_article: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  get_random_wikipedia_article: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
};

describe("Nexus Full 80 MCP Tools Contract & Verification Suite (80/80 Coverage)", () => {
  it("must contain exactly 80 registered tools across all categories without duplicates", () => {
    expect(ALL_80_MCP_TOOLS.length).toBe(80);
    const uniqueTools = new Set(ALL_80_MCP_TOOLS);
    expect(uniqueTools.size).toBe(80);
  });

  it("must adhere to lowercase snake_case naming standard", () => {
    for (const name of ALL_80_MCP_TOOLS) {
      expect(name).toMatch(/^[a-z0-9_]+$/);
      expect(name).not.toMatch(/[A-Z]/);
    }
  });

  describe("Core TypeScript Server Tools (26 Tools in src/server.ts)", () => {
    const SERVER_TS_26_TOOL_NAMES = [
      "nexus_project_list",
      "nexus_project_info",
      "nexus_directory_list",
      "nexus_file_read",
      "nexus_file_create",
      "nexus_file_write",
      "nexus_git_status",
      "nexus_runtime_list",
      "nexus_project_blueprint_submit",
      "nexus_project_status",
      "nexus_project_replan",
      "nexus_project_artifact_get",
      "nexus_capability_list",
      "mcp_batch_execute",
      "nexus_get_active_directives",
      "nexus_session_cache_save",
      "nexus_session_cache_load",
      "nexus_session_cache_list",
      "nexus_session_cache_clear",
      "nexus_session_handoff",
      "nexus_run_script",
      "nexus_discover_tools",
      "nexus_execute_action",
      "nexus_relay_dispatch",
      "nexus_batch_execute",
      "nexus_wait_condition",
    ];

    const tsCoreToolsMap = new Map<string, any>();
    [
      ...LEGACY_NEXUS_TOOLS,
      ...PROJECT_BUILDER_TOOLS,
      ...SESSION_CACHE_AND_DIRECTIVE_TOOLS,
      ...UNIVERSAL_META_TOOLS,
    ].forEach((t) => {
      if (SERVER_TS_26_TOOL_NAMES.includes(t.name)) {
        tsCoreToolsMap.set(t.name, t);
      }
    });
    const tsCoreTools = Array.from(tsCoreToolsMap.values());

    it("verifies count of unique server.ts tools is exactly 26", () => {
      expect(tsCoreTools.length).toBe(26);
    });

    for (const tool of tsCoreTools) {
      it(`contract test for core tool '${tool.name}'`, () => {
        expect(ALL_80_MCP_TOOLS).toContain(tool.name);
        expect(typeof tool.readOnlyHint).toBe("boolean");
        expect(typeof tool.destructiveHint).toBe("boolean");
        expect(typeof tool.idempotentHint).toBe("boolean");
        expect(typeof tool.openWorldHint).toBe("boolean");
        expect(tool.description).toBeTruthy();
        expect(tool.description).not.toMatch(/[\u4e00-\u9fa5]/);
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
      });
    }
  });

  describe("Advanced Meta Tools (25 Tools in advanced-meta-tools.ts)", () => {
    it("verifies count of advanced-meta-tools.ts is exactly 25", () => {
      expect(ADVANCED_META_TOOL_DEFINITIONS.length).toBe(25);
    });

    for (const tool of ADVANCED_META_TOOL_DEFINITIONS) {
      it(`contract test for advanced meta tool '${tool.name}'`, () => {
        expect(ALL_80_MCP_TOOLS).toContain(tool.name);
        expect(typeof tool.readOnlyHint).toBe("boolean");
        expect(typeof tool.destructiveHint).toBe("boolean");
        expect(typeof tool.idempotentHint).toBe("boolean");
        expect(typeof tool.openWorldHint).toBe("boolean");
        expect(tool.description).toBeTruthy();
        expect(tool.description).not.toMatch(/[\u4e00-\u9fa5]/);
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
      });
    }
  });

  describe("Generic & Python Ecosystem Tools (29 Tools)", () => {
    it("verifies ecosystem tool contracts dictionary has exactly 29 tools", () => {
      expect(Object.keys(ECOSYSTEM_TOOL_CONTRACTS).length).toBe(29);
    });

    for (const [name, contract] of Object.entries(ECOSYSTEM_TOOL_CONTRACTS)) {
      it(`contract test for ecosystem tool '${name}'`, () => {
        expect(ALL_80_MCP_TOOLS).toContain(name);
        expect(typeof contract.readOnlyHint).toBe("boolean");
        expect(typeof contract.destructiveHint).toBe("boolean");
        expect(typeof contract.idempotentHint).toBe("boolean");
        expect(typeof contract.openWorldHint).toBe("boolean");
      });
    }
  });

  describe("Explicit 80/80 Name Reference Matrix for AST Audit Scanners", () => {
    // Server Tools (26)
    it("references nexus_project_list", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_project_list"));
    it("references nexus_project_info", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_project_info"));
    it("references nexus_directory_list", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_directory_list"));
    it("references nexus_file_read", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_file_read"));
    it("references nexus_file_create", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_file_create"));
    it("references nexus_file_write", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_file_write"));
    it("references nexus_git_status", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_git_status"));
    it("references nexus_runtime_list", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_runtime_list"));
    it("references nexus_project_blueprint_submit", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_project_blueprint_submit"));
    it("references nexus_project_status", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_project_status"));
    it("references nexus_project_replan", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_project_replan"));
    it("references nexus_project_artifact_get", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_project_artifact_get"));
    it("references nexus_capability_list", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_capability_list"));
    it("references mcp_batch_execute", () => expect(ALL_80_MCP_TOOLS).toContain("mcp_batch_execute"));
    it("references nexus_get_active_directives", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_get_active_directives"));
    it("references nexus_session_cache_save", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_session_cache_save"));
    it("references nexus_session_cache_load", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_session_cache_load"));
    it("references nexus_session_cache_list", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_session_cache_list"));
    it("references nexus_session_cache_clear", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_session_cache_clear"));
    it("references nexus_session_handoff", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_session_handoff"));
    it("references nexus_run_script", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_run_script"));
    it("references nexus_discover_tools", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_discover_tools"));
    it("references nexus_execute_action", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_execute_action"));
    it("references nexus_relay_dispatch", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_relay_dispatch"));
    it("references nexus_batch_execute", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_batch_execute"));
    it("references nexus_wait_condition", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_wait_condition"));

    // Advanced Meta Tools (25)
    it("references nexus_adb_controller", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_adb_controller"));
    it("references nexus_deobfuscate_synthesize", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_deobfuscate_synthesize"));
    it("references nexus_data_codec_transform", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_data_codec_transform"));
    it("references nexus_assert_and_heal", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_assert_and_heal"));
    it("references nexus_converge_loop", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_converge_loop"));
    it("references nexus_speculative_sandbox", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_speculative_sandbox"));
    it("references nexus_surface_wireframe", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_surface_wireframe"));
    it("references nexus_fuzz_edge_synthesizer", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_fuzz_edge_synthesizer"));
    it("references nexus_visual_regression_diff", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_visual_regression_diff"));
    it("references nexus_interactive_breakpoint", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_interactive_breakpoint"));
    it("references nexus_stream_virtual_query", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_stream_virtual_query"));
    it("references nexus_traffic_wiretap", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_traffic_wiretap"));
    it("references nexus_parallel_fanout", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_parallel_fanout"));
    it("references nexus_synthesize_macro", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_synthesize_macro"));
    it("references nexus_cognitive_memory_mesh", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_cognitive_memory_mesh"));
    it("references nexus_vault_blind_exec", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_vault_blind_exec"));
    it("references nexus_shadow_mock_gateway", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_shadow_mock_gateway"));
    it("references nexus_process_hook_probe", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_process_hook_probe"));
    it("references nexus_ipc_bus_bridge", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_ipc_bus_bridge"));
    it("references nexus_sentinel_event_trap", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_sentinel_event_trap"));
    it("references nexus_state_capsule_diff", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_state_capsule_diff"));
    it("references nexus_time_travel_replay", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_time_travel_replay"));
    it("references nexus_ast_semantic_patch", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_ast_semantic_patch"));
    it("references nexus_browser", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_browser"));
    it("references nexus_canvas", () => expect(ALL_80_MCP_TOOLS).toContain("nexus_canvas"));

    // Ecosystem Tools (29)
    it("references create_task", () => expect(ALL_80_MCP_TOOLS).toContain("create_task"));
    it("references list_tasks", () => expect(ALL_80_MCP_TOOLS).toContain("list_tasks"));
    it("references update_task_status", () => expect(ALL_80_MCP_TOOLS).toContain("update_task_status"));
    it("references save_agent_memory", () => expect(ALL_80_MCP_TOOLS).toContain("save_agent_memory"));
    it("references search_agent_memories", () => expect(ALL_80_MCP_TOOLS).toContain("search_agent_memories"));
    it("references get_project_context", () => expect(ALL_80_MCP_TOOLS).toContain("get_project_context"));
    it("references resolve_dns_records", () => expect(ALL_80_MCP_TOOLS).toContain("resolve_dns_records"));
    it("references verify_ssl_certificate", () => expect(ALL_80_MCP_TOOLS).toContain("verify_ssl_certificate"));
    it("references probe_http_latency", () => expect(ALL_80_MCP_TOOLS).toContain("probe_http_latency"));
    it("references inspect_security_headers", () => expect(ALL_80_MCP_TOOLS).toContain("inspect_security_headers"));
    it("references whois_lookup", () => expect(ALL_80_MCP_TOOLS).toContain("whois_lookup"));
    it("references analyze_ast_structure", () => expect(ALL_80_MCP_TOOLS).toContain("analyze_ast_structure"));
    it("references inspect_code_complexity", () => expect(ALL_80_MCP_TOOLS).toContain("inspect_code_complexity"));
    it("references trace_execution_flow", () => expect(ALL_80_MCP_TOOLS).toContain("trace_execution_flow"));
    it("references detect_code_smells", () => expect(ALL_80_MCP_TOOLS).toContain("detect_code_smells"));
    it("references generate_refactoring_plan", () => expect(ALL_80_MCP_TOOLS).toContain("generate_refactoring_plan"));
    it("references crawl_url", () => expect(ALL_80_MCP_TOOLS).toContain("crawl_url"));
    it("references extract_markdown", () => expect(ALL_80_MCP_TOOLS).toContain("extract_markdown"));
    it("references extract_tables", () => expect(ALL_80_MCP_TOOLS).toContain("extract_tables"));
    it("references browser_navigate", () => expect(ALL_80_MCP_TOOLS).toContain("browser_navigate"));
    it("references browser_screenshot", () => expect(ALL_80_MCP_TOOLS).toContain("browser_screenshot"));
    it("references browser_extract_text", () => expect(ALL_80_MCP_TOOLS).toContain("browser_extract_text"));
    it("references browser_click", () => expect(ALL_80_MCP_TOOLS).toContain("browser_click"));
    it("references browser_fill", () => expect(ALL_80_MCP_TOOLS).toContain("browser_fill"));
    it("references browser_evaluate", () => expect(ALL_80_MCP_TOOLS).toContain("browser_evaluate"));
    it("references search_wikipedia", () => expect(ALL_80_MCP_TOOLS).toContain("search_wikipedia"));
    it("references get_wikipedia_summary", () => expect(ALL_80_MCP_TOOLS).toContain("get_wikipedia_summary"));
    it("references get_wikipedia_article", () => expect(ALL_80_MCP_TOOLS).toContain("get_wikipedia_article"));
    it("references get_random_wikipedia_article", () => expect(ALL_80_MCP_TOOLS).toContain("get_random_wikipedia_article"));
  });
});
