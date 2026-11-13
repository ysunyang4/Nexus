async function main() {
  const init = await fetch('http://127.0.0.1:20705/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } } })
  });
  const sid = init.headers.get('mcp-session-id');

  const csharp = `
    var roots = UnityEngine.SceneManagement.SceneManager.GetActiveScene().GetRootGameObjects();
    var list = System.Linq.Enumerable.Select(roots, r => r.name + ": pos=" + r.transform.position.ToString());
    UnityEngine.Debug.Log("ROOTS: " + string.Join(" | ", list));
  `;
  await fetch('http://127.0.0.1:20705/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'mcp-session-id': sid },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'script-execute', arguments: { csharpCode: csharp, isMethodBody: true } } })
  });

  const lRes = await fetch('http://127.0.0.1:20705/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'mcp-session-id': sid },
    body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'console-get-logs', arguments: { count: 10 } } })
  });
  const txt = await lRes.text();
  const line = txt.split('\n').find(l => l.startsWith('data: '));
  const data = JSON.parse(line ? line.slice(6) : txt);
  const logs = data.result.structuredContent?.result || [];
  for (const l of logs) {
    if (l.Message.startsWith("ROOTS:")) {
      console.log(l.Message);
    }
  }
}

main().catch(console.error);
