import http from "node:http";

async function postJson(urlStr: string, body: any): Promise<any> {
  const url = new URL(urlStr);
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let buf = "";
        res.on("data", (chunk) => (buf += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(buf) });
          } catch {
            resolve({ status: res.statusCode, raw: buf });
          }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function getJson(urlStr: string): Promise<any> {
  const url = new URL(urlStr);
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: "GET" }, (res) => {
      let buf = "";
      res.on("data", (chunk) => (buf += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(buf) });
        } catch {
          resolve({ status: res.statusCode, raw: buf });
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  console.log("=== DYNAMIC MCP PROVIDER RUNTIME ENROLLMENT TEST ===");

  // 1. Check current providers
  const listBefore = await getJson("http://127.0.0.1:8787/api/mcp/providers");
  console.log(`Initial providers count: ${listBefore.data?.count || 0}`);

  // 2. Register a new external provider config at runtime (e.g. secondary external provider)
  const newProviderConfig = {
    providerId: "external-blender-mcp",
    displayName: "Blender 3D MCP Service",
    endpoint: "http://127.0.0.1:20888/mcp",
    transport: "streamableHttp",
    protocolVersion: "2024-11-05",
    circuitBreaker: {
      failureThreshold: 3,
      resetTimeoutMs: 15000,
    },
    enabled: true,
  };

  console.log(`Registering new provider '${newProviderConfig.providerId}' dynamically at runtime...`);
  const regRes = await postJson("http://127.0.0.1:8787/api/mcp/providers", newProviderConfig);
  console.log(`Registration response:`, JSON.stringify(regRes.data));

  // 3. Verify provider list updated without restart
  const listAfter = await getJson("http://127.0.0.1:8787/api/mcp/providers");
  console.log(`Updated providers count: ${listAfter.data?.count || 0}`);
  const hasBlender = listAfter.data?.providers?.some((p: any) => p.providerId === "external-blender-mcp");
  console.log(`Dynamic Enrollment Verified: ${hasBlender ? "PASS" : "FAIL"}`);

  // 4. Verify catalog status
  const catalogSnap = await getJson("http://127.0.0.1:8787/api/mcp/catalog");
  console.log(`Dynamic Catalog Tool Count: ${catalogSnap.data?.catalog?.toolCount}`);
  console.log(`Dynamic Catalog Providers:`, catalogSnap.data?.catalog?.providers?.map((p: any) => p.providerId));

  // 5. Clean up enrolled test provider
  console.log(`Cleaning up test provider '${newProviderConfig.providerId}'...`);
  const delReq = new Promise((resolve) => {
    const req = http.request(
      new URL(`http://127.0.0.1:8787/api/mcp/providers/${newProviderConfig.providerId}`),
      { method: "DELETE" },
      (res) => resolve(res.statusCode === 200)
    );
    req.end();
  });
  const delOk = await delReq;
  console.log(`Cleanup completed: ${delOk ? "PASS" : "FAIL"}`);
}

main().catch(console.error);
