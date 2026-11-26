import React, { useState } from "react";
import { X, OctagonAlert, AlertTriangle } from "lucide-react";
import { bridge } from "../../api/bridge.js";
import { useTranslation } from "../../i18n/useTranslation.js";

interface EmergencyStopModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (info: { cancelledJobsCount: number; jobIds: string[] }) => void;
}

export const EmergencyStopModal: React.FC<EmergencyStopModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { t, translateError } = useTranslation();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await bridge.emergencyStop(reason || "Emergency stop triggered by user");
      onSuccess({
        cancelledJobsCount: res.cancelledJobsCount,
        jobIds: res.jobIds,
      });
      onClose();
    } catch (err: any) {
      setError(translateError(err.code, err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-app)] backdrop-blur-sm p-4">
      <div className="bg-theme-card border border-theme-subtle rounded-xl w-full max-w-md  overflow-hidden flex flex-col">
        {/* Red Title Banner */}
        <div className="px-6 py-4 bg-[var(--btn-primary-bg)]/10 border-b border-theme-subtle flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-[var(--warning)] font-bold text-base">
            <OctagonAlert className="w-5 h-5 text-[var(--warning)]" />
            <span>{t.modals.emergency.title}</span>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--warning)] hover:text-[var(--warning)] p-1 rounded-lg hover:bg-[var(--btn-primary-bg)]/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-[var(--btn-primary-bg)]/15 border border-theme-subtle rounded-lg text-xs text-[var(--warning)] flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-[var(--warning)] shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-xs text-theme-secondary leading-relaxed">
            {t.modals.emergency.warningMsg}
          </p>

          <div>
            <label className="block text-xs font-medium text-theme-secondary mb-1.5">
              {t.modals.emergency.reasonLabel}
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t.modals.emergency.reasonPlaceholder}
              className="w-full bg-theme-input border border-theme-input rounded-lg px-3 py-2 text-xs text-theme-primary focus:outline-none border-theme-subtle"
            />
          </div>

          <div className="pt-3 border-t border-theme-subtle flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-theme-secondary hover:bg-theme-card-hover transition"
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleConfirm}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]  transition active:scale-95 disabled:opacity-50"
            >
              {loading ? t.modals.emergency.submitting : t.modals.emergency.submitBtn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
