import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type {
  SkillDefinition,
  SkillMetadata,
  SkillListFilter,
  SkillMatchResult,
  SkillCollection,
  SkillSource,
  ExternalSkillSourceConfig,
  NexusSkillsParams,
} from "@localbridge/protocol";
import type { SkillLoader } from "./skill-loader.js";
import { SkillResolver } from "./skill-resolver.js";

export class SkillRegistry {
  private skills = new Map<string, SkillDefinition>();
  private readonly resolver: SkillResolver;

  constructor(private readonly loader: SkillLoader) {
    this.resolver = new SkillResolver(this);
    this.reload();
  }

  reload(projectDirs: Array<{ projectId: string; rootPath: string }> = []): void {
    const loaded = this.loader.loadAll(projectDirs);
    this.skills.clear();

    // Pass 1: Built-in skills
    for (const skill of loaded) {
      if (skill.source === "builtin") {
        this.skills.set(skill.id, skill);
      }
    }

    // Pass 2: User and Project skills
    for (const skill of loaded) {
      if (skill.source === "builtin" || skill.source === "external") continue;

      const existing = this.skills.get(skill.id);
      if (existing) {
        if (existing.source === "builtin") {
          this.skills.set(`${skill.id}__conflict_${skill.source}_${skill.projectId || "user"}`, {
            ...skill,
            enabled: false,
            validationStatus: "conflict",
            validationErrors: [
              ...(skill.validationErrors || []),
              `Skill ID '${skill.id}' conflicts with official built-in skill namespace and cannot be loaded`,
            ],
          });
        } else {
          this.skills.set(`${skill.id}__conflict_${Date.now()}`, {
            ...skill,
            enabled: false,
            validationStatus: "conflict",
            validationErrors: [
              ...(skill.validationErrors || []),
              `Duplicate skill ID '${skill.id}' detected from ${skill.sourcePath}`,
            ],
          });
        }
      } else {
        this.skills.set(skill.id, skill);
      }
    }

    // Pass 3: External Zero-Copy Skills
    for (const skill of loaded) {
      if (skill.source !== "external") continue;
      const existing = this.skills.get(skill.id);
      if (existing) {
        this.skills.set(`${skill.id}__ext_${skill.originAgent || "ext"}`, skill);
      } else {
        this.skills.set(skill.id, skill);
      }
    }
  }

  listSkills(filter: SkillListFilter = {}): SkillMetadata[] {
    const results: SkillMetadata[] = [];

    for (const skill of this.skills.values()) {
      if (skill.source === "project") {
        if (!filter.projectId || skill.projectId !== filter.projectId) {
          continue;
        }
      }

      if (filter.category && skill.category !== filter.category) {
        continue;
      }

      if (filter.source && skill.source !== filter.source) {
        continue;
      }

      if (filter.collectionId && skill.collectionId !== filter.collectionId) {
        continue;
      }

      if (filter.type && skill.type !== filter.type) {
        continue;
      }

      if (filter.enabledOnly && !skill.enabled) {
        continue;
      }

      const { instructions: _unused, ...meta } = skill;
      results.push(meta);
    }

    return results;
  }

  listCollections(filter: { projectId?: string; source?: SkillSource } = {}): SkillCollection[] {
    const collectionMap = new Map<string, SkillCollection>();

    for (const skill of this.skills.values()) {
      if (skill.source === "project" && filter.projectId && skill.projectId !== filter.projectId) {
        continue;
      }
      if (filter.source && skill.source !== filter.source) {
        continue;
      }
      if (!skill.collectionId) {
        continue;
      }

      let coll = collectionMap.get(skill.collectionId);
      if (!coll) {
        coll = {
          id: skill.collectionId,
          name: skill.collectionName || skill.collectionId.replace(/^collection\./, ""),
          source: skill.source,
          skillsCount: 0,
          enabledSkillsCount: 0,
          skillIds: [],
          importedAt: skill.importedAt,
        };
        collectionMap.set(skill.collectionId, coll);
      }

      coll.skillsCount++;
      if (skill.enabled) {
        coll.enabledSkillsCount++;
      }
      coll.skillIds.push(skill.id);
    }

    return Array.from(collectionMap.values());
  }

  getCollection(collectionId: string, projectId?: string): SkillCollection | null {
    const list = this.listCollections({ projectId });
    return list.find((c) => c.id === collectionId) || null;
  }

  getSkill(id: string, projectId?: string): SkillDefinition | null {
    const skill = this.skills.get(id);
    if (!skill) {
      return null;
    }

    if (skill.source === "project" && projectId && skill.projectId !== projectId) {
      return null;
    }

    return skill;
  }

  toggleSkill(id: string, enabled: boolean): boolean {
    const skill = this.skills.get(id);
    if (!skill) {
      return false;
    }

    if (enabled && (skill.validationStatus === "invalid" || skill.validationStatus === "conflict")) {
      return false;
    }

    skill.enabled = enabled;

    try {
      if (skill.sourcePath) {
        const rawJsonPath = path.join(skill.sourcePath, "raw-skill.json");
        if (fs.existsSync(rawJsonPath)) {
          const content = JSON.parse(fs.readFileSync(rawJsonPath, "utf-8"));
          content.enabled = enabled;
          fs.writeFileSync(rawJsonPath, JSON.stringify(content, null, 2), "utf-8");
        } else {
          const yamlPath = path.join(skill.sourcePath, "skill.yaml");
          const ymlPath = path.join(skill.sourcePath, "skill.yml");
          const activeYaml = fs.existsSync(yamlPath) ? yamlPath : fs.existsSync(ymlPath) ? ymlPath : null;
          if (activeYaml) {
            const parsed = YAML.parse(fs.readFileSync(activeYaml, "utf-8")) || {};
            parsed.enabled = enabled;
            fs.writeFileSync(activeYaml, YAML.stringify(parsed), "utf-8");
          }
        }
      }
    } catch {}

    return true;
  }

  toggleCollection(
    collectionId: string,
    enabled: boolean,
    projectId?: string
  ): { success: boolean; modifiedCount: number; skills: SkillMetadata[] } {
    const list = this.listSkills({ collectionId, projectId });
    let modified = 0;
    for (const skill of list) {
      if (this.toggleSkill(skill.id, enabled)) {
        modified++;
      }
    }
    const updated = this.listSkills({ collectionId, projectId });
    return { success: true, modifiedCount: modified, skills: updated };
  }

  removeSkill(id: string): boolean {
    let deleted = this.skills.delete(id);
    for (const [key, skill] of this.skills.entries()) {
      if (skill.id === id || key.startsWith(`${id}__conflict_`)) {
        this.skills.delete(key);
        deleted = true;
      }
    }
    return deleted;
  }

  matchSkills(
    query: string,
    projectId?: string,
    layaRecommendation?: string,
    collectionId?: string
  ): SkillMatchResult {
    return this.resolver.resolve(query, projectId, layaRecommendation, collectionId);
  }

  // --- External Source Management ---

  getExternalSources(): ExternalSkillSourceConfig[] {
    const configs = this.loader.loadExternalSourceConfigs();
    const allSkills = Array.from(this.skills.values());
    for (const cfg of configs) {
      cfg.skillsCount = allSkills.filter(
        (s) => s.source === "external" && (s.originAgent === cfg.id || s.originAgent === cfg.agentType)
      ).length;
    }
    return configs;
  }

  toggleExternalSource(id: string, enabled: boolean): ExternalSkillSourceConfig[] {
    const configs = this.loader.loadExternalSourceConfigs();
    const target = configs.find((c) => c.id === id);
    if (target) {
      target.enabled = enabled;
      this.loader.saveExternalSourceConfigs(configs);
      this.reload();
    }
    return this.getExternalSources();
  }

  addExternalSource(customPath: string, name?: string): ExternalSkillSourceConfig[] {
    const resolved = path.resolve(customPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Directory does not exist: ${customPath}`);
    }
    const configs = this.loader.loadExternalSourceConfigs();
    const existing = configs.find((c) => path.resolve(c.path) === resolved);
    if (existing) {
      existing.enabled = true;
    } else {
      const id = `custom-${Date.now()}`;
      configs.push({
        id,
        name: name || path.basename(resolved),
        path: resolved,
        enabled: true,
        agentType: "custom",
        isCustom: true,
        available: true,
      });
    }
    this.loader.saveExternalSourceConfigs(configs);
    this.reload();
    return this.getExternalSources();
  }

  removeExternalSource(id: string): ExternalSkillSourceConfig[] {
    const configs = this.loader.loadExternalSourceConfigs();
    const index = configs.findIndex((c) => c.id === id);
    if (index !== -1) {
      configs.splice(index, 1);
      this.loader.saveExternalSourceConfigs(configs);
      this.reload();
    }
    return this.getExternalSources();
  }

  rescanExternalSources(): ExternalSkillSourceConfig[] {
    const configs = this.loader.loadExternalSourceConfigs();
    this.loader.saveExternalSourceConfigs(configs);
    this.reload();
    return this.getExternalSources();
  }

  // --- Meta-Tool Action Executor: nexus_skills ---

  async executeNexusSkills(params: NexusSkillsParams): Promise<any> {
    const action = (params?.action || "list") as any;
    switch (action) {
      case "match" as any: {
        const queryStr = ((params as any).query || (params as any).name || "").trim();
        const matchRes = this.matchSkills(queryStr, (params as any).projectId);
        return matchRes;
      }

      case "list": {
        const list = this.listSkills({ source: params.source as any });
        return {
          count: list.length,
          skills: list.map((s) => ({
            name: s.id,
            displayName:
              typeof s.name === "string" ? s.name : s.name?.["en-US"] || s.name?.["zh-CN"] || s.id,
            description:
              typeof s.description === "string"
                ? s.description
                : s.description?.["en-US"] || s.description?.["zh-CN"] || s.summary || "",
            source: s.originAgent || s.source,
            available: s.isAvailable !== false,
            needs_tools: s.tools || [],
            risk: s.risk || "low",
            triggers: s.triggers || [],
            workflow: s.workflow || [],
            sourcePath: s.sourcePath,
          })),
        };
      }

      case "search": {
        const q = (params.query || "").toLowerCase().trim();
        const all = this.listSkills({ source: params.source as any });
        const matched = all.filter((s) => {
          if (!q) return true;
          const nameStr = (
            typeof s.name === "string" ? s.name : `${s.name?.["en-US"]} ${s.name?.["zh-CN"]}`
          ).toLowerCase();
          const descStr = (
            typeof s.description === "string"
              ? s.description
              : `${s.description?.["en-US"]} ${s.description?.["zh-CN"]}`
          ).toLowerCase();
          const trigsStr = (s.triggers || []).join(" ").toLowerCase();
          return (
            s.id.toLowerCase().includes(q) ||
            nameStr.includes(q) ||
            descStr.includes(q) ||
            trigsStr.includes(q)
          );
        });

        return {
          count: matched.length,
          skills: matched.map((s) => ({
            name: s.id,
            displayName:
              typeof s.name === "string" ? s.name : s.name?.["en-US"] || s.name?.["zh-CN"] || s.id,
            description:
              typeof s.description === "string"
                ? s.description
                : s.description?.["en-US"] || s.description?.["zh-CN"] || "",
            source: s.originAgent || s.source,
            available: s.isAvailable !== false,
            needs_tools: s.tools || [],
            risk: s.risk || "low",
            triggers: s.triggers || [],
            workflow: s.workflow || [],
          })),
        };
      }

      case "get" as any:
      case "load": {
        const targetId = ((params as any).skillId || params.name || "").trim();
        if (!targetId) {
          throw new Error("Parameter 'name' or 'skillId' is required for action 'load'/'get'");
        }
        let skill = this.skills.get(targetId);
        if (!skill) {
          for (const [k, s] of this.skills.entries()) {
            if (
              k === targetId ||
              s.id === targetId ||
              path.basename(s.sourcePath) === targetId ||
              `${s.originAgent}/${path.basename(s.sourcePath)}` === targetId
            ) {
              skill = s;
              break;
            }
          }
        }
        if (!skill) {
          throw new Error(`Skill not found: ${targetId}`);
        }

        let instructions = skill.instructions || "";
        if (!instructions && skill.sourcePath) {
          const mdPath = path.join(skill.sourcePath, "SKILL.md");
          if (fs.existsSync(mdPath)) {
            instructions = fs.readFileSync(mdPath, "utf-8");
          }
        }

        // Rewrite relative paths inside instructions to absolute paths
        const absBase = skill.sourcePath.replace(/\\/g, "/");
        instructions = instructions.replace(
          /(\b(?:scripts|references|docs|assets)\/[a-zA-Z0-9_\-\.\/]+)/g,
          `${absBase}/$1`
        );

        // Scan references/ and scripts/ directories
        const files: Array<{ path: string; relPath: string; size: number }> = [];
        try {
          const scanDir = (dir: string, rel = "") => {
            if (!fs.existsSync(dir)) return;
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const e of entries) {
              const eRel = rel ? `${rel}/${e.name}` : e.name;
              const eAbs = path.join(dir, e.name);
              if (e.isDirectory()) {
                scanDir(eAbs, eRel);
              } else if (e.isFile()) {
                const st = fs.statSync(eAbs);
                files.push({ path: eAbs, relPath: eRel, size: st.size });
              }
            }
          };
          scanDir(path.join(skill.sourcePath, "scripts"), "scripts");
          scanDir(path.join(skill.sourcePath, "references"), "references");
        } catch {}

        const result: any = {
          name: skill.id,
          displayName:
            typeof skill.name === "string"
              ? skill.name
              : skill.name?.["en-US"] || skill.name?.["zh-CN"] || skill.id,
          description:
            typeof skill.description === "string"
              ? skill.description
              : skill.description?.["en-US"] || skill.description?.["zh-CN"] || "",
          source: skill.originAgent || skill.source,
          path: skill.sourcePath,
          available: skill.isAvailable !== false,
          triggers: skill.triggers || [],
          workflow: skill.workflow || [],
          tools: skill.tools || [],
          instructions,
          files,
        };

        if (params.mode === "full") {
          const fullFiles: Record<string, string> = {};
          for (const f of files.slice(0, 15)) {
            try {
              if (f.size < 65536) {
                fullFiles[f.relPath] = fs.readFileSync(f.path, "utf-8");
              }
            } catch {}
          }
          result.fileContents = fullFiles;
        }

        return result;
      }

      case "read_file": {
        const targetId = ((params as any).skillId || params.name || "").trim();
        const docRelPath = ((params as any).documentPath || params.path || "").trim();
        if (!targetId || !docRelPath) {
          throw new Error("Parameters 'name' (or 'skillId') and 'path' (or 'documentPath') are required for action 'read_file'");
        }
        let skill = this.skills.get(targetId);
        if (!skill) {
          for (const [k, s] of this.skills.entries()) {
            if (
              k === targetId ||
              s.id === targetId ||
              path.basename(s.sourcePath) === targetId ||
              `${s.originAgent}/${path.basename(s.sourcePath)}` === targetId
            ) {
              skill = s;
              break;
            }
          }
        }
        if (!skill) {
          throw new Error(`Skill not found: ${targetId}`);
        }

        const rootPath = path.resolve(skill.sourcePath);
        const targetFilePath = path.resolve(skill.sourcePath, docRelPath);
        if (!targetFilePath.startsWith(rootPath)) {
          throw new Error("Access denied: path traversal outside skill directory is forbidden");
        }
        if (!fs.existsSync(targetFilePath)) {
          throw new Error(`File not found: ${docRelPath}`);
        }

        const content = fs.readFileSync(targetFilePath, "utf-8");
        return {
          skill: skill.id,
          path: docRelPath,
          content,
        };
      }

      case "refresh": {
        this.reload();
        return {
          refreshed: true,
          totalSkills: this.skills.size,
          timestamp: new Date().toISOString(),
        };
      }

      case "status": {
        const configs = this.loader.loadExternalSourceConfigs();
        const allSkills = Array.from(this.skills.values());
        const sourcesStatus = configs.map((c) => {
          const srcSkills = allSkills.filter(
            (s) =>
              s.source === "external" && (s.originAgent === c.id || s.originAgent === c.agentType)
          );
          return {
            id: c.id,
            name: c.name,
            path: c.path,
            enabled: c.enabled,
            available: fs.existsSync(c.path),
            totalSkills: srcSkills.length,
            accessibleSkills: srcSkills.filter((s) => s.isAvailable !== false).length,
            brokenSkills: srcSkills
              .filter((s) => s.isAvailable === false)
              .map((s) => ({
                id: s.id,
                reason: s.readError || "Inaccessible",
              })),
          };
        });

        return {
          totalSkills: allSkills.length,
          sources: sourcesStatus,
          timestamp: new Date().toISOString(),
        };
      }

      default:
        throw new Error(`Unknown action: ${(params as any).action}`);
    }
  }
}
