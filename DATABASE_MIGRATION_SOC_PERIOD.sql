-- ============================================
-- SOC report periods
-- Report types without a date in K01 (InternalHost, TopSource, Application, HighCritical,
-- Rule-Zone, Traffic-Top, Traffic-Denied) cover the period picked at upload, not one day.
-- Every row now records its period. The dashboard includes a row when its period
-- overlaps the filter range.
-- Run after DATABASE_MIGRATION_SOC.sql and DATABASE_MIGRATION_SOC_VIEWS.sql.
-- Deploy together with the matching app code: the old *_daily views for undated types are dropped.
-- Safe to re-run.
-- ============================================

ALTER TABLE public.soc_reports ADD COLUMN IF NOT EXISTS period_from DATE;
ALTER TABLE public.soc_reports ADD COLUMN IF NOT EXISTS period_to DATE;

-- Existing rows cover the single day they were imported under (same behaviour as before)
UPDATE public.soc_reports
SET period_from = import_date, period_to = import_date
WHERE period_from IS NULL OR period_to IS NULL;

ALTER TABLE public.soc_reports ALTER COLUMN period_from SET NOT NULL;
ALTER TABLE public.soc_reports ALTER COLUMN period_to SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_soc_reports_type_period
  ON public.soc_reports (laporan_type, period_from, period_to);

-- Replace the undated-type views: they now group by period instead of import_date
DROP VIEW IF EXISTS public.soc_threat_names_daily;
DROP VIEW IF EXISTS public.soc_internal_hosts_daily;
DROP VIEW IF EXISTS public.soc_top_sources_daily;
DROP VIEW IF EXISTS public.soc_applications_daily;

-- Threat names (SOC-Threat-HighCritical: threat name K12, event count K15)
CREATE OR REPLACE VIEW public.soc_threat_names_period WITH (security_invoker = true) AS
SELECT
  period_from,
  period_to,
  COALESCE(k12, '(tanpa nama)') AS threat_name,
  COALESCE(SUM(public.soc_report_num(k15)), 0) AS events
FROM public.soc_reports
WHERE laporan_type = 'SOC-Threat-HighCritical'
GROUP BY period_from, period_to, COALESCE(k12, '(tanpa nama)');

-- Internal hosts (SOC-Threat-InternalHost: IP K01, count K09)
CREATE OR REPLACE VIEW public.soc_internal_hosts_period WITH (security_invoker = true) AS
SELECT
  period_from,
  period_to,
  COALESCE(k01, '(tanpa IP)') AS ip,
  COALESCE(SUM(public.soc_report_num(k09)), 0) AS total
FROM public.soc_reports
WHERE laporan_type = 'SOC-Threat-InternalHost'
GROUP BY period_from, period_to, COALESCE(k01, '(tanpa IP)');

-- Top sources (SOC-Threat-TopSource: IP K01, country K03, count K05)
CREATE OR REPLACE VIEW public.soc_top_sources_period WITH (security_invoker = true) AS
SELECT
  period_from,
  period_to,
  COALESCE(k01, '(tanpa IP)') AS ip,
  MAX(k03) AS country,
  COALESCE(SUM(public.soc_report_num(k05)), 0) AS total
FROM public.soc_reports
WHERE laporan_type = 'SOC-Threat-TopSource'
GROUP BY period_from, period_to, COALESCE(k01, '(tanpa IP)');

-- Applications by traffic volume in bytes (SOC-Traffic-Application: app K01, volume K05)
CREATE OR REPLACE VIEW public.soc_applications_period WITH (security_invoker = true) AS
SELECT
  period_from,
  period_to,
  COALESCE(k01, '(tanpa nama)') AS app,
  COALESCE(SUM(public.soc_report_num(k05)), 0) AS volume
FROM public.soc_reports
WHERE laporan_type = 'SOC-Traffic-Application'
GROUP BY period_from, period_to, COALESCE(k01, '(tanpa nama)');

REVOKE ALL ON public.soc_threat_names_period, public.soc_internal_hosts_period,
  public.soc_top_sources_period, public.soc_applications_period FROM anon;
GRANT SELECT ON public.soc_threat_names_period, public.soc_internal_hosts_period,
  public.soc_top_sources_period, public.soc_applications_period TO authenticated;
