"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="relative min-h-[80vh] flex flex-col items-center justify-center px-6 text-center overflow-hidden">

      <div className="relative z-10 max-w-md">
        <p className="mb-3 text-[13px] font-medium tracking-[0.08em] text-ink/70">Error</p>
        <h1 className="font-serif text-4xl md:text-5xl font-normal tracking-tight text-ink mb-4">
          Something went wrong
        </h1>
        <p className="text-ink/55 mb-8 leading-relaxed">
          An unexpected error occurred. It has been logged. Please try again.
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
