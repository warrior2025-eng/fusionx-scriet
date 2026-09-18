export default function Loading() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-ink/20 border-t-ink" aria-hidden />
    </div>
  );
}
