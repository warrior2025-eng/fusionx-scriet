"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

/**
 * The decision of one board row. Choosing Selected for someone already
 * selected in another hub asks first: keep both hubs, or move them here. The
 * answer travels with the form; nothing is saved until "Save decisions".
 */
export function DecisionSelect({
  applicationId,
  name,
  hub,
  otherHubs,
  defaultValue,
  options,
}: {
  applicationId: string;
  name: string;
  hub: string;
  /** Other hubs this candidate is selected in, when the choice is still open. */
  otherHubs: string[];
  defaultValue: string;
  options: { value: string; label: string }[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [value, setValue] = useState(defaultValue);
  const [asked, setAsked] = useState(defaultValue);
  const [choice, setChoice] = useState<"" | "keep" | "move">("");
  const [reason, setReason] = useState("");

  function pick(next: string) {
    setAsked(value);
    setValue(next);
    setChoice("");
    if (next === "selected" && defaultValue !== "selected" && otherHubs.length > 0) dialogRef.current?.showModal();
  }

  function answer(hubs: "keep" | "move") {
    setChoice(hubs);
    dialogRef.current?.close();
  }

  return (
    <>
      <input type="hidden" name={`hubs_${applicationId}`} value={choice} />
      <input type="hidden" name={`hubswhy_${applicationId}`} value={choice === "keep" ? reason : ""} />
      <select
        name={`dec_${applicationId}`}
        value={value}
        onChange={(e) => pick(e.target.value)}
        aria-label={`Decision for ${name}`}
        className="w-full border border-line bg-paper px-2 py-1.5 text-sm text-ink"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {choice === "keep" && <span className="mt-1 block text-xs text-ink/60">Keeps both hubs</span>}
      {choice === "move" && <span className="mt-1 block text-xs text-ink/60">Moves to {hub}</span>}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        // Closed without an answer: the row goes back to what it was.
        onClose={() => setChoice((c) => (c ? c : (setValue(asked), "")))}
        className="m-auto w-[min(92vw,28rem)] border border-line bg-surface p-6 text-ink backdrop:bg-black/60"
      >
        <h2 id={titleId} className="font-serif text-xl">
          {name} is already selected in {otherHubs.join(" and ")}. Keep both hubs, or move them to {hub}?
        </h2>
        <label className="mt-4 block text-sm text-ink/80">
          Reason, if you keep both (optional, kept in the audit log)
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoComplete="off" className="mt-1.5" />
        </label>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => dialogRef.current?.close()}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => answer("move")}>
            Move to {hub}
          </Button>
          <Button type="button" size="sm" onClick={() => answer("keep")}>
            Keep both
          </Button>
        </div>
      </dialog>
    </>
  );
}
