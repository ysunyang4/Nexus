-- 0016_prompts.down.sql
-- Rollback migration for 0016_prompts

DROP INDEX IF EXISTS idx_nexus_prompts_project_id;
DROP INDEX IF EXISTS idx_nexus_prompts_category;
DROP TABLE IF EXISTS nexus_prompts;
