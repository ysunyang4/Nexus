# Nexus v1.3.1 — Open-source Cloud + Local edition

**Scope**: This document describes the publicly released Nexus v1.3.1 codebase. It does not describe or authorize changes to any other version.

## Policy

Nexus remains an execution bridge, not a cloud AI agent. No commercial license, activation code, device fingerprint, TPM binding, VMProtect or BLA. Authentication is used for public API safety, not for payment or product licensing.

## Architecture

External MCP client (scoped client bearer credential) -> HTTPS Cloudflare Worker -> per-device Durable Object -> distinct device bearer credential -> outbound local Agent -> protected local MCP Bridge -> Nexus Core/Runner -> user computer.

Cloud-native read-only tools: `nexus_cloud_dns_lookup`, `nexus_cloud_rdap_lookup`, `nexus_cloud_http_headers`, `nexus_cloud_http_probe`.
Local tools, including filesystem, terminal, process, desktop, Ego Nova, Blender, Unity, native Git and external native MCP, remain local. They are callable through cloud ONLY when an Agent is online **and** the operator explicitly allowlists the exact tool names. The Agent never auto-exposes all tools.

Example endpoint patterns (illustrative placeholders, not a publicly verified running deployment):

- Cloud URL: `https://<your-worker-domain>`
- Health: `https://<your-worker-domain>/health`
- MCP (scoped client credential): `https://<your-worker-domain>/d/<device-id>/mcp`
- Remote Agent (separate device credential): `wss://<your-worker-domain>/d/<device-id>/relay/agent`

## Encryption / data isolation

- Cloud traffic: HTTPS / WSS, TLS to Cloudflare. This is NOT end-to-end encryption from client to local Runner; Cloudflare routes messages and could read their plaintext.
- Cloud service root is only stored as a Cloudflare Secret; every local Agent uses separately enrolled device credentials sealed by Windows CurrentUser DPAPI. The cloud stores only per-role keyed hashes of those credentials. Client and Agent credentials are distinct. Each random device ID uses its own Durable Object.
- Administrator-only provisioning uses a separate Cloudflare Secret and a Windows CurrentUser DPAPI admin profile. Administrator credentials must never be included in public installers.
- Local optional file vault: scrypt (N=32768, r=8, p=1) + AES-256-GCM.
- SQLite: **encrypted, integrity-checked snapshot and restore only**; live SQLite is NOT SQLCipher-encrypted. Existing running database remains unchanged. Snapshot has a 128MiB in-memory limit.
- OAuth tokens: set `NEXUS_OPEN_SECURE_OAUTH=1`; then they are saved with AES-256-GCM, with their master key sealed by Windows CurrentUser DPAPI. Default secure storage is isolated under `%LOCALAPPDATA%\NexusOpenSource\v1.3.1\data`, not the v1.3.7 legacy directory.
- Server connection API-key encryption: set `NEXUS_OPEN_SECURE_SECRETS=1`; a separate master key sealed with Windows DPAPI is created under `%LOCALAPPDATA%\NexusOpenSource\v1.3.1\db-secrets`. The insecure static fallback key was removed.
- These secure modes use new key material. Existing credentials encrypted with a legacy key are NOT silently migrated. Reconnect/re-enroll into the open-source instance if necessary.
- Neither cloud nor local security uses a commercial entitlement check.

## Running locally (development)

Build prerequisites: Node.js >=24, pnpm, working Nexus v1.3.1 dependencies. `pnpm install` has been run in this workspace.

Open independent terminals, from this directory:

```powershell
.\OPEN-SOURCE-START.ps1 -Mode server
.\OPEN-SOURCE-START.ps1 -Mode bridge
.\OPEN-SOURCE-START.ps1 -Mode agent
```

Optionally start desktop using `.\OPEN-SOURCE-START.ps1 -Mode desktop`. Avoid starting this edition with v1.3.7 listening on the same ports (8787, 18080); the launcher checks for conflicts.

The launcher can create a local Bridge bearer token for local services. Agent **never reads the Cloudflare root** and instead loads its own DPAPI-protected device credential at `%LOCALAPPDATA%\NexusOpenSource\v1.3.1\cloud\device.json.dpapi`. Provision it once using the documented owner-only `apps/nexus-open-cloud/local/manage-devices.mjs` flow. A client needs its separate per-device client credential for the `/d/<device-id>/mcp` endpoint.

To expose a particular local tool remotely, set `NEXUS_REMOTE_ALLOWED_TOOLS` in the Agent terminal before launching. Default is empty:

```powershell
$env:NEXUS_REMOTE_ALLOWED_TOOLS = "localbridge_project_list"
.\OPEN-SOURCE-START.ps1 -Mode agent
```

Only explicitly listed names are forwarded; Nexus local permissions continue to apply. **Do not allowlist terminal/process/computer-use tools until their authorization policy has been reviewed.**

If a Windows system HTTP proxy is configured, the Agent detects it automatically for outbound WSS; set `NEXUS_CLOUD_PROXY` to override.

## Test commands

```powershell
pnpm --dir apps/server build
pnpm --dir apps/bridge build
node --test apps/nexus-open-cloud/test/*.test.mjs
pnpm exec vitest run apps/server/src/db/secure-secret-storage.test.ts
node apps/nexus-open-cloud/test/oauth-secure.e2e.mjs
node apps/nexus-open-cloud/test/relay.e2e.mjs
```

The relay E2E test connects to the real cloud Worker with a disposable new device, uses an isolated mock MCP server, and revokes the test device in finally. It does not displace another device or execute a real Nexus tool.

## SQLite encrypted snapshot example

```powershell
$env:NEXUS_VAULT_PASSPHRASE = "use-your-own-long-private-passphrase"
node apps/nexus-open-cloud/local/sqlite-backup.mjs snapshot .\apps\server\localbridge.db .\my-backup.enc
node apps/nexus-open-cloud/local/sqlite-backup.mjs restore .\my-backup.enc .\restored-copy.db
Remove-Item Env:NEXUS_VAULT_PASSPHRASE
```

Use a new output path. Snapshots do not overwrite source databases. Do not place passphrases in Git.

## Publication and verification status

The Nexus v1.3.1 source repository is **already public**. This document is a technical reference, not a prepublication approval checklist. Publishing source code does **not** prove that every installer, bundled binary, third-party asset, or deployment endpoint has been independently audited.

- The repository uses AGPL-3.0-only; preserve its licensing obligations and third-party notices.
- Root `config.json` is treated as machine-local configuration. New clones can use schema defaults or create it from `config.example.json`. Never commit real credentials or runtime telemetry.
- The `check-release.mjs` audit should be run and its findings reviewed before any future release; any warnings are actionable and do not automatically indicate that this already-public repository is private or unpublished.
- Verify GitHub Actions and actual Release assets separately. A published source tag does not guarantee installers exist on the Release page.
- Check Git history and bundled third-party components for license provenance and sensitive data. Changes to current tracking do not erase old commits.

## Current limits

- Uses per-device API Bearer secrets rather than a full interactive OAuth Provider; clients requiring OAuth discovery need an additional OAuth layer. Device isolation is implemented, but a multi-user account/tenant identity system is not yet complete.
- Only the 4 cloud-native network tools were truly moved to Cloudflare; local tools are routed to the local Agent when explicitly allowlisted.
- No auto-sync of private local files to Cloudflare.
- Full SQLCipher database-at-rest encryption and full live Nexus 300+ tool compatibility have not been verified.
