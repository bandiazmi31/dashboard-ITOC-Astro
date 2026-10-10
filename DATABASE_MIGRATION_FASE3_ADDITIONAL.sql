-- ============================================
-- REVERSAL: remove public (anon) read access to SOC/NOC tables
-- The previous version of this file re-created anon SELECT policies,
-- which made both tables readable by anyone holding the public anon key.
-- Every dashboard read goes through an authenticated session, so anon
-- needs no access. Safe to re-run.
-- ============================================

DROP POLICY IF EXISTS "Allow public read soc_threats" ON public.soc_threats_daily;
DROP POLICY IF EXISTS "Allow public read noc_availability" ON public.noc_availability_daily;
REVOKE ALL ON public.soc_threats_daily FROM anon;
REVOKE ALL ON public.noc_availability_daily FROM anon;
