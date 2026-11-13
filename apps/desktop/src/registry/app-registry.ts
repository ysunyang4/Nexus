/**
 * Nexus UI 2.0 — Application Registry
 * 
 * Manages registered application manifests and decouples sidebar navigation from individual apps.
 */

import { type AppManifest, type AppGroup, UNITY_MANIFEST } from "./app-manifest.js";

class ApplicationRegistry {
  private manifests = new Map<string, AppManifest>();

  constructor() {
    // 默认注册 Unity 外部工作区
    this.register(UNITY_MANIFEST);
  }

  register(manifest: AppManifest): void {
    this.manifests.set(manifest.id, manifest);
  }

  unregister(id: string): void {
    this.manifests.delete(id);
  }

  get(id: string): AppManifest | undefined {
    return this.manifests.get(id);
  }

  getAppsByGroup(group: AppGroup): AppManifest[] {
    return Array.from(this.manifests.values()).filter((m) => m.group === group);
  }

  getAll(): AppManifest[] {
    return Array.from(this.manifests.values());
  }
}

export const appRegistry = new ApplicationRegistry();
