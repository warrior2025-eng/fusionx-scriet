"use client";

import { createContext, useContext, useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea, FieldError, FieldHint } from "@/components/ui/field";
import { IDLE, type ActionState } from "@/lib/admin/action-state";
import type { FieldDef } from "@/lib/admin/entities";
import { cn } from "@/lib/utils";
import { ImageField } from "./image-field";
import { toastResult } from "./toast";

const FormContext = createContext<{ errors: Record<string, string>; pending: boolean }>({ errors: {}, pending: false });

/** The validation error for a field of the surrounding <AdminForm>, if any. */
export function useFieldError(name: string) {
  return useContext(FormContext).errors[name];
}

/**
 * The form every admin write goes through. Calls the server action directly
 * (so a failed save keeps what was typed), shows inline field errors and a
 * toast, disables itself while saving, and warns before leaving with unsaved
 * changes.
 */
export function AdminForm({
  action,
  children,
  submitLabel = "Save changes",
  className,
  secondary,
  warnUnsaved = true,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submitLabel?: string;
  className?: string;
  /** Extra controls beside the submit button (e.g. a Cancel link). */
  secondary?: React.ReactNode;
  /** Off for forms that act on a selection rather than edit a record. */
  warnUnsaved?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<ActionState>(IDLE);
  const [dirty, setDirty] = useState(false);
  // Bumped after each successful save so the fields remount on the freshly
  // saved values (clearing file inputs and image previews).
  const [version, setVersion] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await action(state, formData);
      setState(result);
      toastResult(result);
      if (result.status === "success") {
        setDirty(false);
        setVersion((v) => v + 1);
        if (result.redirectTo) router.push(result.redirectTo);
        else router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} onChange={warnUnsaved ? () => setDirty(true) : undefined} noValidate className={className}>
      <FormContext value={{ errors: state.fieldErrors ?? {}, pending }}>
        <fieldset key={version} disabled={pending} className="min-w-0 space-y-5">
          {children}
        </fieldset>
      </FormContext>

      {state.status === "error" && state.message && (
        <p role="alert" className="mt-5 border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-600">
          {state.message}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
        {secondary}
        {dirty && !pending && <span className="text-sm text-ink/60">Unsaved changes</span>}
      </div>
    </form>
  );
}

/** Label + control + hint + inline error, wired to the surrounding form. */
export function Field({
  name,
  label,
  hint,
  children,
  className,
  htmlFor,
}: {
  name: string;
  label?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  const error = useFieldError(name);
  return (
    <div className={className}>
      {label && <Label htmlFor={htmlFor ?? name}>{label}</Label>}
      {children}
      {hint && !error && <FieldHint>{hint}</FieldHint>}
      <FieldError>{error}</FieldError>
    </div>
  );
}

export function TextField({
  name,
  label,
  hint,
  className,
  ...props
}: { name: string; label: string; hint?: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const error = useFieldError(name);
  return (
    <Field name={name} label={label} hint={hint} className={className}>
      <Input id={name} name={name} aria-invalid={error ? true : undefined} {...props} />
    </Field>
  );
}

/** Textarea with an optional live character counter. */
export function TextareaField({
  name,
  label,
  hint,
  max,
  counter,
  defaultValue = "",
  rows = 4,
  className,
}: {
  name: string;
  label: string;
  hint?: string;
  max?: number;
  counter?: boolean;
  defaultValue?: string;
  rows?: number;
  className?: string;
}) {
  const error = useFieldError(name);
  const [length, setLength] = useState(defaultValue.length);
  return (
    <Field name={name} label={label} hint={hint} className={className}>
      <Textarea
        id={name}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        onChange={counter ? (e) => setLength(e.target.value.length) : undefined}
      />
      {counter && max && (
        <p className={cn("mt-1 text-right text-xs tabular-nums", length > max ? "text-red-600" : "text-ink/50")}>
          {length} / {max}
        </p>
      )}
    </Field>
  );
}

export function SelectField({
  name,
  label,
  hint,
  options,
  defaultValue,
  className,
}: {
  name: string;
  label: string;
  hint?: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  className?: string;
}) {
  return (
    <Field name={name} label={label} hint={hint} className={className}>
      <Select id={name} name={name} defaultValue={defaultValue}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function CheckboxField({
  name,
  label,
  hint,
  defaultChecked,
  className,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
  className?: string;
}) {
  const id = useId();
  const error = useFieldError(name);
  return (
    <div className={className}>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
        <input
          id={id}
          name={name}
          type="checkbox"
          defaultChecked={defaultChecked}
          className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
        />
        <span>
          <span className="block text-sm font-medium text-ink">{label}</span>
          {hint && <span className="block text-xs text-ink/55">{hint}</span>}
        </span>
      </label>
      <FieldError>{error}</FieldError>
    </div>
  );
}

/** Renders an entity's fields (lib/admin/entities.ts) with their current values. */
export function EntityFields({ fields, values }: { fields: FieldDef[]; values: Record<string, unknown> | null }) {
  const current = (f: FieldDef) => {
    const stored = values?.[f.column ?? f.name];
    return stored === undefined || stored === null ? (values ? "" : (f.initial ?? "")) : stored;
  };

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {fields.map((f) => {
        const span = f.half ? "" : "sm:col-span-2";
        const value = current(f);
        switch (f.type) {
          case "image":
            return (
              <ImageField
                key={f.name}
                name={f.name}
                label={f.label}
                hint={f.hint}
                square={f.square}
                currentUrl={typeof value === "string" && value ? value : null}
                className={span}
              />
            );
          case "textarea":
            return (
              <TextareaField
                key={f.name}
                name={f.name}
                label={f.label}
                hint={f.hint}
                max={f.max}
                counter={f.counter}
                rows={f.rows}
                defaultValue={String(value)}
                className={span}
              />
            );
          case "lines":
            return (
              <TextareaField
                key={f.name}
                name={f.name}
                label={f.label}
                hint={f.hint}
                rows={f.rows ?? 5}
                defaultValue={Array.isArray(value) ? value.join("\n") : ""}
                className={span}
              />
            );
          case "tags":
            return (
              <TextField
                key={f.name}
                name={f.name}
                label={f.label}
                hint={f.hint}
                defaultValue={Array.isArray(value) ? value.join(", ") : ""}
                className={span}
              />
            );
          case "select":
            return (
              <SelectField
                key={f.name}
                name={f.name}
                label={f.label}
                hint={f.hint}
                options={f.options ?? []}
                defaultValue={String(value)}
                className={span}
              />
            );
          case "checkbox":
            return (
              <CheckboxField
                key={f.name}
                name={f.name}
                label={f.label}
                hint={f.hint}
                defaultChecked={values ? Boolean(value) : Boolean(f.initial)}
                className={span}
              />
            );
          default:
            return (
              <TextField
                key={f.name}
                name={f.name}
                label={f.required ? f.label : `${f.label} (optional)`}
                hint={f.hint}
                placeholder={f.placeholder}
                type={
                  f.type === "date" ? "date" : f.type === "time" ? "time" : f.type === "number" ? "number" : f.type === "email" ? "email" : f.type === "url" ? "url" : "text"
                }
                min={f.type === "number" ? 0 : undefined}
                maxLength={f.max}
                defaultValue={f.type === "time" ? String(value).slice(0, 5) : String(value)}
                className={span}
              />
            );
        }
      })}
    </div>
  );
}
