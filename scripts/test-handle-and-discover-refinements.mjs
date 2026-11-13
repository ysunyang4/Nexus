import fs from "node:fs";
import path from "node:path";

const BRIDGE_URL = "http://127.0.0.1:8787/mcp";

async function callBridge(method, params = {}) {
  const tokenKeyPath = path.join(
    process.env.LOCALAPPDATA || process.env.APPDATA,
    "LocalBridge/data/management-token.key"
  );
  let token = "";
  if (fs.existsSync(tokenKeyPath)) {
    token = fs.readFileSync(tokenKeyPath, "utf-8").trim();
  }
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(BRIDGE_URL, {
    method: "POST",
    headers,
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

async function testDiscoverRefinements() {
  console.log("=== 测试 1: nexus_discover_tools 响应精简 (mode 与 tip 完全移除) ===");
  const res = await callBridge("tools/call", {
    name: "nexus_discover_tools",
    arguments: { query: "browser" },
  });
  const contentText = res.result?.content?.[0]?.text || "{}";
  const parsedContent = JSON.parse(contentText);
  const sc = res.result?.structuredContent || {};

  console.log("content 中包含 mode 字段?", "mode" in parsedContent ? "❌ 包含" : "✅ 已移除");
  console.log("content 中包含 tip 字段?", "tip" in parsedContent ? "❌ 包含" : "✅ 已移除");
  console.log("structuredContent 中包含 mode 字段?", "mode" in sc ? "❌ 包含" : "✅ 已移除");
  console.log("structuredContent 中包含 tip 字段?", "tip" in sc ? "❌ 包含" : "✅ 已移除");
  console.log("compactTools 返回条数:", parsedContent.tools?.length || 0);
  console.log("content 字符数:", contentText.length);
  console.log("structuredContent 字符数:", JSON.stringify(sc).length);
}

async function testHandleRefinements() {
  console.log("\n=== 测试 2: 句柄化单通道化与 nexus_handle_read 对象过滤 ===");
  // 1. 触发句柄化
  const scriptRes = await callBridge("tools/call", {
    name: "nexus_run_script",
    arguments: {
      runtime: "python",
      script: `
import json
data = [{"pid": 100 + i, "port": 8000 + i, "name": f"svc_{i}"} for i in range(20)]
print(json.dumps(data))
      `.trim(),
    },
  });

  const contentText = scriptRes.result?.content?.[0]?.text || "";
  const sc = scriptRes.result?.structuredContent || {};
  console.log("句柄化是否触发:", Boolean(sc.handleId) ? "✅ 触发" : "❌ 未触发");
  console.log("content 是否包含 sample 数组重复:", contentText.includes('"svc_0"') ? "❌ 重复包含" : "✅ 已消除重复");
  console.log("content 指引提示语:\n" + contentText);

  const handleId = sc.handleId;

  // 2. 测试 nexus_handle_read 对象过滤: { port: 8005 }
  console.log("\n--- 测试 2.1: nexus_handle_read 传入对象过滤 filter: { port: 8005 } ---");
  const readObjRes = await callBridge("tools/call", {
    name: "nexus_execute_action",
    arguments: {
      tool: "nexus_handle_read",
      arguments: {
        handleId,
        filter: { port: 8005 },
      },
    },
  });
  const readObjSc = readObjRes.result?.structuredContent || {};
  const readObjContent = readObjRes.result?.content?.[0]?.text || "";
  console.log("对象过滤返回条数:", readObjSc.items?.length);
  console.log("对象过滤命中数据:", JSON.stringify(readObjSc.items));
  console.log("content 是否仅放单行摘要 (单通道):", readObjContent);

  // 3. 测试 nexus_handle_read 字符串过滤: filter: "8008"
  console.log("\n--- 测试 2.2: nexus_handle_read 传入字符串过滤 filter: '8008' ---");
  const readStrRes = await callBridge("tools/call", {
    name: "nexus_execute_action",
    arguments: {
      tool: "nexus_handle_read",
      arguments: {
        handleId,
        filter: "8008",
      },
    },
  });
  const readStrSc = readStrRes.result?.structuredContent || {};
  console.log("字符串过滤返回条数:", readStrSc.items?.length);
  console.log("字符串过滤命中数据:", JSON.stringify(readStrSc.items));

  // 4. 测试 nexus_handle_read 错误类型拦截: filter: 12345
  console.log("\n--- 测试 2.3: nexus_handle_read 传入非法类型 filter: 12345 ---");
  const readErrRes = await callBridge("tools/call", {
    name: "nexus_execute_action",
    arguments: {
      tool: "nexus_handle_read",
      arguments: {
        handleId,
        filter: 12345,
      },
    },
  });
  const readErrContent = readErrRes.result?.content?.[0]?.text || "";
  console.log("非法参数报错与指引信息:", readErrContent);
}

async function main() {
  await testDiscoverRefinements();
  await testHandleRefinements();
}

main().catch(console.error);
