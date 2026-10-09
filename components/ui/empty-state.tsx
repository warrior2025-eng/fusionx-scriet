export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border border-dashed border-ink/20 bg-surface/60 px-6 py-12">
      <p className="font-medium text-ink">{title}</p>
      <p className="mt-1.5 max-w-md text-sm text-ink/65">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
