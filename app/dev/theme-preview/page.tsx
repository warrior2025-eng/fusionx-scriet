import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Compare } from "./compare";
import { previewAllowed } from "./guard";
import "./preview.css";

export const metadata: Metadata = { title: "Light theme preview", robots: { index: false, follow: false } };

export default function ThemePreviewPage() {
  if (!previewAllowed()) notFound();
  return <Compare />;
}
