import Image from "next/image";
import Link from "next/link";
import { getOrganizationSettings } from "@/lib/data/organization";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const settings = await getOrganizationSettings();
  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-6 py-16">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-center gap-2 font-semibold text-ink mb-10 justify-center">
          <Image
            src={settings.logo_path || "/logo-mark.png"}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 rounded-full object-cover"
          />
          {settings.chapter_name}
        </Link>
        {children}
      </div>
    </div>
  );
}
