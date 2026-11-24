import { z } from "zod";

export const NexusKnowledgeBudgetTierEnum = z.enum(["saver", "standard", "deep"]);
export type NexusKnowledgeBudgetTier = z.infer<typeof NexusKnowledgeBudgetTierEnum>;

export const NexusKnowledgeSearchParamsSchema = z.object({
  query: z.string().min(1).describe("检索关键词或自然语言问题"),
  budget_tier: NexusKnowledgeBudgetTierEnum.default("standard").describe("Token预算档位：saver (~1.2k) | standard (~2.5k) | deep (~6k)"),
  max_tokens: z.number().int().positive().optional().describe("最大返回 Token 数软预算上限"),
});
export type NexusKnowledgeSearchParams = z.infer<typeof NexusKnowledgeSearchParamsSchema>;

export const NexusKnowledgeReadHandleParamsSchema = z.object({
  handle: z.string().min(1).describe("检索结果中返回的临时知识切片句柄 (如 kh_xxxxxxxx)"),
});
export type NexusKnowledgeReadHandleParams = z.infer<typeof NexusKnowledgeReadHandleParamsSchema>;

export const NexusKnowledgeCommitParamsSchema = z.object({
  title: z.string().min(1).describe("知识文档标题"),
  content: z.string().describe("Markdown 正文内容"),
  projectId: z.string().optional().describe("关联的项目 ID，默认放入通用知识空间"),
  spaceId: z.string().default("space_default").describe("知识空间 ID"),
});
export type NexusKnowledgeCommitParams = z.infer<typeof NexusKnowledgeCommitParamsSchema>;

export const NexusKnowledgeCheckpointParamsSchema = z.object({
  projectId: z.string().default("proj_nexus").describe("关联的项目 ID"),
  milestone: z.string().min(1).describe("项目里程碑名称"),
  phase: z.string().default("active").describe("当前阶段状态"),
  completedTasks: z.array(z.string()).default([]).describe("已完成的任务列表"),
  pendingTasks: z.array(z.string()).default([]).describe("待完成的后续任务列表"),
  evidence: z.array(z.string()).default([]).describe("验证通过的测试或工程证据"),
});
export type NexusKnowledgeCheckpointParams = z.infer<typeof NexusKnowledgeCheckpointParamsSchema>;

export const NexusKnowledgeHandoffParamsSchema = z.object({
  projectId: z.string().default("proj_nexus").describe("关联的项目 ID"),
  fromAi: z.string().describe("当前交接的 AI 名称，如 ChatGPT"),
  toAi: z.string().describe("接收任务的目标 AI 名称，如 Claude"),
});
export type NexusKnowledgeHandoffParams = z.infer<typeof NexusKnowledgeHandoffParamsSchema>;

// ============================================================================
// Nexus Knowledge Full UI & Lifecycle Automation Schemas
// ============================================================================

export const NexusKnowledgeGetActiveDocParamsSchema = z.object({}).describe("获取当前在 Nexus Knowledge 屏幕主窗口中打开的笔记状态与实时内容");
export type NexusKnowledgeGetActiveDocParams = z.infer<typeof NexusKnowledgeGetActiveDocParamsSchema>;

export const NexusKnowledgeOpenDocParamsSchema = z.object({
  doc_id: z.string().optional().describe("要打开的文档 ID (如 doc_xxxx)"),
  title: z.string().optional().describe("或要打开的文档标题"),
  enter_edit_mode: z.boolean().default(false).describe("打开后是否自动进入编辑模式"),
}).describe("命令 Nexus Knowledge 在前台主窗口打开指定文档");
export type NexusKnowledgeOpenDocParams = z.infer<typeof NexusKnowledgeOpenDocParamsSchema>;

export const NexusKnowledgeSetEditModeParamsSchema = z.object({
  editing: z.boolean().describe("true 进入可编辑输入模式，false 退出编辑切回阅读模式"),
}).describe("切换当前笔记的编辑/阅读模式");
export type NexusKnowledgeSetEditModeParams = z.infer<typeof NexusKnowledgeSetEditModeParamsSchema>;

export const NexusKnowledgeWriteEditorParamsSchema = z.object({
  content: z.string().describe("需要写入、追加或打补丁的内容 (支持完整 Markdown)"),
  mode: z.enum(["replace", "append", "prepend", "patch"]).default("replace").describe("写入模式：replace(全量替换) | append(末尾追加) | prepend(开头插入) | patch(局部替换)"),
  target_text: z.string().optional().describe("当 mode 为 patch 时，被替换的目标文本段落"),
  auto_save: z.boolean().default(true).describe("写入完成后是否立即持久化自动保存 (默认 true)"),
  doc_id: z.string().optional().describe("目标文档 ID，留空则自动作用于当前正在打开的笔记"),
  title: z.string().optional().describe("目标文档标题，若提供则自动按标题定位文档"),
}).describe("在需要编写时进入编辑模式并自动写入内容，并在编辑完成后原地自动保存");
export type NexusKnowledgeWriteEditorParams = z.infer<typeof NexusKnowledgeWriteEditorParamsSchema>;

export const NexusKnowledgeSaveActiveDocParamsSchema = z.object({}).describe("手动触发当前活跃编辑笔记的落盘持久化保存");
export type NexusKnowledgeSaveActiveDocParams = z.infer<typeof NexusKnowledgeSaveActiveDocParamsSchema>;

export const NexusKnowledgeSwitchViewParamsSchema = z.object({
  view: z.enum(["document", "graph", "memory", "projects", "checkpoints", "relay", "search"]).describe("要切换到的主功能界面：document(文档区) | graph(关系图谱) | memory(记忆库) | projects(项目) | checkpoints(里程碑检查点) | relay(跨AI接力) | search(高级搜索)"),
}).describe("命令 Nexus Knowledge 客户端切换至指定功能主视图");
export type NexusKnowledgeSwitchViewParams = z.infer<typeof NexusKnowledgeSwitchViewParamsSchema>;

export const NexusKnowledgeUiActionParamsSchema = z.object({
  action: z.enum(["toggle_ai_sidebar", "set_theme", "open_command_palette", "format_json"]).describe("UI 动作类型"),
  payload: z.record(z.string(), z.any()).optional().describe("动作附加参数，例如 set_theme 传 { theme: 'dark' }"),
}).describe("触发 Nexus Knowledge 客户端的界面操作（折叠侧边栏、切换主题、打开搜索面板等）");
export type NexusKnowledgeUiActionParams = z.infer<typeof NexusKnowledgeUiActionParamsSchema>;

export const NexusKnowledgeListDocsParamsSchema = z.object({
  space_id: z.string().optional().describe("知识空间 ID 过滤，默认 space_default"),
}).describe("列出 Nexus Knowledge 知识库中的全量笔记清单与基本元数据");
export type NexusKnowledgeListDocsParams = z.infer<typeof NexusKnowledgeListDocsParamsSchema>;

export const NexusKnowledgeCreateDocParamsSchema = z.object({
  title: z.string().min(1).describe("新建文档标题"),
  content: z.string().describe("Markdown 正文内容"),
  space_id: z.string().default("space_default").describe("知识空间 ID"),
  project_id: z.string().default("proj_nexus").describe("关联的项目 ID"),
  open_immediately: z.boolean().default(true).describe("创建后是否在前台立即打开并显示"),
}).describe("在知识库中创建新笔记并在左侧目录树实时高亮显示");
export type NexusKnowledgeCreateDocParams = z.infer<typeof NexusKnowledgeCreateDocParamsSchema>;

export const NexusKnowledgeUpdateDocParamsSchema = z.object({
  doc_id: z.string().min(1).describe("要修改的文档 ID"),
  title: z.string().optional().describe("修改后的文档标题，可选"),
  content: z.string().describe("更新后的完整 Markdown 正文"),
  change_summary: z.string().default("AI 协同编辑更新").describe("变更摘要"),
}).describe("原地更新知识库中任意已存在的笔记正文与标题");
export type NexusKnowledgeUpdateDocParams = z.infer<typeof NexusKnowledgeUpdateDocParamsSchema>;

export const NexusKnowledgeRenameDocParamsSchema = z.object({
  doc_id: z.string().min(1).describe("目标文档 ID"),
  new_name: z.string().min(1).describe("新标题名称"),
}).describe("重命名指定笔记文档");
export type NexusKnowledgeRenameDocParams = z.infer<typeof NexusKnowledgeRenameDocParamsSchema>;

export const NexusKnowledgeDeleteDocParamsSchema = z.object({
  doc_id: z.string().min(1).describe("目标文档 ID"),
  permanent: z.boolean().default(false).describe("是否永久物理删除，默认 false 移入回收站"),
}).describe("删除知识库笔记或移入回收站");
export type NexusKnowledgeDeleteDocParams = z.infer<typeof NexusKnowledgeDeleteDocParamsSchema>;
