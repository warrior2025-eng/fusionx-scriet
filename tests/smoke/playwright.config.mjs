// Smoke tests for the site and FusionX Autopilot. LOCAL ONLY: a fresh local Postgres, the Supabase
// stand-in and the app built against them (see tests/smoke/README.md). Never point this at production.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.mjs$/,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./seed.mjs",
  use: {
    baseURL: process.env.FX_BASE ?? "http://127.0.0.1:3100",
    // The Chrome already on the machine: nothing to download.
    channel: "chrome",
    headless: true,
    viewport: { width: 1366, height: 900 },
    screenshot: "only-on-failure",
  },
});
