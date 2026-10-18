import type { SupabaseClient } from '@supabase/supabase-js';

export interface TrendsParams {
  from: string;
  to: string;
}

export interface IspAvailability {
  name: string;
  sla: number;
  /** Average availability in percent, or null when there is no data to average */
  actual: number | null;
  status: 'safe' | 'critical' | 'no-data';
}

export interface NocDeviceRow {
  date: string;
  sensor: string;
  device: string;
  /** Availability in percent, or null when the sensor reported zero up and down time */
  availability: number | null;
  traffic: number;
  downtime: number;
}

export interface NocTrendsResult {
  dates: string[];
  /** Daily availability per ISP in percent; null on days with no data for that ISP */
  astinet: (number | null)[];
  jlm: (number | null)[];
  lintasarta: (number | null)[];
  traffic_mbps: number[];
  kpi: {
    ispAvailability: IspAvailability[];
  };
  devices: NocDeviceRow[];
}

function getIspFromSensor(name: string, device: string): string {
  const n = name.toLowerCase();
  if (n.includes('astinet')) return 'Astinet';
  if (n.includes('jlm')) return 'JLM';
  if (n.includes('lintasarta')) return 'Lintasarta';

  // Device-name lookup for sensors whose name does not contain the ISP
  const deviceMap: Record<string, string> = {
    'Benoa': 'Astinet',
  };
  return deviceMap[device] || 'Unknown';
}

/** Availability in percent from up and down seconds. Null when there is no measured time. */
function availabilityPercent(upSeconds: number, downSeconds: number): number | null {
  const total = upSeconds + downSeconds;
  if (!Number.isFinite(total) || total <= 0) return null;
  return Number(((upSeconds / total) * 100).toFixed(2));
}

const mean = (values: (number | null)[]): number | null => {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return Number((present.reduce((a, b) => a + b, 0) / present.length).toFixed(2));
};

const ispStatus = (actual: number | null, sla: number): IspAvailability['status'] => {
  if (actual === null) return 'no-data';
  return actual >= sla ? 'safe' : 'critical';
};

/**
 * Throws only when the query itself fails. An empty date range returns empty series.
 */
export async function getNocTrends(
  supabase: SupabaseClient,
  params: TrendsParams
): Promise<NocTrendsResult> {
  const { from, to } = params;

  const { data: prtgData, error } = await supabase
    .from('prtg_sensor_reports')
    .select('*')
    .gte('import_date', from)
    .lte('import_date', to);

  if (error) {
    throw new Error(`NOC query failed: ${error.message}`);
  }

  const rows = prtgData ?? [];
  const dates = Array.from(new Set(rows.map((d: any) => d.import_date as string))).sort();

  const astinet: (number | null)[] = [];
  const jlm: (number | null)[] = [];
  const lintasarta: (number | null)[] = [];
  const traffic_mbps: number[] = [];

  dates.forEach(date => {
    const dayData = rows.filter((d: any) => d.import_date === date);

    const ispStats: Record<string, { up: number, down: number, traffic: number, count: number }> = {
      'Astinet': { up: 0, down: 0, traffic: 0, count: 0 },
      'JLM': { up: 0, down: 0, traffic: 0, count: 0 },
      'Lintasarta': { up: 0, down: 0, traffic: 0, count: 0 }
    };

    dayData.forEach((d: any) => {
      const isp = getIspFromSensor(d.sensor_name, d.device);
      if (ispStats[isp]) {
        ispStats[isp].up += Number(d.up_detik);
        ispStats[isp].down += Number(d.down_detik);
        ispStats[isp].traffic += Number(d.avg_total_mbit);
        ispStats[isp].count += 1;
      }
    });

    // Null when the ISP has no rows that day, so a gap is not plotted as 0%
    const dayAvailability = (isp: string): number | null =>
      ispStats[isp].count === 0 ? null : availabilityPercent(ispStats[isp].up, ispStats[isp].down);

    astinet.push(dayAvailability('Astinet'));
    jlm.push(dayAvailability('JLM'));
    lintasarta.push(dayAvailability('Lintasarta'));
    traffic_mbps.push(Number((ispStats['Astinet'].traffic + ispStats['JLM'].traffic + ispStats['Lintasarta'].traffic).toFixed(2)));
  });

  const astinetActual = mean(astinet);
  const jlmActual = mean(jlm);
  const lintasartaActual = mean(lintasarta);

  return {
    dates,
    astinet,
    jlm,
    lintasarta,
    traffic_mbps,
    devices: rows.map((d: any) => ({
      date: d.import_date,
      sensor: d.sensor_name,
      device: d.device,
      availability: availabilityPercent(Number(d.up_detik), Number(d.down_detik)),
      traffic: Number(d.avg_total_mbit),
      downtime: Number(d.down_detik)
    })),
    kpi: {
      ispAvailability: [
        { name: 'Astinet', sla: 99.5, actual: astinetActual, status: ispStatus(astinetActual, 99.5) },
        { name: 'JLM', sla: 99.0, actual: jlmActual, status: ispStatus(jlmActual, 99.0) },
        { name: 'Lintasarta', sla: 99.5, actual: lintasartaActual, status: ispStatus(lintasartaActual, 99.5) }
      ]
    }
  };
}
