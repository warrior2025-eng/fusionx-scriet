import { Download } from "lucide-react";

/** The results poster, above the lists: tap for full size, or download it. */
export function ResultsPoster({ url, alt }: { url: string; alt: string | null }) {
  const download = `${url}${url.includes("?") ? "&" : "?"}download=fusionx-results-poster`;
  return (
    <figure className="mb-8" data-results-poster>
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element -- a storage address, any size */}
        <img src={url} alt={alt || "FusionX selection results"} className="mx-auto h-auto max-h-[80vh] w-auto max-w-full border border-line" />
      </a>
      <figcaption className="mt-3 text-center">
        <a href={download} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent underline underline-offset-2">
          <Download size={14} aria-hidden /> Download poster
        </a>
      </figcaption>
    </figure>
  );
}
