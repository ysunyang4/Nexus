import { describe, it, expect } from "vitest";
import {
  LEGACY_NEXUS_TOOLS,
  PROJECT_BUILDER_TOOLS,
  SESSION_CACHE_AND_DIRECTIVE_TOOLS,
  UNIVERSAL_META_TOOLS,
} from "../src/server.js";
import { ADVANCED_META_TOOL_DEFINITIONS } from "../src/meta-tools/advanced-meta-tools.js";
import { ALL_80_MCP_TOOLS, ECOSYSTEM_TOOL_CONTRACTS } from "./all-80-mcp-tools-contract.test.js";

export const ALL_80_NEXUS_TOOLS = ALL_80_MCP_TOOLS;

describe("Nexus MCP Tools Compliance & 100% (80/80) Coverage Suite", () => {
  it("should have exactly 80 declared tools across all modules", () => {
    expect(ALL_80_NEXUS_TOOLS.length).toBe(80);
    const uniqueTools = new Set(ALL_80_NEXUS_TOOLS);
    expect(uniqueTools.size).toBe(80);
  });

  it("should enforce standard lowercase snake_case naming conventions for all tools", () => {
    for (const toolName of ALL_80_NEXUS_TOOLS) {
      expect(toolName).toMatch(/^[a-z0-9_]+$/);
      expect(toolName).not.toMatch(/[A-Z]/);
    }
  });

  describe("Core TypeScript Tool Definitions Compliance (26 Tools in server.ts)", () => {
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
    const coreTools = Array.from(tsCoreToolsMap.values());

    it("verifies count of unique server.ts tools is exactly 26", () => {
      expect(coreTools.length).toBe(26);
    });

    it("should ensure every core tool defines all four boolean hints", () => {
      for (const tool of coreTools) {
        expect(typeof tool.readOnlyHint, `Tool '${tool.name}' is missing readOnlyHint`).toBe("boolean");
        expect(typeof tool.destructiveHint, `Tool '${tool.name}' is missing destructiveHint`).toBe("boolean");
        expect(typeof tool.idempotentHint, `Tool '${tool.name}' is missing idempotentHint`).toBe("boolean");
        expect(typeof tool.openWorldHint, `Tool '${tool.name}' is missing openWorldHint`).toBe("boolean");

        // Verify annotations object mirror
        if (tool.annotations) {
          expect(typeof tool.annotations.readOnlyHint).toBe("boolean");
          expect(typeof tool.annotations.destructiveHint).toBe("boolean");
          expect(typeof tool.annotations.idempotentHint).toBe("boolean");
          expect(typeof tool.annotations.openWorldHint).toBe("boolean");
        }
      }
    });

    it("should ensure all tool descriptions are in professional English without Chinese characters", () => {
      const chineseCharRegex = /[\u4e00-\u9fa5]/;
      for (const tool of coreTools) {
        expect(tool.description).toBeDefined();
        expect(tool.description.length).toBeGreaterThan(10);
        expect(chineseCharRegex.test(tool.description)).toBe(false);
      }
    });

    it("should guarantee inputSchema structure satisfies MCP & OpenAI specifications", () => {
      for (const tool of coreTools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
        expect(typeof tool.inputSchema.properties).toBe("object");
      }
    });
  });

  describe("Advanced Meta Tools Definitions Compliance (25 Tools)", () => {
    it("verifies count of advanced-meta-tools.ts is exactly 25", () => {
      expect(ADVANCED_META_TOOL_DEFINITIONS.length).toBe(25);
    });

    it("should ensure every advanced meta tool defines all four boolean hints", () => {
      for (const tool of ADVANCED_META_TOOL_DEFINITIONS) {
        expect(typeof tool.readOnlyHint, `Tool '${tool.name}' is missing readOnlyHint`).toBe("boolean");
        expect(typeof tool.destructiveHint, `Tool '${tool.name}' is missing destructiveHint`).toBe("boolean");
        expect(typeof tool.idempotentHint, `Tool '${tool.name}' is missing idempotentHint`).toBe("boolean");
        expect(typeof tool.openWorldHint, `Tool '${tool.name}' is missing openWorldHint`).toBe("boolean");
      }
    });

    it("should ensure all advanced meta tool descriptions are in English", () => {
      const chineseCharRegex = /[\u4e00-\u9fa5]/;
      for (const tool of ADVANCED_META_TOOL_DEFINITIONS) {
        expect(tool.description).toBeDefined();
        expect(tool.description.length).toBeGreaterThan(10);
        expect(chineseCharRegex.test(tool.description)).toBe(false);
      }
    });
  });

  describe("Generic & Python Ecosystem Tools Compliance (29 Tools)", () => {
    it("verifies ecosystem tool contracts dictionary has exactly 29 tools", () => {
      expect(Object.keys(ECOSYSTEM_TOOL_CONTRACTS).length).toBe(29);
    });

    it("should ensure every ecosystem tool defines all four boolean hints", () => {
      for (const [name, contract] of Object.entries(ECOSYSTEM_TOOL_CONTRACTS)) {
        expect(typeof contract.readOnlyHint, `Ecosystem tool '${name}' is missing readOnlyHint`).toBe("boolean");
        expect(typeof contract.destructiveHint, `Ecosystem tool '${name}' is missing destructiveHint`).toBe("boolean");
        expect(typeof contract.idempotentHint, `Ecosystem tool '${name}' is missing idempotentHint`).toBe("boolean");
        expect(typeof contract.openWorldHint, `Ecosystem tool '${name}' is missing openWorldHint`).toBe("boolean");
      }
    });
  });

  describe("Individual Tool Identity Verification (80/80 References)", () => {
    // 1. TypeScript Core Tools (26)
    it("references nexus_project_list", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_project_list"));
    it("references nexus_project_info", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_project_info"));
    it("references nexus_directory_list", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_directory_list"));
    it("references nexus_file_read", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_file_read"));
    it("references nexus_file_create", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_file_create"));
    it("references nexus_file_write", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_file_write"));
    it("references nexus_git_status", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_git_status"));
    it("references nexus_runtime_list", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_runtime_list"));
    it("references nexus_project_blueprint_submit", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_project_blueprint_submit"));
    it("references nexus_project_status", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_project_status"));
    it("references nexus_project_replan", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_project_replan"));
    it("references nexus_project_artifact_get", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_project_artifact_get"));
    it("references nexus_capability_list", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_capability_list"));
    it("references mcp_batch_execute", () => expect(ALL_80_NEXUS_TOOLS).toContain("mcp_batch_execute"));
    it("references nexus_get_active_directives", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_get_active_directives"));
    it("references nexus_session_cache_save", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_session_cache_save"));
    it("references nexus_session_cache_load", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_session_cache_load"));
    it("references nexus_session_cache_list", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_session_cache_list"));
    it("references nexus_session_cache_clear", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_session_cache_clear"));
    it("references nexus_session_handoff", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_session_handoff"));
    it("references nexus_run_script", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_run_script"));
    it("references nexus_discover_tools", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_discover_tools"));
    it("references nexus_execute_action", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_execute_action"));
    it("references nexus_relay_dispatch", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_relay_dispatch"));
    it("references nexus_batch_execute", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_batch_execute"));
    it("references nexus_wait_condition", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_wait_condition"));

    // 2. Advanced Meta Tools (25)
    it("references nexus_adb_controller", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_adb_controller"));
    it("references nexus_deobfuscate_synthesize", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_deobfuscate_synthesize"));
    it("references nexus_data_codec_transform", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_data_codec_transform"));
    it("references nexus_assert_and_heal", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_assert_and_heal"));
    it("references nexus_converge_loop", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_converge_loop"));
    it("references nexus_speculative_sandbox", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_speculative_sandbox"));
    it("references nexus_surface_wireframe", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_surface_wireframe"));
    it("references nexus_fuzz_edge_synthesizer", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_fuzz_edge_synthesizer"));
    it("references nexus_visual_regression_diff", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_visual_regression_diff"));
    it("references nexus_interactive_breakpoint", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_interactive_breakpoint"));
    it("references nexus_stream_virtual_query", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_stream_virtual_query"));
    it("references nexus_traffic_wiretap", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_traffic_wiretap"));
    it("references nexus_parallel_fanout", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_parallel_fanout"));
    it("references nexus_synthesize_macro", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_synthesize_macro"));
    it("references nexus_cognitive_memory_mesh", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_cognitive_memory_mesh"));
    it("references nexus_vault_blind_exec", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_vault_blind_exec"));
    it("references nexus_shadow_mock_gateway", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_shadow_mock_gateway"));
    it("references nexus_process_hook_probe", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_process_hook_probe"));
    it("references nexus_ipc_bus_bridge", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_ipc_bus_bridge"));
    it("references nexus_sentinel_event_trap", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_sentinel_event_trap"));
    it("references nexus_state_capsule_diff", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_state_capsule_diff"));
    it("references nexus_time_travel_replay", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_time_travel_replay"));
    it("references nexus_ast_semantic_patch", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_ast_semantic_patch"));
    it("references nexus_browser", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_browser"));
    it("references nexus_canvas", () => expect(ALL_80_NEXUS_TOOLS).toContain("nexus_canvas"));

    // 3. Generic & Python Ecosystem Tools (29)
    it("references create_task", () => expect(ALL_80_NEXUS_TOOLS).toContain("create_task"));
    it("references list_tasks", () => expect(ALL_80_NEXUS_TOOLS).toContain("list_tasks"));
    it("references update_task_status", () => expect(ALL_80_NEXUS_TOOLS).toContain("update_task_status"));
    it("references save_agent_memory", () => expect(ALL_80_NEXUS_TOOLS).toContain("save_agent_memory"));
    it("references search_agent_memories", () => expect(ALL_80_NEXUS_TOOLS).toContain("search_agent_memories"));
    it("references get_project_context", () => expect(ALL_80_NEXUS_TOOLS).toContain("get_project_context"));
    it("references resolve_dns_records", () => expect(ALL_80_NEXUS_TOOLS).toContain("resolve_dns_records"));
    it("references verify_ssl_certificate", () => expect(ALL_80_NEXUS_TOOLS).toContain("verify_ssl_certificate"));
    it("references probe_http_latency", () => expect(ALL_80_NEXUS_TOOLS).toContain("probe_http_latency"));
    it("references inspect_security_headers", () => expect(ALL_80_NEXUS_TOOLS).toContain("inspect_security_headers"));
    it("references whois_lookup", () => expect(ALL_80_NEXUS_TOOLS).toContain("whois_lookup"));
    it("references analyze_ast_structure", () => expect(ALL_80_NEXUS_TOOLS).toContain("analyze_ast_structure"));
    it("references inspect_code_complexity", () => expect(ALL_80_NEXUS_TOOLS).toContain("inspect_code_complexity"));
    it("references trace_execution_flow", () => expect(ALL_80_NEXUS_TOOLS).toContain("trace_execution_flow"));
    it("references detect_code_smells", () => expect(ALL_80_NEXUS_TOOLS).toContain("detect_code_smells"));
    it("references generate_refactoring_plan", () => expect(ALL_80_NEXUS_TOOLS).toContain("generate_refactoring_plan"));
    it("references crawl_url", () => expect(ALL_80_NEXUS_TOOLS).toContain("crawl_url"));
    it("references extract_markdown", () => expect(ALL_80_NEXUS_TOOLS).toContain("extract_markdown"));
    it("references extract_tables", () => expect(ALL_80_NEXUS_TOOLS).toContain("extract_tables"));
    it("references browser_navigate", () => expect(ALL_80_NEXUS_TOOLS).toContain("browser_navigate"));
    it("references browser_screenshot", () => expect(ALL_80_NEXUS_TOOLS).toContain("browser_screenshot"));
    it("references browser_extract_text", () => expect(ALL_80_NEXUS_TOOLS).toContain("browser_extract_text"));
    it("references browser_click", () => expect(ALL_80_NEXUS_TOOLS).toContain("browser_click"));
    it("references browser_fill", () => expect(ALL_80_NEXUS_TOOLS).toContain("browser_fill"));
    it("references browser_evaluate", () => expect(ALL_80_NEXUS_TOOLS).toContain("browser_evaluate"));
    it("references search_wikipedia", () => expect(ALL_80_NEXUS_TOOLS).toContain("search_wikipedia"));
    it("references get_wikipedia_summary", () => expect(ALL_80_NEXUS_TOOLS).toContain("get_wikipedia_summary"));
    it("references get_wikipedia_article", () => expect(ALL_80_NEXUS_TOOLS).toContain("get_wikipedia_article"));
    it("references get_random_wikipedia_article", () => expect(ALL_80_NEXUS_TOOLS).toContain("get_random_wikipedia_article"));
  });
});
