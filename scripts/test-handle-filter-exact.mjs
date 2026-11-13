const BRIDGE_URL = 'http://127.0.0.1:8787/mcp';

async function run() {
  const pyCode = [
    'import json',
    'processes = [{"pid": 1000 + i, "name": f"svc_{i}"} for i in range(50)]',
    'print(json.dumps(processes))',
  ].join('\n');

  const scriptRes = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'nexus_run_script',
        arguments: {
          runtime: 'python',
          script: pyCode,
        },
      },
    }),
  }).then((r) => r.json());

  const handleId = scriptRes.result?.structuredContent?.handleId;
  console.log('Handle generated:', handleId);
  console.log('Content prompt:\n' + scriptRes.result?.content?.[0]?.text);

  // 1. Test object filter
  const readObj = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'nexus_execute_action',
        arguments: {
          tool: 'nexus_handle_read',
          arguments: {
            handleId,
            filter: { pid: 1025 },
          },
        },
      },
    }),
  }).then((r) => r.json());
  console.log('\n--- Object Filter { pid: 1025 } ---');
  console.log('Content:', readObj.result?.content?.[0]?.text);
  console.log('StructuredContent Items:', JSON.stringify(readObj.result?.structuredContent?.items));

  // 2. Test string filter
  const readStr = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'nexus_execute_action',
        arguments: {
          tool: 'nexus_handle_read',
          arguments: {
            handleId,
            filter: 'svc_25',
          },
        },
      },
    }),
  }).then((r) => r.json());
  console.log('\n--- String Filter "svc_25" ---');
  console.log('StructuredContent Items:', JSON.stringify(readStr.result?.structuredContent?.items));

  // 3. Test invalid filter type (number)
  const readErr = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'nexus_execute_action',
        arguments: {
          tool: 'nexus_handle_read',
          arguments: {
            handleId,
            filter: 99999,
          },
        },
      },
    }),
  }).then((r) => r.json());
  console.log('\n--- Invalid Filter (number) ---');
  console.log('Content:', readErr.result?.content?.[0]?.text);
  console.log('IsError:', readErr.result?.isError);
}

run().catch(console.error);
