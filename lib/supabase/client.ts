import { createBrowserClient } from "@supabase/ssr";

/**
 * Client-side Supabase instance. Only ever holds the anon key — RLS is what
 * actually protects the data, not this file.
 *
 * Not parameterized with a generated `Database` type: types/database.ts
 * ships hand-written interfaces for app code to import directly, rather
 * than a full Postgrest schema type. Once this project is linked to a real
 * Supabase project, run `supabase gen types typescript --linked` and pass
 * the result here as the generic for full query-builder type safety.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
