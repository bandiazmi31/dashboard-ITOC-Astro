import { fetchDailyDowntimeCsv, fetchTrafficSensors, HISTORY_CONCURRENCY, mapWithConcurrency } from '../prtg';
import { getCached, setCached } from '../cache';
import { addDays, eachDate } from '../dates';
import { getIspFromSensor } from './analytics';
import { parseCsv } from './prtg-traffic-sync';

export interface IspAvailabilityKpi {
  name: string;
  sla: number;
  /** Mean of the daily values in percent, or null when there is no data in the range */
  actual: number | null;
  status: 'safe' | 'critical' | 'no-data';
}

export interface SensorAvailabilityRow {
  date: string;
  sensor: string;
  device: string;
  /** Percent of the day the sensor was up */
  availability: number;
}

/**
 * Daily availability from PRTG, in the same shape the dashboards used from the database.
 * Null on a day with no PRTG data for that ISP.
 */
export interface IspAvailabilityDaily {
  dates: string[];
  astinet: (number | null)[];
  jlm: (number | null)[];
  lintasarta: (number | null)[];
  kpi: { ispAvailability: IspAvailabilityKpi[] };
  devices: SensorAvailabilityRow[];
  /** Sensors whose history could not be read; they are left out of the averages */
  sensorsFailed: number;
}

/** Live PRTG calls are slow, so the same range is reused for this long */
const CACHE_TTL_SECONDS = 600;
const DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/;

/** SLA per ISP, in percent */
const SLA: Record<'Astinet' | 'JLM' | 'Lintasarta', number> = { Astinet: 99.5, JLM: 99.0, Lintasarta: 99.5 };

/**
 * Downtime percentage per day from a historicdata.csv (avg=86400).
 * Rows whose date or downtime cannot be read are skipped, so a footer line never becomes a day.
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
    const date = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    out.set(date, pct);
  }
  return out;
}

/** Mean of the values, rounded to 2 decimals, or null when there are none */
function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2));
}

function kpiFor(name: 'Astinet' | 'JLM' | 'Lintasarta', series: (number | null)[]): IspAvailabilityKpi {
  const actual = mean(series.filter((v): v is number => v !== null));
  const sla = SLA[name];
  const status = actual === null ? 'no-data' : actual >= sla ? 'safe' : 'critical';
  return { name, sla, actual, status };
}

/**
 * Daily availability per ISP for the calendar dates from..to (inclusive, WIB), read live from PRTG.
 * Each sensor's availability is 100 minus its daily downtime. An ISP's value for a day is the mean
 * of its sensors that reported that day. Throws when PRTG is unreachable for every sensor.
 */
export async function getIspAvailability(from: string, to: string): Promise<IspAvailabilityDaily> {
  const key = `isp-availability:${from}:${to}`;
  const cached = getCached<IspAvailabilityDaily>(key);
  if (cached) return cached;

  const { sensors } = await fetchTrafficSensors();
  // PRTG wall-clock times in WIB. The end is exclusive, so the last day is `to` itself.
  const sdate = `${from}-00-00-00`;
  const edate = `${addDays(to, 1)}-00-00-00`;

  const perSensor = await mapWithConcurrency(sensors, HISTORY_CONCURRENCY, async s => {
    const isp = getIspFromSensor(s.sensor, s.device);
    try {
      const downtime = parseDailyDowntime(await fetchDailyDowntimeCsv(s.objid, sdate, edate));
      const availability = new Map<string, number>();
      for (const [date, pct] of downtime) availability.set(date, Number((100 - pct).toFixed(4)));
      return { sensor: s.sensor, device: s.device, isp, availability, ok: true };
    } catch (err) {
      // Messages from the PRTG client carry no URL or credentials
      console.error(`[NOC] availability sensor ${s.objid}:`, err instanceof Error ? err.message : err);
      return { sensor: s.sensor, device: s.device, isp, availability: new Map<string, number>(), ok: false };
    }
  });

  const failed = perSensor.filter(p => !p.ok).length;
  if (failed === perSensor.length && perSensor.length > 0) {
    throw new Error('PRTG tidak mengembalikan data ketersediaan');
  }

  const dates = eachDate(from, to);
  const seriesFor = (isp: string) => dates.map(date => mean(
    perSensor
      .filter(p => p.isp === isp)
      .map(p => p.availability.get(date))
      .filter((v): v is number => v !== undefined)
  ));
  const astinet = seriesFor('Astinet');
  const jlm = seriesFor('JLM');
  const lintasarta = seriesFor('Lintasarta');

  const devices: SensorAvailabilityRow[] = [];
  for (const p of perSensor) {
    for (const date of dates) {
      const value = p.availability.get(date);
      if (value !== undefined) devices.push({ date, sensor: p.sensor, device: p.device, availability: value });
    }
  }

  const result: IspAvailabilityDaily = {
    dates,
    astinet,
    jlm,
    lintasarta,
    kpi: {
      ispAvailability: [
        kpiFor('Astinet', astinet),
        kpiFor('JLM', jlm),
        kpiFor('Lintasarta', lintasarta),
      ],
    },
    devices,
    sensorsFailed: failed,
  };
  setCached(key, result, CACHE_TTL_SECONDS);
  return result;
}
