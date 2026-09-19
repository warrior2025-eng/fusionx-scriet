import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-paper">
      <p className="text-xs font-semibold tracking-[0.14em] uppercase text-accent mb-3">404</p>
      <h1 className="text-3xl font-semibold text-ink mb-3">Page not found</h1>
      <p className="text-ink/55 mb-8 max-w-sm">
        The page you&rsquo;re looking for doesn&rsquo;t exist or may have moved.
      </p>
      <Link href="/" className="text-sm font-medium text-white bg-accent px-5 py-2.5 rounded-sm hover:bg-accent/90">
        Back to home
      </Link>
    </div>
  );
}
