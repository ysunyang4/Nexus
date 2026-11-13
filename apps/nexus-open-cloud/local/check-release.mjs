#!/usr/bin/env node
// Conservative release gate: filenames only; do not read or print secret contents.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root }).toString("utf8").split("\0").filter(Boolean);
const risky = tracked.filter((name) => {
  const s = name.replaceAll("\\", "/").toLowerCase();
  return s === "config.json" ||
    s === "nexus-token-telemetry.jsonl" ||
    s.endsWith("/.env") ||
    s.endsWith(".db") ||
    s.includes("management-token") ||
    s.includes("secret-key") ||
    s.includes("private-key");
});
if (risky.length) {
  console.error("Do not publish the full repository before reviewing these tracked files:");
  for (const name of risky) console.error(" - " + name);
  console.error("A new .gitignore entry alone does not remove tracked files or historic commits.");
  process.exitCode = 1;
} else {
  console.log("No obvious tracked secret/data filenames detected. This is not a full secrets audit.");
}
