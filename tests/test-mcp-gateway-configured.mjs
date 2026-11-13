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
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-gateway', version: '1.0.0' }
      }
    })
  });
  console.log('Initialize status:', initRes.status);
  const sid = initRes.headers.get('mcp-session-id');
  console.log('Session ID:', sid);

  // Send notifications/initialized
  await fetch('http://127.0.0.1:8787/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'mcp-session-id': sid
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {}
    })
  });

  // Query tools/list
  const listRes = await fetch('http://127.0.0.1:8787/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'mcp-session-id': sid
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    })
  });

  const listTxt = await listRes.text();
  const listLine = listTxt.split('\n').find(l => l.startsWith('data: '));
  const listData = JSON.parse(listLine ? listLine.slice(6) : listTxt);
  const tools = listData.result?.tools || [];
  console.log('Total tools returned from Gateway (:8787):', tools.length);

  const configured = tools.filter(t => t.name.includes('configured') || t.name.includes('configure-material'));
  console.log('Configured tools found:', configured.map(t => ({ name: t.name, description: t.description })));
}

main().catch(console.error);
