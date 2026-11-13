
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

  const csharp = 'var asm = System.AppDomain.CurrentDomain.GetAssemblies(); var ed = System.Array.Find(asm, a => a.GetName().Name == "Assembly-CSharp-Editor"); if (ed == null) return "Editor assembly not found"; var t = ed.GetType("NexusUnity.Tool_GameObject_Configured"); return t != null ? t.FullName : "NexusUnity.Tool_GameObject_Configured not found in " + ed.FullName;';

  const res = await fetch('http://127.0.0.1:20705/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'mcp-session-id': sid },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'script-execute',
        arguments: {
          csharpCode: csharp,
          isMethodBody: true
        }
      }
    })
  });

  const txt = await res.text();
  console.log('Result of script-execute:\n' + txt);
}

main().catch(console.error);
