import assert from "node:assert/strict";
import { isRedirectUriAllowed, OAuthStore } from "../src/oauth.js";

console.log("=== Testing OAuth Redirect URI Allowlist Regression ===");

// Set sample PUBLIC_BASE_URL for testing
process.env.PUBLIC_BASE_URL = "http://127.0.0.1:8787";

// 1. MUST PASS: Claude / Anthropic Official Callbacks
const shouldPassClaude = [
  "https://claude.ai/api/mcp/oauth_callback",
  "https://claude.ai/oauth/callback",
  "https://claude.ai/callback",
  "https://desktop.claude.ai/oauth/callback",
  "https://preview.claude.ai/oauth/callback",
  "https://anthropic.com/oauth/callback",
  "https://auth.anthropic.com/callback",
];

for (const uri of shouldPassClaude) {
  assert.equal(
    isRedirectUriAllowed(uri),
    true,
    `Expected Claude/Anthropic URI to pass: ${uri}`
  );
  console.log(`[PASS] Claude/Anthropic Allowed: ${uri}`);
}

// 2. MUST PASS: Localhost / 127.0.0.1 Loopback
const shouldPassLoopback = [
  "http://localhost/callback",
  "http://localhost:3000/oauth/callback",
  "http://localhost:8080/cb",
  "https://localhost/callback",
  "http://127.0.0.1/callback",
  "http://127.0.0.1:8787/oauth/callback",
  "https://127.0.0.1:8787/oauth/callback",
];

for (const uri of shouldPassLoopback) {
  assert.equal(
    isRedirectUriAllowed(uri),
    true,
    `Expected loopback URI to pass: ${uri}`
  );
  console.log(`[PASS] Loopback Allowed: ${uri}`);
}

// 3. MUST PASS: Google / Gemini Official Callbacks
const shouldPassGoogle = [
  "https://spark.gemini.google.com/oauth/callback",
  "https://aistudio.google.com/oauth/callback",
  "https://accounts.google.com/oauth/callback",
  "https://oauth-redirect.googleusercontent.com/r/nexus",
  "https://subdomain.google.com/callback",
  "https://custom.googleusercontent.com/r/nexus",
];

for (const uri of shouldPassGoogle) {
  assert.equal(
    isRedirectUriAllowed(uri),
    true,
    `Expected Google/Gemini URI to pass: ${uri}`
  );
  console.log(`[PASS] Google/Gemini Allowed: ${uri}`);
}

// 4. MUST PASS: Nexus Custom Domain
const shouldPassNexus = [
  "http://127.0.0.1:8787/oauth/callback",
  "http://127.0.0.1:8787/callback",
];

for (const uri of shouldPassNexus) {
  assert.equal(
    isRedirectUriAllowed(uri),
    true,
    `Expected configured domain URI to pass: ${uri}`
  );
  console.log(`[PASS] Nexus Custom Domain Allowed: ${uri}`);
}

// 5. MUST PASS: Standard Out-of-Band (oob)
assert.equal(
  isRedirectUriAllowed("urn:ietf:wg:oauth:2.0:oob"),
  true,
  "Expected standard oob to pass"
);
console.log(`[PASS] OAuth Out-of-band Allowed: urn:ietf:wg:oauth:2.0:oob`);

// 6. MUST FAIL: Arbitrary Third-Party Domains
const shouldFailThirdParty = [
  "https://evil.com/oauth/callback",
  "https://attacker.net/steal_token",
  "https://example.com/callback",
  "https://openai.com/callback",
  "https://chatgpt.com/callback",
  "https://github.com/callback",
  "https://microsoft.com/callback",
  "https://baidu.com/callback",
];

for (const uri of shouldFailThirdParty) {
  assert.equal(
    isRedirectUriAllowed(uri),
    false,
    `Expected arbitrary third-party URI to be REJECTED: ${uri}`
  );
  console.log(`[PASS: Properly Rejected] Arbitrary Third-Party: ${uri}`);
}

// 7. MUST FAIL: Malicious / Spoofed / Subdomain Tricks
const shouldFailSpoofing = [
  "https://claude.ai.attacker.com/callback",
  "https://notclaude.ai/callback",
  "https://fake-google.com/callback",
  "https://google.com.malicious.org/callback",
  "http://127.0.0.1:8787.attacker.com/callback",
  "http://claude.ai/callback", // Insecure HTTP for external domain MUST fail
  "http://spark.gemini.google.com/callback", // Insecure HTTP for external domain MUST fail
  "javascript:alert(1)",
  "data:text/html,<script>",
  "https://*",
  "*",
  "",
];

for (const uri of shouldFailSpoofing) {
  assert.equal(
    isRedirectUriAllowed(uri),
    false,
    `Expected spoofed/invalid URI to be REJECTED: ${uri}`
  );
  console.log(`[PASS: Properly Rejected] Spoofed/Invalid: ${uri}`);
}

// 8. TEST OAuthStore.registerClient with Claude redirect URI
console.log("\nTesting OAuthStore.registerClient dynamic registration...");
const store = new OAuthStore();

const claudeClient = store.registerClient({
  client_name: "Claude",
  redirect_uris: ["https://claude.ai/api/mcp/oauth_callback"],
  grant_types: ["authorization_code"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
});

assert.ok(claudeClient.client_id, "Expected client_id to be generated for Claude");
assert.equal(claudeClient.client_name, "Claude");
assert.deepEqual(claudeClient.redirect_uris, ["https://claude.ai/api/mcp/oauth_callback"]);
console.log(`[PASS] OAuthStore successfully registered Claude DCR client: ${claudeClient.client_id}`);

// 9. TEST OAuthStore.registerClient with Evil URI throws
assert.throws(
  () => {
    store.registerClient({
      client_name: "Evil App",
      redirect_uris: ["https://evil.com/callback"],
    });
  },
  /Forbidden redirect_uri/,
  "Expected registerClient to throw Forbidden redirect_uri on malicious URI"
);
console.log("[PASS] OAuthStore rejected evil.com client registration with Forbidden redirect_uri exception");

// 10. TEST OAuthStore.isClientRedirectUriAllowed dynamically admits user-bound Google callback
const googleUserBoundUri =
  "https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-114297038989233823636-mcp_example_com";
const dummyClient = store.getClient("gemini-spark")!;
assert.ok(dummyClient, "Expected default gemini-spark client");
assert.equal(
  store.isClientRedirectUriAllowed(dummyClient, googleUserBoundUri),
  true,
  "Expected user-bound Google callback to be dynamically accepted"
);
assert.ok(
  dummyClient.redirect_uris.includes(googleUserBoundUri),
  "Expected user-bound Google callback to be appended to client redirect_uris"
);
console.log(`[PASS] OAuthStore dynamically authorized user-bound Google callback for client: ${dummyClient.client_id}`);

// 11. TEST OAuthStore.isClientRedirectUriAllowed rejects malicious URI
assert.equal(
  store.isClientRedirectUriAllowed(dummyClient, "https://evil.attacker.com/oauth/callback"),
  false,
  "Expected malicious URI to be rejected"
);
console.log("[PASS] OAuthStore isClientRedirectUriAllowed rejected malicious URI");

console.log("\n=== ALL REGRESSION TESTS PASSED (100%) ===");
