import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs before every matched request. Two jobs:
 *  1. Refresh the Supabase auth session so server components always see a
 *     valid (non-expired) cookie.
 *  2. Gate /admin and /faculty at the edge, before any page code runs, so an
 *     unauthenticated request never even reaches a protected layout.
 *
 * This is a coarse check (signed in vs not). The real role check — whether
 * this specific user is actually an admin/faculty member — happens again in
 * the route's layout via lib/permissions, and is enforced a third time by
 * RLS at the database. Defense in depth: never rely on this file alone.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const protectedPrefixes = ["/admin", "/faculty", "/member"];
  const isProtected = protectedPrefixes.some((p) => request.nextUrl.pathname.startsWith(p));

  // Not signed in (no Supabase session cookie): nothing to refresh. Most visitors; no call to Supabase at all.
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
  if (!hasSession) {
    if (!isProtected) return response;
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refreshes the session cookie when it has expired (a network call only then). This is only the coarse
  // gate: every protected page checks the user with Supabase Auth itself (getUser), and RLS checks every query,
  // so the per-request round trip that getUser cost here (on every page, click and action) is not needed.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (isProtected && !session) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
