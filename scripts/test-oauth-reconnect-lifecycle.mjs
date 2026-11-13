import { OAuthStore } from "../apps/bridge/src/oauth.ts";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

async function main() {
  console.log("==================================================");
  console.log("   OAuth 客户端断开与重连生命周期与复用性测试     ");
  console.log("==================================================");

  const testDir = path.join(os.tmpdir(), `oauth-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });
  const storagePath = path.join(testDir, "oauth-storage.json");

  const store = new OAuthStore(storagePath);

  // 1. 注册客户端
  const client = store.registerClient({
    client_name: "Claude Reconnect Test Client",
    redirect_uris: ["https://claude.ai/api/mcp/oauth_callback"],
  });
  console.log(`[注册客户端] client_id: ${client.client_id}`);

  // 辅助函数：模拟一次完整的 OAuth 握手连接
  function simulateConnect(runIndex) {
    const verifier = "a".repeat(43);
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    const code = store.createAuthorizationCode({
      client_id: client.client_id,
      redirect_uri: "https://claude.ai/api/mcp/oauth_callback",
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    const exchangeRes = store.exchangeCode({
      code,
      client_id: client.client_id,
      redirect_uri: "https://claude.ai/api/mcp/oauth_callback",
      code_verifier: verifier,
    });
    if (!exchangeRes.success) {
      throw new Error(`Exchange failed in run ${runIndex}: ${exchangeRes.error}`);
    }
    const connections = store.listConnections();
    return connections;
  }

  // --- 第 1 次连接 ---
  console.log("\n>>> 第 1 次连接...");
  let conns = simulateConnect(1);
  console.log(`- 当前连接总数: ${conns.length}, 账号标识: ${conns[0].accountIdentifier}, 状态: ${conns[0].status}`);
  if (conns.length !== 1) throw new Error("Expected 1 connection");
  const baseConnId = conns[0].connectionId;

  // --- 第 1 次断开 ---
  console.log("\n>>> 第 1 次断开...");
  store.disconnectConnection(baseConnId);
  conns = store.listConnections();
  console.log(`- 断开后连接总数: ${conns.length}, 状态: ${conns[0].status}`);

  // --- 第 2 次重连 ---
  console.log("\n>>> 第 2 次重连 (同一客户端)...");
  conns = simulateConnect(2);
  console.log(`- 重连后连接总数: ${conns.length}, 账号标识: ${conns[0].accountIdentifier}, connectionId: ${conns[0].connectionId}, 状态: ${conns[0].status}`);
  if (conns.length !== 1) throw new Error(`Expected 1 connection after 2nd connect, got ${conns.length}`);
  if (conns[0].connectionId !== baseConnId) throw new Error("Expected reused connectionId");

  // --- 第 2 次断开 ---
  console.log("\n>>> 第 2 次断开...");
  store.disconnectConnection(baseConnId);

  // --- 第 3 次重连 ---
  console.log("\n>>> 第 3 次重连 (同一客户端)...");
  conns = simulateConnect(3);
  console.log(`- 重连后连接总数: ${conns.length}, 账号标识: ${conns[0].accountIdentifier}, connectionId: ${conns[0].connectionId}, 状态: ${conns[0].status}`);
  if (conns.length !== 1) throw new Error(`Expected 1 connection after 3rd connect, got ${conns.length}`);
  if (conns[0].connectionId !== baseConnId) throw new Error("Expected reused connectionId");

  // --- 第 3 次断开 ---
  console.log("\n>>> 第 3 次断开...");
  store.disconnectConnection(baseConnId);

  console.log("\n>>> 最终断开重连 3 次后连接数统计:");
  console.log(`✅ 实际连接总数: ${store.listConnections().length} (完全复用单个连接记录，未发生任何膨胀)`);

  // 清理临时文件
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch {}
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
