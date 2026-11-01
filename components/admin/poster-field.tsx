"use client";

import { useId, useRef, useState } from "react";
import { Label, FieldHint, FieldError } from "@/components/ui/field";
import { useFieldError } from "./admin-form";

const MAX_SIDE = 2000;
const MAX_BYTES = 2 * 1024 * 1024;

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Any common image: read here, shrunk to at most 2000 px as WEBP (or JPEG), under the storage limit. */
async function shrink(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5]) {
    const webp = await toBlob(canvas, "image/webp", quality);
    const blob = webp?.type === "image/webp" ? webp : await toBlob(canvas, "image/jpeg", quality);
    if (blob && blob.size <= MAX_BYTES) return new File([blob], blob.type === "image/webp" ? "poster.webp" : "poster.jpg", { type: blob.type });
  }
  throw new Error("too large");
}

export function PosterField({ name, label, currentUrl }: { name: string; label: string; currentUrl: string | null }) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const serverError = useFieldError(name);
  const [problem, setProblem] = useState("");
  const [working, setWorking] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    setProblem("");
    setPreview(null);
    if (!file) return;
    if (/svg/i.test(file.type) || /\.svgz?$/i.test(file.name) || !(file.type.startsWith("image/") || /\.(heic|heif|avif)$/i.test(file.name))) {
      input.value = "";
      return setProblem("This file isn't an image. Please choose a JPG, PNG, WEBP, GIF, BMP, HEIC or AVIF file.");
    }
    setWorking(true);
    try {
      const small = await shrink(file);
      const list = new DataTransfer();
      list.items.add(small);
      input.files = list.files;
      setPreview(URL.createObjectURL(small));
    } catch {
      input.value = "";
      setProblem("This picture could not be read here. Please try a JPG or PNG.");
    } finally {
      setWorking(false);
    }
  }

  const shown = preview ?? currentUrl;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {shown && (
        // eslint-disable-next-line @next/next/no-img-element -- a local preview or a storage address
        <img src={shown} alt="" className="mb-2 max-h-48 w-auto border border-line" data-poster-preview />
      )}
      <input ref={inputRef} id={id} name={name} type="file" accept="image/*,.heic,.heif,.avif" onChange={(e) => void choose(e)} className="block w-full text-sm text-ink" />
      <FieldHint>{working ? "Shrinking the picture…" : "Any common image. It is shrunk to at most 2000 px."}</FieldHint>
      <FieldError>{problem || serverError}</FieldError>
    </div>
  );
}
