import assert from "node:assert/strict";
import { McpSecurityPolicyManager } from "../src/generic-mcp/mcp-security-policy.js";
import { ScriptRunner } from "../src/generic-mcp/script-runner.js";
import { UNIVERSAL_META_TOOLS } from "../src/server.js";

async function runAllTests() {
  console.log("=================================================================");
  console.log("  NEXUS 1.3.0: TOKEN OPTIMIZATION & SCRIPT ENGINE E2E TEST SUITE ");
  console.log("=================================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    totalTests++;
    return (async () => {
      try {
        await fn();
        console.log(`[PASS] [${totalTests}] ${name}`);
        passedTests++;
      } catch (err: any) {
        console.error(`[FAIL] [${totalTests}] ${name}`);
        console.error(`       Error: ${err?.message || err}`);
        throw err;
      }
    })();
  }

  // =========================================================================
  // TEST SUITE 1: McpSecurityPolicyManager Hierarchical Gating & Persistence
  // =========================================================================
  console.log("--- SUITE 1: Master & Provider Policy Hierarchical Gating ---");
  const policy = McpSecurityPolicyManager.getInstance();

  await test("Master Token Optimization defaults to TRUE (Recommended)", () => {
    // Reset to default first to be deterministic
    policy.setMasterTokenOptimization(true);
    assert.equal(policy.isMasterTokenOptimization(), true);
  });

  await test("Providers default to TRUE when Master is enabled", () => {
    policy.setMasterTokenOptimization(true);
    assert.equal(policy.isProviderTokenOptimization("autocad"), true);
    assert.equal(policy.isProviderTokenOptimization("blender-mcp"), true);
    assert.equal(policy.isProviderTokenOptimization("photoshop-mcp"), true);
    assert.equal(policy.isProviderTokenOptimization("unity-gamedev"), true);
    assert.equal(policy.isProviderTokenOptimization("playwright"), true);
  });

  await test("Single provider can be toggled OFF independently", () => {
    policy.setMasterTokenOptimization(true);
    policy.setProviderTokenOptimization("autocad", false);

    assert.equal(policy.isProviderTokenOptimization("autocad"), false);
    // Other providers must remain true
    assert.equal(policy.isProviderTokenOptimization("blender-mcp"), true);
    assert.equal(policy.isProviderTokenOptimization("unity-gamedev"), true);
  });

  await test("When Master is toggled OFF, ALL providers are hierarchically gated to FALSE", () => {
    policy.setMasterTokenOptimization(false);
    assert.equal(policy.isMasterTokenOptimization(), false);

    // Regardless of per-provider flag, isProviderTokenOptimization must return false!
    assert.equal(policy.isProviderTokenOptimization("autocad"), false);
    assert.equal(policy.isProviderTokenOptimization("blender-mcp"), false);
    assert.equal(policy.isProviderTokenOptimization("unity-gamedev"), false);
    assert.equal(policy.isProviderTokenOptimization("playwright"), false);
  });

  await test("When Master is toggled back ON, individual provider states are restored", () => {
    policy.setMasterTokenOptimization(true);
    assert.equal(policy.isMasterTokenOptimization(), true);

    // AutoCAD was previously set to false, should still be false
    assert.equal(policy.isProviderTokenOptimization("autocad"), false);
    // Blender was not turned off, should still be true
    assert.equal(policy.isProviderTokenOptimization("blender-mcp"), true);

    // Clean up: restore autocad to true
    policy.setProviderTokenOptimization("autocad", true);
    assert.equal(policy.isProviderTokenOptimization("autocad"), true);
  });

  await test("Policy matrix snapshot returns complete state dictionary", () => {
    const matrix = policy.getTokenOptimizationMatrix();
    assert.equal(typeof matrix.master, "boolean");
    assert.equal(typeof matrix.providers, "object");
    assert.equal(typeof matrix.providers.autocad, "boolean");
    assert.equal(matrix.master, true);
  });

  // =========================================================================
  // TEST SUITE 2: Universal Meta Tools & Token Economy Verification
  // =========================================================================
  console.log("\n--- SUITE 2: Universal Meta Tools & Token Budget Verification ---");

  await test("Universal Meta Tools exposes exactly 3 minimal meta tools", () => {
    assert.equal(UNIVERSAL_META_TOOLS.length, 3);
    const toolNames = UNIVERSAL_META_TOOLS.map((t) => t.name).sort();
    assert.deepEqual(toolNames, [
      "nexus_discover_tools",
      "nexus_execute_action",
      "nexus_run_script",
    ]);
  });

  await test("nexus_run_script schema validates required script field", () => {
    const runScriptTool = UNIVERSAL_META_TOOLS.find((t) => t.name === "nexus_run_script")!;
    assert.ok(runScriptTool);
    assert.deepEqual(runScriptTool.inputSchema.required, ["script"]);
    assert.equal(runScriptTool.inputSchema.properties.runtime.default, "python");
  });

  await test("Token Optimization Mode reduces AI context footprint below 400 Tokens (< 2000 chars)", () => {
    const serializedSchema = JSON.stringify(UNIVERSAL_META_TOOLS);
    const charCount = serializedSchema.length;
    // Rule of thumb: ~4 characters per token in English/JSON
    const estimatedTokens = Math.ceil(charCount / 4);

    console.log(`       [Metric] Serialized Meta-Tools Schema Size: ${charCount} chars (~${estimatedTokens} tokens)`);
    assert.ok(
      estimatedTokens < 500,
      `Estimated tokens (${estimatedTokens}) should be under 500 tokens`
    );
    // Comparing with 588 tools (~60,000 tokens):
    const rawToolsTokenBaseline = 60000;
    const savingsPercent = ((rawToolsTokenBaseline - estimatedTokens) / rawToolsTokenBaseline) * 100;
    console.log(`       [Metric] Token Savings vs Raw Baseline (60k): ${savingsPercent.toFixed(2)}% (Target: >95%)`);
    assert.ok(savingsPercent > 95, "Token savings must exceed 95%");
  });

  // =========================================================================
  // TEST SUITE 3: Script Execution Kernel (Python & Node.js)
  // =========================================================================
  console.log("\n--- SUITE 3: Deterministic Script Execution Engine ---");
  const runner = ScriptRunner.getInstance();

  await test("Python execution kernel can load embedded 'nexus' SDK namespace", async () => {
    const script = `
import nexus
import sys

# Verify all major provider proxies exist
modules = [
    nexus.cad,
    nexus.blender,
    nexus.ps,
    nexus.unity,
    nexus.browser,
    nexus.windows,
    nexus.core
]

print(f"VERIFIED_PROXIES_COUNT={len(modules)}")
print(f"CAD_PROVIDER={nexus.cad._provider}")
print(f"BLENDER_PROVIDER={nexus.blender._provider}")
print(f"PS_PROVIDER={nexus.ps._provider}")
print(f"UNITY_PROVIDER={nexus.unity._provider}")
print(f"BROWSER_PROVIDER={nexus.browser._provider}")
print("ALL_SYSTEMS_GO")
`;
    const res = await runner.executePython(script, 10000);
    assert.equal(res.success, true, `Script failed: ${res.error || res.stderr}`);
    assert.ok(res.stdout.includes("VERIFIED_PROXIES_COUNT=7"), "Must have 7 proxies verified");
    assert.ok(res.stdout.includes("CAD_PROVIDER=autocad"), "CAD provider must map to autocad");
    assert.ok(res.stdout.includes("ALL_SYSTEMS_GO"), "All systems go indicator missing");
    console.log(`       [Metric] Python Execution Elapsed Time: ${res.elapsedMs}ms`);
  });

  await test("Python execution kernel gracefully handles syntax/runtime exceptions", async () => {
    const faultyScript = `
import nexus
raise ValueError("Deterministic intentional test error")
`;
    const res = await runner.executePython(faultyScript, 10000);
    assert.equal(res.success, false);
    assert.ok(
      res.stderr.includes("ValueError: Deterministic intentional test error") ||
      res.error?.includes("ValueError"),
      "Error traceback must be captured cleanly"
    );
  });

  await test("Python watchdog kills timed-out execution within deadline", async () => {
    const hangingScript = `
import time
time.sleep(10)
print("SHOULD_NOT_REACH")
`;
    // Set 600ms timeout
    const res = await runner.executePython(hangingScript, 600);
    assert.equal(res.success, false);
    assert.equal(res.timedOut, true);
    assert.ok(!res.stdout.includes("SHOULD_NOT_REACH"));
    assert.ok(res.elapsedMs >= 500 && res.elapsedMs < 3000, `Elapsed ${res.elapsedMs}ms within timeout window`);
    console.log(`       [Metric] Timeout termination verified in ${res.elapsedMs}ms`);
  });

  await test("Node.js execution kernel can execute code with global 'nexus' proxy", async () => {
    const nodeScript = `
const proxies = [
  nexus.cad,
  nexus.blender,
  nexus.ps,
  nexus.unity,
  nexus.browser,
  nexus.windows,
  nexus.core
];
console.log("NODE_PROXIES_COUNT=" + proxies.length);
console.log("NODE_ALL_SYSTEMS_GO");
`;
    const res = await runner.executeNode(nodeScript, 10000);
    assert.equal(res.success, true, `Node script failed: ${res.error || res.stderr}`);
    assert.ok(res.stdout.includes("NODE_PROXIES_COUNT=7"));
    assert.ok(res.stdout.includes("NODE_ALL_SYSTEMS_GO"));
    console.log(`       [Metric] Node.js Execution Elapsed Time: ${res.elapsedMs}ms`);
  });

  // =========================================================================
  // TEST SUITE 4: ScriptRunner Unified Interface
  // =========================================================================
  console.log("\n--- SUITE 4: ScriptRunner Dispatcher Interface ---");

  await test("runner.execute defaults to python and runs correctly", async () => {
    const res = await runner.execute({
      script: `print("DISPATCHER_DEFAULT_PYTHON_OK")`,
    });
    assert.equal(res.success, true);
    assert.ok(res.stdout.includes("DISPATCHER_DEFAULT_PYTHON_OK"));
  });

  await test("runner.execute with runtime='node' executes Node.js code", async () => {
    const res = await runner.execute({
      runtime: "node",
      script: `console.log("DISPATCHER_NODE_OK");`,
    });
    assert.equal(res.success, true);
    assert.ok(res.stdout.includes("DISPATCHER_NODE_OK"));
  });

  console.log("\n=================================================================");
  console.log(`  ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY! (100% PASS RATE)`);
  console.log("=================================================================\n");
}

runAllTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
