import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { syncPrtgAvailability } from '../../../lib/services/prtg-availability-sync';
import { createSupabaseServerClient } from '../../../lib/supabase';
import { jsonResponse, serverError } from '../../../lib/http';
import { clearCache } from '../../../lib/cache';
import { addDays, jakartaDate } from '../../../lib/dates';

const DEFAULT_DAYS = 2;
const MAX_DAYS = 31;

function env(name: string): string | undefined {
  // process.env first, same as the other server routes
  return process.env[name] || import.meta.env[name];
}

function secretMatches(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * POST /api/noc/sync-availability   body (optional JSON): { "days": 2 }
 * Writes daily PRTG downtime for all traffic sensors into prtg_sensor_reports, for the last `days`
 * WIB days ending today. The default covers yesterday and today, so today's row is corrected by
 * the next run. Callers: a logged-in dashboard user, or the office cron with the x-sync-secret header.
 * PRTG is only reachable from the office network, so this must run on the office machine's app server.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  const syncSecret = env('SYNC_SECRET');
  const givenSecret = request.headers.get('x-sync-secret');
  const hasSecret = Boolean(syncSecret) && secretMatches(givenSecret, syncSecret!);

  if (!hasSecret) {
    const supabase = createSupabaseServerClient(cookies);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const body = (await request.json().catch(() => ({}))) as { days?: unknown };
  const requested = Number(body.days ?? DEFAULT_DAYS);
  const days = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), MAX_DAYS) : DEFAULT_DAYS;

  const url = env('PUBLIC_SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    return jsonResponse({ error: 'Supabase service role belum dikonfigurasi' }, 500);
  }
  // The service role bypasses RLS, which the sync needs for writes. It never leaves the server.
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const to = jakartaDate();
  const from = addDays(to, -(days - 1));
  try {
    const result = await syncPrtgAvailability(admin, from, to);
    clearCache();
    return jsonResponse(result, result.status === 'failed' ? 502 : 200);
  } catch (err) {
    return serverError('NOC AVAILABILITY SYNC', err);
  }
};
