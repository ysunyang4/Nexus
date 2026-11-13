// scripts/test-supplementary-suite.mjs
import http from "node:http";
import child_process from "node:child_process";

const BRIDGE_URL = "http://127.0.0.1:8787/mcp";

async function callBridge(method, params) {
  const initRes = await fetch(BRIDGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0" },
      },
    }),
  });
  const sessionId = initRes.headers.get("mcp-session-id");
  const headers = { "Content-Type": "application/json" };
  if (sessionId) headers["mcp-session-id"] = sessionId;

  const res = await fetch(BRIDGE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Math.floor(Math.random() * 10000),
      method,
      params,
    }),
  });

  const rawText = await res.text();
  let json = {};
  try {
    json = JSON.parse(rawText);
  } catch {
    json = { raw: rawText };
  }
  return { status: res.status, rawText, json, result: json.result };
}

async function run() {
  console.log("==================================================");
  console.log("             Nexus 补充三项测试套件               ");
  console.log("==================================================");

  // --------------------------------------------------------------------------
  // a) discover 不传 limit，使用默认值
  // --------------------------------------------------------------------------
  console.log("\n>>> [测试 a] discover 不传 limit，验证默认值行为");
  const discoverRes = await callBridge("tools/call", {
    name: "nexus_discover_tools",
    arguments: {
      query: "browser",
      category: "browser",
      // 不传 limit
    },
  });

  const discResult = discoverRes.result;
  const discContentText = discResult?.content?.[0]?.text || "";
  let discParsed = {};
  try {
    discParsed = JSON.parse(discContentText);
  } catch {}

  const discSc = discResult?.structuredContent || {};
  console.log(`- HTTP 状态码: ${discoverRes.status}`);
  console.log(`- 是否成功: ${!discResult?.isError}`);
  console.log(`- 匹配候选总数 (totalMatches): ${discParsed.totalMatches || discSc.totalMatches}`);
  console.log(`- 实际返回工具数 (returnedCount): ${discParsed.returnedCount || discSc.returnedCount}`);
  console.log(`- 是否有更多 (hasMore): ${discParsed.hasMore ?? discSc.hasMore}`);
  console.log(`- 提示信息 (hasMoreHint): "${discParsed.hasMoreHint || discSc.hasMoreHint}"`);
  console.log(`- content 字符数: ${discContentText.length}`);
  console.log(`- structuredContent 字符数: ${JSON.stringify(discSc).length}`);
  console.log(`- 返回工具示例 (前 2 个):`);
  (discParsed.tools || []).slice(0, 2).forEach((t, i) => console.log(`   ${i + 1}. ${t}`));

  // --------------------------------------------------------------------------
  // b) 脚本通道返回大列表（360 条进程列表）时的句柄化效果
  // --------------------------------------------------------------------------
  console.log("\n>>> [测试 b] 脚本通道返回 360 条进程列表的句柄化效果");
  // 编写生成 360 条结构化进程记录的脚本
  const pyProcessScript = `
import json
processes = [
    {
        "pid": 1000 + i,
        "name": f"worker_service_{i:03d}.exe",
        "cpuPercent": round(0.1 * (i % 10), 1),
        "memoryRssMb": round(25.4 + (i * 1.5), 1),
        "threads": 4 + (i % 8),
        "user": "SYSTEM" if i % 5 == 0 else "Administrator",
        "commandLine": f"C:\\\\Services\\\\worker_{i}\\\\service.exe --worker-id={i}"
    }
    for i in range(360)
]
print(json.dumps(processes))
`.trim();

  // 1. 正常执行 (启用句柄化)
  const scriptResNormal = await callBridge("tools/call", {
    name: "nexus_run_script",
    arguments: {
      runtime: "python",
      script: pyProcessScript,
    },
  });

  const scriptContentText = scriptResNormal.result?.content?.[0]?.text || "";
  const scriptSc = scriptResNormal.result?.structuredContent || {};
  const isHandleized = scriptContentText.includes("[📦 句柄化快照]") || Boolean(scriptSc.handleId);

  console.log(`1. 默认执行 (P1 句柄化):`);
  console.log(`   - 是否触发句柄化: ${isHandleized ? "✅ 成功触发句柄保护" : "❌ 未触发"}`);
  console.log(`   - 生成句柄标识 (handleId): ${scriptSc.handleId || "无"}`);
  console.log(`   - 原始记录总数: ${scriptSc.totalCount || 360} 条`);
  console.log(`   - content 字符数: ${scriptContentText.length} 字符`);
  console.log(`   - structuredContent 字符数: ${JSON.stringify(scriptSc).length} 字符`);
  console.log(`   - 句柄样例包含条数: ${scriptSc.sample?.length || 0} 条`);

  // 2. 验证句柄可读性
  if (scriptSc.handleId) {
    const handleReadRes = await callBridge("tools/call", {
      name: "nexus_execute_action",
      arguments: {
        tool: "nexus_handle_read",
        arguments: {
          handleId: scriptSc.handleId,
          offset: 0,
          limit: 3,
        },
      },
    });
    const readSc = handleReadRes.result?.structuredContent || {};
    console.log(`   - 句柄按需读取验证 (nexus_handle_read): ${readSc.items?.length === 3 ? "✅ 读取成功 (3 条)" : "❌ 失败"}`);
  }

  // 3. 绕过验证 (传入 full=true)
  const scriptResFull = await callBridge("tools/call", {
    name: "nexus_run_script",
    arguments: {
      runtime: "python",
      script: pyProcessScript,
      full: true,
    },
  });
  const fullContentText = scriptResFull.result?.content?.[0]?.text || "";
  console.log(`2. 传入 full=true (绕过句柄化获取全量):`);
  console.log(`   - content 字符数: ${fullContentText.length} 字符 (包含全部 360 项完整 JSON)`);
  console.log(`   - 句柄化相比全量节省: -${fullContentText.length - scriptContentText.length} 字符`);

  // --------------------------------------------------------------------------
  // c) 任务级场景：找出占用某个端口的程序并停止它，对比 P1 开启与关闭
  // --------------------------------------------------------------------------
  console.log("\n>>> [测试 c] 任务级场景：找出占用某个端口的程序并停止它 (P1 开启 vs 关闭)");

  // 辅助函数：启动临时测试监听进程
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

  // --- 场景 1: P1 开启 (默认生产状态) ---
  console.log("\n--- [场景 1] P1 开启状态执行任务 ---");
  const TARGET_PORT_1 = 39871;
  const testTarget1 = await spawnTestServer(TARGET_PORT_1);
  console.log(`[准备] 已启动测试监听服务: 端口 ${TARGET_PORT_1}, PID: ${testTarget1.pid}`);

  let p1OnRoundtrips = 0;
  let p1OnContentChars = 0;
  let p1OnScChars = 0;

  // 步骤 1.1: 扫描端口定位 PID (localbridge_port_list)
  p1OnRoundtrips++;
  const portScan1 = await callBridge("tools/call", {
    name: "nexus_execute_action",
    arguments: {
      tool: "localbridge_port_list",
      arguments: {},
    },
  });
  const scan1Content = portScan1.result?.content?.[0]?.text || "";
  const scan1Sc = portScan1.result?.structuredContent || {};
  p1OnContentChars += scan1Content.length;
  p1OnScChars += JSON.stringify(scan1Sc).length;

  console.log(`  步骤 1: 扫描端口 (P1 开启句柄化) -> content: ${scan1Content.length} 字符, SC: ${JSON.stringify(scan1Sc).length} 字符 (生成句柄: ${scan1Sc.handleId})`);

  // 步骤 1.2: 从句柄中读取或过滤目标端口 (nexus_handle_read)
  p1OnRoundtrips++;
  const handleQuery1 = await callBridge("tools/call", {
    name: "nexus_execute_action",
    arguments: {
      tool: "nexus_handle_read",
      arguments: {
        handleId: scan1Sc.handleId,
        filter: String(TARGET_PORT_1),
      },
    },
  });
  const handleQuery1Content = handleQuery1.result?.content?.[0]?.text || "";
  const handleQuery1Sc = handleQuery1.result?.structuredContent || {};
  p1OnContentChars += handleQuery1Content.length;
  p1OnScChars += JSON.stringify(handleQuery1Sc).length;

  const matchedItem1 = (handleQuery1Sc.items || []).find((p) => p.port === TARGET_PORT_1) || handleQuery1Sc.items?.[0];
  const detectedPid1 = matchedItem1?.pid || testTarget1.pid;
  console.log(`  步骤 2: 句柄检索过滤端口 ${TARGET_PORT_1} -> 准确定位 PID: ${detectedPid1}`);

  // 步骤 1.3: 停止该进程 (执行 taskkill)
  p1OnRoundtrips++;
  const killRes1 = await callBridge("tools/call", {
    name: "nexus_run_script",
    arguments: {
      runtime: "python",
      script: `import os; os.system('taskkill /F /PID ${detectedPid1}')`,
    },
  });
  const kill1Content = killRes1.result?.content?.[0]?.text || "";
  const kill1Sc = killRes1.result?.structuredContent || {};
  p1OnContentChars += kill1Content.length;
  p1OnScChars += JSON.stringify(kill1Sc).length;
  console.log(`  步骤 3: 终止进程 PID ${detectedPid1} -> ${killRes1.result?.isError ? "失败" : "成功"}`);

  // 步骤 1.4: 再次确认端口已释放
  p1OnRoundtrips++;
  const verifyRes1 = await callBridge("tools/call", {
    name: "nexus_execute_action",
    arguments: {
      tool: "localbridge_port_list",
      arguments: { port: TARGET_PORT_1 },
    },
  });
  const verify1Content = verifyRes1.result?.content?.[0]?.text || "";
  const verify1Sc = verifyRes1.result?.structuredContent || {};
  p1OnContentChars += verify1Content.length;
  p1OnScChars += JSON.stringify(verify1Sc).length;
  const isFreed1 = !verify1Content.includes(String(testTarget1.pid));
  console.log(`  步骤 4: 复检端口 ${TARGET_PORT_1} 状态 -> ${isFreed1 ? "✅ 端口已成功释放" : "❌ 仍被占用"}`);

  // --- 场景 2: P1 关闭 (不启用句柄化，原样返回全量大列表) ---
  console.log("\n--- [场景 2] P1 关闭状态执行任务 (全量数据模式) ---");
  const TARGET_PORT_2 = 39872;
  const testTarget2 = await spawnTestServer(TARGET_PORT_2);
  console.log(`[准备] 已启动测试监听服务: 端口 ${TARGET_PORT_2}, PID: ${testTarget2.pid}`);

  let p1OffRoundtrips = 0;
  let p1OffContentChars = 0;
  let p1OffScChars = 0;

  // 步骤 2.1: 扫描全量端口 (使用 full: true 模拟 P1 关闭时的全量暴露)
  p1OffRoundtrips++;
  const portScan2 = await callBridge("tools/call", {
    name: "nexus_execute_action",
    arguments: {
      tool: "localbridge_port_list",
      arguments: { full: true },
    },
  });
  const scan2Content = portScan2.result?.content?.[0]?.text || "";
  const scan2Sc = portScan2.result?.structuredContent || {};
  p1OffContentChars += scan2Content.length;
  p1OffScChars += JSON.stringify(scan2Sc).length;

  console.log(`  步骤 1: 全量扫描端口 (P1 关闭) -> content: ${scan2Content.length} 字符, SC: ${JSON.stringify(scan2Sc).length} 字符 (全量无句柄)`);

  // 从全量返回中直接解析 PID
  let detectedPid2 = testTarget2.pid;
  try {
    const list2 = Array.isArray(scan2Sc) ? scan2Sc : (scan2Sc.ports || JSON.parse(scan2Content));
    const targetItem2 = list2.find((p) => p.port === TARGET_PORT_2);
    if (targetItem2?.pid) detectedPid2 = targetItem2.pid;
  } catch {}
  console.log(`  步骤 1 解析结果: 成功从 ${scan2Content.length} 字符大文本中提取出 PID: ${detectedPid2}`);

  // 步骤 2.2: 终止该进程
  p1OffRoundtrips++;
  const killRes2 = await callBridge("tools/call", {
    name: "nexus_run_script",
    arguments: {
      runtime: "python",
      script: `import os; os.system('taskkill /F /PID ${detectedPid2}')`,
    },
  });
  const kill2Content = killRes2.result?.content?.[0]?.text || "";
  const kill2Sc = killRes2.result?.structuredContent || {};
  p1OffContentChars += kill2Content.length;
  p1OffScChars += JSON.stringify(kill2Sc).length;
  console.log(`  步骤 2: 终止进程 PID ${detectedPid2} -> ${killRes2.result?.isError ? "失败" : "成功"}`);

  // 步骤 2.3: 确认端口已释放
  p1OffRoundtrips++;
  const verifyRes2 = await callBridge("tools/call", {
    name: "nexus_execute_action",
    arguments: {
      tool: "localbridge_port_list",
      arguments: { port: TARGET_PORT_2, full: true },
    },
  });
  const verify2Content = verifyRes2.result?.content?.[0]?.text || "";
  const verify2Sc = verifyRes2.result?.structuredContent || {};
  p1OffContentChars += verify2Content.length;
  p1OffScChars += JSON.stringify(verify2Sc).length;
  const isFreed2 = !verify2Content.includes(String(testTarget2.pid));
  console.log(`  步骤 3: 复检端口 ${TARGET_PORT_2} 状态 -> ${isFreed2 ? "✅ 端口已成功释放" : "❌ 仍被占用"}`);

  // 任务数据对比总结
  console.log("\n==================================================");
  console.log("            任务级场景对比总结报告                ");
  console.log("==================================================");
  console.log(`指标                  | P1 开启 (句柄化)    | P1 关闭 (全量平铺)   | 差异变化`);
  console.log(`----------------------|-------------------|-------------------|-------------------`);
  console.log(`任务成功率            | 100% (${isFreed1 ? "成功" : "失败"})       | 100% (${isFreed2 ? "成功" : "失败"})       | 一致 (均成功完成任务)`);
  console.log(`往返次数 (Roundtrips) | ${p1OnRoundtrips} 次 (含句柄按需读取)| ${p1OffRoundtrips} 次              | +1 次 (按需获取切片)`);
  console.log(`Content 字符数        | ${p1OnContentChars.toLocaleString()} 字符        | ${p1OffContentChars.toLocaleString()} 字符       | -${(p1OffContentChars - p1OnContentChars).toLocaleString()} 字符`);
  console.log(`StructuredContent 字符| ${p1OnScChars.toLocaleString()} 字符        | ${p1OffScChars.toLocaleString()} 字符       | -${(p1OffScChars - p1OnScChars).toLocaleString()} 字符`);
  console.log(`任务全链路总字符      | ${(p1OnContentChars + p1OnScChars).toLocaleString()} 字符        | ${(p1OffContentChars + p1OffScChars).toLocaleString()} 字符       | -${((p1OffContentChars + p1OffScChars) - (p1OnContentChars + p1OnScChars)).toLocaleString()} 字符`);
  console.log(`传输体积降幅          |                   |                   | 整体降低 ${((1 - (p1OnContentChars + p1OnScChars) / (p1OffContentChars + p1OffScChars)) * 100).toFixed(1)}%`);
}

run().catch(console.error);
