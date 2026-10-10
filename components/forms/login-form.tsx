"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loginAction, type AuthActionState } from "@/actions/auth";
import { OAuthButtons } from "@/components/forms/oauth-buttons";
import { Label, Input, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

const initialState: AuthActionState = { status: "idle" };

// Set by /auth/callback when a Google or GitHub sign-in did not complete.
const OAUTH_ERRORS: Record<string, string> = {
  oauth: "That sign-in didn't complete. Please try again, or sign in with your email and password.",
  oauth_signup: "A new account couldn't be created just now. Sign-up may be closed. If you already have an account, sign in with the email it uses.",
};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const justVerified = searchParams.get("verify") === "1";
  const oauthError = OAUTH_ERRORS[searchParams.get("error") ?? ""];

  return (
    <div>
      {oauthError && (
        <p role="alert" className="mb-5 rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-ink">
          {oauthError}
        </p>
      )}

      <OAuthButtons next={next} />

      <form action={formAction} className="space-y-5">
        <input type="hidden" name="next" value={next} />

        {justVerified && (
          <p className="text-sm text-accent bg-accent/5 border border-accent/20 rounded-sm px-3 py-2">
            Check your email to verify your account, then sign in.
          </p>
        )}
        {state.status === "error" && state.message && (
          <p className="text-sm text-red-600">{state.message}</p>
        )}

        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
          <FieldError>{state.fieldErrors?.email}</FieldError>
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
          <FieldError>{state.fieldErrors?.password}</FieldError>
        </div>
        <Button type="submit" loading={pending} className="w-full">
          Sign in
        </Button>
        <p className="text-center text-sm text-ink/55">
          Don&rsquo;t have an account?{" "}
          <Link
            href={next === "/" ? "/signup" : `/signup?next=${encodeURIComponent(next)}`}
            className="text-accent hover:underline"
          >
            Create one
          </Link>
        </p>
      </form>
    </div>
  );
}
