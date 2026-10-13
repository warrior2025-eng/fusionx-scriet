"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label, FieldError, FieldHint } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { useFieldError } from "./admin-form";

const SQUARE = 512;
/** Side of the crop window on screen, in CSS pixels. */
const VIEW = 256;
const MAX_ZOOM = 4;

/**
 * Where the crop sits on the picture: `zoom` (1 = the largest square that
 * fits) and the picture point shown at the centre of the window, as a
 * fraction of its width and height.
 */
type Crop = { zoom: number; cx: number; cy: number };
type Source = { file: File; url: string; width: number; height: number };

const CENTRED: Crop = { zoom: 1, cx: 0.5, cy: 0.5 };

/** Keeps the crop window inside the picture. */
function clampCrop(crop: Crop, source: Source): Crop {
  const zoom = Math.min(Math.max(crop.zoom, 1), MAX_ZOOM);
  const side = Math.min(source.width, source.height) / zoom;
  const halfX = side / 2 / source.width;
  const halfY = side / 2 / source.height;
  return {
    zoom,
    cx: Math.min(Math.max(crop.cx, halfX), 1 - halfX),
    cy: Math.min(Math.max(crop.cy, halfY), 1 - halfY),
  };
}

/** Cuts the chosen square out of the picture and re-encodes it, entirely in the browser. */
async function cropSquare(source: Source, crop: Crop): Promise<File> {
  const bitmap = await createImageBitmap(source.file);
  const side = Math.min(bitmap.width, bitmap.height) / crop.zoom;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SQUARE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, crop.cx * bitmap.width - side / 2, crop.cy * bitmap.height - side / 2, side, side, 0, 0, SQUARE, SQUARE);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
  if (!blob) throw new Error("no blob");
  return new File([blob], `${source.file.name.replace(/\.[^.]+$/, "")}.webp`, { type: "image/webp" });
}

/**
 * Image upload with a live preview and a "remove" option. With `square`, the
 * chosen picture opens in a crop window: drag it into place, zoom, and the
 * selected square (512×512) is what gets submitted. The server action
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  // The picture as it was chosen (kept so the crop can be adjusted again),
  // the crop being edited in the window, and the crop that was last applied.
  const [source, setSource] = useState<Source | null>(null);
  const [crop, setCrop] = useState<Crop>(CENTRED);
  const [applied, setApplied] = useState<Crop | null>(null);
  const [working, setWorking] = useState(false);
  const serverError = useFieldError(name);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  useEffect(() => () => void (source && URL.revokeObjectURL(source.url)), [source]);

  function discard() {
    if (inputRef.current) inputRef.current.value = "";
    setPreview(null);
    setSource(null);
    setApplied(null);
  }

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    setLocalError(null);
    if (!file) return discard();
    if (!accept.split(",").includes(file.type)) {
      discard();
      return setLocalError("That file type isn't allowed here.");
    }
    setRemove(false);
    if (!square) {
      setSource(null);
      return setPreview(URL.createObjectURL(file));
    }
    try {
      const bitmap = await createImageBitmap(file);
      const next = { file, url: URL.createObjectURL(file), width: bitmap.width, height: bitmap.height };
      bitmap.close();
      setSource(next);
      setCrop(CENTRED);
      setApplied(null);
      setPreview(null);
      dialogRef.current?.showModal();
    } catch {
      // Cropping is a convenience; if the browser can't read the picture, the original is sent.
      setSource(null);
      setPreview(URL.createObjectURL(file));
    }
  }

  async function applyCrop() {
    if (!source || !inputRef.current) return;
    setWorking(true);
    try {
      const fixed = clampCrop(crop, source);
      const file = await cropSquare(source, fixed);
      const transfer = new DataTransfer();
      transfer.items.add(file);
      inputRef.current.files = transfer.files;
      setApplied(fixed);
      setPreview(URL.createObjectURL(file));
      dialogRef.current?.close();
    } catch {
      setLocalError("This picture could not be cropped. Try another one.");
      dialogRef.current?.close();
    } finally {
      setWorking(false);
    }
  }

  // Closing the window without applying: a picture that was never cropped is
  // dropped; one that already was keeps its last crop.
  function onDialogClose() {
    if (applied) setCrop(applied);
    else if (source) discard();
  }

  const move = (dx: number, dy: number) =>
    source &&
    setCrop((now) => {
      const scale = (VIEW / Math.min(source.width, source.height)) * now.zoom;
      return clampCrop({ ...now, cx: now.cx - dx / (source.width * scale), cy: now.cy - dy / (source.height * scale) }, source);
    });

  function onKeyDown(event: React.KeyboardEvent) {
    const step = event.shiftKey ? 20 : 5;
    // The picture moves the way the arrow points, like dragging it.
    const by = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (!by) return;
    event.preventDefault();
    move(by[0], by[1]);
  }

  const shown = preview ?? (remove ? null : currentUrl);
  // The picture's size and place inside the crop window.
  const scale = source ? (VIEW / Math.min(source.width, source.height)) * crop.zoom : 1;
  const frame = source && {
    width: source.width * scale,
    height: source.height * scale,
    left: VIEW / 2 - crop.cx * source.width * scale,
    top: VIEW / 2 - crop.cy * source.height * scale,
  };

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
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {source && applied && (
                <button
                  type="button"
                  className="text-sm font-medium text-ink underline underline-offset-2"
                  onClick={() => dialogRef.current?.showModal()}
                >
                  Adjust crop
                </button>
              )}
              <button type="button" className="text-sm font-medium text-ink underline underline-offset-2" onClick={discard}>
                Discard the new image
              </button>
            </div>
          )}
          {hint && <FieldHint>{hint}</FieldHint>}
          <FieldError>{localError ?? serverError}</FieldError>
        </div>
      </div>

      {square && (
        <dialog
          ref={dialogRef}
          onClose={onDialogClose}
          aria-label={`Crop: ${label}`}
          className="m-auto w-[min(22rem,calc(100vw-2rem))] border border-line bg-surface p-4 text-ink backdrop:bg-black/60 sm:p-5"
        >
          {source && frame && (
            <>
              <p className="font-serif text-lg text-ink">Crop the picture</p>
              <p className="mt-1 text-sm text-ink/70">Drag the picture into place and use the slider to zoom. The circle shows how it appears on the site.</p>

              <div
                role="group"
                tabIndex={0}
                aria-label="Picture position. Drag, or use the arrow keys, to move it."
                onKeyDown={onKeyDown}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  dragRef.current = { x: e.clientX, y: e.clientY };
                }}
                onPointerMove={(e) => {
                  const last = dragRef.current;
                  if (!last) return;
                  dragRef.current = { x: e.clientX, y: e.clientY };
                  move(e.clientX - last.x, e.clientY - last.y);
                }}
                onPointerUp={() => (dragRef.current = null)}
                onPointerCancel={() => (dragRef.current = null)}
                className="relative mx-auto mt-4 cursor-grab touch-none select-none overflow-hidden bg-paper active:cursor-grabbing"
                style={{ width: VIEW, height: VIEW }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob of the chosen file */}
                <img src={source.url} alt="" draggable={false} className="pointer-events-none absolute max-w-none" style={frame} />
                {/* Everything outside the circle is dimmed. */}
                <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,3,13,0.55)] ring-1 ring-white/80" />
              </div>

              <label className="mt-4 block text-sm text-ink">
                Zoom
                <input
                  type="range"
                  min={1}
                  max={MAX_ZOOM}
                  step={0.01}
                  value={crop.zoom}
                  onChange={(e) => setCrop((now) => clampCrop({ ...now, zoom: Number(e.target.value) }, source))}
                  className="mt-1 block w-full accent-accent"
                />
              </label>

              <div className="mt-5 flex flex-wrap justify-end gap-3">
                <Button type="button" variant="secondary" size="sm" onClick={() => dialogRef.current?.close()}>
                  Cancel
                </Button>
                <Button type="button" size="sm" loading={working} onClick={applyCrop}>
                  Use this crop
                </Button>
              </div>
            </>
          )}
        </dialog>
      )}
    </div>
  );
}
