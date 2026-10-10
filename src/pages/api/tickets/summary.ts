import type { APIRoute } from 'astro';
import { getCached, setCached } from '../../../lib/cache';
import { createSupabaseServerClient } from '../../../lib/supabase';
import { jsonResponse, serverError } from '../../../lib/http';

/**
 * GET /api/tickets/summary
 * Returns open/resolved ticket counts and SLA percentage from ManageEngine.
 * Requires an authenticated session.
 */
export const GET: APIRoute = async ({ cookies }) => {
  // Session check first: this route calls an upstream API with a server-side key
  const supabase = createSupabaseServerClient(cookies);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const cacheKey = 'tickets-summary';
  const cached = getCached(cacheKey);
  if (cached) {
    return jsonResponse(cached);
  }

  const baseUrl = import.meta.env.MANAGEENGINE_BASE_URL;
  const apiKey = import.meta.env.MANAGEENGINE_API_KEY;

  if (!baseUrl || !apiKey) {
    return serverError('TICKETS', new Error('MANAGEENGINE_BASE_URL or MANAGEENGINE_API_KEY is not set'));
  }

  // ManageEngine REST API v3: /api/v3/requests
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/requests`;
  const inputData = {
    list_info: {
      row_count: 100,
      start_index: 1,
      sort_field: 'created_time',
      sort_order: 'desc',
      fields_required: ['id', 'subject', 'status', 'created_time', 'is_overdue']
    }
  };

  const params = new URLSearchParams();
  params.append('input_data', JSON.stringify(inputData));

  try {
    const res = await fetch(`${endpoint}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/v3+json',
        'authtoken': apiKey // ManageEngine v3 uses the 'authtoken' header
      }
    });

    if (!res.ok) {
      throw new Error(`ManageEngine responded HTTP ${res.status}`);
    }

    const data = await res.json();
    const requests: any[] = data.requests || [];
    const totalIncoming = requests.length;

    const resolvedCount = requests.filter((r: any) =>
      r.status?.name?.toLowerCase().includes('resolved') ||
      r.status?.name?.toLowerCase().includes('closed')
    ).length;

    // Share of tickets that are not overdue
    const slaMetCount = requests.filter((r: any) => !r.is_overdue).length;
    const slaMetPercentage = totalIncoming > 0
      ? Number(((slaMetCount / totalIncoming) * 100).toFixed(1))
      : 100;

    const summary = {
      incoming: totalIncoming,
      resolved: resolvedCount,
      slaMetPercentage,
      status: 'live'
    };

    setCached(cacheKey, summary, 300);
    return jsonResponse(summary);
  } catch (err) {
    return serverError('TICKETS', err);
  }
};
