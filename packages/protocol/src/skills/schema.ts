import { z } from "zod";

export const SKILL_ID_REGEX = /^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/;

export const SkillIdSchema = z
  .string()
  .min(3, "Skill ID must be at least 3 characters")
  .max(64, "Skill ID cannot exceed 64 characters")
  .regex(
    SKILL_ID_REGEX,
    "Skill ID must contain only lowercase alphanumeric characters, dots, hyphens, and underscores, and cannot start or end with a special character"
  )
  .refine(
    (id) => !id.includes("..") && !id.includes("/") && !id.includes("\\"),
    "Skill ID cannot contain directory traversal characters or slashes"
  )
  .refine(
    (id) => !/[;&|`$><]/.test(id),
    "Skill ID cannot contain shell special characters"
  );

export const SkillI18nTextSchema = z
  .object({
    "zh-CN": z.string().min(1, "zh-CN text is required"),
    "en-US": z.string().min(1, "en-US text is required"),
  })
  .catchall(z.string());

export const SkillYamlSchema = z.object({
  id: SkillIdSchema,
  version: z.union([z.string(), z.number()]),
  name: SkillI18nTextSchema,
  description: SkillI18nTextSchema,
  category: z.enum([
    "inspection",
    "debugging",
    "testing",
    "refactoring",
    "review",
    "runtime",
    "maintenance",
    "general",
  ]),
  risk: z.enum(["low", "medium", "high"]),
  triggers: z.array(z.string().min(1)).min(1, "At least one trigger keyword is required"),
  tools: z.array(z.string().min(1)).min(1, "At least one tool must be declared"),
  workflow: z.array(z.string().min(1)).min(1, "At least one workflow step is required"),
  enabled: z.boolean().default(true),
});

export type SkillYamlInput = z.infer<typeof SkillYamlSchema>;

export const SkillListParamsSchema = z.object({
  projectId: z.string().optional(),
  collectionId: z.string().optional(),
  source: z.enum(["builtin", "user", "project", "external"]).optional(),
  enabledOnly: z.boolean().optional(),
  type: z.enum(["nexus", "raw"]).optional(),
});

export const SkillGetParamsSchema = z.object({
  skillId: z.string().min(1, "skillId is required"),
  projectId: z.string().optional(),
  documentPath: z.string().optional(),
});

export const SkillMatchParamsSchema = z.object({
  query: z.string().min(1, "query is required"),
  projectId: z.string().optional(),
  collectionId: z.string().optional(),
  layaRecommendation: z.string().optional(),
});

export const SkillBatchImportParamsSchema = z.object({
  sourceType: z.enum(["folder", "zip"]),
  sourcePath: z.string().optional(),
  zipBase64: z.string().optional(),
  target: z.enum(["user", "project"]),
  projectId: z.string().optional(),
  projectRoot: z.string().optional(),
  collectionName: z.string().optional(),
  selectedCandidateIds: z.array(z.string()).optional(),
  overwrite: z.boolean().optional(),
});


export const NexusSkillsSchema = z.object({
  action: z.enum(["list", "search", "load", "read_file", "refresh", "status"]).default("list").describe("Skill action to perform"),
  query: z.string().optional().describe("Search keyword for search action"),
  name: z.string().optional().describe("Target skill name or ID (supports 'source/name' for disambiguation)"),
  path: z.string().optional().describe("Relative file path within skill directory for read_file action"),
  source: z.string().optional().describe("Filter by skill source (e.g. chatgpt, cursor, antigravity, codex, custom)"),
  mode: z.enum(["compact", "full"]).optional().describe("Mode for load action: compact (text only) or full (includes directory inventory)"),
});
