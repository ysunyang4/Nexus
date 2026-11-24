# Privacy Policy & Security Architecture Guarantees

**Last Updated**: November 24, 2026  
**Applies to**: Nexus LocalBridge & Nexus Desktop (`ysunyang4/Nexus`)

---

## 1. Local-First Architecture & Zero Telemetry

Nexus is built from the ground up as a **100% local-first Model Context Protocol (MCP) gateway and desktop control plane**.

- **No Remote Telemetry**: Nexus does **not** collect, track, store, or transmit any user analytics, telemetry, usage statistics, prompt content, or telemetry pings to the author, project maintainers, or any third-party analytics servers.
- **No Cloud Account Requirement**: Nexus functions completely offline without requiring sign-ins, phone numbers, or cloud accounts.
- **Loopback Isolation**: Core HTTP, SSE, and WebSocket endpoints are bound strictly to `127.0.0.1` (localhost). No external ports are opened unless the user explicitly configures an outbound reverse tunnel (such as Cloudflare Tunnel) with user-controlled credentials.

---

## 2. Local File & Terminal Access Boundary

- **Local Storage**: All project registries, logs, session states, and SQLite databases reside exclusively in the user's local application data directory (e.g., `%LOCALAPPDATA%\Nexus` on Windows or `~/.nexus` on macOS/Linux).
- **Execution Scoping**: Terminal commands, code reasoning, and script executions run locally under the current OS user privileges with explicit parameter array isolation (`shell: false`). No uninspected dynamic command execution is performed.
- **Destructive Operation Protection**: Any file writes, deletions, or process terminations declare explicit behavior hints (`destructiveHint: true`) and can be intercepted by user-controlled human-in-the-loop approval gates.

---

## 3. Environment Variables & Secret Handling

Nexus reads and validates credentials exclusively from local configuration files or the local environment:
- `NEXUS_MCP_TOKEN`
- `NEXUS_BRIDGE_TOKEN`
- `LOCALBRIDGE_MANAGEMENT_TOKEN`
- `NEXUS_MANAGEMENT_TOKEN`

### Security Guarantees:
1. **Zero Exfiltration**: Tokens are strictly used to authenticate local loopback requests between your AI assistant (e.g., ChatGPT via tunnel or WebAgent browser extension via local loopback) and the local Nexus server.
2. **Never Transmitted Remotely**: Tokens are never uploaded, logged to external services, or included in outgoing URLs.
3. **In-Memory Sanitization**: Error traces and audit logs redact token parameters to prevent accidental disclosure.

---

## 4. Third-Party AI Connections

When connecting web or desktop AI clients to Nexus:
- Nexus acts purely as an MCP tool server responding to structured JSON-RPC calls.
- Only the specific tool inputs and outputs requested by the AI assistant and approved by the user are exchanged over the local bridge.
- You retain complete ownership and sovereignty over your source code, local files, and workflow data.

---

## 5. Contact & Auditing

If you have questions regarding this Privacy Policy, security reports, or M8ven Trust Index verifications, please reach out via:
- **GitHub Issues**: [https://github.com/ysunyang4/Nexus/issues](https://github.com/ysunyang4/Nexus/issues)
- **Security & Privacy Inquiries**: `ysunyang4@gmail.com`
- **Official Repository**: [https://github.com/ysunyang4/Nexus](https://github.com/ysunyang4/Nexus)
