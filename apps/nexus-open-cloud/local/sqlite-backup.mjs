#!/usr/bin/env node
// Standalone encrypted snapshot and restore; never modifies a running Nexus database.
// Uses SQLite serialize() to get consistent committed data (including WAL state).
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { seal, open } from "./vault.mjs";

const MAX_BYTES = 128 * 1024 * 1024;
const verify = (db) => {
  const integrity = db.prepare("PRAGMA integrity_check").all();
  if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") throw new Error("SQLite integrity check failed");
};

export function encryptedSnapshot(input, encryptedPath, passphrase) {
  if (!fs.existsSync(input)) throw new Error("Database does not exist");
  if (fs.statSync(input).size > MAX_BYTES) throw new Error("Database exceeds 128MiB safe snapshot limit");
  const db = new DatabaseSync(input, {readOnly:true});
  let plain;
  try {
    verify(db);
    plain = db.serialize();
    if (plain.length > MAX_BYTES) throw new Error("Serialized database exceeds 128MiB limit");
  } finally {db.close();}
  const ciphertext = seal(plain, passphrase);
  if (!open(ciphertext, passphrase).equals(plain)) throw new Error("Encrypted backup roundtrip verification failed");
  fs.writeFileSync(encryptedPath, ciphertext, {flag:"wx",mode:0o600});
  return {bytes: ciphertext.length, sha256: createHash("sha256").update(ciphertext).digest("hex")};
}

export function restoreSnapshot(encryptedPath, output, passphrase) {
  const size = fs.statSync(encryptedPath).size;
  if (size > MAX_BYTES * 2) throw new Error("Encrypted snapshot too large");
  const plain = open(fs.readFileSync(encryptedPath), passphrase);
  if (plain.length > MAX_BYTES || plain.subarray(0,16).toString("utf8") !== "SQLite format 3\0") throw new Error("Decrypted snapshot is not SQLite");
  fs.writeFileSync(output, plain, {flag:"wx",mode:0o600});
  try {
    const db = new DatabaseSync(output, {readOnly:true});
    try {verify(db);} finally {db.close();}
  } catch (error) {
    fs.unlinkSync(output); // Only the file created by this restore operation.
    throw error;
  }
  return {bytes:plain.length};
}

if (process.argv[1] && /sqlite-backup\.mjs$/i.test(process.argv[1])) {
  const [cmd,input,output] = process.argv.slice(2);
  try {
    if (!["snapshot","restore"].includes(cmd) || !input || !output) throw new Error("Usage: node sqlite-backup.mjs snapshot|restore INPUT OUTPUT");
    const password = process.env.NEXUS_VAULT_PASSPHRASE;
    if (!password) throw new Error("NEXUS_VAULT_PASSPHRASE is required");
    const result = cmd === "snapshot" ? encryptedSnapshot(input,output,password) : restoreSnapshot(input,output,password);
    console.log("Verified: new file created, original preserved (" + result.bytes + " bytes)");
  } catch (error) {console.error("Failed: "+String(error.message));process.exitCode=1;}
}
