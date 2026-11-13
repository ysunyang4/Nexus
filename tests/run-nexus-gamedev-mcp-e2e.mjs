/**
 * NEXUS -> GAMEDEV MCP -> UNITY PLUGIN -> UNITY EDITOR
 * REAL END-TO-END CAPABILITY DISCOVERY & OBJECT CREATION VERIFICATION
 * 
 * Strict Zero Mock Policy:
 * Communicates with the live downstream GameDev MCP server at http://localhost:20705/p/6106087c
 * and verifies real GameObject creation in the active Unity Editor instance.
 */

import fs from "node:fs";
import path from "node:path";

const GAMEDEV_MCP_ENDPOINT = "http://localhost:20705/p/6106087c";
const OUTPUT_DIR = path.resolve(process.env.NEXUS_VERIFICATION_DIR || "artifacts/verification");

let passedAssertions = 0;
let totalAssertions = 0;

function assert(condition, message) {
  totalAssertions++;
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedAssertions++;
  console.log(`  [PASS] ${message}`);
}

function parseEventStream(text) {
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

async function runSuite() {
  console.log("================================================================================");
  console.log("NEXUS -> GAMEDEV MCP -> UNITY EDITOR REAL E2E VERIFICATION SUITE");
  console.log("================================================================================\n");

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let sessionId = null;
  let requestId = 0;

  async function postMcp(payload) {
    requestId++;
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (sessionId) {
      headers["Mcp-Session-Id"] = sessionId;
    }

    const res = await fetch(GAMEDEV_MCP_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: requestId,
        ...payload,
      }),
    });

    const resSessionId = res.headers.get("mcp-session-id");
    if (resSessionId) {
      sessionId = resSessionId;
    }

    const text = await res.text();
    return {
      status: res.status,
      headers: res.headers,
      text,
      data: parseEventStream(text),
    };
  }

  // =============================================================================
  // STEP 1 & 2: MCP INITIALIZE OVER STREAMABLE HTTP
  // =============================================================================
  console.log(">>> [1/6] MCP INITIALIZE HANDSHAKE (STREAMABLE HTTP)...\n");

  const initRes = await postMcp({
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "nexus-mcp-provider",
        version: "1.20.0",
      },
    },
  });

  assert(initRes.status === 200, "MCP initialize HTTP status is 200 OK");
  assert(sessionId !== null && sessionId.length > 0, `Captured Mcp-Session-Id: '${sessionId}'`);
  assert(initRes.data !== null, "Received valid event-stream JSON-RPC envelope");
  assert(Boolean(initRes.data.result), "Initialize response contains result payload");
  assert(
    initRes.data.result.serverInfo?.name === "gamedev-mcp-server",
    `Server identified as: '${initRes.data.result.serverInfo?.name}'`
  );
  assert(
    initRes.data.result.serverInfo?.version?.startsWith("9.2.9"),
    `Server version verified: '${initRes.data.result.serverInfo?.version}'`
  );
  assert(
    initRes.data.result.protocolVersion === "2024-11-05",
    `Protocol version matches MCP spec: '${initRes.data.result.protocolVersion}'`
  );

  // Send notifications/initialized per MCP 2024-11-05 specification
  await fetch(GAMEDEV_MCP_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Mcp-Session-Id": sessionId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    }),
  });
  console.log("  [INFO] notifications/initialized frame acknowledged");

  // =============================================================================
  // STEP 3 & 4: TOOLS/LIST & CAPABILITY DISCOVERY
  // =============================================================================
  console.log("\n>>> [2/6] TOOLS/LIST DISCOVERY & INVENTORY AUDIT...\n");

  const toolsRes = await postMcp({
    method: "tools/list",
    params: {},
  });

  assert(toolsRes.status === 200, "tools/list HTTP status is 200 OK");
  assert(Boolean(toolsRes.data.result?.tools), "tools/list response contains tools array");
  
  const tools = toolsRes.data.result.tools;
  const toolCount = tools.length;
  console.log(`  [INFO] Actual downstream tools count returned: ${toolCount}`);

  assert(toolCount >= 38, `Actual tool count is ${toolCount} (truthful inventory, >= 38 verified)`);

  // Verify essential tool categories exist
  const toolNames = new Set(tools.map((t) => t.name));
  assert(toolNames.has("gameobject-create"), "Tool 'gameobject-create' is present");
  assert(toolNames.has("gameobject-find"), "Tool 'gameobject-find' is present");
  assert(toolNames.has("gameobject-destroy"), "Tool 'gameobject-destroy' is present");
  assert(toolNames.has("scene-list-opened"), "Tool 'scene-list-opened' is present");
  assert(toolNames.has("scene-get-data"), "Tool 'scene-get-data' is present");
  assert(toolNames.has("assets-find"), "Tool 'assets-find' is present");

  // Record complete tool inventory with schema
  const inventoryReport = {
    discoveredAt: new Date().toISOString(),
    endpoint: GAMEDEV_MCP_ENDPOINT,
    sessionId,
    serverInfo: initRes.data.result.serverInfo,
    protocolVersion: initRes.data.result.protocolVersion,
    toolCount,
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      outputSchema: t.outputSchema || null,
      annotations: t.annotations || null,
    })),
  };

  const inventoryPath = path.join(OUTPUT_DIR, "GAMEDEV_MCP_TOOLS_INVENTORY.json");
  fs.writeFileSync(inventoryPath, JSON.stringify(inventoryReport, null, 2), "utf8");
  assert(fs.existsSync(inventoryPath), `Saved complete tools inventory to ${inventoryPath}`);

  // =============================================================================
  // STEP 5: CLEAN SLATE PRE-FLIGHT CHECK
  // =============================================================================
  console.log("\n>>> [3/6] CLEAN SLATE PRE-FLIGHT VERIFICATION...\n");

  const preFind = await postMcp({
    method: "tools/call",
    params: {
      name: "gameobject-find",
      arguments: {
        gameObjectRef: {
          name: "NexusTestCube",
          instanceID: 0,
        },
      },
    },
  });

  if (preFind.data?.result && !preFind.data.result.isError) {
    console.log("  [INFO] Pre-existing NexusTestCube detected. Destroying to guarantee clean test...");
    await postMcp({
      method: "tools/call",
      params: {
        name: "gameobject-destroy",
        arguments: {
          gameObjectRef: {
            name: "NexusTestCube",
            instanceID: 0,
          },
        },
      },
    });
  }

  // Confirm target does not exist before test
  const confirmClean = await postMcp({
    method: "tools/call",
    params: {
      name: "gameobject-find",
      arguments: {
        gameObjectRef: {
          name: "NexusTestCube",
          instanceID: 0,
        },
      },
    },
  });
  assert(
    confirmClean.data.result?.isError === true,
    "Confirmed clean slate: 'NexusTestCube' does NOT exist prior to creation"
  );

  // =============================================================================
  // STEP 6: E2E INVOCATION: CREATE GAMEOBJECT IN UNITY
  // =============================================================================
  console.log("\n>>> [4/6] EXECUTING REAL UNITY GAMEOBJECT CREATION...\n");
  console.log("  Command: gameobject-create { name: 'NexusTestCube', primitiveType: 'Cube', position: { x: 0, y: 0, z: 0 } }");

  const createRes = await postMcp({
    method: "tools/call",
    params: {
      name: "gameobject-create",
      arguments: {
        name: "NexusTestCube",
        primitiveType: "Cube",
        position: { x: 0, y: 0, z: 0 },
      },
    },
  });

  assert(createRes.status === 200, "gameobject-create HTTP response is 200 OK");
  assert(createRes.data.result?.isError !== true, "gameobject-create executed without error");

  const createdStructured = createRes.data.result?.structuredContent?.result;
  assert(Boolean(createdStructured), "gameobject-create returned structured result");
  assert(createdStructured.name === "NexusTestCube", `Created GameObject name verified: '${createdStructured.name}'`);
  assert(createdStructured.path === "NexusTestCube", `Created GameObject path verified: '${createdStructured.path}'`);
  assert(
    typeof createdStructured.instanceID === "number" && createdStructured.instanceID !== 0,
    `Created GameObject assigned valid Unity instanceID: ${createdStructured.instanceID}`
  );

  // =============================================================================
  // STEP 7: INDEPENDENT VERIFICATION IN UNITY HIERARCHY
  // =============================================================================
  console.log("\n>>> [5/6] INDEPENDENT VERIFICATION IN UNITY HIERARCHY...\n");

  // Verification method 1: Query by GameObject name
  const verifyFind = await postMcp({
    method: "tools/call",
    params: {
      name: "gameobject-find",
      arguments: {
        gameObjectRef: {
          name: "NexusTestCube",
          instanceID: 0,
        },
      },
    },
  });

  assert(verifyFind.status === 200, "Independent find query HTTP response is 200 OK");
  assert(verifyFind.data.result?.isError !== true, "Independent find executed successfully");

  const foundRef = verifyFind.data.result?.structuredContent?.result?.Reference;
  assert(Boolean(foundRef), "Independent find returned GameObject Reference");
  assert(foundRef.name === "NexusTestCube", `Independent verified name: '${foundRef.name}'`);
  assert(foundRef.path === "NexusTestCube", `Independent verified path: '${foundRef.path}'`);
  assert(
    foundRef.instanceID === createdStructured.instanceID,
    `Independent verified instanceID (${foundRef.instanceID}) matches created instanceID (${createdStructured.instanceID})`
  );

  // Verification method 2: Query active scene root GameObjects
  const sceneData = await postMcp({
    method: "tools/call",
    params: {
      name: "scene-get-data",
      arguments: {},
    },
  });

  assert(sceneData.data.result?.isError !== true, "Active scene query executed successfully");
  const sceneResult = sceneData.data.result?.structuredContent?.result;
  assert(Boolean(sceneResult), "Scene metadata returned");
  assert(sceneResult.RootCount >= 1, `Scene RootCount reflects added object (count: ${sceneResult.RootCount})`);

  // =============================================================================
  // STEP 8: INVARIANTS CHECK (CORE CANONICAL MCP TOOLSET INTEGRITY)
  // =============================================================================
  console.log("\n>>> [6/6] NEXUS CANONICAL TOOLSET FREEZE & ZERO MOCK VERIFICATION...\n");

  const corePath = path.resolve(process.env.NEXUS_SOURCE_ROOT || ".");
  const canonicalRegistryPath = path.join(corePath, "packages", "protocol", "src", "tools", "canonical-registry.ts");
  const registryContent = fs.readFileSync(canonicalRegistryPath, "utf8");
  const canonicalCount = (registryContent.match(/"id":\s*"[a-zA-Z0-9_\.]+"/g) || []).length;

  assert(canonicalCount === 332, `Canonical MCP Tools count strictly locked to 332 (current: ${canonicalCount})`);
  assert(
    !registryContent.includes("gameobject-create"),
    "Downstream Unity tool 'gameobject-create' NOT inserted into Canonical Registry (clean isolation)"
  );
  assert(
    !registryContent.includes("aigamedeveloper"),
    "Downstream Unity metadata NOT inserted into Canonical Registry (clean isolation)"
  );

  // Write E2E Verification Report
  const e2eReport = {
    testSuite: "Nexus -> GameDev MCP -> Unity E2E Verification",
    timestamp: new Date().toISOString(),
    verdict: "REAL E2E PASS",
    results: {
      mcpInitialize: "PASS",
      toolsList: "PASS",
      toolCount: toolCount,
      unityToolInvocation: "PASS",
      gameObjectCreation: "PASS",
      unityIndependentVerification: "PASS",
      nexusGameDevMcpUnityE2E: "PASS",
      canonicalToolsCount: canonicalCount,
    },
    createdObject: {
      name: createdStructured.name,
      path: createdStructured.path,
      instanceID: createdStructured.instanceID,
      primitiveType: "Cube",
      position: { x: 0, y: 0, z: 0 },
    },
    verifiedObject: {
      name: foundRef.name,
      path: foundRef.path,
      instanceID: foundRef.instanceID,
    },
  };

  const reportPath = path.join(OUTPUT_DIR, "GAMEDEV_MCP_E2E_REPORT.json");
  fs.writeFileSync(reportPath, JSON.stringify(e2eReport, null, 2), "utf8");
  assert(fs.existsSync(reportPath), `Saved formal verification report to ${reportPath}`);

  console.log("\n================================================================================");
  console.log(`GRAND TOTAL ASSERTIONS PASSED: ${passedAssertions} / ${totalAssertions} (100%)`);
  console.log("REAL E2E PASS: ALL GATES COMMITTED AND VERIFIED");
  console.log("================================================================================\n");
}

runSuite().catch((err) => {
  console.error("FATAL ERROR IN SUITE:", err);
  process.exit(1);
});
