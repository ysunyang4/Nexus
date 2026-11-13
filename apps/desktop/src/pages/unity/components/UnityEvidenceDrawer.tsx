import React from "react";
import { X, ShieldCheck, ShieldAlert, Copy, Check, Image as ImageIcon, Terminal, FileCode } from "lucide-react";
import type { UnityEvidenceDrawerData } from "../types.js";

interface UnityEvidenceDrawerProps {
  data: UnityEvidenceDrawerData | null;
  isOpen: boolean;
  onClose: () => void;
}

export const UnityEvidenceDrawer: React.FC<UnityEvidenceDrawerProps> = ({
  data,
  isOpen,
  onClose,
}) => {
  const [copiedHash, setCopiedHash] = React.useState(false);

  if (!isOpen || !data) {
    return null;
  }

  const handleCopyHash = () => {
    if (data.evidenceHash) {
      navigator.clipboard.writeText(data.evidenceHash).catch(() => {});
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-theme-sidebar border-l border-theme-subtle shadow-2xl z-40 flex flex-col select-none animate-in slide-in-from-right duration-200">
      {/* Drawer Header */}
      <div className="h-14 px-4 border-b border-theme-subtle flex items-center justify-between shrink-0 bg-theme-header">
        <div className="flex items-center gap-2">
          {data.verificationVerdict === "VERIFIED" ? (
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-amber-500" />
          )}
          <span className="font-semibold text-xs tracking-wider text-theme-primary uppercase">
            Evidence Audit
          </span>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
              data.verificationVerdict === "VERIFIED"
                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                : "bg-amber-500/10 text-amber-500 border-amber-500/30"
            }`}
          >
            {data.verificationVerdict}
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-theme-muted hover:text-theme-primary hover:bg-theme-card transition"
          title="关闭"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-mono">
        {/* Operation & Capability */}
        <div className="p-3 bg-theme-card/40 border border-theme-subtle rounded-lg space-y-1.5">
          <div className="text-[10px] text-theme-muted uppercase tracking-wider">Operation</div>
          <div className="text-theme-primary font-semibold truncate">{data.operationId}</div>
          <div className="text-[11px] text-theme-secondary flex items-center justify-between">
            <span>Capability:</span>
            <span className="text-sky-500">{data.capability}</span>
          </div>
          <div className="text-[11px] text-theme-secondary flex items-center justify-between">
            <span>Timestamp:</span>
            <span>{data.timestamp}</span>
          </div>
          <div className="text-[11px] text-theme-secondary flex items-center justify-between">
            <span>Source:</span>
            <span>{data.verificationSource}</span>
          </div>
        </div>

        {/* State Hash Inspection */}
        <div className="p-3 bg-theme-card/40 border border-theme-subtle rounded-lg space-y-2">
          <div className="text-[10px] text-theme-muted uppercase tracking-wider">State Transition</div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-theme-muted">Pre-State Hash:</span>
              <span className="text-theme-secondary font-mono bg-theme-base/60 px-1.5 py-0.5 rounded border border-theme-subtle">
                {data.preStateHash || "PRE_INITIAL"}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-theme-muted">Post-State Hash:</span>
              <span className="text-emerald-500/90 font-mono bg-theme-base/60 px-1.5 py-0.5 rounded border border-theme-subtle">
                {data.postStateHash || "POST_COMMITTED"}
              </span>
            </div>
          </div>
        </div>

        {/* 64-char SHA-256 Evidence Hash */}
        <div className="p-3 bg-theme-card/40 border border-theme-subtle rounded-lg space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-theme-muted uppercase tracking-wider">Evidence Hash</span>
            <button
              type="button"
              onClick={handleCopyHash}
              className="text-[10px] text-sky-500 hover:text-sky-400 flex items-center gap-1 transition"
            >
              {copiedHash ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              <span>{copiedHash ? "已复制" : "复制"}</span>
            </button>
          </div>
          <div className="text-[11px] font-mono break-all text-theme-secondary bg-theme-base/80 p-2 rounded border border-theme-subtle">
            {data.evidenceHash || "—"}
          </div>
        </div>

        {/* Stack Trace (if error/exception) */}
        {data.stackTrace && (
          <div className="p-3 bg-rose-500/5 border border-rose-500/20 rounded-lg space-y-1.5">
            <div className="flex items-center gap-1.5 text-rose-400 text-[10px] uppercase font-semibold">
              <Terminal className="w-3.5 h-3.5" />
              <span>Stack Trace</span>
            </div>
            <pre className="text-[11px] text-rose-300 font-mono whitespace-pre-wrap break-all bg-theme-base/80 p-2 rounded max-h-40 overflow-y-auto">
              {data.stackTrace}
            </pre>
          </div>
        )}

        {/* Screenshot (if captured) */}
        {data.screenshotUrl && (
          <div className="p-3 bg-theme-card/40 border border-theme-subtle rounded-lg space-y-2">
            <div className="flex items-center gap-1.5 text-theme-muted text-[10px] uppercase">
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Runtime Viewport Capture</span>
            </div>
            <div className="rounded border border-theme-subtle overflow-hidden bg-black/40">
              <img
                src={data.screenshotUrl}
                alt="Evidence Viewport"
                className="w-full h-auto object-contain max-h-48"
              />
            </div>
          </div>
        )}

        {/* Object State Snapshot */}
        {data.objectStateSnapshot && (
          <div className="p-3 bg-theme-card/40 border border-theme-subtle rounded-lg space-y-1.5">
            <div className="flex items-center gap-1.5 text-theme-muted text-[10px] uppercase">
              <FileCode className="w-3.5 h-3.5" />
              <span>Object State Snapshot</span>
            </div>
            <pre className="text-[10px] text-theme-secondary font-mono whitespace-pre-wrap bg-theme-base/80 p-2 rounded max-h-36 overflow-y-auto border border-theme-subtle">
              {JSON.stringify(data.objectStateSnapshot, null, 2)}
            </pre>
          </div>
        )}

        {/* Logs Snapshot */}
        {data.logsSnapshot && data.logsSnapshot.length > 0 && (
          <div className="p-3 bg-theme-card/40 border border-theme-subtle rounded-lg space-y-1.5">
            <div className="text-[10px] text-theme-muted uppercase tracking-wider">Related Logs</div>
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {data.logsSnapshot.map((log, idx) => (
                <div key={idx} className="text-[11px] text-theme-secondary bg-theme-base/60 px-2 py-1 rounded">
                  {log}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
