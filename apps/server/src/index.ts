import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "@localbridge/shared";
import { buildApp } from "./app.js";
import { startMcpGateway, type McpGatewayInstance } from "./mcp-gateway/index.js";

async function main() {
  const config = loadConfig();
  let managementSecret = process.env.LOCALBRIDGE_MANAGEMENT_TOKEN;
  if (!managementSecret) {
    const keyPath = path.join(
      process.env.LOCALAPPDATA || process.env.APPDATA || "",
      "LocalBridge/data/management-token.key"
    );
    if (fs.existsSync(keyPath)) {
      try {
        managementSecret = fs.readFileSync(keyPath, "utf-8").trim();
      } catch {}
    }
  }
  const requireManagementAuth =
    Boolean(managementSecret) ||
    process.env.LOCALBRIDGE_REQUIRE_MGMT_AUTH === "true";

  const { app, db, tokenService, projectService } = await buildApp({
    config,
    managementSecret,
    requireManagementAuth,
  });

  if (managementSecret) {
    app.log.info("Management token authentication is active for local control center");
  }

  // Handle bootstrap runner token if passed by Desktop Supervisor
  let bootstrapRunnerToken = process.env.LOCALBRIDGE_BOOTSTRAP_RUNNER_TOKEN;
  if (!bootstrapRunnerToken) {
    const runnerKeyPath = path.join(
      process.env.LOCALAPPDATA || process.env.APPDATA || "",
      "LocalBridge/data/runner-token.key"
    );
    if (fs.existsSync(runnerKeyPath)) {
      try {
        bootstrapRunnerToken = fs.readFileSync(runnerKeyPath, "utf-8").trim();
      } catch {}
    }
  }
  if (bootstrapRunnerToken && bootstrapRunnerToken.startsWith("lbr_")) {
    const tokenId = tokenService.ensureRunnerToken(bootstrapRunnerToken, "Desktop Embedded Runner");
    app.log.info({ tokenId }, "Ensured Desktop Embedded Runner token in database");
  }

  let gatewayInstance: McpGatewayInstance | null = null;

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Received shutdown signal, closing server gracefully...");
    try {
      if (gatewayInstance) {
        await gatewayInstance.stop();
      }
      await app.close();
      app.log.info("Server, MCP gateway and database closed successfully.");
      process.exit(0);
    } catch (err) {
      app.log.error(err, "Error during graceful shutdown");
      process.exit(1);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  try {
    const address = await app.listen({
      host: config.server.host,
      port: config.server.port,
    });
    app.log.info(
      {
        address,
        schemaVersion: db.migrationResult.currentVersion,
        migrationsApplied: db.migrationResult.appliedCount,
      },
      `LocalBridge Server is running at ${address}`
    );

    // Start Integrated Standard MCP Gateway on 127.0.0.1:8787 (Fail-Safe Companion)
    if (process.env.NEXUS_DISABLE_INTERNAL_GATEWAY !== "true") {
      try {
        const gatewayPort = parseInt(process.env.NEXUS_BRIDGE_PORT || "8787", 10);
        const gatewayHost = process.env.NEXUS_BRIDGE_HOST || "127.0.0.1";
        gatewayInstance = await startMcpGateway({
          host: gatewayHost,
          port: gatewayPort,
          tokenService,
          projectService,
          logger: app.log,
        });
        app.log.info(
          { endpoint: `http://${gatewayHost}:${gatewayPort}/mcp` },
          `Integrated Standard MCP Gateway is running at http://${gatewayHost}:${gatewayPort}/mcp`
        );
      } catch (gwErr: any) {
        app.log.warn(
          { err: gwErr?.message || gwErr },
          "Integrated MCP Gateway failed to start on 8787 (Core Server remains active)"
        );
      }
    } else {
      app.log.info("Integrated MCP Gateway disabled in favor of dedicated Nexus MCP Bridge");
    }
  } catch (err) {
    app.log.error(err, "Failed to start LocalBridge Server");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
