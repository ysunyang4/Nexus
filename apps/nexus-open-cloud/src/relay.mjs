import { DurableObject } from "cloudflare:workers";
import { jsonResponse } from "./security.mjs";
import { validDeviceId, hashDeviceCredential, constantTimeEqualHex, bearerToken } from "./device-auth.mjs";

// One Durable Object per random device ID. Device and MCP client credentials are
// separate, stored only as keyed digests; neither has authority over other devices.
export class NexusRelay extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.pending = new Map();
  }

  async state() {
    return this.ctx.storage.get("device-credentials");
  }

  liveAgent() {
    return this.ctx.getWebSockets().find(ws =>
      ws.deserializeAttachment()?.role === "agent" && ws.readyState === WebSocket.OPEN
    ) || null;
  }

  disconnectAll(reason = "device_credentials_changed") {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.deserializeAttachment()?.role === "agent") ws.close(1012, reason);
    }
    for (const entry of this.pending.values()) entry.resolve({error:reason});
    this.pending.clear();
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/provision") {
      if (request.method !== "POST") return jsonResponse({error:"method_not_allowed"},405);
      if (await this.state()) return jsonResponse({error:"device_already_registered"},409);
      const body = await request.json().catch(()=>null);
      if (!body || !validDeviceId(body.device_id) ||
          !/^[0-9a-f]{64}$/.test(body.agent_hash || "") ||
          !/^[0-9a-f]{64}$/.test(body.client_hash || "")) return jsonResponse({error:"invalid_provision"},400);
      await this.ctx.storage.put("device-credentials", {
        device_id: body.device_id,
        agent_hash:body.agent_hash,
        client_hash:body.client_hash,
        revoked:false,
        created_at:Date.now()
      });
      return jsonResponse({registered:true},201);
    }
    if (path === "/rotate" || path === "/revoke") {
      if(request.method!=="POST")return jsonResponse({error:"method_not_allowed"},405);
      const old=await this.state();
      if(!old)return jsonResponse({error:"device_not_found"},404);
      if(path==="/rotate"){
        if(old.revoked)return jsonResponse({error:"device_revoked"},403);
        const b=await request.json().catch(()=>null);
        if(!/^[0-9a-f]{64}$/.test(b?.agent_hash||"") || !/^[0-9a-f]{64}$/.test(b?.client_hash||""))return jsonResponse({error:"invalid_rotation"},400);
        await this.ctx.storage.put("device-credentials",{...old,agent_hash:b.agent_hash,client_hash:b.client_hash,updated_at:Date.now()});
      }else{
        await this.ctx.storage.put("device-credentials",{...old,revoked:true,revoked_at:Date.now()});
      }
      this.disconnectAll(path==="/revoke"?"device_revoked":"device_credentials_rotated");
      return jsonResponse({updated:true});
    }
    if (path === "/auth") {
      if (request.method !== "POST") return jsonResponse({error:"method_not_allowed"},405);
      const state=await this.state();
      if(!state || state.revoked || state.device_id !== request.headers.get("x-nexus-device-id")) return jsonResponse({error:"unauthorized"},401);
      const role=request.headers.get("x-nexus-role");
      if (!["agent","client"].includes(role)) return jsonResponse({error:"unauthorized"},401);
      const token=bearerToken(request);
      if(!token)return jsonResponse({error:"unauthorized"},401);
      const hash=await hashDeviceCredential(this.env.NEXUS_GATEWAY_TOKEN,state.device_id,role,token);
      if(!constantTimeEqualHex(hash,state[role+"_hash"]))return jsonResponse({error:"unauthorized"},401);
      return jsonResponse({authorized:true});
    }
    if (path === "/connect") {
      if (request.method !== "GET" || request.headers.get("upgrade")?.toLowerCase() !== "websocket")
        return jsonResponse({error:"websocket_required"},426);
      const state=await this.state();
      if(!state || state.revoked)return jsonResponse({error:"device_not_authorized"},403);
      this.disconnectAll("agent_reconnected");
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({role:"agent"});
      return new Response(null,{status:101,webSocket:client});
    }
    if (path === "/status") {
      const state=await this.state();
      return jsonResponse({local_agent_online:!!state && !state.revoked && !!this.liveAgent()});
    }
    if (path === "/dispatch") {
      if(request.method!=="POST")return jsonResponse({error:"method_not_allowed"},405);
      const state=await this.state();
      if(!state || state.revoked)return jsonResponse({error:"device_revoked"},403);
      const agent=this.liveAgent();
      if(!agent)return jsonResponse({error:"local_agent_offline"},503);
      let body;
      try{
        const raw=await request.text();
        if(raw.length>65000)throw Error("too_large");
        body=JSON.parse(raw);
      }catch{return jsonResponse({error:"invalid_dispatch"},400);}
      if(!body || !["list","call"].includes(body.type))return jsonResponse({error:"invalid_dispatch_type"},400);
      if(body.type==="call" && (typeof body.name!=="string" || !body.name.startsWith("nexus_local__")))
        return jsonResponse({error:"invalid_tool"},400);
      const id=crypto.randomUUID();
      const outcome=await new Promise(resolve=>{
        const timer=setTimeout(()=>{this.pending.delete(id);resolve({error:"local_agent_timeout"});},18000);
        this.pending.set(id,{agent,resolve:value=>{clearTimeout(timer);resolve(value);}});
        try{agent.send(JSON.stringify({id,...body}));}
        catch{clearTimeout(timer);this.pending.delete(id);resolve({error:"local_agent_unavailable"});}
      });
      return jsonResponse(outcome,outcome.error?503:200);
    }
    return jsonResponse({error:"not_found"},404);
  }

  webSocketMessage(ws,message){
    if(typeof message!=="string" || message.length>1_000_000){ws.close(1009,"message too large");return;}
    let msg;
    try{msg=JSON.parse(message);}catch{return;}
    if(msg.type==="heartbeat")return;
    if(typeof msg.id!=="string")return;
    const entry=this.pending.get(msg.id);
    if(!entry || entry.agent!==ws)return;
    this.pending.delete(msg.id);
    entry.resolve(msg.error?{error:String(msg.error).slice(0,300)}:{result:msg.result});
  }
  webSocketClose(ws){
    for(const [id,entry] of this.pending){
      if(entry.agent===ws){this.pending.delete(id);entry.resolve({error:"local_agent_disconnected"});}
    }
  }
  webSocketError(ws){this.webSocketClose(ws);}
}
