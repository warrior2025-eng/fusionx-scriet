"use client";

import { createContext, useContext, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea, FieldError, FieldHint } from "@/components/ui/field";
import { useFormSubmit } from "@/components/ui/form-errors";
import { LinkInput } from "@/components/ui/link-input";
import { IDLE, type ActionState } from "@/lib/admin/action-state";
import { fieldSchema, type FieldDef } from "@/lib/admin/entities";
import type { LinkKind } from "@/lib/validation/link";
import { toIstInput } from "@/lib/events/format";
import { cn } from "@/lib/utils";
import { ImageField } from "./image-field";
import { toastResult } from "./toast";
import { UserField } from "./user-field";

const FormContext = createContext<{ errors: Record<string, string>; pending: boolean; setFieldError: (name: string, message?: string) => void }>({
  errors: {},
  pending: false,
  setFieldError: () => {},
});

/** The validation error for a field of the surrounding <AdminForm>, if any. */
export function useFieldError(name: string) {
  return useContext(FormContext).errors[name];
}

/**
 * The form every admin write goes through. Calls the server action directly
 * (so a failed save keeps what was typed), shows every field's error with a
 * summary above and a toast, disables itself while saving, and warns before
 * leaving with unsaved changes.
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
  const [dirty, setDirty] = useState(false);
  // Bumped after each successful save so the fields remount on the freshly
  // saved values (clearing file inputs and image previews).
  const [version, setVersion] = useState(0);
  const { pending, errors, setFieldError, summary, formProps } = useFormSubmit(action, IDLE, {
    onResult: (result) => {
      toastResult(result);
      if (result.status === "success") {
        setDirty(false);
        setVersion((v) => v + 1);
        if (result.redirectTo) router.push(result.redirectTo);
        else router.refresh();
      }
    },
  });

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <form {...formProps} onChange={warnUnsaved ? () => setDirty(true) : undefined} className={className}>
      {summary}
      <FormContext value={{ errors, pending, setFieldError }}>
        <fieldset key={version} disabled={pending} className="min-w-0 space-y-5">
          {children}
        </fieldset>
      </FormContext>

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
      <FieldError id={`${htmlFor ?? name}-error`}>{error}</FieldError>
    </div>
  );
}

/** A link that fixes itself (components/ui/link-input.tsx), wired to the surrounding form. */
export function LinkField({
  name,
  label,
  hint,
  kind = "any",
  allowPath,
  allowMailto,
  className,
  ...props
}: { name: string; label: string; hint?: string; kind?: LinkKind; allowPath?: boolean; allowMailto?: boolean; className?: string } & Omit<React.ComponentProps<typeof LinkInput>, "label" | "kind" | "error">) {
  const error = useFieldError(name);
  const generated = useId();
  const id = props.id ?? `${name}-${generated}`;
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <LinkInput {...props} id={id} name={name} kind={kind} label={label.replace(/\s*\(optional\)\s*$/i, "")} allowPath={allowPath} allowMailto={allowMailto} error={error} />
      {hint && !error && <FieldHint>{hint}</FieldHint>}
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
  // Unique per field, so a page with several forms using the same names keeps each label on its own input.
  const generated = useId();
  const id = props.id ?? `${name}-${generated}`;
  return (
    <Field name={name} label={label} hint={hint} className={className} htmlFor={id}>
      <Input name={name} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} {...props} id={id} />
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
  const id = `${name}-${useId()}`;
  return (
    <Field name={name} label={label} hint={hint} className={className} htmlFor={id}>
      <Textarea
        id={id}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
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
  const id = `${name}-${useId()}`;
  return (
    <Field name={name} label={label} hint={hint} className={className} htmlFor={id}>
      <Select id={id} name={name} defaultValue={defaultValue}>
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
  const { setFieldError } = useContext(FormContext);
  // The server's rules, as the person leaves a field.
  const checkField = (event: React.FocusEvent<HTMLDivElement>) => {
    const target = event.target as unknown as HTMLInputElement;
    const f = fields.find((x) => x.name === target.name);
    if (!f || ["image", "checkbox", "tags", "lines", "user"].includes(f.type)) return;
    const result = fieldSchema(f).safeParse(target.value);
    setFieldError(f.name, result.success ? undefined : result.error.issues[0]?.message);
  };
  const current = (f: FieldDef) => {
    const stored = values?.[f.column ?? f.name];
    return stored === undefined || stored === null ? (values ? "" : (f.initial ?? "")) : stored;
  };

  return (
    <div className="grid gap-5 sm:grid-cols-2" onBlur={checkField}>
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
          case "url":
            return (
              <LinkField
                key={f.name}
                name={f.name}
                label={f.required ? f.label : `${f.label} (optional)`}
                hint={f.hint}
                kind={f.linkKind}
                allowMailto={f.allowMailto}
                placeholder={f.placeholder}
                defaultValue={String(value)}
                className={span}
              />
            );
          case "user":
            return <UserField key={f.name} name={f.name} label={f.label} hint={f.hint} defaultValue={String(value)} className={span} />;
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
                  f.type === "date" ? "date" : f.type === "datetime" ? "datetime-local" : f.type === "time" ? "time" : f.type === "number" ? "number" : f.type === "email" ? "email" : "text"
                }
                min={f.type === "number" ? 0 : undefined}
                maxLength={f.max}
                defaultValue={
                  f.type === "time" ? String(value).slice(0, 5) : f.type === "datetime" ? toIstInput(String(value)) : String(value)
                }
                className={span}
              />
            );
        }
      })}
    </div>
  );
}
