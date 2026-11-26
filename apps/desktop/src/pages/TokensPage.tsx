import React, { useState } from "react";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import type { Token } from "../types.js";
import { bridge } from "../api/bridge.js";
import { useTranslation } from "../i18n/useTranslation.js";

interface TokensPageProps {
  tokens: Token[];
  onOpenCreateTokenModal: () => void;
  onRefresh: () => void;
}

export const TokensPage: React.FC<TokensPageProps> = ({
  tokens,
  onOpenCreateTokenModal,
  onRefresh,
}) => {
  const { t, translateError, language } = useTranslation();
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRevoke = async (id: string) => {
    const ok = window.confirm(t.tokens.revokeConfirmDesc);
    if (!ok) return;

    setRevokingId(id);
    setError(null);
    try {
      await bridge.revokeToken(id);
      onRefresh();
    } catch (err: any) {
      setError(translateError(err.code, err.message));
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-theme-primary">{t.tokens.title}</h2>
          <p className="text-xs text-theme-muted">{t.tokens.subtitle}</p>
        </div>
        <button
          onClick={onOpenCreateTokenModal}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-semibold rounded-lg text-xs  transition"
        >
          <Plus className="w-4 h-4" />
          <span>{t.tokens.createTokenBtn}</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-[var(--btn-primary-bg)]/15 border border-theme-subtle rounded-lg text-xs text-[var(--warning)]">
          {error}
        </div>
      )}

      {tokens.length === 0 ? (
        <div className="p-12 text-center bg-theme-card border border-theme-card rounded-xl space-y-3 ">
          <KeyRound className="w-10 h-10 text-theme-muted mx-auto" />
          <div className="text-theme-primary font-semibold text-sm">{t.tokens.noTokens}</div>
          <p className="text-theme-muted text-xs">{t.tokens.noTokensDesc}</p>
          <button
            onClick={onOpenCreateTokenModal}
            className="px-4 py-2 bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-semibold rounded-lg text-xs transition "
          >
            {t.tokens.createTokenBtn}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {tokens.map((token) => {
            const isRevoked = token.revokedAt !== null && token.revokedAt !== undefined;
            const created = new Date(token.createdAt);
            const lastUsed = token.lastUsedAt ? new Date(token.lastUsedAt) : null;

            return (
              <div
                key={token.id}
                className={`p-4 bg-theme-card border rounded-xl flex items-center justify-between gap-4 transition  ${
                  isRevoked ? "border-theme-subtle opacity-50" : "border-theme-card"
                }`}
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`badge ${
                        token.type === "mcp" ? "badge-blue" : "badge-purple"
                      }`}
                    >
                      {token.type.toUpperCase()}
                    </span>
                    <span className="font-semibold text-xs text-theme-primary">
                      {token.name}
                    </span>
                    <span className="font-mono text-xs text-theme-muted">
                      {token.id}
                    </span>
                    {isRevoked ? (
                      <span className="badge badge-red">{t.common.denied}</span>
                    ) : (
                      <span className="badge badge-green">{t.common.active}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-theme-muted font-mono flex-wrap">
                    <span>{t.tokens.createdAt}: {created.toLocaleDateString()}</span>
                    <span>
                      {t.tokens.lastUsed}: {lastUsed ? lastUsed.toLocaleTimeString() : t.tokens.neverUsed}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-theme-muted">{t.tokens.scopes}:</span>
                      {token.scopes && token.scopes.length > 0 ? (
                        <>
                          {token.scopes.includes("read") && token.scopes.includes("write") && token.scopes.includes("execute") ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--btn-primary-bg)]/15 text-theme-primary text-theme-primary border border-theme-subtle">
                              {language === "zh-CN" ? "读写执行 (全权限)" : "Full Control (Read/Write/Exec)"}
                            </span>
                          ) : (
                            token.scopes.map((sc) => {
                              if (sc === "read") {
                                return (
                                  <span key={sc} className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--btn-primary-bg)]/10 text-theme-primary text-theme-primary border border-theme-subtle">
                                    {language === "zh-CN" ? "只读" : "read"}
                                  </span>
                                );
                              }
                              if (sc === "write") {
                                return (
                                  <span key={sc} className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--btn-primary-bg)]/10 text-[var(--success)] text-[var(--success)] border border-theme-subtle">
                                    {language === "zh-CN" ? "写入" : "write"}
                                  </span>
                                );
                              }
                              if (sc === "execute") {
                                return (
                                  <span key={sc} className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--btn-primary-bg)]/10 text-[var(--warning)] text-[var(--warning)] border border-theme-subtle">
                                    {language === "zh-CN" ? "执行" : "execute"}
                                  </span>
                                );
                              }
                              return (
                                <span key={sc} className="px-1.5 py-0.5 rounded text-[10px] bg-theme-card-muted text-theme-secondary border border-theme-subtle">
                                  {sc}
                                </span>
                              );
                            })
                          )}
                        </>
                      ) : (
                        <span className="text-theme-muted italic">{t.common.none}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  {!isRevoked && (
                    <button
                      onClick={() => handleRevoke(token.id)}
                      disabled={revokingId === token.id}
                      className="p-2 text-theme-muted hover:text-[var(--warning)] hover:bg-theme-card-hover rounded-lg transition"
                      title={t.tokens.revokeBtn}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
