import {describe,it,expect} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {SecureSecretStorage} from "./connection-service.js";

describe("Nexus Open Source secure secret storage",()=>{
 it("uses DPAPI sealed per-edition key and AES-GCM instead of predictable fallback",()=>{
  if (process.platform!=="win32") return;
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"nexus-open-db-key-"));
  const oldLocal=process.env.LOCALAPPDATA,oldMode=process.env.NEXUS_OPEN_SECURE_SECRETS;
  try{
   process.env.LOCALAPPDATA=temp;
   process.env.NEXUS_OPEN_SECURE_SECRETS="1";
   const first=new SecureSecretStorage();
   const encrypted=first.encrypt("test-only-secret");
   expect(encrypted).not.toContain("test-only-secret");
   expect(first.decrypt(encrypted)).toBe("test-only-secret");
   const keyFile=path.join(temp,"NexusOpenSource","v1.3.1","db-secrets","master.key.dpapi");
   expect(fs.existsSync(keyFile)).toBe(true);
   expect(fs.readFileSync(keyFile).length).toBeGreaterThan(32);
   const second=new SecureSecretStorage();
   expect(second.decrypt(encrypted)).toBe("test-only-secret");
   expect(fs.existsSync(path.join(temp,"LocalBridge","secrets","master.key"))).toBe(false);
  } finally {
   if(oldLocal===undefined)delete process.env.LOCALAPPDATA;else process.env.LOCALAPPDATA=oldLocal;
   if(oldMode===undefined)delete process.env.NEXUS_OPEN_SECURE_SECRETS;else process.env.NEXUS_OPEN_SECURE_SECRETS=oldMode;
   fs.rmSync(temp,{recursive:true,force:true});
  }
 });
});
