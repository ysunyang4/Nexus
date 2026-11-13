import fs from "node:fs";

const PUBLIC_MCP_URL = "https://mcp.example.com/mcp";
const BRIDGE_TOKEN = "gemini-spark-nexus-secure-token-2026";
const LOCAL_BASE_URL = "http://127.0.0.1:8787";

async function main() {
  console.log("1. Setting Permission to L3 (Code Builder)...");
  const permRes = await fetch(`${LOCAL_BASE_URL}/unity/service/permission`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ permission: "L3" }),
  });
  console.log("Permission response:", await permRes.json());

  console.log("2. Invoking script-execute via Public MCP (https://mcp.example.com/mcp)...");
  const callRes = await fetch(PUBLIC_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BRIDGE_TOKEN}`,
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: "script-execute",
        arguments: {
          csharpCode: 'UnityEngine.Debug.Log("NEXUS_PUBLIC_MCP_E2E_SCRIPT_PASS");',
          isMethodBody: true,
        },
      },
    }),
  });

  const text = await callRes.text();
  console.log("Public MCP Response Status:", callRes.status);
  console.log("Public MCP Response Body:", text);

  // Check Unity Editor.log for the message
  const editorLogPath = `${process.env.LOCALAPPDATA}\\Unity\\Editor\\Editor.log`;
  if (fs.existsSync(editorLogPath)) {
    const logContent = fs.readFileSync(editorLogPath, "utf-8");
    const found = logContent.includes("NEXUS_PUBLIC_MCP_E2E_SCRIPT_PASS");
    console.log("Verification in Unity Editor.log:", found ? "FOUND (PASS)" : "NOT FOUND (FAIL)");
  }
}

main().catch(console.error);
