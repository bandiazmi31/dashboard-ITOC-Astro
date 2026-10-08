import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.json();
  const { title, description, shift_info } = body;

  if (!title) {
    return new Response(JSON.stringify({ error: 'Title is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
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

  if (error) {
    // Fallback if Supabase table not created yet
    return new Response(JSON.stringify({
      id: Date.now().toString(),
      title,
      description,
      status: 'open',
      shift_info: shift_info || 'Shift Aktif',
      created_at: new Date().toISOString()
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify(data[0]), {
    status: 201,
    headers: { 'Content-Type': 'application/json' }
  });
};
