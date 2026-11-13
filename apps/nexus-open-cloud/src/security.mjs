const encoder = new TextEncoder();

// Public API authentication is device-scoped; no root-derived global client token is accepted.

export async function verifyBearer(request, expected) {
  if (typeof expected !== "string" || expected.length < 32) return false;
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(header);
  const provided = match ? match[1] : "";
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  if (typeof crypto.subtle.timingSafeEqual === "function") {
    return crypto.subtle.timingSafeEqual(aa, bb) && provided.length > 0;
  }
  let difference = 0;
  for (let i = 0; i < aa.length; i++) difference |= aa[i] ^ bb[i];
  return difference === 0 && provided.length > 0;
}

export function validateDomain(input) {
  if (typeof input !== "string") throw new Error("domain must be a string");
  const value = input.toLowerCase().replace(/\.$/, "");
  if (value.length < 4 || value.length > 253 || !value.includes(".")) throw new Error("invalid domain");
  if (value.endsWith(".local") || value.endsWith(".localhost") || value.endsWith(".internal") || value === "localhost") throw new Error("local domains are not permitted");
  const labels = value.split(".");
  if (labels.some((label) => label.length === 0 || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) throw new Error("invalid domain labels");
  if (!/^[a-z]/.test(labels.at(-1))) throw new Error("public DNS name required");
  return value;
}

export function validatePublicHttpsUrl(value, allowedHosts = "") {
  if (typeof value !== "string" || value.length > 2048) throw new Error("invalid URL");
  let url;
  try { url = new URL(value); } catch { throw new Error("invalid URL"); }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("HTTPS without credentials or custom port required");
  const host = validateDomain(url.hostname);
  const allowed = String(allowedHosts).toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);
  if (!allowed.includes(host)) throw new Error("host not in NEXUS_ALLOWED_HOSTS");
  return url;
}

export function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
