#!/usr/bin/env node
// Windows DPAPI OAuth encrypted persistence smoke test.
// Runs only against an isolated temporary directory, never real Nexus user data.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {OAuthStore} from "../../bridge/dist/oauth.js";

const original={data:process.env.LOCALAPPDATA,secure:process.env.NEXUS_OPEN_SECURE_OAUTH};
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"nexus-open-oauth-e2e-"));
try{
 process.env.LOCALAPPDATA=temp;
 process.env.NEXUS_OPEN_SECURE_OAUTH="1";
 const stateFile=path.join(temp,"oauth-state.enc");
 const store=new OAuthStore(stateFile);
 store.saveToDisk();
 const encrypted=fs.readFileSync(stateFile,"utf8");
 assert.ok(encrypted.startsWith("NEXUS_OPEN_OAUTH_GCM_V1:"));
 assert.ok(!encrypted.includes('"accessTokens":'));
 const restored=new OAuthStore(stateFile);
 restored.saveToDisk();
 assert.ok(fs.readFileSync(stateFile,"utf8").startsWith("NEXUS_OPEN_OAUTH_GCM_V1:"));
 fs.writeFileSync(stateFile,encrypted.slice(0,-2)+"00");
 assert.throws(()=>new OAuthStore(stateFile));
 console.log("PASS: Windows DPAPI key + AES-GCM OAuth state + corruption fail-closed");
}catch(error){console.error("FAIL:",String(error.message));process.exitCode=1;}
finally{
 if(original.data===undefined)delete process.env.LOCALAPPDATA;else process.env.LOCALAPPDATA=original.data;
 if(original.secure===undefined)delete process.env.NEXUS_OPEN_SECURE_OAUTH;else process.env.NEXUS_OPEN_SECURE_OAUTH=original.secure;
 fs.rmSync(temp,{recursive:true,force:true});
}
