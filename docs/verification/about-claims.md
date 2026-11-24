# Security Architecture Claims Verification (Nexus v1.3.4)

Date: 2026-11-24  
Version: 1.3.4  
Scope: Verification of claims presented in the About page and documentation.

---

## 1. External AI Scoped Tools

> **Claim**: External AI clients operate through scoped MCP tools only. Shell and file actions run in the execution sandbox defined by the project trust policy.

### Verification Evidence:
- **Code Reference**: `apps/server/src/mcp/handler.ts`, `packages/protocol/src/tools/canonical-registry.ts`
- **Mechanism**: External AI clients connect over JSON-RPC 2.0 / MCP and can only invoke registered MCP tools (`nexus_run_script`, `nexus_discover_tools`, `nexus_execute_action`). Direct arbitrary shell access without tool wrapping is forbidden. File access is checked against authorized project boundaries and the project's trust policy (`ProjectTrustPolicy`).
- **Test Evidence**: `tests/tools-compliance.test.ts`, `apps/bridge/tests/tools-compliance.test.ts` (100% passing).

---

## 2. Process Isolation

> **Claim**: Process Isolation: The local engine runs as a standard user process. Project execution isolation depends on the project's execution mode.

### Verification Evidence:
- **Code Reference**: `apps/desktop/src-tauri/src/main.rs`, `apps/runner/src/process/supervisor.ts`
- **Mechanism**: The Nexus core runtime (`localbridge-desktop.exe`, `node.exe`, and background runners) runs strictly under the launching Windows user context without elevated root/admin privileges. Execution isolation for commands and build scripts is governed per-project by the execution mode setting (`disabled`, `project-code`, or `enabled`).

---

## 3. Local Processing & Zero Telemetry

> **Claim**: Local Processing: Requests and tool executions are processed on-device. ChatGPT traffic travels to OpenAI over the secure tunnel. No telemetry or analytics are sent to the Nexus project or third parties.

### Verification Evidence:
- **Code Reference**: `PRIVACY.md`, `apps/server/src/app.ts`, `apps/bridge/src/server.ts`
- **Mechanism**: Nexus contains no Google Analytics, Sentry, Mixpanel, Segment, or telemetry tracking SDKs. All tool execution payloads, file buffers, and Git operations are executed directly on the user's host machine. The only remote traffic is the TLS-encrypted MCP tunnel established to connect ChatGPT with the local bridge.

---

## 4. Token Storage

> **Claim**: Token Storage: Local MCP access tokens are stored in the Windows DPAPI credential store, encrypted with user-scope keys.

### Verification Evidence:
- **Code Reference**: `apps/desktop/src-tauri/src/tunnel.rs` (lines 38–95)
- **Mechanism**: Access tokens (starting with `lb_`) are encrypted using the Windows Data Protection API (`CryptProtectData`) with flag `CRYPTPROTECT_UI_FORBIDDEN`. No machine-scope flag (`CRYPTPROTECT_LOCAL_MACHINE`) is passed, ensuring cryptographic isolation tied specifically to the current logged-in Windows user account.
- **Persistence Path**: Encrypted ciphertext is safely stored in local app state and decrypted only upon authenticated loopback calls.
