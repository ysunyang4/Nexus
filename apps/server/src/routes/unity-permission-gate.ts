/**
 * Unity Project Builder — Backend Permission Gate & Execution Strategy Controller
 * 
 * Strict 5 Permission Levels:
 * L1 Scene Viewer   -> Read-only Scene / Hierarchy / Inspector / Runtime state / Evidence
 * L2 Scene Builder  -> L1 + Scene / GameObject / Transform / Component / Property / Material / Prefab / UI
 * L3 Code Builder   -> L1 + Script / Code / Compile / Diagnostics
 * L4 Scene + Code   -> L2 + L3
 * L5 Full Control   -> L4 + Project / Packages / Assets / Runtime / Build / Editor UI / Computer UI
 * 
 * Execution Modes:
 * FAST -> Direct execution, shallow verification, no spec extension, no replan loop
 * DEEP -> Extended reasoning, comprehensive multi-round verification, dynamic diagnostics, auto-repair loop
 */

export type UnityPermissionLevel = "L1" | "L2" | "L3" | "L4" | "L5";
export type UnityExecutionMode = "FAST" | "DEEP";

export interface PermissionCheckResult {
  allowed: boolean;
  permissionLevel: UnityPermissionLevel;
  requiredLevel: UnityPermissionLevel;
  operationId: string;
  capabilityId: string;
  reason?: string;
}

export interface ExecutionStrategyConfig {
  mode: UnityExecutionMode;
  verificationDepth: "shallow" | "deep";
  autoRepair: boolean;
  maxReplanningRounds: number;
  specExtensionAllowed: boolean;
  timeoutMultiplier: number;
}

export class UnityPermissionGate {
  private static readonly READ_ONLY_OPERATIONS = new Set<string>([
    "scene.query",
    "hierarchy.query",
    "gameobject.query",
    "component.query",
    "asset.query",
    "lighting.query",
    "prefab.query",
    "runtime.query",
    "console.query",
    "ledger.query",
    "evidence.query",
    "status.query",
    "compilation.gate.status",
    "reflection.inspect_type",
    "reflection.list_types",
    "reflection.list_fields",
    "reflection.list_methods",
    "assets-find",
    "assets-find-built-in",
    "assets-get-data",
    "assets-shader-get-data",
    "assets-shader-list-all",
    "console-get-logs",
    "gameobject-find",
    "gameobject-component-get",
    "gameobject-component-list-all",
    "object-get-data",
    "scene-get-data",
    "scene-list-opened",
    "screenshot-isolated",
    "unity-tool-list",
  ]);

  private static readonly SCENE_MUTATION_OPERATIONS = new Set<string>([
    "scene.create",
    "scene.save",
    "scene.open",
    "scene.set_active",
    "gameobject.create",
    "gameobject.delete",
    "gameobject.rename",
    "gameobject.set_parent",
    "gameobject.set_active",
    "transform.set_transform",
    "component.add",
    "component.remove",
    "component.modify_property",
    "binding.attach_monobehaviour",
    "binding.bind_serialized_reference",
    "binding.bind_unity_event",
    "material.create",
    "material.set_properties",
    "material.assign_to_renderer",
    "prefab.create_from_object",
    "prefab.instantiate",
    "prefab.apply_overrides",
    "prefab.revert_overrides",
    "ui.create_canvas",
    "ui.create_element",
    "ui.set_rect_transform",
    "lighting.set_environment",
    "lighting.set_main_light",
    "assets-material-create",
    "assets-modify",
    "assets-refresh",
    "assets-prefab-close",
    "assets-prefab-create",
    "assets-prefab-instantiate",
    "assets-prefab-open",
    "assets-prefab-save",
    "gameobject-create",
    "gameobject-destroy",
    "gameobject-duplicate",
    "gameobject-modify",
    "gameobject-set-parent",
    "gameobject-component-add",
    "gameobject-component-destroy",
    "gameobject-component-modify",
    "object-modify",
    "scene-create",
    "scene-open",
    "scene-save",
    "scene-set-active",
    "scene-unload",
  ]);

  private static readonly CODE_MUTATION_OPERATIONS = new Set<string>([
    "script.create",
    "script.modify",
    "script.delete",
    "code.create",
    "code.modify",
    "code.delete",
    "compilation.execute",
    "compilation.trigger",
    "diagnostics.execute",
    "script-execute",
    "tests-run",
  ]);

  private static readonly FULL_CONTROL_OPERATIONS = new Set<string>([
    "project.register",
    "project.unregister",
    "project.switch",
    "package.install",
    "package.remove",
    "package.update",
    "asset.import",
    "asset.cleanup",
    "asset.reimport",
    "build.execute",
    "build.cancel",
    "build.recover",
    "release.create",
    "release.export",
    "release.rollback",
    "deployment.deploy",
    "deployment.rollback",
    "pipeline.execute",
    "pipeline.abort",
    "version.snapshot_create",
    "version.snapshot_restore",
    "version.rollback",
    "runtime.mutate",
    "runtime.play",
    "runtime.pause",
    "runtime.stop",
    "editor.ui_control",
    "computer.takeover",
  ]);

  /**
   * Determine the minimum permission level required for a given operation
   */
  public static getRequiredLevel(operationId: string, _capabilityId?: string): UnityPermissionLevel {
    const op = operationId.toLowerCase();

    // Check if it's purely read-only
    if (this.READ_ONLY_OPERATIONS.has(op) || op.endsWith(".query") || op.startsWith("get_") || op.includes(".read")) {
      return "L1";
    }

    // Check if it's code/script operation
    if (this.CODE_MUTATION_OPERATIONS.has(op) || op.includes("script") || op.includes("code") || op.includes("compile")) {
      return "L3";
    }

    // Check if it's scene construction operation
    if (
      this.SCENE_MUTATION_OPERATIONS.has(op) ||
      op.includes("gameobject") ||
      op.includes("transform") ||
      op.includes("component") ||
      op.includes("material") ||
      op.includes("prefab") ||
      op.includes("ui.") ||
      op.includes("lighting.")
    ) {
      return "L2";
    }

    // Check if it's full project / package / build / lifecycle operation
    if (
      this.FULL_CONTROL_OPERATIONS.has(op) ||
      op.includes("build") ||
      op.includes("release") ||
      op.includes("deploy") ||
      op.includes("package") ||
      op.includes("project.") ||
      op.includes("runtime.mutate") ||
      op.includes("runtime.play") ||
      op.includes("rollback")
    ) {
      return "L5";
    }

    // Fallback default for any unrecognized mutative operation: require L5
    return "L5";
  }

  /**
   * Check if current permission level allows the operation
   */
  public static check(
    currentLevel: UnityPermissionLevel,
    operationId: string,
    capabilityId: string = ""
  ): PermissionCheckResult {
    const requiredLevel = this.getRequiredLevel(operationId, capabilityId);

    // L1: Only allows L1 operations
    if (currentLevel === "L1") {
      if (requiredLevel === "L1") {
        return { allowed: true, permissionLevel: currentLevel, requiredLevel, operationId, capabilityId };
      }
      return {
        allowed: false,
        permissionLevel: currentLevel,
        requiredLevel,
        operationId,
        capabilityId,
        reason: `PERMISSION_DENIED: L1 Scene Viewer allows read-only inspection only. '${operationId}' requires ${requiredLevel}.`,
      };
    }

    // L2: Allows L1 + Scene operations (L2)
    if (currentLevel === "L2") {
      if (requiredLevel === "L1" || requiredLevel === "L2") {
        return { allowed: true, permissionLevel: currentLevel, requiredLevel, operationId, capabilityId };
      }
      return {
        allowed: false,
        permissionLevel: currentLevel,
        requiredLevel,
        operationId,
        capabilityId,
        reason: `PERMISSION_DENIED: L2 Scene Builder does not have code or project production permissions. '${operationId}' requires ${requiredLevel}.`,
      };
    }

    // L3: Allows L1 + Code operations (L3)
    if (currentLevel === "L3") {
      if (requiredLevel === "L1" || requiredLevel === "L3") {
        return { allowed: true, permissionLevel: currentLevel, requiredLevel, operationId, capabilityId };
      }
      return {
        allowed: false,
        permissionLevel: currentLevel,
        requiredLevel,
        operationId,
        capabilityId,
        reason: `PERMISSION_DENIED: L3 Code Builder does not have scene mutation or project production permissions. '${operationId}' requires ${requiredLevel}.`,
      };
    }

    // L4: Allows L1 + L2 + L3 (Scene + Code)
    if (currentLevel === "L4") {
      if (requiredLevel === "L1" || requiredLevel === "L2" || requiredLevel === "L3") {
        return { allowed: true, permissionLevel: currentLevel, requiredLevel, operationId, capabilityId };
      }
      return {
        allowed: false,
        permissionLevel: currentLevel,
        requiredLevel,
        operationId,
        capabilityId,
        reason: `PERMISSION_DENIED: L4 Scene + Code does not have Project Production permissions (Requires L5 Full Control). '${operationId}' requires L5.`,
      };
    }

    // L5: Full Control (Allows everything)
    if (currentLevel === "L5") {
      return { allowed: true, permissionLevel: currentLevel, requiredLevel, operationId, capabilityId };
    }

    return {
      allowed: false,
      permissionLevel: currentLevel,
      requiredLevel: "L5",
      operationId,
      capabilityId,
      reason: `PERMISSION_DENIED: Unrecognized permission level '${currentLevel}'`,
    };
  }

  /**
   * Get execution strategy settings based on mode
   */
  public static getStrategyConfig(mode: UnityExecutionMode): ExecutionStrategyConfig {
    if (mode === "FAST") {
      return {
        mode: "FAST",
        verificationDepth: "shallow",
        autoRepair: false,
        maxReplanningRounds: 0,
        specExtensionAllowed: false,
        timeoutMultiplier: 1.0,
      };
    }

    return {
      mode: "DEEP",
      verificationDepth: "deep",
      autoRepair: true,
      maxReplanningRounds: 3,
      specExtensionAllowed: true,
      timeoutMultiplier: 2.5,
    };
  }
}
