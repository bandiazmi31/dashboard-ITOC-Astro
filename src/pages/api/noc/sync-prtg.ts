import type { APIRoute } from 'astro';
import { syncPrtgDay } from '../../../lib/services/prtg-sync';
import { PrtgError } from '../../../lib/prtg';
import { clearCache } from '../../../lib/cache';
import { createSupabaseServerClient } from '../../../lib/supabase';
import { jsonResponse, serverError } from '../../../lib/http';
import { isValidDate, jakartaDate } from '../../../lib/dates';

/**
 * POST /api/noc/sync-prtg?date=YYYY-MM-DD
 * Snapshots the traffic sensors from PRTG and stores the day's up/down time as the difference
 * from the previous snapshot (delta method). Default date: today (WIB).
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  const supabase = createSupabaseServerClient(cookies);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const date = new URL(request.url).searchParams.get('date') || jakartaDate();
  if (!isValidDate(date)) {
    return jsonResponse({ error: 'Tanggal tidak valid (format YYYY-MM-DD).' }, 400);
  }

  try {
    const result = await syncPrtgDay(supabase, date);

    // The NOC trends are cached for 5 minutes; drop them so the page shows the new data
    clearCache();
    return jsonResponse(result);
  } catch (err) {
    if (err instanceof PrtgError) {
      // PRTG messages carry no credentials or URLs, so they are safe to show
      return jsonResponse({ error: err.message }, 502);
    }
    return serverError('NOC PRTG SYNC', err);
  }
};
