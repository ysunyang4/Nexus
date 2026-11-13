import test from "node:test";
import assert from "node:assert/strict";
import { seal, open } from "../local/vault.mjs";

const password = "a-very-long-test-passphrase-for-vault";
test("AES-256-GCM encrypt/decrypt roundtrip", () => {
  const input = Buffer.from("Sensitive Nexus file, tests only", "utf8");
  const a = seal(input, password);
  const b = seal(input, password);
  assert.notDeepEqual(a, b);
  assert.deepEqual(open(a, password), input);
});
test("wrong password and tampering fail authentication", () => {
  const a = seal(Buffer.from("private"), password);
  assert.throws(() => open(a, "not-the-right-password-at-all"));
  const obj = JSON.parse(a.toString().split("\n").slice(1).join("\n"));
  obj.tag = Buffer.alloc(16, 9).toString("base64");
  const bad = Buffer.from("NEXUS_OPEN_VAULT_V1\n" + JSON.stringify(obj));
  assert.throws(() => open(bad, password));
});
