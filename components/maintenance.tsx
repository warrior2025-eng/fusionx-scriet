import Image from "next/image";
import Link from "next/link";
import { SlashMark } from "@/components/ui/slash-mark";
import type { OrganizationSettings } from "@/types/database";

/** What the public sees while maintenance mode is on. Staff never get this. */
export function Maintenance({ settings }: { settings: OrganizationSettings }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-paper px-6 py-16 text-center">
      <Image
        src={settings.logo_path || "/logo-mark.png"}
        alt=""
        width={72}
        height={72}
        className="h-[72px] w-[72px] rounded-full"
        priority
      />
      <p className="mt-8 flex items-center gap-2 text-[13px] font-medium tracking-[0.08em] text-accent">
        <SlashMark />
        {settings.chapter_name}
      </p>
      <h1 className="mt-3 font-serif text-3xl tracking-tight text-ink md:text-4xl">We&rsquo;ll be right back.</h1>
      <p className="mt-4 max-w-md leading-relaxed text-ink/70">
        {settings.maintenance_message?.trim() || "The site is being updated. Please check back in a little while."}
      </p>
      <Link href="/login" className="mt-10 text-sm text-ink/60 underline underline-offset-2 hover:text-ink">
        Staff sign in
      </Link>
    </main>
  );
}
