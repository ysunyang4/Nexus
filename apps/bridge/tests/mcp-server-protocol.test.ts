import assert from "node:assert/strict";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer, UNIVERSAL_META_TOOLS } from "../src/server.js";
import { McpSecurityPolicyManager } from "../src/generic-mcp/mcp-security-policy.js";
import { DynamicCatalog } from "../src/generic-mcp/dynamic-catalog.js";
import { NexusClient } from "../src/nexus-client.js";

async function runMcpServerProtocolTests() {
  console.log("=================================================================");
  console.log("  NEXUS 1.3.0: MCP SERVER PROTOCOL & DISPATCHER TEST SUITE       ");
  console.log("=================================================================\n");

  const policy = McpSecurityPolicyManager.getInstance();
  const catalog = DynamicCatalog.getInstance();
  const dummyClient = new NexusClient({ coreUrl: "http://127.0.0.1:18080" });

  // Register mock dynamic tools in catalog for testing
  catalog.atomicSwapProviderTools("autocad", "autocad-inst-1", [
    {
      name: "cad_create_line",
      description: "Draws a 2D/3D line segment in active AutoCAD workspace",
      inputSchema: {
        type: "object",
        properties: {
          start: { type: "array", items: { type: "number" } },
          end: { type: "array", items: { type: "number" } },
        },
        required: ["start", "end"],
      },
    },
    {
      name: "cad_get_layers",
      description: "List all DWG drawing layers in AutoCAD",
      inputSchema: { type: "object", properties: {} },
    },
  ]);

  catalog.atomicSwapProviderTools("unity-gamedev", "unity-inst-1", [
    {
      name: "unity_scene_get_data",
      description: "Returns hierarchy tree and active scene root in Unity",
      inputSchema: { type: "object", properties: {} },
    },
  ]);

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    total++;
    return (async () => {
      try {
        await fn();
        console.log(`[PASS] [${total}] ${name}`);
        passed++;
      } catch (err: any) {
        console.error(`[FAIL] [${total}] ${name}`);
        console.error(`       Error: ${err?.message || err}`);
        throw err;
      }
    })();
  }

  // --- Test 1: Dynamic Instructions Under Master Token Mode ---
  await test("MCP Server instructions announce 🟢 ULTRA TOKEN OPTIMIZATION MODE when enabled", () => {
    policy.setMasterTokenOptimization(true);
    const server = createMcpServer(dummyClient);
    const instructions = (server as any)._instructions || "";
    assert.ok(
      instructions.includes("[NEXUS EXECUTION STATUS: 🟢 ULTRA TOKEN OPTIMIZATION MODE ACTIVATED]"),
      "Instructions must state token optimization mode activated"
    );
    assert.ok(
      instructions.includes("Master Token Optimization: 🟢 ENABLED"),
      "Instructions must display master enabled status"
    );
  });

  // --- Test 2: Dynamic Instructions Under Legacy Mode ---
  await test("MCP Server instructions announce ⚪ FULL TOOLS MODE when disabled", () => {
    policy.setMasterTokenOptimization(false);
    const server = createMcpServer(dummyClient);
    const instructions = (server as any)._instructions || "";
    assert.ok(
      instructions.includes("[NEXUS EXECUTION STATUS: ⚪ FULL TOOLS MODE (LEGACY)]"),
      "Instructions must state legacy mode activated"
    );
    // Restore
    policy.setMasterTokenOptimization(true);
  });

  // --- Test 3: Tool List Filtering under Token Mode ---
  await test("tools/list returns ONLY 3 Universal Meta Tools when Master and Providers are ON", async () => {
    policy.setMasterTokenOptimization(true);
    policy.setProviderTokenOptimization("autocad", true);
    policy.setProviderTokenOptimization("unity-gamedev", true);

    const server = createMcpServer(dummyClient);
    // Find registered request handler for ListToolsRequestSchema
    const handler = (server as any)._requestHandlers.get(ListToolsRequestSchema.shape.method.value);
    assert.ok(handler, "ListTools handler must be registered");

    const result = await handler({ method: "tools/list", params: {} });
    assert.ok(result && Array.isArray(result.tools));
    const toolNames = result.tools.map((t: any) => t.name);
    console.log(`       [Verified] Exposed Tools Count: ${result.tools.length} ->`, toolNames);
    assert.equal(result.tools.length, 3);
    assert.ok(toolNames.includes("nexus_run_script"));
    assert.ok(toolNames.includes("nexus_discover_tools"));
    assert.ok(toolNames.includes("nexus_execute_action"));
  });

  // --- Test 4: Selective Exposure When Single Provider Token Mode is OFF ---
  await test("tools/list includes native tools for provider when its Token Mode is turned OFF", async () => {
    policy.setMasterTokenOptimization(true);
    // Turn off token optimization specifically for AutoCAD
    policy.setProviderTokenOptimization("autocad", false);

    const server = createMcpServer(dummyClient);
    const handler = (server as any)._requestHandlers.get(ListToolsRequestSchema.shape.method.value);
    const result = await handler({ method: "tools/list", params: {} });

    const toolNames = result.tools.map((t: any) => t.name);
    console.log(`       [Verified] Selective Tools Count: ${result.tools.length} ->`, toolNames);
    // Must contain the 3 meta tools + the 2 autocad native tools
    assert.ok(toolNames.includes("nexus_run_script"));
    assert.ok(toolNames.includes("cad_create_line"));
    assert.ok(toolNames.includes("cad_get_layers"));
    // Unity tools must NOT be exposed since unity is still saving tokens!
    assert.ok(!toolNames.includes("unity_scene_get_data"));

    // Reset AutoCAD back to true
    policy.setProviderTokenOptimization("autocad", true);
  });

  // --- Test 5: Tool Call: nexus_run_script ---
  await test("tools/call: nexus_run_script executes code and returns MCP content", async () => {
    policy.setMasterTokenOptimization(true);
    const server = createMcpServer(dummyClient);
    const callHandler = (server as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);
    assert.ok(callHandler, "CallTool handler must be registered");

    const callResult = await callHandler({
      method: "tools/call",
      params: {
        name: "nexus_run_script",
        arguments: {
          runtime: "python",
          script: `import nexus\nprint("MCP_TOOL_EXEC_SUCCESS")`,
        },
      },
    });

    assert.equal(callResult.isError, false);
    assert.ok(callResult.content[0].text.includes("MCP_TOOL_EXEC_SUCCESS"));
    console.log(`       [Verified] nexus_run_script returned:`, callResult.content[0].text.trim());
  });

  // --- Test 6: Tool Call: nexus_discover_tools ---
  await test("tools/call: nexus_discover_tools finds tools matching keyword", async () => {
    policy.setMasterTokenOptimization(true);
    const server = createMcpServer(dummyClient);
    const callHandler = (server as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);

    const discoverResult = await callHandler({
      method: "tools/call",
      params: {
        name: "nexus_discover_tools",
        arguments: {
          query: "line",
        },
      },
    });

    assert.equal(discoverResult.isError, undefined);
    const parsed = JSON.parse(discoverResult.content[0].text);
    console.log(`       [Verified] nexus_discover_tools matched:`, parsed.tools.map((t: any) => t.name));
    assert.ok(parsed.totalMatches >= 1);
    assert.ok(parsed.tools.some((t: any) => t.name === "cad_create_line"));
  });

  console.log("\n=================================================================");
  console.log(`  ALL ${passed}/${total} MCP PROTOCOL TESTS PASSED! (100% PASS RATE)`);
  console.log("=================================================================\n");
  process.exit(0);
}

runMcpServerProtocolTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
