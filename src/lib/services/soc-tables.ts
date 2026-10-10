import { K_KEYS, type SocReportRow, type SeverityAgg, type ThreatNameAgg, type UrlCategoryAgg, type HostAgg, type SourceAgg, type ApplicationAgg } from './soc-reports';
import { formatBytes } from '../formatters';

/** One display row for TopNTable. Keys are read in insertion order. */
export type TableRow = Record<string, string | number | null>;

const TOP_N = 10;

/** Numeric value of a stored cell; anything non-numeric counts as 0 */
const num = (value: string | null): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const percent = (part: number, total: number): number =>
  total > 0 ? Number(((part / total) * 100).toFixed(1)) : 0;

interface Ranked { key: string; total: number; share: number }

/**
 * Totals per key, largest first, top N, with each item's share of the grand total.
 * The grand total covers every key, not only the ones shown.
 */
function rankTop(entries: { key: string; amount: number }[]): Ranked[] {
  const totals = new Map<string, number>();
  for (const { key, amount } of entries) {
    totals.set(key, (totals.get(key) ?? 0) + amount);
  }
  const grand = [...totals.values()].reduce((a, b) => a + b, 0);
  return [...totals.entries()]
    .map(([key, total]) => ({ key, total, share: percent(total, grand) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, TOP_N);
}

/** Severity breakdown: aggregated per severity across the selected dates */
export function severityTable(rows: SeverityAgg[]): TableRow[] {
  return rankTop(rows.map(r => ({ key: r.severity, amount: Number(r.total) }))).map(item => ({
    color: item.key,
    label: item.key.charAt(0).toUpperCase() + item.key.slice(1),
    jumlah: item.total,
    percentage: item.share,
  }));
}

/** Threat names: event count (K15), summed across the selected dates */
export function threatNameTable(rows: ThreatNameAgg[]): TableRow[] {
  return rankTop(rows.map(r => ({ key: r.threat_name, amount: Number(r.events) }))).map(item => ({
    label: item.key,
    jumlah: item.total,
    percentage: item.share,
  }));
}

/** URL categories: count per category */
export function urlCategoryTable(rows: UrlCategoryAgg[]): TableRow[] {
  return rankTop(rows.map(r => ({ key: r.category, amount: Number(r.total) }))).map(item => ({
    label: item.key,
    jumlah: item.total,
    percentage: item.share,
  }));
}

/** Internal hosts: count per IP */
export function internalHostTable(rows: HostAgg[]): TableRow[] {
  return rankTop(rows.map(r => ({ key: r.ip, amount: Number(r.total) }))).map(item => ({
    ip: item.key,
    jumlah: item.total,
    percentage: item.share,
  }));
}

/** Top sources: count per IP, with the country taken from the latest non-empty row */
export function topSourceTable(rows: SourceAgg[]): TableRow[] {
  const countryByIp = new Map<string, string>();
  for (const r of rows) {
    if (r.country) countryByIp.set(r.ip, r.country);
  }
  return rankTop(rows.map(r => ({ key: r.ip, amount: Number(r.total) }))).map(item => ({
    ip: item.key,
    negara: countryByIp.get(item.key) ?? '-',
    jumlah: item.total,
    percentage: item.share,
  }));
}

/** Applications by traffic: volume in bytes, shown in KB/MB/GB/TB */
export function applicationTable(rows: ApplicationAgg[]): TableRow[] {
  return rankTop(rows.map(r => ({ key: r.app, amount: Number(r.volume) }))).map(item => ({
    app: item.key,
    volume: formatBytes(item.total),
    percentage: item.share,
  }));
}

/**
 * Generic top-10 view for report types without a dedicated table.
 * Shows the populated K columns, ranked by the last column that holds numbers in every row.
 */
export function genericTop10(rows: SocReportRow[]): {
  keys: (typeof K_KEYS)[number][];
  rows: SocReportRow[];
} {
  const keys = K_KEYS.filter(k => rows.some(r => r[k] !== null));
  const numericKeys = keys.filter(k => rows.every(r => r[k] === null || Number.isFinite(Number(r[k]))));
  const rankKey = numericKeys[numericKeys.length - 1];

  const ranked = rankKey
    ? [...rows].sort((a, b) => num(b[rankKey]) - num(a[rankKey]))
    : rows;

  return { keys, rows: ranked.slice(0, TOP_N) };
}
