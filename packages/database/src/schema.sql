CREATE TABLE IF NOT EXISTS installations (
  id bigint PRIMARY KEY, account text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS repositories (
  id bigint PRIMARY KEY, installation_id bigint NOT NULL REFERENCES installations(id),
  owner text NOT NULL, name text NOT NULL, UNIQUE(owner, name)
);
CREATE TABLE IF NOT EXISTS repository_policies (
  repository_id bigint PRIMARY KEY REFERENCES repositories(id), version integer NOT NULL DEFAULT 1,
  configuration jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  delivery_id text PRIMARY KEY, event text NOT NULL, accepted_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS analysis_jobs (
  id uuid PRIMARY KEY, identity text UNIQUE NOT NULL, installation_id bigint NOT NULL REFERENCES installations(id),
  repository_id bigint NOT NULL REFERENCES repositories(id), input jsonb NOT NULL, policy jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','stale','failed')),
  check_run_id bigint, error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_repository_head ON analysis_jobs(repository_id, ((input->>'headSha')));
CREATE TABLE IF NOT EXISTS job_outbox (
  job_id uuid PRIMARY KEY REFERENCES analysis_jobs(id), sent_at timestamptz, lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS analyses (
  id uuid PRIMARY KEY REFERENCES analysis_jobs(id), repository_id bigint NOT NULL REFERENCES repositories(id),
  result jsonb NOT NULL, completed_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS analyses_repository_time ON analyses(repository_id, completed_at DESC);
CREATE TABLE IF NOT EXISTS pull_request_outcomes (
  id bigserial PRIMARY KEY, repository_id bigint NOT NULL REFERENCES repositories(id),
  number integer NOT NULL, head_sha text NOT NULL, merged boolean NOT NULL,
  delivery_id text UNIQUE NOT NULL, observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY, analysis_id uuid NOT NULL REFERENCES analyses(id), evidence_id text,
  actor text NOT NULL, kind text NOT NULL CHECK(kind IN ('safe','incorrect','reverted','bugfix','incident')),
  reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY, action text NOT NULL, subject text NOT NULL,
  details jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS snapshot_cache (
  cache_key text PRIMARY KEY, value jsonb NOT NULL, expires_at timestamptz NOT NULL
);
CREATE OR REPLACE FUNCTION prism_deny_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'PRism immutable record'; END;
$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'immutable_analysis' AND tgrelid = 'analyses'::regclass) THEN
    CREATE TRIGGER immutable_analysis BEFORE UPDATE OR DELETE ON analyses FOR EACH ROW EXECUTE FUNCTION prism_deny_mutation();
    CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION prism_deny_mutation();
    CREATE TRIGGER immutable_feedback BEFORE UPDATE OR DELETE ON feedback FOR EACH ROW EXECUTE FUNCTION prism_deny_mutation();
    CREATE TRIGGER immutable_outcome BEFORE UPDATE OR DELETE ON pull_request_outcomes FOR EACH ROW EXECUTE FUNCTION prism_deny_mutation();
  END IF;
END $$;
