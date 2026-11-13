import http from "node:http";
import crypto from "node:crypto";
import { CANONICAL_TOOL_DEFINITIONS, UNIVERSAL_META_TOOLS, ALL_EXPOSED_TOOLS } from "../apps/bridge/src/server.js";

async function main() {
  console.log("=== MCP tools/list 返回体字符数精确测量 ===");

  // 1. 实测当前运行中的 MCP Bridge (http://127.0.0.1:8787/mcp)
  const bridgeUrl = "http://127.0.0.1:8787/mcp";
  let liveResText = "";
  try {
    const initRes = await fetch(bridgeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "measure-client", version: "1.0" },
        },
      }),
    });
    const sessionId = initRes.headers.get("mcp-session-id");
    const headers = { "Content-Type": "application/json" };
    if (sessionId) headers["mcp-session-id"] = sessionId;

    const listRes = await fetch(bridgeUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });
    liveResText = await listRes.text();
  } catch (err) {
    console.error("Live fetch error:", err.message);
  }

  const liveJson = JSON.parse(liveResText || "{}");
  const liveTools = liveJson.result?.tools || [];

  console.log("\n[1. 当前实测状态 (极致 Token 优化模式 / Master Mode)]");
  console.log(`- tools/list 返回体总字符数: ${liveResText.length} 字符`);
  console.log(`- 返回工具总数 (Top-level Tools): ${liveTools.length} 个`);
  console.log(`- 工具清单: ${liveTools.map((t) => t.name).join(", ")}`);

  // 2. 模拟计算：改动前 vs 改动后
  // 改动前状态 A: Master Mode 下未进行 P3 Schema 脱水 & 描述瘦身时的 tools/list
  const rawMetaTools = UNIVERSAL_META_TOOLS.map((t) => ({
    name: t.name,
    description: t.description, // 原始未截断描述
    inputSchema: t.inputSchema,
  }));
  const rawMetaResponseText = JSON.stringify({
    result: { tools: rawMetaTools },
    jsonrpc: "2.0",
    id: 2,
  });

  // 改动前状态 B: 若误将 5 个新子能力 (nexus_handle_read, nexus_get_tool_schema, nexus_checkpoint_save/load/list) 作为顶层工具直接暴露在 tools/list 中
  const mockHypotheticalBloatedTools = [
    ...liveTools,
    {
      name: "nexus_handle_read",
      description: "读取大列表和快照的持久化分页句柄",
      inputSchema: {
        type: "object",
        properties: {
          handleId: { type: "string", description: "句柄唯一标识" },
          offset: { type: "number", description: "起始项偏移" },
          limit: { type: "number", description: "每次读取条数" },
          filter: { type: "string", description: "文本过滤表达式" },
        },
        required: ["handleId"],
      },
    },
    {
      name: "nexus_get_tool_schema",
      description: "按需按工具名获取完整的详细参数模式 Schema 定义",
      inputSchema: {
        type: "object",
        properties: {
          tool: { type: "string", description: "工具名称或别名" },
        },
        required: ["tool"],
      },
    },
    {
      name: "nexus_checkpoint_save",
      description: "将当前会话状态保存为磁盘快照",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "快照名称" },
          data: { type: "object", description: "待保存的快照上下文数据" },
          description: { type: "string", description: "快照描述" },
        },
        required: ["name", "data"],
      },
    },
    {
      name: "nexus_checkpoint_load",
      description: "从磁盘加载已保存的会话快照",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "快照名称" },
        },
        required: ["name"],
      },
    },
    {
      name: "nexus_checkpoint_list",
      description: "列出磁盘上现存的全部快照记录",
      inputSchema: { type: "object", properties: {} },
    },
  ];
  const hypotheticalBloatedText = JSON.stringify({
    result: { tools: mockHypotheticalBloatedTools },
    jsonrpc: "2.0",
    id: 2,
  });

  // 状态 C: 全量传统模式 (未优化前 Legacy Full Tools 模式，直接全量声明 346 个内置及外部原子工具)
  const legacyFullResponseText = JSON.stringify({
    result: { tools: ALL_EXPOSED_TOOLS },
    jsonrpc: "2.0",
    id: 2,
  });

  console.log("\n[2. 声明总量与各阶段对比]");
  console.log(`- 传统全量模式 (Legacy Full Tools, 346 个原子工具声明): ${legacyFullResponseText.length} 字符`);
  console.log(`- 假想模式 (若将 5 个新能力误设为顶层工具, 8 个顶层工具): ${hypotheticalBloatedText.length} 字符`);
  console.log(`- P3 实施前 Master 模式 (3 个顶层元工具, 未脱水描述): ${rawMetaResponseText.length} 字符`);
  console.log(`- P3 实施后当前 Master 模式 (3 个顶层元工具, 已脱水瘦身): ${liveResText.length} 字符`);
  console.log(`- 相比全量模式净减少: ${legacyFullResponseText.length - liveResText.length} 字符 (减少 ${((1 - liveResText.length / legacyFullResponseText.length) * 100).toFixed(1)}%)`);
}

main().catch(console.error);
