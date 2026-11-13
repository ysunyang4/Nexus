/**
 * Nexus UI 2.0 — Application Manifest Definition
 * 
 * Standard contract for managed external engineering workspaces (Unity, Blender, Maya, etc.)
 */

export type AppGroup = "apps";

export type AppConnectionStatus = "CONNECTED" | "DISCONNECTED" | "UNKNOWN" | "FAILED";

export interface AppManifest {
  id: string;
  name: string;
  icon: string;
  group: AppGroup;
  statusSource: string;
  tabs: string[];
}

export const UNITY_MANIFEST: AppManifest = {
  id: "unity",
  name: "Unity GameDev MCP",
  icon: "unity",
  group: "apps",
  statusSource: "provider.unity-gamedev.status",
  tabs: ["tools"],
};
