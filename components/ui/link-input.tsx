"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { normalizeLink, type LinkKind } from "@/lib/validation/link";
import { FieldError, Input } from "./field";

const NOTE_MS = 8000;

/**
 * A link field that fixes itself. As the person leaves it (and before the form is sent) the text
 * becomes the fixed link, with a note and Undo. A plain text box, so the browser's own URL popup
 * can never stop a form. The server applies the same fix whatever arrives.
 */
export function LinkInput({
  kind = "any",
  label,
  allowPath,
  allowMailto,
  error,
  value,
  onValueChange,
  defaultValue,
  id,
  name,
  className,
  ...props
}: {
  kind?: LinkKind;
  /** The field's name, for the messages. */
  label: string;
  allowPath?: boolean;
  allowMailto?: boolean;
  /** From the server or the form's rules. */
  error?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  defaultValue?: string | number | readonly string[];
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "type">) {
  const [own, setOwn] = useState(String(defaultValue ?? ""));
  // After a save the page brings the saved link, which may arrive after this mounted.
  const [seenDefault, setSeenDefault] = useState(defaultValue);
  if (seenDefault !== defaultValue) {
    setSeenDefault(defaultValue);
    setOwn(String(defaultValue ?? ""));
  }
  const text = value ?? own;
  const [note, setNote] = useState<{ fixed: string; typed: string } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undone = useRef(false);
  const latest = useRef(text);

  useEffect(() => {
    latest.current = text;
  }, [text]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const put = useCallback(
    (next: string) => {
      latest.current = next;
      setOwn(next);
      onValueChange?.(next);
    },
    [onValueChange],
  );

  const settle = useCallback(() => {
    const typed = latest.current;
    const result = normalizeLink(typed, kind, { label, allowPath, allowMailto });
    if (!result.ok) {
      setLocal(result.error);
      setHint(null);
      return;
    }
    setLocal(null);
    setHint(result.hint ?? null);
    if (undone.current || result.value === typed) return;
    put(result.value);
    if (!result.value) return;
    setNote({ fixed: result.value, typed });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(null), NOTE_MS);
  }, [kind, label, allowPath, allowMailto, put]);

  // Pressing Enter sends the form without leaving the field.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const beforeSend = () => flushSync(settle);
    form.addEventListener("submit", beforeSend, true);
    return () => form.removeEventListener("submit", beforeSend, true);
  }, [settle]);

  const shown = local ?? error;
  const errorId = id ? `${id}-error` : undefined;

  return (
    <>
      <Input
        {...props}
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        inputMode="url"
        autoComplete={props.autoComplete ?? "url"}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={className}
        value={text}
        aria-invalid={shown ? true : undefined}
        aria-describedby={shown ? errorId : undefined}
        onChange={(e) => {
          undone.current = false;
          setLocal(null);
          setHint(null);
          setNote(null);
          put(e.target.value);
        }}
        onBlur={(e) => {
          settle();
          props.onBlur?.(e);
        }}
      />
      {note && (
        <p role="status" className="mt-1 break-all text-xs text-emerald-600" data-link-note>
          Fixed to {note.fixed}{" "}
          <button
            type="button"
            className="font-medium underline underline-offset-2"
            onClick={() => {
              undone.current = true;
              put(note.typed);
              setNote(null);
              inputRef.current?.focus();
            }}
          >
            Undo
          </button>
        </p>
      )}
      {hint && !shown && (
        <p className="mt-1 text-xs text-amber-600" data-link-hint>
          {hint}
        </p>
      )}
      <FieldError id={errorId}>{shown}</FieldError>
    </>
  );
}
