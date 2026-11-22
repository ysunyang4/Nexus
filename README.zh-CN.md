# Nexus

<p align="center">
  <img src="docs/assets/nexus-mascot.png" width="160" alt="Nexus Mascot" style="border-radius: 20px; box-shadow: 0 8px 30px rgba(0,0,0,0.15);" />
</p>

<p align="center">
  <b>专为 ChatGPT、DeepSeek 与新一代 Web AI 智能体打造的企业级本地 AI 控制中枢</b><br>
  <i>基于 LocalBridge 332 项规范 MCP 工具体系与 ACID 事务操作日志（Action Ledger）架构</i>
</p>

<p align="center">
  <a href="README.md"><b>English</b></a> | <b>简体中文</b>
</p>

<p align="center">
  <a href="https://github.com/ysunyang4/Nexus/releases/tag/v1.3.3"><img src="https://img.shields.io/badge/version-1.3.3-blue.svg" alt="Version 1.3.3"></a>
  <img src="https://img.shields.io/badge/MCP_Tools-332_规范工具-success.svg" alt="332 MCP Tools">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-red.svg" alt="License AGPL-3.0"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen.svg" alt="Platforms">
  <img src="https://img.shields.io/badge/tests-190%2B_测试套件_%7C_1200%2B_用例-purple.svg" alt="Tests">
</p>

---

## 1. 项目概述

**Nexus** 是一套专为 ChatGPT、DeepSeek 及新一代 AI 编程智能体量身打造的企业级**本地 AI 控制中枢（Local AI Control Plane）**。它通过高性能**安全 MCP 隧道**（基于 Bearer 令牌的 Streamable HTTP 协议），将远端大模型安全连接至开发者的本地工作站。

Nexus 赋予 AI 智能体在严格沙箱边界内检索、编辑、构建、测试与编排完整研发工作流的能力，从根本上杜绝整盘越权泄露风险，且绝不将私有源码转传给任何不可信第三方云端中继。

```text
 ChatGPT / DeepSeek / Web AI Assistants 客户端
               │
               │ 安全 MCP 隧道 (Streamable HTTP, Bearer lb_xxx)
               ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Nexus 桌面控制中心 (Tauri 2 + React)                 │
│                                                                        │
│  Fastify MCP & REST 核心服务 (Port 18080)    SQLite 持久化引擎 (WAL)   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ 双向强类型 JSON-RPC 2.0 (WebSocket)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Nexus 本地执行守护进程 (Runner Daemon)               │
│                                                                        │
│  ├── 332 项规范 MCP 工具 (覆盖 24 类工程与智能能力)                    │
│  ├── Action Ledger 事务日志 (WAL 崩溃恢复与幂等安全跳过)               │
│  ├── 原生 Windows Computer Use (WinRT OCR, UI 自动化定位)              │
│  ├── 沙箱隔离工作区与 Git Managed Worktree (独立分支隔离开发)          │
│  ├── 长稳持久开发运行时 (Persistent Runtime & Windows Job Object)       │
│  ├── 语言服务器协议 (LSP - TypeScript / Python 代码智能)               │
│  ├── 无头及交互式浏览器自动化引擎 (Deep Research 深度调研)             │
│  └── 本地智能知识中枢 (记忆库、全局规则、知识库、提示词库)             │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 桌面控制中心与工程管理实景

Nexus 桌面控制中心为开发者提供全方位的实时可观测性、细粒度安全授权与智能体工具链治理：

<div align="center">
  <img src="docs/assets/showcase/desktop-overview.png" alt="Nexus 桌面总览" width="850" />
  <p><i>Nexus 桌面控制中心：实时系统状态、活跃工作区、注册工具集与系统资源开销监控。</i></p>
</div>

<br>

<div align="center">
  <table>
    <tr>
      <td width="50%">
        <img src="docs/assets/showcase/security-authorizations.png" alt="项目安全授权与沙箱隔离" />
        <p align="center"><b>多层安全沙箱与项目授权</b><br>细粒度读写权限隔离、路径安全边界检测与 AST 语法级危险命令拦截。</p>
      </td>
      <td width="50%">
        <img src="docs/assets/showcase/skills-hub.png" alt="技能中心与零臃肿热重载引擎" />
        <p align="center"><b>技能中心（Skills Hub）</b><br>零臃肿模块化工具编排，支持运行时动态技能提议与秒级热重载。</p>
      </td>
    </tr>
    <tr>
      <td width="50%">
        <img src="docs/assets/showcase/mcp-tunnel.png" alt="双通道安全 MCP 隧道" />
        <p align="center"><b>安全 MCP 隧道</b><br>Streamable HTTP 隧道，内置 Windows DPAPI 加密凭据保险库。</p>
      </td>
      <td width="50%">
        <img src="docs/assets/showcase/mcp-ecosystem.png" alt="托管式 MCP 进程与 API 生态" />
        <p align="center"><b>托管式 MCP 进程生态</b><br>原生支持 Figma、GitHub、SQLite、本地文件系统等全套工具进程生命周期。</p>
      </td>
    </tr>
  </table>
</div>

---

## 3. 生成式三维资产与自动化建模（Blender）

Nexus 无缝打通生成式大模型与 **Blender 4.x / 5.x** 的双向通道，实现从自然语言提示词到程序化三维建模、几何节点编排、PBR 真实感着色器合成与多通道渲染的完整自动化流水线。

<div align="center">
  <img src="docs/assets/showcase/blender-cottage-render.png" alt="风格化卡通木屋 - 程序化渲染" width="850" />
  <p><i>全自主三维场景生成：风格化卡通木屋（包含程序化石砌基底、木质梁柱、屋顶瓦片及体积光照系统）。</i></p>
</div>

<br>

<div align="center">
  <table>
    <tr>
      <td width="50%">
        <img src="docs/assets/showcase/blender-cottage-wireframe.png" alt="Blender 拓扑结构与四边面布线" />
        <p align="center"><b>生产级纯四边形（Quad）布线</b><br>极致严谨的边流走向、非破坏性修改器堆栈与次时代游戏标准网格密度。</p>
      </td>
      <td width="50%">
        <img src="docs/assets/showcase/blender-bottle-generator.png" alt="Blender 蒸汽朋克药剂瓶生成器" />
        <p align="center"><b>程序化硬表面与 PBR 材质生成</b><br>复杂黄铜机械构件、物理拟真玻璃双层折射与动态流体材质着色。</p>
      </td>
    </tr>
  </table>
</div>

---

## 4. 游戏开发与编辑器 Copilot（Unity）

通过 **Nexus Unity Copilot** 深度赋能现代游戏开发流程。AI 智能体直接驻留在 Unity 编辑器内部（通过双向 JSON-RPC MCP 桥接），实时完成场景节点搭建、自定义 HLSL / Shader Graph 着色器编写、物理碰撞配置以及游戏机制校验。

<div align="center">
  <img src="docs/assets/showcase/unity-blackhole-scene.png" alt="Unity 深空黑洞与光子环场景" width="850" />
  <p><i>Nexus 编辑器内智能副驾驶：实时构建引力透镜吸积盘、高能光子环与深空星云场景。</i></p>
</div>

<br>

<div align="center">
  <table>
    <tr>
      <td width="50%">
        <img src="docs/assets/showcase/unity-blackhole-shader.png" alt="自定义着色器参数与 AI Game Developer 专区" />
        <p align="center"><b>AI Game Developer 专区与材质调优</b><br>交互式着色器参数微调、Inspector 面板实时同步与调试诊断。</p>
      </td>
      <td width="50%">
        <img src="docs/assets/showcase/unity-gameplay-preview.png" alt="Unity 视口与实时游戏运行模拟" />
        <p align="center"><b>场景层级树与游戏运行测试</b><br>自动化 GameObject 层级构造、天空盒环境光烘焙与主摄像机视锥定位。</p>
      </td>
    </tr>
  </table>
</div>

---

## 5. 核心技术支柱与特性

#### 1. 332 项规范 MCP 工具（Canonical Tools）
- **唯一真值源定义**：全量 332 项工具统一定义于 `@localbridge/protocol`，具备严格的 Zod Schema 校验、权限分级和执行证据链。
- **全方位工程覆盖**：涵盖文件系统、高级文件操作、Git 版本控制、命令安全执行、后台长稳作业、LSP 代码智能、Worktree 隔离、浏览器自动化、Windows 桌面控制（Computer Use）、图像视觉分析、多格式文档处理、本地记忆知识库、任务规划编排与系统环境发现等 24 个维度。

#### 2. ACID 级 Action Ledger 事务账本
- **预写式日志（WAL）**：所有对文件系统或外部状态产生副作用的操作均在预写日志落盘后执行。
- **崩溃自动恢复与重放**：守护进程异常终止或系统断电重启后，系统能够检测未提交事务并实现一致性回滚或安全重试。
- **幂等性防护机制**：自动识别重复指令，防止在弱网重连时造成重复执行。

#### 3. 原生 Windows Computer Use 桌面接管与视觉感知
- **语义级 UI 定位**：深度融合 WinRT 原生 OCR 与 Windows UI 辅助功能树（Accessibility Tree），摆脱脆弱的绝对像素坐标定位。
- **完整人机交互**：窗口激活与置顶、鼠标平滑移动、拖拽交互、键盘按键派发，配备桌面一键紧急熔断机制。
- **视觉对比与判定**：支持截屏捕获、图像差异比对，为桌面自动化操作提供真实反馈。

#### 4. 长稳执行与企业级进程隔离
- **Windows Job Object 隔离**：子进程与作业严格挂载至 Windows 作业对象，精确限制 CPU 配额与内存上限，防止僵尸进程驻留。
- **全状态终端会话（node-pty）**：提供原生伪终端会话，支持 ANSI 实时日志流式推送与退出码追踪。
- **AST 语法级命令风控**：将命令划分为 `SAFE`（安全）、`CAUTION`（注意）、`DANGEROUS`（危险）三级，默认拦截 `rm -rf /`、`format`、`reg delete` 等破坏性指令。

#### 5. 本地智能知识中枢（Local Intelligence Store）
- **混合检索能力**：基于 SQLite 构建持久化记忆库、工程规则库、技术知识库与提示词模板，支持超低延迟精确检索。
- **上下文压缩器（Context Compactor）**：智能识别关键实体与上下文摘要，在多轮高负荷对话下大幅降低 Token 消耗。
- **技能引擎（Skills System）**：支持确定性声明式工作流、动态候选技能提议、自动化验证与热重载。

#### 6. 多层沙箱与企业级安全护栏
- **物理规范路径包含**：借助 `fs.realpathSync.native` 解析真实路径，彻底阻断跨目录遍历（`../`）与前缀混淆攻击。
- **符号链接与 Junction 逃逸防御**：拦截指向受控目录外的软链接与 Windows 目录连接点（NTFS Junction）。
- **双令牌密码学隔离**：MCP 客户端令牌（`lb_...`）与 Runner 令牌（`lbr_...`）采用 256 位熵生成，仅以 SHA-256 哈希存储；比对均使用恒定时间比较（`crypto.timingSafeEqual`），防止时序侧信道反推。
- **敏感凭证智能屏蔽**：默认拦截并隐藏 `.env*`、`*.pem`、`*.key`、`id_rsa`、`.git` 及各类云平台凭据文件。

---

## 6. 代码仓库结构

```text
Nexus/
├── apps/
│   ├── desktop/          # Tauri 2 + React + Vite 桌面控制中心
│   ├── runner/           # 本地执行守护进程（332 工具集、Action Ledger、Computer Use）
│   ├── server/           # Fastify MCP 服务端（SQLite WAL 持久化 & REST API）
│   └── bridge/           # Nexus MCP 独立网桥（兼容 ChatGPT / DeepSeek）
├── packages/
│   ├── protocol/         # 纯协议类型层、332 工具规范定义、RPC JSON-Schema
│   ├── security/         # 沙箱隔离防护、路径规范化验证、命令风控引擎
│   └── shared/           # 结构化日志（Pino）、配置解析、密码学工具库
├── tests/                # 自动化测试矩阵（190+ 模块，1200+ 项测试）
├── docs/                 # 架构设计规范、安全模型与协议文档
├── artifacts/            # 生产真值审计凭据、能力矩阵与证据账本
└── scripts/              # 构建编译、依赖捆绑与版本打包脚本
```

---

## 7. 快速上手

#### 方式 A：使用桌面端安装包（推荐）
1. 从 [GitHub Releases (v1.3.2)](https://github.com/ysunyang4/Nexus/releases/tag/v1.3.3) 下载对应平台的最新安装包：
   - **Windows (x64 安装包)**：[`Nexus_1.3.2_x64-setup.exe`](https://github.com/ysunyang4/Nexus/releases/latest/download/Nexus_1.3.2_x64-setup.exe)
   - **macOS (Universal 通用 DMG)**：[`Nexus_1.3.2_universal.dmg`](https://github.com/ysunyang4/Nexus/releases/latest/download/Nexus_1.3.2_universal.dmg)
   - **macOS (Apple Silicon DMG)**：[`Nexus_1.3.2_aarch64.dmg`](https://github.com/ysunyang4/Nexus/releases/latest/download/Nexus_1.3.2_aarch64.dmg)
   - **Linux (Debian/Ubuntu `.deb`)**：[`Nexus_1.3.2_amd64.deb`](https://github.com/ysunyang4/Nexus/releases/latest/download/Nexus_1.3.2_amd64.deb)
   - **Linux (通用 `.AppImage`)**：[`Nexus_1.3.2_amd64.AppImage`](https://github.com/ysunyang4/Nexus/releases/latest/download/Nexus_1.3.2_amd64.AppImage)
   - **油猴脚本 (Tampermonkey)**：[`nexus-web-agent.user.js`](https://github.com/ysunyang4/Nexus/releases/latest/download/nexus-web-agent.user.js)
2. 双击安装。Nexus 随系统托盘启动，内置自包含 Node.js 运行时、语言服务器和后台执行守护进程，开箱即用。

#### 方式 B：从源码编译与启动
环境要求：**Node.js >= 24**、**pnpm >= 10**、**Rust stable**。

```powershell
# 1. 克隆代码仓库
git clone https://github.com/ysunyang4/Nexus.git
cd Nexus

# 2. 安装项目依赖
pnpm install

# 3. 编译协议包与各子项目
pnpm run build

# 4. 启动桌面控制中心
pnpm --filter @localbridge/desktop dev
```

---

## 8. 接入 AI 客户端

#### 步骤 1：授权本地工程项目
1. 打开 Nexus 桌面端。
2. 进入 **工作区 -> 项目管理**，点击 **授权项目** 并选择本地文件夹（如 `D:\projects\my-app`）。
3. 配置 **访问模式**（只读 `read-only` 或 读写 `read-write`）与 **执行模式**（禁用 `disabled`、仅安全命令 `safe-only` 或 完整工程代码 `project-code`），支持在运行期随时二次切换，立即生效。

#### 步骤 2：生成 MCP 访问令牌
1. 进入 **设置 -> 访问令牌**。
2. 点击 **生成令牌**，选择 `MCP 客户端令牌`（`lb_...`），复制显示的凭据。

#### 步骤 3：在 AI 工具中配置

**ChatGPT / 自定义 GPT Actions**：
添加 Streamable HTTP 接口：
```text
http://127.0.0.1:18080/mcp
```
Header 添加：`Authorization: Bearer lb_your_token_here`

**标准 MCP 客户端配置（`mcp_config.json` 或客户端设置）**：
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

**Cursor / Windsurf / 通用 MCP 客户端**：
- 传输类型：`Streamable HTTP`
- 请求地址：`http://127.0.0.1:18080/mcp`
- 标头参数：`{"Authorization": "Bearer lb_your_token_here"}`

---

## 9. 官方技术社群与开发者联系方式

### 官方技术交流群
欢迎加入 Nexus 开发者技术交流群，获取最新功能体验、提 issue 与实时交流：

<div align="center">
  <table>
    <tr>
      <td align="center" width="280">
        <img src="docs/assets/community/qq-group.jpg" width="220" alt="QQ 官方交流群" style="border-radius: 12px;" /><br>
        <br>
        <b>QQ 官方交流群</b><br>
        <code>1131916140</code>
      </td>
      <td align="center" width="280">
        <img src="docs/assets/community/tg-group.png" width="220" alt="Telegram 交流群" style="border-radius: 12px;" /><br>
        <br>
        <b>Telegram 交流群</b><br>
        <a href="https://t.me/YSUN_WEBAI"><code>@YSUN_WEBAI</code></a>
      </td>
    </tr>
  </table>
</div>

## 10. ☕ 赞助与支持 (Support)

如果 **Nexus** 对您的日常研发工作流、学术研究或开发效率有所帮助，欢迎自愿赞助支持本项目的持续开源维护 ☕！所有赞助均为自愿行为，不附带任何额外功能、专属服务或优先支持特权。

您的慷慨赞助将持续推动项目的活跃开源维护、新特性迭代与生态建设。

> 💼 **企业赞助与商业授权 (Enterprise & Licensing)**  
> 如需企业级深度技术支持、定制集成，或商业闭源授权（豁免 AGPL-3.0 开源传染义务的商业双重许可），欢迎通过 [GitHub Issues](https://github.com/ysunyang4/Nexus/issues) 或邮件联系：`ysunyang979@gmail.com`。

<div align="center">
  <table>
    <tr>
      <td align="center" width="220">
        <img src="docs/assets/wechat-pay.jpg" width="180" alt="微信赞赏码" style="border-radius: 12px;" /><br />
        <br />
        <b>微信赞赏码</b><br />
        <span style="font-size: 11px; color: #888;">微信扫码赞赏支持作者</span>
      </td>
      <td align="center" width="220">
        <img src="docs/assets/alipay.jpg" width="180" alt="支付宝赞赏码" style="border-radius: 12px;" /><br />
        <br />
        <b>支付宝赞赏码</b><br />
        <span style="font-size: 11px; color: #888;">支付宝扫码赞赏支持作者</span>
      </td>
      <td align="center" width="240">
        <img src="docs/assets/binance-pay.jpg" width="180" alt="加密货币 (USDT / USDC)" style="border-radius: 12px;" /><br />
        <br />
        <b>加密货币 (USDT / USDC)</b><br />
        <code>UID: 1292741809</code><br />
        <span style="font-size: 11px; color: #888;">币安支付 (Binance Pay) · Ryan Sunv</span>
      </td>
    </tr>
  </table>
</div>

### 官方收款渠道

| 收款渠道 | 详细信息 | 验证与使用方式 |
| :--- | :--- | :--- |
| **加密货币 (USDT / USDC)** | **UID: `1292741809`** · 账户名: **Ryan Sunv** | 币安 App 扫码或通过 Binance Pay 站内直接转账（免选手续费网络） |
| **加密货币 (USDT 链上直转)** | **地址: `TPRrDW8DGsrDmcnWvanTbFz7XEJuywu21i`** · 网络: **TRON (TRC-20)** | 用任何钱包或交易所转出时，选 **TRON (TRC-20)** 网络即可 |
| **微信赞赏** | 微信创作者官方赞赏码 | 仅通过上方官方展示的图片扫码 |
| **支付宝赞赏** | 支付宝官方赞赏码 | 仅通过上方官方展示的图片扫码 |

> ☕ **每一份打赏，无论多少，对我都是莫大的鼓励。** 您的支持会帮助我把这个项目做得更加完善、更加强大。感谢您陪它一起成长。

### 官方声明

- **唯一官方渠道**：上表列出的 UID、二维码和链上地址是本项目**唯一**合法的官方赞助通道。
- **绝无私信索要**：项目作者与维护团队**绝不会**通过私信、邮件、即时通讯工具等任何方式主动向您索要转账、汇款或账户信息。
- **防伪与举报**：如在任何第三方网站、Fork 仓库或镜像中发现声称属于本项目但与上述 UID 或二维码不一致的情况，请立即通过 [GitHub Issues](https://github.com/ysunyang4/Nexus/issues) 提交举报。

### 免责声明

- **网络与地域限制**：加密资产赞助须遵循相关服务平台规则。在进行赞助前，请确认币安支付（Binance Pay）在您所在国家或地区完全合法合规且可用。
- **法律与税务合规**：赞助者须自行承担并遵守所在司法管辖区关于赠予、赞助的一切税务与法律合规责任。
---

## 11. 质量保障与验证指令

```powershell
# 全局 7 个工作区强类型校验（0 错误）
pnpm run typecheck

# 构建各端产物、自包含资源与独立启动器
pnpm run build

# 运行自动化测试套件
pnpm run test

# 验证桌面 Rust 端编译状态
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

---

## 12. 开源许可证、署名与安全说明

- **软件许可证**：Nexus v1.3.2 依据 [GNU AGPL-3.0](LICENSE) 发布，允许个人与商业使用、学习、修改和再分发，但须遵守许可证原文。
  - **源码提供义务的适用范围**：分发受 AGPL 约束的程序或修改版，以及让用户通过网络与修改版交互等适用情形，可能触发相应源码和许可声明义务。仅在本地私下修改、不进行相应分发或网络交互服务，并不当然要求公开源码。具体以 AGPL 第 4–6、13 条等规定为准。
  - **署名与来源**：依许可证保留必须保留的版权、许可证和法律声明，标明适用的修改；不得冒充 Nexus 官方版本。许可终止及恢复遵循 AGPL 第 8 条，而非 README 单方面规定立即终止。
  - **品牌保护**：[BRAND_GUIDELINES.md](BRAND_GUIDELINES.md) 仅用于说明独立的商标、品牌标识及防混淆问题，不剥夺 AGPL 授予的软件权利。
  - **第三方归属**：[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 列明第三方组件，并将概念性架构参考与实际代码依赖分开说明。
- **安全提醒**：请阅读 [SECURITY.md](SECURITY.md)。启用读写、命令执行、桌面接管或全盘访问会扩大远程 AI 可执行操作的范围，应采取备份、审批和最小权限措施。
