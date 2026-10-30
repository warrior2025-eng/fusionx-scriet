"use client";

import { useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/button";
import { toast } from "./toast";

/** Asks the server for the PDF, shows why if it cannot, and saves the file. Works the same on a phone. */
async function savePdf(url: string) {
  let res: Response;
  try {
    res = await fetch(url, { credentials: "same-origin" });
  } catch {
    toast("error", "Could not make the PDF. Check your connection and try again.");
    return;
  }
  if (res.status === 413) return toast("error", await res.text());
  if (res.status === 403) return toast("error", "You don't have permission to do this.");
  // Signed out on the way, or anything else that is not the file.
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("application/pdf")) {
    return toast("error", "Could not make the PDF. Reload the page and try again.");
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "fusionx-export.pdf";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 30_000);
}

function PdfButton({ onPick, label = "PDF", variant = "secondary" }: { onPick: (button: HTMLButtonElement) => Promise<void>; label?: string; variant?: "secondary" | "ghost" }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      disabled={busy}
      aria-busy={busy}
      onClick={async (e) => {
        const button = e.currentTarget;
        setBusy(true);
        await onPick(button);
        setBusy(false);
      }}
    >
      {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <FileText size={14} aria-hidden />}
      {busy ? "Making PDF…" : label}
    </Button>
  );
}

/** "Download: CSV · PDF" for one export route. `href` is its CSV address, filters included. */
export function ExportButtons({ href, label = "Download", variant = "secondary" }: { href: string; label?: string; variant?: "secondary" | "ghost" }) {
  const pdf = `${href}${href.includes("?") ? "&" : "?"}format=pdf`;
  return (
    <span className="inline-flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      <span className="text-sm text-ink/70">{label}:</span>
      <LinkButton href={href} variant={variant} size="sm">
        <Download size={14} aria-hidden /> CSV
      </LinkButton>
      <PdfButton onPick={() => savePdf(pdf)} variant={variant} />
    </span>
  );
}

/** A PDF button inside a GET form: takes the form's current filters. */
export function FormPdfButton({ action, label, extra }: { action: string; label: string; extra?: Record<string, string> }) {
  return (
    <PdfButton
      label={label}
      onPick={async (button) => {
        const query = new URLSearchParams();
        if (button.form) for (const [k, v] of new FormData(button.form)) if (typeof v === "string") query.set(k, v);
        for (const [k, v] of Object.entries(extra ?? {})) query.set(k, v);
        query.set("format", "pdf");
        await savePdf(`${action}?${query}`);
      }}
    />
  );
}
