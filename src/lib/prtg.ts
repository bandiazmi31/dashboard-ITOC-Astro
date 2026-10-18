/**
 * Server-side client for the PRTG Core HTTP API.
 * Credentials come from env (PRTG_BASE_URL, PRTG_USERNAME, PRTG_PASSHASH) and never reach the browser.
 * Error messages never include the request URL, because it carries the passhash.
 */

import https from 'node:https';
import { addDays } from './dates';

const SENSOR_TAG_FILTER = '@sub(traffic)';
const REQUEST_TIMEOUT_MS = 20_000;
export const HISTORY_CONCURRENCY = 6;

/** A PRTG-side failure whose message is safe to show to the user. */
export class PrtgError extends Error {}

export interface PrtgSensor {
  objid: number;
  sensor: string;
  device: string;
  /** Cumulative up seconds PRTG has counted for this sensor. Only grows; a day's value is a difference of two snapshots. */
  upCumSeconds: number;
  /** Cumulative down seconds PRTG has counted for this sensor. Only grows. */
  downCumSeconds: number;
}

export interface PrtgTrafficAverage {
  /** Average total traffic in Mbit/s over the requested day, or null when PRTG returned no usable points */
  total: number | null;
  in: number | null;
  out: number | null;
}

function config(): { baseUrl: string; username: string; passhash: string } {
  // process.env first, same as the other server routes (see api/tickets/summary.ts)
  const baseUrl = process.env.PRTG_BASE_URL || import.meta.env.PRTG_BASE_URL;
  const username = process.env.PRTG_USERNAME || import.meta.env.PRTG_USERNAME;
  const passhash = process.env.PRTG_PASSHASH || import.meta.env.PRTG_PASSHASH;
  if (!baseUrl || !username || !passhash) {
    throw new PrtgError('PRTG belum dikonfigurasi (PRTG_BASE_URL, PRTG_USERNAME, PRTG_PASSHASH)');
  }
  // Accept the host (https://10.181.1.20) or a full endpoint copied from Postman (.../api/table.json)
  const host = baseUrl.replace(/\/api(\/.*)?$/, '').replace(/\/+$/, '');
  return { baseUrl: host, username, passhash };
}

/** GET a PRTG endpoint and return the raw response body. */
async function prtgGetText(path: string, params: Record<string, string>): Promise<string> {
  const { baseUrl, username, passhash } = config();
  const url = new URL(`${baseUrl}/api/${path}`);
  for (const [key, value] of Object.entries({ ...params, username, passhash })) {
    url.searchParams.set(key, value);
  }

  let response: { status: number; body: string };
  try {
    response = await httpsGet(url);
  } catch (err) {
    // err.code names the TLS or network failure (e.g. DEPTH_ZERO_SELF_SIGNED_CERT); it carries no URL
    const code = (err as NodeJS.ErrnoException).code;
    throw new PrtgError(`PRTG tidak dapat dihubungi (${path}${code ? `, ${code}` : ''})`);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new PrtgError(`PRTG ${path} merespons HTTP ${response.status}`);
  }
  return response.body;
}

async function prtgGet(path: string, params: Record<string, string>): Promise<any> {
  const body = await prtgGetText(path, params);
  try {
    return JSON.parse(body);
  } catch {
    // A login page or proxy error comes back as HTML when the passhash is wrong
    throw new PrtgError(`PRTG ${path} tidak mengembalikan JSON (periksa kredensial)`);
  }
}

/**
 * Hourly history for one sensor as CSV (all channels in one response).
 * Use this for traffic: historicdata.json repeats its keys per channel, so a JSON parser drops channels.
 * sdate/edate are wall-clock times in PRTG's server time zone, formatted YYYY-MM-DD-HH-MM-SS.
 */
export function fetchHourlyTrafficCsv(objid: number, sdate: string, edate: string): Promise<string> {
  return prtgGetText('historicdata.csv', { id: String(objid), avg: '3600', sdate, edate });
}

/**
 * Daily history for one sensor as CSV. The Downtime column is the percentage of the day the sensor was down.
 * Availability is 100 minus that. Same wall-clock date format as fetchHourlyTrafficCsv.
 */
export function fetchDailyDowntimeCsv(objid: number, sdate: string, edate: string): Promise<string> {
  return prtgGetText('historicdata.csv', { id: String(objid), avg: '86400', sdate, edate });
}

/**
 * GET via node:https. PRTG on the office network usually has a self-signed certificate, which the
 * global fetch rejects. Relaxing verification only applies when PRTG_TLS_INSECURE=true.
 */
function httpsGet(url: URL): Promise<{ status: number; body: string }> {
  const rejectUnauthorized = (process.env.PRTG_TLS_INSECURE || import.meta.env.PRTG_TLS_INSECURE) !== 'true';
  return new Promise((resolve, reject) => {
    const req = https.get(url, { rejectUnauthorized, timeout: REQUEST_TIMEOUT_MS }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('PRTG request timed out')));
    req.on('error', reject);
  });
}

/** PRTG raw values arrive as numbers or as strings such as "-"; only finite numbers count. */
function asNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Sensors tagged "traffic", with their up and down seconds from the table API. */
export async function fetchTrafficSensors(): Promise<{ sensors: PrtgSensor[]; skipped: number }> {
  const data = await prtgGet('table.json', {
    content: 'sensors',
    output: 'json',
    columns: 'objid,device,sensor,uptimetime,downtimetime',
    filter_tags: SENSOR_TAG_FILTER,
  });

  const sensors: PrtgSensor[] = [];
  let skipped = 0;
  for (const row of data.sensors ?? []) {
    const objid = asNumber(row.objid_raw ?? row.objid);
    const upCumSeconds = asNumber(row.uptimetime_raw);
    const downCumSeconds = asNumber(row.downtimetime_raw);
    if (objid === null || upCumSeconds === null || downCumSeconds === null) {
      skipped += 1;
      continue;
    }
    sensors.push({
      objid,
      sensor: String(row.sensor_raw ?? row.sensor ?? ''),
      device: String(row.device_raw ?? row.device ?? ''),
      upCumSeconds,
      downCumSeconds,
    });
  }
  return { sensors, skipped };
}

/** Average speed (Mbit/s) for one sensor over one calendar day in PRTG's server time zone. */
export async function fetchDailyTraffic(objid: number, date: string): Promise<PrtgTrafficAverage> {
  const data = await prtgGet('historicdata.json', {
    id: String(objid),
    avg: '0',
    usecaption: '1',
    sdate: `${date}-00-00-00`,
    edate: `${addDays(date, 1)}-00-00-00`,
  });

  return {
    total: averageMbit(data.histdata, 'Traffic Total (Speed)'),
    in: averageMbit(data.histdata, 'Traffic In (Speed)'),
    out: averageMbit(data.histdata, 'Traffic Out (Speed)'),
  };
}

/** Mean of one speed channel in Mbit/s. PRTG reports speeds in bit/s. */
function averageMbit(points: unknown, channel: string): number | null {
  if (!Array.isArray(points)) return null;
  const values = points
    .map(point => asNumber((point as Record<string, unknown>)[channel]))
    .filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  const meanBitsPerSecond = values.reduce((a, b) => a + b, 0) / values.length;
  return Number((meanBitsPerSecond / 1_000_000).toFixed(2));
}

/** Runs `worker` over `items` with at most `limit` requests in flight. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}
