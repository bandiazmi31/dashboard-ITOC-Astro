import { defineMiddleware } from "astro:middleware";
import { createSupabaseServerClient } from "./lib/supabase";
import { jsonResponse } from "./lib/http";

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createSupabaseServerClient(context.cookies);
  const { data: { user } } = await supabase.auth.getUser();

  // Only the login flow is open at the gate. The /api/soc, /api/noc and /api/tickets
  // routes are listed here so the gate skips them, but each route checks the session itself.
  const { pathname } = context.url;
  const isPublic =
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/soc") ||
    pathname.startsWith("/api/noc") ||
    pathname.startsWith("/api/tickets");

  if (!isPublic && !user) {
    console.log(`[MIDDLEWARE] Denied ${context.request.method} ${pathname} (no session)`);

    // API callers get a JSON 401 instead of an HTML redirect they cannot follow
    if (pathname.startsWith("/api/")) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    return context.redirect("/login");
  }

  return next();
});
