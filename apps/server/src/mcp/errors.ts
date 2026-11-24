import { LocalBridgeError, RemoteRpcError } from "@localbridge/protocol";
import { MAX_MCP_RESULT_BYTES, type McpToolResponse } from "./types.js";

/**
 * Format successful tool execution result and enforce MAX_MCP_RESULT_BYTES limit.
 */
export function formatToolSuccess(data: unknown): McpToolResponse {
  const jsonStr = JSON.stringify(data, null, 2);
  const byteLength = Buffer.byteLength(jsonStr, "utf-8");
  if (byteLength > MAX_MCP_RESULT_BYTES) {
    return {
      content: [
        {
          type: "text",
          text: `Result size of ${byteLength} bytes exceeds the maximum allowed limit of ${MAX_MCP_RESULT_BYTES} bytes.`,
        },
      ],
      isError: true,
      structuredContent: {
        code: "MCP_RESULT_TOO_LARGE",
        bytes: byteLength,
        maxBytes: MAX_MCP_RESULT_BYTES,
      },
    };
  }

  return {
    content: [
      {
        type: "text",
        text: jsonStr,
      },
    ],
    structuredContent:
      typeof data === "object" && data !== null && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : undefined,
  };
}

/**
 * Sanitize text to remove sensitive physical path details or potential secrets.
 */
export function sanitizeMcpOutput(text: string): string {
  if (!text) return "";
  // Strip absolute Windows paths (e.g. C:\Users\... or E:\workspace\...)
  let sanitized = text.replace(/[a-zA-Z]:\\[^"'\n\r<>|?*]+/g, "<path>");
  // Strip Unix style absolute paths (/home/... or /Users/...)
  sanitized = sanitized.replace(/\/(Users|home|root|var|etc)\/[^"'\n\r<>|?*]+/g, "<path>");
  return sanitized;
}

export function generateRemediationHint(msg: string, code?: string): string | undefined {
  if (code === "PATH_NOT_ALLOWED" || msg.includes("PATH_NOT_ALLOWED") || msg.includes("Path traversal")) {
    return "The path is restricted. Ensure paths stay within authorized workspace or enable Universal Mode in settings.";
  }
  if (code === "FILE_NOT_FOUND" || msg.includes("does not exist") || msg.includes("not found")) {
    return "Target file/dir was not found. Use file_list or localbridge_directory_list to discover valid existing paths.";
  }
  if (code === "PROJECT_READ_ONLY" || msg.includes("read-only")) {
    return "Project is configured in read-only access mode. Only read operations are permitted.";
  }
  if (msg.includes("syntax") || msg.includes("command failed")) {
    return "Check command syntax for Windows PowerShell / CMD. Quote paths containing spaces.";
  }
  return undefined;
}

export class McpErrorMapper {
  /**
   * Alias for toMcpToolError for backward and module compatibility.
   */
  static toToolError(error: unknown): McpToolResponse {
    return McpErrorMapper.toMcpToolError(error);
  }

  /**
   * Map any caught error to a compliant MCP Tool error response.
   * Prevents internal server details, stack traces, and sensitive paths from leaking.
   * Enriches errors with actionable self-healing remediation hints.
   */
  static toMcpToolError(error: unknown): McpToolResponse {
    if (error instanceof LocalBridgeError) {
      const remediation = generateRemediationHint(error.message, error.code);
      const text = remediation ? `${sanitizeMcpOutput(error.message)} (Suggestion: ${remediation})` : sanitizeMcpOutput(error.message);
      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
        isError: true,
        structuredContent: {
          code: error.code,
          details: error.details,
          remediation,
        },
      };
    }

    if (error instanceof RemoteRpcError) {
      let remoteDataCode =
        typeof error.data === "object" && error.data !== null
          ? (error.data as any).code
          : undefined;
      if (!remoteDataCode) {
        if (error.message.includes("Path traversal") || error.message.includes("PATH_TRAVERSAL")) {
          remoteDataCode = "PATH_TRAVERSAL";
        } else if (error.message.includes("read-only mode") || error.message.includes("PROJECT_READ_ONLY")) {
          remoteDataCode = "PROJECT_READ_ONLY";
        } else if (error.message.includes("execution is disabled") || error.message.includes("PROJECT_EXECUTION_DISABLED")) {
          remoteDataCode = "PROJECT_EXECUTION_DISABLED";
        } else if (error.message.includes("not found") || error.message.includes("PROJECT_NOT_FOUND")) {
          remoteDataCode = "PROJECT_NOT_FOUND";
        }
      }
      const remediation = generateRemediationHint(error.message, remoteDataCode);
      const text = remediation ? `${sanitizeMcpOutput(error.message)} (Suggestion: ${remediation})` : sanitizeMcpOutput(error.message);
      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
        isError: true,
        structuredContent: {
          code: remoteDataCode || "RPC_REMOTE_ERROR",
          remoteCode: error.code,
          data: error.data,
          remediation,
        },
      };
    }

    if (error instanceof Error) {
      const remediation = generateRemediationHint(error.message);
      const text = remediation ? `${sanitizeMcpOutput(error.message)} (Suggestion: ${remediation})` : sanitizeMcpOutput(error.message);
      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
        isError: true,
        structuredContent: {
          code: "INTERNAL_ERROR",
          remediation,
        },
      };
    }

    return {
      content: [
        {
          type: "text",
          text: "An unknown error occurred while executing the tool",
        },
      ],
      isError: true,
      structuredContent: {
        code: "INTERNAL_ERROR",
      },
    };
  }
}
