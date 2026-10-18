import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, jakartaDate } from '../dates';

/** Must match RETENTION_DAYS in prtg-traffic-sync.ts: older hours are deleted, so no history exists before this */
export const TRAFFIC_RETENTION_DAYS = 30;

/** Hourly labels are shown in the operations team's time zone */
const LABEL_FORMAT = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export type TrafficRange = '24h' | '7d';
export const TRAFFIC_RANGES: TrafficRange[] = ['24h', '7d'];

const RANGE_HOURS: Record<TrafficRange, number> = { '24h': 24, '7d': 7 * 24 };

export interface TrafficWindow {
  from: string;
  to: string;
}

export interface TrafficSensorOption {
  sensor_id: number;
  name: string;
  device: string | null;
}

export interface TrafficSeries {
  labels: string[];
  in: (number | null)[];
  out: (number | null)[];
}

export interface TrafficKpis {
  sensorCount: number;
  peakIn: number | null;
  peakOut: number | null;
  avgIn: number | null;
  avgOut: number | null;
}

export interface TrafficTopSensor {
  sensor_id: number;
  name: string;
  device: string | null;
  avgIn: number | null;
  avgOut: number | null;
}

export interface TrafficSyncStatus {
  finishedAt: string | null;
  status: 'running' | 'success' | 'partial' | 'failed' | null;
  errorCount: number;
}

/** What the NOC page is showing: the hour window for the traffic queries, and the calendar dates for availability. */
export interface TrafficSelection {
  window: TrafficWindow;
  dates: { from: string; to: string };
  /** Human-readable period, shown under the section title */
  label: string;
  /** Which control is active: a rolling preset or a custom date range */
  mode: 'rolling' | 'dates';
  /** True when the requested dates were moved inside the retention window */
  clamped: boolean;
  /** Query string that selects the same period, used by the sensor detail fetch */
  query: string;
}

export interface TrafficPageData {
  window: TrafficWindow;
  total: TrafficSeries;
  kpis: TrafficKpis;
  top: TrafficTopSensor[];
  sensors: TrafficSensorOption[];
  sync: TrafficSyncStatus;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Rolling window ending now. Hour starts are stored in UTC, so the ISO strings compare directly. */
export function trafficWindow(range: TrafficRange, now: Date = new Date()): TrafficWindow {
  const to = new Date(Math.floor(now.getTime() / 3600_000) * 3600_000);
  const from = new Date(to.getTime() - RANGE_HOURS[range] * 3600_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Parses the range query parameter, falling back to the default (7 days) for anything unknown. */
export function parseRange(value: string | null): TrafficRange {
  return TRAFFIC_RANGES.find(r => r === value) ?? '7d';
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Start of a WIB calendar day as an ISO instant. Jakarta has no DST, so the offset is fixed. */
function wibDayStart(date: string): string {
  return new Date(`${date}T00:00:00+07:00`).toISOString();
}

/**
 * Resolves the NOC query into the period to show.
 * `from` and `to` (YYYY-MM-DD, WIB) take precedence over the rolling `range` presets.
 * Dates are clamped to the retention window; `clamped` tells the page when that happened.
 */
export function resolveTrafficSelection(params: URLSearchParams, now: Date = new Date()): TrafficSelection {
  const today = jakartaDate(now);
  const from = params.get('from');
  const to = params.get('to');

  if (from && to && DATE_PATTERN.test(from) && DATE_PATTERN.test(to) && from <= to) {
    const earliest = addDays(today, -(TRAFFIC_RETENTION_DAYS - 1));
    const start = from < earliest ? earliest : from;
    const end = to > today ? today : to;
    if (start <= end) {
      return {
        window: { from: wibDayStart(start), to: wibDayStart(addDays(end, 1)) },
        dates: { from: start, to: end },
        label: `${start} s/d ${end}`,
        mode: 'dates',
        clamped: start !== from || end !== to,
        query: `from=${start}&to=${end}`,
      };
    }
  }

  const range = parseRange(params.get('range'));
  const dates = range === '24h'
    ? { from: addDays(today, -1), to: today }
    : { from: addDays(today, -6), to: today };
  return {
    window: trafficWindow(range, now),
    dates,
    label: range === '24h' ? '24 jam terakhir' : '7 hari terakhir',
    mode: 'rolling',
    clamped: false,
    query: `range=${range}`,
  };
}

function label(iso: string): string {
  return LABEL_FORMAT.format(new Date(iso));
}

/** Mean of the present values, or null when nothing has data */
function mean(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return Number((present.reduce((a, b) => a + b, 0) / present.length).toFixed(2));
}

function maxOf(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length === 0 ? null : Math.max(...present);
}

/** Everything the NOC traffic section needs. Aggregates only; raw rows never reach the page. */
export async function getTrafficPage(supabase: SupabaseClient, window: TrafficWindow): Promise<TrafficPageData> {
  const [totalRes, topRes, sensorsRes, syncRes] = await Promise.all([
    supabase.rpc('traffic_total_hourly', { p_from: window.from, p_to: window.to }),
    supabase.rpc('traffic_top_sensors', { p_from: window.from, p_to: window.to, p_n: 10 }),
    supabase.from('prtg_sensors').select('sensor_id, name, device').order('name'),
    supabase
      .from('prtg_sync_runs')
      .select('finished_at, status, errors')
      .not('finished_at', 'is', null)
      .order('started_at', { ascending: false })
      .limit(1),
  ]);

  for (const res of [totalRes, topRes, sensorsRes, syncRes]) {
    if (res.error) throw new Error(`Traffic PRTG gagal dibaca: ${res.error.message}`);
  }

  const totalRows = (totalRes.data ?? []) as { hour_start: string; in_mbit: unknown; out_mbit: unknown }[];
  const totalIn = totalRows.map(r => toNumber(r.in_mbit));
  const totalOut = totalRows.map(r => toNumber(r.out_mbit));

  const topRows = (topRes.data ?? []) as { sensor_id: number; name: string; device: string | null; avg_in_mbit: unknown; avg_out_mbit: unknown }[];
  const sensors = (sensorsRes.data ?? []) as TrafficSensorOption[];
  const lastSync = (syncRes.data ?? [])[0] as { finished_at: string; status: TrafficSyncStatus['status']; errors: unknown[] } | undefined;

  return {
    window,
    total: {
      labels: totalRows.map(r => label(r.hour_start)),
      in: totalIn,
      out: totalOut,
    },
    kpis: {
      sensorCount: sensors.length,
      peakIn: maxOf(totalIn),
      peakOut: maxOf(totalOut),
      avgIn: mean(totalIn),
      avgOut: mean(totalOut),
    },
    top: topRows.map(r => ({
      sensor_id: Number(r.sensor_id),
      name: r.name,
      device: r.device,
      avgIn: toNumber(r.avg_in_mbit),
      avgOut: toNumber(r.avg_out_mbit),
    })),
    sensors,
    sync: {
      finishedAt: lastSync?.finished_at ?? null,
      status: lastSync?.status ?? null,
      errorCount: lastSync?.errors?.length ?? 0,
    },
  };
}

/** Hourly In and Out for one sensor over the window. Gaps stay null so the line breaks instead of dropping to zero. */
export async function getSensorSeries(
  supabase: SupabaseClient,
  sensorId: number,
  window: TrafficWindow
): Promise<TrafficSeries> {
  const { data, error } = await supabase.rpc('traffic_sensor_series', {
    p_sensor: sensorId,
    p_from: window.from,
    p_to: window.to,
  });
  if (error) throw new Error(`Traffic sensor gagal dibaca: ${error.message}`);

  const rows = (data ?? []) as { hour_start: string; in_mbit: unknown; out_mbit: unknown }[];
  return {
    labels: rows.map(r => label(r.hour_start)),
    in: rows.map(r => toNumber(r.in_mbit)),
    out: rows.map(r => toNumber(r.out_mbit)),
  };
}
