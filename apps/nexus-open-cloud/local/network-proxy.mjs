import {execFileSync} from "node:child_process";

// Explicit env proxy takes priority; on Windows reuse the logged-in user's proxy settings.
// This avoids touching global proxy settings, and never writes credentials.
export function resolveCloudProxy() {
  const configured = process.env.NEXUS_CLOUD_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy;
  if (configured) return normalize(configured);
  if (process.platform !== "win32") return "";
  try {
    const key="HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
    const read=(field)=>execFileSync("reg.exe",["query",key,"/v",field],{encoding:"utf8",timeout:3000,windowsHide:true});
    if(!/ProxyEnable\s+REG_DWORD\s+0x1/i.test(read("ProxyEnable"))) return "";
    const text=read("ProxyServer");
    const raw=text.match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/i)?.[1]?.trim();
    if(!raw)return "";
    const https=raw.includes("=") ? raw.split(";").map(x=>x.trim()).find(x=>x.startsWith("https="))?.slice(6) : raw;
    return normalize(https || "");
  } catch {return "";}
}
function normalize(input) {
  if(!input)return "";
  const value=/^[a-z]+:\/\//i.test(input) ? input : "http://"+input;
  const url=new URL(value);
  if(!["http:","https:"].includes(url.protocol)) throw new Error("Only HTTP(S) forward proxies are supported");
  return url.toString();
}
