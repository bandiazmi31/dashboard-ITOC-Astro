-- ============================================
-- PRTG delta method: store cumulative counters per snapshot
-- Run manually in Supabase SQL Editor, after DATABASE_MIGRATION_PRTG_UPSERT.sql.
-- ============================================

-- Cumulative up/down seconds PRTG reports for the sensor at snapshot time.
-- A day's up_detik/down_detik is the difference from the previous snapshot.
ALTER TABLE public.prtg_sensor_reports
  ADD COLUMN IF NOT EXISTS up_cum_sec NUMERIC,
  ADD COLUMN IF NOT EXISTS down_cum_sec NUMERIC,
  ADD COLUMN IF NOT EXISTS snapshot_at TIMESTAMP WITH TIME ZONE;