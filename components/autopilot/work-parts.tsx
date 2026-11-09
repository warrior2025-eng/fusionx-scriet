"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { toastResult } from "@/components/admin/toast";
import type { ActionState } from "@/lib/admin/action-state";
import { createClient } from "@/lib/supabase/client";
import {
  addBusyDates, decideReview, pushPublicKey, removeBusyDates, removePushSubscription, requestTaskChange, respondToOffer,
  saveCheckin, savePreferences, savePushSubscription, submitProof,
} from "@/actions/autopilot";

/** Runs a server action, toasts it and refreshes the page. */
function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionState>, after?: () => void) =>
    start(async () => {
      const result = await fn();
      toastResult(result);
      if (result.status === "success") {
        after?.();
        router.refresh();
      }
    });
  return { pending, run };
}

export function OfferButtons({ offerId }: { offerId: string }) {
  const { pending, run } = useRun();
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      <Button size="sm" disabled={pending} onClick={() => run(() => respondToOffer(offerId, "accept"))}>Accept</Button>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => respondToOffer(offerId, "swap"))}>Swap</Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => respondToOffer(offerId, "cant"))}>Can&apos;t do</Button>
    </div>
  );
}

const ACCEPT: Record<string, string> = {
  image: "image/jpeg,image/png,image/webp,image/gif",
  file: "image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4,.pptx,.docx,.zip,.txt",
};

/** The proof for a task: a link, an upload (up to 10 MB, straight to the private bucket) or a note. */
export function ProofForm({ taskId, proof, userId, changes }: { taskId: string; proof: "link" | "file" | "image" | "text"; userId: string; changes: boolean }) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(changes);
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [uploaded, setUploaded] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File | undefined) {
    setError("");
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return setError("Up to 10 MB, please.");
    setUploading(true);
    const name = file.name.replace(/[^\w.-]+/g, "-").slice(-80);
    const path = `${userId}/${taskId}/${Date.now()}-${name}`;
    const { error: uploadError } = await createClient().storage.from("task-proofs").upload(path, file, { contentType: file.type || undefined });
    setUploading(false);
    if (uploadError) return setError(uploadError.message.includes("mime") ? "That file type is not allowed." : "The upload failed. Try again.");
    setUploaded(`storage:task-proofs/${path}`);
  }

  if (!open) return <Button size="sm" onClick={() => setOpen(true)}>{changes ? "Fix and submit again" : "Submit proof"}</Button>;
  return (
    <div className="space-y-2 border-t border-line pt-3" data-proof-form>
      {proof === "text" ? null : proof === "link" ? (
        <Input aria-label="Proof link" placeholder="Link to the work (Drive, Figma, post, repo…)" value={link} onChange={(e) => setLink(e.target.value)} />
      ) : (
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink/80">
          <Upload size={15} aria-hidden />
          <span>{uploaded ? "Uploaded ✓ (choose again to replace)" : uploading ? "Uploading…" : proof === "image" ? "Upload the image (up to 10 MB)" : "Upload the file (up to 10 MB)"}</span>
          <input type="file" className="sr-only" accept={ACCEPT[proof]} onChange={(e) => upload(e.target.files?.[0])} />
        </label>
      )}
      {proof !== "link" && proof !== "text" && <Input aria-label="Or a link" placeholder="…or a link instead" value={link} onChange={(e) => setLink(e.target.value)} />}
      <Textarea aria-label="What you did" rows={proof === "text" ? 4 : 2} maxLength={2000} placeholder={proof === "text" ? "What you did (required)" : "A note for the reviewer (optional)"} value={text} onChange={(e) => setText(e.target.value)} />
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={pending || uploading} onClick={() => run(() => submitProof(taskId, text, link, uploaded), () => setOpen(false))}>Submit for review</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

export function ReviewForm({ reviewId }: { reviewId: string }) {
  const { pending, run } = useRun();
  const [note, setNote] = useState("");
  return (
    <div className="mt-3 space-y-2">
      <Textarea aria-label="Note" rows={2} maxLength={1000} placeholder="What needs to change? (needed for Changes needed)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => run(() => decideReview(reviewId, true, note))}>Approve</Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => decideReview(reviewId, false, note))}>Changes needed</Button>
      </div>
    </div>
  );
}

export function RequestChange({ taskId, due }: { taskId: string; due: string }) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"move" | "swap">("move");
  const [date, setDate] = useState(due);
  const [note, setNote] = useState("");
  if (!open) return <button type="button" className="text-xs text-ink/65 underline hover:text-ink" onClick={() => setOpen(true)}>Request a change</button>;
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-2 sm:flex-row sm:items-end">
      <Select aria-label="Change" value={kind} onChange={(e) => setKind(e.target.value as "move" | "swap")} className="sm:w-40">
        <option value="move">Move my task</option>
        <option value="swap">Give it to someone else</option>
      </Select>
      {kind === "move" && <Input type="date" aria-label="New date" value={date} onChange={(e) => setDate(e.target.value)} className="sm:w-44" />}
      <Input aria-label="Why" placeholder="Why (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button size="sm" disabled={pending} onClick={() => run(() => requestTaskChange(taskId, kind, date, note), () => setOpen(false))}>Ask</Button>
    </div>
  );
}

export function BusyDates({ rows }: { rows: { id: string; starts_on: string; ends_on: string; note: string | null }[] }) {
  const { pending, run } = useRun();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <ul className="space-y-1 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2">
              <span className="text-ink">{r.starts_on} → {r.ends_on}{r.note ? ` · ${r.note}` : ""}</span>
              <button type="button" className="text-xs text-ink/65 underline" disabled={pending} onClick={() => run(() => removeBusyDates(r.id))}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
        <Input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} />
        <Input aria-label="Note" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button size="sm" disabled={pending} onClick={() => run(() => addBusyDates(from, to, note), () => { setFrom(""); setTo(""); setNote(""); })}>Add</Button>
      </div>
    </div>
  );
}

export function CheckinForm({ initial }: { initial: { done: string | null; next: string | null; blocked: string | null } | null }) {
  const { pending, run } = useRun();
  const [done, setDone] = useState(initial?.done ?? "");
  const [next, setNext] = useState(initial?.next ?? "");
  const [blocked, setBlocked] = useState(initial?.blocked ?? "");
  return (
    <div className="space-y-2">
      <Input aria-label="Done" placeholder="Done this week" maxLength={500} value={done} onChange={(e) => setDone(e.target.value)} />
      <Input aria-label="Next" placeholder="Next" maxLength={500} value={next} onChange={(e) => setNext(e.target.value)} />
      <Input aria-label="Blocked" placeholder="Blocked by (your lead is told)" maxLength={500} value={blocked} onChange={(e) => setBlocked(e.target.value)} />
      <Button size="sm" disabled={pending} onClick={() => run(() => saveCheckin(done, next, blocked))}>{initial ? "Update check-in" : "Send check-in"}</Button>
    </div>
  );
}

export function PreferencesForm({ delivery, push }: { delivery: "instant" | "daily"; push: boolean }) {
  const { pending, run } = useRun();
  const [d, setD] = useState(delivery);
  const [p, setP] = useState(push);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="text-sm text-ink/80">
        <span className="mb-1 block">Task news</span>
        <Select value={d} onChange={(e) => setD(e.target.value as "instant" | "daily")} className="sm:w-56">
          <option value="instant">As it happens</option>
          <option value="daily">One daily digest (7 pm)</option>
        </Select>
      </label>
      <label className="flex items-center gap-2 text-sm text-ink/80">
        <input type="checkbox" checked={p} onChange={(e) => setP(e.target.checked)} /> Phone notifications
      </label>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => savePreferences(d, p))}>Save</Button>
    </div>
  );
}

function base64ToBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Turns phone notifications on for this device (installs the service worker and subscribes). */
export function PushToggle({ subscribed }: { subscribed: string[] }) {
  const { pending, run } = useRun();
  const [support, setSupport] = useState<"checking" | "yes" | "ios" | "no">("checking");
  const [endpoint, setEndpoint] = useState<string | null>(null);

  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads what the browser supports, once.
    setSupport(ok ? "yes" : ios && !standalone ? "ios" : "no");
    if (ok) navigator.serviceWorker.getRegistration("/").then((reg) => reg?.pushManager.getSubscription()).then((sub) => setEndpoint(sub?.endpoint ?? null)).catch(() => {});
  }, []);

  const on = endpoint !== null && subscribed.includes(endpoint);

  async function enable(): Promise<ActionState> {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { status: "error", message: "Notifications are blocked in this browser's settings." };
    const key = await pushPublicKey();
    if (!key) return { status: "error", message: "Phone notifications are not available right now." };
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(key) }));
    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    const result = await savePushSubscription(json, navigator.userAgent);
    if (result.status === "success") setEndpoint(json.endpoint);
    return result;
  }

  async function disable(): Promise<ActionState> {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    const result = await removePushSubscription(sub?.endpoint ?? endpoint ?? "");
    setEndpoint(null);
    return result;
  }

  if (support === "checking") return null;
  if (support === "ios") return <p className="text-sm text-ink/70" data-push="ios">On iPhone: tap Share → <strong>Add to Home Screen</strong>, open FusionX from there, then turn on phone notifications here.</p>;
  if (support === "no") return <p className="text-sm text-ink/70" data-push="unsupported">This browser cannot show phone notifications. You still get them in the site and by email.</p>;
  return on ? (
    <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(disable)} data-push="on"><BellOff size={14} aria-hidden /> Turn off on this device</Button>
  ) : (
    <Button size="sm" disabled={pending} onClick={() => run(enable)} data-push="off"><Bell size={14} aria-hidden /> Turn on phone notifications</Button>
  );
}
