import React, { useState } from "react";
import {
  FileText,
  Play,
  Copy,
  Check,
  Sparkles,
  Zap,
  Code2,
  FileCode2,
  Shield,
  Terminal,
  X,
  Loader2,
  Scissors,
  Wand2,
  Lock,
} from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation.js";

const BRIDGE_URL = "http://127.0.0.1:8787";

export const NexusAppsPage: React.FC = () => {
  const { language } = useTranslation();
  const isZh = language.startsWith("zh");

  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const copyToClipboard = (text: string, key = "default") => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast(isZh ? "已复制到剪贴板！" : "Copied to clipboard!");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // 1. Web to Markdown Reader State
  const [readerUrl, setReaderUrl] = useState("https://developer.mozilla.org/zh-CN/");
  const [isExtracting, setIsExtracting] = useState(false);
  const [readerResult, setReaderResult] = useState<{
    title: string;
    markdown: string;
    wordCount: number;
    estimatedTokens: number;
  } | null>(null);

  const handleExtractMarkdown = async () => {
    if (!readerUrl.trim()) return;
    setIsExtracting(true);
    setReaderResult(null);
    try {
      const res = await fetch(`${BRIDGE_URL}/api/nexus-reader/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: readerUrl.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setReaderResult({
          title: data.title,
          markdown: data.markdown,
          wordCount: data.wordCount,
          estimatedTokens: data.estimatedTokens,
        });
      } else {
        showToast(isZh ? `提纯失败: ${data.error}` : `Extraction failed: ${data.error}`);
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  // 2. Token Shrinker State
  const [shrinkInput, setShrinkInput] = useState(
    `function calculateSummary(payload) {\n  // Log telemetry\n  console.log("Analyzing payload...", payload);\n  \n  let sum = 0;\n  for (let i = 0; i < payload.length; i++) {\n    /* accumulate values */\n    sum += payload[i].value;\n  }\n  return { total: sum, count: payload.length };\n}`
  );
  const [shrinkMode, setShrinkMode] = useState<"code" | "text" | "json">("code");
  const [shrinkResult, setShrinkResult] = useState<{
    text: string;
    beforeTokens: number;
    afterTokens: number;
    savingPct: string;
  } | null>(null);

  const handleShrink = () => {
    if (!shrinkInput.trim()) return;
    let out = shrinkInput;
    if (shrinkMode === "code") {
      out = out.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, ""); // remove comments
      out = out.replace(/^\s*[\r\n]/gm, ""); // remove blank lines
      out = out.replace(/[ \t]+/g, " "); // collapse whitespace
    } else if (shrinkMode === "json") {
      try {
        const obj = JSON.parse(shrinkInput);
        out = JSON.stringify(obj);
      } catch {
        out = shrinkInput.replace(/\s+/g, " ").trim();
      }
    } else {
      out = out.replace(/\n\s*\n/g, "\n").replace(/[ \t]+/g, " ").trim();
    }
    const beforeTokens = Math.ceil(shrinkInput.length / 3.8);
    const afterTokens = Math.ceil(out.length / 3.8);
    const savingPct = (((beforeTokens - afterTokens) / Math.max(1, beforeTokens)) * 100).toFixed(1);
    setShrinkResult({
      text: out,
      beforeTokens,
      afterTokens,
      savingPct,
    });
  };

  // 3. Schema & Format Converter State
  const [schemaInput, setSchemaInput] = useState(
    JSON.stringify(
      {
        projectName: "Nexus Workspace",
        version: "1.3.0",
        sandbox: { enabled: true, loopback: "127.0.0.1", port: 8787 },
        activeProviders: ["blender", "photoshop", "autocad", "crawl4ai"],
      },
      null,
      2
    )
  );
  const [schemaOutput, setSchemaOutput] = useState("");
  const [schemaError, setSchemaError] = useState<string | null>(null);

  const handleFormatJson = () => {
    try {
      const obj = JSON.parse(schemaInput);
      setSchemaOutput(JSON.stringify(obj, null, 2));
      setSchemaError(null);
    } catch (e: any) {
      setSchemaError(e.message);
    }
  };

  const handleConvertYaml = () => {
    try {
      const obj = JSON.parse(schemaInput);
      const toYaml = (val: any, indent = 0): string => {
        const spaces = " ".repeat(indent);
        if (typeof val === "object" && val !== null) {
          if (Array.isArray(val)) {
            return val.map((x) => `${spaces}- ${toYaml(x, indent + 2).trimStart()}`).join("\n");
          }
          return Object.entries(val)
            .map(([k, v]) => {
              if (typeof v === "object" && v !== null) {
                return `${spaces}${k}:\n${toYaml(v, indent + 2)}`;
              }
              return `${spaces}${k}: ${toYaml(v, 0)}`;
            })
            .join("\n");
        }
        return JSON.stringify(val);
      };
      setSchemaOutput(toYaml(obj));
      setSchemaError(null);
    } catch (e: any) {
      setSchemaError(e.message);
    }
  };

  // 4. Prompt Studio State
  const [promptRole, setPromptRole] = useState("资深全栈架构师与自动化专家");
  const [promptTask, setPromptTask] = useState("审查代码并输出零缺陷重构方案，确保符合安全契约。");
  const [promptConstraints, setPromptConstraints] = useState("1. 严禁使用未声明的第三方库\n2. 严格保证异常捕获与零崩溃\n3. 返回纯净 Markdown，不输出多余废话");
  const [promptOutputSchema, setPromptOutputSchema] = useState("```json\n{\n  \"status\": \"APPROVED\",\n  \"suggestions\": [\"...\"]\n}\n```");

  const buildSystemPrompt = () => {
    return `# Role: ${promptRole}\n\n## Objective\n${promptTask}\n\n## Constraints & Policy\n${promptConstraints}\n\n## Expected Output Schema\n${promptOutputSchema}\n\n## Execution Rule\n严格遵循以上规则，零幻觉确定性交付。`;
  };

  // 5. Regex & Masker State
  const [regexText, setRegexText] = useState(
    "测试数据：手机号 [PHONE]，邮箱 [EMAIL]，API Key [REDACTED]，身份证 [ID]"
  );
  const [maskedText, setMaskedText] = useState("");

  const handleMaskData = () => {
    let t = regexText;
    // Mask phone numbers
    t = t.replace(/(1[3-9]\d)\d{4}(\d{4})/g, "$1****$2");
    // Mask ID cards
    t = t.replace(/(\d{6})\d{8}(\d{4})/g, "$1********$2");
    // Mask API Keys
    t = t.replace(/(sk-[a-zA-Z0-9]{4})[a-zA-Z0-9_-]{12,}([a-zA-Z0-9]{4})/g, "$1****************$2");
    // Mask emails
    t = t.replace(/([a-zA-Z0-9_.+-])[a-zA-Z0-9_.+-]+@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)/g, "$1***@$2");
    setMaskedText(t);
  };

  // 6. Script Runner State
  const [playgroundRuntime, setPlaygroundRuntime] = useState<"python" | "node">("python");
  const [playgroundCode, setPlaygroundCode] = useState(
    `import sys\nimport math\n\nprint(f"Python Engine running: {sys.version.split()[0]}")\nprint(f"Computed Pi: {math.pi:.6f}")\n`
  );
  const [playgroundOutput, setPlaygroundOutput] = useState("");
  const [isRunningScript, setIsRunningScript] = useState(false);

  const handleRunPlayground = async () => {
    setIsRunningScript(true);
    setPlaygroundOutput(isZh ? "正在通过本地隔离环境执行..." : "Executing via isolated runtime...");
    try {
      const res = await fetch(`${BRIDGE_URL}/api/mcp/managed/script/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runtime: playgroundRuntime,
          script: playgroundCode,
          timeoutMs: 15000,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPlaygroundOutput(data.stdout || (isZh ? "[执行成功，无标准输出返回]" : "[Execution successful, no output]"));
      } else {
        setPlaygroundOutput(`[Error: ${data.error || "Failed"}]\n${data.stderr || ""}`);
      }
    } catch (err: any) {
      setPlaygroundOutput(`[Network Error]: ${err.message}`);
    } finally {
      setIsRunningScript(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base overflow-hidden">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-4 right-6 z-50 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-medium shadow-2xl border border-sky-500/30 flex items-center gap-2 animate-fade-in">
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Header */}
      <div className="px-6 py-4 border-b border-theme-subtle bg-theme-card/30 flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-base font-semibold text-theme-primary flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-sky-500" />
            <span>{isZh ? "Nexus 专属应用中心" : "Nexus Dedicated Applications"}</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-500 border border-sky-500/20">
              Native Productivity Suite
            </span>
          </h1>
          <p className="text-xs text-theme-muted mt-0.5">
            {isZh
              ? "深度定制的本地高频生产力工具 • 原生环境与数据沙箱隔离 • 极致节省 Token 与辅助工程"
              : "Deeply tailored local productivity tools • Persistent sandboxes • Native engineering utilities"}
          </p>
        </div>
      </div>

      {/* Main Cards Grid */}
      <div className="flex-1 p-6 overflow-y-auto max-w-6xl w-full mx-auto space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* App 1: 极速网页转 Markdown 提纯器 */}
          <div className="rounded-xl border border-theme-subtle bg-theme-card p-5 flex flex-col justify-between hover:border-emerald-500/40 transition shadow-sm group">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20">
                  <FileText className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {isZh ? "就绪" : "Ready"}
                </span>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-theme-primary group-hover:text-emerald-400 transition">
                  {isZh ? "📄 极速网页转 Markdown 提纯器" : "📄 Web-to-Markdown Purifier"}
                </h2>
                <p className="text-xs text-theme-muted mt-1 leading-relaxed">
                  {isZh
                    ? "毫秒级脱水剥离杂乱 HTML 与广告弹窗，一键提纯适合大模型上下文的高保真 Markdown。"
                    : "Strip junk HTML and ads in milliseconds to produce ultra-clean LLM Markdown."}
                </p>
              </div>

              <div className="space-y-1.5 pt-1 text-xs text-theme-secondary">
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>{isZh ? "零 Token 浪费，广告标签全脱水" : "Zero token waste, ads stripped"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                  <span>{isZh ? "1 秒将任意网页转纯净 Markdown" : "Instant 1-second extraction"}</span>
                </div>
              </div>
            </div>

            <div className="pt-4 mt-3 border-t border-theme-subtle/50">
              <button
                type="button"
                onClick={() => setActiveModal("reader")}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium transition shadow-xs"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{isZh ? "打开提纯器工作台" : "Open Purifier Workbench"}</span>
              </button>
            </div>
          </div>

          {/* App 2: Token 极致压缩与上下文精炼器 */}
          <div className="rounded-xl border border-theme-subtle bg-theme-card p-5 flex flex-col justify-between hover:border-amber-500/40 transition shadow-sm group">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center border border-amber-500/20">
                  <Scissors className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  {isZh ? "节省 60%+" : "Save 60%+"}
                </span>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-theme-primary group-hover:text-amber-400 transition">
                  {isZh ? "⚡ Token 极致压缩与上下文精炼器" : "⚡ Token Shrinker & Context Minifier"}
                </h2>
                <p className="text-xs text-theme-muted mt-1 leading-relaxed">
                  {isZh
                    ? "剔除多余空白、冗余注释与格式化缩进，以最精简的语义体积喂给大模型，节省 50%~80% 消耗。"
                    : "Strip whitespaces, comments, and redundant indents to feed LLMs with minimum context tokens."}
                </p>
              </div>

              <div className="space-y-1.5 pt-1 text-xs text-theme-secondary">
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>{isZh ? "代码/JSON/Prompt 多模态脱水" : "Code/JSON/Prompt multi-mode dehydration"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>{isZh ? "实时预估 Token 减少量" : "Realtime token saving percentage preview"}</span>
                </div>
              </div>
            </div>

            <div className="pt-4 mt-3 border-t border-theme-subtle/50">
              <button
                type="button"
                onClick={() => setActiveModal("shrink")}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium transition shadow-xs"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>{isZh ? "打开 Token 精炼器" : "Open Token Shrinker"}</span>
              </button>
            </div>
          </div>

          {/* App 3: 架构校验与格式转换器 */}
          <div className="rounded-xl border border-theme-subtle bg-theme-card p-5 flex flex-col justify-between hover:border-sky-500/40 transition shadow-sm group">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center border border-sky-500/20">
                  <Code2 className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                  JSON / YAML
                </span>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-theme-primary group-hover:text-sky-400 transition">
                  {isZh ? "🛠️ JSON / YAML 智能转换与校验器" : "🛠️ Schema Studio & Formatter"}
                </h2>
                <p className="text-xs text-theme-muted mt-1 leading-relaxed">
                  {isZh
                    ? "提供双向 JSON/YAML 校验、美化排版与结构转换，一键修复转义错误与无效字符。"
                    : "Bi-directional JSON/YAML validation, beautifier formatting and escape error fixing."}
                </p>
              </div>

              <div className="space-y-1.5 pt-1 text-xs text-theme-secondary">
                <div className="flex items-center gap-2">
                  <FileCode2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span>{isZh ? "结构化配置零损无缝互转" : "Lossless config format transformations"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{isZh ? "语法严格高亮与错误定位" : "Syntax error locating & linting"}</span>
                </div>
              </div>
            </div>

            <div className="pt-4 mt-3 border-t border-theme-subtle/50">
              <button
                type="button"
                onClick={() => setActiveModal("schema")}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium transition shadow-xs"
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>{isZh ? "打开格式转换工坊" : "Open Schema Studio"}</span>
              </button>
            </div>
          </div>

          {/* App 4: 结构化提示词工坊 */}
          <div className="rounded-xl border border-theme-subtle bg-theme-card p-5 flex flex-col justify-between hover:border-purple-500/40 transition shadow-sm group">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20">
                  <Wand2 className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                  Engineering
                </span>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-theme-primary group-hover:text-purple-400 transition">
                  {isZh ? "🎨 Prompt 结构化提示词工坊" : "🎨 Prompt Engineering Studio"}
                </h2>
                <p className="text-xs text-theme-muted mt-1 leading-relaxed">
                  {isZh
                    ? "模块化拼装工业级 System Prompt：角色定义、目标、硬性约束、Few-shot 与 JSON Schema 输出约束。"
                    : "Assemble production-grade System Prompts: roles, constraints, few-shot examples and schema contracts."}
                </p>
              </div>

              <div className="space-y-1.5 pt-1 text-xs text-theme-secondary">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span>{isZh ? "消除模型模糊输出与格式违规" : "Eliminate format hallucinations"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{isZh ? "一键生成标准工程级 Prompt" : "One-click copy production ready prompts"}</span>
                </div>
              </div>
            </div>

            <div className="pt-4 mt-3 border-t border-theme-subtle/50">
              <button
                type="button"
                onClick={() => setActiveModal("prompt")}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-xs font-medium transition shadow-xs"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>{isZh ? "打开提示词工坊" : "Open Prompt Studio"}</span>
              </button>
            </div>
          </div>

          {/* App 5: 敏感信息脱敏与正则沙箱 */}
          <div className="rounded-xl border border-theme-subtle bg-theme-card p-5 flex flex-col justify-between hover:border-rose-500/40 transition shadow-sm group">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center border border-rose-500/20">
                  <Lock className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  Security
                </span>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-theme-primary group-hover:text-rose-400 transition">
                  {isZh ? "🔒 敏感信息脱敏与文本清洗沙箱" : "🔒 Sensitive Data Masker & Sanitizer"}
                </h2>
                <p className="text-xs text-theme-muted mt-1 leading-relaxed">
                  {isZh
                    ? "在向公网大模型发送上下文前，一键脱敏手机号、邮箱、身份证与 API Key 凭证，防止数据泄密。"
                    : "Sanitize API keys, phones, IDs, and emails before sending context to public LLMs."}
                </p>
              </div>

              <div className="space-y-1.5 pt-1 text-xs text-theme-secondary">
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span>{isZh ? "手机/邮箱/Key/身份证自动识别打码" : "Auto regex matching & token masking"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{isZh ? "本地完全离线处理，绝不上云" : "100% offline local processing"}</span>
                </div>
              </div>
            </div>

            <div className="pt-4 mt-3 border-t border-theme-subtle/50">
              <button
                type="button"
                onClick={() => setActiveModal("masker")}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-medium transition shadow-xs"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{isZh ? "打开安全脱敏沙箱" : "Open Security Masker"}</span>
              </button>
            </div>
          </div>

          {/* App 6: 本地脚本与代码执行沙箱 */}
          <div className="rounded-xl border border-theme-subtle bg-theme-card p-5 flex flex-col justify-between hover:border-indigo-500/40 transition shadow-sm group">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
                  <Terminal className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  uv / Node.js
                </span>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-theme-primary group-hover:text-indigo-400 transition">
                  {isZh ? "💻 本地脚本与代码执行沙箱" : "💻 Local Script Execution Sandbox"}
                </h2>
                <p className="text-xs text-theme-muted mt-1 leading-relaxed">
                  {isZh
                    ? "基于 Nexus 封装的独立 Python (uv) 与 Node.js 内核，随时运行并验证小段脚本逻辑。"
                    : "Directly execute and verify Python (uv) or JS code snippets via isolated local kernel."}
                </p>
              </div>

              <div className="space-y-1.5 pt-1 text-xs text-theme-secondary">
                <div className="flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>{isZh ? "免配环境变量，内置 uv 原生驱动" : "Zero config, driven by bundled uv"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>{isZh ? "毫秒级响应，实时捕获标准输出" : "Millisecond response & stdout capture"}</span>
                </div>
              </div>
            </div>

            <div className="pt-4 mt-3 border-t border-theme-subtle/50">
              <button
                type="button"
                onClick={() => setActiveModal("playground")}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium transition shadow-xs"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>{isZh ? "打开脚本沙箱" : "Open Script Playground"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal 1: 网页提纯器 */}
      {activeModal === "reader" && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-theme-card border border-theme-subtle rounded-2xl max-w-3xl w-full flex flex-col max-h-[85vh] shadow-2xl overflow-hidden animate-scale-up">
            <div className="px-6 py-4 border-b border-theme-subtle flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-500" />
                <h3 className="font-semibold text-sm text-theme-primary">
                  {isZh ? "网页转 Markdown 提纯器" : "Web-to-Markdown Purifier"}
                </h3>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-1 rounded-lg text-theme-muted hover:text-theme-primary">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={readerUrl}
                  onChange={(e) => setReaderUrl(e.target.value)}
                  placeholder="https://example.com/article"
                  className="flex-1 px-3 py-2 rounded-lg bg-theme-base border border-theme-subtle text-xs text-theme-primary focus:outline-hidden focus:border-emerald-500"
                />
                <button
                  onClick={handleExtractMarkdown}
                  disabled={isExtracting}
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  {isExtracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                  <span>{isZh ? "开始提纯" : "Extract"}</span>
                </button>
              </div>

              {readerResult && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between bg-theme-base/60 p-3 rounded-lg border border-theme-subtle/50 text-xs text-theme-muted">
                    <div>
                      <span className="font-medium text-theme-primary">{readerResult.title}</span>
                    </div>
                    <div className="flex items-center gap-3 font-mono text-[11px]">
                      <span>{readerResult.wordCount} 字</span>
                      <span>&bull;</span>
                      <span className="text-emerald-400">~{readerResult.estimatedTokens} Tokens</span>
                    </div>
                  </div>

                  <div className="relative">
                    <textarea
                      readOnly
                      rows={12}
                      value={readerResult.markdown}
                      className="w-full p-3 rounded-lg bg-theme-base border border-theme-subtle font-mono text-xs text-theme-secondary focus:outline-hidden leading-relaxed"
                    />
                    <div className="absolute top-2 right-2 flex items-center gap-2">
                      <button
                        onClick={() => copyToClipboard(readerResult.markdown, "reader")}
                        className="px-2 py-1 rounded bg-theme-card/80 border border-theme-subtle text-[11px] text-theme-primary hover:bg-theme-card transition flex items-center gap-1 shadow-xs"
                      >
                        {copiedKey === "reader" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{isZh ? "复制 Markdown" : "Copy"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Token 精炼器 */}
      {activeModal === "shrink" && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-theme-card border border-theme-subtle rounded-2xl max-w-3xl w-full flex flex-col max-h-[85vh] shadow-2xl overflow-hidden animate-scale-up">
            <div className="px-6 py-4 border-b border-theme-subtle flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scissors className="w-5 h-5 text-amber-500" />
                <h3 className="font-semibold text-sm text-theme-primary">
                  {isZh ? "Token 极致压缩与上下文精炼器" : "Token Shrinker & Context Minifier"}
                </h3>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-1 rounded-lg text-theme-muted hover:text-theme-primary">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-theme-muted">{isZh ? "脱水模式:" : "Mode:"}</span>
                <button
                  onClick={() => setShrinkMode("code")}
                  className={`px-2.5 py-1 rounded text-xs transition ${
                    shrinkMode === "code" ? "bg-amber-500 text-white font-semibold" : "bg-theme-base border border-theme-subtle text-theme-muted"
                  }`}
                >
                  Code (剥离注释/空行)
                </button>
                <button
                  onClick={() => setShrinkMode("json")}
                  className={`px-2.5 py-1 rounded text-xs transition ${
                    shrinkMode === "json" ? "bg-amber-500 text-white font-semibold" : "bg-theme-base border border-theme-subtle text-theme-muted"
                  }`}
                >
                  JSON (紧凑无空格)
                </button>
                <button
                  onClick={() => setShrinkMode("text")}
                  className={`px-2.5 py-1 rounded text-xs transition ${
                    shrinkMode === "text" ? "bg-amber-500 text-white font-semibold" : "bg-theme-base border border-theme-subtle text-theme-muted"
                  }`}
                >
                  Prompt 文本 (去多余换行)
                </button>
                <div className="flex-1" />
                <button
                  onClick={handleShrink}
                  className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Scissors className="w-3.5 h-3.5" />
                  <span>{isZh ? "一键脱水" : "Shrink Now"}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="text-xs text-theme-muted font-medium">{isZh ? "原始输入:" : "Original Input:"}</div>
                  <textarea
                    rows={10}
                    value={shrinkInput}
                    onChange={(e) => setShrinkInput(e.target.value)}
                    className="w-full p-3 rounded-lg bg-theme-base border border-theme-subtle font-mono text-xs text-theme-secondary focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs text-theme-muted font-medium flex items-center justify-between">
                    <span>{isZh ? "脱水结果:" : "Dehydrated Output:"}</span>
                    {shrinkResult && (
                      <span className="text-emerald-400 font-mono text-[11px]">
                        {shrinkResult.beforeTokens} → {shrinkResult.afterTokens} Token (-{shrinkResult.savingPct}%)
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <textarea
                      readOnly
                      rows={10}
                      value={shrinkResult?.text || ""}
                      placeholder={isZh ? "点击上方【一键脱水】开始处理..." : "Click Shrink Now to process..."}
                      className="w-full p-3 rounded-lg bg-theme-base border border-theme-subtle font-mono text-xs text-emerald-400 focus:outline-hidden"
                    />
                    {shrinkResult && (
                      <button
                        onClick={() => copyToClipboard(shrinkResult.text, "shrink")}
                        className="absolute top-2 right-2 px-2 py-1 rounded bg-theme-card/80 border border-theme-subtle text-[11px] text-theme-primary hover:bg-theme-card transition flex items-center gap-1 shadow-xs"
                      >
                        {copiedKey === "shrink" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{isZh ? "复制精炼文本" : "Copy"}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Schema 工坊 */}
      {activeModal === "schema" && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-theme-card border border-theme-subtle rounded-2xl max-w-3xl w-full flex flex-col max-h-[85vh] shadow-2xl overflow-hidden animate-scale-up">
            <div className="px-6 py-4 border-b border-theme-subtle flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 className="w-5 h-5 text-sky-500" />
                <h3 className="font-semibold text-sm text-theme-primary">
                  {isZh ? "JSON / YAML 智能转换与校验器" : "Schema Studio & Formatter"}
                </h3>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-1 rounded-lg text-theme-muted hover:text-theme-primary">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleFormatJson}
                  className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold flex items-center gap-1 transition"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>{isZh ? "格式化 JSON" : "Format JSON"}</span>
                </button>
                <button
                  onClick={handleConvertYaml}
                  className="px-3 py-1.5 rounded-lg bg-theme-base hover:bg-theme-card border border-theme-subtle text-theme-primary text-xs font-semibold flex items-center gap-1 transition"
                >
                  <FileCode2 className="w-3.5 h-3.5" />
                  <span>{isZh ? "转换为 YAML" : "Convert to YAML"}</span>
                </button>
                {schemaError && <span className="text-xs text-rose-400 font-mono">⚠️ {schemaError}</span>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <textarea
                  rows={12}
                  value={schemaInput}
                  onChange={(e) => setSchemaInput(e.target.value)}
                  className="w-full p-3 rounded-lg bg-theme-base border border-theme-subtle font-mono text-xs text-theme-secondary focus:outline-hidden"
                />
                <div className="relative">
                  <textarea
                    readOnly
                    rows={12}
                    value={schemaOutput}
                    placeholder={isZh ? "转换结果将实时显示在此处..." : "Output will appear here..."}
                    className="w-full p-3 rounded-lg bg-theme-base border border-theme-subtle font-mono text-xs text-sky-400 focus:outline-hidden"
                  />
                  {schemaOutput && (
                    <button
                      onClick={() => copyToClipboard(schemaOutput, "schema")}
                      className="absolute top-2 right-2 px-2 py-1 rounded bg-theme-card/80 border border-theme-subtle text-[11px] text-theme-primary hover:bg-theme-card transition flex items-center gap-1 shadow-xs"
                    >
                      {copiedKey === "schema" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{isZh ? "复制结果" : "Copy"}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Prompt 工坊 */}
      {activeModal === "prompt" && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-theme-card border border-theme-subtle rounded-2xl max-w-3xl w-full flex flex-col max-h-[85vh] shadow-2xl overflow-hidden animate-scale-up">
            <div className="px-6 py-4 border-b border-theme-subtle flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-purple-400" />
                <h3 className="font-semibold text-sm text-theme-primary">
                  {isZh ? "Prompt 结构化提示词工坊" : "Prompt Engineering Studio"}
                </h3>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-1 rounded-lg text-theme-muted hover:text-theme-primary">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-theme-muted block mb-1">1. 角色设定 (Role)</label>
                  <input
                    type="text"
                    value={promptRole}
                    onChange={(e) => setPromptRole(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-theme-base border border-theme-subtle text-xs text-theme-primary"
                  />
                </div>
                <div>
                  <label className="text-xs text-theme-muted block mb-1">2. 核心目标 (Objective)</label>
                  <input
                    type="text"
                    value={promptTask}
                    onChange={(e) => setPromptTask(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-theme-base border border-theme-subtle text-xs text-theme-primary"
                  />
                </div>
                <div>
                  <label className="text-xs text-theme-muted block mb-1">3. 负向约束与契约 (Constraints)</label>
                  <textarea
                    rows={3}
                    value={promptConstraints}
                    onChange={(e) => setPromptConstraints(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-theme-base border border-theme-subtle text-xs text-theme-primary"
                  />
                </div>
                <div>
                  <label className="text-xs text-theme-muted block mb-1">4. 输出格式与规范 (Output Schema)</label>
                  <textarea
                    rows={3}
                    value={promptOutputSchema}
                    onChange={(e) => setPromptOutputSchema(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-theme-base border border-theme-subtle text-xs text-theme-primary font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-theme-subtle/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-theme-primary">拼装成型的 System Prompt:</span>
                  <button
                    onClick={() => copyToClipboard(buildSystemPrompt(), "prompt")}
                    className="px-2.5 py-1 rounded bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold transition flex items-center gap-1"
                  >
                    {copiedKey === "prompt" ? <Check className="w-3 h-3 text-white" /> : <Copy className="w-3 h-3" />}
                    <span>{isZh ? "复制完整 Prompt" : "Copy Prompt"}</span>
                  </button>
                </div>
                <textarea
                  readOnly
                  rows={6}
                  value={buildSystemPrompt()}
                  className="w-full p-3 rounded-lg bg-theme-base border border-theme-subtle font-mono text-xs text-purple-300 leading-relaxed"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 5: 脱敏沙箱 */}
      {activeModal === "masker" && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-theme-card border border-theme-subtle rounded-2xl max-w-3xl w-full flex flex-col max-h-[85vh] shadow-2xl overflow-hidden animate-scale-up">
            <div className="px-6 py-4 border-b border-theme-subtle flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-rose-500" />
                <h3 className="font-semibold text-sm text-theme-primary">
                  {isZh ? "敏感信息脱敏与文本清洗沙箱" : "Sensitive Data Masker"}
                </h3>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-1 rounded-lg text-theme-muted hover:text-theme-primary">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-theme-muted">
                  {isZh ? "自动匹配打码: 手机号 (11位)、身份证、邮箱地址、API Key 密钥" : "Auto mask: phones, IDs, emails, API keys"}
                </span>
                <button
                  onClick={handleMaskData}
                  className="px-4 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{isZh ? "执行一键脱敏" : "Mask Sensitive Data"}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <textarea
                  rows={10}
                  value={regexText}
                  onChange={(e) => setRegexText(e.target.value)}
                  placeholder={isZh ? "在此粘贴待脱敏的文本内容..." : "Paste raw text here..."}
                  className="w-full p-3 rounded-lg bg-theme-base border border-theme-subtle font-mono text-xs text-theme-secondary focus:outline-hidden"
                />
                <div className="relative">
                  <textarea
                    readOnly
                    rows={10}
                    value={maskedText}
                    placeholder={isZh ? "脱敏处理后的安全文本将在此显示..." : "Masked text will appear here..."}
                    className="w-full p-3 rounded-lg bg-theme-base border border-theme-subtle font-mono text-xs text-rose-300 focus:outline-hidden"
                  />
                  {maskedText && (
                    <button
                      onClick={() => copyToClipboard(maskedText, "masker")}
                      className="absolute top-2 right-2 px-2 py-1 rounded bg-theme-card/80 border border-theme-subtle text-[11px] text-theme-primary hover:bg-theme-card transition flex items-center gap-1 shadow-xs"
                    >
                      {copiedKey === "masker" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{isZh ? "复制脱敏文本" : "Copy"}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 6: 脚本沙箱 */}
      {activeModal === "playground" && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-theme-card border border-theme-subtle rounded-2xl max-w-3xl w-full flex flex-col max-h-[85vh] shadow-2xl overflow-hidden animate-scale-up">
            <div className="px-6 py-4 border-b border-theme-subtle flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-indigo-400" />
                <h3 className="font-semibold text-sm text-theme-primary">
                  {isZh ? "本地安全脚本测试沙箱" : "Local Script Playground"}
                </h3>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-1 rounded-lg text-theme-muted hover:text-theme-primary">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-theme-muted">{isZh ? "运行环境:" : "Runtime:"}</span>
                  <button
                    onClick={() => setPlaygroundRuntime("python")}
                    className={`px-2.5 py-1 rounded text-xs transition ${
                      playgroundRuntime === "python" ? "bg-indigo-500 text-white font-semibold" : "bg-theme-base border border-theme-subtle text-theme-muted"
                    }`}
                  >
                    Python (uv)
                  </button>
                  <button
                    onClick={() => setPlaygroundRuntime("node")}
                    className={`px-2.5 py-1 rounded text-xs transition ${
                      playgroundRuntime === "node" ? "bg-indigo-500 text-white font-semibold" : "bg-theme-base border border-theme-subtle text-theme-muted"
                    }`}
                  >
                    Node.js
                  </button>
                </div>
                <button
                  onClick={handleRunPlayground}
                  disabled={isRunningScript}
                  className="px-4 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  {isRunningScript ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                  <span>{isZh ? "运行代码" : "Run Script"}</span>
                </button>
              </div>

              <textarea
                rows={8}
                value={playgroundCode}
                onChange={(e) => setPlaygroundCode(e.target.value)}
                className="w-full p-3 rounded-lg bg-theme-base border border-theme-subtle font-mono text-xs text-indigo-300 focus:outline-hidden"
              />

              <div className="space-y-1">
                <span className="text-xs text-theme-muted font-medium">{isZh ? "终端标准输出 (stdout/stderr):" : "Console Output:"}</span>
                <textarea
                  readOnly
                  rows={6}
                  value={playgroundOutput}
                  placeholder={isZh ? "等待执行..." : "Awaiting execution..."}
                  className="w-full p-3 rounded-lg bg-slate-950 border border-theme-subtle/80 font-mono text-xs text-emerald-400 focus:outline-hidden"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
