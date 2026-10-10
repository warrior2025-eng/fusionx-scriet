import type { Metadata } from "next";
import { Check, Mail, MailOpen, RotateCcw, Trash2 } from "lucide-react";
import { deleteMessage, setMessageState } from "@/actions/admin-inbox";
import { ActionButton } from "@/components/admin/action-button";
import { AdminPage, Pagination, Pill, Toolbar, formatDate, pageOf, param, searchFilter, type ListParams } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import type { ContactMessage } from "@/types/database";

export const metadata: Metadata = { title: "Admin: Messages" };

const PAGE_SIZE = 15;

export default async function MessagesPage({ searchParams }: { searchParams: Promise<ListParams> }) {
  const ctx = await requireCapability("messages", "/admin/messages");
  const params = await searchParams;
  const page = pageOf(params);
  const q = param(params, "q");
  const state = param(params, "state");

  let query = ctx.supabase.from("contact_messages").select("*", { count: "exact" });
  if (q) query = query.or(searchFilter(["name", "email", "subject"], q));
  if (state === "unread") query = query.eq("is_reviewed", false);
  if (state === "open") query = query.eq("is_resolved", false);
  if (state === "resolved") query = query.eq("is_resolved", true);
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const messages = (data ?? []) as ContactMessage[];

  return (
    <AdminPage
      title="Messages"
      description="Messages sent through the Contact page. Replying opens your own email app."
      crumbs={[{ label: "Messages" }]}
    >
      <Toolbar
        base="/admin/messages"
        params={params}
        searchPlaceholder="Search name, email or subject"
        filters={[
          {
            name: "state",
            label: "Show",
            options: [
              { value: "unread", label: "Unread" },
              { value: "open", label: "Not resolved" },
              { value: "resolved", label: "Resolved" },
            ],
          },
        ]}
      />

      {error && (
        <p role="alert" className="mb-4 border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-600">
          Messages could not be loaded.
        </p>
      )}
      {messages.length === 0 && !error && (
        <p className="border border-dashed border-ink/20 bg-surface px-6 py-12 text-sm text-ink/60">No messages here.</p>
      )}

      <ul className="space-y-4">
        {messages.map((message) => (
          <li key={message.id} className="border border-line bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className={`text-base text-ink ${message.is_reviewed ? "font-medium" : "font-semibold"}`}>
                  {message.subject}
                </h2>
                <p className="mt-0.5 break-all text-sm text-ink/65">
                  {message.name}, {message.email}
                </p>
                <p className="text-xs text-ink/55">{formatDate(message.created_at, true)}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {!message.is_reviewed && <Pill tone="warn">Unread</Pill>}
                {message.is_resolved && <Pill tone="good">Resolved</Pill>}
              </div>
            </div>
            <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink/85">{message.message}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <a
                href={`mailto:${message.email}?subject=${encodeURIComponent(`Re: ${message.subject}`)}`}
                className="inline-flex items-center gap-2 rounded-sm bg-accent px-3.5 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
              >
                <Mail size={14} /> Reply by email
              </a>
              {message.is_reviewed ? (
                <ActionButton action={setMessageState.bind(null, message.id, "unread")}>
                  <Mail size={14} /> Mark unread
                </ActionButton>
              ) : (
                <ActionButton action={setMessageState.bind(null, message.id, "read")}>
                  <MailOpen size={14} /> Mark read
                </ActionButton>
              )}
              {message.is_resolved ? (
                <ActionButton action={setMessageState.bind(null, message.id, "reopened")}>
                  <RotateCcw size={14} /> Reopen
                </ActionButton>
              ) : (
                <ActionButton action={setMessageState.bind(null, message.id, "resolved")}>
                  <Check size={14} /> Mark resolved
                </ActionButton>
              )}
              <ActionButton
                danger
                variant="ghost"
                className="ml-auto"
                action={deleteMessage.bind(null, message.id)}
                confirm={{
                  title: "Delete this message?",
                  body: "It is removed permanently. This can't be undone.",
                  confirmLabel: "Delete",
                }}
              >
                <Trash2 size={14} /> Delete
              </ActionButton>
            </div>
          </li>
        ))}
      </ul>
      <Pagination base="/admin/messages" params={params} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </AdminPage>
  );
}
