import Image from "next/image";
import Link from "next/link";
import { siteName } from "@/lib/site-config";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-6 py-16">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-center gap-2 font-semibold text-ink mb-10 justify-center">
          <Image src="/logo-mark.png" alt="FusionX logo" width={28} height={28} className="h-7 w-7 rounded-full" />
          {siteName}
        </Link>
        {children}
      </div>
    </div>
  );
}
