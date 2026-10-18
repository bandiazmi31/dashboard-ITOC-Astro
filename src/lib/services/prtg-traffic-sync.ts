import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchHourlyTrafficCsv,
  fetchTrafficSensors,
  HISTORY_CONCURRENCY,
  mapWithConcurrency,
} from '../prtg';

/** PRTG reports its wall-clock times in Asia/Jakarta (WIB, UTC+7, no daylight saving) */
const PRTG_UTC_OFFSET_MS = 7 * 3600_000;
const HOUR_MS = 3600_000;
/** Hourly rows are kept this long; older rows are deleted at the end of each sync */
const RETENTION_DAYS = 30;
const UPSERT_CHUNK = 1000;

export interface PrtgTrafficSyncResult {
  status: 'success' | 'partial' | 'failed';
  sensors_seen: number;
  sensors_ok: number;
  rows_written: number;
  errors: string[];
  window_start: string;
  window_end: string;
}

interface TrafficRow {
  sensor_id: number;
  hour_start: string;
  channel: 'in' | 'out';
  mbit: number | null;
}

/** Wall-clock text PRTG expects for sdate/edate: YYYY-MM-DD-HH-MM-SS in Asia/Jakarta */
export function prtgWallClock(ms: number): string {
  const wall = new Date(ms + PRTG_UTC_OFFSET_MS).toISOString();
  return `${wall.slice(0, 10)}-${wall.slice(11, 13)}-${wall.slice(14, 16)}-${wall.slice(17, 19)}`;
}

/**
 * "10/10/2026 12:00:00 PM - 1:00:00 PM" -> UTC ms of the start of the hour, or null for a blank or footer line.
 * The start of the range is the hour the row represents.
 */
export function parseHourStart(text: string): number | null {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) ([AP]M)/.exec(text || '');
  if (!m) return null;
  let hour = Number(m[4]) % 12;
  if (m[7] === 'PM') hour += 12;
  const wallAsUtc = Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2]), hour, Number(m[5]), Number(m[6]));
  return wallAsUtc - PRTG_UTC_OFFSET_MS;
}

/** RFC 4180 CSV: handles quoted fields, commas inside them, and doubled quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * Parses historicdata.csv for one sensor into hourly In and Out rows.
 * The "(Speed)(RAW)" columns are bytes per second: Mbit/s = bytes * 8 / 1,000,000.
 * Rows without a parseable timestamp are skipped; an empty value is stored as null (a gap, not zero).
 */
export function parseSensorCsv(sensorId: number, text: string): TrafficRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0];
  const dateIdx = header.indexOf('Date Time');
  if (dateIdx < 0) throw new Error("CSV has no 'Date Time' column");

  const channelCols: [string, 'in' | 'out'][] = [
    ['Traffic In (Speed)(RAW)', 'in'],
    ['Traffic Out (Speed)(RAW)', 'out'],
  ];
  const cols = channelCols
    .map(([name, channel]) => [header.indexOf(name), channel] as [number, 'in' | 'out'])
    .filter(([i]) => i >= 0);

  const out: TrafficRow[] = [];
  for (const r of rows.slice(1)) {
    const startMs = parseHourStart(r[dateIdx]);
    if (startMs === null) continue;
    const hour_start = new Date(startMs).toISOString();
    for (const [i, channel] of cols) {
      const raw = Number(r[i]);
      out.push({
        sensor_id: sensorId,
        hour_start,
        channel,
        mbit: r[i] === '' || Number.isNaN(raw) ? null : (raw * 8) / 1_000_000,
      });
    }
  }
  return out;
}

async function upsertChunked<T extends object>(
  supabase: SupabaseClient,
  table: string,
  rows: T[],
  onConflict: string
): Promise<void> {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + UPSERT_CHUNK), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

/**
 * Reloads hourly In/Out for every traffic sensor over the last `hours` hours and upserts it.
 * Re-running is safe: rows are keyed on (sensor_id, hour_start, channel).
 * A sensor that fails is logged in the run and skipped; the others still sync.
 * `supabase` must use the service role key, because the table policies allow reads only.
 */
export async function syncPrtgTraffic(
  supabase: SupabaseClient,
  hours: number
): Promise<PrtgTrafficSyncResult> {
  const endMs = Date.now();
  const startMs = endMs - hours * HOUR_MS;
  const window_start = new Date(startMs).toISOString();
  const window_end = new Date(endMs).toISOString();
  const errors: string[] = [];
  let rowsWritten = 0;

  const { data: run, error: runErr } = await supabase
    .from('prtg_sync_runs')
    .insert({ window_start, window_end })
    .select('id')
    .single();
  if (runErr) throw new Error(`prtg_sync_runs: ${runErr.message}`);

  try {
    const { sensors, skipped } = await fetchTrafficSensors();
    if (skipped > 0) errors.push(`${skipped} sensor dilewati (data PRTG tidak lengkap)`);

    await upsertChunked(
      supabase,
      'prtg_sensors',
      sensors.map(s => ({
        sensor_id: s.objid,
        name: s.sensor,
        device: s.device,
        updated_at: new Date().toISOString(),
      })),
      'sensor_id'
    );

    const sdate = prtgWallClock(startMs);
    const edate = prtgWallClock(endMs);
    const results = await mapWithConcurrency(sensors, HISTORY_CONCURRENCY, async s => {
      try {
        const csv = await fetchHourlyTrafficCsv(s.objid, sdate, edate);
        const rows = parseSensorCsv(s.objid, csv);
        await upsertChunked(supabase, 'prtg_traffic_hourly', rows, 'sensor_id,hour_start,channel');
        return { ok: true as const, rows: rows.length };
      } catch (err) {
        // Messages from the PRTG client carry no URL or credentials
        errors.push(`sensor ${s.objid} (${s.sensor}): ${err instanceof Error ? err.message : String(err)}`);
        return { ok: false as const, rows: 0 };
      }
    });
    const sensorsOk = results.filter(r => r.ok).length;
    rowsWritten = results.reduce((sum, r) => sum + r.rows, 0);

    const cutoff = new Date(endMs - RETENTION_DAYS * 24 * HOUR_MS).toISOString();
    const { error: retErr } = await supabase.from('prtg_traffic_hourly').delete().lt('hour_start', cutoff);
    if (retErr) errors.push(`retensi: ${retErr.message}`);

    const status = errors.length === 0 ? 'success' : sensorsOk > 0 ? 'partial' : 'failed';
    await supabase.from('prtg_sync_runs').update({
      finished_at: new Date().toISOString(),
      status,
      sensors_seen: sensors.length,
      rows_written: rowsWritten,
      errors,
    }).eq('id', run.id);

    return {
      status,
      sensors_seen: sensors.length,
      sensors_ok: sensorsOk,
      rows_written: rowsWritten,
      errors,
      window_start,
      window_end,
    };
  } catch (err) {
    // Without this, a throw here (e.g. PRTG timeout on the sensor list) leaves the run stuck in 'running'
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from('prtg_sync_runs').update({
      finished_at: new Date().toISOString(),
      status: 'failed',
      rows_written: rowsWritten,
      errors: [...errors, `Sinkron berhenti: ${message}`],
    }).eq('id', run.id);
    throw err;
  }
}
