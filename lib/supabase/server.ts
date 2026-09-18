import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase instance for use in Server Components, Server Actions,
 * and Route Handlers. Reads/writes the auth session via cookies so RLS sees
 * the real signed-in user, never a service-role bypass.
 *
 * See the note in lib/supabase/client.ts about generating a `Database` type
 * once this project is linked to a real Supabase project.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component without a mutable response —
            // safe to ignore as long as proxy.ts refreshes the session.
          }
        },
      },
    }
  );
}

/**
 * Admin client using the service-role key. NEVER import this from client
 * code or expose it to a route that doesn't itself enforce authorization —
 * it bypasses RLS entirely. Reserved for trusted server-only operations
 * (e.g. audit log writes that must succeed regardless of the caller's role).
 */
export function createAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}
