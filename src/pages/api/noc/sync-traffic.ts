import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { syncPrtgTraffic } from '../../../lib/services/prtg-traffic-sync';
import { PrtgError } from '../../../lib/prtg';
import { createSupabaseServerClient } from '../../../lib/supabase';
import { jsonResponse, serverError } from '../../../lib/http';
import { clearCache } from '../../../lib/cache';

const DEFAULT_HOURS = 3;
const MAX_HOURS = 168;

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
 * POST /api/noc/sync-traffic   body (optional JSON): { "hours": 3 }
 * Reloads hourly Traffic In/Out for all traffic sensors. Default: the last 3 hours. Use 168 for the first backfill.
 * Callers: a logged-in dashboard user, or the office cron with the x-sync-secret header.
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

  const body = (await request.json().catch(() => ({}))) as { hours?: unknown };
  const requested = Number(body.hours ?? DEFAULT_HOURS);
  const hours = Number.isFinite(requested) ? Math.min(Math.max(Math.round(requested), 1), MAX_HOURS) : DEFAULT_HOURS;

  const url = env('PUBLIC_SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    return jsonResponse({ error: 'Supabase service role belum dikonfigurasi' }, 500);
  }
  // The service role bypasses RLS, which the sync needs for writes. It never leaves the server.
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  try {
    const result = await syncPrtgTraffic(admin, hours);
    // The NOC page caches its trends; drop them so the next load shows the new hours
    clearCache();
    return jsonResponse(result, result.status === 'failed' ? 502 : 200);
  } catch (err) {
    if (err instanceof PrtgError) {
      // PRTG messages carry no credentials or URLs, so they are safe to show
      return jsonResponse({ error: err.message }, 502);
    }
    return serverError('NOC TRAFFIC SYNC', err);
  }
};
