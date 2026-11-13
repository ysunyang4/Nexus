import { createHmac } from "node:crypto";

// The deployment secret is a master secret; it must never be sent to clients.
// Separate API and Agent credentials by role to prevent API token reuse as an Agent token.
export function deriveRoleToken(master, role) {
  if (typeof master !== "string" || master.length < 32) throw new Error("Nexus cloud master secret must be at least 32 characters");
  if (!["api", "agent"].includes(role)) throw new Error("Unsupported credential role");
  return createHmac("sha256", master).update("nexus-open-cloud/role-token/v1/" + role).digest("hex");
}
