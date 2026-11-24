import assert from "node:assert/strict";
import { isRedirectUriAllowed, OAuthStore } from "../src/oauth.js";

console.log("=== Testing OAuth Redirect URI Allowlist Regression ===");

// Set sample PUBLIC_BASE_URL for testing
process.env.PUBLIC_BASE_URL = "http://127.0.0.1:8787";

// 1. MUST PASS: ChatGPT / OpenAI Official Callbacks
const shouldPassChatGPT = [
  "https://chatgpt.com/api/mcp/oauth_callback",
  "https://chatgpt.com/callback",
  "https://chatgpt.com/oauth/callback",
  "https://openai.com/oauth/callback",
  "https://auth.openai.com/callback",
];

for (const uri of shouldPassChatGPT) {
  assert.equal(
    isRedirectUriAllowed(uri),
    true,
    `Expected ChatGPT/OpenAI URI to pass: ${uri}`
  );
  console.log(`[PASS] ChatGPT/OpenAI Allowed: ${uri}`);
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

// 3. MUST PASS: Cloudflare Quick Tunnels
const shouldPassCloudflare = [
  "https://nexus-test.trycloudflare.com/oauth/callback",
  "https://random-subdomain.trycloudflare.com/callback",
];

for (const uri of shouldPassCloudflare) {
  assert.equal(
    isRedirectUriAllowed(uri),
    true,
    `Expected Cloudflare quick tunnel URI to pass: ${uri}`
  );
  console.log(`[PASS] Cloudflare Tunnel Allowed: ${uri}`);
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
  "https://claude.ai/callback",
  "https://spark.gemini.google.com/callback",
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
  "https://chatgpt.com.attacker.com/callback",
  "https://notchatgpt.com/callback",
  "https://fake-openai.com/callback",
  "https://openai.com.malicious.org/callback",
  "http://127.0.0.1:8787.attacker.com/callback",
  "http://chatgpt.com/callback", // Insecure HTTP for external domain MUST fail
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

// 8. TEST OAuthStore.registerClient with ChatGPT redirect URI
console.log("\nTesting OAuthStore.registerClient dynamic registration...");
const store = new OAuthStore();

const chatgptClient = store.registerClient({
  client_name: "ChatGPT",
  redirect_uris: ["https://chatgpt.com/api/mcp/oauth_callback"],
  grant_types: ["authorization_code"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
});

assert.ok(chatgptClient.client_id, "Expected client_id to be generated for ChatGPT");
assert.equal(chatgptClient.client_name, "ChatGPT");
assert.deepEqual(chatgptClient.redirect_uris, ["https://chatgpt.com/api/mcp/oauth_callback"]);
console.log(`[PASS] OAuthStore successfully registered ChatGPT DCR client: ${chatgptClient.client_id}`);

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

// 10. TEST OAuthStore.isClientRedirectUriAllowed dynamically admits user-bound ChatGPT callback
const chatgptUserBoundUri = "https://chatgpt.com/api/mcp/oauth_callback?session=123";
const dummyClient = store.getClient("chatgpt")!;
assert.ok(dummyClient, "Expected default chatgpt client");
assert.equal(
  store.isClientRedirectUriAllowed(dummyClient, chatgptUserBoundUri),
  true,
  "Expected user-bound ChatGPT callback to be dynamically accepted"
);
assert.ok(
  dummyClient.redirect_uris.includes(chatgptUserBoundUri),
  "Expected user-bound ChatGPT callback to be appended to client redirect_uris"
);
console.log(`[PASS] OAuthStore dynamically authorized user-bound ChatGPT callback for client: ${dummyClient.client_id}`);

// 11. TEST OAuthStore.isClientRedirectUriAllowed rejects malicious URI
assert.equal(
  store.isClientRedirectUriAllowed(dummyClient, "https://evil.attacker.com/oauth/callback"),
  false,
  "Expected malicious URI to be rejected"
);
console.log("[PASS] OAuthStore isClientRedirectUriAllowed rejected malicious URI");

console.log("\n=== ALL REGRESSION TESTS PASSED (100%) ===");
