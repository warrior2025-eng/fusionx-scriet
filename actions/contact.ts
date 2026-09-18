"use server";

import { createClient } from "@/lib/supabase/server";
import { contactMessageSchema } from "@/lib/validations";

export type ContactActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};

export async function submitContactMessage(
  _prev: ContactActionState,
  formData: FormData
): Promise<ContactActionState> {
  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    subject: formData.get("subject"),
    message: formData.get("message"),
    website: formData.get("website") || "",
  };

  const parsed = contactMessageSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString();
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors };
  }

  const { website: _honeypot, ...data } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("contact_messages").insert(data);

  if (error) {
    return { status: "error", message: "Something went wrong sending your message. Please try again." };
  }

  return { status: "success", message: "Message sent. We'll get back to you by email." };
}
