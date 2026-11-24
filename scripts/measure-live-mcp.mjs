import fs from "node:fs";
import path from "node:path";

async function main() {
  const port = process.env.MEASURE_PORT || "18787";
  const token = process.env.NEXUS_BRIDGE_TOKEN;
  if (!token) {
    console.error("Missing test token");
    process.exit(1);
  }

  const endpoint = `http://127.0.0.1:${port}/mcp`;
  console.log(`Connecting to MCP endpoint at ${endpoint}...`);

  // Step 1: initialize
  const initRes = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-measure-client", version: "1.0.0" },
      },
    }),
  });

  if (!initRes.ok) {
    const errText = await initRes.text();
    console.error(`Initialize failed (${initRes.status}):`, errText);
    process.exit(1);
  }

  const sessionId = initRes.headers.get("mcp-session-id");
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  };
  if (sessionId) {
    headers["mcp-session-id"] = sessionId;
  }

  // Step 2: page through tools/list
  const allTools = [];
  let cursor = undefined;
  let pageIndex = 1;

  while (true) {
    const listRes = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 10 + pageIndex,
        method: "tools/list",
        params: cursor ? { cursor } : {},
      }),
    });

    if (!listRes.ok) {
      const errText = await listRes.text();
      console.error(`tools/list failed (${listRes.status}):`, errText);
      process.exit(1);
    }

    const data = await listRes.json();
    const result = data.result || {};
    const tools = result.tools || [];
    allTools.push(...tools);

    if (result.nextCursor) {
      cursor = result.nextCursor;
      pageIndex++;
    } else {
      break;
    }
  }

  console.log(`Measured raw tool count: ${allTools.length}`);
  const toolNames = allTools.map((t) => t.name);
  console.log("Tool names:", toolNames);

  // Output to docs/verification/tool-count-1.3.4-raw.txt
  const outPath = path.resolve(import.meta.dirname, "../docs/verification/tool-count-1.3.4-raw.txt");
  const content = [
    `Nexus Control Center v1.3.4 Live Measurement Raw Tool List`,
    `Measured At: ${new Date().toISOString()}`,
    `Port: ${port}`,
    `Total Count: ${allTools.length}`,
    `Tool Names:`,
    ...toolNames.map((name, i) => `  ${i + 1}. ${name}`),
  ].join("\n");

  fs.writeFileSync(outPath, content, "utf-8");
  console.log(`Saved raw measurement to: ${outPath}`);
}

main().catch((err) => {
  console.error("Measurement error:", err);
  process.exit(1);
});
