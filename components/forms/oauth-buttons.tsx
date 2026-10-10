"use client";

import { useEffect, useState } from "react";
import { GitHubIcon, GoogleIcon } from "@/components/ui/brand-icons";
import { safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Provider = "google" | "github";

const PROVIDERS: { id: Provider; label: string; Icon: typeof GoogleIcon }[] = [
  { id: "google", label: "Continue with Google", Icon: GoogleIcon },
  { id: "github", label: "Continue with GitHub", Icon: GitHubIcon },
];

/**
 * "Continue with Google / GitHub", followed by an "or" divider for the email
 * form below it. Clicking sends the browser to the provider; it comes back to
 * /auth/callback, which finishes the sign-in and goes on to `next`.
 */
export function OAuthButtons({ next }: { next: string }) {
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The spinner must never get stuck. Someone can come back here without the
  // page reloading: the browser's Back button, "Back to safety" on Google's
  // warning screen, or stopping the navigation before it leaves. So the
  // buttons are released when the page is shown again, and in any case a few
  // seconds after a click if this page is somehow still the one on screen.
  useEffect(() => {
    const reset = () => setPending(null);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setPending(null), 6000);
    return () => window.clearTimeout(timer);
  }, [pending]);

  async function signIn(provider: Provider) {
    setPending(provider);
    setError(null);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext(next))}`;
    const { error: failed } = await createClient().auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (failed) {
      setPending(null);
      setError("Could not start that sign-in. Please try again.");
    }
  }

  return (
    <div>
      <div className="space-y-3">
        {PROVIDERS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => signIn(id)}
            disabled={pending !== null}
            aria-busy={pending === id}
            className={cn(
              "flex w-full items-center justify-center gap-3 rounded-sm border border-ink/25 bg-surface px-5 py-2.5 text-sm font-medium text-ink",
              "transition-colors duration-150 hover:border-ink hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {pending === id ? (
              <span className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
            ) : (
              <Icon size={18} />
            )}
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="my-6 flex items-center gap-3 text-xs text-ink/55" role="separator" aria-label="or">
        <span className="h-px flex-1 bg-line" aria-hidden />
        <span aria-hidden>or</span>
        <span className="h-px flex-1 bg-line" aria-hidden />
      </div>
    </div>
  );
}
