"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Input, Label, Select, FieldError, FieldHint } from "@/components/ui/field";
import { useFieldError } from "./admin-form";

type Column = {
  key: string;
  label: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
};
type Item = Record<string, string>;
type Keyed = { id: number; item: Item };

const iconButton =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-ink/65 hover:bg-ink/5 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";

/**
 * An editable, ordered list: add, remove, move up / down. Each row has one
 * input (or select) per column.
 *
 * Uncontrolled by default: the list is submitted as JSON in a hidden input
 * called `name` — an array of strings when `flat`, otherwise of objects.
 * Pass `onChange` to control it from a parent instead (see FooterEditor).
 */
export function RowsEditor({
  name,
  label,
  hint,
  columns,
  initial,
  flat,
  addLabel = "Add",
  max = 12,
  onChange,
}: {
  name: string;
  label?: string;
  hint?: string;
  columns: Column[];
  initial: Item[] | string[];
  flat?: boolean;
  addLabel?: string;
  max?: number;
  onChange?: (items: Item[]) => void;
}) {
  const baseId = useId();
  const error = useFieldError(name);
  const [rows, setRows] = useState<Keyed[]>(() =>
    initial.map((entry, i) => ({ id: i, item: typeof entry === "string" ? { [columns[0].key]: entry } : { ...entry } })),
  );
  const [nextId, setNextId] = useState(initial.length);

  function commit(next: Keyed[]) {
    setRows(next);
    onChange?.(next.map((r) => r.item));
  }
  const blank = (): Item =>
    Object.fromEntries(columns.map((c) => [c.key, c.options ? c.options[0].value : ""]));

  function move(index: number, by: -1 | 1) {
    const next = [...rows];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    commit(next);
  }

  const serialized = JSON.stringify(flat ? rows.map((r) => r.item[columns[0].key] ?? "") : rows.map((r) => r.item));

  return (
    <div>
      {label && <Label>{label}</Label>}
      {!onChange && <input type="hidden" name={name} value={serialized} />}
      <ol className="space-y-2">
        {rows.map((row, index) => (
          <li key={row.id} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-right text-xs tabular-nums text-ink/45">{index + 1}</span>
            <div className="grid min-w-0 flex-1 gap-2" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
              {columns.map((column) => {
                const id = `${baseId}-${row.id}-${column.key}`;
                const set = (value: string) =>
                  commit(rows.map((r) => (r.id === row.id ? { ...r, item: { ...r.item, [column.key]: value } } : r)));
                return column.options ? (
                  <Select
                    key={column.key}
                    id={id}
                    aria-label={`${column.label} ${index + 1}`}
                    value={row.item[column.key] ?? ""}
                    onChange={(e) => set(e.target.value)}
                  >
                    {column.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    key={column.key}
                    id={id}
                    aria-label={`${column.label} ${index + 1}`}
                    placeholder={column.placeholder ?? column.label}
                    value={row.item[column.key] ?? ""}
                    onChange={(e) => set(e.target.value)}
                  />
                );
              })}
            </div>
            <button type="button" className={iconButton} aria-label={`Move item ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}>
              <ChevronUp size={16} />
            </button>
            <button
              type="button"
              className={iconButton}
              aria-label={`Move item ${index + 1} down`}
              disabled={index === rows.length - 1}
              onClick={() => move(index, 1)}
            >
              <ChevronDown size={16} />
            </button>
            <button
              type="button"
              className={`${iconButton} hover:bg-red-500/10 hover:text-red-600`}
              aria-label={`Remove item ${index + 1}`}
              onClick={() => commit(rows.filter((r) => r.id !== row.id))}
            >
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        disabled={rows.length >= max}
        onClick={() => {
          commit([...rows, { id: nextId, item: blank() }]);
          setNextId(nextId + 1);
        }}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-ink underline-offset-2 hover:underline disabled:opacity-40"
      >
        <Plus size={15} /> {addLabel}
      </button>
      {hint && !error && <FieldHint>{hint}</FieldHint>}
      <FieldError>{error}</FieldError>
    </div>
  );
}

type FooterColumn = { heading: string; links: { label: string; href: string }[] };

/** Footer link columns: each has a heading and an ordered list of links. */
export function FooterEditor({ name, initial }: { name: string; initial: FooterColumn[] }) {
  const error = useFieldError(name);
  const [columns, setColumns] = useState(() => initial.map((column, i) => ({ id: i, ...column })));
  const [nextId, setNextId] = useState(initial.length);

  const value = JSON.stringify(columns.map(({ heading, links }) => ({ heading, links })));

  return (
    <div className="space-y-6">
      <input type="hidden" name={name} value={value} />
      {columns.map((column, index) => (
        <div key={column.id} className="border border-line p-4 sm:p-5">
          <div className="mb-4 flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <Label htmlFor={`footer-heading-${column.id}`}>Column {index + 1} heading</Label>
              <Input
                id={`footer-heading-${column.id}`}
                value={column.heading}
                onChange={(e) =>
                  setColumns(columns.map((c) => (c.id === column.id ? { ...c, heading: e.target.value } : c)))
                }
              />
            </div>
            <button
              type="button"
              className={`${iconButton} hover:bg-red-500/10 hover:text-red-600`}
              aria-label={`Remove column ${index + 1}`}
              disabled={columns.length <= 1}
              onClick={() => setColumns(columns.filter((c) => c.id !== column.id))}
            >
              <Trash2 size={15} />
            </button>
          </div>
          <RowsEditor
            name={`${name}-${column.id}`}
            columns={[
              { key: "label", label: "Label" },
              { key: "href", label: "Link", placeholder: "/about or https://…" },
            ]}
            initial={column.links}
            addLabel="Add link"
            max={10}
            onChange={(links) =>
              setColumns((current) =>
                current.map((c) => (c.id === column.id ? { ...c, links: links as FooterColumn["links"] } : c)),
              )
            }
          />
        </div>
      ))}
      <button
        type="button"
        disabled={columns.length >= 4}
        onClick={() => {
          setColumns([...columns, { id: nextId, heading: "", links: [] }]);
          setNextId(nextId + 1);
        }}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink underline-offset-2 hover:underline disabled:opacity-40"
      >
        <Plus size={15} /> Add column
      </button>
      <FieldError>{error}</FieldError>
    </div>
  );
}
