# Security Architecture Claims Verification (Nexus v1.3.4)

Date: 2026-11-24  
Version: 1.3.4  
Scope: Verification of claims presented in the About page (Settings > About) and documentation.

---

## 1. External AI Scoped Tools

> **Claim**: External AI clients can only call the MCP tools that are enabled. Shell execution and file writes are limited to authorized project folders and require the project execution mode to be enabled.

### Verification Evidence:
- **Code Reference**: `apps/bridge/src/server.ts`, `apps/server/src/mcp/handler.ts`, `apps/server/src/routes/projects.ts`
- **Mechanism**: External AI clients connect over JSON-RPC 2.0 / MCP and can only invoke registered MCP tools (`nexus_run_script`, `nexus_discover_tools`, `nexus_execute_action`). Direct arbitrary shell access without tool wrapping is forbidden. Shell execution and file writes require the project's execution mode to be set (`project-code` or `enabled`) and reject paths outside authorized project boundaries.
- **Test Evidence**: `tests/tools-compliance.test.ts`, `apps/bridge/tests/tools-compliance.test.ts` (100% passing).

---

## 2. Loopback Isolation

> **Claim**: Loopback Isolation: The engine listens strictly on 127.0.0.1. External access reaches this machine only through the tunnel you configure.

### Verification Evidence:
- **Code Reference**: `apps/server/src/index.ts` (HOST="127.0.0.1"), `apps/bridge/src/index.ts` (HOST="127.0.0.1")
- **Mechanism**: All local HTTP, WebSocket, and MCP endpoints bind strictly to IPv4 loopback (`127.0.0.1`). External incoming traffic cannot reach the local machine directly over the LAN/WAN and must route through the user-authorized encrypted tunnel.

---

## 3. Killswitch Controls

> **Claim**: Killswitch Controls: Emergency Halt and Global Pause both stop background execution and suspend MCP access immediately.

### Verification Evidence:
- **Code Reference**: `apps/server/src/routes/management.ts` (lines 313–391)
- **Mechanism**:
  - `POST /api/pause` calls `mcpContext.setPaused(paused)` which suspends all incoming MCP execution.
  - `POST /api/emergency-stop` calls `mcpContext.setPaused(true)`, dispatches `JobCancelAll` to all runners, halts all persistent runtimes without approval, and records a `SECURITY_EMERGENCY_STOP` audit event.

---

## 4. Local Processing & Zero Telemetry

> **Claim**: Local Processing: Requests and tool executions are processed on-device. ChatGPT traffic travels to OpenAI over the secure tunnel. No telemetry or analytics are sent to the Nexus project or third parties.

### Verification Evidence:
- **Code Reference**: `PRIVACY.md`, `apps/server/src/app.ts`, `apps/bridge/src/server.ts`
- **Mechanism**: Nexus contains no Google Analytics, Sentry, Mixpanel, Segment, or remote tracking telemetry. All tool execution payloads, file buffers, and Git operations are executed directly on the host machine. The only remote traffic is the TLS-encrypted MCP tunnel established to connect ChatGPT with the local bridge.

---

## Audit Note on Removed Claims:
- **"Human-in-the-loop approvals with parameter hash binding and 5-minute timeout"**: Removed from the UI and documentation. While job approvals and approval status tools exist (`localbridge_approval_status`), parameter hash binding and a universal 5-minute timeout are not implemented across every destructive tool operation. As required by TASK 2, this claim has been removed.
