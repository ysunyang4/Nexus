import {spawnSync} from "node:child_process";

export function dpapiKey(operation: "Protect"|"Unprotect", data: Buffer): Buffer {
 if (process.platform!=="win32") throw new Error("Nexus secure Windows DPAPI storage requires Windows");
 const script = [
 "$ErrorActionPreference='Stop'",
 "Add-Type -AssemblyName System.Security",
 "$b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())",
 "$o=[System.Security.Cryptography.ProtectedData]::"+operation+"($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)",
 "[Console]::Out.Write([Convert]::ToBase64String($o))"
 ].join("; ");
 const proc=spawnSync("powershell.exe",["-NoProfile","-NonInteractive","-Command",script],{
  input:data.toString("base64"), encoding:"utf8", windowsHide:true, timeout:12000,maxBuffer:1048576
 });
 if(proc.error||proc.status!==0||!proc.stdout?.trim())throw new Error("DPAPI key "+operation+" failed");
 return Buffer.from(proc.stdout.trim(),"base64");
}
