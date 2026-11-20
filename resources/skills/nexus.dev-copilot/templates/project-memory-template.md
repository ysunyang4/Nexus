# Project Memory: [项目名称]

> 本文档由 `nexus.dev-copilot` 维护，记录本工程的核心架构共识、业务上下文与历史决策，防止跨会话 AI 失忆。

---

## 1. 工程拓扑与技术栈清单 (Architecture & Tech Stack)
- **项目定位**：[一句话说明项目是做什么的]
- **主语言与运行时**：[Node.js 22 / TypeScript / Rust 1.80 / Python 3.12 / Go 1.23]
- **核心框架库**：[如 Tauri, Express, Fastify, React, Tokio, Axum]
- **包管理器与构建工具**：[pnpm / cargo / pip]
- **核心文件入口**：
  - 前端入口：`src/App.tsx` 或 `src/main.ts`
  - 后端服务：`src/index.ts` 或 `src-tauri/src/main.rs`
  - 核心配置：`tsconfig.json`, `tauri.conf.json`, `Cargo.toml`

---

## 2. 关键架构规范与共识 (Core Conventions)
- **分层规范**：API Router 仅解析参数，业务逻辑沉淀在 Services，数据存储收敛于 Storage/Repo。
- **类型校验**：外部边界强制执行严格 Schema 校验（Zod / Serde）。
- **错误捕获**：禁止裸吞异常，所有关键系统调用与 IPC 必须有优雅降级或标准错误抛出。

---

## 3. 经典踩坑与避坑指南 (Known Edge Cases & Solutions)
- **问题 1**：[记录此前踩过的 Bug 现象与根因]
  - **解决方案**：[精准记录修复方法或关键依赖规避]
- **问题 2**：[例如：Windows/Linux 跨平台换行符或端口冲突处理]
  - **解决方案**：[解决方案与调试命令]

---

## 4. 常用验证与调试指令 (Standard Commands)
- **安装依赖**：`pnpm install` 或 `cargo check`
- **本地构建**：`pnpm build`
- **运行测试**：`pnpm test`
- **服务启动**：`pnpm dev`

---

## 5. 当前活跃任务与待办事项 (Active Workstream & Backlog)
- [x] [已完成特性 1]
- [x] [已修复缺陷 2]
- [ ] **TODO-1**：[当前进行中的任务目标]
- [ ] **TODO-2**：[后续待扩充的特性]
