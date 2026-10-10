import type { Metadata, Viewport } from "next";
import { Manrope, Fraunces } from "next/font/google";
import "./globals.css";
import { ParticleLogoField } from "@/components/ui/particle-logo-field";
import { getOrganizationSettings } from "@/lib/data/organization";
import { getContent } from "@/lib/data/site-content";
import { socialLinks } from "@/lib/site-config";

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
    // The club logo (public/favicon.ico, icon.png, apple-icon.png, generated
    // from logo-mark.png), unless a favicon was uploaded in the admin panel.
    icons: settings.favicon_path
      ? { icon: settings.favicon_path, apple: "/apple-icon.png" }
      : {
          icon: [
            { url: "/favicon.ico", sizes: "48x48" },
            { url: "/icon.png", type: "image/png", sizes: "512x512" },
          ],
          apple: [{ url: "/apple-icon.png", sizes: "180x180" }],
        },
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

// The browser's own chrome (address bar, task switcher) in the logo's navy.
export const viewport: Viewport = { themeColor: "#00030D" };

// Runs before paint so a returning visitor's saved light/dark choice
// applies immediately — no flash of the default (dark) theme. Dark stays
// the default for anyone who hasn't chosen a theme yet.
const themeInitScript = `
  try {
    var t = localStorage.getItem('theme');
    if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
  } catch (e) {}
`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Organization structured data for search engines. "<" is escaped so the
  // JSON can never close the script tag.
  const settings = await getOrganizationSettings();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const organization = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: settings.chapter_name,
    ...(siteUrl ? { url: siteUrl, logo: `${siteUrl}/icon.png` } : {}),
    email: settings.official_email || socialLinks.email,
    sameAs: [settings.instagram_url || socialLinks.instagram, settings.linkedin_url || socialLinks.linkedin],
  }).replace(/</g, "\\u003c");

  return (
    <html lang="en" className={`${manrope.variable} ${fraunces.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: organization }} />
      </head>
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <ParticleLogoField />
        {children}
      </body>
    </html>
  );
}
