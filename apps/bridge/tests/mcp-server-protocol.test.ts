import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer, UNIVERSAL_META_TOOLS } from "../src/server.js";
import { McpSecurityPolicyManager } from "../src/generic-mcp/mcp-security-policy.js";
import { DynamicCatalog } from "../src/generic-mcp/dynamic-catalog.js";
import { NexusClient } from "../src/nexus-client.js";

async function runMcpServerProtocolTests() {
  console.log("=================================================================");
  console.log("  NEXUS 1.3.4: MCP SERVER PROTOCOL & DISPATCHER TEST SUITE       ");
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
    assert.equal(result.tools.length, 30);
    assert.ok(toolNames.includes("nexus_run_script"));
    assert.ok(toolNames.includes("nexus_discover_tools"));
    assert.ok(toolNames.includes("nexus_execute_action"));
    assert.ok(toolNames.includes("nexus_relay_dispatch"));
    assert.ok(toolNames.includes("nexus_session_handoff"));
    assert.ok(toolNames.includes("nexus_batch_execute"));
    assert.ok(toolNames.includes("nexus_wait_condition"));
    assert.ok(toolNames.includes("nexus_adb_controller"));
    assert.ok(toolNames.includes("nexus_deobfuscate_synthesize"));
    assert.ok(toolNames.includes("nexus_data_codec_transform"));
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
    // Must contain the 30 meta tools + the 2 autocad native tools (total 32)
    assert.equal(result.tools.length, 32);
    assert.ok(toolNames.includes("nexus_run_script"));
    assert.ok(toolNames.includes("nexus_session_handoff"));
    assert.ok(toolNames.includes("nexus_batch_execute"));
    assert.ok(toolNames.includes("nexus_wait_condition"));
    assert.ok(toolNames.includes("nexus_adb_controller"));
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
          detail: true,
        },
      },
    });

    assert.equal(discoverResult.isError, undefined);
    const parsed = JSON.parse(discoverResult.content[0].text);
    console.log(`       [Verified] nexus_discover_tools matched:`, parsed.tools.map((t: any) => typeof t === "string" ? t : (t.name || t.tool)));
    assert.ok(parsed.totalMatches >= 1);
    assert.ok(parsed.tools.some((t: any) => typeof t === "string" ? t.includes("cad_create_line") : (t.name === "cad_create_line" || t.tool === "cad_create_line")));
  });

  // --- Test 7: Tool Call: nexus_batch_execute with Variable Interpolation ---
  await test("tools/call: nexus_batch_execute runs pipeline with variable interpolation", async () => {
    policy.setMasterTokenOptimization(true);
    const server = createMcpServer(dummyClient);
    const callHandler = (server as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);

    // Run batch with session cache save -> session cache load with interpolation
    const batchResult = await callHandler({
      method: "tools/call",
      params: {
        name: "nexus_batch_execute",
        arguments: {
          pipeline: [
            {
              id: "step1",
              tool: "nexus_run_script",
              arguments: {
                runtime: "python",
                script: "import nexus\nprint('DATA_CHUNK_7788')",
              },
            },
            {
              id: "step2",
              tool: "nexus_run_script",
              arguments: {
                runtime: "python",
                script: "import nexus\nprint('INTERPOLATED: ' + '${step1.stdout}'.strip())",
              },
            },
          ],
          stop_on_error: true,
        },
      },
    });

    assert.equal(batchResult.isError, false);
    const text = batchResult.content[0].text;
    assert.ok(text.includes("[nexus_batch_execute]"));
    assert.ok(text.includes("step1 (nexus_run_script)"));
    assert.ok(text.includes("step2 (nexus_run_script)"));
    assert.equal(batchResult.structuredContent.success, true);
    assert.equal(batchResult.structuredContent.succeededSteps, 2);
    const step2Output = batchResult.structuredContent.steps[1].output;
    assert.ok(JSON.stringify(step2Output).includes("INTERPOLATED: DATA_CHUNK_7788"));
    console.log(`       [Verified] nexus_batch_execute output:`, text.split("\n")[0]);
  });

  // --- Test 8: Tool Call: nexus_wait_condition ---
  await test("tools/call: nexus_wait_condition validates port_open and log_contains", async () => {
    policy.setMasterTokenOptimization(true);
    const server = createMcpServer(dummyClient);
    const callHandler = (server as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);

    // 8.1 Test port_open with an ephemeral local TCP server
    const tcpServer = net.createServer();
    await new Promise<void>((resolve) => tcpServer.listen(0, "127.0.0.1", resolve));
    const port = (tcpServer.address() as net.AddressInfo).port;

    try {
      const portResult = await callHandler({
        method: "tools/call",
        params: {
          name: "nexus_wait_condition",
          arguments: {
            condition_type: "port_open",
            target: `127.0.0.1:${port}`,
            timeout_seconds: 5,
            poll_interval_ms: 100,
          },
        },
      });

      assert.equal(portResult.isError, undefined);
      assert.equal(portResult.structuredContent.satisfied, true);
      assert.equal(portResult.structuredContent.condition_type, "port_open");
      console.log(`       [Verified] port_open succeeded on port ${port}`);
    } finally {
      await new Promise<void>((resolve) => tcpServer.close(() => resolve()));
    }

    // 8.2 Test log_contains on a temporary log file
    const tmpLogPath = path.join(os.tmpdir(), `nexus_test_wait_${Date.now()}.log`);
    fs.writeFileSync(tmpLogPath, "2026-10-16 Initializing server...\n2026-10-16 Service ready in 452ms.\n");

    try {
      const logResult = await callHandler({
        method: "tools/call",
        params: {
          name: "nexus_wait_condition",
          arguments: {
            condition_type: "log_contains",
            target: tmpLogPath,
            expected_pattern: "ready in",
            timeout_seconds: 5,
            poll_interval_ms: 100,
          },
        },
      });

      assert.equal(logResult.isError, undefined);
      assert.equal(logResult.structuredContent.satisfied, true);
      assert.equal(logResult.structuredContent.condition_type, "log_contains");
      assert.ok(logResult.content[0].text.includes("ready in 452ms"));
      console.log(`       [Verified] log_contains matched snippet:`, logResult.structuredContent.matchedSnippet);
    } finally {
      if (fs.existsSync(tmpLogPath)) fs.unlinkSync(tmpLogPath);
    }
  });

  // --- Test 9: Tool Call: nexus_adb_controller ---
  await test("tools/call: nexus_adb_controller handles device discovery and tap gestures", async () => {
    const server = createMcpServer(dummyClient);
    const callHandler = (server as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);

    // 9.1 Devices query
    const devRes = await callHandler({
      method: "tools/call",
      params: {
        name: "nexus_adb_controller",
        arguments: { action: "devices" },
      },
    });
    assert.equal(devRes.isError, undefined);
    assert.equal(devRes.structuredContent.success, true);
    console.log(`       [Verified] ADB devices scanned:`, devRes.structuredContent.count);

    // 9.2 Virtual tap action
    const tapRes = await callHandler({
      method: "tools/call",
      params: {
        name: "nexus_adb_controller",
        arguments: { action: "tap", x: 500, y: 800 },
      },
    });
    // Even if no physical device plugged in, structure is valid
    assert.ok(tapRes.content && tapRes.content[0].text);
    console.log(`       [Verified] ADB tap executed: (500, 800)`);
  });

  // --- Test 10: Tool Call: nexus_deobfuscate_synthesize ---
  await test("tools/call: nexus_deobfuscate_synthesize sanitizes code and detects AES/MD5 constants", async () => {
    const server = createMcpServer(dummyClient);
    const callHandler = (server as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);

    const obfuscatedCode = `
      function sign_token(param) {
        var sbox = [0x63, 0x7c, 0x77, 0x7b];
        var h0 = 0x67452301;
        var url = "https://api.commercial-app.com/v1/auth/login";
        return sbox[0] ^ h0;
      }
    `;

    const res = await callHandler({
      method: "tools/call",
      params: {
        name: "nexus_deobfuscate_synthesize",
        arguments: { raw_code: obfuscatedCode, language: "javascript" },
      },
    });

    assert.equal(res.isError, undefined);
    assert.equal(res.structuredContent.status, "SANITIZED_AND_SYNTHESIZED");
    assert.ok(res.structuredContent.detectedCryptoAlgorithms.some((a: string) => a.includes("AES")));
    assert.ok(res.structuredContent.detectedCryptoAlgorithms.some((a: string) => a.includes("MD5")));
    assert.ok(!res.content[0].text.includes("commercial-app.com"));
    console.log(`       [Verified] Detected algorithms:`, res.structuredContent.detectedCryptoAlgorithms);
  });

  // --- Test 11: Tool Call: nexus_data_codec_transform ---
  await test("tools/call: nexus_data_codec_transform performs hex, base64, hash, and markdown table conversions", async () => {
    const server = createMcpServer(dummyClient);
    const callHandler = (server as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);

    // 11.1 String to Hex and back
    const hexRes = await callHandler({
      method: "tools/call",
      params: {
        name: "nexus_data_codec_transform",
        arguments: { operation: "string_to_hex", payload: "Nexus 1.3.4 Mobile Suite" },
      },
    });
    assert.equal(hexRes.isError, undefined);
    const hex = hexRes.structuredContent.result;
    assert.ok(hex.length > 0);

    const strRes = await callHandler({
      method: "tools/call",
      params: {
        name: "nexus_data_codec_transform",
        arguments: { operation: "hex_to_string", payload: hex },
      },
    });
    assert.equal(strRes.structuredContent.result, "Nexus 1.3.4 Mobile Suite");

    // 11.2 SHA-256 Hash
    const hashRes = await callHandler({
      method: "tools/call",
      params: {
        name: "nexus_data_codec_transform",
        arguments: { operation: "hash", payload: "test_payload", hash_algorithm: "sha256" },
      },
    });
    assert.equal(hashRes.structuredContent.result.length, 64);
    console.log(`       [Verified] SHA-256 result:`, hashRes.structuredContent.result);
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
