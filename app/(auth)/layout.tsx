import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-6 py-16">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-center gap-2 font-semibold text-ink mb-10 justify-center">
          <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-ink text-xs font-bold text-white">
            FX
          </span>
          FusionX @ SCRIET
        </Link>
        {children}
      </div>
    </div>
  );
}
