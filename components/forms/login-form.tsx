"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loginAction, type AuthActionState } from "@/actions/auth";
import { Label, Input, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

const initialState: AuthActionState = { status: "idle" };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const justVerified = searchParams.get("verify") === "1";

  return (
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
        <Input id="email" name="email" type="email" required />
        <FieldError>{state.fieldErrors?.email}</FieldError>
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required />
        <FieldError>{state.fieldErrors?.password}</FieldError>
      </div>
      <Button type="submit" loading={pending} className="w-full">
        Sign in
      </Button>
      <p className="text-center text-sm text-ink/55">
        Don&rsquo;t have an account?{" "}
        <Link href="/signup" className="text-accent hover:underline">
          Create one
        </Link>
      </p>
    </form>
  );
}
