-- ============================================
-- SOC report aggregation views
-- The dashboard reads these instead of pulling raw soc_reports rows into the app.
-- Each view is grouped by import_date and one dimension; metrics are summed here.
-- Requires Postgres 15+ (Supabase default). Safe to re-run.
-- ============================================

-- Safe text -> numeric: returns NULL for anything that is not a plain number
CREATE OR REPLACE FUNCTION public.soc_report_num(v text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN trim(v) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN trim(v)::numeric END
$$;

-- Lookup for the per-type filters and the date-range queries
CREATE INDEX IF NOT EXISTS idx_soc_reports_type_date
  ON public.soc_reports (laporan_type, import_date);

-- Severity (SOC-Threat-Summary: severity K02, count K09)
CREATE OR REPLACE VIEW public.soc_severity_daily WITH (security_invoker = true) AS
SELECT
  import_date,
  COALESCE(lower(k02), 'unknown') AS severity,
  COALESCE(SUM(public.soc_report_num(k09)), 0) AS total
FROM public.soc_reports
WHERE laporan_type = 'SOC-Threat-Summary'
GROUP BY import_date, COALESCE(lower(k02), 'unknown');

-- Threat names (SOC-Threat-HighCritical: threat name K12, event count K15)
CREATE OR REPLACE VIEW public.soc_threat_names_daily WITH (security_invoker = true) AS
SELECT
  import_date,
  COALESCE(k12, '(tanpa nama)') AS threat_name,
  COALESCE(SUM(public.soc_report_num(k15)), 0) AS events
FROM public.soc_reports
WHERE laporan_type = 'SOC-Threat-HighCritical'
GROUP BY import_date, COALESCE(k12, '(tanpa nama)');

-- URL categories (SOC-URL-Summary: category K04, count K05)
CREATE OR REPLACE VIEW public.soc_url_categories_daily WITH (security_invoker = true) AS
SELECT
  import_date,
  COALESCE(k04, '(tanpa kategori)') AS category,
  COALESCE(SUM(public.soc_report_num(k05)), 0) AS total
FROM public.soc_reports
WHERE laporan_type = 'SOC-URL-Summary'
GROUP BY import_date, COALESCE(k04, '(tanpa kategori)');

-- Internal hosts (SOC-Threat-InternalHost: IP K01, count K09)
CREATE OR REPLACE VIEW public.soc_internal_hosts_daily WITH (security_invoker = true) AS
SELECT
  import_date,
  COALESCE(k01, '(tanpa IP)') AS ip,
  COALESCE(SUM(public.soc_report_num(k09)), 0) AS total
FROM public.soc_reports
WHERE laporan_type = 'SOC-Threat-InternalHost'
GROUP BY import_date, COALESCE(k01, '(tanpa IP)');

-- Top sources (SOC-Threat-TopSource: IP K01, country K03, count K05)
CREATE OR REPLACE VIEW public.soc_top_sources_daily WITH (security_invoker = true) AS
SELECT
  import_date,
  COALESCE(k01, '(tanpa IP)') AS ip,
  MAX(k03) AS country,
  COALESCE(SUM(public.soc_report_num(k05)), 0) AS total
FROM public.soc_reports
WHERE laporan_type = 'SOC-Threat-TopSource'
GROUP BY import_date, COALESCE(k01, '(tanpa IP)');

-- Applications by traffic volume in bytes (SOC-Traffic-Application: app K01, volume K05)
CREATE OR REPLACE VIEW public.soc_applications_daily WITH (security_invoker = true) AS
SELECT
  import_date,
  COALESCE(k01, '(tanpa nama)') AS app,
  COALESCE(SUM(public.soc_report_num(k05)), 0) AS volume
FROM public.soc_reports
WHERE laporan_type = 'SOC-Traffic-Application'
GROUP BY import_date, COALESCE(k01, '(tanpa nama)');

-- Views are readable by signed-in users only (RLS on soc_reports still applies through security_invoker)
REVOKE ALL ON public.soc_severity_daily, public.soc_threat_names_daily, public.soc_url_categories_daily,
  public.soc_internal_hosts_daily, public.soc_top_sources_daily, public.soc_applications_daily
  FROM anon;
GRANT SELECT ON public.soc_severity_daily, public.soc_threat_names_daily, public.soc_url_categories_daily,
  public.soc_internal_hosts_daily, public.soc_top_sources_daily, public.soc_applications_daily
  TO authenticated;

-- ============================================
-- Added: blocked-action breakdown and daily traffic volume
-- ============================================

-- Threat events per action (SOC-Threat-Summary: action K05, count K09).
-- The app decides which actions count as blocked.
CREATE OR REPLACE VIEW public.soc_threat_actions_daily WITH (security_invoker = true) AS
SELECT
  import_date,
  COALESCE(lower(k05), '(tanpa aksi)') AS action,
  COALESCE(SUM(public.soc_report_num(k09)), 0) AS total
FROM public.soc_reports
WHERE laporan_type = 'SOC-Threat-Summary'
GROUP BY import_date, COALESCE(lower(k05), '(tanpa aksi)');

-- Daily traffic volume in bytes (SOC-AppStats-Historical: volume bytes K03, grouped by the date in K01)
CREATE OR REPLACE VIEW public.soc_traffic_daily WITH (security_invoker = true) AS
SELECT
  import_date,
  COALESCE(SUM(public.soc_report_num(k03)), 0) AS total_bytes
FROM public.soc_reports
WHERE laporan_type = 'SOC-AppStats-Historical'
GROUP BY import_date;

REVOKE ALL ON public.soc_threat_actions_daily, public.soc_traffic_daily FROM anon;
GRANT SELECT ON public.soc_threat_actions_daily, public.soc_traffic_daily TO authenticated;
