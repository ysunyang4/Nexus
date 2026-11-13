/**
 * PHASE 3-H Comprehensive Verification Test Suite
 * 
 * Verifies:
 * - H-01: Dynamic Handshake & Catalog (Downstream N tools matching)
 * - H-02: Catalog Schema & Metadata Precision (1:1 preservation + provider metadata)
 * - H-03: Dynamic Catalog Refresh (No restart, zero duplication)
 * - H-04: Real Unity Tool Invocation & Ledger/Evidence Lifecycle (REAL UNITY VERIFIED)
 * - H-05: Configurable Circuit Breaker Transitions (CLOSED -> OPEN -> HALF_OPEN / Reset)
 * - H-06: Canonical 332 Fault Isolation (Canonical tools succeed while Unity breaker is OPEN)
 * - H-07: Canonical Registry Hash Invariance (Golden SHA-256 match)
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const BRIDGE_BASE = "http://127.0.0.1:8787";
const BRIDGE_TOKEN = "gemini-spark-nexus-secure-token-2026";
const DOWNSTREAM_ENDPOINT = "http://127.0.0.1:20705/p/6106087c";
const GOLDEN_CANONICAL_HASH = "28C1C7F4459BDAE61C41A2511FD225A0E4C987101FCDA14B6B50AF85ED859796";

function parseSSEData(text) {
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("data: ")) {
      try {
        return JSON.parse(trimmed.slice(6));
      } catch {}
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function callMcp(method, params = {}, id = 1) {
  const res = await fetch(`${BRIDGE_BASE}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${BRIDGE_TOKEN}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    }),
  });

  const text = await res.text();
  return {
    status: res.status,
    data: parseSSEData(text),
    rawText: text,
  };
}

async function fetchDownstreamDirectCount() {
  const initRes = await fetch(DOWNSTREAM_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 100,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "h01-verifier", version: "1.0" },
      },
    }),
  });

  const sess = initRes.headers.get("mcp-session-id");
  const toolsRes = await fetch(DOWNSTREAM_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(sess ? { "Mcp-Session-Id": sess } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 101,
      method: "tools/list",
      params: {},
    }),
  });

  const text = await toolsRes.text();
  const parsed = parseSSEData(text);
  return {
    count: parsed?.result?.tools?.length || 0,
    tools: parsed?.result?.tools || [],
  };
}

const results = [];

function recordResult(testId, name, passed, details) {
  results.push({ testId, name, passed, details });
  const icon = passed ? "✅ [PASS]" : "❌ [FAIL]";
  console.log(`${icon} ${testId}: ${name}`);
  if (details) {
    console.log(`   Details: ${typeof details === "string" ? details : JSON.stringify(details)}`);
  }
}

async function runAll() {
  console.log("================================================================================");
  console.log("             PHASE 3-H: GENERIC PROVIDER FRAMEWORK & DYNAMIC CATALOG E2E        ");
  console.log("================================================================================");
  console.log(`Bridge: ${BRIDGE_BASE}`);
  console.log(`Downstream: ${DOWNSTREAM_ENDPOINT}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  // ==============================================================================
  // H-01: Dynamic Handshake & Catalog
  // ==============================================================================
  try {
    console.log("--- Executing H-01: Dynamic Handshake & Catalog ---");
    const downstream = await fetchDownstreamDirectCount();
    console.log(`   Direct downstream tools/list returned N = ${downstream.count}`);

    const mcpList = await callMcp("tools/list", {});
    const allTools = mcpList.data?.result?.tools || [];
    const unityTools = allTools.filter((t) => t.annotations?.provider === "unity-gamedev");

    const match = unityTools.length === downstream.count && downstream.count > 0;
    recordResult(
      "H-01",
      "Dynamic Handshake & Catalog matching downstream",
      match,
      `Downstream N=${downstream.count}, Bridge Unity Tools=${unityTools.length}, Total Exposed Tools=${allTools.length}`
    );
  } catch (err) {
    recordResult("H-01", "Dynamic Handshake & Catalog matching downstream", false, err.message);
  }

  // ==============================================================================
  // H-02: Catalog Schema & Metadata Precision
  // ==============================================================================
  try {
    console.log("\n--- Executing H-02: Catalog Schema & Metadata Precision ---");
    const mcpList = await callMcp("tools/list", {});
    const allTools = mcpList.data?.result?.tools || [];
    const unityTools = allTools.filter((t) => t.annotations?.provider === "unity-gamedev");

    const sampleNames = [
      "gameobject-create",
      "gameobject-find",
      "scene-get-data",
      "console-get-logs",
      "cinemachine-camera-create",
      "inputsystem-actions-list",
    ];

    let allSamplesValid = true;
    const sampleDetails = {};

    for (const name of sampleNames) {
      const tool = unityTools.find((t) => t.name === name);
      if (!tool) {
        // Some extension tools might not exist if extension disabled, but standard tools must exist
        if (name.startsWith("gameobject-") || name.startsWith("scene-") || name.startsWith("console-")) {
          allSamplesValid = false;
          sampleDetails[name] = "MISSING_REQUIRED_TOOL";
        }
        continue;
      }

      const hasSchema = Boolean(tool.inputSchema && tool.inputSchema.type === "object");
      const hasAnnotations =
        tool.annotations?.provider === "unity-gamedev" &&
        tool.annotations?.priority === "primary" &&
        tool.annotations?.executionTarget === "unity-editor-native";

      sampleDetails[name] = { hasSchema, hasAnnotations, description: tool.description?.slice(0, 50) };
      if (!hasSchema || !hasAnnotations) {
        allSamplesValid = false;
      }
    }

    recordResult(
      "H-02",
      "Catalog Schema & Metadata Precision",
      allSamplesValid,
      sampleDetails
    );
  } catch (err) {
    recordResult("H-02", "Catalog Schema & Metadata Precision", false, err.message);
  }

  // ==============================================================================
  // H-03: Dynamic Catalog Refresh
  // ==============================================================================
  try {
    console.log("\n--- Executing H-03: Dynamic Catalog Refresh ---");
    const refRes = await fetch(`${BRIDGE_BASE}/unity/tools/refresh`, { method: "POST" });
    const refData = await refRes.json();

    const mcpListAfter = await callMcp("tools/list", {});
    const unityToolsAfter = (mcpListAfter.data?.result?.tools || []).filter(
      (t) => t.annotations?.provider === "unity-gamedev"
    );

    const names = unityToolsAfter.map((t) => t.name);
    const uniqueNames = new Set(names);
    const noDuplicates = names.length === uniqueNames.size;
    const refreshOk = refRes.status === 200 && refData.success && noDuplicates;

    recordResult(
      "H-03",
      "Dynamic Catalog Refresh without restart or duplication",
      refreshOk,
      `Refresh HTTP ${refRes.status}, count=${refData.count}, unique=${uniqueNames.size}, duplicates=${names.length - uniqueNames.size}`
    );
  } catch (err) {
    recordResult("H-03", "Dynamic Catalog Refresh", false, err.message);
  }

  // ==============================================================================
  // H-04: Real Unity Tool Invocation & Ledger/Evidence Lifecycle
  // ==============================================================================
  try {
    console.log("\n--- Executing H-04: Real Unity Tool Invocation & Ledger Lifecycle ---");
    const testGoName = `Phase3H_Target_${Date.now()}`;

    // 1. Create GameObject in Unity
    console.log(`   Calling 'gameobject-create' with name='${testGoName}'...`);
    const createRes = await callMcp("tools/call", {
      name: "gameobject-create",
      arguments: { name: testGoName },
    }, 201);

    const createSuccess = createRes.status === 200 && !createRes.data?.error && !createRes.data?.result?.isError;
    const createEvidenceId = createRes.data?.result?.evidenceId;

    // 2. Query GameObject in Unity
    console.log(`   Calling 'gameobject-find' for '${testGoName}'...`);
    const findRes = await callMcp("tools/call", {
      name: "gameobject-find",
      arguments: { search_term: testGoName },
    }, 202);

    const findSuccess = findRes.status === 200 && !findRes.data?.error && !findRes.data?.result?.isError;
    const findEvidenceId = findRes.data?.result?.evidenceId;

    // 3. Clean up: Destroy GameObject
    console.log(`   Calling 'gameobject-destroy' to clean up '${testGoName}'...`);
    await callMcp("tools/call", {
      name: "gameobject-destroy",
      arguments: { name: testGoName },
    }, 203);

    // 4. Verify Ledger & Evidence store
    let evidenceVerified = false;
    if (createEvidenceId) {
      const evRes = await fetch(`${BRIDGE_BASE}/unity/evidence/${createEvidenceId}`);
      const evJson = await evRes.json();
      if (evJson?.evidence?.status === "COMMITTED" && evJson?.evidence?.verificationPassed) {
        evidenceVerified = true;
      }
    }

    const h04Passed = createSuccess && findSuccess && evidenceVerified;
    recordResult(
      "H-04",
      "Real Unity Tool Invocation & Full Ledger/Evidence Lifecycle",
      h04Passed,
      {
        createSuccess,
        findSuccess,
        createEvidenceId,
        findEvidenceId,
        evidenceStatus: evidenceVerified ? "COMMITTED & VERIFIED" : "UNVERIFIED",
      }
    );
  } catch (err) {
    recordResult("H-04", "Real Unity Tool Invocation & Ledger Lifecycle", false, err.message);
  }

  // ==============================================================================
  // H-05: Configurable Circuit Breaker Transitions
  // ==============================================================================
  try {
    console.log("\n--- Executing H-05: Configurable Circuit Breaker Transitions ---");
    // 1. Initial State: CLOSED
    const cbInitialRes = await fetch(`${BRIDGE_BASE}/unity/circuit-breaker`);
    const cbInitial = await cbInitialRes.json();
    console.log(`   Initial circuit breaker state: ${cbInitial.state}`);

    // 2. Trip Breaker to OPEN for testing
    const tripRes = await fetch(`${BRIDGE_BASE}/unity/circuit-breaker/trip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "H-05 Automated Verification Trip" }),
    });
    const tripJson = await tripRes.json();
    console.log(`   Trip response state: ${tripJson.status?.state}`);

    // 3. Verify Fast-fail while OPEN
    const fastFailRes = await callMcp("tools/call", {
      name: "gameobject-find",
      arguments: { search_term: "Any" },
    }, 501);

    const isFastFail =
      fastFailRes.data?.result?.isError &&
      fastFailRes.data?.result?.permission?.code === "CIRCUIT_BREAKER_OPEN" &&
      fastFailRes.data?.result?.permission?.status === 503;

    console.log(`   Fast-fail verified: ${isFastFail} (status=${fastFailRes.data?.result?.permission?.status}, code=${fastFailRes.data?.result?.permission?.code})`);

    // 4. Reset Breaker back to CLOSED
    const resetRes = await fetch(`${BRIDGE_BASE}/unity/circuit-breaker/reset`, { method: "POST" });
    const resetJson = await resetRes.json();
    console.log(`   Reset response state: ${resetJson.status?.state}`);

    const h05Passed =
      cbInitial.state === "CLOSED" &&
      tripJson.status?.state === "OPEN" &&
      isFastFail &&
      resetJson.status?.state === "CLOSED";

    recordResult(
      "H-05",
      "Configurable Circuit Breaker Transitions (CLOSED -> OPEN -> Fast Fail -> CLOSED)",
      h05Passed,
      {
        initial: cbInitial.state,
        tripped: tripJson.status?.state,
        fastFail: isFastFail,
        recovered: resetJson.status?.state,
      }
    );
  } catch (err) {
    recordResult("H-05", "Configurable Circuit Breaker Transitions", false, err.message);
  }

  // ==============================================================================
  // H-06: Canonical 332 Isolation under Downstream Fault
  // ==============================================================================
  try {
    console.log("\n--- Executing H-06: Canonical 332 Fault Isolation ---");
    // 1. Trip breaker to OPEN so Unity Provider is completely down
    await fetch(`${BRIDGE_BASE}/unity/circuit-breaker/trip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "H-06 Isolation Test Trip" }),
    });

    // 2. Invoke Canonical tool over MCP
    const canonicalRes = await callMcp("tools/call", {
      name: "nexus_project_list",
      arguments: {},
    }, 601);

    const canonicalOk =
      canonicalRes.status === 200 &&
      !canonicalRes.data?.error &&
      !canonicalRes.data?.result?.isError &&
      Array.isArray(canonicalRes.data?.result?.content);

    // 3. Reset breaker back to CLOSED
    await fetch(`${BRIDGE_BASE}/unity/circuit-breaker/reset`, { method: "POST" });

    recordResult(
      "H-06",
      "Canonical 332 Fault Isolation while Unity Provider is OPEN",
      canonicalOk,
      {
        canonicalTool: "nexus_project_list",
        status: canonicalRes.status,
        hasContent: canonicalOk,
      }
    );
  } catch (err) {
    recordResult("H-06", "Canonical 332 Fault Isolation", false, err.message);
  }

  // ==============================================================================
  // H-07: Canonical Registry Hash Invariance Guard
  // ==============================================================================
  try {
    console.log("\n--- Executing H-07: Canonical Registry Hash Invariance Guard ---");
    const registryPath = path.resolve(process.cwd(), "packages/protocol/src/tools/canonical-registry.ts");
    const content = fs.readFileSync(registryPath);
    const hash = crypto.createHash("sha256").update(content).digest("hex").toUpperCase();

    const matches = hash === GOLDEN_CANONICAL_HASH;
    recordResult(
      "H-07",
      "Canonical Registry SHA-256 Invariance Guard",
      matches,
      {
        computed: hash,
        golden: GOLDEN_CANONICAL_HASH,
        exactMatch: matches,
      }
    );
  } catch (err) {
    recordResult("H-07", "Canonical Registry Hash Invariance Guard", false, err.message);
  }

  // ==============================================================================
  // Summary
  // ==============================================================================
  console.log("\n================================================================================");
  console.log("                           PHASE 3-H TEST VERDICT                               ");
  console.log("================================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  console.log(`Total Tests: ${total} | Passed: ${passed} | Failed: ${failed}`);
  if (failed === 0) {
    console.log(">>> VERDICT: ALL PHASE 3-H ACCEPTANCE CRITERIA PASSED! <<<");
  } else {
    console.error(">>> VERDICT: PHASE 3-H VERIFICATION FAILED! <<<");
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error("Fatal test execution error:", err);
  process.exit(1);
});
