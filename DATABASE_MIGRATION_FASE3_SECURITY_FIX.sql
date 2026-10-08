-- ============================================
-- Security Fix: RLS Policies for SOC/NOC Tables
-- Change from public (anon) to authenticated-only access
-- Date: 2026-10-08
-- ============================================

-- Drop existing public policies
DROP POLICY IF EXISTS "Allow public read soc_threats" ON public.soc_threats_daily;
DROP POLICY IF EXISTS "Allow public read noc_availability" ON public.noc_availability_daily;

-- Recreate with authenticated-only access
CREATE POLICY "Allow authenticated read soc_threats"
  ON public.soc_threats_daily
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated read noc_availability"
  ON public.noc_availability_daily
  FOR SELECT TO authenticated USING (true);

-- ============================================
-- Verification Query (uncomment to test)
-- ============================================
-- Should return data when run with authenticated session:
-- SELECT * FROM public.soc_threats_daily LIMIT 1;
-- SELECT * FROM public.noc_availability_daily LIMIT 1;

-- Should fail when run without auth (as anon):
-- SET ROLE anon;
-- SELECT * FROM public.soc_threats_daily; -- Expected: 0 rows due to RLS
