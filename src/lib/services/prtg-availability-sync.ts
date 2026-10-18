import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchDailyDowntimeCsv, fetchTrafficSensors, HISTORY_CONCURRENCY, mapWithConcurrency } from '../prtg';
import { addDays, eachDate } from '../dates';
import { parseCsv } from './prtg-traffic-sync';

const DAY_SECONDS = 86400;
const DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/;
const CHUNK = 500;

export interface AvailabilitySyncResult {
  status: 'success' | 'partial' | 'failed';
  from: string;
  to: string;
  sensorsSeen: number;
  rowsWritten: number;
  errors: string[];
}

interface AvailabilityRow {
  sensor_id: number;
  sensor_name: string;
  device: string;
  import_date: string;
  up_detik: number;
  down_detik: number;
}

/**
 * Downtime percentage per day from a historicdata.csv (avg=86400).
 * Blank or unreadable rows are skipped, so a day with no value is never written as zero.
 */
export function parseDailyDowntime(text: string): Map<string, number> {
  const out = new Map<string, number>();
  const rows = parseCsv(text);
  if (rows.length === 0) return out;
  const header = rows[0];
  const dateIdx = header.indexOf('Date Time');
  const downIdx = header.indexOf('Downtime(RAW)');
  if (dateIdx < 0 || downIdx < 0) throw new Error("CSV has no 'Date Time' or 'Downtime' column");

  for (const r of rows.slice(1)) {
    const m = DATE_PATTERN.exec(r[dateIdx] ?? '');
    if (!m || r[downIdx] === undefined || r[downIdx] === '') continue;
    const pct = Number(r[downIdx]);
    if (!Number.isFinite(pct)) continue;
    out.set(`${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`, pct);
  }
  return out;
}

/**
 * Reads daily downtime for every traffic sensor from PRTG for the WIB dates from..to (inclusive)
 * and upserts up/down seconds into prtg_sensor_reports, keyed on sensor and day.
 * `supabase` must use the service role key. Only runs where PRTG is reachable (the office network).
 */
export async function syncPrtgAvailability(supabase: SupabaseClient, from: string, to: string): Promise<AvailabilitySyncResult> {
  const errors: string[] = [];
  const { sensors, skipped } = await fetchTrafficSensors();
  if (skipped > 0) errors.push(`${skipped} sensor dilewati (data PRTG tidak lengkap)`);

  // PRTG wall-clock times in WIB. The end is exclusive, so the last day is `to` itself.
  const sdate = `${from}-00-00-00`;
  const edate = `${addDays(to, 1)}-00-00-00`;
  const dates = new Set(eachDate(from, to));

  const perSensor = await mapWithConcurrency(sensors, HISTORY_CONCURRENCY, async s => {
    try {
      const downtime = parseDailyDowntime(await fetchDailyDowntimeCsv(s.objid, sdate, edate));
      const rows: AvailabilityRow[] = [];
      for (const [date, pct] of downtime) {
        if (!dates.has(date)) continue;
        const down = (pct / 100) * DAY_SECONDS;
        rows.push({
          sensor_id: s.objid,
          sensor_name: s.sensor,
          device: s.device,
          import_date: date,
          up_detik: Number((DAY_SECONDS - down).toFixed(2)),
          down_detik: Number(down.toFixed(2)),
        });
      }
      return rows;
    } catch (err) {
      // Messages from the PRTG client carry no URL or credentials
      errors.push(`sensor ${s.objid} (${s.sensor}): ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  });

  const rows = perSensor.flatMap(r => r ?? []);
  let rowsWritten = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from('prtg_sensor_reports').upsert(batch, { onConflict: 'sensor_id,import_date' });
    if (error) {
      errors.push(`prtg_sensor_reports: ${error.message}`);
      break;
    }
    rowsWritten += batch.length;
  }

  const failedSensors = perSensor.filter(r => r === null).length;
  const status = errors.length === 0 ? 'success' : rowsWritten > 0 && failedSensors < sensors.length ? 'partial' : 'failed';
  return { status, from, to, sensorsSeen: sensors.length, rowsWritten, errors };
}
