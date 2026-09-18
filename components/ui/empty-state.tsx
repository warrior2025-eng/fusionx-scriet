export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded border border-dashed border-ink/15 px-6 py-14 text-center">
      <p className="text-sm font-medium text-ink/70">{title}</p>
      <p className="mt-1.5 text-sm text-ink/45 max-w-md mx-auto">{description}</p>
    </div>
  );
}
