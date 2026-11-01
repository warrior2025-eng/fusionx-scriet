"use client";

import { useCallback, useId, useRef, useState } from "react";
import { getBoardStamp } from "@/actions/admin-results";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import type { ActionState } from "@/lib/admin/action-state";
import { AdminForm } from "./admin-form";

const LABELS: Record<string, string> = { selected: "Selected", waitlisted: "Waitlisted", not_selected: "Not selected", undecided: "Undecided" };

/**
 * The decision of one board row. Choosing Selected for someone already
 * selected in another hub asks first: keep both hubs, or move them here. The
 * answer travels with the form; nothing is saved until "Save decisions".
 *
 * Only a row the admin changed is sent, and it is keyed by what the server holds
 * (see the board): when that changes, this starts again from the new value.
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
  const dirty = value !== defaultValue;

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
      {dirty && (
        <>
          <input type="hidden" name="row" value={applicationId} />
          <input type="hidden" name={`hubs_${applicationId}`} value={choice} />
          <input type="hidden" name={`hubswhy_${applicationId}`} value={choice === "keep" ? reason : ""} />
        </>
      )}
      <select
        name={dirty ? `dec_${applicationId}` : undefined}
        data-decision={applicationId}
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
      {dirty && <span className="mt-1 block text-xs font-medium text-accent">Changed, not saved yet</span>}
      {choice === "keep" && <span className="mt-1 block text-xs text-ink/60">Keeps both hubs</span>}
      {choice === "move" && <span className="mt-1 block text-xs text-ink/60">Moves to {hub}</span>}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
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

/** A row's message. Sent only when it changed. */
export function RowMessage({ applicationId, name, defaultValue }: { applicationId: string; name: string; defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const dirty = value !== defaultValue;
  return (
    <>
      {dirty && <input type="hidden" name="row" value={applicationId} />}
      <input
        name={dirty ? `msg_${applicationId}` : undefined}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={1000}
        aria-label={`Message to ${name}`}
        placeholder="Uses the template when empty"
        className="w-full border border-line bg-paper px-2 py-1.5 text-sm text-ink"
      />
    </>
  );
}

export type BoardEffect = {
  name: string;
  /** Allowed in more than one hub already, so nothing else changes. */
  multi: boolean;
  others: { hub: string; decision: string; reason: string | null }[];
};

/**
 * One hub's board. Before saving: another admin's change is pointed out, and anything that will
 * also change another hub is listed for a yes or no.
 */
export function DecisionBoardForm({
  action,
  cycleId,
  stamp,
  oneHubMode,
  effects,
  children,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  cycleId: string;
  stamp: string | null;
  oneHubMode: string;
  effects: Record<string, BoardEffect>;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [lines, setLines] = useState<string[]>([]);
  const [otherAdmin, setOtherAdmin] = useState(false);
  const proceedRef = useRef<(() => void) | null>(null);

  const consequences = useCallback(
    (form: HTMLFormElement) => {
      const data = new FormData(form);
      const bulk = String(data.get("bulk_decision") ?? "");
      const ticked = new Set(bulk ? data.getAll("ids").map(String) : []);
      const rows = new Set([...data.getAll("row").map(String), ...ticked]);
      const out: string[] = [];
      for (const id of rows) {
        const effect = effects[id];
        if (!effect) continue;
        const from = String(data.get(`orig_${id}`) ?? "undecided");
        const to = ticked.has(id) ? bulk : String(data.get(`dec_${id}`) ?? from);
        if (to === from) continue;
        if (to === "selected" && oneHubMode !== "allow_multiple" && !effect.multi && data.get(`hubs_${id}`) !== "keep") {
          for (const o of effect.others) {
            if (o.decision === "not_selected" || (o.decision === "waitlisted" && oneHubMode === "keep_waitlisted")) continue;
            out.push(`${effect.name} in ${o.hub}: ${LABELS[o.decision]} → Not selected`);
          }
        }
        if (from === "selected" && !effect.others.some((o) => o.decision === "selected")) {
          for (const o of effect.others) if (o.reason === "one_hub") out.push(`${effect.name} in ${o.hub}: Not selected → Undecided`);
        }
      }
      return out;
    },
    [effects, oneHubMode],
  );

  const beforeSend = useCallback(
    (form: HTMLFormElement, proceed: () => void) => {
      const go = () => {
        const list = consequences(form);
        if (list.length === 0) return proceed();
        proceedRef.current = proceed;
        setLines(list);
        dialogRef.current?.showModal();
      };
      void getBoardStamp(cycleId)
        .then((current) => {
          if (current !== null && current !== stamp) {
            proceedRef.current = go;
            setOtherAdmin(true);
          } else go();
        })
        // The check is a courtesy: the server still compares every row.
        .catch(go);
      return false;
    },
    [cycleId, stamp, consequences],
  );

  return (
    <>
      {otherAdmin && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-amber-500/50 bg-amber-500/10 px-3.5 py-2.5 text-sm text-ink" data-other-admin>
          <span>Another admin changed this board. Reload to see the latest.</span>
          <span className="flex gap-2">
            <Button type="button" size="sm" onClick={() => window.location.reload()}>
              Reload
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setOtherAdmin(false);
                proceedRef.current?.();
              }}
            >
              Save my changes anyway
            </Button>
          </span>
        </div>
      )}
      <AdminForm action={action} submitLabel="Save decisions" beforeSend={beforeSend}>
        {children}
      </AdminForm>
      <dialog ref={dialogRef} aria-labelledby={titleId} className="m-auto w-[min(92vw,32rem)] border border-line bg-surface p-6 text-ink backdrop:bg-black/60" data-effects>
        <h2 id={titleId} className="font-serif text-xl">
          This also changes other hubs
        </h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink/85">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => dialogRef.current?.close()}>
            Go back
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              dialogRef.current?.close();
              proceedRef.current?.();
            }}
          >
            Save these changes
          </Button>
        </div>
      </dialog>
    </>
  );
}
