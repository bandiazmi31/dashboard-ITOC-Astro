import type { SocAggregates } from './soc-reports';
import { eachDate } from '../dates';
import { formatBytes } from '../formatters';

/** K05 actions (SOC-Threat-Summary) that count as blocked threats */
export const BLOCKING_ACTIONS: readonly string[] = [
  'drop', 'deny', 'reset-both', 'reset-server', 'reset-client', 'block-url', 'block-ip',
  'drop-packet', 'sinkhole',
];

export interface SocDashboard {
  /** Every date in the range, including days with no data */
  dates: string[];
  /** Daily total threat events (SOC-Threat-Summary, K09), 0 on days without data */
  threats_all: number[];
  /** Daily high and critical threat events, 0 on days without data */
  threats_high_critical: number[];
  /** Daily traffic volume in bytes (SOC-AppStats-Historical, K03), 0 on days without data */
  traffic_bytes: number[];
  kpi: {
    totalThreats: number;
    highCriticalThreats: number;
    highCriticalPercentage: number;
    blockedThreats: number;
    blockedPercentage: number;
    /** Distinct internal hosts (SOC-Threat-InternalHost, K01) in the range */
    internalHostCount: number;
    /** Total application traffic volume (SOC-Traffic-Application, K05), formatted in KB/MB/GB/TB */
    applicationVolume: string;
    /** Total URL accesses (SOC-URL-Summary, K05) in the range */
    urlAccesses: number;
  };
}

const HIGH_CRITICAL = new Set(['high', 'critical']);
const UNKNOWN_HOST = '(tanpa IP)';

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const percentOf = (part: number, whole: number) =>
  whole > 0 ? Number(((part / whole) * 100).toFixed(2)) : 0;

/**
 * Chart series and KPI totals for the selected range, built from the aggregation views.
 * Every date in [from, to] appears in each series, so the time axis has no gaps.
 */
export function buildSocDashboard(aggregates: SocAggregates, from: string, to: string): SocDashboard {
  const dates = eachDate(from, to);

  const dailyAll = new Map<string, number>();
  const dailyHighCritical = new Map<string, number>();
  for (const row of aggregates.severity) {
    const total = Number(row.total);
    dailyAll.set(row.import_date, (dailyAll.get(row.import_date) ?? 0) + total);
    if (HIGH_CRITICAL.has(row.severity)) {
      dailyHighCritical.set(row.import_date, (dailyHighCritical.get(row.import_date) ?? 0) + total);
    }
  }

  const dailyTraffic = new Map<string, number>();
  for (const row of aggregates.traffic) {
    dailyTraffic.set(row.import_date, (dailyTraffic.get(row.import_date) ?? 0) + Number(row.total_bytes));
  }

  const threats_all = dates.map(d => dailyAll.get(d) ?? 0);
  const threats_high_critical = dates.map(d => dailyHighCritical.get(d) ?? 0);
  const traffic_bytes = dates.map(d => dailyTraffic.get(d) ?? 0);

  const totalThreats = sum(threats_all);
  const highCriticalThreats = sum(threats_high_critical);

  const blockedThreats = aggregates.actions
    .filter(a => BLOCKING_ACTIONS.includes(a.action))
    .reduce((acc, a) => acc + Number(a.total), 0);

  const internalHostCount = new Set(
    aggregates.internalHosts.map(h => h.ip).filter(ip => ip !== UNKNOWN_HOST)
  ).size;

  const applicationBytes = aggregates.applications.reduce((acc, r) => acc + Number(r.volume), 0);

  const urlAccesses = aggregates.urlCategories.reduce((acc, r) => acc + Number(r.total), 0);

  return {
    dates,
    threats_all,
    threats_high_critical,
    traffic_bytes,
    kpi: {
      totalThreats,
      highCriticalThreats,
      highCriticalPercentage: percentOf(highCriticalThreats, totalThreats),
      blockedThreats,
      blockedPercentage: percentOf(blockedThreats, totalThreats),
      internalHostCount,
      applicationVolume: formatBytes(applicationBytes),
      urlAccesses,
    },
  };
}
