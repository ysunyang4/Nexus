import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const PUBLIC_BASE = "https://mcp.example.com";
const LOCAL_BASE = "http://127.0.0.1:8787";

function getManagementToken() {
  if (process.env.LOCALBRIDGE_MANAGEMENT_TOKEN) return process.env.LOCALBRIDGE_MANAGEMENT_TOKEN.trim();
  if (process.env.NEXUS_MANAGEMENT_TOKEN) return process.env.NEXUS_MANAGEMENT_TOKEN.trim();
  const tokenPath = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "LocalBridge", "data", "management-token.key")
    : "";
  if (tokenPath && fs.existsSync(tokenPath)) {
    return fs.readFileSync(tokenPath, "utf-8").trim();
  }
  return "";
}

function generatePkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function runTest() {
  console.log("==================================================================");
  console.log("  PUBLIC MCP + OAuth + DCR + PKCE + Token + Refresh + tools/list  ");
  console.log("==================================================================");
  console.log(`Public Target: ${PUBLIC_BASE}`);

  const mgmtToken = getManagementToken();
  if (!mgmtToken) {
    throw new Error("Management token not found in env or management-token.key");
  }

  // 1. Discovery checks
  console.log("\n[STEP 1] Testing OAuth Discovery Metadata...");
  const protRes = await fetch(`${PUBLIC_BASE}/.well-known/oauth-protected-resource`);
  if (!protRes.ok) throw new Error(`Protected resource metadata failed: HTTP ${protRes.status}`);
  const protMeta = await protRes.json();
  console.log("  Protected Resource:", protMeta.resource);
  if (protMeta.resource !== `${PUBLIC_BASE}/mcp`) {
    throw new Error(`Protected resource mismatch: ${protMeta.resource} !== ${PUBLIC_BASE}/mcp`);
  }

  const authRes = await fetch(`${PUBLIC_BASE}/.well-known/oauth-authorization-server`);
  if (!authRes.ok) throw new Error(`Auth server metadata failed: HTTP ${authRes.status}`);
  const authMeta = await authRes.json();
  console.log("  Issuer:", authMeta.issuer);
  console.log("  iss parameter supported:", authMeta.authorization_response_iss_parameter_supported);
  console.log("  Scopes supported:", authMeta.scopes_supported);
  if (authMeta.issuer !== PUBLIC_BASE) {
    throw new Error(`Issuer mismatch: ${authMeta.issuer} !== ${PUBLIC_BASE}`);
  }
  if (!authMeta.authorization_response_iss_parameter_supported) {
    throw new Error("authorization_response_iss_parameter_supported must be true per RFC 9207");
  }
  if (!authMeta.scopes_supported.includes("offline_access")) {
    throw new Error("scopes_supported must include offline_access");
  }

  // 2. DCR (Dynamic Client Registration)
  console.log("\n[STEP 2] Testing Dynamic Client Registration (DCR)...");
  const dcrPayload = {
    client_name: "ChatGPT Custom Connector",
    redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
  const dcrRes = await fetch(`${PUBLIC_BASE}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dcrPayload),
  });
  if (!dcrRes.ok) {
    const errText = await dcrRes.text();
    throw new Error(`DCR failed: HTTP ${dcrRes.status}: ${errText}`);
  }
  const dcrData = await dcrRes.json();
  console.log("  Registered Client ID:", dcrData.client_id);
  console.log("  Redirect URIs:", dcrData.redirect_uris);
  if (!dcrData.client_id) throw new Error("DCR did not return client_id");

  // 3. Authorization Request with PKCE
  console.log("\n[STEP 3] Testing Authorization Request with PKCE...");
  const { verifier, challenge } = generatePkce();
  const authPayload = {
    client_id: dcrData.client_id,
    redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect",
    response_type: "code",
    scope: "nexus:read offline_access",
    state: "chatgpt_state_random_7788",
    code_challenge: challenge,
    code_challenge_method: "S256",
    action: "approve",
  };
  const createAuthRes = await fetch(`${PUBLIC_BASE}/oauth/authorize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(authPayload),
  });
  if (createAuthRes.status !== 202) {
    const text = await createAuthRes.text();
    throw new Error(`Authorize request failed: HTTP ${createAuthRes.status}: ${text}`);
  }
  const pendingData = await createAuthRes.json();
  console.log("  Pending Request ID:", pendingData.requestId);
  console.log("  Pairing Code:", pendingData.pairingCode);

  // 4. Resolve Pending Auth Request via Local Desktop Management Endpoint
  console.log("\n[STEP 4] Resolving Pending Auth Request via Desktop Management...");
  const resolveRes = await fetch(`${LOCAL_BASE}/oauth/requests/${pendingData.requestId}/resolve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${mgmtToken}`,
    },
    body: JSON.stringify({
      action: "approve",
      pairing_code: pendingData.pairingCode,
    }),
  });
  if (!resolveRes.ok) {
    const text = await resolveRes.text();
    throw new Error(`Resolve failed: HTTP ${resolveRes.status}: ${text}`);
  }
  const resolveData = await resolveRes.json();
  console.log("  Approval Success:", resolveData.approved);
  console.log("  Auth Code:", resolveData.code);
  console.log("  Redirect URL:", resolveData.redirectUrl);

  // Verify RFC 9207 iss in redirect URL
  const parsedRedirect = new URL(resolveData.redirectUrl);
  const issParam = parsedRedirect.searchParams.get("iss");
  const codeParam = parsedRedirect.searchParams.get("code");
  const stateParam = parsedRedirect.searchParams.get("state");
  console.log("  Parsed iss parameter:", issParam);
  console.log("  Parsed state parameter:", stateParam);
  if (issParam !== PUBLIC_BASE) {
    throw new Error(`RFC 9207 iss mismatch in redirectUrl: expected '${PUBLIC_BASE}', got '${issParam}'`);
  }
  if (!codeParam) throw new Error("No code parameter in redirectUrl");
  if (stateParam !== "chatgpt_state_random_7788") throw new Error("State parameter mismatch");

  // 5. Token Exchange
  console.log("\n[STEP 5] Testing Code Exchange for Tokens (RFC 6749)...");
  const tokenParams = new URLSearchParams({
    grant_type: "authorization_code",
    code: codeParam,
    redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect",
    code_verifier: verifier,
    client_id: dcrData.client_id,
  });
  const tokenRes = await fetch(`${PUBLIC_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenParams.toString(),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Token exchange failed: HTTP ${tokenRes.status}: ${text}`);
  }
  const tokenData = await tokenRes.json();
  console.log("  Access Token:", tokenData.access_token?.slice(0, 16) + "...");
  console.log("  Refresh Token:", tokenData.refresh_token?.slice(0, 16) + "...");
  console.log("  Token Type:", tokenData.token_type);
  console.log("  Expires In:", tokenData.expires_in);
  if (!tokenData.access_token || !tokenData.refresh_token) {
    throw new Error("Token exchange did not return both access_token and refresh_token");
  }

  // 6. Token Refresh
  console.log("\n[STEP 6] Testing Token Refresh (grant_type=refresh_token)...");
  const refreshParams = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokenData.refresh_token,
  });
  const refreshRes = await fetch(`${PUBLIC_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: refreshParams.toString(),
  });
  if (!refreshRes.ok) {
    const text = await refreshRes.text();
    throw new Error(`Token refresh failed: HTTP ${refreshRes.status}: ${text}`);
  }
  const refreshData = await refreshRes.json();
  console.log("  Refreshed Access Token:", refreshData.access_token?.slice(0, 16) + "...");
  console.log("  Refreshed Refresh Token:", refreshData.refresh_token?.slice(0, 16) + "...");
  if (!refreshData.access_token || !refreshData.refresh_token) {
    throw new Error("Token refresh did not return new access_token and refresh_token");
  }

  const activeAccessToken = refreshData.access_token;

  // 7. Public MCP initialize with OAuth Access Token
  console.log("\n[STEP 7] Testing Public MCP initialize with OAuth Access Token...");
  const initPayload = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "ChatGPT Custom MCP Connector", version: "1.0.0" },
    },
  };
  const initRes = await fetch(`${PUBLIC_BASE}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${activeAccessToken}`,
      "Accept": "application/json, text/event-stream",
    },
    body: JSON.stringify(initPayload),
  });
  if (!initRes.ok) {
    const text = await initRes.text();
    throw new Error(`MCP initialize failed: HTTP ${initRes.status}: ${text}`);
  }
  const sessionId = initRes.headers.get("mcp-session-id");
  const initData = await initRes.json();
  console.log("  MCP Session ID:", sessionId);
  console.log("  Server Info:", initData.result?.serverInfo?.name, initData.result?.serverInfo?.version);
  console.log("  Protocol Version:", initData.result?.protocolVersion);
  if (!sessionId) throw new Error("MCP initialize did not return mcp-session-id header");

  // 8. Public tools/list
  console.log("\n[STEP 8] Testing Public tools/list...");
  const listPayload = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  };
  const listRes = await fetch(`${PUBLIC_BASE}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${activeAccessToken}`,
      "Mcp-Session-Id": sessionId,
      "Accept": "application/json, text/event-stream",
    },
    body: JSON.stringify(listPayload),
  });
  if (!listRes.ok) {
    const text = await listRes.text();
    throw new Error(`tools/list failed: HTTP ${listRes.status}: ${text}`);
  }
  const listData = await listRes.json();
  const tools = listData.result?.tools || [];
  console.log(`  Discovered Tools: ${tools.length}`);
  const hasProjectList = tools.some((t) => t.name === "localbridge_project_list" || t.name === "nexus_project_list");
  const hasUnityTools = tools.some((t) => t.name.startsWith("unity-gamedev::") || t.name.includes("scene-get-data") || t.name.includes("gameobject-find"));
  console.log("  Contains project list tool:", hasProjectList);
  console.log("  Contains unity tools:", hasUnityTools);
  if (tools.length === 0) throw new Error("tools/list returned empty list");

  // 9. Public localbridge_project_list tool call
  console.log("\n[STEP 9] Testing Public localbridge_project_list tool execution...");
  const callPayload = {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "localbridge_project_list",
      arguments: {},
    },
  };
  const callRes = await fetch(`${PUBLIC_BASE}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${activeAccessToken}`,
      "Mcp-Session-Id": sessionId,
      "Accept": "application/json, text/event-stream",
    },
    body: JSON.stringify(callPayload),
  });
  if (!callRes.ok) {
    const text = await callRes.text();
    throw new Error(`Tool call failed: HTTP ${callRes.status}: ${text}`);
  }
  const callData = await callRes.json();
  const rawText = callData.result?.content?.[0]?.text;
  console.log("  Execution Result snippet:", rawText?.slice(0, 150));
  if (callData.result?.isError) {
    throw new Error(`Tool call returned isError=true: ${rawText}`);
  }

  // 10. ChatGPT Root Path Probe (POST / with initialize)
  console.log("\n[STEP 10] Testing ChatGPT root path probe (POST /)...");
  const rootInitRes = await fetch(`${PUBLIC_BASE}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${activeAccessToken}`,
      "Accept": "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 10,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "ChatGPT Probe", version: "1.0.0" },
      },
    }),
  });
  if (!rootInitRes.ok) {
    const text = await rootInitRes.text();
    throw new Error(`Root probe failed: HTTP ${rootInitRes.status}: ${text}`);
  }
  const rootInitData = await rootInitRes.json();
  console.log("  Root Probe Server Name:", rootInitData.result?.serverInfo?.name);
  console.log("  Root Probe Protocol Version:", rootInitData.result?.protocolVersion);

  console.log("\n==================================================================");
  console.log("  ALL PUBLIC E2E CHECKS PASSED SUCCESSFULLY!                      ");
  console.log("==================================================================");
}

runTest().catch((err) => {
  console.error("\nTEST FAILED:", err);
  process.exit(1);
});
