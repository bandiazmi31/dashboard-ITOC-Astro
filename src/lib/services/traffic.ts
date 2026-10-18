import type { SupabaseClient } from '@supabase/supabase-js';

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

export interface TrafficPageData {
  range: TrafficRange;
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
export async function getTrafficPage(supabase: SupabaseClient, range: TrafficRange): Promise<TrafficPageData> {
  const window = trafficWindow(range);

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
    range,
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

/** Hourly In and Out for one sensor over the range. Gaps stay null so the line breaks instead of dropping to zero. */
export async function getSensorSeries(
  supabase: SupabaseClient,
  sensorId: number,
  range: TrafficRange
): Promise<TrafficSeries> {
  const window = trafficWindow(range);
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
