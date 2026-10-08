import type { APIRoute } from 'astro';
import { getCached, setCached } from '../../../lib/cache';

// Default mock data (fallback when API unavailable)
const mockTicketSummary = {
  incoming: 42,
  resolved: 38,
  slaMetPercentage: 92.5,
  status: 'mock'
};

/**
 * GET /api/tickets/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns ticket counts and SLA percentage.
 */
export const GET: APIRoute = async ({ cookies, request }) => {
  console.log('[API] Fetching ticket summary...');
  
  const url = new URL(request.url);
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  const cacheKey = `tickets-summary:${from}:${to}`;

  // Return cached result if available
  const cached = getCached(cacheKey);
  if (cached) {
    console.log('[API] Returning cached ticket summary');
    return new Response(JSON.stringify(cached), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Load env vars
  const baseUrl = import.meta.env.MANAGEENGINE_BASE_URL;
  const apiKey = import.meta.env.MANAGEENGINE_API_KEY;

  console.log('[API] ManageEngine Base URL:', baseUrl);
  console.log('[API] ManageEngine API Key present:', !!apiKey);

  // If env not set, fallback to mock
  if (!baseUrl || !apiKey) {
    console.log('[API] Missing env vars, falling back to mock');
    setCached(cacheKey, mockTicketSummary, 300);
    return new Response(JSON.stringify(mockTicketSummary), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // ManageEngine REST API v3 endpoint untuk mengambil requests/tickets
  // Format standar v3 SDPS: /api/v3/requests
  const endpoint = `${baseUrl.replace(/\/+$/,'')}/requests`;
  
  // Format input_data JSON untuk API v3 ManageEngine
  const inputData = {
    list_info: {
      row_count: 100,
      start_index: 1,
      sort_field: "created_time",
      sort_order: "desc",
      fields_required: ["id", "subject", "status", "created_time", "is_overdue"]
    }
  };

  const params = new URLSearchParams();
  params.append('input_data', JSON.stringify(inputData));

  try {
    const fullUrl = `${endpoint}?${params.toString()}`;
    console.log(`[API] Calling ManageEngine URL: ${fullUrl}`);

    const res = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/v3+json',
        'authtoken': apiKey // ManageEngine v3 menggunakan header 'authtoken'
      }
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[API] ManageEngine error HTTP ${res.status}:`, errorText);
      throw new Error(`ManageEngine responded HTTP ${res.status}`);
    }

    const data = await res.json();
    console.log('[API] ManageEngine raw response count:', data.requests?.length || 0);

    const requests = data.requests || [];
    const totalIncoming = requests.length;
    
    // Hitung tiket selesai (Resolved/Closed)
    const resolvedCount = requests.filter((r: any) => 
      r.status?.name?.toLowerCase().includes('resolved') || 
      r.status?.name?.toLowerCase().includes('closed')
    ).length;

    // Hitung persentase SLA yang terpenuhi (tidak overdue)
    const slaMetCount = requests.filter((r: any) => !r.is_overdue).length;
    const slaMetPercentage = totalIncoming > 0 
      ? Number(((slaMetCount / totalIncoming) * 100).toFixed(1)) 
      : 100;

    const summary = {
      incoming: totalIncoming,
      resolved: resolvedCount,
      slaMetPercentage: slaMetPercentage,
      status: 'live'
    };

    console.log('[API] Processed Ticket Summary:', summary);

    // Cache selama 5 menit
    setCached(cacheKey, summary, 300);
    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('[API] ManageEngine tickets fetch failed:', err.message || err);
    // Fallback ke mock jika gagal
    setCached(cacheKey, mockTicketSummary, 300);
    return new Response(JSON.stringify(mockTicketSummary), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
