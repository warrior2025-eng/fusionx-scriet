import type { NextConfig } from "next";

// Images uploaded from the admin panel (team photos, logo) are served from
// this project's public Supabase Storage and shown through next/image.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

const nextConfig: NextConfig = {
  // Server Actions default to a 1MB request body limit. Images go through
  // server actions (actions/projects.ts, actions/profile.ts and the admin
  // actions) and are validated up to 4MB, so the framework limit has to be
  // raised to match or uploads fail with a "Body exceeded limit" error.
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
};

export default nextConfig;
