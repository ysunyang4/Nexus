# Nexus

<p align="center">
  <b>ChatGPT、DeepSeek、最新の Web AI アシスタントのための専用ローカル AI コントロールプレーン</b><br>
  <i>LocalBridge の 332 の Canonical MCP ツールアーキテクチャと Durable Action Ledger を基盤としています</i>
</p>

<p align="center">
  <a href="README.md#english"><b>English</b></a> | <a href="README.md#简体中文"><b>简体中文</b></a> | <b>日本語</b>
</p>

<p align="center">
  <a href="https://github.com/ysunyang4/Nexus/releases/tag/v1.3.1"><img src="https://img.shields.io/badge/version-1.3.1-blue.svg" alt="Version 1.3.1"></a>
  <img src="https://img.shields.io/badge/MCP_Tools-332_Canonical-success.svg" alt="332 MCP Tools">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-red.svg" alt="License AGPL-3.0"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen.svg" alt="Platforms">
  <img src="https://img.shields.io/badge/tests-190%2B_suites_%7C_1200%2B_tests-purple.svg" alt="Tests">
</p>

本プロジェクトは [LINUX DO](https://linux.do) コミュニティに認められています。

---

<a name="日本語"></a>
## 日本語

### 1. 概要

**Nexus** は、ChatGPT、DeepSeek、最新の AI コーディングアシスタントのために設計された、エンタープライズグレードのローカル AI コントロールプレーンです。高性能な **Secure MCP Tunnel**（Bearer トークン認証付きの Streamable HTTP）を通じて、リモートの LLM をあなたのローカルワークステーションに安全に接続します。

Nexus を使うと、AI エージェントは厳格に強制されたサンドボックスの境界内で、複雑なローカルのエンジニアリングワークフローの調査、編集、ビルド、デバッグ、オーケストレーションを行えます。ファイルシステム全体を公開したり、独自のコードを信頼できないクラウドの仲介者に送信したりすることはありません。

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

### 2. 主要な機能とアーキテクチャの特徴

#### 1. 332 の Canonical MCP ツール
- **唯一の信頼できる情報源**：332 のツールはすべて `@localbridge/protocol` で正式に定義されており、厳密な入力スキーマ、リスク評価、自動化されたエビデンスの追跡を備えています。
- **ハルシネーションゼロの保証**：24 の機能領域をカバーしています：ファイルシステム、高度なファイルシステム操作、Git 操作、コマンド実行、永続的なバックグラウンドジョブ、LSP によるコードインテリジェンス、管理された Worktree、ブラウザー自動化、Windows Computer Use、ビジョン分析、ドキュメントエンジニアリング、ローカルインテリジェンス（メモリ/ルール/ナレッジ）、エージェントのオーケストレーション、システムの検出。

#### 2. ACID 準拠の Action Ledger WAL
- **ログ先行書き込み（Write-Ahead Logging）**：重要なツールの実行はすべて、副作用が適用される前にログ先行書き込みのログ（`.wal`）に記録されます。
- **クラッシュからの復旧と状態の再生**：ホストの再起動や Runner のクラッシュの後、保留中の操作を自動的に復旧し、ワークスペースの一貫した状態を復元します。
- **冪等性ガード**：ネットワークが断続的に再接続する際の、重複した実行やリソースの無駄をなくします。

#### 3. ネイティブの Windows Computer Use とビジョン
- **意味的な UI の位置特定**：WinRT ネイティブ OCR と UI アクセシビリティツリーを組み合わせ、壊れやすいピクセル座標に頼らずに画面上の要素を特定します。
- **マルチモニターの制御**：ウィンドウの切り替え、前面化、マウスの追跡、ドラッグ＆ドロップ、キー入力の送信を、回避できない人間による引き継ぎの制御付きで行います。
- **視覚的な検証**：自動化された UI テストのための、スクリーンショットの取得、画像の比較、差分の確認。

#### 4. 永続的な実行とプロセスの分離
- **Windows Job Objects**：起動したコマンドに対して、厳格なプロセス階層の分離、CPU の割り当て上限、メモリの上限を強制します。
- **ターミナルデーモン（node-pty）**：ANSI ログのストリーミングと終了コードの追跡を備えた、状態を持つ疑似ターミナルのセッション。
- **コマンドリスクエンジン**：AST ベースのコマンド分類（`SAFE`、`CAUTION`、`DANGEROUS`）により、破壊的なシステムコール（`rm -rf /`、`format`、`reg delete`）をデフォルトでブロックします。

#### 5. ローカルインテリジェンスストア
- **ベクトルなしとベクトルのハイブリッド**：永続的なプロジェクトのメモリ、チームのルール、ナレッジドキュメント、カスタムのプロンプトテンプレートのための、SQLite をバックエンドとする高速な完全一致検索と意味検索。
- **コンテキストコンパクター**：長時間にわたるマルチターンのエージェントタスクのための、自動的なトークン削減と会話の圧縮。
- **拡張可能なスキルエンジン**：動的な候補の提案、自動化された検証、ライブのホットリロードを備えた、宣言的で決定論的なワークフロー。

#### 6. 多層のパスサンドボックスとエンタープライズセキュリティ
- **物理的な正規パスによる封じ込め**：`fs.realpathSync.native` によって承認済みのプロジェクトルート内への封じ込めを強制し、ディレクトリトラバーサル（`../`）やプレフィックスの混同による攻撃を排除します。
- **シンボリックリンクとジャンクションによる脱出の防止**：プロジェクトの境界の外を指す悪意のあるシンボリックリンクや、Windows NTFS のディレクトリジャンクションをブロックします。
- **2 種類のトークンによる暗号学的な分離**：MCP クライアントトークン（`lb_...`）と Runner デーモントークン（`lbr_...`）は 256 ビットのエントロピーで生成され、SHA-256 のハッシュとしてのみ保存されます。タイミングによるサイドチャネル攻撃は `crypto.timingSafeEqual` によって緩和されます。
- **機密ファイルの保護**：`.env*`、`*.pem`、`*.key`、`id_rsa`、`.git`、クラウドの認証情報を自動的にマスクします。

---

### 3. モノレポのプロジェクト構成

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

### 4. クイックスタート

#### 方法 A：デスクトップ版インストーラー（検証済みのビルドがある場合）
1. [v1.3.1 のリリースページ](https://github.com/ysunyang4/Nexus/releases/tag/v1.3.1)を開き、**Assets** セクションで利用可能なダウンロードとその正確なファイル名を確認してください。ソースのタグと、その後の `main` のドキュメント更新には、同じ変更が含まれていない場合があります。
2. お使いのプラットフォーム向けに実際に掲載されているアセットだけをダウンロードしてください。公開されているチェックサムや署名は、実行する前に必ず検証してください。**リリースページに表示されていない限り、Windows、macOS、Linux、ユーザースクリプトのアセットが存在するとは考えないでください。**
3. 検証済みのインストーラーが掲載されていない場合は、代わりに下記のソースからのビルド手順を使ってください。過去の `v1.3.1` タグからのビルドと `main` からのビルドは異なる場合があります。

#### 方法 B：ソースからビルドして実行する
前提条件：**Node.js >= 24**、**pnpm >= 10**、**Rust stable**。

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

### 5. AI クライアントの接続

#### ステップ 1：ローカルプロジェクトを承認する
1. Nexus Desktop Control Center を開きます。
2. **Workspace -> Projects** で **Authorize Project** をクリックし、ディレクトリ（例：`D:\projects\my-app`）を選択します。
3. **Access Mode**（`read-only` または `read-write`）と **Execution Mode**（`disabled`、`safe-only`、または `project-code`）を設定します。どちらも再起動せずに、いつでも動的に切り替えられます。

#### ステップ 2：MCP クライアントトークンを生成する
1. **Settings -> Tokens** に移動します。
2. **Generate Token** をクリックし、`MCP Client Token`（`lb_...`）を選んで、表示されたトークンをコピーします。

#### ステップ 3：AI クライアントを設定する

**ChatGPT / Custom GPT Actions**：
Streamable HTTP のエンドポイントを追加します：
```text
http://127.0.0.1:18080/mcp
```
ヘッダー：`Authorization: Bearer lb_your_token_here`

**標準的な MCP クライアントの設定（`mcp_config.json` / クライアントの設定）**：
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

**Cursor / Windsurf / 任意の MCP クライアント**：
- トランスポート：`Streamable HTTP`
- URL：`http://127.0.0.1:18080/mcp`
- ヘッダー：`{"Authorization": "Bearer lb_your_token_here"}`

---

### 6. 開発と品質の検証

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

### 7. ライセンス、リブランディングの禁止、セキュリティに関する免責事項

- **ソフトウェアライセンス（[GNU AGPL-3.0](LICENSE)）**：Nexus v1.3.1 は GNU Affero General Public License v3.0（AGPL-3.0-only）のもとで配布されています。このライセンスの条件に従う限り、個人での利用**および商用**利用、改変、再配布が認められます。
  - **ソースコードに関する義務が適用される場合**：対象となる著作物（改変したバイナリを含む）を配布する場合や、改変したバージョンとネットワーク経由でユーザーがやり取りできるようにする場合には、ライセンスの対応するソースコードと告知に関する要件が発生することがあります。配布せず、改変したネットワークサービスとしても提供しない私的な改変は、自動的に公開を求められるわけではありません。正確な範囲については、実際の [AGPL-3.0 ライセンス](LICENSE)、特に第 4〜6 条と第 13 条を参照してください。
  - **帰属表示と正確な出所**：AGPL が求めるとおりに著作権、ライセンス、その他の法的な告知を保持し、関連する変更を明示してください。また、改変したビルドを公式のリリースであると偽らないでください。AGPL の終了と復帰に関する規定は第 8 条に従います。この README は、自動的な終了に関する規則を追加するものではありません。
  - **ブランディング**：ソフトウェアのライセンスは、商標権や公式の承認を示唆する許可を自動的に与えるものではありません。[ブランドガイドライン](BRAND_GUIDELINES.md)をご覧ください。このガイドラインは、AGPL が認めるソフトウェアの自由を覆すものではありません。
  - **サードパーティに関する告知**：依存関係と、それとは別のアーキテクチャ参照に関する謝辞については [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) をご覧ください。
- **セキュリティと制限なしモードに関する免責事項（[SECURITY.md](SECURITY.md)）**：
  - デフォルトでは、Nexus は厳格なパスのサンドボックス（`read-only`）と AST によるコマンドのリスクフィルタリング（`safe-only`）を強制します。
  - `read-write`、`project-code`、Computer Use による UI 自動化、または **Unrestricted / Full-Control Mode** を明示的に有効にした場合、接続された AI モデルが実行するすべてのコマンドと変更するすべてのファイルについて、あなたが全責任を負います。重要な作業は必ずバックアップするか、Git でバージョン管理してください。

---

### ☕ スポンサーと支援

Nexus があなたのワークフロー、研究、日々の開発の役に立ったなら、作者にコーヒーを 1 杯ごちそうしていただけると嬉しいです ☕！

皆さんの温かいご支援は、オープンソースの継続的なメンテナンス、機能の進化、バグ修正を支える力になります。

<div align="center">
  <table>
    <tr>
      <td align="center" width="260">
        <img src="docs/assets/wechat-pay.jpg" width="220" alt="WeChat Pay（微信支付）" /><br />
        <br />
        <b>WeChat Pay（微信支付）</b>
      </td>
      <td align="center" width="260">
        <img src="docs/assets/alipay.jpg" width="220" alt="Alipay（支付宝）" /><br />
        <br />
        <b>Alipay（支付宝）</b>
      </td>
    </tr>
  </table>
</div>
