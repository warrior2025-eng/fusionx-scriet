"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { coreUserName, searchCoreUsers, type CoreUserHit } from "@/actions/admin-core-teams";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/field";
import { useFieldError } from "./admin-form";

const NO_GROUP = "00000000-0000-0000-0000-000000000000";

/** Picks one website account by name or email. The form sends its id, or nothing. */
export function UserField({ name, label, hint, defaultValue, className }: { name: string; label: string; hint?: string; defaultValue: string; className?: string }) {
  const id = useId();
  const error = useFieldError(name);
  const [picked, setPicked] = useState(defaultValue);
  const [pickedName, setPickedName] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CoreUserHit[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    if (!defaultValue) return;
    void coreUserName(defaultValue).then((found) => setPickedName(found ?? "A website account"));
  }, [defaultValue]);

  const change = (next: string) => {
    setQ(next);
    if (timer.current) clearTimeout(timer.current);
    const ask = ++latest.current;
    if (next.trim().length < 2) return setResults(null);
    timer.current = setTimeout(async () => {
      const found = await searchCoreUsers(NO_GROUP, next.trim());
      if (ask === latest.current) setResults(found.results);
    }, 300);
  };

  return (
    <div className={className}>
      <Label htmlFor={id}>{label} (optional)</Label>
      <input type="hidden" name={name} value={picked} />
      {picked ? (
        <span className="inline-flex items-center gap-1.5 border border-line bg-paper px-2 py-1 text-sm text-ink" data-linked>
          {pickedName || "…"}
          <button
            type="button"
            aria-label="Remove the link"
            onClick={() => {
              setPicked("");
              setPickedName("");
            }}
          >
            <X size={13} aria-hidden />
          </button>
        </span>
      ) : (
        <div className="relative">
          <Input id={id} type="search" value={q} onChange={(e) => change(e.target.value)} placeholder="Search users by name or email" autoComplete="off" />
          {results && (
            <ul className="absolute inset-x-0 top-full z-20 max-h-56 overflow-y-auto border border-line bg-paper shadow-lg">
              {results.length === 0 && <li className="px-3 py-2 text-sm text-ink/70">Not found.</li>}
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-ink/5"
                    onClick={() => {
                      setPicked(r.id);
                      setPickedName(r.full_name);
                      setQ("");
                      setResults(null);
                    }}
                  >
                    <span className="font-medium text-ink">{r.full_name}</span>
                    <span className="block text-xs text-ink/65">{r.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {hint && <FieldHint>{hint}</FieldHint>}
      <FieldError>{error}</FieldError>
    </div>
  );
}
