# 企业级 Conventional Commits 提交与版本管理规范

在 `nexus.dev-copilot` 流程的第五阶段（交付与版本归档）中，必须遵循本规范生成标准化提交信息。

---

## 1. 提交信息结构 (Commit Message Structure)

```
<type>(<scope>): <subject>

[optional body: 详细说明修改的动机、设计思路与影响面]

[optional footer: 关联的 Issue、破坏性变更 (BREAKING CHANGE)]
```

---

## 2. 核心类型定义 (Type Matrix)

| Type | 适用场景 | 范例 |
| :--- | :--- | :--- |
| `feat` | 新增功能、接口或业务特性 | `feat(auth): add OAuth2 token refresh endpoint` |
| `fix` | 修复缺陷、Bug、内存泄漏或崩溃 | `fix(mcp): resolve port binding race condition` |
| `refactor` | 重构代码（不引入新功能，也不改变外部行为） | `refactor(db): streamline query connection pool` |
| `perf` | 提升性能或降低内存/CPU开销 | `perf(scanner): cache directory traversal results` |
| `docs` | 仅更新文档、README、架构图或注释 | `docs(readme): add installation guide for Linux` |
| `test` | 新增或补全单元测试、端到端测试 | `test(agent): add test cases for self-healing loop` |
| `chore` | 构建流程、依赖版本、打包配置或杂务变动 | `chore(deps): bump tauri to 2.2.0` |
| `style` | 不影响代码逻辑的代码格式变动（空格、格式化） | `style(ui): format CSS class names with Prettier` |

---

## 3. 破坏性变更 (Breaking Changes)

当变动导致不向下兼容时，必须在 `<type>` 后面追加 `!`，或者在 footer 明确声明：

```
feat(api)!: drop deprecated legacy MCP endpoint

BREAKING CHANGE: The /api/v1/mcp endpoint has been removed. All clients must upgrade to /api/v2/mcp.
```

---

## 4. Git 交付前自检清单 (Pre-Commit Checklist)

在调用 `command_run` 执行 `git commit` 前，必须依次完成以下 4 项核查：
1. **代码清洁度**：是否移除了所有的调试 `console.log`、`print()` 或临时硬编码凭据？
2. **状态核对**：执行 `git status` 确认没有误勾选无用的二进制缓存（如 `node_modules/`, `target/`, `dist/`, `.env`）；
3. **差异比对**：执行 `git diff --cached --stat` 确认改动的范围完全在任务预设之内；
4. **编译复测**：确保在工作区根目录下已跑过 `build` 或 `test`，且退出码为 0。
