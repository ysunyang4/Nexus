async function main() {
  const initRes = await fetch("http://localhost:20705/p/6106087c", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0" }
      }
    })
  });

  const sessionId = initRes.headers.get("mcp-session-id");
  console.log("Initialized Session ID:", sessionId);

  // Send notifications/initialized
  await fetch("http://localhost:20705/p/6106087c", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {})
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {}
    })
  });

  console.log("Calling script-execute with csharpCode only (isMethodBody omitted)...");
  const callRes = await fetch("http://localhost:20705/p/6106087c", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {})
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "script-execute",
        arguments: {
          csharpCode: 'using UnityEngine; public class Script { public static void Main() { Debug.Log("NEXUS_SCRIPT_EXECUTE_TEST"); } }'
        }
      }
    })
  });

  const text = await callRes.text();
  console.log("HTTP Status:", callRes.status);
  console.log("Response Text:\n", text);
}

main().catch(console.error);
