async function test() {
  const apiKey = process.env.GEMINI_API_KEY;

  // 1. Fetch tools/list from Nexus MCP Gateway
  const initRes = await fetch('http://127.0.0.1:8787/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'gemini-test', version: '1.0' } }
    })
  });
  const sid = initRes.headers.get('mcp-session-id');

  await fetch('http://127.0.0.1:8787/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'mcp-session-id': sid },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })
  });

  const listRes = await fetch('http://127.0.0.1:8787/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'mcp-session-id': sid },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
  });
  const listTxt = await listRes.text();
  const listLine = listTxt.split('\n').find(l => l.startsWith('data: '));
  const listData = JSON.parse(listLine ? listLine.slice(6) : listTxt);
  const allTools = listData.result?.tools || [];
  console.log(`Fetched ${allTools.length} tools from Gateway.`);

  // 2. Format tools for Gemini functionDeclarations
  // Filter tools that relate to Unity, Terminal, and Core to fit Gemini prompt cleanly or pass relevant tools
  // Note: Gemini supports function declarations. Let's pass the tools candidate set (Unity + Terminal tools)
  const candidateTools = allTools.filter(t => 
    t.name.startsWith('gameobject-') || 
    t.name.startsWith('scene-') || 
    t.name.startsWith('assets-') || 
    t.name.startsWith('script-execute') ||
    t.name.includes('terminal')
  );
  console.log(`Selected ${candidateTools.length} candidate tools for Tool Selection evaluation.`);

  function dereferenceSchema(schema) {
    if (!schema) return schema;
    const defs = schema.$defs || {};
    function walk(node, depth = 0) {
      if (depth > 2 || !node || typeof node !== 'object') return node;
      if (node.$ref) {
        const refName = node.$ref.split('/').pop();
        if (defs[refName]) {
          const resolved = JSON.parse(JSON.stringify(defs[refName]));
          if (node.description && !resolved.description) resolved.description = node.description;
          return walk(resolved, depth + 1);
        }
      }
      const out = Array.isArray(node) ? [] : {};
      for (const [k, v] of Object.entries(node)) {
        if (k === '$defs' || k === '$schema') continue;
        out[k] = walk(v, depth + 1);
      }
      return out;
    }
    return walk(schema);
  }

  // 2. Format tool list for Gemini evaluation
  const toolManifestText = candidateTools.map(t => {
    const resolved = dereferenceSchema(t.inputSchema);
    return `### Tool: \`${t.name}\`
Description: ${t.description || "No description"}
Parameters Schema:
\`\`\`json
${JSON.stringify(resolved, null, 2)}
\`\`\``;
  }).join("\n\n");

  // 3. Ask Gemini to select tool for: "在当前场景中创建一个粉色的胶囊体。"
  const userPrompt = "在当前场景中创建一个粉色的胶囊体。";
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: userPrompt }]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json"
    },
    systemInstruction: {
      parts: [
        {
          text: `
You are the AI Tool Selection Engine for Nexus.
Given the user request, you must evaluate the available tools and select the single best tool to invoke.

Available Tools:
${toolManifestText}

Execution Guidelines:
- Native desktop and execution tools are provided directly by Canonical Nexus Tools.
- External environments (such as Unity via GameDev MCP) are discovered dynamically and exposed via standard MCP tools.
- When controlling Unity, ALWAYS use native Unity GameDev MCP tools (e.g. gameobject-create-configured, gameobject-configure-material, gameobject-create, scene-get-data). NEVER execute terminal/shell commands to control Unity when Unity MCP tools are available.
- To create a configured GameObject or primitive (e.g. Capsule, Cube, Sphere, Cylinder) with Transform and Material/Color, use the atomic 'gameobject-create-configured' tool in a single call.
- All actions are logged and verifiable.

Output Requirement:
Return ONLY a valid JSON object in this format:
{
  "selectedTool": "exact-tool-name",
  "arguments": {
    "param1": "val1"
  },
  "rationale": "reason for selection"
}
          `.trim()
        }
      ]
    }
  };

  const geminiRes = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const geminiData = await geminiRes.json();
  const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
  console.log('Gemini Structured Output:\n', text);
  if (text) {
    const parsed = JSON.parse(text);
    console.log(`\n>>> Selected Tool: ${parsed.selectedTool}`);
    console.log(`>>> Arguments:`, JSON.stringify(parsed.arguments, null, 2));
    console.log(`>>> Rationale:`, parsed.rationale);
  }
}

test().catch(console.error);
