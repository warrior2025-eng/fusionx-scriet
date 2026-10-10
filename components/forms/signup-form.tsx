"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUpAction, type AuthActionState } from "@/actions/auth";
import { OAuthButtons } from "@/components/forms/oauth-buttons";
import { Label, Input, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

const initialState: AuthActionState = { status: "idle" };

export function SignUpForm({ next = "/" }: { next?: string }) {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);

  return (
    <div>
      <OAuthButtons next={next} />

      <form action={formAction} className="space-y-5">
        <input type="hidden" name="next" value={next} />

        {state.status === "error" && state.message && !Object.keys(state.fieldErrors ?? {}).length && (
          <p className="text-sm text-red-600">{state.message}</p>
        )}
        <div>
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" name="full_name" autoComplete="name" required />
          <FieldError>{state.fieldErrors?.full_name}</FieldError>
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
          <FieldError>{state.fieldErrors?.email}</FieldError>
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
          <FieldError>{state.fieldErrors?.password}</FieldError>
        </div>
        <div>
          <Label htmlFor="confirm_password">Confirm password</Label>
          <Input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" required minLength={8} />
          <FieldError>{state.fieldErrors?.confirm_password}</FieldError>
        </div>
        <Button type="submit" loading={pending} className="w-full">
          Create account
        </Button>
        <p className="text-center text-sm text-ink/55">
          Already have an account?{" "}
          <Link
            href={next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`}
            className="text-accent hover:underline"
          >
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
