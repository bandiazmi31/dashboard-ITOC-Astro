import type { APIRoute } from 'astro';
import { getIspAvailability } from '../../../lib/services/prtg-availability';
import { getCached, setCached } from '../../../lib/cache';
import { createSupabaseServerClient } from '../../../lib/supabase';
import { jsonResponse, serverError } from '../../../lib/http';
import { jakartaDate, jakartaDaysAgo } from '../../../lib/dates';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/noc/trends?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns daily ISP availability from PRTG and the KPI summary.
 */
export const GET: APIRoute = async ({ request, cookies }) => {
  const url = new URL(request.url);
  // Default: last 7 days in WIB, computed per request (no fixed dates)
  const from = url.searchParams.get('from') || jakartaDaysAgo(7);
  const to = url.searchParams.get('to') || jakartaDate();
  // The dates go into the PRTG request, so only plain YYYY-MM-DD values are accepted
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to) || from > to) {
    return jsonResponse({ error: 'Rentang tanggal tidak valid' }, 400);
  }
  const cacheKey = `noc-trends:${from}:${to}`;

  // Authenticate BEFORE touching the cache: the cache is shared by all callers,
  // so serving a cached hit first would expose data to anonymous requests.
  const supabase = createSupabaseServerClient(cookies);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const cached = getCached(cacheKey);
  if (cached) {
    return jsonResponse(cached);
  }

  try {
    const result = await getIspAvailability(from, to);

    // Only successful results are cached; errors are never stored
    setCached(cacheKey, result, 300);
    return jsonResponse(result);
  } catch (err) {
    return serverError('NOC TRENDS', err);
  }
};
