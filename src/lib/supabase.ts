import { createServerClient } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

export function createSupabaseServerClient(cookies?: AstroCookies) {
  const cookieAdapter = {
    get(key: string) {
      return cookies?.get(key)?.value;
    },
    set(key: string, value: string, options: any) {
      if (cookies) {
        cookies.set(key, value, {
          ...options,
          path: '/',
          sameSite: 'lax',
          // Secure in production (HTTPS); plain HTTP still works in local dev
          secure: import.meta.env.PROD,
        });
      }
    },
    remove(key: string, options: any) {
      if (cookies) {
        cookies.delete(key, {
          ...options,
          path: '/',
        });
      }
    },
  };

  return createServerClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
    { cookies: cookieAdapter }
  );
}
