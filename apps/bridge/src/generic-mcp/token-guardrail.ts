/**
 * Nexus Token Guardrail Engine (token-guardrail.ts)
 * 
 * Optimizes LLM context token usage through payload sanitization, image externalization, and bounded tool outputs:
 * 1. Image Payload Stripping: Intercepts Base64 image data (data URLs or JSON base64Data),
 *    saves them to persistent local files, and replaces them with clean file paths & metadata,
 *    reducing 30,000+ text tokens per screenshot down to ~50 tokens (99.8% token savings).
 * 2. Payload Bounding (Middle-Truncation): Caps long textual outputs (logs, DOMs, shell outputs)
 *    at safe limits (default 16,000 chars ~4,000 tokens) with clear truncation notices,
 *    preventing runaway loops from exploding the context window.
 * 3. Deep Sanitization: Recursively traverses structured objects and arrays.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface SanitizeOptions {
  maxChars?: number; // Default 16,000 chars (~4,000 tokens)
  saveScreenshots?: boolean; // Default true
  sourceTool?: string;
  full?: boolean;
  args?: Record<string, any>;
}

export interface HandleEntry {
  handleId: string;
  sourceTool: string;
  items: any[];
  createdAt: number;
}

export class HandleManager {
  private static handles: Map<string, HandleEntry> = new Map();

  public static createHandle(sourceTool: string, items: any[]): string {
    const handleId = `hnd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    this.handles.set(handleId, {
      handleId,
      sourceTool,
      items,
      createdAt: Date.now(),
    });
    if (this.handles.size > 150) {
      const oldestKey = this.handles.keys().next().value;
      if (oldestKey) this.handles.delete(oldestKey);
    }
    return handleId;
  }

  public static getHandle(handleId: string): HandleEntry | undefined {
    return this.handles.get(handleId);
  }

  public static readHandle(handleId: string, offset = 0, limit = 20, filter?: any): any {
    const entry = this.handles.get(handleId);
    if (!entry) {
      return { error: `Handle "${handleId}" not found or expired.` };
    }
    let list = entry.items;
    if (filter !== undefined && filter !== null && filter !== "") {
      if (typeof filter === "string") {
        const q = filter.trim().toLowerCase();
        if (q) {
          list = list.filter((item) => {
            if (typeof item === "string") return item.toLowerCase().includes(q);
            return JSON.stringify(item).toLowerCase().includes(q);
          });
        }
      } else if (typeof filter === "object" && !Array.isArray(filter)) {
        const filterEntries = Object.entries(filter);
        if (filterEntries.length === 0) {
          // empty object matches all
        } else {
          list = list.filter((item) => {
            if (!item || typeof item !== "object") return false;
            return filterEntries.every(([fk, fv]) => {
              const itemVal = item[fk];
              if (itemVal === undefined) return false;
              if (typeof fv === "string") {
                return String(itemVal).toLowerCase().includes(fv.toLowerCase());
              }
              if (typeof fv === "number" || typeof fv === "boolean") {
                return itemVal === fv || String(itemVal) === String(fv);
              }
              return JSON.stringify(itemVal) === JSON.stringify(fv);
            });
          });
        }
      } else {
        return {
          error: `Invalid filter argument type: ${typeof filter}. Filter must be a search string (e.g. '39871') or an object (e.g. { port: 39871 }). Correct usage: nexus_execute_action(tool='nexus_handle_read', arguments={handleId: '${handleId}', offset: 0, limit: 20, filter: { port: 39871 }})`,
        };
      }
    }
    const page = list.slice(offset, offset + limit);
    return {
      handleId,
      sourceTool: entry.sourceTool,
      totalCount: entry.items.length,
      filteredCount: list.length,
      offset,
      limit,
      hasMore: offset + limit < list.length,
      items: page,
    };
  }
}

export class TokenGuardrail {
  private static artifactsDir: string = "";

  /**
   * Resolves the persistent screenshot / image artifact directory
   */
  public static getArtifactsDir(): string {
    if (!this.artifactsDir) {
      const base =
        process.env.LOCALAPPDATA ||
        process.env.APPDATA ||
        path.join(process.env.USERPROFILE || process.env.HOME || os.tmpdir(), ".localbridge");
      this.artifactsDir = path.join(base, "LocalBridge", "artifacts", "screenshots");
      try {
        fs.mkdirSync(this.artifactsDir, { recursive: true });
      } catch {
        // Fallback to system temp
        this.artifactsDir = path.join(os.tmpdir(), "nexus-artifacts", "screenshots");
        try {
          fs.mkdirSync(this.artifactsDir, { recursive: true });
        } catch {}
      }
    }
    return this.artifactsDir;
  }

  /**
   * Strips Base64 images, writes them to disk, and applies middle-truncation on long text.
   */
  public static sanitizeText(rawText: string, options: SanitizeOptions = {}): string {
    if (!rawText || typeof rawText !== "string") return rawText;
    const maxChars = options.maxChars ?? 16000;

    let text = rawText;

    // 1. Intercept data URI images: data:image/png;base64,iVBORw0KGgo...
    const dataUriRegex = /data:image\/([a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=]{100,})/g;
    text = text.replace(dataUriRegex, (match, ext, b64Data) => {
      try {
        const buf = Buffer.from(b64Data, "base64");
        const cleanExt = (ext || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
        const fileName = `screenshot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${cleanExt || "png"}`;
        const filePath = path.join(this.getArtifactsDir(), fileName);
        fs.writeFileSync(filePath, buf);
        const savedKb = (buf.length / 1024).toFixed(1);
        const savedTokens = Math.round(b64Data.length / 4);
        return `[🖼️ 图片已成功保存至本地: ${filePath.replace(/\\/g, "/")} (${savedKb} KB) | 已自动脱敏 Base64 原始数据，为您节省约 ${savedTokens.toLocaleString()} 上下文 Token]`;
      } catch {
        return `[🖼️ 图片 Base64 已脱敏，节省约 ${Math.round(b64Data.length / 4)} Token]`;
      }
    });

    // 2. Intercept JSON field base64: "base64Data": "iVBORw0..." or "base64": "..."
    const jsonBase64Regex = /"(base64Data|base64|data)":\s*"([A-Za-z0-9+/=]{200,})"/g;
    text = text.replace(jsonBase64Regex, (match, key, b64Data) => {
      try {
        const buf = Buffer.from(b64Data, "base64");
        const fileName = `screenshot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.png`;
        const filePath = path.join(this.getArtifactsDir(), fileName);
        fs.writeFileSync(filePath, buf);
        const savedKb = (buf.length / 1024).toFixed(1);
        const savedTokens = Math.round(b64Data.length / 4);
        return `"${key}SavedPath": "${filePath.replace(/\\/g, "/")}", "${key}Notice": "已自动保存为本地文件 (${savedKb} KB)，剥离 Base64 节省约 ${savedTokens.toLocaleString()} Token"`;
      } catch {
        return `"${key}Notice": "Base64 数据已自动脱敏"`;
      }
    });

    // 3. Middle-truncation for long outputs (prevent context blowup)
    if (text.length > maxChars) {
      const headLength = Math.floor(maxChars * 0.55); // ~8,800 chars
      const tailLength = Math.floor(maxChars * 0.35); // ~5,600 chars
      const omitted = text.length - headLength - tailLength;
      if (omitted > 500) {
        const head = text.substring(0, headLength);
        const tail = text.substring(text.length - tailLength);
        const savedTokens = Math.round(omitted / 4);
        text = `${head}\n\n... [⚠️ Nexus Token Guardrail: 输出内容过长 (总计 ${text.length.toLocaleString()} 字符)，已自动截断中间 ${omitted.toLocaleString()} 字符以保护模型上下文 (为您节省约 ${savedTokens.toLocaleString()} Token)。如需完整数据请分块读取或重定向至文件] ...\n\n${tail}`;
      }
    }

    return text;
  }

  /**
   * Recursively sanitizes any JavaScript object / structuredContent
   */
  public static sanitizeObject(obj: any): any {
    if (!obj || typeof obj !== "object") return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item));
    }

    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string") {
        if ((k === "base64Data" || k === "base64" || k === "data") && v.length > 200) {
          try {
            const buf = Buffer.from(v, "base64");
            const fileName = `screenshot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.png`;
            const filePath = path.join(this.getArtifactsDir(), fileName);
            fs.writeFileSync(filePath, buf);
            result[`${k}SavedPath`] = filePath.replace(/\\/g, "/");
            result[`${k}Notice`] = `已保存至本地文件 (${(buf.length / 1024).toFixed(1)} KB)，已剥离 Base64 以保护 Token`;
            continue;
          } catch {}
        }
        result[k] = this.sanitizeText(v);
      } else if (typeof v === "object" && v !== null) {
        result[k] = this.sanitizeObject(v);
      } else {
        result[k] = v;
      }
    }
    return result;
  }

  /**
   * Checks if a tool belongs to list or snapshot whitelist for P1 handle-ization
   */
  public static isListOrSnapshotTool(toolName?: string, options?: SanitizeOptions): boolean {
    if (!toolName) return false;
    const name = toolName.toLowerCase();
    // Whitelist: port_list, process_list, browser_list, browser_snapshot, scene_hierarchy, hierarchy
    if (/port_list|process_list|browser_list|browser_snapshot|scene_hierarchy|hierarchy/i.test(name)) {
      return true;
    }
    // Script channel returning a structured list/snapshot (e.g. process list query)
    if (/run_script|script/i.test(name)) {
      const scriptCode = String((options as any)?.args?.script || "");
      if (/process|port|browser|hierarchy|psutil|tasklist/i.test(scriptCode)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Applies P1 handle-ization to list and snapshot payloads (BOTH content AND structuredContent)
   */
  public static applyHandleization(res: any, options: SanitizeOptions = {}): any {
    if (process.env.NEXUS_TOKEN_P1_ENABLED === "false") {
      return res;
    }

    const sourceTool = options.sourceTool || "";
    const isFull = Boolean(options.full || (options as any)?.args?.full);
    if (isFull) {
      return res; // full=true bypasses handle-ization
    }

    if (!this.isListOrSnapshotTool(sourceTool, options)) {
      return res; // Text and code tools are passthrough
    }

    // Extract list items from structuredContent or content
    let items: any[] | null = null;

    if (res.structuredContent) {
      if (Array.isArray(res.structuredContent)) {
        items = res.structuredContent;
      } else if (typeof res.structuredContent === "object") {
        for (const [k, v] of Object.entries(res.structuredContent)) {
          if (Array.isArray(v) && v.length > 5) {
            items = v;
            break;
          }
        }
      }
    }

    if (!items && typeof res.structuredContent?.stdout === "string") {
      try {
        const parsed = JSON.parse(res.structuredContent.stdout.trim());
        if (Array.isArray(parsed) && parsed.length > 5) {
          items = parsed;
        } else if (parsed && typeof parsed === "object") {
          for (const [k, v] of Object.entries(parsed)) {
            if (Array.isArray(v) && v.length > 5) {
              items = v;
              break;
            }
          }
        }
      } catch {}
    }

    if (!items && Array.isArray(res.content) && res.content[0]?.text) {
      try {
        const parsed = JSON.parse(res.content[0].text.trim());
        if (Array.isArray(parsed) && parsed.length > 5) {
          items = parsed;
        } else if (parsed && typeof parsed === "object") {
          for (const [k, v] of Object.entries(parsed)) {
            if (Array.isArray(v) && v.length > 5) {
              items = v;
              break;
            }
          }
        }
      } catch {}
    }

    if (!items || items.length <= 5) {
      return res; // Small lists do not need handle-ization
    }

    const displayTool = /run_script|script/i.test(sourceTool) ? "process_list" : sourceTool;
    const handleId = HandleManager.createHandle(displayTool, items);
    const sample = items.slice(0, 3);

    const copy = { ...res };

    // 1. Slim down structuredContent
    if (copy.structuredContent && typeof copy.structuredContent === "object") {
      const newSc: Record<string, any> = {
        handleId,
        sourceTool: displayTool,
        totalCount: items.length,
        sample,
        hasMore: true,
        notice: `已自动句柄化 (原包含 ${items.length} 条记录)。使用 nexus_execute_action(tool='nexus_handle_read', arguments={handleId: '${handleId}', offset: 0, limit: 20, filter: '关键词或{key:value}'}) 查阅详情，或传入 full=true 获取全量数据`,
      };
      // Retain scalar properties (e.g. browserSessionId, status, exitCode, etc.)
      for (const [k, v] of Object.entries(copy.structuredContent)) {
        if (k !== "stdout" && k !== "stderr" && k !== "rawStdout" && k !== "result" && (typeof v !== "object" || v === null)) {
          newSc[k] = v;
        }
      }
      copy.structuredContent = newSc;
    } else {
      copy.structuredContent = {
        handleId,
        sourceTool: displayTool,
        totalCount: items.length,
        sample,
        hasMore: true,
        notice: `已自动句柄化。使用 nexus_execute_action(tool='nexus_handle_read', arguments={handleId: '${handleId}', offset: 0, limit: 20, filter: '关键词或{key:value}'}) 分页查询`,
      };
    }

    // 2. Slim down content: single-channel deduplication (no duplicate sample in content)
    const summaryText = `[📦 句柄已生成] 工具: ${displayTool} | 共 ${items.length} 项记录已暂存。\n💡 调用指引: nexus_execute_action(tool='nexus_handle_read', arguments={handleId: '${handleId}', offset: 0, limit: 20, filter: '关键词或{key:value}'})\nfilter 参数支持字符串模糊检索 (如 filter: '39871') 或对象属性精确匹配 (如 filter: { port: 39871 })；若需全量数据请传入 full=true。`;
    copy.content = [{ type: "text", text: summaryText }];

    return copy;
  }

  /**
   * Sanitizes an entire MCP tool result { content, isError, structuredContent }
   */
  public static sanitizeToolResult(res: any, options: SanitizeOptions = {}): any {
    if (!res) return res;

    let copy = { ...res };

    // Apply P1 handle-ization on list and snapshot outputs FIRST before middle-truncation
    copy = this.applyHandleization(copy, options);

    if (Array.isArray(copy.content)) {
      copy.content = copy.content.map((item: any) => {
        if (item && item.type === "text" && typeof item.text === "string") {
          return {
            ...item,
            text: this.sanitizeText(item.text, options),
          };
        }
        return item;
      });
    }

    if (copy.structuredContent && typeof copy.structuredContent === "object") {
      copy.structuredContent = this.sanitizeObject(copy.structuredContent);
    }

    if (copy.result && typeof copy.result === "object") {
      copy.result = this.sanitizeObject(copy.result);
    }

    // P0: On error, compact structuredContent error details and tracebacks into a single-line summary
    if ((copy.isError || copy.structuredContent?.success === false || Boolean(copy.structuredContent?.error)) && process.env.NEXUS_TOKEN_P0_ENABLED !== "false") {
      if (copy.structuredContent && typeof copy.structuredContent === "object") {
        const sc = { ...copy.structuredContent };
        if (sc.error && typeof sc.error === "string") {
          const lines = sc.error.trim().split("\n").map((l: string) => l.trim()).filter(Boolean);
          sc.error = lines[lines.length - 1] || sc.error;
        }
        if (sc.stderr && typeof sc.stderr === "string") {
          const lines = sc.stderr.trim().split("\n").map((l: string) => l.trim()).filter(Boolean);
          sc.stderr = lines[lines.length - 1] || sc.stderr;
        }
        if (sc.stack) {
          delete sc.stack;
        }
        if (sc.traceback) {
          delete sc.traceback;
        }
        copy.structuredContent = sc;
      }
    }

    return copy;
  }
}
