/**
 * Nexus Universal Capability Layer & Resolver
 * 
 * Decouples high-level AI Capabilities from low-level MCP Tools.
 * Dynamic Resolution: Capability -> Available Provider -> Downstream Tool.
 * 
 * Adheres strictly to:
 * 1. Zero Duplicate Tool Registry: Inspects runtime Dynamic Catalog.
 * 2. Provider-Agnostic: Supports Unity, Core filesystem, Blender, Browser, etc.
 * 3. Smart Parameter Normalization: Prevents downstream schema mismatches from failing tasks.
 */

export interface CapabilityMapping {
  capability: string;
  provider: string;
  preferredTool: string;
  fallbackTools?: string[];
  description: string;
  normalizeParams: (params: Record<string, any>) => Record<string, any>;
}

export class CapabilityResolver {
  private static instance: CapabilityResolver | null = null;
  private mappings: Map<string, CapabilityMapping[]> = new Map();

  private constructor() {
    this.registerStandardCapabilities();
  }

  public static getInstance(): CapabilityResolver {
    if (!CapabilityResolver.instance) {
      CapabilityResolver.instance = new CapabilityResolver();
    }
    return CapabilityResolver.instance;
  }

  private registerStandardCapabilities() {
    // 1. Unity Capabilities
    this.addMapping({
      capability: "create_gameobject",
      provider: "unity-gamedev",
      preferredTool: "gameobject-create-configured",
      fallbackTools: ["gameobject-create"],
      description: "Creates and configures a new GameObject or primitive in the active Unity scene in a single call",
      normalizeParams: (p) => {
        const out = { ...p };
        if (!out.name && out.objectName) out.name = out.objectName;
        if (!out.primitiveType && out.type) out.primitiveType = out.type;
        return out;
      },
    });

    this.addMapping({
      capability: "create_gameobject_configured",
      provider: "unity-gamedev",
      preferredTool: "gameobject-create-configured",
      fallbackTools: ["gameobject-create"],
      description: "Atomically creates and configures a GameObject/primitive with transform and color in 1 call",
      normalizeParams: (p) => {
        const out = { ...p };
        if (!out.name && out.objectName) out.name = out.objectName;
        if (!out.primitiveType && out.type) out.primitiveType = out.type;
        return out;
      },
    });

    this.addMapping({
      capability: "configure_material",
      provider: "unity-gamedev",
      preferredTool: "gameobject-configure-material",
      fallbackTools: ["script-execute"],
      description: "Atomically configures material and color on any existing GameObject safely",
      normalizeParams: (p) => {
        const out = { ...p };
        if (!out.name && out.objectName) out.name = out.objectName;
        return out;
      },
    });

    this.addMapping({
      capability: "modify_gameobject",
      provider: "unity-gamedev",
      preferredTool: "gameobject-modify",
      description: "Modifies properties of a GameObject (active, tag, layer, name)",
      normalizeParams: (p) => {
        const out = { ...p };
        if (!out.gameObjectRef) {
          const targetName = out.name || out.target || out.gameObjectName;
          if (out.instanceID !== undefined) out.gameObjectRef = { instanceID: Number(out.instanceID) };
          else if (targetName) out.gameObjectRef = { name: targetName, instanceID: 0 };
        }
        return out;
      },
    });

    this.addMapping({
      capability: "find_gameobject",
      provider: "unity-gamedev",
      preferredTool: "gameobject-find",
      description: "Searches and locates GameObjects in the active scene",
      normalizeParams: (p) => {
        const out = { ...p };
        if (!out.gameObjectRef) {
          const targetName = out.search || out.name || out.target || out.gameObjectName;
          if (targetName) out.gameObjectRef = { name: targetName, instanceID: 0 };
          else if (out.instanceID !== undefined) out.gameObjectRef = { instanceID: Number(out.instanceID) };
        }
        return out;
      },
    });

    this.addMapping({
      capability: "inspect_object",
      provider: "unity-gamedev",
      preferredTool: "object-get-data",
      description: "Inspects full components and properties of a GameObject by reference",
      normalizeParams: (p) => {
        const out = { ...p };
        if (!out.objectRef) {
          if (out.instanceID !== undefined) out.objectRef = { instanceID: Number(out.instanceID) };
          else if (out.objectId !== undefined) out.objectRef = { instanceID: Number(out.objectId) };
        }
        return out;
      },
    });

    this.addMapping({
      capability: "destroy_gameobject",
      provider: "unity-gamedev",
      preferredTool: "gameobject-destroy",
      description: "Safely destroys a GameObject in the scene",
      normalizeParams: (p) => {
        const out = { ...p };
        if (!out.gameObjectRef) {
          const targetName = out.name || out.target || out.gameObjectName;
          if (out.instanceID !== undefined) out.gameObjectRef = { instanceID: Number(out.instanceID) };
          else if (targetName) out.gameObjectRef = { name: targetName, instanceID: 0 };
        }
        return out;
      },
    });

    this.addMapping({
      capability: "add_component",
      provider: "unity-gamedev",
      preferredTool: "gameobject-component-add",
      description: "Adds a Component to a specified GameObject",
      normalizeParams: (p) => {
        const out = { ...p };
        if (!out.gameObjectRef) {
          const targetName = out.name || out.target || out.gameObjectName;
          if (out.instanceID !== undefined) out.gameObjectRef = { instanceID: Number(out.instanceID) };
          else if (targetName) out.gameObjectRef = { name: targetName, instanceID: 0 };
        }
        if (!out.componentType && out.type) out.componentType = out.type;
        return out;
      },
    });

    this.addMapping({
      capability: "modify_component",
      provider: "unity-gamedev",
      preferredTool: "gameobject-component-modify",
      description: "Modifies fields or properties of a Component",
      normalizeParams: (p) => p,
    });

    this.addMapping({
      capability: "execute_script",
      provider: "unity-gamedev",
      preferredTool: "script-execute",
      description: "Executes C# code or method in Unity Editor via GameDev MCP",
      normalizeParams: (p) => {
        const out = { ...p };
        if (!out.csharpCode && (out.script || out.code)) {
          out.csharpCode = out.script || out.code;
        }
        if (typeof out.csharpCode === "string" && out.isMethodBody === undefined) {
          if (!out.csharpCode.includes("class ") && !out.csharpCode.includes("namespace ")) {
            out.isMethodBody = true;
          }
        }
        return out;
      },
    });

    this.addMapping({
      capability: "get_scene_data",
      provider: "unity-gamedev",
      preferredTool: "scene-get-data",
      description: "Retrieves active Unity scene root count and hierarchy",
      normalizeParams: (p) => p,
    });

    this.addMapping({
      capability: "save_scene",
      provider: "unity-gamedev",
      preferredTool: "scene-save",
      description: "Saves current scene changes to disk",
      normalizeParams: (p) => p,
    });

    this.addMapping({
      capability: "get_console_logs",
      provider: "unity-gamedev",
      preferredTool: "console-get-logs",
      description: "Fetches live Unity Editor console logs",
      normalizeParams: (p) => p,
    });

    this.addMapping({
      capability: "clear_console_logs",
      provider: "unity-gamedev",
      preferredTool: "console-clear-logs",
      description: "Clears console logs in Unity Editor",
      normalizeParams: (p) => p,
    });

    this.addMapping({
      capability: "build_project",
      provider: "unity-gamedev",
      preferredTool: "build-player",
      fallbackTools: ["script-execute"],
      description: "Builds the Unity project into executable or package",
      normalizeParams: (p) => p,
    });

    // 2. Core / File System Capabilities
    this.addMapping({
      capability: "file_create",
      provider: "localbridge-core",
      preferredTool: "nexus_file_create",
      fallbackTools: ["localbridge_file_create"],
      description: "Creates a new file in project directory",
      normalizeParams: (p) => p,
    });

    this.addMapping({
      capability: "file_read",
      provider: "localbridge-core",
      preferredTool: "nexus_file_read",
      fallbackTools: ["localbridge_file_read"],
      description: "Reads file content from project directory",
      normalizeParams: (p) => p,
    });

    this.addMapping({
      capability: "file_write",
      provider: "localbridge-core",
      preferredTool: "nexus_file_write",
      fallbackTools: ["localbridge_file_write"],
      description: "Updates file content in project directory",
      normalizeParams: (p) => p,
    });

    this.addMapping({
      capability: "git_status",
      provider: "localbridge-core",
      preferredTool: "nexus_git_status",
      fallbackTools: ["localbridge_git_status"],
      description: "Queries Git status of project repository",
      normalizeParams: (p) => p,
    });

    // 3. Generic Extensible Capabilities (Blender / Browser / Custom)
    this.addMapping({
      capability: "blender_render",
      provider: "blender-mcp",
      preferredTool: "blender-render-frame",
      description: "Renders 3D frame or asset via Blender MCP",
      normalizeParams: (p) => p,
    });

    this.addMapping({
      capability: "browser_navigate",
      provider: "browser-mcp",
      preferredTool: "browser-open",
      description: "Navigates to URL in headless or live browser",
      normalizeParams: (p) => p,
    });
  }

  public addMapping(mapping: CapabilityMapping) {
    const list = this.mappings.get(mapping.capability) || [];
    list.push(mapping);
    this.mappings.set(mapping.capability, list);
  }

  /**
   * Resolves a capability to an actual MCP tool name and normalized parameters
   */
  public resolve(
    capability: string,
    providerHint?: string,
    rawParams: Record<string, any> = {},
    availableTools?: Set<string>
  ): {
    provider: string;
    toolName: string;
    normalizedParams: Record<string, any>;
    isDirectPassthrough: boolean;
  } {
    // 1. Direct tool passthrough: If caller explicitly passed an existing tool name as capability
    if (availableTools && availableTools.has(capability)) {
      return {
        provider: providerHint || "unknown",
        toolName: capability,
        normalizedParams: rawParams,
        isDirectPassthrough: true,
      };
    }

    // 2. Query capability mappings
    const list = this.mappings.get(capability.toLowerCase().trim());
    if (!list || list.length === 0) {
      // Fallback: treat capability name as tool name directly
      return {
        provider: providerHint || "default",
        toolName: capability,
        normalizedParams: rawParams,
        isDirectPassthrough: true,
      };
    }

    // Match provider hint if supplied
    let matched = list[0];
    if (providerHint) {
      const found = list.find((m) => m.provider.toLowerCase() === providerHint.toLowerCase());
      if (found) matched = found;
    }

    // Check if preferred tool is available in runtime catalog
    let toolToUse = matched.preferredTool;
    if (availableTools && !availableTools.has(toolToUse)) {
      const fallback = matched.fallbackTools?.find((t) => availableTools.has(t));
      if (fallback) {
        toolToUse = fallback;
      }
    }

    return {
      provider: matched.provider,
      toolName: toolToUse,
      normalizedParams: matched.normalizeParams(rawParams),
      isDirectPassthrough: false,
    };
  }

  /**
   * List all registered capabilities for AI / Web exposure
   */
  public listCapabilities(): Array<{
    capability: string;
    provider: string;
    tool: string;
    description: string;
  }> {
    const res: Array<{
      capability: string;
      provider: string;
      tool: string;
      description: string;
    }> = [];

    for (const [_, list] of this.mappings) {
      for (const m of list) {
        res.push({
          capability: m.capability,
          provider: m.provider,
          tool: m.preferredTool,
          description: m.description,
        });
      }
    }

    return res;
  }
}
