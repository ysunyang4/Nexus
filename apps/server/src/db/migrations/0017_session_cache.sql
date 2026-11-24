-- Migration 0017: Cross-account session cache for Claude handoff
CREATE TABLE IF NOT EXISTS nexus_session_cache (
  handle TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  key_decisions TEXT, -- JSON array string
  active_files TEXT, -- JSON array string
  pending_tasks TEXT, -- JSON array string
  raw_context TEXT, -- Compressed dialog excerpts
  token_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  accessed_at INTEGER,
  access_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_nexus_session_cache_expires_at ON nexus_session_cache(expires_at);
