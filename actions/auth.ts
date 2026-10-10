"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, signUpSchema } from "@/lib/validations";
import { getOrganizationSettings } from "@/lib/data/organization";

export type AuthActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};

const initialErrorState = (message: string, fieldErrors?: Record<string, string>): AuthActionState => ({
  status: "error",
  message,
  fieldErrors,
});

export async function signUpAction(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const raw = {
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirm_password: formData.get("confirm_password"),
  };

  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString();
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return initialErrorState("Please fix the highlighted fields.", fieldErrors);
  }

  // The database refuses new accounts too while this is off (see
  // handle_new_user in migration 0008); this just gives a clear message.
  if (!(await getOrganizationSettings()).signup_enabled) {
    return initialErrorState("Sign-up is currently closed.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.full_name } },
  });

  if (error) {
    return initialErrorState(error.message);
  }

  redirect("/login?verify=1");
}

export async function loginAction(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const raw = { email: formData.get("email"), password: formData.get("password") };
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString();
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return initialErrorState("Please fix the highlighted fields.", fieldErrors);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return initialErrorState("Incorrect email or password.");
  }

  // Only ever redirect to a path on this site, never to an outside URL.
  const next = formData.get("next")?.toString() ?? "";
  const internal = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\");
  redirect(internal ? next : "/");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function requestPasswordResetAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = formData.get("email")?.toString();
  if (!email) return initialErrorState("Enter your email address.");

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/reset-password`,
  });

  if (error) return initialErrorState(error.message);

  return { status: "error", message: "If that email is registered, a reset link has been sent." };
}
