import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/components/forms/signup-form";
import { getOrganizationSettings } from "@/lib/data/organization";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage() {
  const settings = await getOrganizationSettings();

  if (!settings.signup_enabled) {
    return (
      <div className="border border-ink/10 rounded-sm bg-surface p-7">
        <h1 className="text-lg font-semibold text-ink mb-3">Sign-up is closed</h1>
        <p className="text-sm leading-relaxed text-ink/70">
          New accounts can&rsquo;t be created right now. If you already have an account you can still sign in.
        </p>
        <Link href="/login" className="mt-5 inline-block text-sm font-medium text-accent underline underline-offset-2">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="border border-ink/10 rounded-sm bg-surface p-7">
      <h1 className="text-lg font-semibold text-ink mb-6">Create your account</h1>
      <SignUpForm />
    </div>
  );
}
