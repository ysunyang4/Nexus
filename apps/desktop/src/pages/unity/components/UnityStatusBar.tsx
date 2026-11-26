import React from "react";
import type { UnityRuntimeStatusBarData, UnityConnectionStatus, UnityServiceState } from "../types.js";

interface UnityStatusBarProps {
  data: UnityRuntimeStatusBarData;
}

export const UnityStatusBar: React.FC<UnityStatusBarProps> = ({ data }) => {
  const getStatusDot = (status: UnityConnectionStatus) => {
    switch (status) {
      case "CONNECTED":
        return <span className="w-1.5 h-1.5 rounded-full bg-[var(--btn-primary-bg)] shrink-0" />;
      case "UNKNOWN":
        return <span className="w-1.5 h-1.5 rounded-full bg-[var(--btn-primary-bg)] shrink-0" />;
      case "FAILED":
        return <span className="w-1.5 h-1.5 rounded-full bg-[var(--btn-primary-bg)] shrink-0" />;
      case "DISCONNECTED":
      default:
        return <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 shrink-0" />;
    }
  };

  const getStatusTextClass = (status: UnityConnectionStatus) => {
    switch (status) {
      case "CONNECTED":
        return "text-[var(--success)]";
      case "UNKNOWN":
        return "text-[var(--warning)]";
      case "FAILED":
        return "text-[var(--warning)]";
      case "DISCONNECTED":
      default:
        return "text-theme-secondary";
    }
  };

  const getServiceDot = (state: UnityServiceState) => {
    switch (state) {
      case "RUNNING":
        return <span className="w-1.5 h-1.5 rounded-full bg-[var(--btn-primary-bg)] shrink-0" />;
      case "STARTING":
      case "STOPPING":
        return <span className="w-1.5 h-1.5 rounded-full bg-[var(--btn-primary-bg)] animate-pulse shrink-0" />;
      case "FAILED":
        return <span className="w-1.5 h-1.5 rounded-full bg-[var(--btn-primary-bg)] shrink-0" />;
      case "STOPPED":
      default:
        return <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 shrink-0" />;
    }
  };

  const getServiceTextClass = (state: UnityServiceState) => {
    switch (state) {
      case "RUNNING":
        return "text-[var(--success)] font-semibold";
      case "STARTING":
      case "STOPPING":
        return "text-[var(--warning)] font-semibold";
      case "FAILED":
        return "text-[var(--warning)] font-semibold";
      case "STOPPED":
      default:
        return "text-theme-secondary";
    }
  };

  const getPermissionBadge = (level: string) => {
    switch (level) {
      case "L5":
        return <span className="text-theme-primary font-semibold">👑 L5 Full</span>;
      case "L4":
        return <span className="text-theme-primary font-semibold">🔗 L4 Scene+Code</span>;
      case "L3":
        return <span className="text-theme-primary font-semibold">💻 L3 Code</span>;
      case "L2":
        return <span className="text-[var(--success)] font-semibold">🧱 L2 Scene</span>;
      case "L1":
      default:
        return <span className="text-theme-secondary font-semibold">👁 L1 Viewer</span>;
    }
  };

  return (
    <div className="h-10 px-4 bg-theme-sidebar/60 border-b border-theme-subtle flex items-center justify-between text-xs font-mono select-none shrink-0 overflow-x-auto">
      <div className="flex items-center gap-4 min-w-max">
        {/* 1. Permission Level */}
        <div className="flex items-center gap-1.5" title="当前操作权限级别">
          <span className="text-theme-muted">Perm:</span>
          {getPermissionBadge(data.permission)}
        </div>

        <span className="text-theme-subtle">·</span>

        {/* 2. Execution Mode */}
        <div className="flex items-center gap-1.5" title="执行与验证策略模式">
          <span className="text-theme-muted">Mode:</span>
          <span className={data.executionMode === "DEEP" ? "text-[var(--warning)] font-semibold" : "text-theme-primary font-semibold"}>
            {data.executionMode === "DEEP" ? "🧠 Deep" : "Fast"}
          </span>
        </div>

        <span className="text-theme-subtle">·</span>

        {/* 3. Unity Service State */}
        <div className="flex items-center gap-1.5" title="Nexus 内置 Unity 服务状态">
          <span className="text-theme-muted">Service:</span>
          <span className="flex items-center gap-1.5 font-medium">
            {getServiceDot(data.serviceState)}
            <span className={getServiceTextClass(data.serviceState)}>{data.serviceState}</span>
          </span>
        </div>

        <span className="text-theme-subtle">·</span>

        {/* 4. Port */}
        <div className="flex items-center gap-1.5" title="本地监听端口">
          <span className="text-theme-muted">Port:</span>
          <span className={data.portListening ? "text-theme-primary font-medium" : "text-theme-muted"}>
            {data.portListening ? `127.0.0.1:${data.port}` : "未监听"}
          </span>
        </div>

        <span className="text-theme-subtle">·</span>

        {/* 5. Unity Instance Connection */}
        <div className="flex items-center gap-1.5" title="Unity 进程连接状态">
          <span className="text-theme-muted">Unity:</span>
          <span className="flex items-center gap-1 font-medium">
            {getStatusDot(data.unity)}
            <span className={getStatusTextClass(data.unity)}>{data.unity}</span>
          </span>
        </div>

        <span className="text-theme-subtle">·</span>

        {/* 6. Active Project */}
        <div className="flex items-center gap-1.5" title="目标工程">
          <span className="text-theme-muted">Proj:</span>
          <span className="text-theme-primary font-medium truncate max-w-[120px]">
            {data.project || "—"}
          </span>
        </div>

        <span className="text-theme-subtle">·</span>

        {/* 7. Plugin Status */}
        <div className="flex items-center gap-1.5" title="Unity 插件状态">
          <span className="text-theme-muted">Plugin:</span>
          <span className="flex items-center gap-1 font-medium">
            {getStatusDot(data.plugin)}
            <span className={getStatusTextClass(data.plugin)}>{data.plugin}</span>
          </span>
        </div>

        <span className="text-theme-subtle">·</span>

        {/* 8. IPC Status */}
        <div className="flex items-center gap-1.5" title="IPC 管道">
          <span className="text-theme-muted">IPC:</span>
          <span className="flex items-center gap-1 font-medium">
            {getStatusDot(data.ipc)}
            <span className={getStatusTextClass(data.ipc)}>{data.ipc}</span>
          </span>
        </div>

        <span className="text-theme-subtle">·</span>

        {/* 9. Runtime State */}
        <div className="flex items-center gap-1.5" title="运行期状态">
          <span className="text-theme-muted">Run:</span>
          <span
            className={`font-medium ${
              data.runtime === "PLAYING"
                ? "text-[var(--success)]"
                : data.runtime === "PAUSED"
                ? "text-[var(--warning)]"
                : "text-theme-secondary"
            }`}
          >
            {data.runtime}
          </span>
        </div>

        <span className="text-theme-subtle">·</span>

        {/* 10. Build Status */}
        <div className="flex items-center gap-1.5" title="构建状态">
          <span className="text-theme-muted">Build:</span>
          <span
            className={`font-medium ${
              data.build === "SUCCESS"
                ? "text-[var(--success)]"
                : data.build === "BUILDING"
                ? "text-theme-primary animate-pulse"
                : data.build === "FAILED"
                ? "text-[var(--warning)]"
                : "text-theme-muted"
            }`}
          >
            {data.build}
          </span>
        </div>
      </div>
    </div>
  );
};
