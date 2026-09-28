-- Extends `devices` so it can fully replace InventoryPage's old
-- inventory-registry JSON file (keyed by hostname, with a `groups` array
-- and a MAC address) — not just the simpler lab/os_type model from
-- schema.sql.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS mac_address TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS groups TEXT[] DEFAULT '{}';

-- hostname was never unique before (only ip_address was) — the registry is
-- keyed by hostname/alias, so upserts need to target that.
ALTER TABLE devices ADD CONSTRAINT devices_hostname_key UNIQUE (hostname);

-- InventoryPage lets you add a host with NO lab assignment (it's a global
-- ad-hoc registry, not per-lab). schema.sql's RLS assumes every device has
-- a lab_id matching some in-charge's assigned_lab. Rather than silently
-- breaking that, this makes lab_id optional and gives unassigned devices a
-- placeholder — decide deliberately whether "unassigned" devices should be
-- HOD-only or visible to everyone; the policy below picks HOD-only.
ALTER TABLE devices ALTER COLUMN lab_id DROP NOT NULL;

DROP POLICY IF EXISTS "HOD sees all devices" ON devices;
CREATE POLICY "HOD sees all devices" ON devices
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'hod'
  );
