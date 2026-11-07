"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { Avatar } from "./room-sidebar";

type Found = { id: string; full_name: string; avatar_url: string | null; detail: string | null; status: "in_room" | "invited" | null };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const plural = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

/**
 * "Invite people" in the room, for hosts: website users by name, and anyone by email. The
 * server checks the host right and the limits, gives passes, rings and writes the emails.
 */
export function InviteDialog({ meetingId, open, onClose, onSent }: { meetingId: string; open: boolean; onClose: () => void; onSent: (message: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
  }, [open]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Found[]>([]);
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [ring, setRing] = useState(true);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState("");

  const call = async (action: string, args: object) => {
    const res = await fetch(`/api/meetings/${meetingId}/host`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, args }) });
    const body = await res.json().catch(() => ({}));
    return res.ok ? { data: body } : { error: (body as { error?: string }).error ?? "That could not be done." };
  };

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let stale = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      const { data, error } = await call("invite_search", { q: term });
      if (stale) return;
      setSearching(false);
      setResults(error ? [] : ((data as { results: Found[] }).results ?? []));
      if (error) setProblem(error);
    }, 250);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- call only reads meetingId
  }, [q, meetingId]);

  // Commas, spaces and new lines split addresses into chips; the last piece stays as typing.
  const takeEmails = (value: string, all = false) => {
    const parts = value.split(/[\s,;]+/);
    const rest = all ? "" : (parts.pop() ?? "");
    const fresh = parts.map((p) => p.trim().toLowerCase()).filter(Boolean);
    if (fresh.length) setEmails((was) => [...new Set([...was, ...fresh])]);
    setDraft(rest);
  };

  const reset = () => {
    setQ("");
    setResults([]);
    setPicked([]);
    setEmails([]);
    setDraft("");
    setRing(true);
    setProblem("");
  };

  const good = emails.filter((e) => EMAIL.test(e));
  const bad = emails.filter((e) => !EMAIL.test(e));
  const send = async () => {
    const all = [...new Set([...good, ...(EMAIL.test(draft.trim().toLowerCase()) ? [draft.trim().toLowerCase()] : [])])];
    if (bad.length) return setProblem(`Check ${bad.length === 1 ? "this address" : "these addresses"}: ${bad.join(", ")}`);
    if (picked.length + all.length === 0) return setProblem("Choose someone, or type an email address.");
    setSending(true);
    setProblem("");
    const { data, error } = await call("invite", { users: picked.map((p) => p.id), emails: all, ring });
    setSending(false);
    if (error) return setProblem(error);
    const done = data as { users: number; emails: number; already: number };
    const invited = done.users + done.emails;
    const parts = [invited ? `Invited ${plural(invited)}${done.emails ? ` (${done.emails} by email)` : ""}` : "", done.already ? `${plural(done.already)} already invited` : ""].filter(Boolean);
    onSent(parts.join(". ") || "Nobody new to invite");
    reset();
    dialog.current?.close();
  };

  const list = q.trim().length >= 2 ? results : [];
  return (
    <dialog
      ref={dialog}
      aria-labelledby="meeting-invite"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
      className="m-auto w-[min(94vw,32rem)] border border-line bg-surface p-0 text-ink backdrop:bg-black/60"
      data-invite-dialog
    >
      <form
        className="max-h-[85dvh] space-y-4 overflow-y-auto p-5 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="meeting-invite" className="font-serif text-xl">
            Invite people
          </h2>
          <button type="button" aria-label="Close" onClick={() => dialog.current?.close()} className="p-1 text-ink/60 hover:text-ink">
            <X size={16} aria-hidden />
          </button>
        </div>

        <div>
          <label htmlFor="invite-search" className="text-sm font-medium">
            Website users
          </label>
          <Input id="invite-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" autoComplete="off" className="mt-1 py-2" />
          {q.trim().length >= 2 && (
            <ul className="mt-1 max-h-48 divide-y divide-line/60 overflow-y-auto border border-line" aria-label="Search results" aria-busy={searching}>
              {!searching && list.length === 0 && <li className="px-3 py-2 text-sm text-ink/60">Nobody found.</li>}
              {list.map((p) => {
                const chosen = picked.some((x) => x.id === p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={p.status === "in_room"}
                      aria-pressed={chosen}
                      onClick={() => setPicked((was) => (chosen ? was.filter((x) => x.id !== p.id) : [...was, p]))}
                      className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-ink/5 disabled:opacity-60", chosen && "bg-accent-soft")}
                      data-invite-result={p.full_name}
                    >
                      <Avatar person={{ name: p.full_name, avatar_url: p.avatar_url }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{p.full_name}</span>
                        {p.detail && <span className="block truncate text-xs text-ink/60">{p.detail}</span>}
                      </span>
                      <span className="shrink-0 text-xs text-ink/60">{p.status === "in_room" ? "In the room" : p.status === "invited" ? "Invited" : chosen ? "Added" : "Add"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {picked.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Chosen">
              {picked.map((p) => (
                <li key={p.id} className="flex items-center gap-1 rounded-sm bg-accent-soft px-2 py-1 text-xs font-medium" data-invite-chip={p.full_name}>
                  {p.full_name}
                  <button type="button" aria-label={`Remove ${p.full_name}`} onClick={() => setPicked((was) => was.filter((x) => x.id !== p.id))}>
                    <X size={12} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label htmlFor="invite-emails" className="text-sm font-medium">
            Invite by email
          </label>
          <Textarea
            id="invite-emails"
            rows={2}
            value={draft}
            onChange={(e) => takeEmails(e.target.value)}
            onBlur={() => takeEmails(draft, true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                takeEmails(draft, true);
              }
            }}
            placeholder="Type or paste addresses, separated by commas, spaces or new lines"
            className="mt-1"
          />
          {emails.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Email addresses">
              {emails.map((e) => (
                <li
                  key={e}
                  className={cn("flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium", EMAIL.test(e) ? "bg-ink/5" : "bg-red-500/15 text-red-700 dark:text-red-300")}
                  data-email-chip={e}
                  data-bad={EMAIL.test(e) ? undefined : ""}
                >
                  {e}
                  {!EMAIL.test(e) && <span className="sr-only"> (not a valid address)</span>}
                  <button type="button" aria-label={`Remove ${e}`} onClick={() => setEmails((was) => was.filter((x) => x !== e))}>
                    <X size={12} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-xs text-ink/60">Someone without an account gets an email to sign up with that address; their pass comes when they do.</p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ring} onChange={(e) => setRing(e.target.checked)} className="h-4 w-4 accent-accent" />
          Ring them now
        </label>

        {problem && (
          <p role="alert" className="text-sm text-red-600">
            {problem}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => dialog.current?.close()}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={sending}>
            Send invites
          </Button>
        </div>
      </form>
    </dialog>
  );
}
