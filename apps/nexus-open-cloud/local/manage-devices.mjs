#!/usr/bin/env node
// Owner-only provisioning. Not installed as an automatically running service.
// Secret values are never printed or passed in process command arguments.
import {randomBytes} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {ProxyAgent} from "undici";
import {resolveCloudProxy} from "./network-proxy.mjs";
import {readCredentials,saveCredentials,credentialPath} from "./device-credentials.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..");
const CLOUD=process.env.NEXUS_CLOUD_URL||"https://nexus-open-cloud-tools.example-domain5628.workers.dev";
if(new URL(CLOUD).protocol!=="https:")throw new Error("Cloud URL must use HTTPS");
const proxy=resolveCloudProxy();
const dispatcher=proxy?new ProxyAgent(proxy):undefined;
const secureToken=()=>randomBytes(32).toString("hex");

function uploadWorkerSecret(name,value){
  if(!["NEXUS_GATEWAY_TOKEN","NEXUS_ADMIN_TOKEN"].includes(name)|| !/^[0-9a-f]{64}$/.test(value))
    throw new Error("Invalid secret upload");
  const args=["/d","/c",`wrangler secret put ${name} --config apps/nexus-open-cloud/wrangler.jsonc`];
  const result=spawnSync("cmd.exe",args,{
    cwd:root,input:value+"\n",encoding:"utf8",windowsHide:true,timeout:90000,maxBuffer:1024*1024
  });
  if(result.error || result.status!==0 || !/Success! Uploaded secret/.test(result.stdout||""))
    throw new Error("Cloudflare secret upload failed (exit="+String(result.status)+", error="+String(result.error?.code||"none")+", successFlag="+String(/Success! Uploaded secret/.test(result.stdout||""))+")");
}
async function adminRequest(method,endpoint,body){
  const admin=readCredentials("admin");
  if(!admin)throw new Error("Admin credentials not initialized");
  if(admin.cloud_url!==CLOUD)throw new Error("Cloud endpoint mismatch in admin profile");
  const response=await fetch(CLOUD+endpoint,{
    method,headers:{Authorization:"Bearer "+admin.admin_token,"Content-Type":"application/json"},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(18000),
    ...(dispatcher?{dispatcher}:{})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error("Cloud admin request rejected: HTTP "+response.status+" "+String(data.error||""));
  return data;
}
async function main(){
  const mode=process.argv[2];
  if(mode==="admin-init"){
    if(fs.existsSync(credentialPath("admin")))throw new Error("Admin credentials already exist; refusing to overwrite");
    const adminToken=secureToken();
    uploadWorkerSecret("NEXUS_ADMIN_TOKEN",adminToken);
    saveCredentials("admin",{cloud_url:CLOUD,admin_token:adminToken});
    console.log("ADMIN_OK: Worker admin secret set; local admin credentials sealed with Windows DPAPI");
  }else if(mode==="rotate-root"){
    if(!readCredentials("admin"))throw new Error("Initialize administrator first");
    if(fs.existsSync(credentialPath("device")))throw new Error("Rotate root BEFORE device enrollment; existing device tokens would be invalidated");
    uploadWorkerSecret("NEXUS_GATEWAY_TOKEN",secureToken());
    // Retire the formerly locally cached shared root. Preserve unrelated .dev.vars entries.
    const old=path.resolve(root,"apps/nexus-open-cloud/.dev.vars");
    if(fs.existsSync(old)){
      const lines=fs.readFileSync(old,"utf8").split(/\r?\n/).filter(s=>!/^\s*NEXUS_GATEWAY_TOKEN\s*=/.test(s));
      fs.writeFileSync(old,lines.join("\n"),{encoding:"utf8",mode:0o600});
    }
    console.log("ROOT_ROTATED: root secret exists only in Cloudflare; old local root no longer valid");
  }else if(mode==="enroll"){
    if(fs.existsSync(credentialPath("device")))throw new Error("Device credentials already exist; use rotate instead");
    const issued=await adminRequest("POST","/admin/devices");
    if(!/^[0-9a-f]{32}$/.test(issued.device_id||"") ||
      !/^[0-9a-f]{64}$/.test(issued.device_token||"") ||
      !/^[0-9a-f]{64}$/.test(issued.client_token||""))throw new Error("Cloud returned invalid device credentials");
    try{saveCredentials("device",{cloud_url:CLOUD,device_id:issued.device_id,device_token:issued.device_token,client_token:issued.client_token});}
    catch(e){await adminRequest("POST","/admin/devices/"+issued.device_id+"/revoke").catch(()=>{});throw e;}
    console.log("DEVICE_ENROLLED: credentials saved to Windows DPAPI; separate cloud client and agent identities");
    console.log("DEVICE_ID="+issued.device_id);
  }else if(mode==="rotate"){
    const device=readCredentials("device");
    if(!device)throw new Error("Device not enrolled");
    const issued=await adminRequest("POST","/admin/devices/"+device.device_id+"/rotate");
    saveCredentials("device",{cloud_url:CLOUD,device_id:device.device_id,device_token:issued.device_token,client_token:issued.client_token},{replace:true});
    console.log("DEVICE_ROTATED: previous device and client credentials revoked");
  }else if(mode==="revoke"){
    const device=readCredentials("device");
    if(!device)throw new Error("Device not enrolled");
    await adminRequest("POST","/admin/devices/"+device.device_id+"/revoke");
    console.log("DEVICE_REVOKED: online agent disconnected, both tokens invalid");
  }else if(mode==="status"){
    const device=readCredentials("device");
    if(!device)throw new Error("Device not enrolled");
    const reply=await fetch(CLOUD+"/d/"+device.device_id+"/relay/status",{
      headers:{Authorization:"Bearer "+device.client_token,"X-Nexus-Device-Id":device.device_id},
      signal:AbortSignal.timeout(12000),...(dispatcher?{dispatcher}:{})
    });
    const data=await reply.json().catch(()=>({}));
    console.log("DEVICE_STATUS_HTTP="+reply.status);
    if(reply.ok)console.log("LOCAL_AGENT_ONLINE="+Boolean(data.local_agent_online));
  }else{
    throw new Error("Usage: node local/manage-devices.mjs admin-init|rotate-root|enroll|status|rotate|revoke");
  }
}
main().catch(e=>{console.error("DEVICE_MANAGEMENT_ERROR: "+String(e.message));process.exitCode=1;})
  .finally(()=>dispatcher?.close());
