async function main() {
  const init = await fetch('http://127.0.0.1:20705/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } }
    })
  });
  const sid = init.headers.get('mcp-session-id');

  // Trigger recompilation
  await fetch('http://127.0.0.1:20705/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'mcp-session-id': sid },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'script-execute',
        arguments: {
          csharpCode: 'UnityEditor.AssetDatabase.Refresh(); UnityEditor.Compilation.CompilationPipeline.RequestScriptCompilation(); UnityEngine.Debug.Log("COMPILATION_AND_REFRESH_TRIGGERED");',
          isMethodBody: true
        }
      }
    })
  });

  // Wait 4s for compilation
  console.log("Waiting for compilation...");
  await new Promise(r => setTimeout(r, 4000));

  // Check console logs
  const logRes = await fetch('http://127.0.0.1:20705/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'mcp-session-id': sid },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'console-get-logs', arguments: { count: 5 } }
    })
  });
  const logRaw = await logRes.text();
  const dataLine = logRaw.split("\n").find(l => l.startsWith("data: "));
  const logData = JSON.parse(dataLine ? dataLine.slice(6) : logRaw);
  console.log('Recent Logs:', JSON.stringify(logData.result, null, 2));

  // Re-build MCP plugin if needed
  await fetch('http://127.0.0.1:20705/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'mcp-session-id': sid },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'script-execute',
        arguments: {
          csharpCode: 'com.IvanMurzak.Unity.MCP.UnityMcpPluginEditor.Instance.DisposeMcpPluginInstance(); com.IvanMurzak.Unity.MCP.UnityMcpPluginEditor.Instance.BuildMcpPluginIfNeeded(); com.IvanMurzak.Unity.MCP.UnityMcpPluginEditor.ConnectIfNeeded(); UnityEngine.Debug.Log("REBUILT_MCP_PLUGIN");',
          isMethodBody: true
        }
      }
    })
  });

  // Wait 2s for reconnection to downstream server
  await new Promise(r => setTimeout(r, 2000));

  // Now query tools/list
  const listRes = await fetch('http://127.0.0.1:20705/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'mcp-session-id': sid },
    body: JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/list', params: {} })
  });
  const listRaw = await listRes.text();
  const listLine = listRaw.split("\n").find(l => l.startsWith("data: "));
  const listData = JSON.parse(listLine ? listLine.slice(6) : listRaw);
  const tools = listData.result.tools || [];
  console.log('Total tools count on 20705:', tools.length);
  const configured = tools.filter(t => t.name.includes('configured') || t.name.includes('configure-material'));
  console.log('Found configured tools:', configured.map(t => ({ name: t.name, description: t.description })));
}

main().catch(console.error);
