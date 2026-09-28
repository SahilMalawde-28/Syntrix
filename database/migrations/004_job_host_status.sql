-- Per-device outcome tracking within a single job. One `jobs` row can
-- target a whole group (e.g. "linux_hosts") covering many machines; this
-- table records what happened on EACH machine individually, so one
-- offline PC doesn't block or hide results for the others.
--
-- status values:
--   'pending'         - not yet attempted
--   'queued_offline'  - ping failed; will auto-retry when the device comes
--                       back online, does NOT count as a failure
--   'success'         - ansible-playbook ran and succeeded on this host
--   'failed'          - ansible-playbook ran but genuinely failed on this
--                       host (real task failure, not a connectivity issue)

CREATE TABLE IF NOT EXISTS job_host_status (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id      UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  hostname    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  output      TEXT DEFAULT '',
  attempts    INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (job_id, hostname)
);

CREATE INDEX IF NOT EXISTS idx_job_host_status_status ON job_host_status (status);
CREATE INDEX IF NOT EXISTS idx_job_host_status_job_id ON job_host_status (job_id);

ALTER TABLE job_host_status ENABLE ROW LEVEL SECURITY;

-- Same visibility rule as the parent job: HOD sees all, in-charge sees
-- their own lab's jobs' host statuses.
DROP POLICY IF EXISTS "Users see host status for visible jobs" ON job_host_status;
CREATE POLICY "Users see host status for visible jobs" ON job_host_status
  FOR SELECT USING (
    job_id IN (SELECT id FROM jobs)  -- jobs' own RLS already filters this
  );

-- New overall job status: some hosts succeeded, some are queued waiting
-- for a device to come back online. Not a failure, not yet "done".
-- Must run as a bare statement (not inside DO/BEGIN) — Postgres restricts
-- using a brand-new enum value in the same transaction it was added in,
-- and wrapping this in a DO block can trigger that restriction.
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'partial';
