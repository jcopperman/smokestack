CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS runs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suite         VARCHAR(100) NOT NULL,
    environment   VARCHAR(100) NOT NULL DEFAULT 'default',
    status        VARCHAR(20)  NOT NULL DEFAULT 'queued',
    total_tests   INTEGER,
    passed_tests  INTEGER,
    failed_tests  INTEGER,
    duration_ms   INTEGER,
    artifact_path TEXT,
    error_message TEXT,
    log_output    TEXT,
    env_vars      JSONB        NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent migration for existing installs
ALTER TABLE runs ADD COLUMN IF NOT EXISTS env_vars JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs (status);
