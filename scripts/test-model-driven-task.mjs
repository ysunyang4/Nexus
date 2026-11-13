import child_process from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BRIDGE_URL = "http://127.0.0.1:8787/mcp";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY is not defined in environment.");
  process.exit(1);
}

// 启动测试监听服务
function spawnTestServer(port) {
  const code = `
const http = require('http');
const server = http.createServer((req, res) => res.end('ok'));
server.listen(${port}, '127.0.0.1', () => {
  console.log('LISTENING:${port}:PID:' + process.pid);
});
setInterval(() => {}, 1000);
`;
  const proc = child_process.spawn("node", ["-e", code], {
    stdio: ["ignore", "pipe", "ignore"],
    detached: true,
  });
  return new Promise((resolve) => {
    proc.stdout.on("data", (chunk) => {
      const str = chunk.toString();
      if (str.includes("LISTENING")) {
        const pid = parseInt(str.split(":PID:")[1].trim(), 10);
        resolve({ proc, pid, port });
      }
    });
  });
}

// 调用 MCP Bridge
async function callBridge(method, params = {}) {
  const res = await fetch(BRIDGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Math.floor(Math.random() * 100000),
      method,
      params,
    }),
  });
  const text = await res.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  return JSON.parse(line ? line.slice(6) : text);
}

// 获取顶层 MCP 工具定义供模型使用
async function getToolsList() {
  const res = await callBridge("tools/list");
  return res.result?.tools || [];
}

// 调用 Gemini LLM (gemini-2.5-flash / gemini-1.5-flash) 进行对话决策
async function callGemini(contents, tools) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  // 转换 MCP Tools 为 Gemini Function Declarations
  const functionDeclarations = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.inputSchema || { type: "object", properties: {} },
  }));

  const payload = {
    contents,
    tools: [{ functionDeclarations }],
    systemInstruction: {
      parts: [{
        text: `You are an autonomous AI operating system assistant driving Nexus MCP tools.
The user has a task on their machine. You must inspect the system, take actions using the provided tools, and report the result.
When tools return handles (e.g. hnd_...), follow the hint instructions to query details using nexus_execute_action(tool='nexus_handle_read', arguments={handleId, filter}).
Be direct and solve the task in the fewest necessary steps.`.trim(),
      }],
    },
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await resp.json();
  if (data.error) {
    throw new Error(`Gemini API Error: ${JSON.stringify(data.error)}`);
  }
  return data;
}

async function runModelDrivenTaskTest() {
  console.log("==================================================");
  console.log("    模型驱动任务级场景实测 (真实 Gemini 对话驱动)  ");
  console.log("==================================================");

  const TARGET_PORT = 39875;
  const testServer = await spawnTestServer(TARGET_PORT);
  console.log(`[准备] 已启动测试监听服务: 端口 ${TARGET_PORT}, PID: ${testServer.pid}`);

  const mcpTools = await getToolsList();
  console.log(`[初始化] 获取 MCP 工具清单: ${mcpTools.map((t) => t.name).join(", ")}`);

  const userGoal = `检测当前本机端口 ${TARGET_PORT} 是否被占用，若是则找出对应程序的 PID 并结束它。`;
  console.log(`\n[用户指令] "${userGoal}"`);

  const contents = [
    {
      role: "user",
      parts: [{ text: userGoal }],
    },
  ];

  let roundtrips = 0;
  let totalContentChars = 0;
  let totalScChars = 0;
  let maxTurns = 6;
  let taskSuccess = false;

  while (roundtrips < maxTurns) {
    roundtrips++;
    console.log(`\n>>> [第 ${roundtrips} 轮对话] 模型思考中...`);
    const modelResp = await callGemini(contents, mcpTools);
    const candidate = modelResp.candidates?.[0];
    if (!candidate) {
      console.error("No candidate returned from Gemini:", modelResp);
      break;
    }

    const message = candidate.content;
    contents.push(message);

    const parts = message.parts || [];
    const functionCallPart = parts.find((p) => p.functionCall);

    if (functionCallPart) {
      const call = functionCallPart.functionCall;
      console.log(`🤖 模型决定调用工具: ${call.name}`);
      console.log(`   参数: ${JSON.stringify(call.args)}`);

      // 实际调用 MCP Bridge
      const toolRes = await callBridge("tools/call", {
        name: call.name,
        arguments: call.args || {},
      });

      const resContentText = toolRes.result?.content?.[0]?.text || "";
      const resSc = toolRes.result?.structuredContent || {};
      totalContentChars += resContentText.length;
      totalScChars += JSON.stringify(resSc).length;

      console.log(`⚡ MCP Bridge 执行完成:`);
      console.log(`   - content 字符数: ${resContentText.length}`);
      console.log(`   - structuredContent 字符数: ${JSON.stringify(resSc).length}`);
      if (resSc.handleId) {
        console.log(`   - [P1 句柄保护生效] 收到句柄: ${resSc.handleId}`);
      }
      if (resContentText) {
        console.log(`   - content 返回概要: ${resContentText.slice(0, 160).replace(/\n/g, " ")}...`);
      }

      // 将工具结果喂回给模型
      contents.push({
        role: "function",
        parts: [
          {
            functionResponse: {
              name: call.name,
              response: {
                content: toolRes.result?.content,
                structuredContent: toolRes.result?.structuredContent,
                isError: toolRes.result?.isError,
              },
            },
          },
        ],
      });
    } else {
      // 模型返回文本结论，任务结束
      const textPart = parts.find((p) => p.text);
      console.log(`\n🎉 模型已完成任务并回复:`);
      console.log(textPart?.text || "(无文本回复)");
      taskSuccess = true;
      break;
    }
  }

  // 验证端口是否真的已释放
  let portReleased = false;
  try {
    const check = child_process.execSync(`netstat -ano | findstr :${TARGET_PORT}`, { encoding: "utf-8" });
    portReleased = !check.includes(`:${TARGET_PORT}`);
  } catch {
    portReleased = true; // findstr returns exit code 1 if not found
  }

  console.log("\n==================================================");
  console.log("            模型驱动任务实测指标统计              ");
  console.log("==================================================");
  console.log(`- 目标端口: ${TARGET_PORT}`);
  console.log(`- 目标进程 PID: ${testServer.pid}`);
  console.log(`- 模型实际交互轮数 (往返次数): ${roundtrips} 轮`);
  console.log(`- 模型全链路工具返回 Content 总字符: ${totalContentChars} 字符`);
  console.log(`- 模型全链路工具返回 StructuredContent 总字符: ${totalScChars} 字符`);
  console.log(`- 进程是否已被模型成功终止: ${portReleased ? "✅ 是 (已成功终止并释放端口)" : "❌ 否"}`);
  console.log(`- 任务总体达成状态: ${taskSuccess && portReleased ? "✅ 100% 成功达成目标" : "❌ 未达成"}`);
}

runModelDrivenTaskTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
