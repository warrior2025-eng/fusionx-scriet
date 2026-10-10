"use client";

/** A header checkbox that ticks every checkbox called `name` in its form. */
export function SelectAll({ name, label }: { name: string; label: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      className="h-4 w-4 accent-accent"
      onChange={(event) => {
        const { form, checked } = event.currentTarget;
        form?.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${name}"]`).forEach((box) => {
          box.checked = checked;
        });
      }}
    />
  );
}
