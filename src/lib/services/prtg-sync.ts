import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays } from '../dates';
import {
  fetchDailyTraffic,
  fetchTrafficSensors,
  HISTORY_CONCURRENCY,
  mapWithConcurrency,
  type PrtgTrafficAverage,
} from '../prtg';

/** How many days back a baseline snapshot may be before it is too stale to subtract from */
const MAX_BASELINE_DAYS = 7;

export interface PrtgSyncResult {
  import_date: string;
  snapshot_at: string;
  /** Sensors whose up/down time for the day is the difference from an earlier snapshot */
  delta: number;
  /** Sensors with no earlier snapshot; their existing up/down values were left unchanged */
  no_baseline: number;
  /** Sensors whose counter went backwards (PRTG reset); treated like no_baseline */
  counter_reset: number;
  /** Sensors PRTG returned without usable counters */
  skipped: number;
  /** Sensors whose traffic history could not be averaged; their traffic columns are saved as null */
  traffic_missing: number;
}

interface Baseline {
  up_cum_sec: number;
  down_cum_sec: number;
}

/**
 * The most recent earlier snapshot per sensor, within MAX_BASELINE_DAYS of `date`.
 * Only rows before `date` count, so re-running a day compares against the same baseline.
 */
async function loadBaselines(
  supabase: SupabaseClient,
  date: string,
  sensorIds: number[]
): Promise<Map<number, Baseline>> {
  const baselines = new Map<number, Baseline>();
  if (sensorIds.length === 0) return baselines;

  const { data, error } = await supabase
    .from('prtg_sensor_reports')
    .select('sensor_id, up_cum_sec, down_cum_sec')
    .in('sensor_id', sensorIds)
    .gte('import_date', addDays(date, -MAX_BASELINE_DAYS))
    .lt('import_date', date)
    .not('up_cum_sec', 'is', null)
    .order('import_date', { ascending: false });

  if (error) throw new Error(`PRTG baseline gagal dibaca: ${error.message}`);

  // Rows are newest first, so the first row seen for a sensor is its latest snapshot
  for (const row of data ?? []) {
    const id = Number(row.sensor_id);
    if (baselines.has(id)) continue;
    baselines.set(id, { up_cum_sec: Number(row.up_cum_sec), down_cum_sec: Number(row.down_cum_sec) });
  }
  return baselines;
}

/**
 * Snapshots the traffic sensors from PRTG and writes one row per sensor for `date`.
 *
 * Delta method: PRTG reports cumulative up/down seconds. Each sync stores that snapshot
 * (up_cum_sec, down_cum_sec, snapshot_at). The day's up_detik/down_detik is the difference
 * from the previous snapshot, so the result does not depend on how PRTG windows its totals.
 *
 * Rows are written in two groups that each share one set of keys, so the upsert only
 * overwrites the columns it sends. Sensors without a baseline keep their existing up/down
 * values (for example, from the Excel upload).
 */
export async function syncPrtgDay(supabase: SupabaseClient, date: string): Promise<PrtgSyncResult> {
  const snapshotAt = new Date().toISOString();
  const { sensors, skipped } = await fetchTrafficSensors();
  const baselines = await loadBaselines(supabase, date, sensors.map(s => s.objid));

  const traffic = await mapWithConcurrency<number, PrtgTrafficAverage | null>(
    sensors.map(s => s.objid),
    HISTORY_CONCURRENCY,
    objid => fetchDailyTraffic(objid, date).catch(err => {
      console.error(`[PRTG SYNC] history failed for sensor ${objid}:`, err instanceof Error ? err.message : err);
      return null;
    })
  );

  const withDelta: Record<string, unknown>[] = [];
  const snapshotOnly: Record<string, unknown>[] = [];
  let noBaseline = 0;
  let counterReset = 0;

  sensors.forEach((s, i) => {
    const base = baselines.get(s.objid);
    const upDelta = base ? s.upCumSeconds - base.up_cum_sec : null;
    const downDelta = base ? s.downCumSeconds - base.down_cum_sec : null;

    const common = {
      sensor_id: s.objid,
      import_date: date,
      sensor_name: s.sensor,
      device: s.device,
      up_cum_sec: s.upCumSeconds,
      down_cum_sec: s.downCumSeconds,
      snapshot_at: snapshotAt,
      avg_total_mbit: traffic[i]?.total ?? null,
      avg_in_mbit: traffic[i]?.in ?? null,
      avg_out_mbit: traffic[i]?.out ?? null,
    };

    if (upDelta !== null && downDelta !== null && upDelta >= 0 && downDelta >= 0) {
      withDelta.push({ ...common, up_detik: upDelta, down_detik: downDelta });
    } else {
      if (base) counterReset++;
      else noBaseline++;
      snapshotOnly.push(common);
    }
  });

  const upserts = [withDelta, snapshotOnly].filter(rows => rows.length > 0);
  for (const rows of upserts) {
    const { error } = await supabase
      .from('prtg_sensor_reports')
      .upsert(rows, { onConflict: 'sensor_id,import_date' });
    if (error) throw new Error(`PRTG sync gagal menyimpan: ${error.message}`);
  }

  return {
    import_date: date,
    snapshot_at: snapshotAt,
    delta: withDelta.length,
    no_baseline: noBaseline,
    counter_reset: counterReset,
    skipped,
    traffic_missing: traffic.filter(t => t === null || t.total === null).length,
  };
}
