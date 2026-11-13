import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {DatabaseSync} from "node:sqlite";
import {encryptedSnapshot, restoreSnapshot} from "../local/sqlite-backup.mjs";

test("SQLite encrypted snapshot restores integrity without modifying original",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"nexus-open-sqlite-test-"));
 try{
  const original=path.join(dir,"db.sqlite");
  const encrypted=path.join(dir,"snapshot.enc");
  const restored=path.join(dir,"restored.sqlite");
  const db=new DatabaseSync(original);
  db.exec("CREATE TABLE demo(id INTEGER PRIMARY KEY, secret TEXT); INSERT INTO demo(secret) VALUES ('test-confidential-record')");
  db.close();
  const originalHash=fs.readFileSync(original);
  encryptedSnapshot(original,encrypted,"test-passphrase-that-is-at-least-16-chars");
  assert.notEqual(fs.readFileSync(encrypted).subarray(0,16).toString("utf8"),"SQLite format 3\0");
  assert.deepEqual(fs.readFileSync(original),originalHash);
  restoreSnapshot(encrypted,restored,"test-passphrase-that-is-at-least-16-chars");
  const copy=new DatabaseSync(restored,{readOnly:true});
  assert.equal(copy.prepare("SELECT secret FROM demo").get().secret,"test-confidential-record");
  copy.close();
  assert.throws(()=>restoreSnapshot(encrypted,path.join(dir,"wrong.sqlite"),"wrong-test-passphrase-000000"));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
