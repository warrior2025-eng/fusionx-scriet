/** Shown at once after a click while the next page loads; the header and footer stay. */
export default function Loading() {
  return (
    <div className="container-fx py-16" role="status" aria-label="Loading">
      <div className="animate-pulse space-y-5">
        <div className="h-4 w-28 bg-ink/10" />
        <div className="h-9 w-2/3 max-w-xl bg-ink/10" />
        <div className="h-4 w-full max-w-2xl bg-ink/10" />
        <div className="h-4 w-5/6 max-w-2xl bg-ink/10" />
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="h-32 bg-ink/5" />
          <div className="h-32 bg-ink/5" />
          <div className="h-32 bg-ink/5" />
        </div>
      </div>
    </div>
  );
}
