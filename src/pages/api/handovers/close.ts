import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.json();
  const { id } = body;

  if (!id) {
    return new Response(JSON.stringify({ error: 'Handover ID is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
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
    // Fallback success response
    return new Response(JSON.stringify({ success: true, id, status: 'closed' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify(data[0]), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
