-- 0016_prompts.sql
-- Migration: Add nexus_prompts table for persistent prompt directives

CREATE TABLE IF NOT EXISTS nexus_prompts (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK(category IN ('system', 'project', 'user', 'tool')),
  name TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  project_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nexus_prompts_category ON nexus_prompts(category);
CREATE INDEX IF NOT EXISTS idx_nexus_prompts_project_id ON nexus_prompts(project_id);
