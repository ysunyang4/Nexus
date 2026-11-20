# 常见编译构建与运行时报错排查与自愈字典 (Build & Runtime Troubleshooting)

本手册专为 Nexus 1.3.2 全栈研发副驾驶（`nexus.dev-copilot`）提供底层诊断知识库。在调用 `command_run` 遭遇非零退出码或错误堆栈时，请结合本字典自主反思并执行定向自愈。

---

## 1. Node.js / TypeScript 生态高频报错与自愈方案

### 1.1 `Cannot find module 'xxx' or its corresponding type declarations` (TS2307)
- **根因分析**：
  - 未安装对应依赖包；
  - 安装了运行时依赖，但缺少 `@types/xxx` 开发类型定义；
  - `tsconfig.json` 的 `moduleResolution` 设置不匹配（如从 `node` 改为了 `nodenext`，未写文件扩展名 `.js`）。
- **自愈动作**：
  1. 调用 `file_read` 检查 `package.json` 中的 `dependencies` 与 `devDependencies`；
  2. 若缺失包，调用 `command_run` 安装：`pnpm add <pkg>` 或 `pnpm add -D @types/<pkg>`；
  3. 若为 ESM 模式（`"type": "module"`），在 import 相对路径末尾补齐 `.js` 扩展名。

### 1.2 `Property 'xxx' does not exist on type 'yyy'` (TS2339)
- **根因分析**：类型定义不完整或对象结构变动。
- **自愈动作**：
  1. `file_read` 读取该接口（interface）或类型别名定义处；
  2. 若该属性是合法的新增字段，在类型定义中追加可选或必填属性：`xxx?: string;`；
  3. 若为外部第三方库对象，使用类型断言 `(obj as any).xxx` 作为兼容兜底，或使用类型守卫 `if ('xxx' in obj)` 缩小类型范围。

### 1.3 `EADDRINUSE: address already in use :::PORT`
- **根因分析**：目标本地端口已被前台或残留的后台僵尸进程占用。
- **自愈动作**：
  1. 调用 `localbridge_process_list` 列出当前活动进程；
  2. Windows 环境下：`command_run` 执行 `netstat -ano | findstr :<PORT>` 提取占用该端口的 PID；
  3. 调用 `command_run` 释放该端口：`taskkill /F /PID <PID>`（Windows）或 `kill -9 <PID>`（Linux/macOS）；
  4. 重新拉起目标开发服务。

---

## 2. Rust 生态高频报错与自愈方案

### 2.1 `cannot borrow `*xxx` as mutable, as it is also borrowed as immutable` (E0502)
- **根因分析**：违背 Rust 所有权借用规则，同时存在不可变借用与可变借用。
- **自愈动作**：
  1. 缩小不可变借用的生命周期作用域（使用大括号 `{ ... }` 隔离块级作用域）；
  2. 若数据量较小且实现了 `Clone`，在借用前执行 `.clone()` 制作副本；
  3. 若涉及多线程或结构体共享状态，改用 `RefCell`、`Mutex` 或 `RwLock` 配合内部可变性模式。

### 2.2 `trait bound ... is not satisfied` (E0277)
- **根因分析**：类型未实现函数签名或泛型约束要求的 Trait（如 `Send`, `Sync`, `Serialize`, `Clone`）。
- **自愈动作**：
  1. 检查结构体声明上方，通过 `#[derive(Clone, Debug, Serialize, Deserialize)]` 派生宏补齐；
  2. 若涉及自定义复杂类型，针对性实现对应 Trait 的契约方法。

### 2.3 `mismatched types: expected ..., found ...` (E0308)
- **根因分析**：返回值类型与函数签名不匹配，或缺少 `Ok(...)` / `Some(...)` 包裹。
- **自愈动作**：
  1. 检查函数返回类型签名；
  2. 若返回 `Result` 或 `Option`，补充 `?` 操作符传播错误，或返回 `Ok(result)`；
  3. 类型转换：数值类型调用 `as i64` / `as usize`，字符串引用与所有权调用 `.to_string()` / `.as_str()`。

---

## 3. Python 生态高频报错与自愈方案

### 3.1 `ModuleNotFoundError: No module named 'xxx'`
- **根因分析**：虚拟环境未激活，或依赖未在当前环境中安装。
- **自愈动作**：
  1. `command_run` 执行 `pip install <module>` 或 `poetry add <module>`；
  2. 若为本地包导入报错，检查 `sys.path` 与根目录是否存在 `__init__.py`，改用绝对导入或相对导入语法。

### 3.2 `SyntaxError: invalid syntax` / `IndentationError`
- **根因分析**：Python 强依赖缩进，混用空格与 Tab，或存在未闭合的括号/字符串。
- **自愈动作**：
  1. `file_read` 检查报错代码行及其上一行；
  2. 统一缩进格式为 4 个空格，闭合括号与三引号。

---

## 4. Git 常见异常自愈指南

### 4.1 `fatal: not a git repository`
- **自愈动作**：调用 `command_run` 执行 `git init` 初始化本地代码仓。

### 4.2 `error: pathspec 'xxx' did not match any file(s) known to git`
- **自愈动作**：检查文件真实相对路径，先执行 `git status` 核对未跟踪列表后再进行 `git add`。

### 4.3 `LF will be replaced by CRLF` / `CRLF will be replaced by LF`
- **自愈动作**：此提示为跨平台正常换行符兼容提示，非致命错误。可设置 `git config core.autocrlf true`（Windows）使之静默。
