/**
 * Nexus External MCP Provider / Proxy for GameDev MCP Server (Unity-MCP)
 * 
 * Manages Streamable HTTP MCP connection to local Unity GameDev MCP Server:
 * Downstream: http://localhost:20705/p/6106087c
 * Transport: Streamable HTTP (MCP 2024-11-05)
 * 
 * Strict Invariants:
 * 1. ZERO MOCK: Always reflects truthful downstream states and responses.
 * 2. ISOLATION: Completely decoupled from 332 Canonical MCP Tools and Registry.
 * 3. TRANSPARENT PROXY: Maintains session lifecycle, forwards tools/list and tools/call.
 */

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
  outputSchema?: any;
  annotations?: any;
}

export interface McpInitializeResult {
  protocolVersion: string;
  capabilities: any;
  serverInfo: {
    name: string;
    version: string;
  };
}

export interface McpToolCallResult {
  content?: Array<{ type: string; text?: string; [key: string]: any }>;
  structuredContent?: any;
  isError?: boolean;
}

export class UnityGameDevMcpProvider {
  private static instance: UnityGameDevMcpProvider | null = null;
  private endpoint: string;
  private sessionId: string | null = null;
  private serverInfo: { name: string; version: string } | null = null;
  private capabilities: any = null;
  private tools: McpToolDefinition[] = [];
  private lastInitializedAt: string | null = null;
  private requestId = 0;

  constructor(endpoint: string = "http://localhost:20705/mcp") {
    this.endpoint = endpoint;
  }

  public static getInstance(endpoint?: string): UnityGameDevMcpProvider {
    if (!UnityGameDevMcpProvider.instance) {
      UnityGameDevMcpProvider.instance = new UnityGameDevMcpProvider(endpoint);
    } else if (endpoint && UnityGameDevMcpProvider.instance.endpoint !== endpoint) {
      UnityGameDevMcpProvider.instance.endpoint = endpoint;
    }
    return UnityGameDevMcpProvider.instance;
  }

  public getEndpoint(): string {
    return this.endpoint;
  }

  public getSessionId(): string | null {
    return this.sessionId;
  }

  public getServerInfo(): { name: string; version: string } | null {
    return this.serverInfo;
  }

  public getCachedTools(): McpToolDefinition[] {
    return [...this.tools];
  }

  public isConnected(): boolean {
    return Boolean(this.sessionId && this.serverInfo);
  }

  /**
   * Helper to parse SSE / event-stream chunks for JSON-RPC response
   */
  private parseEventStreamData(text: string): any {
    const lines = text.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data: ")) {
        try {
          return JSON.parse(trimmed.slice(6));
        } catch {
          // continue searching
        }
      }
    }
    // Fallback: direct JSON parse
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  /**
   * Perform MCP Initialize handshake over Streamable HTTP MCP
   */
  public async initialize(): Promise<{ success: boolean; data?: McpInitializeResult; error?: string }> {
    try {
      this.requestId++;
      const initPayload = {
        jsonrpc: "2.0",
        id: this.requestId,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "nexus-mcp-provider",
            version: "1.20.0",
          },
        },
      };

      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(initPayload),
      });

      if (!res.ok) {
        return {
          success: false,
          error: `HTTP error ${res.status}: ${res.statusText}`,
        };
      }

      this.sessionId = res.headers.get("mcp-session-id");
      const text = await res.text();
      const parsed = this.parseEventStreamData(text);

      if (!parsed || !parsed.result) {
        return {
          success: false,
          error: `Invalid initialize response: ${text.slice(0, 200)}`,
        };
      }

      const result = parsed.result as McpInitializeResult;
      this.serverInfo = result.serverInfo;
      this.capabilities = result.capabilities;
      this.lastInitializedAt = new Date().toISOString();

      // Send notifications/initialized per MCP 2024-11-05 specification
      await this.sendNotification("notifications/initialized", {});

      return {
        success: true,
        data: result,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || String(err),
      };
    }
  }

  /**
   * Send JSON-RPC notification
   */
  private async sendNotification(method: string, params: any = {}): Promise<void> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    await fetch(this.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method,
        params,
      }),
    });
  }

  /**
   * Execute tools/list on downstream GameDev MCP server
   */
  public async listTools(): Promise<{ success: boolean; count: number; tools: McpToolDefinition[]; error?: string }> {
    if (!this.sessionId) {
      const initRes = await this.initialize();
      if (!initRes.success) {
        return { success: false, count: 0, tools: [], error: initRes.error };
      }
    }

    try {
      this.requestId++;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      };
      if (this.sessionId) {
        headers["Mcp-Session-Id"] = this.sessionId;
      }

      let res = await fetch(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: this.requestId,
          method: "tools/list",
          params: {},
        }),
      });

      // Auto-reconnect: if downstream rejected session (HTTP 400, 401, 404, 502), re-initialize and retry once
      if (!res.ok && (res.status === 400 || res.status === 401 || res.status === 404 || res.status === 502)) {
        this.sessionId = null;
        const reInit = await this.initialize();
        if (reInit.success) {
          const retryHeaders: Record<string, string> = {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          };
          if (this.sessionId) {
            retryHeaders["Mcp-Session-Id"] = this.sessionId;
          }
          this.requestId++;
          res = await fetch(this.endpoint, {
            method: "POST",
            headers: retryHeaders,
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: this.requestId,
              method: "tools/list",
              params: {},
            }),
          });
        }
      }

      if (!res.ok) {
        return {
          success: false,
          count: 0,
          tools: [],
          error: `HTTP error ${res.status}: ${res.statusText}`,
        };
      }

      const text = await res.text();
      const parsed = this.parseEventStreamData(text);

      if (!parsed || !parsed.result || !Array.isArray(parsed.result.tools)) {
        return {
          success: false,
          count: 0,
          tools: [],
          error: `Invalid tools/list response: ${text.slice(0, 200)}`,
        };
      }

      this.tools = parsed.result.tools as McpToolDefinition[];
      return {
        success: true,
        count: this.tools.length,
        tools: this.tools,
      };
    } catch (err: any) {
      this.sessionId = null;
      return {
        success: false,
        count: 0,
        tools: [],
        error: err.message || String(err),
      };
    }
  }

  /**
   * Call a tool on downstream GameDev MCP server with auto-reconnect
   */
  public async callTool(
    name: string,
    args: Record<string, any> = {}
  ): Promise<{ success: boolean; result?: McpToolCallResult; error?: string }> {
    // Normalization & alias compatibility for script-execute
    if (name === "script-execute") {
      if (!args.csharpCode && (args.script || args.code)) {
        args.csharpCode = args.script || args.code;
      }
      if (typeof args.csharpCode === "string" && args.isMethodBody === undefined) {
        if (!args.csharpCode.includes("class ") && !args.csharpCode.includes("namespace ")) {
          args.isMethodBody = true;
        }
      }
    }

    if (!this.sessionId) {
      const initRes = await this.initialize();
      if (!initRes.success) {
        return { success: false, error: initRes.error };
      }
    }

    try {
      this.requestId++;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      };
      if (this.sessionId) {
        headers["Mcp-Session-Id"] = this.sessionId;
      }

      let res = await fetch(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: this.requestId,
          method: "tools/call",
          params: {
            name,
            arguments: args,
          },
        }),
      });

      // Auto-reconnect: if downstream rejected session (HTTP 400, 401, 404, 502), re-initialize and retry once
      if (!res.ok && (res.status === 400 || res.status === 401 || res.status === 404 || res.status === 502)) {
        this.sessionId = null;
        const reInit = await this.initialize();
        if (reInit.success) {
          const retryHeaders: Record<string, string> = {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          };
          if (this.sessionId) {
            retryHeaders["Mcp-Session-Id"] = this.sessionId;
          }
          this.requestId++;
          res = await fetch(this.endpoint, {
            method: "POST",
            headers: retryHeaders,
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: this.requestId,
              method: "tools/call",
              params: {
                name,
                arguments: args,
              },
            }),
          });
        }
      }

      if (!res.ok) {
        return {
          success: false,
          error: `HTTP error ${res.status}: ${res.statusText}`,
        };
      }

      const text = await res.text();
      const parsed = this.parseEventStreamData(text);

      if (!parsed || !parsed.result) {
        return {
          success: false,
          error: `Invalid tools/call response: ${text.slice(0, 200)}`,
        };
      }

      const toolResult = parsed.result as McpToolCallResult;
      const isError = Boolean(toolResult.isError);

      return {
        success: !isError,
        result: toolResult,
        error: isError ? JSON.stringify(toolResult.content) : undefined,
      };
    } catch (err: any) {
      this.sessionId = null;
      return {
        success: false,
        error: err.message || String(err),
      };
    }
  }

  /**
   * Status summary
   */
  public getStatus() {
    return {
      connected: this.isConnected(),
      endpoint: this.endpoint,
      sessionId: this.sessionId,
      serverInfo: this.serverInfo,
      capabilities: this.capabilities,
      toolCount: this.tools.length,
      lastInitializedAt: this.lastInitializedAt,
    };
  }
}
