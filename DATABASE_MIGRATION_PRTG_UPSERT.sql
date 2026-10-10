-- ============================================
-- PRTG idempotent upload: one row per sensor per day
-- Run manually in Supabase SQL Editor, in this order.
-- ============================================

-- 1. Remove duplicate rows that already exist (keeps the newest row per sensor per day).
--    Run this before step 2, or the UNIQUE constraint will fail.
DELETE FROM public.prtg_sensor_reports a
USING public.prtg_sensor_reports b
WHERE a.sensor_id = b.sensor_id
  AND a.import_date = b.import_date
  AND (a.created_at < b.created_at
       OR (a.created_at = b.created_at AND a.id < b.id));

-- 2. Enforce one row per sensor per day (the upsert target)
ALTER TABLE public.prtg_sensor_reports
  ADD CONSTRAINT prtg_sensor_reports_sensor_day_key UNIQUE (sensor_id, import_date);

-- 3. Upsert needs UPDATE permission under RLS (the original migration only had INSERT and SELECT)
DROP POLICY IF EXISTS "Allow authenticated users to update PRTG data" ON public.prtg_sensor_reports;
CREATE POLICY "Allow authenticated users to update PRTG data"
  ON public.prtg_sensor_reports
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
