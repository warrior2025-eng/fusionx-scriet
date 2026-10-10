import { qrSvgPath } from "@/lib/events/qr";

/**
 * A QR code as inline SVG. Always black on white with its quiet zone, in
 * both themes: scanners need that contrast.
 */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { path, size } = qrSvgPath(value);
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className={className}
      style={{ background: "#ffffff" }}
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
