/**
 * Nexus Generic MCP Client Runtime — Batch Executor
 * 
 * Generic MCP Batch Execution Engine:
 * - Sequential execution mode (in-order with early abort or continueOnError)
 * - Parallel execution mode (concurrent dispatch via Promise.allSettled)
 * - Dependency-aware DAG execution mode (topological stages + argument resolution)
 * - Structured MCP results and structured MCP errors
 * - Partial failure tolerance
 * - Per-operation and batch-level latency tracing
 */

import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import type {
  MCPBatchOperation,
  MCPBatchExecutionResult,
  MCPStructuredError,
} from "./types.js";

export type ToolDispatchFn = (
  toolName: string,
  args: Record<string, any>,
  options?: { timeoutMs?: number }
) => Promise<{
  content: any[];
  isError: boolean;
  structuredContent?: any;
  rawResult?: any;
  error?: MCPStructuredError;
  durationMs?: number;
}>;

export class MCPBatchExecutor {
  private static instance: MCPBatchExecutor | null = null;

  private constructor() {}

  public static getInstance(): MCPBatchExecutor {
    if (!MCPBatchExecutor.instance) {
      MCPBatchExecutor.instance = new MCPBatchExecutor();
    }
    return MCPBatchExecutor.instance;
  }

  /**
   * Execute a batch of MCP operations
   */
  public async executeBatch(
    params: {
      operations: MCPBatchOperation[];
      mode?: "sequential" | "parallel" | "dependency";
      continueOnError?: boolean;
      timeoutMs?: number;
    },
    dispatchToolCall: ToolDispatchFn
  ): Promise<MCPBatchExecutionResult> {
    const batchId = `batch_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const mode = params.mode || "sequential";
    const continueOnError = params.continueOnError ?? false;
    const timeoutMs = params.timeoutMs || 60000;
    const operations = params.operations || [];

    const startTime = performance.now();
    const results: MCPBatchExecutionResult["results"] = {};
    let completedCount = 0;
    let failedCount = 0;

    // Timeout guard
    let timedOut = false;
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
    }, timeoutMs);

    try {
      if (mode === "parallel") {
        await this.executeParallel(operations, dispatchToolCall, results, () => timedOut);
      } else if (mode === "dependency") {
        await this.executeDependencyAware(operations, dispatchToolCall, results, continueOnError, () => timedOut);
      } else {
        await this.executeSequential(operations, dispatchToolCall, results, continueOnError, () => timedOut);
      }
    } finally {
      clearTimeout(timeoutTimer);
    }

    const totalLatencyMs = Math.round((performance.now() - startTime) * 100) / 100;

    for (const res of Object.values(results)) {
      if (res.success) {
        completedCount++;
      } else {
        failedCount++;
      }
    }

    return {
      batchId,
      mode,
      totalOperations: operations.length,
      completedCount,
      failedCount,
      totalLatencyMs,
      results,
      isError: failedCount > 0 && !continueOnError,
    };
  }

  /**
   * Sequential Execution
   */
  private async executeSequential(
    operations: MCPBatchOperation[],
    dispatch: ToolDispatchFn,
    results: MCPBatchExecutionResult["results"],
    continueOnError: boolean,
    isTimedOut: () => boolean
  ): Promise<void> {
    for (const op of operations) {
      if (isTimedOut()) {
        results[op.id] = {
          success: false,
          error: {
            code: "timeout",
            message: "Batch execution timed out before operation could run",
            retryable: true,
          },
          latencyMs: 0,
        };
        continue;
      }

      const resolvedArgs = this.interpolateArguments(op.arguments, results);
      const opStart = performance.now();
      const targetTool = op.toolName || (op as any).tool || (op as any).name || "";

      try {
        const res = await dispatch(targetTool, resolvedArgs, { timeoutMs: op.timeoutMs });
        const latencyMs = Math.round((performance.now() - opStart) * 100) / 100;

        if (res.isError) {
          results[op.id] = {
            success: false,
            content: res.content,
            error: res.error || {
              code: "tool_error",
              message: res.content?.[0]?.text || "Tool execution failed",
              retryable: false,
            },
            latencyMs,
          };

          if (!continueOnError) {
            // Abort remaining
            break;
          }
        } else {
          results[op.id] = {
            success: true,
            content: res.content,
            structuredContent: res.structuredContent,
            latencyMs,
          };
        }
      } catch (err: any) {
        const latencyMs = Math.round((performance.now() - opStart) * 100) / 100;
        results[op.id] = {
          success: false,
          error: {
            code: "transport_error",
            message: err.message || String(err),
            retryable: true,
          },
          latencyMs,
        };

        if (!continueOnError) {
          break;
        }
      }
    }
  }

  /**
   * Parallel Execution
   */
  private async executeParallel(
    operations: MCPBatchOperation[],
    dispatch: ToolDispatchFn,
    results: MCPBatchExecutionResult["results"],
    isTimedOut: () => boolean
  ): Promise<void> {
    const promises = operations.map(async (op) => {
      if (isTimedOut()) {
        results[op.id] = {
          success: false,
          error: {
            code: "timeout",
            message: "Batch execution timed out",
            retryable: true,
          },
          latencyMs: 0,
        };
        return;
      }

      const opStart = performance.now();
      const targetTool = op.toolName || (op as any).tool || (op as any).name || "";
      try {
        const res = await dispatch(targetTool, op.arguments, { timeoutMs: op.timeoutMs });
        const latencyMs = Math.round((performance.now() - opStart) * 100) / 100;

        if (res.isError) {
          results[op.id] = {
            success: false,
            content: res.content,
            error: res.error || {
              code: "tool_error",
              message: res.content?.[0]?.text || "Tool execution failed",
              retryable: false,
            },
            latencyMs,
          };
        } else {
          results[op.id] = {
            success: true,
            content: res.content,
            structuredContent: res.structuredContent,
            latencyMs,
          };
        }
      } catch (err: any) {
        const latencyMs = Math.round((performance.now() - opStart) * 100) / 100;
        results[op.id] = {
          success: false,
          error: {
            code: "transport_error",
            message: err.message || String(err),
            retryable: true,
          },
          latencyMs,
        };
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Dependency-aware DAG Execution
   */
  private async executeDependencyAware(
    operations: MCPBatchOperation[],
    dispatch: ToolDispatchFn,
    results: MCPBatchExecutionResult["results"],
    continueOnError: boolean,
    isTimedOut: () => boolean
  ): Promise<void> {
    const opMap = new Map<string, MCPBatchOperation>();
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();

    for (const op of operations) {
      opMap.set(op.id, op);
      inDegree.set(op.id, 0);
      dependents.set(op.id, []);
    }

    for (const op of operations) {
      const deps = op.dependsOn || [];
      inDegree.set(op.id, deps.length);
      for (const depId of deps) {
        if (!dependents.has(depId)) {
          dependents.set(depId, []);
        }
        dependents.get(depId)!.push(op.id);
      }
    }

    // Work queue of operations whose dependencies are all satisfied
    const readyQueue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) readyQueue.push(id);
    }

    while (readyQueue.length > 0) {
      if (isTimedOut()) {
        for (const id of readyQueue) {
          results[id] = {
            success: false,
            error: { code: "timeout", message: "Batch timeout reached", retryable: true },
            latencyMs: 0,
          };
        }
        break;
      }

      // Run current wave in parallel
      const currentWave = [...readyQueue];
      readyQueue.length = 0;

      const wavePromises = currentWave.map(async (opId) => {
        const op = opMap.get(opId)!;
        // Check if any prerequisite failed
        const prerequisites = op.dependsOn || [];
        const failedPrereq = prerequisites.find((d) => results[d] && !results[d].success);

        if (failedPrereq) {
          results[opId] = {
            success: false,
            error: {
              code: "invalid_arguments",
              message: `Prerequisite operation '${failedPrereq}' failed`,
              retryable: false,
            },
            latencyMs: 0,
          };
          return;
        }

        const resolvedArgs = this.interpolateArguments(op.arguments, results);
        const opStart = performance.now();
        const targetTool = op.toolName || (op as any).tool || (op as any).name || "";

        try {
          const res = await dispatch(targetTool, resolvedArgs, { timeoutMs: op.timeoutMs });
          const latencyMs = Math.round((performance.now() - opStart) * 100) / 100;

          if (res.isError) {
            results[opId] = {
              success: false,
              content: res.content,
              error: res.error || {
                code: "tool_error",
                message: res.content?.[0]?.text || "Tool execution failed",
                retryable: false,
              },
              latencyMs,
            };
          } else {
            results[opId] = {
              success: true,
              content: res.content,
              structuredContent: res.structuredContent,
              latencyMs,
            };
          }
        } catch (err: any) {
          const latencyMs = Math.round((performance.now() - opStart) * 100) / 100;
          results[opId] = {
            success: false,
            error: {
              code: "transport_error",
              message: err.message || String(err),
              retryable: true,
            },
            latencyMs,
          };
        }
      });

      await Promise.allSettled(wavePromises);

      // Advance dependent operations
      for (const opId of currentWave) {
        const nextOps = dependents.get(opId) || [];
        for (const nextId of nextOps) {
          const currentDeg = inDegree.get(nextId) || 0;
          const newDeg = Math.max(0, currentDeg - 1);
          inDegree.set(nextId, newDeg);
          if (newDeg === 0) {
            readyQueue.push(nextId);
          }
        }
      }

      if (!continueOnError && Object.values(results).some((r) => !r.success)) {
        break;
      }
    }

    // Mark any remaining operations that were not executed
    for (const op of operations) {
      if (!results[op.id]) {
        results[op.id] = {
          success: false,
          error: {
            code: "invalid_arguments",
            message: "Operation skipped due to batch failure or circular dependency",
            retryable: false,
          },
          latencyMs: 0,
        };
      }
    }
  }

  /**
   * Helper to interpolate arguments from earlier operation results (e.g. {{op1.id}} or {{op1.content[0].text}})
   */
  private interpolateArguments(
    args: Record<string, any>,
    results: MCPBatchExecutionResult["results"]
  ): Record<string, any> {
    const raw = JSON.stringify(args);
    const replaced = raw.replace(/\{\{([a-zA-Z0-9_\-\.]+)\}\}/g, (match, path) => {
      const parts = path.split(".");
      const opId = parts[0];
      const resultEntry = results[opId];
      if (!resultEntry) return match;

      let current: any = resultEntry;
      for (let i = 1; i < parts.length; i++) {
        if (current === undefined || current === null) break;
        current = current[parts[i]];
      }

      if (current !== undefined && current !== null) {
        return typeof current === "object" ? JSON.stringify(current) : String(current);
      }
      return match;
    });

    try {
      return JSON.parse(replaced);
    } catch {
      return args;
    }
  }
}
