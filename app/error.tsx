"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="relative min-h-[80vh] flex flex-col items-center justify-center px-6 text-center overflow-hidden">
      <div className="absolute inset-0 bg-grid-subtle" aria-hidden />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-red-500/[0.04] rounded-full blur-[120px]" aria-hidden />

      <div className="relative z-10 max-w-md">
        <p className="font-mono text-xs font-semibold tracking-[0.2em] uppercase text-red-400 mb-3">System Error</p>
        <h1 className="font-serif text-4xl md:text-5xl font-normal tracking-tight text-ink mb-4">
          Something went wrong
        </h1>
        <p className="text-ink/55 mb-8 leading-relaxed">
          An unexpected error occurred. It has been logged — please try again.
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center justify-center rounded-sm font-medium text-sm text-white bg-accent px-6 py-2.5 hover:bg-accent/90 transition-colors shadow-sm"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
