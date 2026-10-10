import type { APIRoute } from 'astro';
import { clearCache } from '../../../lib/cache';
import { createSupabaseServerClient } from '../../../lib/supabase';

export const POST: APIRoute = async ({ cookies }) => {
  // Middleware already gates /api/cache; re-check here so the route is safe on its own
  const supabase = createSupabaseServerClient(cookies);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  clearCache();
  console.log('[CACHE] All cache cleared by user', user.id);
  return new Response(JSON.stringify({ success: true, message: 'Cache cleared' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
