import type { APIRoute } from 'astro';
import { clearCache } from '../../../lib/cache';

export const POST: APIRoute = async () => {
  clearCache();
  console.log('[CACHE] All cache cleared');
  return new Response(JSON.stringify({ success: true, message: 'Cache cleared' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
