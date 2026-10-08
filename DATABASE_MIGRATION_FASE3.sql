-- ============================================
-- Fase 3: Historical Data Tables for SOC & NOC Charts
-- Supabase Migration Script
-- Last updated: 2026-10-08
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

-- Allow authenticated users to read data (security fix)
CREATE POLICY IF NOT EXISTS "Allow authenticated read soc_threats" ON public.soc_threats_daily
  FOR SELECT TO authenticated USING (true);

CREATE POLICY IF NOT EXISTS "Allow authenticated read noc_availability" ON public.noc_availability_daily
  FOR SELECT TO authenticated USING (true);

-- ============================================
-- Seed Data: SOC Threats (Last 8 Days: 2026-10-01 to 2026-10-08)
-- Generated from src/data/soc.ts mock data
-- ============================================
INSERT INTO public.soc_threats_daily (date, total_threats, high_critical_threats, blocked_threats, firewall_traffic_tb, firewall_sessions)
VALUES
  ('2026-10-01', 150, 10, 147, 6.2, '200K'),
  ('2026-10-02', 180, 12, 176, 5.8, '195K'),
  ('2026-10-03', 130, 5, 127, 6.5, '210K'),
  ('2026-10-04', 210, 18, 205, 7.1, '220K'),
  ('2026-10-05', 195, 14, 191, 6.9, '205K'),
  ('2026-10-06', 260, 16, 254, 6.4, '198K'),
  ('2026-10-07', 295, 10, 290, 6.3, '190K'),
  ('2026-10-08', 220, 15, 215, 6.8, '210K')
ON CONFLICT (date) DO NOTHING;

-- ============================================
-- Seed Data: NOC ISP Availability (Last 8 Days: 2026-10-01 to 2026-10-08)
-- Generated from src/data/noc.ts mock data
-- Traffic split: Astinet ~60%, Lintasarta ~25%, JLM ~15%
-- ============================================
INSERT INTO public.noc_availability_daily (date, isp_name, availability_percent, traffic_mbps)
VALUES
  ('2026-10-01', 'Astinet', 99.9, 450),
  ('2026-10-01', 'JLM', 99.1, 150),
  ('2026-10-01', 'Lintasarta', 99.7, 200),
  ('2026-10-02', 'Astinet', 100.0, 480),
  ('2026-10-02', 'JLM', 98.2, 155),
  ('2026-10-02', 'Lintasarta', 99.5, 210),
  ('2026-10-03', 'Astinet', 99.8, 420),
  ('2026-10-03', 'JLM', 97.9, 145),
  ('2026-10-03', 'Lintasarta', 99.6, 195),
  ('2026-10-04', 'Astinet', 100.0, 510),
  ('2026-10-04', 'JLM', 98.5, 160),
  ('2026-10-04', 'Lintasarta', 99.8, 220),
  ('2026-10-05', 'Astinet', 99.7, 495),
  ('2026-10-05', 'JLM', 98.9, 158),
  ('2026-10-05', 'Lintasarta', 99.2, 205),
  ('2026-10-06', 'Astinet', 99.8, 530),
  ('2026-10-06', 'JLM', 98.0, 152),
  ('2026-10-06', 'Lintasarta', 99.3, 215),
  ('2026-10-07', 'Astinet', 100.0, 485),
  ('2026-10-07', 'JLM', 98.4, 156),
  ('2026-10-07', 'Lintasarta', 99.5, 208),
  ('2026-10-08', 'Astinet', 99.85, 465),
  ('2026-10-08', 'JLM', 98.3, 154),
  ('2026-10-08', 'Lintasarta', 99.6, 210)
ON CONFLICT (date, isp_name) DO NOTHING;

-- ============================================
-- Verification Queries (Uncomment to check)
-- ============================================
-- SELECT * FROM public.soc_threats_daily ORDER BY date DESC LIMIT 8;
-- SELECT * FROM public.noc_availability_daily ORDER BY date DESC, isp_name LIMIT 24;
