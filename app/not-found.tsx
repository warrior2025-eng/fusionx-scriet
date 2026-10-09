import Link from "next/link";

export default function NotFound() {
  return (
    <div className="relative min-h-[80vh] flex flex-col items-center justify-center px-6 text-center overflow-hidden">

      <div className="relative z-10 max-w-md">
        <p className="mb-3 text-[13px] font-medium tracking-[0.08em] text-ink/70">404 &middot; Not found</p>
        <h1 className="font-serif text-4xl md:text-5xl font-normal tracking-tight text-ink mb-4">
          Page not found
        </h1>
        <p className="text-ink/55 mb-8 leading-relaxed">
          The page you&rsquo;re looking for doesn&rsquo;t exist or may have moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-sm font-medium text-sm text-white bg-accent px-6 py-2.5 hover:bg-accent/90 transition-colors shadow-sm"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
