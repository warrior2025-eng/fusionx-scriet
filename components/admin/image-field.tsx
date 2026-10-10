"use client";

import { useEffect, useRef, useState } from "react";
import { Label, FieldError, FieldHint } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { useFieldError } from "./admin-form";

const SQUARE = 512;

/** Centre-crops an image to a square and re-encodes it, entirely in the browser. */
async function cropSquare(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SQUARE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SQUARE, SQUARE);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
  if (!blob) return file;
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webp`, { type: "image/webp" });
}

/**
 * Image upload with a live preview and a "remove" option. With `square`, the
 * chosen file is cropped to 512×512 before it is submitted. The server action
 * validates type and size again; nothing here is trusted.
 *
 * Submits the file under `name`, and `${name}__remove=on` when the current
 * image should be deleted.
 */
export function ImageField({
  name,
  label,
  hint,
  currentUrl,
  square,
  accept = "image/jpeg,image/png,image/webp",
  className,
}: {
  name: string;
  label: string;
  hint?: string;
  currentUrl: string | null;
  square?: boolean;
  accept?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const serverError = useFieldError(name);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    setLocalError(null);
    if (!file) return setPreview(null);
    if (!accept.split(",").includes(file.type)) {
      input.value = "";
      setPreview(null);
      return setLocalError("That file type isn't allowed here.");
    }
    let chosen = file;
    if (square) {
      try {
        chosen = await cropSquare(file);
        const transfer = new DataTransfer();
        transfer.items.add(chosen);
        input.files = transfer.files;
      } catch {
        // Cropping is a convenience; if the browser can't, the original is sent.
      }
    }
    setRemove(false);
    setPreview(URL.createObjectURL(chosen));
  }

  const shown = preview ?? (remove ? null : currentUrl);

  return (
    <div className={className}>
      <Label htmlFor={name}>{label}</Label>
      <div className="flex flex-wrap items-start gap-4">
        <div
          className={cn(
            "flex shrink-0 items-center justify-center overflow-hidden border border-line bg-paper text-xs text-ink/45",
            square ? "h-24 w-24 rounded-full" : "h-24 w-40",
          )}
        >
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview or an already-public URL
            <img src={shown} alt="" className="h-full w-full object-cover" />
          ) : (
            "No image"
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <input
            ref={inputRef}
            id={name}
            name={name}
            type="file"
            accept={accept}
            onChange={onChange}
            className="block w-full text-sm text-ink/80 file:mr-3 file:cursor-pointer file:border file:border-ink/30 file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
          />
          {currentUrl && !preview && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink/80">
              <input
                type="checkbox"
                name={`${name}__remove`}
                checked={remove}
                onChange={(e) => setRemove(e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              Remove the current image
            </label>
          )}
          {preview && (
            <button
              type="button"
              className="text-sm font-medium text-ink underline underline-offset-2"
              onClick={() => {
                if (inputRef.current) inputRef.current.value = "";
                setPreview(null);
              }}
            >
              Discard the new image
            </button>
          )}
          {hint && <FieldHint>{hint}</FieldHint>}
          <FieldError>{localError ?? serverError}</FieldError>
        </div>
      </div>
    </div>
  );
}
