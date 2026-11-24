import { CANONICAL_TOOL_DEFINITIONS } from "@localbridge/protocol";
import type { ToolAnnotations } from "./types.js";

/**
 * Single Source of Truth: Derived directly from CANONICAL_TOOL_DEFINITIONS (332 Tools).
 * Do NOT maintain a separate hardcoded tool annotations map here.
 */
const derivedAnnotations: Record<string, ToolAnnotations> = {};
for (const tool of CANONICAL_TOOL_DEFINITIONS) {
  const isReadOnly = tool.mcpScope === "read" && tool.executionMode === "read";
  if (isReadOnly) {
    derivedAnnotations[tool.name] = { readOnlyHint: true };
  } else {
    const annotation: ToolAnnotations = {
      readOnlyHint: tool.mcpScope === "read",
      idempotentHint: tool.supportsIdempotency,
      destructiveHint:
        tool.riskLevel === "destructive" || tool.safetyClassification === "DESTRUCTIVE",
    };
    if (
      tool.executionMode === "network" ||
      tool.executionMode === "browser" ||
      tool.executionMode === "process"
    ) {
      annotation.openWorldHint = true;
    }
    derivedAnnotations[tool.name] = annotation;
  }
}

// Built-in annotations for directives and session-cache tools
derivedAnnotations["nexus_get_active_directives"] = { readOnlyHint: true };
derivedAnnotations["nexus_session_cache_save"] = { readOnlyHint: false, idempotentHint: false };
derivedAnnotations["nexus_session_cache_load"] = { readOnlyHint: false };
derivedAnnotations["nexus_session_cache_list"] = { readOnlyHint: true };
derivedAnnotations["nexus_session_cache_clear"] = { readOnlyHint: false };
derivedAnnotations["nexus_session_handoff"] = { readOnlyHint: false, idempotentHint: false };
derivedAnnotations["localbridge_relay_discover_nodes"] = { readOnlyHint: true };
derivedAnnotations["localbridge_relay_dispatch_task"] = { readOnlyHint: false, idempotentHint: false, openWorldHint: true };

export const TOOL_ANNOTATIONS: Record<string, ToolAnnotations> = derivedAnnotations;
