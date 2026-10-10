import type { Metadata } from "next";
import { Manrope, Fraunces } from "next/font/google";
import "./globals.css";
import { ParticleLogoField } from "@/components/ui/particle-logo-field";
import { getOrganizationSettings } from "@/lib/data/organization";
import { getContent } from "@/lib/data/site-content";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz", "SOFT", "WONK"],
});

// Titles, description, favicon and share image come from the admin panel
// (Settings), each with the site's built-in value behind it.
export async function generateMetadata(): Promise<Metadata> {
  const [settings, seo] = await Promise.all([getOrganizationSettings(), getContent("seo.default")]);
  const shareImage = settings.og_image_path ? [settings.og_image_path] : undefined;

  return {
    title: { default: seo.defaultTitle, template: seo.titleTemplate },
    description: seo.description,
    metadataBase: process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined,
    icons: { icon: settings.favicon_path || "/favicon.ico" },
    openGraph: {
      title: seo.defaultTitle,
      description: settings.tagline,
      siteName: settings.chapter_name,
      type: "website",
      images: shareImage,
    },
    twitter: {
      card: "summary_large_image",
      title: settings.chapter_name,
      description: settings.tagline,
      images: shareImage,
    },
  };
}

// Runs before paint so a returning visitor's saved light/dark choice
// applies immediately — no flash of the default (dark) theme. Dark stays
// the default for anyone who hasn't chosen a theme yet.
const themeInitScript = `
  try {
    var t = localStorage.getItem('theme');
    if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
  } catch (e) {}
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} ${fraunces.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <ParticleLogoField />
        {children}
      </body>
    </html>
  );
}
