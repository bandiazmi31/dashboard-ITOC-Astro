import type { APIRoute } from 'astro';
import { getCached, setCached } from '../../../lib/cache';
import { createSupabaseServerClient } from '../../../lib/supabase';
import { jsonResponse, serverError } from '../../../lib/http';

/** ManageEngine v3 list calls return at most this many rows per request */
const PAGE_SIZE = 100;
/** Safety stop so a bad response cannot loop forever: 10 pages = 1000 tickets */
const MAX_PAGES = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Operations team works on WIB (UTC+7), so day boundaries are WIB midnights */
const WIB_OFFSET = '+07:00';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface ManageEngineRequest {
  id?: string;
  subject?: string;
  status?: { name?: string };
  created_time?: unknown;
  is_overdue?: boolean;
}

/**
 * GET /api/tickets/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Fetches every ticket page from ManageEngine (up to MAX_PAGES), filters by created date in WIB
 * when from/to are given, and returns counts and SLA percentage computed from the filtered set.
 * Requires an authenticated session.
 */
export const GET: APIRoute = async ({ cookies, url }) => {
  // Session check first: this route calls an upstream API with a server-side key
  const supabase = createSupabaseServerClient(cookies);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  if ((from && !isValidIsoDate(from)) || (to && !isValidIsoDate(to))) {
    return jsonResponse({ error: 'Format tanggal harus YYYY-MM-DD' }, 400);
  }
  if (from && to && from > to) {
    return jsonResponse({ error: 'Tanggal awal tidak boleh setelah tanggal akhir' }, 400);
  }

  const cacheKey = `tickets-summary:${from}:${to}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return jsonResponse(cached);
  }

  // process.env first, same as the other server routes: a literal value inlined from import.meta.env confuses the Vercel file tracer
  const baseUrl = process.env.MANAGEENGINE_BASE_URL || import.meta.env.MANAGEENGINE_BASE_URL;
  const apiKey = process.env.MANAGEENGINE_API_KEY || import.meta.env.MANAGEENGINE_API_KEY;

  if (!baseUrl || !apiKey) {
    return serverError('TICKETS', new Error('MANAGEENGINE_BASE_URL or MANAGEENGINE_API_KEY is not set'));
  }

  try {
    const { tickets: allTickets, truncated } = await fetchAllTickets(baseUrl, apiKey);

    const range = from || to ? dateRangeMs(from, to) : null;
    const tickets = range
      ? allTickets.filter(t => {
          const created = parseCreatedTime(t.created_time);
          return created !== null && created >= range.start && created < range.end;
        })
      : allTickets;

    const incoming = tickets.length;
    const resolved = tickets.filter(t => {
      const name = t.status?.name?.toLowerCase() ?? '';
      return name.includes('resolved') || name.includes('closed');
    }).length;
    // Share of tickets that are not overdue
    const slaMet = tickets.filter(t => !t.is_overdue).length;
    const slaMetPercentage = incoming > 0 ? Number(((slaMet / incoming) * 100).toFixed(1)) : 100;

    const summary = {
      incoming,
      resolved,
      slaMetPercentage,
      status: 'live',
      // True when MAX_PAGES was reached, so older tickets may not be included
      truncated,
    };

    setCached(cacheKey, summary, 300);
    return jsonResponse(summary);
  } catch (err) {
    return serverError('TICKETS', err);
  }
};

function isValidIsoDate(value: string): boolean {
  return ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/**
 * Pages through the request list with start_index 1, 101, 201, ... Stops on a short page,
 * or after MAX_PAGES full pages (then `truncated` is true).
 */
async function fetchAllTickets(baseUrl: string, apiKey: string): Promise<{ tickets: ManageEngineRequest[]; truncated: boolean }> {
  const tickets: ManageEngineRequest[] = [];
  let startIndex = 1;
  let truncated = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await fetchRequestsPage(baseUrl, apiKey, startIndex);
    tickets.push(...batch);

    if (batch.length < PAGE_SIZE) break;
    if (page === MAX_PAGES - 1) truncated = true;
    startIndex += PAGE_SIZE;
  }

  return { tickets, truncated };
}

async function fetchRequestsPage(baseUrl: string, apiKey: string, startIndex: number): Promise<ManageEngineRequest[]> {
  // ManageEngine REST API v3: /api/v3/requests
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/requests`;
  const inputData = {
    list_info: {
      row_count: PAGE_SIZE,
      start_index: startIndex,
      sort_field: 'created_time',
      sort_order: 'desc',
      fields_required: ['id', 'subject', 'status', 'created_time', 'is_overdue']
    }
  };

  const params = new URLSearchParams();
  params.append('input_data', JSON.stringify(inputData));

  const res = await fetch(`${endpoint}?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/v3+json',
      'authtoken': apiKey // ManageEngine v3 uses the 'authtoken' header
    }
  });

  if (!res.ok) {
    throw new Error(`ManageEngine responded HTTP ${res.status} at start_index ${startIndex}`);
  }

  const data = await res.json();
  return Array.isArray(data.requests) ? data.requests : [];
}

/**
 * ManageEngine v3 timestamps arrive as { value: "<epoch ms>", display_value: "..." }.
 * Also accepts a bare epoch number or string. Returns epoch ms, or null when unreadable.
 */
function parseCreatedTime(raw: unknown): number | null {
  const value = typeof raw === 'object' && raw !== null ? (raw as { value?: unknown }).value : raw;

  let ms: number;
  if (typeof value === 'number') {
    ms = value;
  } else if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    ms = Number(value.trim());
  } else {
    return null;
  }

  // Epoch seconds are 10 digits; epoch milliseconds are 13
  if (ms < 1e12) ms *= 1000;
  return Number.isFinite(ms) ? ms : null;
}

/** [start, end) in epoch ms for the WIB calendar days from..to, both inclusive. Missing bounds are open. */
function dateRangeMs(from: string, to: string): { start: number; end: number } {
  const start = from ? Date.parse(`${from}T00:00:00${WIB_OFFSET}`) : -Infinity;
  const end = to ? Date.parse(`${to}T00:00:00${WIB_OFFSET}`) + DAY_MS : Infinity;
  return { start, end };
}
