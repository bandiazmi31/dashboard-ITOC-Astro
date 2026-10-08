import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../lib/supabase';

export const GET: APIRoute = async ({ cookies, redirect }) => {
  const supabase = createSupabaseServerClient(cookies);
  await supabase.auth.signOut();
  return redirect('/login');
};
