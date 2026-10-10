import { NextResponse } from "next/server";
import { safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";

/**
 * Where Google and GitHub send people back to (through Supabase). Swaps the
 * one-time `code` for a session cookie, then goes on to `next`.
 *
 * `next` is only ever a path on this site (see safeNext). Anything that goes
 * wrong, including the user pressing Cancel at the provider, lands on the
 * login page with a friendly message instead of an error screen.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  // Behind a proxy (Vercel) the public address is in the forwarded headers,
  // not in the URL the server itself sees.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const origin = forwardedHost ? `${forwardedProto || "https"}://${forwardedHost}` : url.origin;

  const next = safeNext(url.searchParams.get("next"));
  const backToLogin = (reason: "oauth" | "oauth_signup") => {
    const login = new URL("/login", origin);
    login.searchParams.set("error", reason);
    if (next !== "/") login.searchParams.set("next", next);
    return NextResponse.redirect(login);
  };

  // The provider (or Supabase) reported a problem. A refused new account,
  // e.g. while sign-up is closed, arrives as a "Database error".
  const description = url.searchParams.get("error_description") ?? "";
  if (url.searchParams.get("error")) {
    return backToLogin(/database error/i.test(description) ? "oauth_signup" : "oauth");
  }

  const code = url.searchParams.get("code");
  if (!code) return backToLogin("oauth");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return backToLogin("oauth");

  // If this account has no photo yet, use the provider's. A photo the user
  // uploaded themselves is never replaced: this only fills an empty one.
  const meta = data.user.user_metadata ?? {};
  const photo = [meta.avatar_url, meta.picture].find(
    (value): value is string => typeof value === "string" && value.startsWith("https://"),
  );
  if (photo) {
    await supabase.from("profiles").update({ avatar_url: photo }).eq("id", data.user.id).is("avatar_url", null);
  }

  return NextResponse.redirect(new URL(next, origin));
}
