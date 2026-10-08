-- Grant public read access for API endpoints (unauthenticated)
CREATE POLICY IF NOT EXISTS "Allow public read soc_threats" ON public.soc_threats_daily
  FOR SELECT TO anon USING (true);

CREATE POLICY IF NOT EXISTS "Allow public read noc_availability" ON public.noc_availability_daily
  FOR SELECT TO anon USING (true);
