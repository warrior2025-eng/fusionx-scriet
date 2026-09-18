import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "FusionX @ SCRIET — Student Innovation & Research Network",
    template: "%s · FusionX @ SCRIET",
  },
  description:
    "A student-led ecosystem at SCRIET, CCS University Meerut for building projects, exploring research, forming interdisciplinary teams, and turning ideas into impact.",
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined,
  openGraph: {
    title: "FusionX @ SCRIET — Student Innovation & Research Network",
    description: "From Ideas to Impact.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FusionX @ SCRIET",
    description: "From Ideas to Impact.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${sourceSerif.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-paper text-ink">{children}</body>
    </html>
  );
}
