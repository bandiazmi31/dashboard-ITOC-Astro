import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase';
import { jsonResponse, serverError } from '../../../lib/http';
import { getSensorSeries, parseRange } from '../../../lib/services/traffic';

/**
 * GET /api/noc/traffic-series?sensor=2138&range=7d
 * Hourly In/Out for one sensor, for the sensor detail chart. Requires a logged-in user.
 */
export const GET: APIRoute = async ({ request, cookies }) => {
  const supabase = createSupabaseServerClient(cookies);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

  const params = new URL(request.url).searchParams;
  const sensorId = Number(params.get('sensor'));
  if (!Number.isInteger(sensorId) || sensorId <= 0) {
    return jsonResponse({ error: 'Sensor tidak valid' }, 400);
  }

  try {
    const series = await getSensorSeries(supabase, sensorId, parseRange(params.get('range')));
    return jsonResponse(series);
  } catch (err) {
    return serverError('NOC TRAFFIC SERIES', err);
  }
};
