import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {readCredentials,saveCredentials,credentialPath} from "../local/device-credentials.mjs";

test("Windows device tokens are DPAPI-protected, tampering fails closed",{
  skip:process.platform!=="win32"
},()=>{
  const old=process.env.LOCALAPPDATA;
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"nexus-dpapi-test-"));
  try{
    process.env.LOCALAPPDATA=dir;
    const device={
      cloud_url:"https://nexus.example",device_id:"a".repeat(32),
      device_token:"b".repeat(64),client_token:"c".repeat(64)
    };
    assert.equal(readCredentials("device"),null);
    saveCredentials("device",device);
    const raw=fs.readFileSync(credentialPath("device"),"utf8");
    assert.equal(raw.includes(device.device_token),false);
    assert.deepEqual({...readCredentials("device"),version:undefined},{...device,version:undefined});
    assert.throws(()=>saveCredentials("device",device),/EEXIST/);
    const rotated={...device,device_token:"d".repeat(64)};
    saveCredentials("device",rotated,{replace:true});
    assert.equal(readCredentials("device").device_token,rotated.device_token);
    fs.writeFileSync(credentialPath("device"),Buffer.from("corrupted"));
    assert.throws(()=>readCredentials("device"),/Encrypted device credentials/);
  }finally{
    if(old===undefined)delete process.env.LOCALAPPDATA;else process.env.LOCALAPPDATA=old;
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
