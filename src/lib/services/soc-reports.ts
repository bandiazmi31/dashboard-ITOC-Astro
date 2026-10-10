import type { SupabaseClient } from '@supabase/supabase-js';

export const K_KEYS = [
  'k01', 'k02', 'k03', 'k04', 'k05', 'k06', 'k07', 'k08',
  'k09', 'k10', 'k11', 'k12', 'k13', 'k14', 'k15',
] as const;

export type KKey = (typeof K_KEYS)[number];

/** Report types as they appear in the Laporan column of the SOC export */
export const REPORT_TYPES = {
  severity: 'SOC-Threat-Summary',
  highCritical: 'SOC-Threat-HighCritical',
  urlSummary: 'SOC-URL-Summary',
  internalHost: 'SOC-Threat-InternalHost',
  topSource: 'SOC-Threat-TopSource',
  application: 'SOC-Traffic-Application',
  ruleZone: 'SOC-Traffic-Rule-Zone',
  trafficTop: 'SOC-Traffic-Top',
  trafficDenied: 'SOC-Traffic-Denied',
  appStats: 'SOC-AppStats-Historical',
} as const;

export interface SocReportRow extends Record<KKey, string | null> {
  id: string;
  import_date: string;
  laporan_type: string;
}

/** Rows of the aggregation views (see DATABASE_MIGRATION_SOC_VIEWS.sql), one per date and dimension */
export interface SeverityAgg { import_date: string; severity: string; total: number }
export interface ThreatNameAgg { import_date: string; threat_name: string; events: number }
export interface UrlCategoryAgg { import_date: string; category: string; total: number }
export interface HostAgg { import_date: string; ip: string; total: number }
export interface SourceAgg { import_date: string; ip: string; country: string | null; total: number }
export interface ApplicationAgg { import_date: string; app: string; volume: number }
export interface ActionAgg { import_date: string; action: string; total: number }
export interface TrafficAgg { import_date: string; total_bytes: number }

export interface SocAggregates {
  severity: SeverityAgg[];
  threatNames: ThreatNameAgg[];
  urlCategories: UrlCategoryAgg[];
  internalHosts: HostAgg[];
  topSources: SourceAgg[];
  applications: ApplicationAgg[];
  actions: ActionAgg[];
  traffic: TrafficAgg[];
}

export interface DateRange { from: string; to: string }

const PAGE_SIZE = 1000; // PostgREST returns at most 1000 rows per request by default

/** Collects every page of a PostgREST query. Throws only when a query fails. */
async function fetchAllPages<T>(
  fetchPage: (offset: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await fetchPage(offset);
    if (error) {
      throw new Error(`SOC query failed: ${error.message}`);
    }
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

/**
 * Aggregated totals for the SOC cards, charts, and tables, read from the pre-aggregated views.
 * Postgres does the grouping; the app only receives one row per date and dimension.
 */
export async function getSocAggregates(supabase: SupabaseClient, range: DateRange): Promise<SocAggregates> {
  const inRange = <T extends string>(view: T) =>
    supabase.from(view).select('*').gte('import_date', range.from).lte('import_date', range.to);

  const [severity, threatNames, urlCategories, internalHosts, topSources, applications, actions, traffic] = await Promise.all([
    fetchAllPages<SeverityAgg>(offset =>
      inRange('soc_severity_daily').order('import_date').order('severity').range(offset, offset + PAGE_SIZE - 1)),
    fetchAllPages<ThreatNameAgg>(offset =>
      inRange('soc_threat_names_daily').order('import_date').order('threat_name').range(offset, offset + PAGE_SIZE - 1)),
    fetchAllPages<UrlCategoryAgg>(offset =>
      inRange('soc_url_categories_daily').order('import_date').order('category').range(offset, offset + PAGE_SIZE - 1)),
    fetchAllPages<HostAgg>(offset =>
      inRange('soc_internal_hosts_daily').order('import_date').order('ip').range(offset, offset + PAGE_SIZE - 1)),
    fetchAllPages<SourceAgg>(offset =>
      inRange('soc_top_sources_daily').order('import_date').order('ip').range(offset, offset + PAGE_SIZE - 1)),
    fetchAllPages<ApplicationAgg>(offset =>
      inRange('soc_applications_daily').order('import_date').order('app').range(offset, offset + PAGE_SIZE - 1)),
    fetchAllPages<ActionAgg>(offset =>
      inRange('soc_threat_actions_daily').order('import_date').order('action').range(offset, offset + PAGE_SIZE - 1)),
    fetchAllPages<TrafficAgg>(offset =>
      inRange('soc_traffic_daily').order('import_date').range(offset, offset + PAGE_SIZE - 1)),
  ]);

  return {
    severity,
    threatNames,
    urlCategories,
    internalHosts,
    topSources,
    applications,
    actions,
    traffic,
  };
}

/**
 * Raw rows for the report types that have no aggregation view (the small generic ones).
 */
export async function getSocReportRows(
  supabase: SupabaseClient,
  range: DateRange,
  types: readonly string[]
): Promise<SocReportRow[]> {
  return fetchAllPages<SocReportRow>(offset =>
    supabase
      .from('soc_reports')
      .select('*')
      .in('laporan_type', [...types])
      .gte('import_date', range.from)
      .lte('import_date', range.to)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
  );
}
