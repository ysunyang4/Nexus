import React, { useState, useEffect } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, Info, AlertCircle } from "lucide-react";

export interface DynamicSchemaFormProps {
  schema: {
    type?: string;
    properties?: Record<string, any>;
    required?: string[];
    $defs?: Record<string, any>;
    definitions?: Record<string, any>;
    description?: string;
    [key: string]: any;
  };
  initialValues?: Record<string, any>;
  onSubmit: (values: Record<string, any>) => void;
  isLoading?: boolean;
  submitLabel?: string;
}

/**
 * Resolves $ref inside schema if present
 */
function resolveRef(schema: any, ref: string): any {
  if (!ref || typeof ref !== "string") return schema;
  const defs = schema.$defs || schema.definitions || {};
  const refKey = ref.replace(/^#\/(\$defs|definitions)\//, "");
  return defs[refKey] || { type: "object" };
}

export const DynamicSchemaForm: React.FC<DynamicSchemaFormProps> = ({
  schema,
  initialValues = {},
  onSubmit,
  isLoading = false,
  submitLabel = "执行工具 (Execute)",
}) => {
  const [formValues, setFormValues] = useState<Record<string, any>>(initialValues);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [collapsedObjects, setCollapsedObjects] = useState<Record<string, boolean>>({});

  // Reset or initialize values when schema changes
  useEffect(() => {
    const defaultVals: Record<string, any> = { ...initialValues };
    const props = schema.properties || {};

    for (const [key, propDef] of Object.entries(props)) {
      if (defaultVals[key] === undefined && (propDef as any).default !== undefined) {
        defaultVals[key] = (propDef as any).default;
      }
    }
    setFormValues(defaultVals);
    setValidationError(null);
  }, [schema]);

  const toggleObjectCollapse = (path: string) => {
    setCollapsedObjects((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const handleFieldChange = (path: string[], value: any) => {
    setFormValues((prev) => {
      const copy = { ...prev };
      let curr = copy;
      for (let i = 0; i < path.length - 1; i++) {
        const seg = path[i];
        if (!curr[seg] || typeof curr[seg] !== "object") {
          curr[seg] = {};
        }
        curr = curr[seg];
      }
      const lastSeg = path[path.length - 1];
      if (value === "" || value === undefined) {
        delete curr[lastSeg];
      } else {
        curr[lastSeg] = value;
      }
      return copy;
    });
  };

  const getValueAtPath = (path: string[]): any => {
    let curr = formValues;
    for (const seg of path) {
      if (curr === undefined || curr === null) return undefined;
      curr = curr[seg];
    }
    return curr;
  };

  const validateAndSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const requiredFields = schema.required || [];
    for (const field of requiredFields) {
      const val = formValues[field];
      if (val === undefined || val === null || val === "") {
        setValidationError(`必填字段 '${field}' 不能为空。`);
        return;
      }
    }

    onSubmit(formValues);
  };

  /**
   * Recursive field renderer
   */
  const renderField = (
    key: string,
    fieldDef: any,
    path: string[],
    isRequired: boolean
  ): React.ReactNode => {
    const fullPathStr = path.join(".");
    let propDef = fieldDef;

    // Handle $ref
    if (propDef.$ref) {
      const resolved = resolveRef(schema, propDef.$ref);
      propDef = { ...resolved, description: propDef.description || resolved.description };
    }

    const fieldType = propDef.type || (propDef.properties ? "object" : "string");
    const label = propDef.title || key;
    const desc = propDef.description || "";
    const isCollapsed = collapsedObjects[fullPathStr] ?? false;

    // 1. Enum dropdown
    if (propDef.enum && Array.isArray(propDef.enum)) {
      const val = getValueAtPath(path) ?? propDef.default ?? "";
      return (
        <div key={fullPathStr} className="space-y-1">
          <div className="flex items-center justify-between text-xs font-mono">
            <label className="text-theme-primary font-medium flex items-center gap-1">
              <span>{label}</span>
              {isRequired && <span className="text-rose-400 font-bold">*</span>}
            </label>
            <span className="text-theme-muted text-[10px]">{fieldType}</span>
          </div>
          {desc && <p className="text-[11px] text-theme-muted">{desc}</p>}
          <select
            value={val}
            onChange={(e) => handleFieldChange(path, e.target.value)}
            className="w-full px-2.5 py-1.5 bg-theme-base border border-theme-subtle rounded text-xs font-mono text-theme-primary focus:border-sky-500 focus:outline-none"
          >
            <option value="">-- 选择 (Select) --</option>
            {propDef.enum.map((opt: any) => (
              <option key={String(opt)} value={String(opt)}>
                {String(opt)}
              </option>
            ))}
          </select>
        </div>
      );
    }

    // 2. Boolean checkbox / toggle
    if (fieldType === "boolean") {
      const val = Boolean(getValueAtPath(path) ?? propDef.default ?? false);
      return (
        <div key={fullPathStr} className="flex items-center justify-between py-1 border-b border-theme-subtle/40">
          <div>
            <label className="text-xs font-mono text-theme-primary font-medium flex items-center gap-1">
              <span>{label}</span>
              {isRequired && <span className="text-rose-400 font-bold">*</span>}
            </label>
            {desc && <p className="text-[11px] text-theme-muted font-mono">{desc}</p>}
          </div>
          <input
            type="checkbox"
            checked={val}
            onChange={(e) => handleFieldChange(path, e.target.checked)}
            className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 bg-theme-base border-theme-subtle cursor-pointer"
          />
        </div>
      );
    }

    // 3. Number / Integer
    if (fieldType === "number" || fieldType === "integer") {
      const val = getValueAtPath(path) ?? propDef.default ?? "";
      return (
        <div key={fullPathStr} className="space-y-1">
          <div className="flex items-center justify-between text-xs font-mono">
            <label className="text-theme-primary font-medium flex items-center gap-1">
              <span>{label}</span>
              {isRequired && <span className="text-rose-400 font-bold">*</span>}
            </label>
            <span className="text-theme-muted text-[10px]">{fieldType}</span>
          </div>
          {desc && <p className="text-[11px] text-theme-muted">{desc}</p>}
          <input
            type="number"
            step={fieldType === "integer" ? "1" : "any"}
            value={val}
            placeholder={propDef.default !== undefined ? String(propDef.default) : "0"}
            onChange={(e) => {
              const parsed = e.target.value === "" ? "" : Number(e.target.value);
              handleFieldChange(path, parsed);
            }}
            className="w-full px-2.5 py-1.5 bg-theme-base border border-theme-subtle rounded text-xs font-mono text-theme-primary placeholder-theme-muted/40 focus:border-sky-500 focus:outline-none"
          />
        </div>
      );
    }

    // 4. Object (Recursive)
    if (fieldType === "object" && propDef.properties) {
      const childProps = propDef.properties;
      const childRequired = propDef.required || [];

      return (
        <div key={fullPathStr} className="p-3 bg-theme-sidebar/30 border border-theme-subtle rounded-lg space-y-2.5">
          <div
            onClick={() => toggleObjectCollapse(fullPathStr)}
            className="flex items-center justify-between cursor-pointer select-none text-xs font-mono"
          >
            <div className="flex items-center gap-1.5 font-medium text-theme-primary">
              {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-theme-muted" /> : <ChevronDown className="w-3.5 h-3.5 text-theme-muted" />}
              <span>{label}</span>
              {isRequired && <span className="text-rose-400 font-bold">*</span>}
            </div>
            <span className="text-[10px] text-theme-muted bg-theme-card px-1.5 py-0.5 rounded border border-theme-subtle">
              object
            </span>
          </div>

          {desc && <p className="text-[11px] text-theme-muted font-mono">{desc}</p>}

          {!isCollapsed && (
            <div className="space-y-3 pt-1 border-t border-theme-subtle/50">
              {Object.entries(childProps).map(([childKey, childDef]) =>
                renderField(
                  childKey,
                  childDef,
                  [...path, childKey],
                  childRequired.includes(childKey)
                )
              )}
            </div>
          )}
        </div>
      );
    }

    // 5. Array (Dynamic add/remove)
    if (fieldType === "array") {
      const itemsDef = propDef.items || { type: "string" };
      const currentList: any[] = getValueAtPath(path) || [];

      return (
        <div key={fullPathStr} className="p-3 bg-theme-sidebar/30 border border-theme-subtle rounded-lg space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <label className="text-theme-primary font-medium flex items-center gap-1">
              <span>{label}</span>
              {isRequired && <span className="text-rose-400 font-bold">*</span>}
            </label>
            <button
              type="button"
              onClick={() => handleFieldChange(path, [...currentList, itemsDef.type === "number" ? 0 : ""])}
              className="px-2 py-0.5 bg-sky-600/20 hover:bg-sky-600/30 text-sky-400 border border-sky-500/30 rounded text-[10px] font-mono flex items-center gap-1 transition"
            >
              <Plus className="w-3 h-3" />
              <span>添加项 (Add)</span>
            </button>
          </div>

          {desc && <p className="text-[11px] text-theme-muted font-mono">{desc}</p>}

          <div className="space-y-2">
            {currentList.map((itemVal, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type={itemsDef.type === "number" ? "number" : "text"}
                  value={itemVal}
                  onChange={(e) => {
                    const next = [...currentList];
                    next[idx] = itemsDef.type === "number" ? Number(e.target.value) : e.target.value;
                    handleFieldChange(path, next);
                  }}
                  className="flex-1 px-2.5 py-1 bg-theme-base border border-theme-subtle rounded text-xs font-mono text-theme-primary focus:border-sky-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = currentList.filter((_, i) => i !== idx);
                    handleFieldChange(path, next);
                  }}
                  className="p-1 text-theme-muted hover:text-rose-400 transition"
                  title="删除此项"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {currentList.length === 0 && (
              <div className="text-[11px] text-theme-muted italic">暂无列表项 (Empty array)</div>
            )}
          </div>
        </div>
      );
    }

    // 6. Default: String / Text input
    const val = getValueAtPath(path) ?? propDef.default ?? "";
    const isMultiLine = desc.toLowerCase().includes("c#") || desc.toLowerCase().includes("code") || key.toLowerCase().includes("script") || key.toLowerCase().includes("code");

    return (
      <div key={fullPathStr} className="space-y-1">
        <div className="flex items-center justify-between text-xs font-mono">
          <label className="text-theme-primary font-medium flex items-center gap-1">
            <span>{label}</span>
            {isRequired && <span className="text-rose-400 font-bold">*</span>}
          </label>
          <span className="text-theme-muted text-[10px]">{fieldType}</span>
        </div>
        {desc && <p className="text-[11px] text-theme-muted leading-relaxed">{desc}</p>}
        {isMultiLine ? (
          <textarea
            rows={4}
            value={val}
            placeholder={propDef.default ? String(propDef.default) : `输入 ${label}...`}
            onChange={(e) => handleFieldChange(path, e.target.value)}
            className="w-full px-2.5 py-1.5 bg-theme-base border border-theme-subtle rounded text-xs font-mono text-theme-primary placeholder-theme-muted/40 focus:border-sky-500 focus:outline-none resize-y"
          />
        ) : (
          <input
            type="text"
            value={val}
            placeholder={propDef.default ? String(propDef.default) : `输入 ${label}...`}
            onChange={(e) => handleFieldChange(path, e.target.value)}
            className="w-full px-2.5 py-1.5 bg-theme-base border border-theme-subtle rounded text-xs font-mono text-theme-primary placeholder-theme-muted/40 focus:border-sky-500 focus:outline-none"
          />
        )}
      </div>
    );
  };

  const properties = schema.properties || {};
  const requiredList = schema.required || [];

  return (
    <form onSubmit={validateAndSubmit} className="space-y-4">
      {Object.keys(properties).length === 0 ? (
        <div className="p-3 bg-theme-card/40 border border-theme-subtle rounded text-xs font-mono text-theme-muted flex items-center gap-2">
          <Info className="w-4 h-4 text-sky-400" />
          <span>该工具无需任何输入参数 (No arguments required)。</span>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(properties).map(([key, def]) =>
            renderField(key, def, [key], requiredList.includes(key))
          )}
        </div>
      )}

      {validationError && (
        <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded text-rose-400 text-xs font-mono flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      <div className="pt-2 flex justify-end">
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-mono font-medium flex items-center gap-2 transition disabled:opacity-50 shadow-sm"
        >
          {isLoading && <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
          <span>{isLoading ? "执行中..." : submitLabel}</span>
        </button>
      </div>
    </form>
  );
};
