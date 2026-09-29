import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server Actions default to a 1MB request body limit. Project images,
  // event posters, and avatars go through server actions (actions/projects.ts,
  // actions/admin-create.ts, actions/profile.ts) and are validated up to 4MB,
  // so the framework limit has to be raised to match or uploads fail with a
  // "Body exceeded limit" error — in dev and on Vercel alike.
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
