<p align="right"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a></p>

<p align="center">
  <img src="docs/assets/nexus-mascot.png" width="130" alt="Nexus Mascot" style="border-radius: 20px; box-shadow: 0 8px 30px rgba(0,0,0,0.15);" />
</p>

<h1 align="center">Nexus</h1>

<p align="center">
  <strong>让网页版 AI 拥有 Codex 级本地工程能力，同时为 Cursor / Antigravity / Claude Code 装上“省 Token + 跨软件控制”引擎</strong><br>
  <i>3 个入口元工具 · 332 项本地与桌面能力 · 内置 Token Guardrail 防爆上下文 · ACID 事务操作日志</i>
</p>

<p align="center">
  <a href="#7-快速开始">快速开始</a> · <a href="#1-项目概述">项目概述</a> · <a href="#5-核心功能与架构亮点">核心能力</a> · <a href="https://github.com/ysunyang4/Nexus/issues">问题反馈</a> · <a href="LICENSE">开源许可</a>
</p>

<p align="center">
  <a href="https://m8ven.ai/mcp/ysunyang4-nexus-9j6zw4?s=readme"><img src="https://img.shields.io/badge/M8ven-Verified-2563EB?labelColor=1E40AF&amp;style=flat-square" height="20" alt="M8ven Verified"></a>
  <img src="https://img.shields.io/badge/MCP_Tools-332_规范工具-2563EB?labelColor=1E40AF&amp;style=flat-square" height="20" alt="332 MCP Tools">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-2563EB?labelColor=1E40AF&amp;style=flat-square" height="20" alt="License AGPL-3.0"></a>
</p>
<p align="center">
  <a href="https://trendshift.io/repositories/358532?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-358532" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/358532/daily?language=TypeScript" alt="ysunyang4%2FNexus | Trendshift" width="250" height="55"/></a>
</p>
<!-- M8ven Publisher Verification: [![M8ven Verified](https://m8ven.ai/badge/mcp/ysunyang4-nexus-9j6zw4?variant=verified&v=1e0eb455a089a7be305d42fcbb972652)](https://m8ven.ai/mcp/ysunyang4-nexus-9j6zw4?s=readme) -->

**Nexus** 是一套“双端驱动”的本地 MCP 执行网关：既能让浏览器里的网页版 AI 零 API 成本获得类似 Codex 的本地编码闭环能力，也能让专业 AI 客户端在更省 Token 的前提下解锁桌面软件、3D 引擎与浏览器自动化能力。

### 两种用法，一套本地网关

| 使用模式 | 它能做什么 | 核心优势 |
| :--- | :--- | :--- |
| **🌐 网页版 AI → 化身 Codex 级本地工程师**<br>*(配合 [WebAgent 浏览器插件](https://github.com/ysunyang4/webagent))* | 直接把 **ChatGPT、DeepSeek、Claude、Gemini、Kimi 网页版** 桥接到本地仓库，实现读代码、改文件、跑编译、修报错与 Git Worktree 管理。 | **零额外 API 费用。** 用你原本的网页版会员，就能在严格路径沙盒内跑通端到端本地研发闭环，且源码不经第三方云端中继。 |
| **⚡ 专业 AI 客户端 → 更省 Token、能力更强**<br>*(Cursor、Antigravity、Claude Code、Codex CLI、Windsurf)* | 只需配置一行 Streamable HTTP MCP 地址（`http://127.0.0.1:18080/mcp`），即可让客户端直接操控 **Blender、Unity、Playwright、Windows 桌面自动化**，并获得 **Action Ledger WAL 崩溃恢复**。 | **原生省 Token 引擎 (`token-guardrail`)：**<br>• **按需发现 (`nexus_discover_tools`)**：不再把 332 个工具 Schema 全塞进上下文。<br>• **脚本单轮批处理 (`nexus_run_script`)**：多步操作写进一次 Python/Node 脚本跑完，零中间往返 Token 消耗。<br>• **载荷瘦身**：Base64 截图自动落盘转路径、超长日志自动中间截断、大列表通过 `HandleManager` 分页读取。 |

---

## 1. 项目概述

```text
 网页版 AI (配合 WebAgent)  |  专业 MCP 客户端 (Cursor / Antigravity / Claude Code / Codex)
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
1. 从 [GitHub Releases (v1.3.4)](https://github.com/ysunyang4/Nexus/releases/tag/v1.3.4) 下载对应平台的最新安装包：
   - **Windows (x64 安装包)**：[`Nexus_1.3.4_x64-setup.exe`](https://github.com/ysunyang4/Nexus/releases/latest/download/Nexus_1.3.4_x64-setup.exe)
   - **macOS (Universal 通用 DMG)**：[`Nexus_1.3.4_universal.dmg`](https://github.com/ysunyang4/Nexus/releases/latest/download/Nexus_1.3.4_universal.dmg)
   - **macOS (Apple Silicon DMG)**：[`Nexus_1.3.4_aarch64.dmg`](https://github.com/ysunyang4/Nexus/releases/latest/download/Nexus_1.3.4_aarch64.dmg)
   - **Linux (Debian/Ubuntu `.deb`)**：[`Nexus_1.3.4_amd64.deb`](https://github.com/ysunyang4/Nexus/releases/latest/download/Nexus_1.3.4_amd64.deb)
   - **Linux (通用 `.AppImage`)**：[`Nexus_1.3.4_amd64.AppImage`](https://github.com/ysunyang4/Nexus/releases/latest/download/Nexus_1.3.4_amd64.AppImage)
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

## 9. 社区交流与反馈渠道

欢迎参与 Nexus 开发者社区交流、提交建议与反馈问题：
- **Issue 与缺陷反馈**：[GitHub Issues](https://github.com/ysunyang4/Nexus/issues)
- **技术讨论与 Q&A**：[GitHub Discussions](https://github.com/ysunyang4/Nexus/discussions)
- **商业授权与企业咨询**：`ysunyang4@gmail.com`

---

## 10. 💖 赞助与开源维护支持 (Sponsorship)

如果 **Nexus** 对您的日常研发工作流、学术研究或开发效率有所帮助，欢迎自愿赞助支持本项目的持续开源维护。所有赞助均为自愿行为，将用于推动项目的长期活跃维护、新特性迭代与生态基础设施建设。

> 💼 **企业赞助与商业授权 (Enterprise & Licensing)**  
> 如需企业级深度技术支持、定制集成，或商业闭源授权（豁免 AGPL-3.0 开源传染义务的商业双重许可），欢迎通过 [GitHub Issues](https://github.com/ysunyang4/Nexus/issues) 或邮件联系：`ysunyang4@gmail.com`。

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/ryansun)

### 官方赞助渠道

| 🟢 微信支付 (WeChat Pay) | 🔵 支付宝 (Alipay) | 🟡 币安支付 (Binance Pay) | ☕ Ko-fi |
| :---: | :---: | :---: | :---: |
| <img src="docs/assets/wechat-pay.jpg" width="210" alt="WeChat Pay" /> | <img src="docs/assets/alipay.jpg" width="210" alt="Alipay" /> | <img src="docs/assets/binance-pay.jpg" width="210" alt="Binance Pay" /> | <img src="docs/assets/ko-fi-qr.png" width="210" alt="Ko-fi" /> |

| 赞助方式 | 网络 / 平台 | 账户 / 地址 | 说明 |
| :--- | :--- | :--- | :--- |
| **加密货币 (USDT 链上直转)** | **TRON (TRC-20)** | `TPRrDW8DGsrDmcnWvanTbFz7XEJuywu21i` | 用任何钱包或交易所转出时，选 **TRON (TRC-20)** 网络即可 |
| **币安支付 (Binance Pay)** | 站内转账 | **UID: `1292741809`** | 币安站内转账（免选手续费网络） |
| **Ko-fi** | 网页 (PayPal) | [https://ko-fi.com/ryansun](https://ko-fi.com/ryansun) | 通过 Ko-fi 请作者喝杯咖啡 |

> 🌟 **衷心感谢您的支持与陪伴。** 每一份支持都将切实帮助本项目持续演进与打磨。

### 官方安全声明

- **唯一官方渠道**：上表列出的渠道是本项目**唯一**合法的官方赞助通道。
- **绝无私信索要**：项目作者与维护团队**绝不会**通过私信、邮件、即时通讯工具等任何方式主动向您索要转账、汇款或账户信息。
- **防伪与举报**：如在任何第三方网站、Fork 仓库或镜像中发现声称属于本项目但与上述 UID 或地址不一致的情况，请立即通过 [GitHub Issues](https://github.com/ysunyang4/Nexus/issues) 提交举报。

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

- **软件许可证**：Nexus v1.4.1 依据 [GNU AGPL-3.0](LICENSE) 发布，允许个人与商业使用、学习、修改和再分发，但须遵守许可证原文。
  - **源码提供义务的适用范围**：分发受 AGPL 约束的程序或修改版，以及让用户通过网络与修改版交互等适用情形，可能触发相应源码和许可声明义务。仅在本地私下修改、不进行相应分发或网络交互服务，并不当然要求公开源码。具体以 AGPL 第 4–6、13 条等规定为准。
  - **署名与来源**：依许可证保留必须保留的版权、许可证和法律声明，标明适用的修改；不得冒充 Nexus 官方版本。许可终止及恢复遵循 AGPL 第 8 条，而非 README 单方面规定立即终止。
  - **品牌保护**：[BRAND_GUIDELINES.md](BRAND_GUIDELINES.md) 仅用于说明独立的商标、品牌标识及防混淆问题，不剥夺 AGPL 授予的软件权利。
  - **第三方归属**：[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 列明第三方组件，并将概念性架构参考与实际代码依赖分开说明。
- **安全提醒**：请阅读 [SECURITY.md](SECURITY.md)。启用读写、命令执行、桌面接管或全盘访问会扩大远程 AI 可执行操作的范围，应采取备份、审批和最小权限措施。

<p align="center">
  <a href="https://m8ven.ai/mcp/ysunyang4-nexus-9j6zw4?s=readme"><img src="https://m8ven.ai/badge/mcp/ysunyang4-nexus-9j6zw4?variant=verified&v=1e0eb455a089a7be305d42fcbb972652" alt="M8ven Verified" height="20"></a>
</p>
