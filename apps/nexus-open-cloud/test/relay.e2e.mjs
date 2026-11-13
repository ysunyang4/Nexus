#!/usr/bin/env node
// Cloudflare -> dedicated Durable Object -> WSS -> harmless isolated mock MCP.
// Creates a disposable device, never displaces an existing user device, revokes in finally.
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawn} from "node:child_process";
import {ProxyAgent} from "undici";
import {resolveCloudProxy} from "../local/network-proxy.mjs";
import {readCredentials} from "../local/device-credentials.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const CLOUD=process.env.NEXUS_CLOUD_URL||"https://nexus-open-cloud-tools.example-domain5628.workers.dev";
const admin=readCredentials("admin");
if(!admin || admin.cloud_url!==CLOUD)throw Error("Admin DPAPI credentials required for cloud E2E");
const proxy=resolveCloudProxy();
const dispatcher=proxy?new ProxyAgent(proxy):undefined;
const LOCAL_TOKEN="mock-local-token-for-test-only-0123456789";
let invocations=0;
const server=http.createServer(async(req,res)=>{
  if(req.headers.authorization!=="Bearer "+LOCAL_TOKEN){res.writeHead(401);res.end();return;}
  let raw="";for await(const fragment of req)raw+=fragment;
  const msg=JSON.parse(raw);
  let body={jsonrpc:"2.0",id:msg.id};
  if(msg.method==="initialize")body.result={protocolVersion:"2025-06-18",capabilities:{tools:{}},serverInfo:{name:"nexus-mock",version:"1"}};
  else if(msg.method==="tools/list")body.result={tools:[{name:"nexus_test_echo",description:"Harmless isolated test echo tool",inputSchema:{type:"object",properties:{text:{type:"string"}},required:["text"]}}]};
  else if(msg.method==="tools/call"){invocations++;body.result={content:[{type:"text",text:"mock-echo:"+msg.params.arguments.text}],isError:false};}
  else if(msg.method==="notifications/initialized"){res.writeHead(202);res.end();return;}
  else body.error={code:-32601,message:"not found"};
  res.setHeader("Content-Type","application/json");res.end(JSON.stringify(body));
});
async function httpCloud(method,endpoint,token,deviceId,body){
 const actualEndpoint=deviceId?("/d/"+deviceId+endpoint):endpoint;
 const resp=await fetch(CLOUD+actualEndpoint,{
   method,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",...(deviceId?{"X-Nexus-Device-Id":deviceId}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000),...(dispatcher?{dispatcher}:{})
 });
 const data=await resp.json().catch(()=>({}));
 return {status:resp.status,data};
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let child,device;
try{
 const newDevice=await httpCloud("POST","/admin/devices",admin.admin_token);
 assert.equal(newDevice.status,201);
 device=newDevice.data;
 await new Promise((resolve,reject)=>{server.listen(0,"127.0.0.1",resolve);server.once("error",reject);});
 const port=server.address().port;
 child=spawn(process.execPath,[path.join(root,"local/agent.mjs")],{
   cwd:root,stdio:["ignore","pipe","pipe"],windowsHide:true,
   env:{...process.env,NEXUS_DEVICE_ID:device.device_id,NEXUS_DEVICE_TOKEN:device.device_token,
     NEXUS_LOCAL_MCP_TOKEN:LOCAL_TOKEN,NEXUS_REMOTE_ALLOWED_TOOLS:"nexus_test_echo",
     NEXUS_LOCAL_MCP_URL:"http://127.0.0.1:"+port+"/mcp",NEXUS_CLOUD_URL:CLOUD}
 });
 const request=(method,params)=>httpCloud("POST","/mcp",device.client_token,device.device_id,{jsonrpc:"2.0",id:1,method,params});
 let discovered=false;
 for(let i=0;i<12;i++){
   await wait(1500);
   const status=await request("tools/list",{});
   if(status.data?.result?.tools?.some(tool=>tool.name==="nexus_local__nexus_test_echo")){discovered=true;break;}
   if(child.exitCode!==null)throw Error("mock_agent_exited");
 }
 assert.ok(discovered,"remote mock tool not registered");
 const response=await request("tools/call",{name:"nexus_local__nexus_test_echo",arguments:{text:"works"}});
 assert.equal(response.data.result.content[0].text,"mock-echo:works");
 assert.equal(invocations,1);
 const blocked=await request("tools/call",{name:"nexus_local__localbridge_terminal_write",arguments:{input:"unsafe"}});
 assert.equal(blocked.data.result.isError,true);
 const cross=await httpCloud("POST","/mcp",device.device_token,device.device_id,{jsonrpc:"2.0",id:2,method:"ping"});
 assert.equal(cross.status,401);
 console.log("PASS: isolated Cloudflare device -> WSS Agent -> local mock MCP");
 console.log("PASS: agent token cannot be used as cloud client");
 console.log("PASS: unauthorized local tools rejected");
}catch(e){console.error("E2E FAILURE: "+String(e.message));process.exitCode=1;}
finally{
 if(child){child.kill();}
 if(device?.device_id){
   const revoked=await httpCloud("POST","/admin/devices/"+device.device_id+"/revoke",admin.admin_token).catch(()=>({status:0}));
   console.log("TEST_DEVICE_REVOKED="+(revoked.status===200));
 }
 if(server.listening)await new Promise(resolve=>server.close(resolve));
 await dispatcher?.close();
}
