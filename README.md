# Nexus

<p align="center">
  <b>Give web AI assistants access to authorized local tools through MCP</b><br>
  <i>Local execution · User-controlled permissions · Action history</i>
</p>

<p align="center">
  <a href="#english"><b>English</b></a> | <a href="README.zh-CN.md"><b>简体中文</b></a>
</p>

<p align="center">
  <a href="https://github.com/ysunyang4/Nexus/releases"><img src="https://img.shields.io/badge/version-1.3.1-blue.svg" alt="Version 1.3.1"></a>
  <img src="https://img.shields.io/badge/MCP_Tools-332_Canonical-success.svg" alt="332 MCP Tools">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-red.svg" alt="License AGPL-3.0"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen.svg" alt="Platforms">
  
</p>

Community: [LINUX DO](https://linux.do).

---

<a name="english"></a>
## English

### 1. Overview

**Two-part workflow:** [WebAgent](https://github.com/ysunyang4/webagent) is the optional browser extension for compatible web AI chat interfaces. Nexus is the local service that enforces workspace permissions and executes tool calls. You can also use Nexus directly with other compatible MCP clients.


**Nexus** is an open-source local MCP control plane for compatible AI clients. It exposes locally authorized tools through **MCP Streamable HTTP** with bearer-token authentication.

Nexus allows AI agents to inspect, edit, build, debug, and orchestrate complex local engineering workflows within configured workspace and execution permissions. Review what is sent to third-party AI services: tool results returned to a web AI chat may leave your machine.

```text
 ChatGPT / DeepSeek / Web AI Assistants
               │
               │ Secure MCP Tunnel (Streamable HTTP, Bearer lb_xxx)
               ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Nexus Desktop Control Center (Tauri 2)               │
│                                                                        │
│  Fastify MCP & REST API Server (Port 18080)   SQLite Persistence (WAL) │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Bidirectional JSON-RPC 2.0 (WebSocket)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Nexus Local Runner Daemon                            │
│                                                                        │
│  ├── 332 Canonical MCP Tools Across 24 Capabilities                    │
│  ├── Action Ledger WAL (Crash Recovery & Idempotent Replay)            │
│  ├── Native Windows Computer Use (WinRT OCR, UI Automation)            │
│  ├── Sandboxed Workspaces & Managed Git Worktrees                      │
│  ├── Persistent Development Runtimes & Windows Job Objects             │
│  ├── Language Server Protocol (LSP - TypeScript / Python)              │
│  ├── Headless & Interactive Browser Automation Engine                  │
│  └── Local Intelligence Store (Memory, Rules, Knowledge, Prompts)      │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 2. Core Capabilities & Architectural Highlights

#### 1. 332 Canonical MCP Tools
- **Single Source of Truth**: All 332 tools are formally defined in `@localbridge/protocol`, with strict input schemas, risk ratings, and automated evidence tracking.
- **Tool catalog and validation**: Covers 24 capability dimensions: Filesystem, Advanced FS, Git Operations, Command Execution, Persistent Background Jobs, LSP Code Intelligence, Managed Worktrees, Browser Automation, Windows Computer Use, Vision Analysis, Document Engineering, Local Intelligence (Memory/Rules/Knowledge), Agent Orchestration, and System Discovery.

#### 2. ACID-Compliant Action Ledger WAL
- **Write-Ahead Logging**: Every critical tool execution is recorded in a write-ahead log (`.wal`) prior to side-effect application.
- **Crash Recovery & State Replay**: Automatically recovers pending operations and restores consistent workspace states after host reboot or runner crashes.
- **Idempotency Guard**: Eliminates duplicate execution and resource waste during intermittent network reconnections.

#### 3. Native Windows Computer Use & Vision
- **Semantic UI Locating**: Combines WinRT Native OCR and UI Accessibility trees to locate screen elements without relying on fragile pixel coordinates.
- **Multi-Monitor Control**: Window switching, foregrounding, mouse tracking, drag-and-drop, and keystroke dispatching with non-bypassable human takeover controls.
- **Visual Validation**: Screenshot capture, image comparison, and difference inspection for automated UI testing.

#### 4. Durable Execution & Process Isolation
- **Windows Job Objects**: Enforces hard process hierarchy isolation, CPU quotas, and memory caps on spawned commands.
- **Terminal Daemon (node-pty)**: Stateful pseudo-terminal sessions with ANSI log streaming and exit code tracking.
- **Command Risk Engine**: AST-based command classification (`SAFE`, `CAUTION`, `DANGEROUS`) that blocks destructive system calls (`rm -rf /`, `format`, `reg delete`) by default.

#### 5. Local Intelligence Store
- **Vectorless & Vector Hybrid**: SQLite-backed fast exact-match and semantic retrieval for persistent project memory, team rules, knowledge documentation, and custom prompt templates.
- **Context Compactor**: Automatic token reduction and conversational compaction for extended multi-turn agent tasks.
- **Extensible Skills Engine**: Declarative deterministic workflows with dynamic candidate proposal, automated validation, and live hot-reloading.

#### 6. Multi-Tier Path Sandbox & Enterprise Security
- **Physical Canonical Containment**: Enforces containment inside authorized project roots via `fs.realpathSync.native` to eliminate directory traversal (`../`) and prefix-confusion attacks.
- **Symlink & Junction Escape Shield**: Blocks malicious symlinks and Windows NTFS directory junctions pointing outside project boundaries.
- **Dual Token Cryptographic Isolation**: MCP client tokens (`lb_...`) and Runner daemon tokens (`lbr_...`) are generated with 256-bit entropy and stored exclusively as SHA-256 hashes. Timing side-channel attacks are mitigated via `crypto.timingSafeEqual`.
- **Sensitive File Shield**: Automatically masks `.env*`, `*.pem`, `*.key`, `id_rsa`, `.git`, and cloud credentials.

---

### 3. Monorepo Project Layout

```text
Nexus/
├── apps/
│   ├── desktop/          # Tauri 2 + React + Vite Desktop Control Center
│   ├── runner/           # Local execution daemon (332 tools, Action Ledger, Computer Use)
│   ├── server/           # Fastify MCP Server with SQLite WAL persistence & REST API
│   └── bridge/           # Standalone Nexus MCP Bridge (Streamable HTTP / ChatGPT / DeepSeek)
├── packages/
│   ├── protocol/         # Pure protocol types, 332 Canonical tool definitions, RPC schemas
│   ├── security/         # Sandboxing, path verification, and command risk engine
│   └── shared/           # Structured logger (Pino), config loader, crypto utilities
├── tests/                # Comprehensive test suites (190+ suites, 1200+ tests)
├── docs/                 # Architectural specifications, security models, and guides
├── artifacts/            # Production truth evidence, capability matrices, and audit ledgers
└── scripts/              # Build automation, bundling tools, and release scripts
```

---

### 4. Quick Start

#### Option A: Desktop Installer (when a verified build is available)
1. Open the [releases page](https://github.com/ysunyang4/Nexus/releases) and check the **Assets** section for available downloads and their exact file names. The source tag and later `main` documentation updates may not contain the same changes.
2. Download only an asset actually listed for your platform. Verify any published checksum or signature before running it. **Do not assume a Windows, macOS, Linux or userscript asset exists unless it appears on the release page.**
3. If no verified installer is listed, use the source-build steps below instead. Builds from the historical `v1.3.1` tag and from `main` may differ.

#### Option B: Build & Run from Source
Prerequisites: **Node.js >= 24**, **pnpm >= 10**, **Rust stable**.

```powershell
# 1. Clone the repository
git clone https://github.com/ysunyang4/Nexus.git
cd Nexus

# 2. Install workspace dependencies
pnpm install

# Optional: create an untracked, machine-local configuration file.
# The application also has built-in defaults if config.json is absent.
# PowerShell: Copy-Item config.example.json config.json

# 3. Build core packages and applications
pnpm run build

# 4. Launch Desktop Control Center
pnpm --filter @localbridge/desktop dev
```

---

### 5. Connecting AI Clients

#### Step 1: Authorize a Local Project
1. Open Nexus Desktop Control Center.
2. Under **Workspace -> Projects**, click **Authorize Project** and select your directory (e.g., `D:\projects\my-app`).
3. Set **Access Mode** (`read-only` or `read-write`) and **Execution Mode** (`disabled`, `safe-only`, or `project-code`)—both can be dynamically switched at any time without restarting.

#### Step 2: Generate an MCP Client Token
1. Go to **Settings -> Tokens**.
2. Click **Generate Token**, choose `MCP Client Token` (`lb_...`), and copy the displayed token.

#### Step 3: Configure Your AI Client

**ChatGPT / Custom GPT Actions**:
Add the Streamable HTTP endpoint:
```text
http://127.0.0.1:18080/mcp
```
Header: `Authorization: Bearer lb_your_token_here`

**Standard MCP Client Configuration (`mcp_config.json` / Client Settings)**:
```json
{
  "mcpServers": {
    "nexus": {
      "url": "http://127.0.0.1:18080/mcp",
      "headers": {
        "Authorization": "Bearer lb_your_token_here",
        "MCP-Protocol-Version": "2024-11-05"
      }
    }
  }
}
```

**Cursor / Windsurf / Any MCP Client**:
- Transport: `Streamable HTTP`
- URL: `http://127.0.0.1:18080/mcp`
- Headers: `{"Authorization": "Bearer lb_your_token_here"}`

---

### 6. Development & Quality Verification

```powershell
# Typecheck across all 7 workspace packages (0 errors)
pnpm run typecheck

# Build all packages, bundles, and Tauri resources
pnpm run build

# Run the test suite
pnpm run test

# Run Rust desktop check
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

---

### 7. License, Anti-Rebranding & Security Disclaimer

- **Software license ([GNU AGPL-3.0](LICENSE))**: Nexus v1.3.1 is distributed under the GNU Affero General Public License v3.0 (AGPL-3.0-only), which permits personal **and commercial** use, modification and redistribution subject to its terms.
  - **When source obligations apply**: Distributing covered works (including modified binaries), and allowing users to interact over a network with a modified version, can trigger the license's corresponding-source and notice requirements. Private modifications not conveyed or offered as a modified network service are not automatically required to be publicly published. Refer to the actual [AGPL-3.0 license](LICENSE), especially Sections 4–6 and 13, for the precise scope.
  - **Attribution and accurate origin**: Preserve copyright, license and other legal notices as the AGPL requires, indicate relevant changes, and do not falsely represent modified builds as official releases. The AGPL's termination and reinstatement provisions are governed by Section 8; this README does not add an automatic-termination rule.
  - **Branding**: The software license does not automatically grant trademark rights or permission to imply official endorsement. See [Brand Guidelines](BRAND_GUIDELINES.md). These guidelines do not override AGPL-granted software freedoms.
  - **Third-party notices**: See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for dependencies and a separate architecture-reference acknowledgement.
- **Security & Unrestricted Mode Disclaimer ([SECURITY.md](SECURITY.md))**:
  - By default, Nexus enforces strict path sandboxing (`read-only`) and AST command risk filtering (`safe-only`).
  - If you explicitly enable `read-write`, `project-code`, Computer Use UI automation, or **Unrestricted / Full-Control Mode**, you assume full responsibility for all commands executed and files modified by connected AI models. Always back up critical work or use Git version control.

---
