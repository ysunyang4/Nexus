import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Windows CurrentUser DPAPI: secrets are passed on stdin, never command-line arguments.
function transform(operation,bytes){
  if(process.platform!=="win32")throw new Error("Secure device credentials require Windows CurrentUser DPAPI");
  const script=[
    "$ErrorActionPreference='Stop'",
    "Add-Type -AssemblyName System.Security",
    "$b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())",
    "$o=[System.Security.Cryptography.ProtectedData]::"+operation+"($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)",
    "[Console]::Out.Write([Convert]::ToBase64String($o))"
  ].join("; ");
  const processResult=spawnSync("powershell.exe",["-NoProfile","-NonInteractive","-Command",script],{
    input:bytes.toString("base64"),encoding:"utf8",windowsHide:true,timeout:12000,maxBuffer:1024*1024
  });
  if(processResult.error || processResult.status!==0 || !processResult.stdout?.trim())
    throw new Error("Windows DPAPI "+operation+" failed");
  return Buffer.from(processResult.stdout.trim(),"base64");
}
export function credentialsDir(){
  return path.join(process.env.LOCALAPPDATA||os.homedir(),"NexusOpenSource","v1.3.1","cloud");
}
export function credentialPath(kind){
  if(!["admin","device"].includes(kind))throw new Error("Invalid credential kind");
  return path.join(credentialsDir(),kind+".json.dpapi");
}
export function readCredentials(kind){
  const file=credentialPath(kind);
  if(!fs.existsSync(file))return null;
  try{
    const data=JSON.parse(transform("Unprotect",fs.readFileSync(file)).toString("utf8"));
    if(data.version!==2 || typeof data.cloud_url!=="string")throw new Error("Invalid credential format");
    if(kind==="admin" && !/^[0-9a-f]{64}$/.test(data.admin_token||""))throw new Error("Invalid admin secret");
    if(kind==="device" && (!/^[0-9a-f]{32}$/.test(data.device_id||"") || !/^[0-9a-f]{64}$/.test(data.device_token||"") ||
      !/^[0-9a-f]{64}$/.test(data.client_token||"")))throw new Error("Invalid device credentials");
    return data;
  }catch{throw new Error("Encrypted "+kind+" credentials are invalid or belong to another Windows user");}
}
export function saveCredentials(kind,data,{replace=false}={}){
  const location=credentialPath(kind);
  fs.mkdirSync(path.dirname(location),{recursive:true,mode:0o700});
  const bytes=transform("Protect",Buffer.from(JSON.stringify({version:2,...data}),"utf8"));
  if(!replace){
    fs.writeFileSync(location,bytes,{flag:"wx",mode:0o600});
    return;
  }
  if(!fs.existsSync(location))throw new Error("Refusing rotation without prior device file");
  const temp=location+"."+process.pid+".tmp";
  try{
    fs.writeFileSync(temp,bytes,{flag:"wx",mode:0o600});
    fs.renameSync(temp,location);
  }finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
