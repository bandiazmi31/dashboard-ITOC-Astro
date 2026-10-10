-- ============================================
-- SOC report uploads (Laporan SOC .xlsx)
-- One row per report row per import date.
-- Idempotency is handled by the upload API: it deletes all rows for an import_date
-- before inserting the new batch, so there is no unique key on this table.
-- Safe to re-run.
-- ============================================

CREATE TABLE IF NOT EXISTS public.soc_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  import_date DATE NOT NULL,
  laporan_type TEXT NOT NULL,
  k01 TEXT, k02 TEXT, k03 TEXT, k04 TEXT, k05 TEXT,
  k06 TEXT, k07 TEXT, k08 TEXT, k09 TEXT, k10 TEXT,
  k11 TEXT, k12 TEXT, k13 TEXT, k14 TEXT, k15 TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_soc_reports_import_date ON public.soc_reports(import_date DESC);

ALTER TABLE public.soc_reports ENABLE ROW LEVEL SECURITY;

-- Authenticated users only. Drop-then-create keeps the script re-runnable.
DROP POLICY IF EXISTS "Allow authenticated read soc_reports" ON public.soc_reports;
CREATE POLICY "Allow authenticated read soc_reports"
  ON public.soc_reports FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert soc_reports" ON public.soc_reports;
CREATE POLICY "Allow authenticated insert soc_reports"
  ON public.soc_reports FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated delete soc_reports" ON public.soc_reports;
CREATE POLICY "Allow authenticated delete soc_reports"
  ON public.soc_reports FOR DELETE TO authenticated USING (true);

-- Table privileges, stated explicitly so the script does not depend on Supabase's default grants.
-- RLS policies above still limit which rows each role can see.
REVOKE ALL ON public.soc_reports FROM anon;
GRANT SELECT, INSERT, DELETE ON public.soc_reports TO authenticated;
