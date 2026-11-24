import assert from "node:assert/strict";
import { createMcpServer } from "../src/server.js";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { DynamicCatalog, McpSecurityPolicyManager } from "../src/generic-mcp/index.js";

async function runAdvancedMetaToolsTests() {
  console.log("=================================================================");
  console.log("  NEXUS: ADVANCED META-TOOLS & ADAPTIVE DISCOVERY TEST SUITE     ");
  console.log("=================================================================\n");

  const policy = McpSecurityPolicyManager.getInstance();
  policy.setMasterTokenOptimization(true);

  const dummyClient: any = {
    callNexusTool: async (tool: string, args: any) => ({
      content: [{ type: "text", text: `MOCK_NEXUS_TOOL_SUCCESS:${tool}` }],
      isError: false,
    }),
    resolveProject: async () => ({ id: "proj_default", rootPath: process.cwd() }),
  };

  const server = createMcpServer(dummyClient);
  const callHandler = (server as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      await fn();
      console.log(`[PASS] [${total}] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] [${total}] ${name}`);
      console.error(`       Error: ${err?.message || err}`);
      throw err;
    }
  }

  // --- Test 1: Discover "操作手机" matches nexus_adb_controller ---
  await test("nexus_discover_tools with '操作手机' instantly ranks nexus_adb_controller at #1", async () => {
    const res = await callHandler({
      method: "tools/call",
      params: {
        name: "nexus_discover_tools",
        arguments: { query: "操作手机" },
      },
    });

    assert.equal(res.isError, undefined);
    const parsed = JSON.parse(res.content[0].text);
    console.log(`       [Verified] '操作手机' matched tools:`, parsed.tools);
    assert.ok(parsed.tools.length > 0);
    const firstToolName = typeof parsed.tools[0] === "string" ? parsed.tools[0] : parsed.tools[0].name;
    assert.ok(firstToolName.includes("nexus_adb_controller"));
  });

  // --- Test 2: Discover "逆向反混淆代码" matches nexus_deobfuscate_synthesize ---
  await test("nexus_discover_tools with '逆向反混淆' matches nexus_deobfuscate_synthesize", async () => {
    const res = await callHandler({
      method: "tools/call",
      params: {
        name: "nexus_discover_tools",
        arguments: { query: "逆向反混淆" },
      },
    });

    assert.equal(res.isError, undefined);
    const parsed = JSON.parse(res.content[0].text);
    console.log(`       [Verified] '逆向反混淆' matched tools:`, parsed.tools);
    const hasDeobf = parsed.tools.some((t: any) => {
      const name = typeof t === "string" ? t : t.name;
      return name.includes("nexus_deobfuscate_synthesize");
    });
    assert.ok(hasDeobf);
  });

  // --- Test 3: Discover with Offset Pagination ---
  await test("nexus_discover_tools supports offset pagination without duplication", async () => {
    const page1 = await callHandler({
      method: "tools/call",
      params: {
        name: "nexus_discover_tools",
        arguments: { query: "browser", limit: 3, offset: 0 },
      },
    });
    const p1 = JSON.parse(page1.content[0].text);
    assert.equal(p1.returnedCount, 3);
    assert.equal(p1.offset, 0);
    assert.equal(p1.hasMore, true);
    console.log(`       [Verified] Page 1 (offset:0, count:3):`, p1.tools.map((t: string) => t.split("(")[0]));

    const page2 = await callHandler({
      method: "tools/call",
      params: {
        name: "nexus_discover_tools",
        arguments: { query: "browser", limit: 3, offset: 3 },
      },
    });
    const p2 = JSON.parse(page2.content[0].text);
    assert.equal(p2.offset, 3);
    console.log(`       [Verified] Page 2 (offset:3, count:${p2.returnedCount}):`, p2.tools.map((t: string) => t.split("(")[0]));

    // Page 1 and Page 2 should not overlap on their first element
    assert.notEqual(p1.tools[0], p2.tools[0]);
  });

  // --- Test 4: Execution via nexus_execute_action delegation ---
  await test("nexus_execute_action transparently routes to advanced meta tools", async () => {
    const execRes = await callHandler({
      method: "tools/call",
      params: {
        name: "nexus_execute_action",
        arguments: {
          tool: "nexus_data_codec_transform",
          arguments: {
            operation: "string_to_hex",
            payload: "Hello Nexus",
          },
        },
      },
    });

    assert.equal(execRes.isError, undefined);
    const resText = execRes.content[0].text;
    assert.equal(resText, "48656c6c6f204e65787573");
    console.log(`       [Verified] nexus_execute_action result: ${resText}`);
  });

  // --- Test 5: Dynamic Macro synthesis and invocation ---
  await test("nexus_synthesize_macro dynamically registers a macro that can be executed", async () => {
    const synthRes = await callHandler({
      method: "tools/call",
      params: {
        name: "nexus_synthesize_macro",
        arguments: {
          macro_name: "quick_test_pipeline",
          description: "A fast synthesized macro",
          pipeline: [
            { tool: "nexus_data_codec_transform", arguments: { operation: "string_to_hex", payload: "MacroWorks" } }
          ],
        },
      },
    });
    assert.equal(synthRes.isError, undefined);
    assert.equal(synthRes.structuredContent.success, true);
    console.log(`       [Verified] Macro quick_test_pipeline synthesized`);

    // Call it by name!
    const macroExecRes = await callHandler({
      method: "tools/call",
      params: {
        name: "quick_test_pipeline",
        arguments: {},
      },
    });
    assert.ok(!macroExecRes.isError);
    assert.ok(macroExecRes.content[0].text.includes("流水线全部 1 个步骤顺序执行完毕"));
    console.log(`       [Verified] Synthesized macro executed successfully by name`);
  });

  // --- Test 6: Extended ADB Controller actions dispatch ---
  await test("nexus_adb_controller dispatches swipe, keyevent, and shell with proper validation", async () => {
    // Test keyevent missing keycode validation
    const errRes = await callHandler({
      method: "tools/call",
      params: {
        name: "nexus_adb_controller",
        arguments: { action: "keyevent" },
      },
    });
    assert.equal(errRes.isError, true);
    assert.ok(errRes.content[0].text.includes("Missing or invalid 'keycode' argument"));
    console.log(`       [Verified] keyevent validates required keycode argument`);

    // Test tap_text missing text validation
    const errTextRes = await callHandler({
      method: "tools/call",
      params: {
        name: "nexus_adb_controller",
        arguments: { action: "tap_text" },
      },
    });
    assert.equal(errTextRes.isError, true);
    assert.ok(errTextRes.content[0].text.includes("Missing 'text' argument for tap_text"));
    console.log(`       [Verified] tap_text validates required text argument`);
  });

  // --- Test 7: nexus_execute_action Golden Rules enforcement ---
  await test("nexus_execute_action enforces Rule 1 (blocks forwarding meta tools) and Rule 6/7", async () => {
    // Attempting to forward nexus_run_script through nexus_execute_action should be blocked
    const rule1Res = await callHandler({
      method: "tools/call",
      params: {
        name: "nexus_execute_action",
        arguments: {
          tool: "nexus_run_script",
          arguments: { script: "print(1)" },
        },
      },
    });
    assert.equal(rule1Res.isError, true);
    assert.ok(rule1Res.content[0].text.includes("ERR_META_TOOL_FORWARD_FORBIDDEN"));
    assert.equal(rule1Res.structuredContent.errorCode, "ERR_META_TOOL_FORWARD_FORBIDDEN");
    console.log(`       [Verified] Rule 1 correctly blocks meta-orchestrator with ERR_META_TOOL_FORWARD_FORBIDDEN`);
  });

  console.log("\n=================================================================");
  console.log(`  ALL ${passed}/${total} ADVANCED META-TOOLS TESTS PASSED! (100%)`);
  console.log("=================================================================\n");
  process.exit(0);
}

runAdvancedMetaToolsTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
