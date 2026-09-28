-- ============================================================================
-- Syntrix Cloud — Supabase schema
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- Safe to re-run: uses IF NOT EXISTS / DO blocks where possible.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('hod', 'lab_incharge');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE job_status AS ENUM ('pending', 'running', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE os_type_enum AS ENUM ('linux', 'windows');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Profiles (extends Supabase auth.users)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email         TEXT NOT NULL,
  role          user_role NOT NULL DEFAULT 'lab_incharge',
  assigned_lab  TEXT,                      -- e.g. 'lab_1'; NULL for HOD (sees all)
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create a profile row whenever a new auth user signs up.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ---------------------------------------------------------------------------
-- Devices
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS devices (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  hostname     TEXT NOT NULL,
  ip_address   TEXT NOT NULL UNIQUE,
  os_type      os_type_enum NOT NULL,
  lab_id       TEXT NOT NULL,
  is_online    BOOLEAN DEFAULT false,
  cpu_percent  NUMERIC,
  ram_percent  NUMERIC,
  disk_percent NUMERIC,
  uptime_sec   BIGINT,
  last_seen    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_lab_id ON devices (lab_id);

-- ---------------------------------------------------------------------------
-- Jobs
--
-- `params` carries the structured, domain-specific arguments (username,
-- group, process_name, password, etc.) so the backend can build the exact
-- CLI flags main.py's argparse sub-parsers expect, without a schema change
-- every time a new domain/flag is added. `command` is kept as a simple
-- free-text fallback (e.g. a package name) for callers that don't need
-- structured params.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jobs (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by    UUID REFERENCES profiles(id),
  target_lab    TEXT NOT NULL,
  domain        TEXT NOT NULL,             -- 'user', 'telemetry', 'monitor', 'software', 'system', 'patch', ...
  action        TEXT NOT NULL,             -- 'create', 'get-stats', 'vitals', 'install', 'reboot', ...
  target        TEXT DEFAULT 'all',        -- maps to main.py's --target
  command       TEXT,                      -- simple free-text arg (e.g. package name)
  params        JSONB DEFAULT '{}'::jsonb, -- structured extra flags, e.g. {"username": "john", "group": "sudo"}
  status        job_status DEFAULT 'pending',
  output_log    TEXT DEFAULT '',
  exit_code     INTEGER,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
CREATE INDEX IF NOT EXISTS idx_jobs_target_lab ON jobs (target_lab);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices  ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs     ENABLE ROW LEVEL SECURITY;

-- Profiles: everyone can read their own profile row.
DROP POLICY IF EXISTS "Users read own profile" ON profiles;
CREATE POLICY "Users read own profile" ON profiles
  FOR SELECT USING (id = auth.uid());

-- Devices: HOD sees everything.
DROP POLICY IF EXISTS "HOD sees all devices" ON devices;
CREATE POLICY "HOD sees all devices" ON devices
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'hod'
  );

-- Devices: lab in-charge sees only their assigned lab.
DROP POLICY IF EXISTS "In-Charge sees assigned lab devices" ON devices;
CREATE POLICY "In-Charge sees assigned lab devices" ON devices
  FOR SELECT USING (
    lab_id = (SELECT assigned_lab FROM profiles WHERE id = auth.uid())
  );

-- Jobs: HOD sees/manages all jobs.
DROP POLICY IF EXISTS "HOD sees all jobs" ON jobs;
CREATE POLICY "HOD sees all jobs" ON jobs
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'hod'
  );

-- Jobs: lab in-charge sees/creates jobs only for their own lab.
DROP POLICY IF EXISTS "In-Charge sees own lab jobs" ON jobs;
CREATE POLICY "In-Charge sees own lab jobs" ON jobs
  FOR SELECT USING (
    target_lab = (SELECT assigned_lab FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "In-Charge inserts jobs for own lab" ON jobs;
CREATE POLICY "In-Charge inserts jobs for own lab" ON jobs
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND (
      target_lab = (SELECT assigned_lab FROM profiles WHERE id = auth.uid())
      OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'hod'
    )
  );

-- NOTE: the backend server uses the SERVICE_ROLE key, which bypasses RLS
-- entirely — that's how it's able to poll every pending job regardless of
-- lab and write status/output_log back. RLS above only governs what the
-- browser (anon/user JWT) can see and insert directly.
