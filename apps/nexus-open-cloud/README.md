# Nexus Open Cloud — v1.3.1 (device-scoped security v2)

This is the open-source Cloudflare Worker / Durable Object MCP gateway plus a local Windows Agent. The Cloudflare **root secret stays on Cloudflare**. Do not ship a shared root key in the installer.

## Services
- `GET /health`: public Worker health.
- `POST /d/<device-id>/mcp`: bearer-authenticated MCP requests scoped to ONE device.
- `GET /d/<device-id>/relay/agent`: WSS upgrade authenticated using a separate device Agent bearer secret.
- `GET /d/<device-id>/relay/status`: bearer-authenticated device connection status.
- `POST /admin/devices`: administrator-only device registration; one-time device and client credentials are returned, **never persisted in cloud plaintext**.
- `POST /admin/devices/<device-id>/rotate`: revokes both old credentials and issues new ones.
- `POST /admin/devices/<device-id>/revoke`: permanently revokes that device and disconnects its Agent.

The admin API requires a distinct `NEXUS_ADMIN_TOKEN` Cloudflare Worker Secret. The root `NEXUS_GATEWAY_TOKEN` is used only on Cloudflare to create device-scoped, role-separated credential digests. Neither root nor admin credential is used by the running local Agent. `NEXUS_RELAY` Durable Objects are keyed by random device IDs.

## Initial owner migration (Windows; run once in this order)
From the repository root:

```powershell
pnpm --dir apps/nexus-open-cloud check
node --test apps/nexus-open-cloud/test/*.test.mjs

# Requires your own Wrangler login; never prints token values:
node apps/nexus-open-cloud/local/manage-devices.mjs admin-init
wrangler deploy --config apps/nexus-open-cloud/wrangler.jsonc
node apps/nexus-open-cloud/local/manage-devices.mjs rotate-root
node apps/nexus-open-cloud/local/manage-devices.mjs enroll
node apps/nexus-open-cloud/local/manage-devices.mjs status
```

**Existing installations should NOT rerun admin-init, rotate-root or enroll**. They are one-time migration commands and intentionally refuse overwrites. `rotate-root` is allowed only before the first device enrollment; root rotation otherwise invalidates existing device hashes.

On Windows, admin and device credentials are sealed with CurrentUser DPAPI in `%LOCALAPPDATA%\NexusOpenSource\v1.3.1\cloud\` as `*.json.dpapi`. Never export these files or print bearer tokens into logs. The local development `.dev.vars` root entry is retired after successful root rotation.

## Starting the Agent
```powershell
node apps/nexus-open-cloud/local/agent.mjs
node apps/nexus-open-cloud/local/manage-devices.mjs status
```

The Agent loads its own device identity automatically from DPAPI. No `NEXUS_GATEWAY_TOKEN` or `NEXUS_ADMIN_TOKEN` is used by the Agent. It reconnects on network failure. By default `NEXUS_REMOTE_ALLOWED_TOOLS` is **empty**, so no local tool is remotely exposed. Explicitly allowlist a narrow subset only after auditing local Nexus authorization. `NEXUS_LOCAL_MCP_TOKEN` is needed if any local tool is allowlisted.

The Cloudflare Workers URL is `https://nexus-open-cloud-tools.example-domain5628.workers.dev`. A cloud MCP client must use its own device URL `/d/<device-id>/mcp` and the device-scoped **client** bearer token (NOT the Agent token). The current remote MCP endpoint uses bearer auth, not a complete interactive OAuth provider. Some ChatGPT/Claude clients may need an OAuth integration layer.

## Managing credentials
```powershell
node apps/nexus-open-cloud/local/manage-devices.mjs status
node apps/nexus-open-cloud/local/manage-devices.mjs rotate
node apps/nexus-open-cloud/local/manage-devices.mjs revoke
```

**Rotation** invalidates old Agent + client tokens and replaces the local DPAPI file. Restart the Agent and update any external MCP client token after rotation. **Revocation** closes the cloud Agent connection; re-enrollment should use a new device ID and fresh enrollment policy.

## Tests / limits
```powershell
node --test apps/nexus-open-cloud/test/*.test.mjs
node apps/nexus-open-cloud/test/relay.e2e.mjs
```

The E2E test registers a disposable test device with administrator authorization, uses a harmless local mock MCP server, and revokes the test device in `finally`. No real Windows computer-use tool is invoked by the E2E test.

This design provides **per-device isolation**, not a finished multi-tenant OAuth account system. Cloudflare can still observe messages it routes; TLS is not end-to-end encryption against Cloudflare. A compromised Windows user session or compromised Cloudflare account remains high-impact. Do not publish the whole repository without the existing secret/history/third-party license audit.
