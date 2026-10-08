import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase';

export const GET: APIRoute = async ({ cookies, request }) => {
  const supabase = createSupabaseServerClient(cookies);
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'open';

  const { data, error } = await supabase
    .from('handovers')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: false });

  if (error) {
    // Fallback mock handovers if table doesn't exist yet
    return new Response(JSON.stringify([
      {
        id: '1',
        title: 'Update signature Palo Alto dijadwalkan malam ini',
        description: 'Pastikan koordinasi dengan tim network.',
        status: 'open',
        shift_info: 'Sel, 6 Okt, shift Sore - Head Office',
        created_at: new Date().toISOString()
      },
      {
        id: '2',
        title: 'Review alert Zabbix link Lintasarta',
        description: 'Fluktuasi trafik terdeteksi pada pukul 14:00.',
        status: 'open',
        shift_info: 'Sel, 6 Okt, shift Pagi - Head Office',
        created_at: new Date().toISOString()
      }
    ]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
