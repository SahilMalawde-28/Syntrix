-- Adds optional per-device connection overrides used by inventory_builder.py.
-- Credentials deliberately NOT stored here — see backend/group_vars/.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS ansible_user TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS ansible_port INTEGER;

-- Let authenticated users add/edit devices from the web UI, since the
-- devices table is now the source of truth instead of the CSV.
DROP POLICY IF EXISTS "HOD manages devices" ON devices;
CREATE POLICY "HOD manages devices" ON devices
  FOR ALL USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'hod')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'hod');

DROP POLICY IF EXISTS "In-Charge manages own lab devices" ON devices;
CREATE POLICY "In-Charge manages own lab devices" ON devices
  FOR ALL USING (lab_id = (SELECT assigned_lab FROM profiles WHERE id = auth.uid()))
  WITH CHECK (lab_id = (SELECT assigned_lab FROM profiles WHERE id = auth.uid()));
