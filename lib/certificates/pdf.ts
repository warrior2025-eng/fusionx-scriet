import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { IST, eventDate } from "@/lib/events/format";
import { qrMatrix } from "@/lib/events/qr";

/**
 * The certificate PDF: A4 landscape, built on the server for each download
 * from what the database holds (nothing is stored as a file).
 *
 * Signatories are printed as text. A signature image appears only when an
 * admin uploaded one for that event (with that person's permission).
 *
 * Fonts are the site's own (Fraunces, Manrope; SIL Open Font Licence) from
 * assets/fonts. They cover Latin script; a name in another script cannot be
 * printed, and that is reported instead of printing boxes.
 */

export type CertificateData = {
  organization: string;
  subtitle: string;
  title: string;
  attendee: string;
  eventTitle: string;
  /** The event's date column, "2026-10-12". */
  eventDate: string;
  venue: string | null;
  serial: string;
  issuedAt: string;
  verifyUrl: string;
  signatories: { name: string; title: string | null; signature: Uint8Array | null }[];
};

export class CertificateError extends Error {}

const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
const NAVY = rgb(0, 3 / 255, 13 / 255);
const BLUE = rgb(0, 77 / 255, 246 / 255);
const MUTED = rgb(0.33, 0.36, 0.43);
const HAIRLINE = rgb(0.8, 0.83, 0.9);

// Each path is spelled out so the bundler ships exactly these four files with
// the route (a computed path would make it trace the whole project).
let assets: Promise<{ serif: Buffer; sans: Buffer; sansBold: Buffer; logo: Buffer }> | null = null;
function loadAssets() {
  assets ??= Promise.all([
    readFile(path.join(process.cwd(), "assets", "fonts", "Fraunces-Medium.ttf")),
    readFile(path.join(process.cwd(), "assets", "fonts", "Manrope-Regular.ttf")),
    readFile(path.join(process.cwd(), "assets", "fonts", "Manrope-SemiBold.ttf")),
    readFile(path.join(process.cwd(), "public", "icon.png")),
  ]).then(([serif, sans, sansBold, logo]) => ({ serif, sans, sansBold, logo }));
  return assets;
}

// Glyph substitution is switched off: the PDF writer records widths only for a
// font's plain letters, so a substituted glyph (an "fi" ligature, a hyphen
// between digits, Fraunces' alternate n/h/m/s under "rvrn") would be drawn
// with a wrong width and leave a gap.
const PLAIN_GLYPHS = { liga: false, clig: false, dlig: false, rlig: false, calt: false, rclt: false, rvrn: false, locl: false };

const clean = (text: string) => text.normalize("NFC").replace(/\s+/g, " ").trim();

function supports(font: PDFFont, text: string): boolean {
  const set = new Set(font.getCharacterSet());
  return [...text].every((ch) => set.has(ch.codePointAt(0)!));
}

/** Text with any character the font cannot draw removed (used for everything but the name). */
function printable(font: PDFFont, text: string): string {
  const set = new Set(font.getCharacterSet());
  return clean([...clean(text)].filter((ch) => set.has(ch.codePointAt(0)!)).join(""));
}

/** The largest size from `max` down to `min` at which `text` fits `width`. */
function fit(font: PDFFont, text: string, max: number, min: number, width: number): number {
  let size = max;
  while (size > min && font.widthOfTextAtSize(text, size) > width) size -= 0.5;
  return size;
}

function wrap(font: PDFFont, text: string, size: number, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = `${kept[maxLines - 1]}...`;
    while (last.length > 4 && font.widthOfTextAtSize(last, size) > width) last = `${last.slice(0, -4)}...`;
    kept[maxLines - 1] = last;
    return kept;
  }
  return lines;
}

function centered(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color = NAVY, cx = A4_LANDSCAPE[0] / 2) {
  page.drawText(text, { x: cx - font.widthOfTextAtSize(text, size) / 2, y, size, font, color });
}

function rightAligned(page: PDFPage, text: string, right: number, y: number, font: PDFFont, size: number, color = MUTED) {
  page.drawText(text, { x: right - font.widthOfTextAtSize(text, size), y, size, font, color });
}

export async function renderCertificate(data: CertificateData): Promise<Uint8Array> {
  const files = await loadAssets();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [serif, sans, sansBold] = await Promise.all([
    pdf.embedFont(files.serif, { features: PLAIN_GLYPHS }),
    pdf.embedFont(files.sans, { features: PLAIN_GLYPHS }),
    pdf.embedFont(files.sansBold, { features: PLAIN_GLYPHS }),
  ]);
  const logo = await pdf.embedPng(files.logo);

  const attendee = clean(data.attendee);
  if (!attendee) throw new CertificateError("This certificate has no name on it.");
  if (!supports(serif, attendee)) {
    throw new CertificateError(
      "This name contains characters the certificate font cannot print. Ask an admin to re-issue it after the name on the profile is written in Latin letters.",
    );
  }

  pdf.setTitle(`${data.title}: ${attendee}`);
  pdf.setAuthor(data.organization);
  pdf.setSubject(`${data.eventTitle} (${data.serial})`);
  pdf.setCreationDate(new Date(data.issuedAt));

  const [W, H] = A4_LANDSCAPE;
  const page = pdf.addPage(A4_LANDSCAPE);

  // Frame: a navy rule with a hairline inside it, and the top-right corner
  // cut at 45°, as on the site's cards.
  const m = 26;
  const cut = 44;
  const framePath = (inset: number, c: number) =>
    `M ${inset} ${inset} L ${W - inset - c} ${inset} L ${W - inset} ${inset + c} L ${W - inset} ${H - inset} L ${inset} ${H - inset} Z`;
  // drawSvgPath uses a top-left origin with y pointing down.
  page.drawSvgPath(framePath(m, cut), { x: 0, y: H, borderColor: NAVY, borderWidth: 1.4 });
  page.drawSvgPath(framePath(m + 7, cut - 3), { x: 0, y: H, borderColor: HAIRLINE, borderWidth: 0.6 });

  // Header: logo, name, subtitle.
  const left = 70;
  const top = H - 70;
  page.drawImage(logo, { x: left, y: top - 40, width: 40, height: 40 });
  page.drawText(printable(sansBold, data.organization), { x: left + 52, y: top - 17, size: 14, font: sansBold, color: NAVY });
  page.drawText(printable(sans, data.subtitle), { x: left + 52, y: top - 32, size: 9, font: sans, color: MUTED });

  // The slash: the logo's accent mark, beside the title.
  const title = printable(serif, data.title);
  const titleSize = fit(serif, title, 30, 20, 560);
  const titleWidth = serif.widthOfTextAtSize(title, titleSize);
  const titleY = 408;
  centered(page, title, titleY, serif, titleSize);
  const slashX = W / 2 - titleWidth / 2 - 30;
  page.drawLine({ start: { x: slashX, y: titleY - 2 }, end: { x: slashX + 16, y: titleY + 14 }, thickness: 4, color: BLUE });

  centered(page, "This is to certify that", 368, sans, 11, MUTED);

  const nameSize = fit(serif, attendee, 40, 20, 640);
  centered(page, attendee, 318, serif, nameSize);
  page.drawLine({ start: { x: W / 2 - 60, y: 300 }, end: { x: W / 2 + 60, y: 300 }, thickness: 1.2, color: BLUE });

  centered(page, "attended", 274, sans, 11, MUTED);

  const eventLines = wrap(serif, printable(serif, data.eventTitle), 20, 620, 2);
  eventLines.forEach((line, i) => centered(page, line, 246 - i * 26, serif, 20));

  const afterEvent = 246 - (eventLines.length - 1) * 26;
  const venue = data.venue ? printable(sans, data.venue) : "";
  const held = `held on ${eventDate(data.eventDate)}${venue ? ` at ${venue}` : ""}`;
  centered(page, held, afterEvent - 28, sans, fit(sans, held, 11, 8, 640), MUTED);

  // Signatories: text, with an uploaded signature image above the rule if there is one.
  const signatures: (PDFImage | null)[] = await Promise.all(
    data.signatories.map(async (s) => {
      if (!s.signature) return null;
      try {
        const isPng = s.signature[0] === 0x89 && s.signature[1] === 0x50;
        return isPng ? await pdf.embedPng(s.signature) : await pdf.embedJpg(s.signature);
      } catch {
        return null;
      }
    }),
  );
  const columns = [165, 355];
  data.signatories.slice(0, 2).forEach((signatory, i) => {
    const cx = columns[i];
    const image = signatures[i];
    if (image) {
      const scale = Math.min(130 / image.width, 42 / image.height);
      page.drawImage(image, { x: cx - (image.width * scale) / 2, y: 118, width: image.width * scale, height: image.height * scale });
    }
    page.drawLine({ start: { x: cx - 80, y: 112 }, end: { x: cx + 80, y: 112 }, thickness: 0.7, color: NAVY });
    const name = printable(sansBold, signatory.name);
    centered(page, name, 97, sansBold, fit(sansBold, name, 11, 8, 170), NAVY, cx);
    if (signatory.title) {
      wrap(sans, printable(sans, signatory.title), 8.5, 170, 2).forEach((line, n) =>
        centered(page, line, 84 - n * 11, sans, 8.5, MUTED, cx),
      );
    }
  });

  // Verification: QR code and serial, bottom right.
  const qr = qrMatrix(data.verifyUrl);
  const qrSize = 66;
  const cell = qrSize / qr.length;
  const qrX = W - 70 - qrSize;
  const qrY = 66;
  qr.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (dark) page.drawRectangle({ x: qrX + c * cell, y: qrY + qrSize - (r + 1) * cell, width: cell + 0.05, height: cell + 0.05, color: NAVY });
    }),
  );
  const textRight = qrX - 12;
  rightAligned(page, "Certificate no.", textRight, qrY + 52, sans, 8);
  rightAligned(page, data.serial, textRight, qrY + 39, sansBold, 10, NAVY);
  // The issue date as it was in India, whatever the server's clock zone.
  const issuedOn = new Date(data.issuedAt).toLocaleDateString("en-CA", { timeZone: IST });
  rightAligned(page, `Issued ${eventDate(issuedOn, "short")}`, textRight, qrY + 24, sans, 8);
  const shown = data.verifyUrl.replace(/^https?:\/\//, "");
  rightAligned(page, `Verify: ${shown}`, textRight, qrY + 11, sans, fit(sans, `Verify: ${shown}`, 8, 6, 195));

  return pdf.save();
}
