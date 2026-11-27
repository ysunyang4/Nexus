import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import type { FastifyInstance } from "fastify";
import Fastify from "../apps/server/node_modules/fastify/fastify.js";

const spawnMock = vi.fn(() => ({ unref: vi.fn() }));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: spawnMock,
  };
});

describe("POST /intelligence/storage/open security", () => {
  let app: FastifyInstance;
  let tmpDir: string;
  let storageRoot: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-intel-open-"));
    storageRoot = path.join(tmpDir, "storage");
    fs.mkdirSync(path.join(storageRoot, "sub"), { recursive: true });

    const { intelligenceRoutes } = await import("../apps/server/src/routes/intelligence.js");

    app = Fastify({ logger: false });
    await app.register(intelligenceRoutes, {
      mcpContext: {
        intelligenceRuntime: {
          store: {
            getStorageEngine: () => ({
              getStats: () => ({ rootDir: storageRoot }),
            }),
          },
        },
      } as any,
      tokenService: {} as any,
      requireManagementAuth: false,
    });
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    spawnMock.mockClear();
  });

  it("allows a valid folderPath inside storage rootDir and returns 200", async () => {
    const validSub = path.join(storageRoot, "sub");
    const response = await app.inject({
      method: "POST",
      url: "/intelligence/storage/open",
      headers: { "content-type": "application/json" },
      payload: { folderPath: validSub },
    });

    expect(response.statusCode).toBe(200);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [, args, opts] = spawnMock.mock.calls[0];
    expect(args).toEqual([path.resolve(validSub)]);
    expect(opts).toMatchObject({ shell: false, detached: true, stdio: "ignore" });
  });

  it("rejects command injection characters (& calc &) with 400 and does not call spawn", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/intelligence/storage/open",
      headers: { "content-type": "application/json" },
      payload: { folderPath: `${storageRoot} & calc & ` },
    });

    expect(response.statusCode).toBe(400);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("rejects folderPath outside storage rootDir with 400 and does not call spawn", async () => {
    const outsideDir = path.resolve(tmpDir, "..");
    const response = await app.inject({
      method: "POST",
      url: "/intelligence/storage/open",
      headers: { "content-type": "application/json" },
      payload: { folderPath: outsideDir },
    });

    expect(response.statusCode).toBe(400);
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
