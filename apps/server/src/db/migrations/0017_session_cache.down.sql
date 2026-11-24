-- Rollback 0017: Cross-account session cache
DROP INDEX IF EXISTS idx_nexus_session_cache_expires_at;
DROP TABLE IF EXISTS nexus_session_cache;
