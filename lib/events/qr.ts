import qrcode from "qrcode-generator";

/**
 * The dark squares of a QR code for `text`, as a grid. Used to draw the code
 * as SVG (tickets) and as rectangles in the certificate PDF. Error correction
 * "M" keeps the code readable from a phone screen at arm's length.
 */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => qr.isDark(row, col)));
}

/** One SVG path covering every dark square, on a grid with a quiet zone of `margin` squares. */
export function qrSvgPath(text: string, margin = 4): { path: string; size: number } {
  const matrix = qrMatrix(text);
  let path = "";
  matrix.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) path += `M${x + margin} ${y + margin}h1v1h-1z`;
    });
  });
  return { path, size: matrix.length + margin * 2 };
}
