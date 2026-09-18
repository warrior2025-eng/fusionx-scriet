import type { Metadata } from "next";
import { SignUpForm } from "@/components/forms/signup-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <div className="border border-ink/10 rounded-sm bg-white/60 p-7">
      <h1 className="text-lg font-semibold text-ink mb-6">Create your account</h1>
      <SignUpForm />
    </div>
  );
}
