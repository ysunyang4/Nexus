# Privacy Policy — Nexus Control Center & MCP Server

**Effective Date:** November 25, 2026  
**Maintainer:** Sunyang (`@ysunyang4`) — `ysunyang4@gmail.com`

## 1. Local-First & Zero Telemetry Guarantee

Nexus Control Center and the Nexus MCP Bridge operate on a **100% local-first** architecture:

- **No Telemetry or Analytics:** Nexus does not collect, transmit, or sell usage analytics, crash reports, conversation logs, source code, or personal data to the maintainer or any third party.
- **Local Execution:** All Model Context Protocol (MCP) tools, file operations, terminal commands, and SQLite state databases run exclusively on your local machine (`127.0.0.1`).

## 2. Credentials & Token Handling

- Environment variables and local access tokens (such as `LOCALBRIDGE_MANAGEMENT_TOKEN`, `NEXUS_BRIDGE_TOKEN`, `NEXUS_MANAGEMENT_TOKEN`, `NEXUS_MCP_TOKEN`, and OAuth tokens) are used solely to authenticate local or user-configured MCP requests.
- Sensitive tokens are encrypted at rest via platform credential storage (e.g., Windows DPAPI) or hashed using SHA-256, and are redacted from logs and error outputs.

## 3. Third-Party Services & Network Requests

- **User-Initiated AI Clients:** When you connect an AI client (such as ChatGPT or WebAgent), tool arguments and tool outputs are transmitted only to the AI provider you selected, under that provider's privacy policy.
- **Explicit Outbound Tools:** Tools that fetch public web content (such as `search_wikipedia` or `crawl_url`) make outbound HTTP requests only to the target URLs requested during tool execution.

## 4. Data Retention & Deletion

All local logs, SQLite databases, and cached artifacts reside on your device and can be deleted at any time by clearing the application data directory or uninstalling Nexus.

## 5. Contact

For privacy questions or security reports, please open an issue at [https://github.com/ysunyang4/Nexus/issues](https://github.com/ysunyang4/Nexus/issues) or email `ysunyang4@gmail.com`.
