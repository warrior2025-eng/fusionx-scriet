import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/forms/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="border border-ink/10 rounded-sm bg-white/60 p-7">
      <h1 className="text-lg font-semibold text-ink mb-6">Sign in</h1>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
