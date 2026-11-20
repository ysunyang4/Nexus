# 现代全栈项目分层架构与设计准则 (Architecture Standards)

本指南为 `nexus.dev-copilot` 在进行代码编写、重构或设计新模块时提供架构原则指引。

---

## 1. 核心架构设计原则

### 1.1 单一职责原则 (Single Responsibility Principle)
- 每个模块、类或函数只负责单一维度的业务逻辑；
- 避免产生体积庞大的“上帝文件”（God File），单文件尽量控制在 300~500 行以内；超过上限时，按职责拆分为独立的子模块。

### 1.2 依赖倒置与分层隔离 (Layered Isolation)
典型全栈分层结构：
```
[ 展现层 / UI / API Router ]
          │  (仅负责解析入参、调用服务与格式化输出)
          ▼
[ 领域层 / 业务逻辑服务 Service / Domain ]
          │  (纯业务算法、规则流转，无直接数据库/网络依赖)
          ▼
[ 基础设施层 / 数据访问 Repo / Storage / Network ]
          │  (数据库连接、文件读写、外部第三方 API 桥接)
```

### 1.3 强类型与契约先行 (Contract-First Design)
- 在编写业务代码前，优先定义类型接口（TypeScript `type/interface`、Rust `struct/enum`、Python `dataclass/Pydantic`）；
- 使用严格的输入参数校验（如 Zod、Serde、Pydantic），在边界层拦截非法数据。

---

## 2. 错误处理与防御性编程准则

1. **禁止裸吞异常**：
   - 严禁出现 `catch (e) {}` 或 `except: pass` 这种静默吞掉报错的写法；
   - 必须记录日志或包装为领域错误向上抛出。
2. **优雅降级与兜底**：
   - 在读取可选配置、外部网络调用或磁盘 IO 时，必须提供合理的默认值与超时熔断保护。
3. **安全与隐私防御**：
   - 任何涉及用户密码、秘钥或私有路径的信息，在落盘或回传给前端时必须执行脱敏过滤。
