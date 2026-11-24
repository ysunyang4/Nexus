import { CANONICAL_TOOL_DEFINITIONS } from "@localbridge/protocol";

export type McpScope = "read" | "write" | "execute";

/**
 * Single Source of Truth: Derived directly from CANONICAL_TOOL_DEFINITIONS (332 Tools).
 * Do NOT maintain a separate hardcoded tool scope list here.
 */
const derivedScopes: Record<string, McpScope> = {};
for (const tool of CANONICAL_TOOL_DEFINITIONS) {
  const scope =
    tool.mcpScope === "read" || tool.mcpScope === "write" || tool.mcpScope === "execute"
      ? tool.mcpScope
      : "execute";
  derivedScopes[tool.name] = scope;
}

// Session cache and directive tools: explicit least-privilege whitelist registration
derivedScopes["nexus_session_cache_load"] = "read";
derivedScopes["nexus_session_cache_list"] = "read";
derivedScopes["nexus_get_active_directives"] = "read";
derivedScopes["nexus_session_cache_save"] = "write";
derivedScopes["nexus_session_cache_clear"] = "write";
derivedScopes["nexus_session_handoff"] = "write";
derivedScopes["localbridge_relay_discover_nodes"] = "read";
derivedScopes["localbridge_relay_dispatch_task"] = "execute";

export const MCP_TOOL_SCOPE: Readonly<Record<string, McpScope>> = Object.freeze(derivedScopes);

export function requiredScopeForTool(toolName: string): McpScope | undefined {
  return MCP_TOOL_SCOPE[toolName];
}

export function hasToolScope(scopes: readonly string[], toolName: string): boolean {
  const required = requiredScopeForTool(toolName);
  return required !== undefined && scopes.includes(required);
}
