-- ============================================
-- Security Fix: RLS Policies for SOC/NOC Tables
-- Change from public (anon) to authenticated-only access
-- Date: 2026-10-08
-- Safe to re-run: every step checks current state first.
-- ============================================

-- Remove any anon (public) read access
DROP POLICY IF EXISTS "Allow public read soc_threats" ON public.soc_threats_daily;
DROP POLICY IF EXISTS "Allow public read noc_availability" ON public.noc_availability_daily;
REVOKE ALL ON public.soc_threats_daily FROM anon;
REVOKE ALL ON public.noc_availability_daily FROM anon;

-- Authenticated-only read access (Postgres has no CREATE POLICY IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'soc_threats_daily'
      AND policyname = 'Allow authenticated read soc_threats'
  ) THEN
    CREATE POLICY "Allow authenticated read soc_threats" ON public.soc_threats_daily
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'noc_availability_daily'
      AND policyname = 'Allow authenticated read noc_availability'
  ) THEN
    CREATE POLICY "Allow authenticated read noc_availability" ON public.noc_availability_daily
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- ============================================
-- Verification Query (uncomment to test)
-- ============================================
-- Should return data when run with authenticated session:
-- SELECT * FROM public.soc_threats_daily LIMIT 1;
-- SELECT * FROM public.noc_availability_daily LIMIT 1;

-- Should return 0 rows as anon due to RLS (or fail on the REVOKE):
-- SET ROLE anon;
-- SELECT * FROM public.soc_threats_daily;
-- RESET ROLE;
