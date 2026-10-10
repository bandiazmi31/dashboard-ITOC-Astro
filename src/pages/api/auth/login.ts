import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const formData = await request.formData();
  const email = formData.get('email')?.toString();
  const password = formData.get('password')?.toString();

  // Never log credentials, the email address, or any part of the session token
  if (!email || !password) {
    return new Response('Email and password required', { status: 400 });
  }

  const supabase = createSupabaseServerClient(cookies);

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('[AUTH] Login failed:', { status: error.status, code: (error as any).code });
    return new Response(JSON.stringify({ error: error.message }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return redirect('/', 303);
};
