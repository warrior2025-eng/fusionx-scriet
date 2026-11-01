"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";

/**
 * The one way a form reports what is wrong: a message under every bad field, all at once,
 * with a summary at the top that links to them and focus on the first. Nothing typed is lost:
 * the form is submitted by hand, so React's reset after a form action doesn't apply.
 */

type FormResult = { status: string; message?: string; fieldErrors?: Record<string, string> };
type Summary = { name: string; id: string | null; label: string; message: string }[];
const NETWORK = "Couldn't save right now. Check your internet and try again.";

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const isText = (el: Element): el is Control =>
  (el instanceof HTMLInputElement && !["checkbox", "radio", "file", "hidden", "submit", "button"].includes(el.type)) || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;

function controlOf(form: HTMLFormElement | null, name: string): HTMLElement | null {
  const found = form?.elements.namedItem(name);
  if (!found) return null;
  return found instanceof RadioNodeList ? ((found[0] as HTMLElement | undefined) ?? null) : (found as HTMLElement);
}

function labelOf(form: HTMLFormElement | null, name: string): { id: string | null; label: string } {
  const el = controlOf(form, name);
  const id = el?.id || null;
  const text = id ? form?.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : null;
  return { id, label: text?.replace(/\s*\(optional\)\s*$/i, "").replace(/\s*\*\s*$/, "").trim() || name.replace(/[._]/g, " ") };
}

function isRedirect(error: unknown) {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export function useFormSubmit<S extends FormResult>(
  action: (prev: S, formData: FormData) => Promise<S>,
  initial: S,
  options: {
    /** The same rules the server uses: checked as the person leaves a field and before sending. */
    schema?: { shape: Record<string, z.ZodType> };
    /** Words before "Fix N fields below:". */
    prefix?: string;
    onResult?: (result: S, form: HTMLFormElement | null) => void;
  } = {},
) {
  const { schema, prefix = "Not saved. ", onResult } = options;
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<S>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<Summary>([]);
  const [networkFailed, setNetworkFailed] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const [pending, startTransition] = useTransition();
  const lastData = useRef<FormData | null>(null);
  const submitted = useRef(false);

  const check = useCallback(
    (name: string, value: string): string | undefined => {
      const rule = schema?.shape[name];
      if (!rule) return undefined;
      const result = rule.safeParse(value);
      return result.success ? undefined : result.error.issues[0]?.message;
    },
    [schema],
  );

  const show = useCallback((next: Record<string, string>) => {
    setErrors(next);
    setSummary(Object.entries(next).map(([name, message]) => ({ name, message, ...labelOf(formRef.current, name) })));
  }, []);

  // aria-invalid and aria-describedby on the fields, which also gives them the red border.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    for (const el of Array.from(form.elements)) {
      if (!isText(el) || !el.name) continue;
      const message = errors[el.name];
      if (message) {
        el.setAttribute("aria-invalid", "true");
        const note = el.id ? `${el.id}-error` : null;
        if (note && document.getElementById(note)) el.setAttribute("aria-describedby", note);
      } else if (el.getAttribute("aria-invalid")) {
        el.removeAttribute("aria-invalid");
        if (el.getAttribute("aria-describedby")?.endsWith("-error")) el.removeAttribute("aria-describedby");
      }
    }
  }, [errors]);

  // After a failed save: to the first bad field.
  useEffect(() => {
    if (!focusTick) return;
    const first = Array.from(formRef.current?.elements ?? []).find((el) => el.getAttribute("aria-invalid") === "true") as HTMLElement | undefined;
    if (first) {
      first.scrollIntoView({ block: "center" });
      first.focus({ preventScroll: true });
    } else {
      formRef.current?.querySelector('[data-form-summary]')?.scrollIntoView({ block: "center" });
    }
  }, [focusTick]);

  const send = useCallback(
    (formData: FormData) => {
      setNetworkFailed(false);
      startTransition(async () => {
        try {
          const result = await action(state, formData);
          if (!result) return;
          setState(result);
          show(result.fieldErrors ?? {});
          submitted.current = true;
          if (result.status === "error") setFocusTick((n) => n + 1);
          onResult?.(result, formRef.current);
        } catch (error) {
          // A redirect from the server is not a failure: the router takes it from here.
          if (isRedirect(error)) throw error;
          setNetworkFailed(true);
          setFocusTick((n) => n + 1);
        }
      });
    },
    [action, state, show, onResult],
  );

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    lastData.current = formData;
    if (schema) {
      const found: Record<string, string> = {};
      for (const el of Array.from(form.elements)) {
        if (!isText(el) || !el.name || found[el.name]) continue;
        const message = check(el.name, el.value);
        if (message) found[el.name] = message;
      }
      if (Object.keys(found).length > 0) {
        submitted.current = true;
        show(found);
        setNetworkFailed(false);
        setState((s) => ({ ...s, status: "error", message: undefined, fieldErrors: found }));
        setFocusTick((n) => n + 1);
        return;
      }
    }
    send(formData);
  };

  const setFieldError = useCallback(
    (name: string, message?: string) => {
      if (errors[name] === message) return;
      const next = { ...errors };
      if (message) next[name] = message;
      else delete next[name];
      if (submitted.current) show(next);
      else setErrors(next);
    },
    [errors, show],
  );

  const onBlur = (event: React.FocusEvent<HTMLFormElement>) => {
    if (!isText(event.target) || !event.target.name || !schema?.shape[event.target.name]) return;
    setFieldError(event.target.name, check(event.target.name, event.target.value));
  };
  const onInput = (event: React.FormEvent<HTMLFormElement>) => {
    const el = event.target as Element;
    if (!isText(el) || !el.name || !errors[el.name]) return;
    // Once it is right the message goes; while it is still wrong it stays.
    setFieldError(el.name, schema?.shape[el.name] ? check(el.name, el.value) : undefined);
  };

  const count = summary.length;
  const box = (
    <div data-form-summary>
      {networkFailed ? (
        <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-600">
          <span>{NETWORK}</span>
          <Button type="button" variant="secondary" size="sm" loading={pending} onClick={() => lastData.current && send(lastData.current)}>
            Retry
          </Button>
        </div>
      ) : count > 0 ? (
        <div role="alert" className="mb-5 border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-600">
          <p className="font-medium">
            {prefix}
            Fix {count} {count === 1 ? "field" : "fields"} below:
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {summary.map((item) => (
              <li key={item.name}>
                {item.id ? (
                  <a
                    href={`#${item.id}`}
                    className="underline underline-offset-2"
                    onClick={(e) => {
                      e.preventDefault();
                      const el = document.getElementById(item.id as string);
                      el?.scrollIntoView({ block: "center" });
                      el?.focus({ preventScroll: true });
                    }}
                  >
                    {item.label}
                  </a>
                ) : (
                  item.label
                )}
                {item.message.startsWith(item.label) ? ` ${item.message.slice(item.label.length).trimStart()}` : `: ${item.message}`}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        state.status === "error" &&
        state.message && (
          <p role="alert" className="mb-5 border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-600">
            {state.message}
          </p>
        )
      )}
    </div>
  );

  return {
    state,
    pending,
    errors,
    setFieldError,
    summary: box,
    formProps: { ref: formRef, onSubmit, onBlur, onInput, noValidate: true } as const,
  };
}
