import { cn } from "@/lib/utils";
import { Eyebrow } from "./eyebrow";

/**
 * Full-width backgrounds a section can sit on (see "bands" in globals.css).
 *  - surface / tint: white and pale-blue bands in the light theme; clear in
 *    the dark theme, where the home page's scene shows through instead.
 *  - navy: the deep-navy brand band, the same in both themes.
 */
type Band = "surface" | "tint" | "navy";

const bandClass: Record<Band, string> = {
  surface: "band--surface",
  tint: "band--tint",
  navy: "on-navy",
};

/**
 * The one section wrapper: the shared `container-fx` width and gutters, and
 * the shared vertical rhythm. With `band`, the background runs edge to edge
 * while the content stays on the container.
 */
export function Section({
  className,
  children,
  id,
  band,
}: {
  className?: string;
  children: React.ReactNode;
  id?: string;
  band?: Band;
}) {
  if (band) {
    return (
      <section id={id} className={bandClass[band]}>
        <div className={cn("container-fx py-16 md:py-24", className)}>{children}</div>
      </section>
    );
  }
  return (
    <section id={id} className={cn("container-fx py-16 md:py-24", className)}>
      {children}
    </section>
  );
}

/**
 * The one section-heading pattern: eyebrow, h2, optional description, always
 * left-aligned on the container edge. `index` adds the section number and
 * hairline; `action` sits on the heading's baseline at the right.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  index,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  index?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-10 md:mb-14">
      {eyebrow && <Eyebrow index={index}>{eyebrow}</Eyebrow>}
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="max-w-2xl">
          <h2 className="font-serif text-2xl md:text-3xl lg:text-4xl tracking-tight text-ink leading-tight">{title}</h2>
          {description && <p className="mt-4 text-ink/70 leading-relaxed">{description}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}
