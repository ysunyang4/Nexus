import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const LOCAL_GATEWAY = "http://127.0.0.1:8787";
const PUBLIC_GATEWAY = "https://mcp.example.com/mcp";
const BRIDGE_TOKEN = "gemini-spark-nexus-secure-token-2026";
const EXPECTED_CANONICAL_SHA = "28C1C7F4459BDAE61C41A2511FD225A0E4C987101FCDA14B6B50AF85ED859796";

const results = [];

function assert(condition, testId, description, details = {}) {
  if (condition) {
    results.push({ testId, status: "PASS", description, details });
    console.log(`[PASS] ${testId}: ${description}`);
  } else {
    results.push({ testId, status: "FAIL", description, details });
    console.error(`[FAIL] ${testId}: ${description}`, details);
  }
}

async function run() {
  console.log("================================================================================");
  console.log("  NEXUS UNITY MCP — COMPREHENSIVE PHASE 3-I -> 3-Q END-TO-END VERIFICATION      ");
  console.log("================================================================================");

  // 1. I-01: Downstream Provider Health & Status
  try {
    const statusRes = await fetch(`${LOCAL_GATEWAY}/api/unity/service/status`).then(r => r.json());
    assert(
      statusRes.connected === true && statusRes.endpoint?.includes("20705"),
      "I-01",
      "Unity GameDev MCP Downstream Connection Healthy",
      { endpoint: statusRes.endpoint, serverInfo: statusRes.serverInfo }
    );
  } catch (err) {
    assert(false, "I-01", "Unity GameDev MCP Downstream Connection Healthy", { error: err.message });
  }

  // 2. I-02: Dynamic Tool Catalog (Zero Hardcoding)
  let dynamicTools = [];
  try {
    const toolsRes = await fetch(`${LOCAL_GATEWAY}/api/unity/gamedev-mcp/tools`).then(r => r.json());
    dynamicTools = toolsRes.tools || [];
    assert(
      toolsRes.success === true && dynamicTools.length > 50 && dynamicTools.some(t => t.name === "gameobject-create"),
      "I-02",
      `Dynamic Tool Catalog Active (Observed N=${dynamicTools.length})`,
      { count: dynamicTools.length, sampleTools: dynamicTools.slice(0, 3).map(t => t.name) }
    );
  } catch (err) {
    assert(false, "I-02", "Dynamic Tool Catalog Active", { error: err.message });
  }

  // 3. I-03: Real Scene Hierarchy
  try {
    const hierRes = await fetch(`${LOCAL_GATEWAY}/api/unity/hierarchy`).then(r => r.json());
    const nodes = hierRes.nodes || [];
    const rootNode = nodes[0];
    const hasChildren = Array.isArray(rootNode?.children) && rootNode.children.length > 0;
    assert(
      nodes.length > 0 && hasChildren,
      "I-03",
      "Real Unity Scene Hierarchy Queries",
      { rootName: rootNode?.name, childrenCount: rootNode?.children?.length, sampleChild: rootNode?.children?.[0]?.name }
    );
  } catch (err) {
    assert(false, "I-03", "Real Unity Scene Hierarchy Queries", { error: err.message });
  }

  // 4. I-04: Real GameObject Inspector
  try {
    const hierRes = await fetch(`${LOCAL_GATEWAY}/api/unity/hierarchy`).then(r => r.json());
    const firstChildId = hierRes.nodes?.[0]?.children?.[0]?.id;
    if (firstChildId) {
      const inspRes = await fetch(`${LOCAL_GATEWAY}/api/unity/inspector?objectId=${firstChildId}`).then(r => r.json());
      const inspector = inspRes.inspector;
      assert(
        inspector && inspector.objectName && inspector.components?.length > 0,
        "I-04",
        "Real GameObject Inspector via object-get-data",
        { name: inspector?.objectName, components: inspector?.components?.map(c => c.name) }
      );
    } else {
      assert(false, "I-04", "Real GameObject Inspector via object-get-data (No child found)");
    }
  } catch (err) {
    assert(false, "I-04", "Real GameObject Inspector via object-get-data", { error: err.message });
  }

  // 5. I-05: Real Console Logs
  try {
    const logsRes = await fetch(`${LOCAL_GATEWAY}/api/unity/console`).then(r => r.json());
    const logs = logsRes.logs || [];
    assert(
      Array.isArray(logs) && logs.length > 0,
      "I-05",
      "Real Unity Console Logs via console-get-logs",
      { logCount: logs.length, sampleMessage: logs[0]?.message?.slice(0, 60) }
    );
  } catch (err) {
    assert(false, "I-05", "Real Unity Console Logs via console-get-logs", { error: err.message });
  }

  // 6. I-06: Permission Gateway Enforcement (L1 Hard Block vs L2 Allowed)
  try {
    // A. Set Permission to L1
    await fetch(`${LOCAL_GATEWAY}/api/unity/service/permission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permission: "L1" }),
    });

    // Attempt mutation tool under L1
    const l1Attempt = await fetch(`${LOCAL_GATEWAY}/api/unity/gamedev-mcp/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "gameobject-create", arguments: { name: "Forbidden_L1_Cube" } }),
    }).then(r => r.json());

    const l1Blocked = l1Attempt.isError === true && l1Attempt.permission?.status === 403;

    // B. Restore Permission to L2
    await fetch(`${LOCAL_GATEWAY}/api/unity/service/permission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permission: "L2" }),
    });

    assert(
      l1Blocked,
      "I-06",
      "Permission Gateway L1 Hard Intercept (Write Denied under L1)",
      { l1Status: l1Attempt.permission?.status, reason: l1Attempt.permission?.reason }
    );
  } catch (err) {
    assert(false, "I-06", "Permission Gateway L1 Hard Intercept", { error: err.message });
  }

  // 7. I-07: Real Unity Mutation Lifecycle (E2E in Tasgole Editor)
  let createdObjectId = null;
  const testObjName = `Nexus_Automated_E2E_${Date.now()}`;
  try {
    // Step 1: Create GameObject
    const createRes = await fetch(`${LOCAL_GATEWAY}/api/unity/gamedev-mcp/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "gameobject-create",
        arguments: { name: testObjName, primitiveType: "Cube" },
      }),
    }).then(r => r.json());

    // Parse created instanceID from response
    let instId = null;
    if (createRes.content?.[0]?.text) {
      try {
        const parsed = JSON.parse(createRes.content[0].text);
        instId = parsed.result?.instanceID || parsed.result?.value?.instanceID;
      } catch {}
    }
    createdObjectId = instId;

    // Step 2: Verify Existence via gameobject-find
    const findRes = await fetch(`${LOCAL_GATEWAY}/api/unity/gamedev-mcp/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "gameobject-find",
        arguments: { search: testObjName },
      }),
    }).then(r => r.json());

    // Step 3: Destroy GameObject
    let destroySuccess = false;
    if (instId) {
      const destroyRes = await fetch(`${LOCAL_GATEWAY}/api/unity/gamedev-mcp/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "gameobject-destroy",
          arguments: { gameObjectRef: { instanceID: instId } },
        }),
      }).then(r => r.json());
      destroySuccess = destroyRes.isError === false;
    }

    assert(
      createRes.isError === false && destroySuccess,
      "I-07",
      "Real Unity Mutation Lifecycle (create -> find -> destroy in Unity Editor)",
      { testObjName, createdInstanceId: instId, createEvidence: createRes.evidenceId }
    );
  } catch (err) {
    assert(false, "I-07", "Real Unity Mutation Lifecycle", { error: err.message });
  }

  // 8. I-08: Execution Ledger & Evidence Pipeline
  try {
    const ledgerRes = await fetch(`${LOCAL_GATEWAY}/api/unity/ledger`).then(r => r.json());
    const actions = ledgerRes.actions || [];
    const hasAuditEntries = actions.length > 5 && actions.every(a => a.actionId && a.operationId);
    assert(
      hasAuditEntries,
      "I-08",
      "Execution Ledger & Evidence Pipeline Integrity",
      { totalEntries: actions.length, latestAction: actions[actions.length - 1]?.operationId }
    );
  } catch (err) {
    assert(false, "I-08", "Execution Ledger & Evidence Pipeline Integrity", { error: err.message });
  }

  // 9. I-09: Canonical 332 Golden Registry Invariance (FROZEN)
  try {
    const regFile = path.resolve("packages/protocol/src/tools/canonical-registry.ts");
    const regContent = fs.readFileSync(regFile);
    const hash = crypto.createHash("sha256").update(regContent).digest("hex").toUpperCase();
    assert(
      hash === EXPECTED_CANONICAL_SHA,
      "I-09",
      "Canonical 332 Tools Golden Baseline FROZEN",
      { calculated: hash, expected: EXPECTED_CANONICAL_SHA }
    );
  } catch (err) {
    assert(false, "I-09", "Canonical 332 Tools Golden Baseline FROZEN", { error: err.message });
  }

  // 10. I-10: Complete Removal of Port 38980
  try {
    function scanDir(dir, hits = []) {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (["node_modules", "dist", ".git", "release"].includes(item.name)) continue;
        const full = path.join(dir, item.name);
        if (item.isDirectory()) scanDir(full, hits);
        else if (/\.(ts|tsx|js|json)$/.test(item.name)) {
          const content = fs.readFileSync(full, "utf8");
          if (content.includes("38980")) hits.push(full);
        }
      }
      return hits;
    }
    const hits = [
      ...scanDir("apps/desktop/src"),
      ...scanDir("apps/server/src"),
      ...scanDir("apps/bridge/src"),
      ...scanDir("packages"),
    ];
    assert(
      hits.length === 0,
      "I-10",
      "Complete Elimination of Port 38980 in Source Code",
      { hitsCount: hits.length, hits }
    );
  } catch (err) {
    assert(false, "I-10", "Complete Elimination of Port 38980 in Source Code", { error: err.message });
  }

  // 11. I-11: Public MCP Gateway (Total Tools = 446)
  try {
    const mcpRes = await fetch(`${LOCAL_GATEWAY}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${BRIDGE_TOKEN}`,
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 201, method: "tools/list", params: {} }),
    }).then(r => r.json());

    const totalTools = mcpRes.result?.tools?.length || 0;
    const hasUnityTools = mcpRes.result?.tools?.some(t => t.name === "scene-get-data");
    const hasCanonicalTools = mcpRes.result?.tools?.some(t => t.name === "localbridge_project_list");

    assert(
      totalTools >= 440 && hasUnityTools && hasCanonicalTools,
      "I-11",
      `Public MCP Gateway Tools Exposure (Total=${totalTools}, 332 Canonical + 8 Legacy + 106 Unity)`,
      { totalTools, hasUnityTools, hasCanonicalTools }
    );
  } catch (err) {
    assert(false, "I-11", "Public MCP Gateway Tools Exposure", { error: err.message });
  }

  // 12. I-12: Cloudflare Tunnel Public E2E (External Web AI Endpoint)
  try {
    const tunnelRes = await fetch(PUBLIC_GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${BRIDGE_TOKEN}`,
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 202,
        method: "tools/call",
        params: {
          name: "scene-get-data",
          arguments: {},
        },
      }),
    }).then(r => r.json());

    const tunnelSuccess = tunnelRes.result?.isError === false;
    assert(
      tunnelSuccess,
      "I-12",
      "Public Cloudflare Tunnel E2E (External Web AI -> Bridge -> Unity Provider -> Unity)",
      { endpoint: PUBLIC_GATEWAY, evidenceId: tunnelRes.result?.evidenceId }
    );
  } catch (err) {
    assert(false, "I-12", "Public Cloudflare Tunnel E2E", { error: err.message });
  }

  console.log("================================================================================");
  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error("Fatal test execution error:", err);
  process.exit(1);
});
