/**
 * The theme preview is a working page for choosing a design, not part of the
 * site. It opens on a developer's machine (`npm run dev`) and on Vercel
 * preview deployments; on the production site it is a 404.
 */
export function previewAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview";
}

/**
 * The candidates. `hero` is what the home hero sits on: the daylight scene,
 * or the night scene on a dark band. `join` is the ground of the Join band.
 */
export const OPTIONS = {
  a: {
    name: "Crisp Blue",
    note: "Blue-white canvas, white cards, daylight hero, one navy brand band, white footer.",
    hero: "day",
    join: "navy",
  },
  b: {
    name: "Ink & Blue",
    note: "Navy header, night hero and navy footer framing bright white content; bolder headings; blue Join band.",
    hero: "night",
    join: "navy",
  },
  c: {
    name: "Royal Blue",
    note: "White header, hero washed in royal blue, labels and steps in solid blue, blue Join band, navy footer.",
    hero: "night",
    join: "navy",
  },
  d: {
    name: "Airy White",
    note: "All white and open: flat outlined cards, no dark surfaces, pale-blue Join band and footer.",
    hero: "day",
    join: "tint",
  },
  e: {
    name: "Crisp + Night",
    note: "Option A's page with the night hero on top and a navy footer; the header stays white.",
    hero: "night",
    join: "navy",
  },
} as const;

export type OptionKey = keyof typeof OPTIONS;
