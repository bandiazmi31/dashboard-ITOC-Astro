import { defineMiddleware } from "astro:middleware";
import { createSupabaseServerClient } from "./lib/supabase";

export const onRequest = defineMiddleware(async (context, next) => {
  console.log('[MIDDLEWARE] Path:', context.url.pathname);

  const supabase = createSupabaseServerClient(context.cookies);
  const { data: { user } } = await supabase.auth.getUser();

  console.log('[MIDDLEWARE] Session exists:', !!user);
  console.log('[MIDDLEWARE] User:', user?.email);

  const isPublic =
    context.url.pathname === "/login" ||
    context.url.pathname.startsWith("/api/auth") ||
    context.url.pathname.startsWith("/api/soc") ||
    context.url.pathname.startsWith("/api/noc") ||
    context.url.pathname.startsWith("/api/tickets") ||
    context.url.pathname.startsWith("/api/cache");

  if (!isPublic && !user) {
    console.log('[MIDDLEWARE] Redirecting to /login (no session)');
    return context.redirect("/login");
  }

  console.log('[MIDDLEWARE] Allowing request');
  return next();
});
