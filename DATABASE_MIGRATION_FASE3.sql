-- ============================================
-- Fase 3: Historical Data Tables for SOC & NOC Charts
-- Supabase Migration Script
-- Last updated: 2026-10-10
-- Schema and RLS only. No seed data: rows must come from the real SOC/NOC sources.
-- ============================================

-- ============================================
-- Table: soc_threats_daily
-- Stores daily threat statistics from SOC
-- ============================================
CREATE TABLE IF NOT EXISTS public.soc_threats_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  total_threats INTEGER NOT NULL DEFAULT 0,
  high_critical_threats INTEGER NOT NULL DEFAULT 0,
  blocked_threats INTEGER NOT NULL DEFAULT 0,
  firewall_traffic_tb NUMERIC(10,2) NOT NULL DEFAULT 0,
  firewall_sessions TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Table: noc_availability_daily
-- Stores daily ISP availability metrics from NOC
-- ============================================
CREATE TABLE IF NOT EXISTS public.noc_availability_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  isp_name TEXT NOT NULL CHECK (isp_name IN ('Astinet', 'JLM', 'Lintasarta')),
  availability_percent NUMERIC(5,2) NOT NULL CHECK (availability_percent >= 0 AND availability_percent <= 100),
  traffic_mbps NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(date, isp_name)
);

-- ============================================
-- Indexes for Performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_soc_threats_date ON public.soc_threats_daily(date DESC);
CREATE INDEX IF NOT EXISTS idx_noc_availability_date ON public.noc_availability_daily(date DESC, isp_name);

-- ============================================
-- Row Level Security (RLS) - AUTHENTICATED ONLY
-- ============================================
ALTER TABLE public.soc_threats_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.noc_availability_daily ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read data (security fix).
-- Postgres has no CREATE POLICY IF NOT EXISTS, so check pg_policies first.
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
-- Cleanup for databases where the old seed data was already applied.
-- Review first, then run manually. Only deletes the rows the old seed inserted.
-- ============================================
-- DELETE FROM public.soc_threats_daily
--   WHERE date BETWEEN '2026-10-01' AND '2026-10-08'
--     AND firewall_sessions IN ('200K','195K','210K','220K','205K','198K','190K');
-- DELETE FROM public.noc_availability_daily
--   WHERE date BETWEEN '2026-10-01' AND '2026-10-08'
--     AND isp_name IN ('Astinet', 'JLM', 'Lintasarta');
