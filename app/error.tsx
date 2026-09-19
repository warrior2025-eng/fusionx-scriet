"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-paper">
      <p className="text-xs font-semibold tracking-[0.14em] uppercase text-accent mb-3">Error</p>
      <h1 className="text-3xl font-semibold text-ink mb-3">Something went wrong</h1>
      <p className="text-ink/55 mb-8 max-w-sm">
        An unexpected error occurred. It has been logged — please try again.
      </p>
      <button onClick={reset} className="text-sm font-medium text-white bg-accent px-5 py-2.5 rounded-sm hover:bg-accent/90">
        Try again
      </button>
    </div>
  );
}
