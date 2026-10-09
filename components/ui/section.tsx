import { cn } from "@/lib/utils";
import { Eyebrow } from "./eyebrow";

/**
 * The one section wrapper: the shared `container-fx` width and gutters, and
 * the shared vertical rhythm. Pages should not override the padding.
 */
export function Section({
  className,
  children,
  id,
}: {
  className?: string;
  children: React.ReactNode;
  id?: string;
}) {
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
