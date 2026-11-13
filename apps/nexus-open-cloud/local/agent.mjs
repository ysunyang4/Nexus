#!/usr/bin/env node
// Explicitly opt-in local execution adapter: cloud routes, Nexus authorizes and executes.
import WebSocket from "ws";
import {HttpsProxyAgent} from "https-proxy-agent";
import {resolveCloudProxy} from "./network-proxy.mjs";
import {readCredentials} from "./device-credentials.mjs";

// The Cloudflare service root NEVER runs on the client. Device credentials are
// independently enrolled and sealed for this Windows user with DPAPI.
const deviceConfig=readCredentials("device");
const CLOUD=process.env.NEXUS_CLOUD_URL || deviceConfig?.cloud_url ||
  "https://nexus-open-cloud-tools.example-domain5628.workers.dev";
const deviceId=process.env.NEXUS_DEVICE_ID || deviceConfig?.device_id || "";
const deviceToken=process.env.NEXUS_DEVICE_TOKEN || deviceConfig?.device_token || "";
const localToken=process.env.NEXUS_LOCAL_MCP_TOKEN || "";
const localURL=process.env.NEXUS_LOCAL_MCP_URL || "http://127.0.0.1:8787/mcp";
const allowed=new Set((process.env.NEXUS_REMOTE_ALLOWED_TOOLS||"").split(",").map(s=>s.trim()).filter(s=>s && s!=="*"));
let session = "";
let initialized = false;
let localSequence = 0;

function checkConfiguration() {
  const cloud = new URL(CLOUD);
  const local = new URL(localURL);
  if (cloud.protocol !== "https:") throw new Error("Cloud gateway must be HTTPS/WSS");
  if (local.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(local.hostname)) throw new Error("Local MCP endpoint must be loopback HTTP");
  if (!local.pathname.endsWith("/mcp")) throw new Error("Local MCP endpoint must end with /mcp");
  if (!/^[a-f0-9]{32}$/.test(deviceId) || !/^[0-9a-f]{64}$/.test(deviceToken))
    throw new Error("Device not enrolled; run node local/manage-devices.mjs enroll");
  if (allowed.size && localToken.length < 16)
    throw new Error("Set NEXUS_LOCAL_MCP_TOKEN for explicitly allowlisted local tools");
  if (!allowed.size) console.warn("[Nexus Relay] No tools allowlisted; remote access is read-only cloud tools only");
}

async function localRpc(method, params = {}, notification = false) {
  const body = JSON.stringify({jsonrpc:"2.0", ...(notification ? {} : {id: ++localSequence}), method, params});
  const headers = {
    authorization: "Bearer " + localToken,
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "mcp-protocol-version": "2025-06-18",
  };
  if (session) headers["mcp-session-id"] = session;
  const response = await fetch(localURL, {method:"POST", headers, body, signal:AbortSignal.timeout(15000), redirect:"error"});
  if (response.status === 401 || response.status === 403) throw new Error("local_mcp_auth_denied");
  if (!response.ok && response.status !== 202) throw new Error("local_mcp_http_" + response.status);
  const sessionHeader = response.headers.get("mcp-session-id");
  if (sessionHeader) session = sessionHeader;
  if (notification || response.status === 202) return {};
  const text = await response.text();
  if (text.length > 950000) throw new Error("local_response_too_large");
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const last = text.split(/\r?\n/).filter((line) => line.startsWith("data: ")).at(-1);
    if (!last) throw new Error("local_mcp_sse_empty");
    return JSON.parse(last.slice(6));
  }
  return JSON.parse(text);
}

async function ensureLocalSession() {
  if (initialized) return;
  const answer = await localRpc("initialize", {
    protocolVersion:"2025-06-18", capabilities:{}, clientInfo:{name:"nexus-open-cloud-local-agent",version:"0.2.0"}
  });
  if (answer.error) throw new Error("local_mcp_initialize_failed");
  initialized = true;
  await localRpc("notifications/initialized", {}, true);
}

async function getTools() {
  if (!allowed.size) return [];
  await ensureLocalSession();
  const reply = await localRpc("tools/list");
  if (reply.error || !Array.isArray(reply.result?.tools)) throw new Error("local_tool_listing_failed");
  return reply.result.tools.filter((def)=>allowed.has(def.name)).slice(0,120).map((def)=>({
    name:"nexus_local__" + def.name,
    description:"Local Nexus (on-device permission applies): " + String(def.description || "").slice(0,500),
    inputSchema: def.inputSchema || {type:"object",properties:{}}
  }));
}

async function handleMessage(message) {
  if (message.type === "list") return {tools:await getTools()};
  if (message.type !== "call") throw new Error("unsupported_message");
  if (typeof message.name !== "string" || !message.name.startsWith("nexus_local__")) throw new Error("unsupported_tool");
  const name = message.name.slice("nexus_local__".length);
  if (!allowed.has(name)) throw new Error("tool_not_allowlisted");
  const defs = await getTools();
  if (!defs.some((def)=>def.name===message.name)) throw new Error("tool_unavailable");
  const answer = await localRpc("tools/call", {name, arguments:message.args || {}});
  if (answer.error) return {content:[{type:"text",text:"Nexus rejected request: " + String(answer.error.message || "unknown").slice(0,350)}],isError:true};
  return answer.result || {content:[{type:"text",text:"empty result"}],isError:true};
}

function openConnection() {
  let activeRequests = 0;
  const endpoint = new URL(CLOUD);
  endpoint.protocol = "wss:";
  endpoint.pathname = "/d/" + deviceId + "/relay/agent";
  endpoint.search = "";
  const proxy = resolveCloudProxy();
  const ws = new WebSocket(endpoint.toString(), {headers:{Authorization:"Bearer " + deviceToken,"X-Nexus-Device-Id":deviceId}, handshakeTimeout:12000, maxPayload:1_000_000, ...(proxy ? {agent:new HttpsProxyAgent(proxy)} : {})});
  const heartbeat = setInterval(()=>{if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type:"heartbeat"}));},25000);
  ws.on("open", ()=>console.log("[Nexus Relay] secure cloud link connected (tool allowlist count: " + allowed.size + ")"));
  ws.on("message", async (data)=>{
    let msg;
    try { msg = JSON.parse(data.toString("utf8")); } catch {return;}
    if (!msg?.id || !["list","call"].includes(msg.type)) return;
    if (activeRequests >= 4) { ws.send(JSON.stringify({id:msg.id,error:"local_agent_busy"}));return;}
    activeRequests += 1;
    try {
      const result = await handleMessage(msg);
      if (ws.readyState === WebSocket.OPEN) {
        const response = JSON.stringify({id:msg.id,result});
        if (response.length > 950000) throw new Error("result_too_large");
        ws.send(response);
      }
    } catch (err) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({id:msg.id,error:String(err?.message || "local_tool_failed").slice(0,200)}));
      if (/session|http_40[49]/i.test(String(err?.message || ""))) {initialized=false;session="";}
    } finally { activeRequests -= 1; }
  });
  ws.on("error", ()=>console.warn("[Nexus Relay] connection issue; retrying"));
  ws.on("close", ()=>{clearInterval(heartbeat);setTimeout(openConnection,5000);});
}

try {checkConfiguration();openConnection();}
catch (err) {console.error("[Nexus Relay] Configuration error: " + String(err.message));process.exitCode=1;}
