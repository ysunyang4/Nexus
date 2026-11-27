import React, { useState, useEffect, useCallback } from "react";
import {
  Brain,
  Search,
  Plus,
  RefreshCw,
  Archive,
  CheckCircle,
  Layers,
  Tag,
  Trash2,
} from "lucide-react";
import { bridge } from "../api/bridge.js";
import { useTranslation } from "../i18n/useTranslation.js";

export const MemoryPage: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"memories" | "candidates">("memories");
  const [memories, setMemories] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedScope, setSelectedScope] = useState<string>("ALL");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newScope, setNewScope] = useState("PROJECT");
  const [newType, setNewType] = useState("FACT");
  const [newTags, setNewTags] = useState("");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === "memories") {
        const res = await bridge.getIntelligenceMemories({
          query: searchQuery || undefined,
          scope: selectedScope !== "ALL" ? selectedScope : undefined,
          limit: 100,
        });
        setMemories(res.memories || []);
      } else {
        const res = await bridge.listMemoryCandidates();
        setCandidates(res.candidates || []);
      }
    } catch (err: any) {
      setMessage({ text: err.message || "加载记忆数据失败", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [activeTab, searchQuery, selectedScope]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newContent.trim()) return;
    try {
      await bridge.setIntelligenceMemory({
        key: newKey.trim(),
        content: newContent.trim(),
        scope: newScope,
        type: newType,
        tags: newTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        source: "USER",
      });
      setIsAddModalOpen(false);
      setNewKey("");
      setNewContent("");
      setNewTags("");
      setMessage({ text: t.memory?.storedSuccess || "记忆已成功持久化至 IntelligenceStore", type: "success" });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || "保存记忆失败", type: "error" });
    }
  };

  const handleAcceptCandidate = async (candidateId: string) => {
    try {
      await bridge.acceptMemoryCandidate(candidateId);
      setMessage({ text: t.memory?.acceptedSuccess || "候选提案审核通过，已转为生效记忆", type: "success" });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || "接受候选提案失败", type: "error" });
    }
  };

  const handleRejectCandidate = async (candidateId: string) => {
    try {
      await bridge.rejectMemoryCandidate(candidateId);
      setMessage({ text: t.memory?.rejectedSuccess || "候选提案已拒绝并更新状态", type: "success" });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || "拒绝提案失败", type: "error" });
    }
  };

  const handleDeleteCandidate = async (candidateId: string) => {
    setCandidates((prev) => prev.filter((c) => c.candidateId !== candidateId));
    try {
      await bridge.deleteMemoryCandidate(candidateId);
      setMessage({ text: t.memory?.deletedCandidateSuccess || "候选提案已永久删除", type: "success" });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || "删除提案失败", type: "error" });
      loadData();
    }
  };

  const handleArchiveMemory = async (id: string, forget = false) => {
    try {
      await bridge.archiveIntelligenceMemory(id, forget);
      setMessage({ text: forget ? "记忆已永久遗忘" : "记忆已安全归档", type: "success" });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || "更新记忆状态失败", type: "error" });
    }
  };

  const handleDeleteMemory = async (id: string) => {
    setMemories((prev) => prev.filter((m) => m.id !== id));
    try {
      await bridge.deleteIntelligenceMemory(id);
      setMessage({ text: "记忆已从数据库永久删除并同步物理归档", type: "success" });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || "删除记忆失败", type: "error" });
      loadData();
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-theme-subtle pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[var(--btn-primary-bg)]/10 text-theme-primary border border-theme-subtle">
              <Brain className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-theme-primary">{t.memory?.title || "记忆库运行时"}</h1>
              <p className="text-xs text-theme-muted">
                {t.memory?.headerDesc || "服务端权威 SQLite/WAL 智能存储 • 单一权威事实源 (Single Source of Truth)"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--btn-primary-bg)] hover:opacity-90 text-[var(--btn-primary-text)] flex items-center gap-1.5 transition "
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.memory?.addMemory || "添加记忆"}</span>
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center justify-between ${
            message.type === "success"
              ? "bg-[var(--btn-primary-bg)]/10 text-[var(--success)] text-[var(--success)] border border-theme-subtle"
              : "bg-[var(--btn-primary-bg)]/10 text-[var(--warning)] text-[var(--warning)] border border-theme-subtle"
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-theme-muted hover:text-theme-primary">
            ✕
          </button>
        </div>
      )}

      {/* Tabs & Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-1 bg-theme-sidebar p-1 rounded-lg border border-theme-subtle">
          <button
            onClick={() => setActiveTab("memories")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
              activeTab === "memories"
                ? "bg-theme-card text-theme-primary "
                : "text-theme-muted hover:text-theme-primary"
            }`}
          >
            {t.memory?.activeMemories || "Active Memories"} ({memories.length})
          </button>
          <button
            onClick={() => setActiveTab("candidates")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
              activeTab === "candidates"
                ? "bg-theme-card text-theme-primary "
                : "text-theme-muted hover:text-theme-primary"
            }`}
          >
            {t.memory?.candidatesReview || "Candidates Review"} ({candidates.length})
          </button>
        </div>

        {activeTab === "memories" && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-theme-muted absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.memory?.searchPlaceholder || "Search memories..."}
                className="w-full bg-theme-card border border-theme-subtle rounded-lg pl-8 pr-3 py-1.5 text-xs text-theme-primary placeholder-theme-muted focus:outline-none border-theme-subtle"
              />
            </div>
            <select
              value={selectedScope}
              onChange={(e) => setSelectedScope(e.target.value)}
              className="bg-theme-card border border-theme-subtle rounded-lg px-2.5 py-1.5 text-xs text-theme-primary focus:outline-none border-theme-subtle"
            >
              <option value="ALL">{t.memory?.allScopes || "All Scopes"}</option>
              <option value="GLOBAL">GLOBAL</option>
              <option value="USER">USER</option>
              <option value="PROJECT">PROJECT</option>
              <option value="SESSION">SESSION</option>
              <option value="TASK">TASK</option>
            </select>
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 rounded-lg border border-theme-subtle hover:bg-theme-card-hover text-theme-muted"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {activeTab === "memories" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {memories.length === 0 ? (
            <div className="col-span-full text-center py-12 bg-theme-card rounded-xl border border-theme-subtle text-theme-muted">
              <Brain className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">{t.memory?.noMemoriesFound || "No memories found in IntelligenceStore"}</p>
              <p className="text-xs text-theme-muted mt-1">{t.memory?.noMemoriesDesc || "Actions and executions will automatically populate memories"}</p>
            </div>
          ) : (
            memories.map((m) => (
              <div
                key={m.id}
                className="bg-theme-card border border-theme-subtle rounded-xl p-4 flex flex-col justify-between hover:border-theme-muted transition  space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-semibold text-xs text-theme-primary truncate font-mono">{m.key}</span>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--btn-primary-bg)]/10 text-theme-primary border border-theme-subtle">
                      {m.scope}
                    </span>
                  </div>
                  <p className="text-xs text-theme-secondary line-clamp-4 leading-relaxed whitespace-pre-wrap">
                    {m.content}
                  </p>
                </div>

                <div className="pt-2 border-t border-theme-subtle flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[10px] text-theme-muted">
                    <span className="flex items-center gap-1">
                      <Layers className="w-3 h-3" />
                      {m.type}
                    </span>
                    <span>{t.memory?.confidence || "Confidence"}: {(m.confidence * 100).toFixed(0)}%</span>
                  </div>
                  {m.tags && m.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {m.tags.map((t: string) => (
                        <span
                          key={t}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-theme-sidebar text-theme-muted flex items-center gap-0.5"
                        >
                          <Tag className="w-2.5 h-2.5" />
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-theme-muted">v{m.version || 1}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleArchiveMemory(m.id, false)}
                        className="p-1 rounded text-theme-muted hover:text-[var(--warning)] transition"
                        title={t.memory?.archiveMemory || "Archive"}
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteMemory(m.id)}
                        className="p-1 rounded text-theme-muted hover:text-[var(--warning)] transition"
                        title="Delete Permanently"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {candidates.length === 0 ? (
            <div className="text-center py-12 bg-theme-card rounded-xl border border-theme-subtle text-theme-muted">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-40 text-[var(--success)]" />
              <p className="text-sm">{t.memory?.noCandidatesFound || "No pending memory candidates"}</p>
              <p className="text-xs text-theme-muted mt-1">
                {t.memory?.noCandidatesDesc || "Completed action executions automatically generate candidate proposals for review"}
              </p>
            </div>
          ) : (
            candidates.map((cand) => (
              <div
                key={cand.candidateId}
                className="bg-theme-card border border-theme-subtle rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-theme-muted transition"
              >
                <div className="space-y-1.5 max-w-3xl">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-theme-primary font-mono">{cand.key}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--btn-primary-bg)]/10 text-[var(--warning)] border border-theme-subtle">
                      {cand.status}
                    </span>
                    <span className="text-[10px] text-theme-muted">{cand.type}</span>
                  </div>
                  <p className="text-xs text-theme-secondary leading-relaxed">{cand.content}</p>
                  {cand.provenance && (
                    <div className="text-[10px] text-theme-muted flex items-center gap-2">
                      <span>{t.memory?.source || "Source"}: {cand.provenance.source}</span>
                      {cand.provenance.taskId && <span>{t.memory?.task || "Task"}: {cand.provenance.taskId}</span>}
                      {cand.provenance.result && <span>{t.memory?.result || "Result"}: {cand.provenance.result}</span>}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleAcceptCandidate(cand.candidateId)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--btn-primary-bg)] hover:opacity-90 text-[var(--btn-primary-text)] flex items-center gap-1.5 transition"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>{t.memory?.acceptCandidate || "接受"}</span>
                  </button>
                  <button
                    onClick={() => handleRejectCandidate(cand.candidateId)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-theme-subtle hover:bg-theme-card-hover text-theme-secondary transition"
                  >
                    <span>{t.memory?.rejectCandidate || "拒绝"}</span>
                  </button>
                  <button
                    onClick={() => handleDeleteCandidate(cand.candidateId)}
                    className="p-1.5 rounded-lg text-theme-muted hover:text-[var(--warning)] hover:bg-theme-card-hover transition"
                    title={t.common?.delete || "删除提案"}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Add Memory Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg-modal-overlay)] backdrop-blur-md p-4">
          <div className="bg-theme-card border border-theme-subtle rounded-xl max-w-lg w-full p-6 space-y-4 ">
            <h2 className="text-base font-bold text-theme-primary">{t.memory?.modalTitle || "将记忆持久化至存储库"}</h2>
            <form onSubmit={handleCreateMemory} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-theme-muted mb-1">{t.memory?.keyLabel || "键名 (唯一标识)"}</label>
                <input
                  type="text"
                  required
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="例如：project_tech_stack"
                  className="w-full bg-theme-sidebar border border-theme-subtle rounded-lg px-3 py-2 text-xs text-theme-primary focus:outline-none border-theme-subtle"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-theme-muted mb-1">{t.memory?.scopeLabel || "作用域"}</label>
                  <select
                    value={newScope}
                    onChange={(e) => setNewScope(e.target.value)}
                    className="w-full bg-theme-sidebar border border-theme-subtle rounded-lg px-3 py-2 text-xs text-theme-primary focus:outline-none border-theme-subtle"
                  >
                    <option value="GLOBAL">全局 (GLOBAL)</option>
                    <option value="USER">用户级 (USER)</option>
                    <option value="PROJECT">项目级 (PROJECT)</option>
                    <option value="SESSION">会话级 (SESSION)</option>
                    <option value="TASK">任务级 (TASK)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-theme-muted mb-1">{t.memory?.typeLabel || "类型"}</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    className="w-full bg-theme-sidebar border border-theme-subtle rounded-lg px-3 py-2 text-xs text-theme-primary focus:outline-none border-theme-subtle"
                  >
                    <option value="FACT">客观事实 (FACT)</option>
                    <option value="DECISION">架构决策 (DECISION)</option>
                    <option value="SOLUTION">解决方案 (SOLUTION)</option>
                    <option value="PREFERENCE">用户偏好 (PREFERENCE)</option>
                    <option value="EXPERIENCE">执行经验 (EXPERIENCE)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-theme-muted mb-1">{t.memory?.contentLabel || "记忆详情与事实描述"}</label>
                <textarea
                  required
                  rows={4}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="请输入记忆具体内容、事实事实或特定工作流指令..."
                  className="w-full bg-theme-sidebar border border-theme-subtle rounded-lg px-3 py-2 text-xs text-theme-primary focus:outline-none border-theme-subtle"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-theme-muted mb-1">{t.memory?.tagsLabel || "标签 (逗号分隔)"}</label>
                <input
                  type="text"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder="architecture, react, typescript"
                  className="w-full bg-theme-sidebar border border-theme-subtle rounded-lg px-3 py-2 text-xs text-theme-primary focus:outline-none border-theme-subtle"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-theme-muted hover:bg-theme-card-hover"
                >
                  {t.common?.cancel || "取消"}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-[var(--btn-primary-bg)] hover:opacity-90 text-[var(--btn-primary-text)]"
                >
                  {t.memory?.saveMemory || "保存记忆"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
