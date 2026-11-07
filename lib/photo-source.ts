/**
 * Where a profile photo came from: uploaded by its owner (our avatars bucket), or the
 * automatic one from signing in with Google or GitHub.
 */
export type PhotoSource = "own" | "google" | "github" | "other" | "none";

export function photoSource(url: string | null | undefined): PhotoSource {
  if (!url) return "none";
  if (url.includes("/storage/v1/object/public/avatars/")) return "own";
  if (/^https:\/\/[^/]*googleusercontent\.com\//i.test(url)) return "google";
  if (/^https:\/\/[^/]*githubusercontent\.com\//i.test(url)) return "github";
  return "other";
}
