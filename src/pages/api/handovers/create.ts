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

  const { title, description, shift_info } = body;

  if (!title) {
    return jsonResponse({ error: 'Title is required' }, 400);
  }

  const supabase = createSupabaseServerClient(cookies);

  const { data, error } = await supabase
    .from('handovers')
    .insert([
      {
        title,
        description,
        shift_info: shift_info || 'Shift Aktif',
        status: 'open'
      }
    ])
    .select();

  if (error || !data || data.length === 0) {
    return serverError('HANDOVERS CREATE', error ?? new Error('Insert returned no row'));
  }

  return jsonResponse(data[0], 201);
};
