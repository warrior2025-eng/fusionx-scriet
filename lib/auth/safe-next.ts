/**
 * Where to send someone after signing in. Only ever a path on this site:
 * anything that could leave it ("//evil.com", "/\evil.com", a full URL)
 * becomes "/". Used by the password login, the OAuth buttons and the OAuth
 * callback, so all three agree.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next) return "/";
  const internal = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\");
  return internal ? next : "/";
}
