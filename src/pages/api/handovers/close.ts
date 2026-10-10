import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase';
import { jsonResponse, serverError } from '../../../lib/http';

export const POST: APIRoute = async ({ request, cookies }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { id } = body;

  if (!id) {
    return jsonResponse({ error: 'Handover ID is required' }, 400);
  }

  const supabase = createSupabaseServerClient(cookies);

  const { data, error } = await supabase
    .from('handovers')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString()
    })
    .eq('id', id)
    .select();

  if (error) {
    return serverError('HANDOVERS CLOSE', error);
  }

  // No row updated: the id does not exist, or RLS hid the row from this user
  if (!data || data.length === 0) {
    return jsonResponse({ error: 'Handover not found' }, 404);
  }

  return jsonResponse(data[0]);
};
