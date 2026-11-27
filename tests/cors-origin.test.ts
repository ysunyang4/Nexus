import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../apps/server/src/app.js";
import { AppConfigSchema } from "@localbridge/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("CORS origin validation", () => {
  let app: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-cors-test-"));
    const dbFilePath = path.join(tmpDir, "cors-test.db");

    const config = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: 18080, dbPath: dbFilePath },
      logging: { level: "silent", pretty: false },
    });

    const result = await buildApp({
      config,
      migrationsDir,
      enableLogging: false,
    });
    app = result.app;
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("allows http://localhost:3000", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://localhost:3000" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
  });

  it.each([
    "http://localhost.evil.com",
    "http://127.0.0.1.evil.com",
    "https://evil-tauri.localhost.com",
    "not-a-valid-url",
  ])("rejects spoofed origin %s", async (origin) => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin },
    });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
