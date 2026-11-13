import { verifyBearer, validateDomain, validatePublicHttpsUrl, jsonResponse } from "./security.mjs";
import { validDeviceId, createDeviceId, createCredential, hashDeviceCredential } from "./device-auth.mjs";

async function dispatchRelay(stub, payload) {
  if (!stub) return { error: "relay_not_configured" };
  try {
    const response=await stub.fetch(new Request("https://relay.internal/dispatch",{
      method:"POST", headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)
    }));
    return await response.json();
  } catch { return {error:"relay_unavailable"}; }
}

async function authenticateDevice(stub,request,deviceId,role){
  try{
    const reply=await stub.fetch(new Request("https://relay.internal/auth",{
      method:"POST",headers:{
        "authorization":request.headers.get("authorization")||"",
        "x-nexus-device-id":deviceId,"x-nexus-role":role
      }
    }));
    return reply.status===200;
  }catch{return false;}
}
async function adminAction(request,env,url) {
  if(!env.NEXUS_ADMIN_TOKEN || env.NEXUS_ADMIN_TOKEN.length<32)return jsonResponse({error:"admin_not_configured"},503);
  if(!await verifyBearer(request,env.NEXUS_ADMIN_TOKEN))return jsonResponse({error:"unauthorized"},401);
  if(request.method!=="POST")return jsonResponse({error:"method_not_allowed"},405);
  if(!env.NEXUS_RELAY)return jsonResponse({error:"relay_not_configured"},503);
  if(url.pathname==="/admin/devices"){
    const deviceId=createDeviceId();
    const deviceToken=createCredential();
    const clientToken=createCredential();
    const state={
      device_id:deviceId,
      agent_hash:await hashDeviceCredential(env.NEXUS_GATEWAY_TOKEN,deviceId,"agent",deviceToken),
      client_hash:await hashDeviceCredential(env.NEXUS_GATEWAY_TOKEN,deviceId,"client",clientToken)
    };
    const stub=env.NEXUS_RELAY.getByName("device:"+deviceId);
    const result=await stub.fetch(new Request("https://relay.internal/provision",{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(state)
    }));
    if(!result.ok)return jsonResponse({error:"device_provision_failed"},503);
    return jsonResponse({device_id:deviceId,device_token:deviceToken,client_token:clientToken},201);
  }
  const match=/^\/admin\/devices\/([a-f0-9]{32})\/(revoke|rotate)$/.exec(url.pathname);
  if(!match)return jsonResponse({error:"not_found"},404);
  const [,deviceId,action]=match;
  const stub=env.NEXUS_RELAY.getByName("device:"+deviceId);
  let data;
  if(action==="rotate"){
    const deviceToken=createCredential();
    const clientToken=createCredential();
    data={
      agent_hash:await hashDeviceCredential(env.NEXUS_GATEWAY_TOKEN,deviceId,"agent",deviceToken),
      client_hash:await hashDeviceCredential(env.NEXUS_GATEWAY_TOKEN,deviceId,"client",clientToken)
    };
    const reply=await stub.fetch(new Request("https://relay.internal/rotate",{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)
    }));
    if(!reply.ok)return jsonResponse({error:"device_rotate_failed"},reply.status);
    return jsonResponse({device_id:deviceId,device_token:deviceToken,client_token:clientToken});
  }
  const reply=await stub.fetch(new Request("https://relay.internal/revoke",{method:"POST"}));
  return reply.ok?jsonResponse({device_id:deviceId,revoked:true}):jsonResponse({error:"device_revoke_failed"},reply.status);
}


const VERSION = "2025-06-18";
const recordTypes = new Set(["A", "AAAA", "CNAME", "MX", "TXT", "NS", "CAA"]);
const TOOLS = [
  { name: "nexus_cloud_dns_lookup", description: "Read public DNS records using Cloudflare DNS over HTTPS.", inputSchema: { type: "object", properties: { domain: { type: "string" }, record_type: { type: "string", enum: [...recordTypes], default: "A" } }, required: ["domain"], additionalProperties: false } },
  { name: "nexus_cloud_rdap_lookup", description: "Read public domain registration summary using RDAP.", inputSchema: { type: "object", properties: { domain: { type: "string" } }, required: ["domain"], additionalProperties: false } },
  { name: "nexus_cloud_http_headers", description: "Check public HTTPS response and selected security headers. Host must be allowlisted.", inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false } },
  { name: "nexus_cloud_http_probe", description: "Measure edge-to-origin HTTPS HEAD request duration. Host must be allowlisted.", inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false } },
];

async function readJsonLimited(request) {
  const len = Number(request.headers.get("content-length") || "0");
  if (len > 65536) throw new Error("request too large");
  if (!request.body) throw new Error("missing request body");
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const entry = await reader.read();
    if (entry.done) break;
    size += entry.value.byteLength;
    if (size > 65536) {
      await reader.cancel();
      throw new Error("request too large");
    }
    chunks.push(entry.value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { all.set(chunk, at); at += chunk.length; }
  return JSON.parse(new TextDecoder().decode(all));
}

async function fetchJson(url, impl) {
  const resp = await impl(url, { method: "GET", redirect: url.startsWith("https://rdap.org/") ? "follow" : "error", signal: AbortSignal.timeout(8000), headers: { Accept: "application/json", "User-Agent": "NexusOpenCloud/0.1" } });
  if (!resp.ok) throw new Error("upstream HTTP " + resp.status);
  const raw = await resp.text();
  if (raw.length > 65536) throw new Error("upstream response too large");
  return JSON.parse(raw);
}

function summarizeHeaders(headers) {
  const names = ["strict-transport-security", "content-security-policy", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy"];
  const result = {};
  for (const name of names) result[name] = (headers.get(name) || "missing").slice(0, 1000);
  return result;
}

async function callTool(name, args, env, impl) {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("arguments must be object");
  if (name === "nexus_cloud_dns_lookup") {
    const domain = validateDomain(args.domain);
    const record = String(args.record_type || "A").toUpperCase();
    if (!recordTypes.has(record)) throw new Error("unsupported DNS record type");
    const result = await fetchJson("https://cloudflare-dns.com/dns-query?name=" + encodeURIComponent(domain) + "&type=" + encodeURIComponent(record), impl);
    return { domain, record_type: record, status: result.Status, answers: Array.isArray(result.Answer) ? result.Answer.slice(0, 30) : [] };
  }
  if (name === "nexus_cloud_rdap_lookup") {
    const domain = validateDomain(args.domain);
    const result = await fetchJson("https://rdap.org/domain/" + encodeURIComponent(domain), impl);
    return { domain, handle: result.handle || null, status: result.status || [], nameservers: (result.nameservers || []).slice(0, 30).map((ns) => ns.ldhName || "").filter(Boolean) };
  }
  if (name === "nexus_cloud_http_headers" || name === "nexus_cloud_http_probe") {
    const url = validatePublicHttpsUrl(args.url, env.NEXUS_ALLOWED_HOSTS || "");
    const start = performance.now();
    const resp = await impl(url.toString(), { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(8000) });
    return {
      url: url.origin + url.pathname,
      status: resp.status,
      duration_ms: Math.round((performance.now() - start) * 100) / 100,
      ...(name === "nexus_cloud_http_headers" ? { security_headers: summarizeHeaders(resp.headers) } : {}),
    };
  }
  throw new Error("unknown tool");
}

function rpcResult(id, result) { return jsonResponse({ jsonrpc: "2.0", id, result }); }
function rpcError(id, code, message, status = 200) { return jsonResponse({ jsonrpc: "2.0", id, error: { code, message } }, status); }

export async function handleRequest(request, env, impl = fetch) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") {
    return jsonResponse({ ok: true, service: "nexus-open-cloud", edition: "open-source", local_execution: false });
  }
  if(!env.NEXUS_GATEWAY_TOKEN || env.NEXUS_GATEWAY_TOKEN.length<32)
    return jsonResponse({error:"gateway_not_configured"},503);
  if(url.pathname.startsWith("/admin/"))return adminAction(request,env,url);
  // Path-based device addressing works with MCP clients that cannot set custom headers.
  // An explicit header is still supported for direct API consumers.
  const scoped=new RegExp("^/d/([a-f0-9]{32})(/mcp|/relay/agent|/relay/status)$").exec(url.pathname);
  const routePath=scoped?.[2]||url.pathname;
  if(!["/mcp","/relay/agent","/relay/status"].includes(routePath))
    return jsonResponse({error:"not_found"},404);
  if(!env.NEXUS_RELAY)return jsonResponse({error:"relay_not_configured"},503);
  if(routePath==="/mcp" && request.method!=="POST")
    return jsonResponse({error:"method_not_allowed"},405);
  const headerDeviceId=request.headers.get("x-nexus-device-id");
  const deviceId=scoped?.[1]||headerDeviceId;
  if(!validDeviceId(deviceId) || (scoped && headerDeviceId && headerDeviceId!==deviceId))
    return jsonResponse({error:"invalid_device_id"},400);
  const stub=env.NEXUS_RELAY.getByName("device:"+deviceId);
  const role=routePath==="/relay/agent"?"agent":"client";
  if(!await authenticateDevice(stub,request,deviceId,role)){
    const response=jsonResponse({error:"unauthorized"},401);
    response.headers.set("WWW-Authenticate",'Bearer realm="Nexus Device"');
    return response;
  }
  if(routePath==="/relay/agent"){
    if(request.method!=="GET" || request.headers.get("upgrade")?.toLowerCase()!=="websocket")
      return jsonResponse({error:"websocket_required"},426);
    return stub.fetch(new Request("https://relay.internal/connect",{headers:{"Upgrade":"websocket"}}));
  }
  if(routePath==="/relay/status"){
    if(request.method!=="GET")return jsonResponse({error:"method_not_allowed"},405);
    return stub.fetch(new Request("https://relay.internal/status"));
  }
  let rpc;
  try { rpc = await readJsonLimited(request); }
  catch { return rpcError(null, -32700, "invalid or oversized JSON request", 400); }
  if (!rpc || rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string" || (rpc.id !== undefined && typeof rpc.id !== "string" && typeof rpc.id !== "number")) return rpcError(null, -32600, "invalid JSON-RPC request", 400);
  if (rpc.id === undefined) return new Response(null, { status: 202, headers: { "Cache-Control": "no-store" } });

  if (rpc.method === "initialize") {
    return rpcResult(rpc.id, {
      protocolVersion: VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "nexus-open-cloud", version: "0.1.0" },
      instructions: "Cloud-native tools run in Workers. Local tools appear only while an explicitly allowlisted local Agent is connected. Local authorization always applies.",
    });
  }
  if (rpc.method === "ping") return rpcResult(rpc.id, {});
  if (rpc.method === "tools/list") {
    const relay = await dispatchRelay(stub, {type:"list"});
    const remote = Array.isArray(relay?.result?.tools) ? relay.result.tools.slice(0, 120) : [];
    return rpcResult(rpc.id, {tools:[...TOOLS, ...remote]});
  }
  if (rpc.method === "tools/call") {
    const name = rpc.params?.name;
    const args = rpc.params?.arguments || {};
    if (!TOOLS.some((tool) => tool.name === name)) {
      if (typeof name !== "string" || !name.startsWith("nexus_local__")) return rpcError(rpc.id, -32602, "unknown tool");
      const relay = await dispatchRelay(stub, {type:"call", name, args});
      if (relay.error) return rpcResult(rpc.id, {content:[{type:"text",text:relay.error}],isError:true});
      return rpcResult(rpc.id, relay.result ?? {content:[{type:"text",text:"empty response"}],isError:true});
    }
    try {
      const result = await callTool(name, args, env, impl);
      return rpcResult(rpc.id, { content: [{ type: "text", text: JSON.stringify(result) }], isError: false });
    } catch (err) {
      return rpcResult(rpc.id, { content: [{ type: "text", text: String(err?.message || "tool failed").slice(0, 500) }], isError: true });
    }
  }
  return rpcError(rpc.id, -32601, "method not found");
}

export default { fetch: (request, env) => handleRequest(request, env) };
