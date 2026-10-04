import { cn } from "@/lib/utils";

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
    <section id={id} className={cn("mx-auto max-w-6xl px-6 md:px-10 py-14 md:py-20", className)}>
      {children}
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="max-w-2xl mb-8 md:mb-12">
      {eyebrow && (
        <p className="text-xs font-semibold tracking-[0.14em] uppercase text-accent mb-3">{eyebrow}</p>
      )}
      <h2 className="font-serif text-2xl md:text-3xl lg:text-4xl tracking-tight text-ink leading-tight">{title}</h2>
      {description && <p className="mt-4 text-ink/55 leading-relaxed">{description}</p>}
    </div>
  );
}