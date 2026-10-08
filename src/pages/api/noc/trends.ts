import type { APIRoute } from 'astro';
import { getNocTrends } from '../../../lib/services/analytics';
import { getCached, setCached } from '../../../lib/cache';

/**
 * GET /api/noc/trends?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns daily ISP availability trends and aggregated KPI summary.
 * Uses service layer for database queries.
 */
export const GET: APIRoute = async ({ request, cookies }) => {
  const url = new URL(request.url);
  const from = url.searchParams.get('from') || '2026-10-01';
  const to = url.searchParams.get('to') || '2026-10-08';
  const cacheKey = `noc-trends:${from}:${to}`;

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
    const result = await getNocTrends(supabase, { from, to });
    
    setCached(cacheKey, result, 300);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('[API] NOC trends fetch failed:', err.message);
    
    // Fallback to mock data
    const { nocSummary } = await import('../../../data/noc');
    const fallbackResult = {
      dates: nocSummary.trendDaily.map(d => d.date),
      astinet: nocSummary.trendDaily.map(d => d.astinet),
      jlm: nocSummary.trendDaily.map(d => d.jlm),
      lintasarta: nocSummary.trendDaily.map(d => d.lintasarta),
      traffic_mbps: nocSummary.trafficDaily.map(d => d.mbps),
      kpi: {
        ispAvailability: nocSummary.ispAvailability
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
