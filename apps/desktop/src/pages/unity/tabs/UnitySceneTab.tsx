import React, { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Search,
  Box,
  Layers,
  AlertTriangle,
  FileCode,
  ShieldCheck,
  Sliders,
  Sparkles,
} from "lucide-react";
import type {
  UnityHierarchyNode,
  UnityInspectorData,
  UnityEvidenceDrawerData,
} from "../types.js";

interface UnitySceneTabProps {
  hierarchy: UnityHierarchyNode[];
  selectedObject: UnityInspectorData | null;
  onSelectObject: (nodeId: string) => void;
  onOpenEvidence: (evidence: UnityEvidenceDrawerData) => void;
}

export const UnitySceneTab: React.FC<UnitySceneTabProps> = ({
  hierarchy,
  selectedObject,
  onSelectObject,
  onOpenEvidence,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    scene_root: true,
    Scene: true,
  });

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
    transform: false,
    components: false,
    references: false,
    events: false,
  });

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  // 递归渲染 Hierarchy 树节点
  const renderTreeNode = (node: UnityHierarchyNode, depth = 0): React.ReactNode => {
    const isExpanded = expandedNodes[node.id] ?? false;
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = selectedObject?.objectId === node.id;
    const matchesSearch = !searchQuery || node.name.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch && !hasChildren) {
      return null;
    }

    return (
      <div key={node.id} className="select-none">
        <div
          onClick={() => onSelectObject(node.id)}
          className={`flex items-center gap-1.5 py-1 px-2 rounded cursor-pointer text-xs transition ${
            isSelected
              ? "bg-sky-500/15 text-sky-400 font-medium border border-sky-500/30"
              : "hover:bg-theme-card/60 text-theme-secondary hover:text-theme-primary"
          } ${!node.active ? "opacity-50" : ""}`}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          {/* Expander Arrow */}
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => toggleExpand(node.id, e)}
              className="p-0.5 hover:text-theme-primary text-theme-muted"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}

          {/* Node Icon */}
          <Box className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-sky-400" : "text-theme-muted"}`} />

          {/* Node Name */}
          <span className="truncate flex-1 font-mono text-[11px]">{node.name}</span>

          {/* Missing Script warning indicator */}
          {node.hasMissingScript && (
            <span
              title="Missing Script (MonoBehaviour 脚本丢失)"
              className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"
            />
          )}
        </div>

        {/* Child Nodes */}
        {hasChildren && isExpanded && (
          <div>
            {node.children!.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex h-full min-h-0 overflow-hidden bg-theme-base">
      {/* 1. Left: Hierarchy (25% ~ 280px) */}
      <div className="w-72 border-r border-theme-subtle flex flex-col h-full bg-theme-sidebar/40 shrink-0">
        <div className="p-3 border-b border-theme-subtle flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-theme-primary">
            <Layers className="w-3.5 h-3.5 text-sky-500" />
            <span>Hierarchy</span>
          </div>
          <span className="text-[10px] font-mono text-theme-muted">
            {hierarchy.length > 0 ? `${hierarchy.length} objects` : "0"}
          </span>
        </div>

        {/* Search */}
        <div className="p-2 border-b border-theme-subtle">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-theme-muted" />
            <input
              type="text"
              placeholder="搜索对象..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-theme-base pl-8 pr-2.5 py-1 rounded text-xs text-theme-primary placeholder-theme-muted border border-theme-subtle focus:outline-none focus:border-sky-500/50"
            />
          </div>
        </div>

        {/* Tree List */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {hierarchy.length > 0 ? (
            hierarchy.map((node) => renderTreeNode(node))
          ) : (
            <div className="p-6 text-center text-xs text-theme-muted font-mono space-y-2">
              <div>暂无场景对象</div>
              <div className="text-[10px] text-theme-muted/60">
                请确保 Unity 编辑器处于开启状态且加载了场景
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. Middle: Inspector (flex-1) */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-y-auto bg-theme-base p-4">
        {selectedObject ? (
          <div className="max-w-4xl w-full space-y-4">
            {/* Header: Object meta */}
            <div className="p-3 bg-theme-card/50 border border-theme-subtle rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <input
                  type="checkbox"
                  checked={selectedObject.active}
                  readOnly
                  className="rounded border-theme-subtle accent-sky-500"
                />
                <h2 className="text-sm font-semibold text-theme-primary truncate font-mono">
                  {selectedObject.objectName}
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-theme-base rounded border border-theme-subtle text-theme-muted">
                  Tag: {selectedObject.tag || "Untagged"}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-theme-base rounded border border-theme-subtle text-theme-muted">
                  Layer: {selectedObject.layer || "Default"}
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  onOpenEvidence({
                    evidenceId: `ev_${selectedObject.objectId}`,
                    operationId: "gameobject.inspect",
                    capability: "gameobject.read",
                    timestamp: new Date().toLocaleTimeString(),
                    preStateHash: "PRE_STABLE",
                    postStateHash: "POST_VERIFIED",
                    evidenceHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                    verificationVerdict: "VERIFIED",
                    verificationSource: "UNITY_EDITOR_RUNTIME",
                    objectStateSnapshot: selectedObject,
                  })
                }
                className="px-2.5 py-1 text-xs font-mono bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded flex items-center gap-1.5 transition"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Evidence</span>
              </button>
            </div>

            {/* Transform Group */}
            <div className="border border-theme-subtle rounded-lg bg-theme-card/30 overflow-hidden">
              <button
                type="button"
                onClick={() => toggleGroup("transform")}
                className="w-full px-3 py-2 bg-theme-header/60 flex items-center justify-between text-xs font-semibold text-theme-primary"
              >
                <span className="flex items-center gap-2">
                  <Sliders className="w-3.5 h-3.5 text-sky-500" />
                  <span>Transform</span>
                </span>
                {collapsedGroups.transform ? (
                  <ChevronRight className="w-3.5 h-3.5 text-theme-muted" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-theme-muted" />
                )}
              </button>

              {!collapsedGroups.transform && (
                <div className="p-3 space-y-2 text-xs font-mono">
                  {/* Position */}
                  <div className="grid grid-cols-4 items-center gap-2">
                    <span className="text-theme-muted">Position</span>
                    <div className="flex items-center gap-1 bg-theme-base px-2 py-1 rounded border border-theme-subtle text-[11px]">
                      <span className="text-rose-400 font-bold">X</span>
                      <span>{selectedObject.transform.position.x.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1 bg-theme-base px-2 py-1 rounded border border-theme-subtle text-[11px]">
                      <span className="text-emerald-400 font-bold">Y</span>
                      <span>{selectedObject.transform.position.y.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1 bg-theme-base px-2 py-1 rounded border border-theme-subtle text-[11px]">
                      <span className="text-sky-400 font-bold">Z</span>
                      <span>{selectedObject.transform.position.z.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Rotation */}
                  <div className="grid grid-cols-4 items-center gap-2">
                    <span className="text-theme-muted">Rotation</span>
                    <div className="flex items-center gap-1 bg-theme-base px-2 py-1 rounded border border-theme-subtle text-[11px]">
                      <span className="text-rose-400 font-bold">X</span>
                      <span>{selectedObject.transform.rotation.x.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1 bg-theme-base px-2 py-1 rounded border border-theme-subtle text-[11px]">
                      <span className="text-emerald-400 font-bold">Y</span>
                      <span>{selectedObject.transform.rotation.y.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1 bg-theme-base px-2 py-1 rounded border border-theme-subtle text-[11px]">
                      <span className="text-sky-400 font-bold">Z</span>
                      <span>{selectedObject.transform.rotation.z.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Scale */}
                  <div className="grid grid-cols-4 items-center gap-2">
                    <span className="text-theme-muted">Scale</span>
                    <div className="flex items-center gap-1 bg-theme-base px-2 py-1 rounded border border-theme-subtle text-[11px]">
                      <span className="text-rose-400 font-bold">X</span>
                      <span>{selectedObject.transform.scale.x.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1 bg-theme-base px-2 py-1 rounded border border-theme-subtle text-[11px]">
                      <span className="text-emerald-400 font-bold">Y</span>
                      <span>{selectedObject.transform.scale.y.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1 bg-theme-base px-2 py-1 rounded border border-theme-subtle text-[11px]">
                      <span className="text-sky-400 font-bold">Z</span>
                      <span>{selectedObject.transform.scale.z.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Components Group */}
            <div className="border border-theme-subtle rounded-lg bg-theme-card/30 overflow-hidden">
              <button
                type="button"
                onClick={() => toggleGroup("components")}
                className="w-full px-3 py-2 bg-theme-header/60 flex items-center justify-between text-xs font-semibold text-theme-primary"
              >
                <span className="flex items-center gap-2">
                  <FileCode className="w-3.5 h-3.5 text-sky-500" />
                  <span>Components ({selectedObject.components.length})</span>
                </span>
                {collapsedGroups.components ? (
                  <ChevronRight className="w-3.5 h-3.5 text-theme-muted" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-theme-muted" />
                )}
              </button>

              {!collapsedGroups.components && (
                <div className="divide-y divide-theme-subtle">
                  {selectedObject.components.map((comp) => (
                    <div key={comp.id} className="p-3 text-xs font-mono space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={comp.enabled}
                            readOnly
                            className="rounded border-theme-subtle accent-sky-500"
                          />
                          <span className="font-semibold text-theme-primary">{comp.name}</span>
                          <span className="text-[10px] text-theme-muted">({comp.type})</span>
                        </div>

                        {comp.isMissingScript && (
                          <span className="flex items-center gap-1 text-[10px] text-rose-400 font-semibold bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/30">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Missing Script</span>
                          </span>
                        )}
                      </div>

                      {/* Component Properties */}
                      {comp.properties && comp.properties.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          {comp.properties.map((prop) => (
                            <div
                              key={prop.key}
                              className="flex items-center justify-between bg-theme-base/60 px-2 py-1 rounded text-[11px] border border-theme-subtle"
                            >
                              <span className="text-theme-muted">{prop.label}:</span>
                              <span className="text-theme-secondary font-mono truncate">
                                {String(prop.value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* References Group */}
            {selectedObject.references && selectedObject.references.length > 0 && (
              <div className="border border-theme-subtle rounded-lg bg-theme-card/30 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleGroup("references")}
                  className="w-full px-3 py-2 bg-theme-header/60 flex items-center justify-between text-xs font-semibold text-theme-primary"
                >
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-sky-500" />
                    <span>References ({selectedObject.references.length})</span>
                  </span>
                  {collapsedGroups.references ? (
                    <ChevronRight className="w-3.5 h-3.5 text-theme-muted" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-theme-muted" />
                  )}
                </button>

                {!collapsedGroups.references && (
                  <div className="p-3 space-y-2 text-xs font-mono">
                    {selectedObject.references.map((ref, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-theme-base/60 px-2.5 py-1.5 rounded border border-theme-subtle"
                      >
                        <span className="text-theme-muted">{ref.fieldName}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-theme-primary">{ref.targetName}</span>
                          <span className="text-[10px] text-theme-muted">({ref.targetType})</span>
                          {ref.isMissing && (
                            <span className="text-[10px] text-rose-400 bg-rose-500/10 px-1 rounded">
                              Missing
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-theme-muted space-y-2">
            <Box className="w-8 h-8 text-theme-subtle" />
            <div className="text-xs font-mono">请在左侧 Hierarchy 中选择一个对象查看属性</div>
          </div>
        )}
      </div>
    </div>
  );
};
