"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Analytics } from "@vercel/analytics/next";
import { visitGroup } from "@/lib/autopilot/outcomes";
import { countVisit } from "@/actions/autopilot-outcomes";

/**
 * Visitors, on public pages only (not admin, Command Center, My work, meetings, interviews or member pages):
 * Vercel Web Analytics (no cookies) for the detailed dashboard, and FusionX's own count per section and
 * day for the Visitors card and the Impact Report. Nothing about the visitor is stored.
 */
export function SiteAnalytics() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname && visitGroup(pathname)) countVisit(pathname).catch(() => {});
  }, [pathname]);
  return <Analytics beforeSend={(event) => (visitGroup(new URL(event.url).pathname) ? event : null)} />;
}
