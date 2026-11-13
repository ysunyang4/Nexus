#!/usr/bin/env node
// Optional, open-source AES-256-GCM file encryption for local sensitive exports.
// Deliberately does NOT encrypt or mutate Nexus's live SQLite databases.
import fs from "node:fs";
import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from "node:crypto";

const PREFIX = "NEXUS_OPEN_VAULT_V1\n";
const CONTEXT = Buffer.from("Nexus open-source vault v1", "utf8");

function derive(password, salt) {
  if (typeof password !== "string" || password.length < 16) throw new Error("NEXUS_VAULT_PASSPHRASE must contain at least 16 characters");
  return scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

export function seal(plain, password) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derive(password, salt), iv);
  cipher.setAAD(CONTEXT);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plain)), cipher.final()]);
  const tag = cipher.getAuthTag();
  const envelope = {
    version: 1,
    algorithm: "AES-256-GCM",
    kdf: "scrypt-N32768-r8-p1",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: encrypted.toString("base64")
  };
  return Buffer.from(PREFIX + JSON.stringify(envelope), "utf8");
}

export function open(encrypted, password) {
  const raw = Buffer.from(encrypted).toString("utf8");
  if (!raw.startsWith(PREFIX)) throw new Error("invalid Nexus vault format");
  const msg = JSON.parse(raw.slice(PREFIX.length));
  if (msg.version !== 1 || msg.algorithm !== "AES-256-GCM" || msg.kdf !== "scrypt-N32768-r8-p1") throw new Error("unsupported vault format");
  const salt = Buffer.from(msg.salt, "base64");
  const iv = Buffer.from(msg.iv, "base64");
  const tag = Buffer.from(msg.tag, "base64");
  if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16) throw new Error("invalid vault envelope");
  const decipher = createDecipheriv("aes-256-gcm", derive(password, salt), iv);
  decipher.setAAD(CONTEXT);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(msg.ciphertext, "base64")), decipher.final()]);
}

if (process.argv[1] && import.meta.url === new URL("file:///" + process.argv[1].replaceAll("\\", "/")).href) {
  const [verb, input, output] = process.argv.slice(2);
  if (!["encrypt", "decrypt"].includes(verb) || !input || !output) {
    console.error("Usage: node local/vault.mjs encrypt|decrypt INPUT OUTPUT");
    process.exitCode = 2;
  } else {
    try {
      const password = process.env.NEXUS_VAULT_PASSPHRASE;
      if (!password) throw new Error("NEXUS_VAULT_PASSPHRASE is required; never commit it");
      const source = fs.readFileSync(input);
      const outputData = verb === "encrypt" ? seal(source, password) : open(source, password);
      fs.writeFileSync(output, outputData, { flag: "wx", mode: 0o600 });
      console.log("Success: file created (source retained)");
    } catch (err) {
      console.error("Failed: " + String(err?.message || err));
      process.exitCode = 1;
    }
  }
}
