/**
 * The theme preview is a working page for choosing a design, not part of the
 * site. It opens on a developer's machine (`npm run dev`) and on Vercel
 * preview deployments; on the production site it is a 404.
 */
export function previewAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview";
}

export const OPTIONS = {
  a: { name: "Crisp Blue", note: "Blue-white canvas, white cards, daylight hero, one navy brand band." },
  b: { name: "Ink & Blue", note: "Navy header, hero and footer framing bright white content; bolder headings." },
} as const;

export type OptionKey = keyof typeof OPTIONS;
