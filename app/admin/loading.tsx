/** Shown at once after a click in the admin panel while the next page loads; the sidebar stays. */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5" role="status" aria-label="Loading">
      <div className="h-4 w-40 bg-ink/10" />
      <div className="h-8 w-1/2 max-w-md bg-ink/10" />
      <div className="h-4 w-full max-w-xl bg-ink/10" />
      <div className="mt-6 h-64 w-full bg-ink/5" />
    </div>
  );
}
