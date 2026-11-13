import http from "node:http";

async function main() {
  console.log("==================================================");
  console.log("  NEX → MCP GATEWAY (127.0.0.1:8787) E2E TEST     ");
  console.log("==================================================\n");

  let sseConnectPass = false;
  let toolsListPass = false;
  let projectListPass = false;
  let realE2ePass = false;

  const BASE_URL = "http://127.0.0.1:8787/mcp";

  // STEP 1: MCP initialize
  console.log("[STEP 1] MCP initialize...");
  const initPayload = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "nex-client", version: "1.3.0" },
    },
  };

  const initRes = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(initPayload),
  });

  console.log("  HTTP Status:", initRes.status);
  const sessionId = initRes.headers.get("mcp-session-id");
  console.log("  Mcp-Session-Id header:", sessionId);
  const initData = await initRes.json();
  console.log("  Server Info:", JSON.stringify(initData.result?.serverInfo));
  console.log("  Protocol Version:", initData.result?.protocolVersion);

  if (initRes.status !== 200) {
    console.error("  FAILED to initialize!");
    process.exit(1);
  }

  // STEP 2: SSE GET /mcp with non-blocking timeout
  console.log("\n[STEP 2] SSE GET /mcp (Non-blocking)...");
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      // Abort after 3 seconds - this is expected for SSE streams
      controller.abort();
    }, 3000);

    const sseHeaders = {
      Accept: "text/event-stream",
    };
    if (sessionId) {
      sseHeaders["mcp-session-id"] = sessionId;
    }

    const sseRes = await fetch(BASE_URL, {
      method: "GET",
      headers: sseHeaders,
      signal: controller.signal,
    });

    console.log("  SSE HTTP Status:", sseRes.status);
    console.log("  SSE Content-Type:", sseRes.headers.get("content-type"));

    if (
      sseRes.status === 200 &&
      (sseRes.headers.get("content-type") || "").includes("text/event-stream")
    ) {
      console.log("  SSE stream connected successfully (HTTP 200 text/event-stream).");
      sseConnectPass = true;
      console.log("  Reading initial stream data (up to 3s timeout)...");

      try {
        const reader = sseRes.body.getReader();
        const readPromise = reader.read();
        const firstChunk = await Promise.race([
          readPromise,
          new Promise((resolve) => setTimeout(() => resolve({ done: true, value: null }), 1500)),
        ]);
        if (firstChunk && firstChunk.value) {
          const text = new TextDecoder().decode(firstChunk.value);
          console.log("  Received initial SSE chunk:", JSON.stringify(text.trim()));
        } else {
          console.log("  No immediate initial chunk within 1.5s (idle SSE stream open - normal).");
        }
      } catch (err) {
        // stream read ended/aborted
      }
    } else {
      console.error("  SSE connection returned unexpected status or content-type");
    }

    clearTimeout(timeout);
    controller.abort();
  } catch (err) {
    if (err.name === "AbortError") {
      console.log("  SSE stream test gracefully closed after verification.");
    } else {
      console.warn("  SSE fetch warning:", err.message);
    }
  }

  console.log("  SSE CONNECT =", sseConnectPass ? "PASS" : "FAIL");

  // STEP 3: notifications/initialized
  console.log("\n[STEP 3] MCP notifications/initialized...");
  const notifyHeaders = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) {
    notifyHeaders["mcp-session-id"] = sessionId;
  }

  await fetch(BASE_URL, {
    method: "POST",
    headers: notifyHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }),
  }).catch(() => {});

  // STEP 4: tools/list
  console.log("\n[STEP 4] MCP tools/list...");
  const listHeaders = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) {
    listHeaders["mcp-session-id"] = sessionId;
  }

  const listRes = await fetch(BASE_URL, {
    method: "POST",
    headers: listHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    }),
  });

  console.log("  tools/list HTTP Status:", listRes.status);
  const listData = await listRes.json();
  const tools = listData.result?.tools || [];
  console.log("  Total tools discovered:", tools.length);

  const hasProjectList = tools.some((t) => t.name === "localbridge_project_list");
  const hasDirectoryList = tools.some((t) => t.name === "localbridge_directory_list");
  const unityTools = tools.filter((t) => t.name.startsWith("unity_"));
  console.log("  Has localbridge_project_list:", hasProjectList);
  console.log("  Has localbridge_directory_list:", hasDirectoryList);
  console.log("  Unity tools count:", unityTools.length);

  if (listRes.status === 200 && tools.length > 0 && hasProjectList) {
    toolsListPass = true;
    console.log("  tools/list = PASS");
  } else {
    console.error("  tools/list = FAIL");
  }

  // STEP 5: localbridge_project_list execution
  console.log("\n[STEP 5] tools/call localbridge_project_list...");
  const callHeaders = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) {
    callHeaders["mcp-session-id"] = sessionId;
  }

  const callRes = await fetch(BASE_URL, {
    method: "POST",
    headers: callHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "localbridge_project_list",
        arguments: {},
      },
    }),
  });

  console.log("  tools/call HTTP Status:", callRes.status);
  const callData = await callRes.json();
  console.log("  Raw Call Response:", JSON.stringify(callData).slice(0, 300) + "...");

  const contentText = callData.result?.content?.[0]?.text;
  let parsedProjects = null;
  if (contentText) {
    try {
      parsedProjects = JSON.parse(contentText);
    } catch {
      parsedProjects = contentText;
    }
  }

  const projectCount = Array.isArray(parsedProjects)
    ? parsedProjects.length
    : (parsedProjects?.projects?.length ?? 0);
  console.log("  Projects returned count:", projectCount);
  if (Array.isArray(parsedProjects)) {
    console.log("  Sample projects:", parsedProjects.slice(0, 3).map((p) => p.name || p.path || p));
  }

  if (callRes.status === 200 && !callData.error && projectCount > 0) {
    projectListPass = true;
    console.log("  localbridge_project_list = PASS");
  } else {
    console.error("  localbridge_project_list = FAIL");
  }

  // STEP 6: Edge Case Testing:
  // 6A: Stateless / stale session ID call (OpenAI tunnel reconnect scenario)
  console.log("\n[STEP 6A] Testing Stale / Non-existent Mcp-Session-Id resilience...");
  const staleRes = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "mcp-session-id": "non-existent-or-stale-session-id",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "localbridge_project_list",
        arguments: {},
      },
    }),
  });
  console.log("  Stale session call HTTP Status:", staleRes.status);
  const staleData = await staleRes.json();
  const staleSuccess = staleRes.status === 200 && !staleData.error;
  console.log("  Stale session call success:", staleSuccess);

  // 6B: Protocol Version 2026-07-28 normalization
  console.log("\n[STEP 6B] Testing Protocol Version 2026-07-28 normalization...");
  const protoRes = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2026-07-28",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/list",
      params: {},
    }),
  });
  console.log("  2026-07-28 call HTTP Status:", protoRes.status);
  const protoData = await protoRes.json();
  const protoSuccess = protoRes.status === 200 && !protoData.error;
  console.log("  2026-07-28 call success:", protoSuccess);

  // OVERALL STATUS
  realE2ePass = sseConnectPass && toolsListPass && projectListPass && staleSuccess && protoSuccess;

  console.log("\n==================================================");
  console.log("                 FINAL RESULTS                    ");
  console.log("==================================================");
  console.log(`SSE CONNECT = ${sseConnectPass ? "PASS" : "FAIL"}`);
  console.log(`tools/list = ${toolsListPass ? "PASS" : "FAIL"}`);
  console.log(`localbridge_project_list = ${projectListPass ? "PASS" : "FAIL"}`);
  console.log(`REAL E2E = ${realE2ePass ? "PASS" : "FAIL"}`);
  console.log("==================================================");

  if (!realE2ePass) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
