import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase';
import { jsonResponse, serverError } from '../../../lib/http';

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
    return serverError('HANDOVERS LIST', error);
  }

  return jsonResponse(data ?? []);
};
