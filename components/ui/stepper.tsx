/**
 * Numbered stepper for a fixed list of stage names. Horizontal on desktop,
 * vertical on mobile. Nodes are joined by a 1px line with a short 45°
 * connector at each node — the logo's slash angle.
 */
export function Stepper({ steps, label }: { steps: readonly string[]; label: string }) {
  return (
    <ol aria-label={label} className="stepper">
      {steps.map((step, i) => (
        <li key={step} className="stepper__step">
          <span className="stepper__node tabular-nums">{String(i + 1).padStart(2, "0")}</span>
          <span className="stepper__label">{step}</span>
        </li>
      ))}
    </ol>
  );
}
