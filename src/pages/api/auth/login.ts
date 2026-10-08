import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const formData = await request.formData();
  const email = formData.get('email')?.toString();
  const password = formData.get('password')?.toString();

  console.log('[AUTH] Login attempt for:', email);

  if (!email || !password) {
    console.log('[AUTH] Missing credentials');
    return new Response('Email and password required', { status: 400 });
  }

  const supabase = createSupabaseServerClient(cookies);
  
  console.log('[AUTH] Supabase URL:', import.meta.env.PUBLIC_SUPABASE_URL);
  console.log('[AUTH] Anon key exists:', !!import.meta.env.PUBLIC_SUPABASE_ANON_KEY);

  console.log('[AUTH] Calling signInWithPassword...');
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('[AUTH] Login error:', {
      message: error.message,
      status: error.status,
      code: (error as any).code
    });
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  console.log('[AUTH] Login success:', {
    userId: data.user?.id,
    email: data.user?.email,
    sessionExists: !!data.session,
    accessToken: data.session?.access_token ? data.session.access_token.substring(0, 20) + '...' : null
  });

  console.log('[AUTH] Redirecting to /');
  return redirect('/', 303);
};

