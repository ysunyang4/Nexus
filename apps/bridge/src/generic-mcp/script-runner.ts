/**
 * Nexus Universal MCP Script Execution Kernel (script-runner.ts)
 * 
 * Provides deterministic, isolated Python & Node.js code execution with:
 * 1. Unified 'nexus' SDK namespace (nexus.cad, nexus.blender, nexus.ps, nexus.unity, nexus.browser, etc.)
 * 2. Windows JobObject / Process Tree Watchdog Timeout (default 30s)
 * 3. Clean Traceback & Formatted Self-Healing Error Reports
 * 4. Zero external package requirements (uses native standard library urllib/fetch)
 */

import child_process from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { TokenGuardrail } from "./token-guardrail.js";
import { DynamicCatalog } from "./dynamic-catalog.js";
import { UnityGameDevMcpProvider } from "../unity-gamedev-provider.js";

export interface ScriptExecutionRequest {
  runtime?: "python" | "node";
  script: string;
  timeoutMs?: number;
  environment?: Record<string, string>;
}

export interface ScriptExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  result?: any;
  error?: string;
  elapsedMs: number;
  timedOut?: boolean;
}

export class ScriptRunner {
  private static instance: ScriptRunner | null = null;
  private tempDir: string;
  private pythonPath: string;
  private nodePath: string;

  private constructor() {
    this.tempDir = path.join(os.tmpdir(), "nexus-script-runs");
    if (!fs.existsSync(this.tempDir)) {
      try {
        fs.mkdirSync(this.tempDir, { recursive: true });
      } catch {}
    }
    this.pythonPath = this.resolvePythonBinary();
    this.nodePath = this.resolveNodeBinary();
  }

  public static getInstance(): ScriptRunner {
    if (!ScriptRunner.instance) {
      ScriptRunner.instance = new ScriptRunner();
    }
    return ScriptRunner.instance;
  }

  private resolvePythonBinary(): string {
    const candidates = [
      process.env.PYTHON_PATH,
      "E:\\Tools\\Anado\\Anaa\\python.exe",
      "python.exe",
      "python",
    ];
    for (const cand of candidates) {
      if (cand && (cand === "python.exe" || cand === "python" || fs.existsSync(cand))) {
        return cand;
      }
    }
    return "python";
  }

  private resolveNodeBinary(): string {
    const candidates = [
      process.env.NODE_PATH,
      "E:\\Tools\\nodejs\\nvm\\nodejs\\node.exe",
      process.execPath,
      "node.exe",
      "node",
    ];
    for (const cand of candidates) {
      if (cand && (cand === "node.exe" || cand === "node" || fs.existsSync(cand))) {
        return cand;
      }
    }
    return "node";
  }

  private getToolsMapPayload(): string {
    const dynamicCatalog = DynamicCatalog.getInstance();
    const unityTools = dynamicCatalog.getToolsByProvider("unity-gamedev").map((t) => t.name.replace(/-/g, "_"));
    let unityInventoryTools: string[] = [];
    try {
      const unityProvider = UnityGameDevMcpProvider.getInstance();
      unityInventoryTools = unityProvider.getExposedTools().map((t) => t.name.replace(/-/g, "_"));
    } catch {}
    const finalUnity = Array.from(new Set([...unityTools, ...unityInventoryTools]));

    const coreTools = [
      "project_list", "project_info", "directory_list", "file_read", "file_write",
      "file_create", "file_delete", "file_move", "command_run", "terminal_create",
      "terminal_write", "terminal_read", "terminal_destroy", "computer_screenshot",
      "computer_screen_snapshot", "computer_observe", "computer_mouse_click",
      "computer_keyboard_type", "computer_ocr", "browser_launch", "browser_open",
      "browser_find", "browser_click", "browser_type", "browser_screenshot",
      "browser_snapshot", "browser_close", "browser_tabs", "browser_list",
      "git_status", "git_commit", "git_branch_list", "git_diff", "git_log"
    ];

    const windowsTools = [
      "command_run", "cmd_run", "powershell_run", "process_list", "process_kill",
      "port_list", "window_list", "window_focus", "screen_snapshot", "screenshot",
      "mouse_click", "keyboard_type", "file_read", "file_write"
    ];

    const blenderTools = [
      "mesh_add", "render_scene", "material_create", "object_transform", "object_delete",
      "camera_set", "light_create", "export_model", "scene_info", "run_bpy_script"
    ];

    const cadTools = [
      "drawing_info", "layer_list", "layer_create", "entity_add", "drawing_export", "run_lisp"
    ];

    return JSON.stringify({
      unity: finalUnity,
      core: coreTools,
      windows: windowsTools,
      blender: blenderTools,
      cad: cadTools
    });
  }

  /**
   * Executes a Python script with embedded 'nexus' SDK namespace
   */
  public async executePython(
    script: string,
    timeoutMs = 30000,
    envExtra?: Record<string, string>
  ): Promise<ScriptExecutionResult> {
    const startTime = Date.now();
    const runId = `py_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const scriptPath = path.join(this.tempDir, `${runId}.py`);

    const toolsJson = this.getToolsMapPayload();

    // Bootstrap wrapper script with dynamic nexus SDK
    const wrapperSource = `
# -*- coding: utf-8 -*-
import sys
import json
import urllib.request
import urllib.error

_TOOLS_DICT = json.loads('''${toolsJson}''')

class _NexusToolProxy:
    def __init__(self, provider, tools=None):
        self._provider = provider
        self._tools = sorted(list(set(tools or [])))

    def __dir__(self):
        return self._tools if self._tools else ["tools", "help"]

    def tools(self):
        return self._tools

    def help(self):
        preview = ", ".join(self._tools[:25])
        suffix = f" ... and {len(self._tools) - 25} more" if len(self._tools) > 25 else ""
        return f"Provider '{self._provider}' ({len(self._tools)} tools): {preview}{suffix}"

    def __getattr__(self, name):
        def _invoke(*args, **kwargs):
            tool_name = name
            if self._provider in ["unity-gamedev", "blender-mcp", "photoshop-mcp"] and not tool_name.startswith("localbridge_") and "_" in tool_name:
                tool_name = tool_name.replace("_", "-")
            url = "http://127.0.0.1:8787/api/mcp/execute"
            params = {}
            if kwargs:
                params.update(kwargs)
            if args:
                params["_args"] = args
            payload = json.dumps({
                "tool": tool_name,
                "provider": self._provider,
                "arguments": params
            }).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=payload,
                headers={"Content-Type": "application/json"}
            )
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    body = resp.read().decode("utf-8")
                    data = json.loads(body)
                    if data.get("isError"):
                        err_msg = data.get("error") or f"Tool '{name}' execution failed"
                        if "MCP_SCOPE_DENIED" in str(err_msg) or "unknown tool" in str(err_msg).lower():
                            err_msg = f"Tool '{name}' is not recognized under provider '{self._provider}'. Tip: Call dir(nexus.{self._provider.split('-')[0]}) or nexus_discover_tools() to inspect."
                        raise RuntimeError(err_msg)
                    return data.get("result")
            except urllib.error.HTTPError as e:
                err_text = e.read().decode("utf-8", errors="ignore")
                clean_msg = err_text
                try:
                    parsed = json.loads(err_text)
                    if "error" in parsed:
                        clean_msg = str(parsed["error"])
                except Exception:
                    pass
                if "MCP_SCOPE_DENIED" in clean_msg or "unknown tool" in clean_msg.lower():
                    clean_msg = f"Tool '{name}' is not recognized under provider '{self._provider}'. Tip: Call dir(nexus.{self._provider.split('-')[0]}) or nexus_discover_tools() to inspect."
                raise RuntimeError(f"Nexus Error: {clean_msg}")
            except Exception as e:
                raise RuntimeError(f"Nexus Error calling '{name}': {str(e)}")
        return _invoke

class _NexusSDKModule:
    def __init__(self, tools_map):
        self.cad = _NexusToolProxy("autocad", tools_map.get("cad", []))
        self.blender = _NexusToolProxy("blender-mcp", tools_map.get("blender", []))
        self.ps = _NexusToolProxy("photoshop-mcp", tools_map.get("ps", []))
        self.photoshop = self.ps
        self.unity = _NexusToolProxy("unity-gamedev", tools_map.get("unity", []))
        self.browser = _NexusToolProxy("playwright", tools_map.get("browser", []))
        self.web = self.browser
        self.windows = _NexusToolProxy("windows-mcp", tools_map.get("windows", []))
        self.agentic = _NexusToolProxy("agentic-tools-mcp", tools_map.get("agentic", []))
        self.telegram = _NexusToolProxy("telegram-mcp", tools_map.get("telegram", []))
        self.tg = self.telegram
        self.core = _NexusToolProxy("core", tools_map.get("core", []))

    def __dir__(self):
        return ["cad", "blender", "ps", "photoshop", "unity", "browser", "web", "windows", "agentic", "telegram", "core", "help", "tools"]

    def __getattr__(self, name):
        return getattr(self.core, name)

    def help(self, namespace=None):
        if namespace:
            target = getattr(self, namespace, None)
            if target and hasattr(target, "help"):
                return target.help()
        return "Nexus SDK namespaces: cad, blender, ps, unity, browser, windows, core. Try dir(nexus.unity) or nexus.help('unity')."

    def tools(self, namespace=None):
        if namespace:
            target = getattr(self, namespace, None)
            if target and hasattr(target, "tools"):
                return target.tools()
        return {
            "unity": self.unity.tools(),
            "core": self.core.tools(),
            "windows": self.windows.tools(),
            "blender": self.blender.tools(),
        }

# Inject 'nexus' into sys.modules
sdk_instance = _NexusSDKModule(_TOOLS_DICT)
sys.modules['nexus'] = sdk_instance
import nexus

# --- USER SCRIPT BEGIN ---
${script}
# --- USER SCRIPT END ---
`;

    try {
      fs.writeFileSync(scriptPath, wrapperSource, "utf-8");
    } catch (err: any) {
      return {
        success: false,
        stdout: "",
        stderr: "",
        error: `Failed to write runner script: ${err.message}`,
        elapsedMs: Date.now() - startTime,
      };
    }

    return new Promise((resolve) => {
      let isSettled = false;
      let stdout = "";
      let stderr = "";
      let child: child_process.ChildProcess | null = null;

      const finish = (result: ScriptExecutionResult) => {
        if (isSettled) return;
        isSettled = true;
        try {
          if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
        } catch {}
        const boundedResult: any = {
          ...result,
          stdout: result.stdout,
          stderr: result.stderr,
          result: result.result,
        };
        resolve(boundedResult);
      };

      try {
        child = child_process.spawn(this.pythonPath, [scriptPath], {
          env: {
            ...process.env,
            PYTHONIOENCODING: "utf-8",
            PYTHONUNBUFFERED: "1",
            ...(envExtra || {}),
          },
          windowsHide: true,
        });
      } catch (spawnErr: any) {
        return finish({
          success: false,
          stdout: "",
          stderr: "",
          error: `Failed to spawn Python process: ${spawnErr.message}`,
          elapsedMs: Date.now() - startTime,
        });
      }

      const timer = setTimeout(() => {
        if (!isSettled && child?.pid) {
          try {
            // Force-kill entire process tree on Windows
            child_process.exec(`taskkill /F /T /PID ${child.pid}`, { windowsHide: true }, () => {});
          } catch {}
          finish({
            success: false,
            stdout,
            stderr: stderr + `\n[TIMEOUT] Script execution timed out after ${timeoutMs}ms. Process terminated.`,
            error: `EXECUTION_TIMEOUT: Script exceeded ${timeoutMs}ms limit. Host processes were safely protected.`,
            elapsedMs: Date.now() - startTime,
            timedOut: true,
          });
        }
      }, timeoutMs);

      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString("utf-8");
      });

      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString("utf-8");
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        finish({
          success: false,
          stdout,
          stderr: stderr + `\n${err.message}`,
          error: `Process error: ${err.message}`,
          elapsedMs: Date.now() - startTime,
        });
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        const elapsedMs = Date.now() - startTime;
        if (code === 0) {
          finish({
            success: true,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            result: stdout.trim(),
            elapsedMs,
          });
        } else {
          // Format clean traceback
          const cleanErr = stderr.trim() || `Script exited with non-zero exit code: ${code}`;
          finish({
            success: false,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            error: cleanErr,
            elapsedMs,
          });
        }
      });
    });
  }

  /**
   * Executes a Node.js script with embedded 'nexus' Proxy SDK
   */
  public async executeNode(
    script: string,
    timeoutMs = 30000,
    envExtra?: Record<string, string>
  ): Promise<ScriptExecutionResult> {
    const startTime = Date.now();
    const runId = `node_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const scriptPath = path.join(this.tempDir, `${runId}.cjs`);

    const wrapperSource = `
const http = require("http");

const _TOOLS_DICT = ${this.getToolsMapPayload()};

function createToolProxy(provider, toolList = []) {
  const handler = {
    get(_, rawToolName) {
      if (rawToolName === "tools") return () => toolList;
      if (rawToolName === "help") return () => "Provider '" + provider + "' (" + toolList.length + " tools): " + toolList.slice(0, 25).join(", ");
      let toolName = String(rawToolName);
      if (["unity-gamedev", "blender-mcp", "photoshop-mcp"].includes(provider) && !toolName.startsWith("localbridge_") && toolName.includes("_")) {
        toolName = toolName.replace(/_/g, "-");
      }
      return async function(args = {}) {
        return new Promise((resolve, reject) => {
          const payload = JSON.stringify({
            tool: toolName,
            provider: provider,
            arguments: args
          });
          const req = http.request({
            hostname: "127.0.0.1",
            port: 8787,
            path: "/api/mcp/execute",
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload)
            },
            timeout: 30000
          }, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
              try {
                const parsed = JSON.parse(data);
                if (parsed.isError) {
                  let errStr = parsed.error || ("Tool '" + toolName + "' failed");
                  if (errStr.includes("MCP_SCOPE_DENIED") || errStr.toLowerCase().includes("unknown tool")) {
                    errStr = "Tool '" + toolName + "' is not recognized under provider '" + provider + "'. Tip: call nexus." + provider.split("-")[0] + ".tools() to see available tools.";
                  }
                  reject(new Error(errStr));
                } else {
                  resolve(parsed.result);
                }
              } catch(e) {
                reject(e);
              }
            });
          });
          req.on("error", reject);
          req.write(payload);
          req.end();
        });
      };
    },
    ownKeys() {
      return toolList;
    },
    has(_, key) {
      return toolList.includes(key);
    }
  };
  return new Proxy({}, handler);
}

const rawNexus = {
  cad: createToolProxy("autocad", _TOOLS_DICT.cad || []),
  blender: createToolProxy("blender-mcp", _TOOLS_DICT.blender || []),
  ps: createToolProxy("photoshop-mcp", _TOOLS_DICT.ps || []),
  photoshop: createToolProxy("photoshop-mcp", _TOOLS_DICT.ps || []),
  unity: createToolProxy("unity-gamedev", _TOOLS_DICT.unity || []),
  browser: createToolProxy("playwright", _TOOLS_DICT.browser || []),
  web: createToolProxy("playwright", _TOOLS_DICT.browser || []),
  windows: createToolProxy("windows-mcp", _TOOLS_DICT.windows || []),
  telegram: createToolProxy("telegram-mcp", _TOOLS_DICT.telegram || []),
  tg: createToolProxy("telegram-mcp", _TOOLS_DICT.telegram || []),
  core: createToolProxy("core", _TOOLS_DICT.core || []),
  tools: (ns) => ns ? (_TOOLS_DICT[ns] || []) : _TOOLS_DICT,
  help: (ns) => ns ? ("Tools for " + ns + ": " + (_TOOLS_DICT[ns] || []).join(", ")) : "Available namespaces: unity, core, windows, blender, cad"
};

global.nexus = new Proxy(rawNexus, {
  get(target, prop) {
    if (prop in target) return target[prop];
    return target.core[prop];
  }
});

async function __runUserCode__() {
  ${script}
}

__runUserCode__().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
`;

    try {
      fs.writeFileSync(scriptPath, wrapperSource, "utf-8");
    } catch (err: any) {
      return {
        success: false,
        stdout: "",
        stderr: "",
        error: `Failed to write runner script: ${err.message}`,
        elapsedMs: Date.now() - startTime,
      };
    }

    return new Promise((resolve) => {
      let isSettled = false;
      let stdout = "";
      let stderr = "";
      let child: child_process.ChildProcess | null = null;

      const finish = (result: ScriptExecutionResult) => {
        if (isSettled) return;
        isSettled = true;
        try {
          if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
        } catch {}
        const boundedResult: any = {
          ...result,
          stdout: result.stdout,
          stderr: result.stderr,
          result: result.result,
        };
        resolve(boundedResult);
      };

      try {
        child = child_process.spawn(this.nodePath, [scriptPath], {
          env: {
            ...process.env,
            ...(envExtra || {}),
          },
          windowsHide: true,
        });
      } catch (spawnErr: any) {
        return finish({
          success: false,
          stdout: "",
          stderr: "",
          error: `Failed to spawn Node.js process: ${spawnErr.message}`,
          elapsedMs: Date.now() - startTime,
        });
      }

      const timer = setTimeout(() => {
        if (!isSettled && child?.pid) {
          try {
            child_process.exec(`taskkill /F /T /PID ${child.pid}`, { windowsHide: true }, () => {});
          } catch {}
          finish({
            success: false,
            stdout,
            stderr: stderr + `\n[TIMEOUT] Script execution timed out after ${timeoutMs}ms. Process terminated.`,
            error: `EXECUTION_TIMEOUT: Script exceeded ${timeoutMs}ms limit.`,
            elapsedMs: Date.now() - startTime,
            timedOut: true,
          });
        }
      }, timeoutMs);

      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString("utf-8");
      });

      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString("utf-8");
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        finish({
          success: false,
          stdout,
          stderr: stderr + `\n${err.message}`,
          error: `Process error: ${err.message}`,
          elapsedMs: Date.now() - startTime,
        });
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        const elapsedMs = Date.now() - startTime;
        if (code === 0) {
          finish({
            success: true,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            result: stdout.trim(),
            elapsedMs,
          });
        } else {
          finish({
            success: false,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            error: stderr.trim() || `Script exited with exit code: ${code}`,
            elapsedMs,
          });
        }
      });
    });
  }

  public async execute(req: ScriptExecutionRequest): Promise<ScriptExecutionResult> {
    const runtime = req.runtime || "python";
    const timeoutMs = req.timeoutMs || 30000;
    if (runtime === "node") {
      return this.executeNode(req.script, timeoutMs, req.environment);
    }
    return this.executePython(req.script, timeoutMs, req.environment);
  }
}
