import type { SupabaseClient } from '@supabase/supabase-js';

export interface TrendsParams {
  from: string;
  to: string;
}

export interface SocTrendsResult {
  dates: string[];
  threats_all: number[];
  threats_high_critical: number[];
  traffic_tb: number[];
  kpi: {
    totalThreats: number;
    highCriticalThreats: number;
    highCriticalPercentage: number;
    blockedThreatsCount: number;
    blockedThreatsPercentage: number;
    firewallTrafficTB: number;
    firewallSessions: string;
  };
  status: 'live' | 'mock';
}

export interface NocTrendsResult {
  dates: string[];
  astinet: number[];
  jlm: number[];
  lintasarta: number[];
  traffic_mbps: number[];
  kpi: {
    ispAvailability: Array<{
      name: string;
      sla: number;
      actual: number;
      status: 'safe' | 'critical';
    }>;
  };
  status: 'live' | 'mock';
}

export interface DashboardSummary {
  soc: SocTrendsResult['kpi'];
  noc: NocTrendsResult['kpi'];
  lastUpdated: string;
  status: 'live' | 'mock';
}

export async function getSocTrends(
  supabase: SupabaseClient,
  params: TrendsParams
): Promise<SocTrendsResult> {
  const { from, to } = params;

  const { data, error } = await supabase
    .from('soc_threats_daily')
    .select('*')
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true });

  if (error || !data || data.length === 0) {
    throw new Error(error?.message || 'No data found in Supabase');
  }

  const dates = data.map((d: any) => d.date);
  const threats_all = data.map((d: any) => d.total_threats);
  const threats_high_critical = data.map((d: any) => d.high_critical_threats);
  const traffic_tb = data.map((d: any) => Number(d.firewall_traffic_tb));

  const totalThreats = threats_all.reduce((a: number, b: number) => a + b, 0);
  const highCriticalThreats = threats_high_critical.reduce((a: number, b: number) => a + b, 0);
  const highCriticalPercentage = totalThreats > 0 
    ? Number(((highCriticalThreats / totalThreats) * 100).toFixed(2)) 
    : 0;
  
  const blockedThreatsCount = data.map((d: any) => d.blocked_threats).reduce((a: number, b: number) => a + b, 0);
  const blockedThreatsPercentage = totalThreats > 0 
    ? Number(((blockedThreatsCount / totalThreats) * 100).toFixed(2)) 
    : 0;

  const firewallTrafficTB = Number(traffic_tb.reduce((a: number, b: number) => a + b, 0).toFixed(1));
  const firewallSessions = data[data.length - 1]?.firewall_sessions || '1.4M';

  return {
    dates,
    threats_all,
    threats_high_critical,
    traffic_tb,
    kpi: {
      totalThreats,
      highCriticalThreats,
      highCriticalPercentage,
      blockedThreatsCount,
      blockedThreatsPercentage,
      firewallTrafficTB,
      firewallSessions
    },
    status: 'live'
  };
}

export interface NocTrendsResult {
  dates: string[];
  astinet: number[];
  jlm: number[];
  lintasarta: number[];
  traffic_mbps: number[];
  kpi: {
    ispAvailability: Array<{
      name: string;
      sla: number;
      actual: number;
      status: 'safe' | 'critical';
    }>;
  };
  devices: any[]; // Added for table data
  status: 'live' | 'mock';
}

function getIspFromSensor(name: string, device: string): string {
  const n = name.toLowerCase();
  if (n.includes('astinet')) return 'Astinet';
  if (n.includes('jlm')) return 'JLM';
  if (n.includes('lintasarta')) return 'Lintasarta';
  
  // Fallback map
  const deviceMap: Record<string, string> = {
    'Benoa': 'Astinet',
    // add more as needed
  };
  return deviceMap[device] || 'Unknown';
}

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

  if (error || !prtgData) {
    throw new Error(error?.message || 'No PRTG data found in Supabase');
  }

  const dates = Array.from(new Set(prtgData.map((d: any) => d.import_date))).sort();

  const astinet: number[] = [];
  const jlm: number[] = [];
  const lintasarta: number[] = [];
  const traffic_mbps: number[] = [];

  dates.forEach(date => {
    const dayData = prtgData.filter((d: any) => d.import_date === date);
    
    const ispStats: Record<string, { totalUp: number, totalDown: number, traffic: number, count: number }> = {
      'Astinet': { totalUp: 0, totalDown: 0, traffic: 0, count: 0 },
      'JLM': { totalUp: 0, totalDown: 0, traffic: 0, count: 0 },
      'Lintasarta': { totalUp: 0, totalDown: 0, traffic: 0, count: 0 }
    };

    dayData.forEach((d: any) => {
      const isp = getIspFromSensor(d.sensor_name, d.device);
      if (ispStats[isp]) {
        ispStats[isp].totalUp += Number(d.up_detik);
        ispStats[isp].totalDown += Number(d.down_detik);
        ispStats[isp].traffic += Number(d.avg_total_mbit);
        ispStats[isp].count += 1;
      }
    });

    const getAv = (i: string) => {
      const s = ispStats[i];
      const total = s.totalUp + s.totalDown;
      return total === 0 ? 0 : (s.totalUp / total) * 100;
    };

    astinet.push(Number(getAv('Astinet').toFixed(2)));
    jlm.push(Number(getAv('JLM').toFixed(2)));
    lintasarta.push(Number(getAv('Lintasarta').toFixed(2)));
    traffic_mbps.push(Number((ispStats['Astinet'].traffic + ispStats['JLM'].traffic + ispStats['Lintasarta'].traffic).toFixed(2)));
  });

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  return {
    dates,
    astinet,
    jlm,
    lintasarta,
    traffic_mbps,
    devices: prtgData.map(d => ({
      date: d.import_date,
      sensor: d.sensor_name,
      device: d.device,
      availability: ((Number(d.up_detik) / (Number(d.up_detik) + Number(d.down_detik))) * 100).toFixed(2),
      traffic: d.avg_total_mbit
    })),
    kpi: {
      ispAvailability: [
        { name: 'Astinet', sla: 99.5, actual: Number(avg(astinet).toFixed(2)), status: avg(astinet) >= 99.5 ? 'safe' : 'critical' },
        { name: 'JLM', sla: 99.0, actual: Number(avg(jlm).toFixed(2)), status: avg(jlm) >= 99.0 ? 'safe' : 'critical' },
        { name: 'Lintasarta', sla: 99.5, actual: Number(avg(lintasarta).toFixed(2)), status: avg(lintasarta) >= 99.5 ? 'safe' : 'critical' }
      ]
    },
    status: 'live'
  };
}

export async function getDashboardSummary(
  supabase: SupabaseClient,
  params: TrendsParams
): Promise<DashboardSummary> {
  try {
    const [socData, nocData] = await Promise.all([
      getSocTrends(supabase, params),
      getNocTrends(supabase, params)
    ]);

    return {
      soc: socData.kpi,
      noc: nocData.kpi,
      lastUpdated: new Date().toISOString(),
      status: 'live'
    };
  } catch (error) {
    throw error;
  }
}
