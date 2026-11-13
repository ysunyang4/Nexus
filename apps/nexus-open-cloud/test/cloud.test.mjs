import test from "node:test";
import assert from "node:assert/strict";
import {handleRequest} from "../src/worker.mjs";
import {hashDeviceCredential} from "../src/device-auth.mjs";
import {validateDomain,validatePublicHttpsUrl} from "../src/security.mjs";

const root="unit-root-abcdef0123456789-0123456789abcdef";
const admin="unit-admin-abcdef0123456789-0123456789abcdef";
const cloud="https://nexus.example";

function environment(){
  const registered=new Map();
  const env={NEXUS_GATEWAY_TOKEN:root,NEXUS_ADMIN_TOKEN:admin,NEXUS_ALLOWED_HOSTS:"example.com"};
  env.NEXUS_RELAY={
    getByName(name){
      return {async fetch(request){
        const pathname=new URL(request.url).pathname;
        const state=registered.get(name);
        if(pathname==="/provision"){
          if(state)return new Response("{}",{status:409});
          registered.set(name,await request.json());
          return new Response("{}",{status:201});
        }
        if(pathname==="/auth"){
          if(!state || state.revoked)return new Response("{}",{status:401});
          const role=request.headers.get("x-nexus-role");
          const token=(request.headers.get("authorization")||"").replace(/^Bearer /,"");
          const digest=await hashDeviceCredential(root,state.device_id,role,token);
          const accepted=state.device_id===request.headers.get("x-nexus-device-id") && state[role+"_hash"]===digest;
          return new Response("{}",{status:accepted?200:401});
        }
        if(pathname==="/dispatch")return new Response(JSON.stringify({error:"local_agent_offline"}),{status:503});
        if(pathname==="/status")return new Response(JSON.stringify({local_agent_online:false}));
        if(pathname==="/rotate"){
          if(!state || state.revoked)return new Response("{}",{status:403});
          registered.set(name,{...state,...await request.json()});
          return new Response("{}",{status:200});
        }
        if(pathname==="/revoke"){
          if(!state)return new Response("{}",{status:404});
          registered.set(name,{...state,revoked:true});
          return new Response("{}",{status:200});
        }
        return new Response("{}",{status:404});
      }};
    }
  };
  return env;
}
const rpc=(device,method,params={},token=device.client_token,devId=device.device_id)=>new Request(cloud+"/d/"+devId+"/mcp",{
  method:"POST",headers:{Authorization:"Bearer "+token,"X-Nexus-Device-Id":devId,"Content-Type":"application/json"},
  body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})
});
async function enroll(env){
  const request=new Request(cloud+"/admin/devices",{method:"POST",headers:{Authorization:"Bearer "+admin}});
  const response=await handleRequest(request,env);
  assert.equal(response.status,201);
  return response.json();
}

test("public health has no local execution",async()=>{
  const r=await handleRequest(new Request(cloud+"/health"),environment());
  assert.equal(r.status,200);
  assert.equal((await r.json()).local_execution,false);
});
test("admin enrollment requires distinct secret, does not expose root",async()=>{
  const env=environment();
  const denied=await handleRequest(new Request(cloud+"/admin/devices",{method:"POST",headers:{Authorization:"Bearer "+root}}),env);
  assert.equal(denied.status,401);
  const d=await enroll(env);
  assert.match(d.device_id,/^[a-f0-9]{32}$/);
  assert.match(d.device_token,/^[a-f0-9]{64}$/);
  assert.match(d.client_token,/^[a-f0-9]{64}$/);
  assert.notEqual(d.device_token,d.client_token);
  assert.notEqual(d.device_token,root);
});
test("MCP is device scoped and rejects root, agent credential, missing ID and wrong device",async()=>{
  const env=environment();
  const a=await enroll(env),b=await enroll(env);
  assert.equal((await handleRequest(rpc(a,"ping"),env)).status,200);
  const pathOnly=rpc(a,"ping");
  pathOnly.headers.delete("X-Nexus-Device-Id");
  assert.equal((await handleRequest(pathOnly,env)).status,200);
  const mismatch=rpc(a,"ping");
  mismatch.headers.set("X-Nexus-Device-Id",b.device_id);
  assert.equal((await handleRequest(mismatch,env)).status,400);
  assert.equal((await handleRequest(rpc(a,"ping",{},root),env)).status,401);
  assert.equal((await handleRequest(rpc(a,"ping",{},a.device_token),env)).status,401);
  assert.equal((await handleRequest(rpc(a,"ping",{},a.client_token,b.device_id),env)).status,401);
  assert.equal((await handleRequest(new Request(cloud+"/mcp",{method:"POST",headers:{Authorization:"Bearer "+a.client_token}}),env)).status,400);
  assert.equal((await handleRequest(rpc(b,"ping"),env)).status,200);
});
test("MCP lists four cloud-only tools and prevents unknown local dispatch",async()=>{
  const env=environment(),device=await enroll(env);
  const init=await (await handleRequest(rpc(device,"initialize"),env)).json();
  assert.equal(init.result.serverInfo.name,"nexus-open-cloud");
  const data=await (await handleRequest(rpc(device,"tools/list"),env)).json();
  assert.equal(data.result.tools.length,4);
  const unknown=await (await handleRequest(rpc(device,"tools/call",{name:"localbridge_command_run",arguments:{command:"whoami"}}),env)).json();
  assert.equal(unknown.error.code,-32602);
  const blocked=await (await handleRequest(rpc(device,"tools/call",{name:"nexus_local__localbridge_command_run",arguments:{command:"whoami"}}),env)).json();
  assert.equal(blocked.result.isError,true);
});
test("rotation invalidates old client and agent tokens; revoke denies both",async()=>{
  const env=environment(),device=await enroll(env);
  const rotate=new Request(cloud+"/admin/devices/"+device.device_id+"/rotate",{method:"POST",headers:{Authorization:"Bearer "+admin}});
  const result=await handleRequest(rotate,env);
  assert.equal(result.status,200);
  const newer=await result.json();
  assert.equal((await handleRequest(rpc(device,"ping"),env)).status,401);
  assert.equal((await handleRequest(rpc(newer,"ping"),env)).status,200);
  const revoke=new Request(cloud+"/admin/devices/"+device.device_id+"/revoke",{method:"POST",headers:{Authorization:"Bearer "+admin}});
  assert.equal((await handleRequest(revoke,env)).status,200);
  assert.equal((await handleRequest(rpc(newer,"ping"),env)).status,401);
  assert.equal((await handleRequest(rpc(newer,"ping",{},newer.device_token),env)).status,401);
});
test("reject private hosts and require explicit allowlist",()=>{
  for(const domain of ["localhost","home.local","127.0.0.1","server.internal","-bad.com"])assert.throws(()=>validateDomain(domain));
  assert.throws(()=>validatePublicHttpsUrl("http://example.com","example.com"));
  assert.throws(()=>validatePublicHttpsUrl("https://localhost","localhost"));
  assert.throws(()=>validatePublicHttpsUrl("https://other.com","example.com"));
  assert.equal(validatePublicHttpsUrl("https://example.com/","example.com").hostname,"example.com");
});
test("DNS lookup uses fixed Cloudflare DoH origin",async()=>{
  const env=environment(),device=await enroll(env);
  let seen="";
  const impl=async url=>{seen=String(url);return new Response(JSON.stringify({Status:0,Answer:[]}),{status:200});};
  const reply=await (await handleRequest(rpc(device,"tools/call",{name:"nexus_cloud_dns_lookup",arguments:{domain:"example.com"}}),env,impl)).json();
  assert.equal(reply.result.isError,false);
  assert.ok(seen.startsWith("https://cloudflare-dns.com/dns-query"));
});
test("HTTPS headers do not follow redirects or leak cookies",async()=>{
  const env=environment(),device=await enroll(env);
  let method="",redirect="";
  const impl=async (_url,options)=>{
    method=options.method;redirect=options.redirect;
    return new Response(null,{status:302,headers:{"location":"http://127.0.0.1/admin","set-cookie":"private=secret","strict-transport-security":"max-age=31536000"}});
  };
  const res=await (await handleRequest(rpc(device,"tools/call",{name:"nexus_cloud_http_headers",arguments:{url:"https://example.com/a"}}),env,impl)).json();
  assert.equal(method,"HEAD");assert.equal(redirect,"manual");
  assert.ok(!res.result.content[0].text.includes("private=secret"));
});
