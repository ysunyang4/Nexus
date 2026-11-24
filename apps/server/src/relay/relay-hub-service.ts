import fs from "node:fs";
import path from "node:path";
import type { WebSocket } from "ws";

export interface RelayNodeInfo {
  nodeId: string;
  displayName: string;
  status: "ONLINE" | "STANDBY" | "OFFLINE";
  bestFor: string;
  url?: string;
  title?: string;
}

export interface RelayConfig {
  enabled: boolean;
  authorityMode: "auto" | "manual"; // "auto" (Claude 自动决断) | "manual" (用户强管控)
  allowAiResponseReturn: boolean; // 是否允许回传 AI 答案 (仅用户强管控下生效)
  stripThinking: boolean; // 深度思考链自动剥离 (DeepSeek/Kimi)
  gptFileSaving: {
    enabled: boolean;
    outputDir: string;
    codeBlockOnly: boolean;
    detachSeconds: number; // 默认 10 秒即发即弃脱钩
  };
}

export interface DispatchResult {
  status: string;
  text: string;
  detached?: boolean;
}

export class RelayHubService {
  private static instance: RelayHubService;
  private settingsFilePath: string;
  private connectedClients: Set<WebSocket> = new Set();
  private pendingRequests: Map<
    string,
    {
      resolve: (res: any) => void;
      reject: (err: any) => void;
      timer: NodeJS.Timeout;
      detachTimer?: NodeJS.Timeout;
      nodeId?: string;
      customPath?: string;
      detached?: boolean;
      startTime?: number;
    }
  > = new Map();
  private lastDiscoveredNodes: RelayNodeInfo[] = [];

  private config: RelayConfig = {
    enabled: true,
    authorityMode: "auto",
    allowAiResponseReturn: true,
    stripThinking: true,
    gptFileSaving: {
      enabled: true,
      outputDir: "E:\\workspace\\output\\ai_generated",
      codeBlockOnly: true,
      detachSeconds: 10,
    },
  };

  constructor() {
    const localAppData =
      process.env.LOCALAPPDATA ||
      (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Local") : "C:\\AppData\\Local");
    const dir = path.join(localAppData, "Nexus");
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {}
    }
    this.settingsFilePath = path.join(dir, "relay_gateway_settings.json");
    this.loadSettings();
  }

  public static getInstance(): RelayHubService {
    if (!RelayHubService.instance) {
      RelayHubService.instance = new RelayHubService();
    }
    return RelayHubService.instance;
  }

  private loadSettings(): void {
    try {
      if (fs.existsSync(this.settingsFilePath)) {
        const raw = fs.readFileSync(this.settingsFilePath, "utf8");
        const parsed = JSON.parse(raw);
        if (typeof parsed.enabled === "boolean") {
          this.config.enabled = parsed.enabled;
        }
        if (parsed.authorityMode === "auto" || parsed.authorityMode === "manual") {
          this.config.authorityMode = parsed.authorityMode;
        }
        if (typeof parsed.allowAiResponseReturn === "boolean") {
          this.config.allowAiResponseReturn = parsed.allowAiResponseReturn;
        }
        if (typeof parsed.stripThinking === "boolean") {
          this.config.stripThinking = parsed.stripThinking;
        }
        if (parsed.gptFileSaving && typeof parsed.gptFileSaving === "object") {
          this.config.gptFileSaving = {
            ...this.config.gptFileSaving,
            ...parsed.gptFileSaving,
          };
        }
      }
    } catch {}
  }

  private saveSettings(): void {
    try {
      fs.writeFileSync(
        this.settingsFilePath,
        JSON.stringify({ ...this.config, updatedAt: new Date().toISOString() }, null, 2),
        "utf8"
      );
    } catch {}
  }

  public isEnabled(): boolean {
    return this.config.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    this.saveSettings();
    this.broadcastState();
  }

  public getConfig(): RelayConfig {
    return { ...this.config };
  }

  public updateConfig(patch: Partial<RelayConfig>): RelayConfig {
    if (typeof patch.enabled === "boolean") {
      this.config.enabled = patch.enabled;
    }
    if (patch.authorityMode === "auto" || patch.authorityMode === "manual") {
      this.config.authorityMode = patch.authorityMode;
    }
    if (typeof patch.allowAiResponseReturn === "boolean") {
      this.config.allowAiResponseReturn = patch.allowAiResponseReturn;
    }
    if (typeof patch.stripThinking === "boolean") {
      this.config.stripThinking = patch.stripThinking;
    }
    if (patch.gptFileSaving && typeof patch.gptFileSaving === "object") {
      this.config.gptFileSaving = {
        ...this.config.gptFileSaving,
        ...patch.gptFileSaving,
      };
    }
    this.saveSettings();
    this.broadcastState();
    return this.getConfig();
  }

  private broadcastState(): void {
    const payload = JSON.stringify({ type: "GATEWAY_STATE_CHANGED", enabled: this.config.enabled, config: this.config });
    for (const client of this.connectedClients) {
      if (client.readyState === 1) {
        try {
          client.send(payload);
        } catch {}
      }
    }
  }

  public registerClient(ws: WebSocket): void {
    this.connectedClients.add(ws);

    try {
      ws.send(JSON.stringify({ type: "GATEWAY_STATE_CHANGED", enabled: this.config.enabled, config: this.config }));
      ws.send(JSON.stringify({ type: "DISCOVER_NODES", requestId: "hub_sync_" + Date.now() }));
    } catch {}

    ws.on("close", () => {
      this.connectedClients.delete(ws);
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleClientMessage(msg);
      } catch {}
    });
  }

  private handleClientMessage(msg: any): void {
    if (msg.type === "NODES_DISCOVERED") {
      if (Array.isArray(msg.nodes)) {
        this.lastDiscoveredNodes = msg.nodes;
      }
      if (msg.requestId) {
        const pending = this.pendingRequests.get(msg.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(msg.requestId);
          pending.resolve(this.lastDiscoveredNodes);
        }
      }
    } else if (msg.type === "TASK_KEEPALIVE" && msg.requestId) {
      const pending = this.pendingRequests.get(msg.requestId);
      if (pending) {
        // Refresh keepalive timer for background activity tracking without touching detachTimer
        clearTimeout(pending.timer);
        pending.timer = setTimeout(() => {
          this.pendingRequests.delete(msg.requestId);
          if (!pending.detached) {
            pending.reject(new Error(`上游推理节点 [${pending.nodeId || "unknown"}] 响应超时 (超时上限已达)`));
          }
        }, 60000);
      }
    } else if (msg.type === "TASK_RESULT" && msg.requestId) {
      const pending = this.pendingRequests.get(msg.requestId);

      // Background handling for GPT file auto-saving (even if already detached from Claude)
      if (msg.success && msg.content && (msg.nodeId === "gpt-omni" || pending?.nodeId === "gpt-omni")) {
        this.saveGptGeneratedFile(msg.content, pending?.customPath);
      }

      if (pending) {
        if (pending.detachTimer) {
          clearTimeout(pending.detachTimer);
        }
        clearTimeout(pending.timer);
        this.pendingRequests.delete(msg.requestId);

        if (pending.detached) {
          // Already resolved and returned to Claude at detach point; don't double-resolve
          return;
        }

        if (msg.node_not_open) {
          // Graceful skip if the tab is not open
          pending.resolve({
            status: "SKIPPED_NOT_OPEN",
            text: msg.error || `【跳过提示】检测到 [${pending.nodeId}] 网页端尚未在 Edge 中打开。为确保任务流程顺畅，本次已自动为您跳过该节点执行。如需使用该模型，请在 Edge 浏览器中打开对应官网并登录。`,
          });
          return;
        }

        if (msg.success) {
          let cleanedContent = msg.content || "";
          if (this.config.stripThinking) {
            cleanedContent = this.stripThinking(cleanedContent);
          }

          if (this.config.authorityMode === "manual" && !this.config.allowAiResponseReturn) {
            pending.resolve({
              status: "COMPLETED_SILENT",
              text: `【执行已完成】[${pending.nodeId}] 已在后台完成推理。根据用户强管控规则，已拦截长文本回传（零 Token 消耗）。`,
            });
            return;
          }

          pending.resolve({
            status: "COMPLETED",
            text: cleanedContent,
          });
        } else {
          // If error indicates node tab missing, graceful skip
          if (msg.error && (msg.error.includes("未在 Edge 浏览器中打开") || msg.error.includes("not open"))) {
            pending.resolve({
              status: "SKIPPED_NOT_OPEN",
              text: `【跳过提示】检测到 [${pending.nodeId}] 网页端尚未在 Edge 中打开。为确保任务连续性，本次已自动为您跳过该节点执行。如需使用该模型，请在 Edge 浏览器中打开对应官网并登录。`,
            });
            return;
          }
          pending.reject(new Error(msg.error || "任务执行失败"));
        }
      }
    }
  }

  public stripThinking(text: string): string {
    if (!text) return "";
    let clean = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
    clean = clean.replace(/\[thinking\][\s\S]*?\[\/thinking\]/gi, "");
    clean = clean.replace(/:::thinking[\s\S]*?:::/gi, "");
    clean = clean.replace(/【思考过程】[\s\S]*?【思考结束】/gi, "");
    return clean.trim();
  }

  public saveGptGeneratedFile(rawContent: string, customPath?: string): string {
    try {
      const outputDir = this.config.gptFileSaving.outputDir || "E:\\workspace\\output\\ai_generated";
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      let fileContent = rawContent;
      let ext = "txt";

      if (this.config.gptFileSaving.codeBlockOnly) {
        const codeBlockRegex = /```([a-zA-Z0-9_\-]+)?\s*([\s\S]*?)```/g;
        const matches: string[] = [];
        let match;
        let detectedLang = "";
        while ((match = codeBlockRegex.exec(rawContent)) !== null) {
          if (!detectedLang && match[1]) {
            detectedLang = match[1].trim().toLowerCase();
          }
          if (match[2]) {
            matches.push(match[2].trim());
          }
        }

        if (matches.length > 0) {
          fileContent = matches.join("\n\n// ---- NEXT CODE BLOCK ----\n\n");
          if (detectedLang) {
            const extMap: Record<string, string> = {
              python: "py", py: "py",
              javascript: "js", js: "js",
              typescript: "ts", ts: "ts",
              html: "html", css: "css",
              json: "json",
              c: "c", cpp: "cpp", cs: "cs",
              sh: "sh", bash: "sh", powershell: "ps1", ps1: "ps1",
              markdown: "md", md: "md",
            };
            ext = extMap[detectedLang] || detectedLang;
          }
        }
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = customPath ? path.basename(customPath) : `gpt_${timestamp}.${ext}`;
      const finalPath = customPath || path.join(outputDir, fileName);

      fs.writeFileSync(finalPath, fileContent, "utf8");
      console.log(`[RelayHubService] ChatGPT output auto-saved to disk: ${finalPath} (${fileContent.length} chars)`);
      return finalPath;
    } catch (err: any) {
      console.error(`[RelayHubService] Failed to auto-save ChatGPT output: ${err?.message || err}`);
      return "";
    }
  }

  public getStatus() {
    return {
      enabled: this.config.enabled,
      connected: this.connectedClients.size > 0,
      clientCount: this.connectedClients.size,
      activeNodes: this.lastDiscoveredNodes,
      config: this.config,
    };
  }

  public async discoverNodes(): Promise<RelayNodeInfo[]> {
    if (!this.config.enabled) {
      return [];
    }
    const client = this.getActiveClient();
    if (!client) {
      return this.lastDiscoveredNodes;
    }

    const requestId = "req_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        resolve(this.lastDiscoveredNodes);
      }, 5000);

      this.pendingRequests.set(requestId, {
        resolve: (nodes) => resolve(nodes),
        reject: () => resolve(this.lastDiscoveredNodes),
        timer,
      });

      try {
        client.send(JSON.stringify({ type: "DISCOVER_NODES", requestId }));
      } catch {
        clearTimeout(timer);
        this.pendingRequests.delete(requestId);
        resolve(this.lastDiscoveredNodes);
      }
    });
  }

  public async dispatchTask(
    nodeId: string,
    prompt: string,
    timeoutMs = 120000,
    options?: {
      action?: "chat" | "new_chat" | "delete_chat";
      newChat?: boolean;
      deleteCurrentChat?: boolean;
      outputFilePath?: string;
    }
  ): Promise<DispatchResult> {
    if (!this.config.enabled) {
      return {
        status: "DISABLED",
        text: "多模型中转调度网关当前已被管理员在设置中关闭。请先在 AI 控制中心开启后重试。",
      };
    }

    const client = this.getActiveClient();
    if (!client) {
      return {
        status: "SKIPPED_NOT_CONNECTED",
        text: "中转网关未连接到本地 Edge 浏览器扩展。本次已为您自动跳过外部 AI 调度。请确保 Edge 浏览器正在运行并已启用 Nexus Extension Bridge Pro 扩展。",
      };
    }

    let targetNodeId = nodeId;
    if (!targetNodeId || targetNodeId === "auto") {
      const pLower = (prompt || "").toLowerCase();
      if (pLower.includes("gpt") || pLower.includes("chatgpt") || pLower.includes("openai")) {
        const gptNode = this.lastDiscoveredNodes.find((n) => n.nodeId === "gpt-omni" && (n.status === "ONLINE" || n.status === "STANDBY"));
        if (gptNode) targetNodeId = "gpt-omni";
      } else if (pLower.includes("豆包") || pLower.includes("doubao")) {
        const doubaoNode = this.lastDiscoveredNodes.find((n) => n.nodeId === "doubao-pro" && (n.status === "ONLINE" || n.status === "STANDBY"));
        if (doubaoNode) targetNodeId = "doubao-pro";
      } else if (pLower.includes("deepseek") || pLower.includes("深度求索") || pLower.includes("r1")) {
        const dsNode = this.lastDiscoveredNodes.find((n) => n.nodeId === "deepseek-reasoner" && (n.status === "ONLINE" || n.status === "STANDBY"));
        if (dsNode) targetNodeId = "deepseek-reasoner";
      } else if (pLower.includes("kimi") || pLower.includes("月之暗面")) {
        const kimiNode = this.lastDiscoveredNodes.find((n) => n.nodeId === "kimi-longcontext" && (n.status === "ONLINE" || n.status === "STANDBY"));
        if (kimiNode) targetNodeId = "kimi-longcontext";
      }

      if (!targetNodeId || targetNodeId === "auto") {
        const online = this.lastDiscoveredNodes.find((n) => n.status === "ONLINE");
        if (online) {
          targetNodeId = online.nodeId;
        } else if (this.lastDiscoveredNodes.length > 0 && this.lastDiscoveredNodes[0]) {
          targetNodeId = this.lastDiscoveredNodes[0].nodeId;
        } else {
          targetNodeId = "deepseek-reasoner";
        }
      }
    }

    // Check if target node tab is open
    const targetNodeOnline = this.lastDiscoveredNodes.find(
      (n) => n.nodeId === targetNodeId && (n.status === "ONLINE" || n.status === "STANDBY")
    );
    if (this.lastDiscoveredNodes.length > 0 && !targetNodeOnline) {
      return {
        status: "SKIPPED_NOT_OPEN",
        text: `【跳过提示】检测到 [${targetNodeId}] 网页端尚未在 Edge 中打开。为保证任务流程顺畅，本次已自动跳过该节点执行。如需使用该模型，请在 Edge 浏览器中打开对应官网并登录。`,
      };
    }

    const requestId = "task_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);

    // 1. Doubao Fire-and-forget (Zero Wait)
    if (targetNodeId === "doubao-pro") {
      try {
        client.send(
          JSON.stringify({
            type: "DISPATCH_TASK",
            requestId,
            nodeId: targetNodeId,
            prompt,
            action: options?.action || (options?.newChat ? "new_chat" : options?.deleteCurrentChat ? "delete_chat" : "chat"),
            newChat: Boolean(options?.newChat),
            deleteCurrentChat: Boolean(options?.deleteCurrentChat),
            timeoutMs,
          })
        );
      } catch (err: any) {
        return {
          status: "DISPATCH_ERROR",
          text: `向 Edge 扩展派发任务失败: ${err.message}`,
        };
      }

      return {
        status: "DISPATCHED_ZERO_WAIT",
        text: "【任务已送达】已成功派发至豆包网页端后台运行（即发即弃模式，无需等待返回结果，零 Token 消耗）。",
        detached: true,
      };
    }

    // 2. ChatGPT Fire-and-forget (10s Detach + Background Local Disk Save)
    if (targetNodeId === "gpt-omni" && this.config.gptFileSaving.enabled) {
      const detachMs = Math.max(2000, (this.config.gptFileSaving.detachSeconds || 10) * 1000);

      return new Promise((resolve) => {
        let hasDetached = false;

        const detachTimer = setTimeout(() => {
          if (!hasDetached) {
            hasDetached = true;
            // Mark pending request as detached so background handler still saves file when done
            const pending = this.pendingRequests.get(requestId);
            if (pending) {
              pending.detached = true;
            }
            resolve({
              status: "DETACHED_SAVING_LOCAL",
              text: `【即发即弃已脱钩】已成功向 ChatGPT 派发任务（${this.config.gptFileSaving.detachSeconds || 10} 秒自动脱钩已生效，零 Token 占用）。ChatGPT 正在 Edge 后台执行生成，生成代码将由 Nexus 自动提取落盘至配置目录：${this.config.gptFileSaving.outputDir}。如需查看，可在落盘完成后直接前往该路径查看对应文件。`,
              detached: true,
            });
          }
        }, detachMs);

        const bgTimeoutTimer = setTimeout(() => {
          this.pendingRequests.delete(requestId);
        }, 180000);

        this.pendingRequests.set(requestId, {
          resolve: (result) => {
            if (!hasDetached) {
              hasDetached = true;
              clearTimeout(detachTimer);
              clearTimeout(bgTimeoutTimer);
              resolve(result);
            }
          },
          reject: (err) => {
            if (!hasDetached) {
              hasDetached = true;
              clearTimeout(detachTimer);
              clearTimeout(bgTimeoutTimer);
              resolve({
                status: "EXECUTION_ERROR",
                text: `ChatGPT 执行异常: ${err?.message || err}`,
              });
            }
          },
          timer: bgTimeoutTimer,
          detachTimer: detachTimer,
          nodeId: targetNodeId,
          customPath: options?.outputFilePath,
          startTime: Date.now(),
        });

        try {
          client.send(
            JSON.stringify({
              type: "DISPATCH_TASK",
              requestId,
              nodeId: targetNodeId,
              prompt,
              action: options?.action || (options?.newChat ? "new_chat" : options?.deleteCurrentChat ? "delete_chat" : "chat"),
              newChat: Boolean(options?.newChat),
              deleteCurrentChat: Boolean(options?.deleteCurrentChat),
              timeoutMs,
            })
          );
        } catch (err: any) {
          clearTimeout(detachTimer);
          clearTimeout(bgTimeoutTimer);
          this.pendingRequests.delete(requestId);
          resolve({
            status: "DISPATCH_ERROR",
            text: `向 Edge 扩展派发任务失败: ${err.message}`,
          });
        }
      });
    }

    // 3. Standard Model Dispatch with Thinking Strip & Claude.ai Gateway Timeout Protection
    return new Promise((resolve, reject) => {
      // NOTE: Claude.ai and Cloudflare Tunnel have a strict ~50s HTTP timeout window.
      // If the node takes longer than 38s, we MUST NOT let the HTTP request drop with 504.
      // Instead, we gracefully detach and return an interim status to Claude!
      const gatewayMaxWaitMs = Math.min(timeoutMs, 38000);
      let hasDetachedOrResolved = false;

      const gatewayTimer = setTimeout(() => {
        if (!hasDetachedOrResolved) {
          hasDetachedOrResolved = true;
          const pending = this.pendingRequests.get(requestId);
          if (pending) {
            pending.detached = true;
          }
          resolve({
            status: "DETACHED_LONG_INFERENCE",
            text: `【后台持续推理中】已成功将任务送达 [${targetNodeId}] 网页端，后台正在持续深度生成中（已满 38 秒，自动开启长任务脱钩保护以防止 Claude Web 界面超时断开）。思考链将自动过滤，生成完毕后纯结果可在后台或输出中查验。`,
            detached: true,
          });
        }
      }, gatewayMaxWaitMs);

      const maxTimeoutTimer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        if (!hasDetachedOrResolved) {
          hasDetachedOrResolved = true;
          clearTimeout(gatewayTimer);
          reject(new Error(`上游推理节点 [${targetNodeId}] 响应超时 (超时上限: ${Math.round(timeoutMs / 1000)} 秒)`));
        }
      }, timeoutMs + 5000);

      this.pendingRequests.set(requestId, {
        resolve: (res) => {
          if (!hasDetachedOrResolved) {
            hasDetachedOrResolved = true;
            clearTimeout(gatewayTimer);
            clearTimeout(maxTimeoutTimer);
            resolve(res);
          }
        },
        reject: (err) => {
          if (!hasDetachedOrResolved) {
            hasDetachedOrResolved = true;
            clearTimeout(gatewayTimer);
            clearTimeout(maxTimeoutTimer);
            reject(err);
          }
        },
        timer: maxTimeoutTimer,
        detachTimer: gatewayTimer,
        nodeId: targetNodeId,
        customPath: options?.outputFilePath,
        startTime: Date.now(),
      });

      try {
        client.send(
          JSON.stringify({
            type: "DISPATCH_TASK",
            requestId,
            nodeId: targetNodeId,
            prompt,
            action: options?.action || (options?.newChat ? "new_chat" : options?.deleteCurrentChat ? "delete_chat" : "chat"),
            newChat: Boolean(options?.newChat),
            deleteCurrentChat: Boolean(options?.deleteCurrentChat),
            timeoutMs,
          })
        );
      } catch (err: any) {
        clearTimeout(gatewayTimer);
        clearTimeout(maxTimeoutTimer);
        this.pendingRequests.delete(requestId);
        reject(new Error(`向 Edge 扩展派发任务失败: ${err.message}`));
      }
    });
  }

  private getActiveClient(): WebSocket | null {
    for (const client of this.connectedClients) {
      if (client.readyState === 1) {
        return client;
      }
    }
    return null;
  }
}
