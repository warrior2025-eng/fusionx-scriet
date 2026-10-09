/**
 * Animated page background: a drifting blueprint grid, two slow light fields
 * and a scan beam. Pure CSS (see "TECH BACKDROP" in app/globals.css) — no
 * JavaScript, no canvas — so it adds no script cost and is stopped by the
 * global prefers-reduced-motion rule. Fixed behind all content.
 */
export function TechBackdrop() {
  return (
    <div className="tech-backdrop" aria-hidden>
      <div className="tech-backdrop__glow tech-backdrop__glow--a" />
      <div className="tech-backdrop__glow tech-backdrop__glow--b" />
      <div className="tech-backdrop__grid" />
      <div className="tech-backdrop__beam" />
    </div>
  );
}
