async function main() {
  const initRes = await fetch('http://127.0.0.1:8787/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test-call', version: '1.0' } }
    })
  });
  const sid = initRes.headers.get('mcp-session-id');

  await fetch('http://127.0.0.1:8787/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'mcp-session-id': sid },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })
  });

  const t0 = performance.now();
  const callRes = await fetch('http://127.0.0.1:8787/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'mcp-session-id': sid },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'gameobject-create-configured',
        arguments: {
          name: 'PinkCapsule_E2E',
          primitiveType: 'Capsule',
          color: 'pink',
          position: { x: 0, y: 1, z: 0 }
        }
      }
    })
  });
  const latency = performance.now() - t0;
  console.log(`Latency: ${latency.toFixed(2)}ms`);

  const callTxt = await callRes.text();
  console.log('Result text:\n', callTxt);
}

main().catch(console.error);
