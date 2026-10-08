import type { APIRoute } from 'astro';
import { getSocTrends } from '../../../lib/services/analytics';
import { getCached, setCached } from '../../../lib/cache';

/**
 * GET /api/soc/trends?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns daily threat trends and aggregated KPI summary.
 * Uses service layer for database queries.
 */
export const GET: APIRoute = async ({ request, cookies }) => {
  const url = new URL(request.url);
  const from = url.searchParams.get('from') || '2026-10-01';
  const to = url.searchParams.get('to') || '2026-10-08';
  const cacheKey = `soc-trends:${from}:${to}`;

  // Return cached result if available
  const cached = getCached(cacheKey);
  if (cached) {
    return new Response(JSON.stringify(cached), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { createSupabaseServerClient } = await import('../../../lib/supabase');
    const supabase = createSupabaseServerClient(cookies);
    
    // Verify authenticated user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Use service layer for data fetching
    const result = await getSocTrends(supabase, { from, to });
    
    setCached(cacheKey, result, 300);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('[API] SOC trends fetch failed:', err.message);
    
    // Fallback to mock data
    const { socSummary } = await import('../../../data/soc');
    const fallbackResult = {
      dates: socSummary.trendDaily.map(d => d.date),
      threats_all: socSummary.trendDaily.map(d => d.all),
      threats_high_critical: socSummary.trendDaily.map(d => d.high),
      traffic_tb: socSummary.trafficDaily.map(d => d.tb),
      kpi: {
        totalThreats: socSummary.totalThreats,
        highCriticalThreats: socSummary.highCriticalThreats,
        highCriticalPercentage: socSummary.highCriticalPercentage,
        blockedThreatsCount: socSummary.blockedThreatsCount,
        blockedThreatsPercentage: socSummary.blockedThreatsPercentage,
        firewallTrafficTB: socSummary.firewallTrafficTB,
        firewallSessions: socSummary.firewallSessions
      },
      status: 'mock'
    };

    setCached(cacheKey, fallbackResult, 300);
    return new Response(JSON.stringify(fallbackResult), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
