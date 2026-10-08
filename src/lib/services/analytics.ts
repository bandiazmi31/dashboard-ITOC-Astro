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

export async function getNocTrends(
  supabase: SupabaseClient,
  params: TrendsParams
): Promise<NocTrendsResult> {
  const { from, to } = params;

  const { data, error } = await supabase
    .from('noc_availability_daily')
    .select('*')
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true });

  if (error || !data || data.length === 0) {
    throw new Error(error?.message || 'No data found in Supabase');
  }

  const dateSet = new Set<string>();
  data.forEach((d: any) => dateSet.add(d.date));
  const dates = Array.from(dateSet).sort();

  const astinet: number[] = [];
  const jlm: number[] = [];
  const lintasarta: number[] = [];
  const traffic_mbps: number[] = [];

  dates.forEach(date => {
    const dayData = data.filter((d: any) => d.date === date);
    
    const astinetRecord = dayData.find((d: any) => d.isp_name === 'Astinet');
    const jlmRecord = dayData.find((d: any) => d.isp_name === 'JLM');
    const lintasartaRecord = dayData.find((d: any) => d.isp_name === 'Lintasarta');

    astinet.push(astinetRecord ? Number(astinetRecord.availability_percent) : 0);
    jlm.push(jlmRecord ? Number(jlmRecord.availability_percent) : 0);
    lintasarta.push(lintasartaRecord ? Number(lintasartaRecord.availability_percent) : 0);
    
    const dayTraffic = dayData.reduce((sum: number, d: any) => sum + Number(d.traffic_mbps), 0);
    traffic_mbps.push(dayTraffic);
  });

  const astinetAvg = astinet.length > 0 ? astinet.reduce((a, b) => a + b, 0) / astinet.length : 0;
  const jlmAvg = jlm.length > 0 ? jlm.reduce((a, b) => a + b, 0) / jlm.length : 0;
  const lintasartaAvg = lintasarta.length > 0 ? lintasarta.reduce((a, b) => a + b, 0) / lintasarta.length : 0;

  const SLA_CONFIG = {
    'Astinet': 99.5,
    'JLM': 99.0,
    'Lintasarta': 99.5
  };

  return {
    dates,
    astinet,
    jlm,
    lintasarta,
    traffic_mbps,
    kpi: {
      ispAvailability: [
        {
          name: 'Astinet',
          sla: SLA_CONFIG['Astinet'],
          actual: Number(astinetAvg.toFixed(2)),
          status: astinetAvg >= SLA_CONFIG['Astinet'] ? 'safe' : 'critical'
        },
        {
          name: 'JLM',
          sla: SLA_CONFIG['JLM'],
          actual: Number(jlmAvg.toFixed(2)),
          status: jlmAvg >= SLA_CONFIG['JLM'] ? 'safe' : 'critical'
        },
        {
          name: 'Lintasarta',
          sla: SLA_CONFIG['Lintasarta'],
          actual: Number(lintasartaAvg.toFixed(2)),
          status: lintasartaAvg >= SLA_CONFIG['Lintasarta'] ? 'safe' : 'critical'
        }
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
