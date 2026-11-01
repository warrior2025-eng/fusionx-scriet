"use client";

import Link from "next/link";
import { signUpAction, type AuthActionState } from "@/actions/auth";
import { OAuthButtons } from "@/components/forms/oauth-buttons";
import { Label, Input, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useFormSubmit } from "@/components/ui/form-errors";
import { signUpSchema } from "@/lib/validations";

const initialState: AuthActionState = { status: "idle" };

export function SignUpForm({ next = "/", email = "" }: { next?: string; email?: string }) {
  const { pending, errors, summary, formProps } = useFormSubmit(signUpAction, initialState, { schema: signUpSchema, prefix: "" });

  return (
    <div>
      <OAuthButtons next={next} />

      <form {...formProps} className="space-y-5">
        <input type="hidden" name="next" value={next} />

        {summary}
        <div>
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" name="full_name" autoComplete="name" required />
          <FieldError id="full_name-error">{errors.full_name}</FieldError>
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" defaultValue={email} required />
          <FieldError id="email-error">{errors.email}</FieldError>
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
          <FieldError id="password-error">{errors.password}</FieldError>
        </div>
        <div>
          <Label htmlFor="confirm_password">Confirm password</Label>
          <Input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" required minLength={8} />
          <FieldError id="confirm_password-error">{errors.confirm_password}</FieldError>
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
