// Cloud-only device authentication primitives. No root key or global client secret is bundled locally.
const enc = new TextEncoder();
export const validDeviceId = (s) => typeof s === "string" && /^[a-f0-9]{32}$/.test(s);
export function createCredential() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
export function createDeviceId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function hashDeviceCredential(root, deviceId, role, token) {
  if (typeof root !== "string" || root.length < 32) throw new Error("cloud root not configured");
  if (!validDeviceId(deviceId) || !["agent", "client"].includes(role)) throw new Error("invalid device identity");
  const key = await crypto.subtle.importKey("raw", enc.encode(root), {name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const data = enc.encode("nexus-cloud-v2:" + deviceId + ":" + role + ":" + token);
  const digest = await crypto.subtle.sign("HMAC",key,data);
  return Array.from(new Uint8Array(digest),(b)=>b.toString(16).padStart(2,"0")).join("");
}
export function constantTimeEqualHex(a,b) {
  if (typeof a !== "string" || typeof b !== "string" || !/^[0-9a-f]{64}$/.test(a) || !/^[0-9a-f]{64}$/.test(b)) return false;
  let diff=0;
  for(let i=0;i<64;i++) diff |= a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
export function bearerToken(request) {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer ([A-Za-z0-9._~-]{32,256})$/.exec(header);
  return match?.[1] || "";
}
