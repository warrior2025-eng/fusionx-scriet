import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import { istDateTime } from "@/lib/events/format";

/**
 * The offer letter: one A4 page built on the server from the candidate's
 * result (nothing is stored). Same fonts and logo as the certificates.
 */

export type OfferLetterData = {
  organization: string;
  name: string;
  /** Every hub the candidate is selected in. */
  hubs: { name: string; deadline: string | null; accepted: boolean }[];
  cycle: string;
  issuedAt: string;
  induction: { at: string | null; mode: string | null; venue: string | null; link: string | null } | null;
};

const NAVY = rgb(0, 3 / 255, 13 / 255);
const BLUE = rgb(0, 77 / 255, 246 / 255);
const MUTED = rgb(0.33, 0.36, 0.43);
const PLAIN = { liga: false, clig: false, dlig: false, rlig: false, calt: false, rclt: false, rvrn: false, locl: false };

// Each path spelled out so the bundler ships exactly these files with the route.
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

/** Text with any character the font cannot draw removed. */
function printable(font: PDFFont, text: string): string {
  const set = new Set(font.getCharacterSet());
  return [...text.normalize("NFC").replace(/\s+/g, " ").trim()].filter((ch) => set.has(ch.codePointAt(0)!)).join("").trim();
}

function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
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
  return lines;
}

export async function renderOfferLetter(data: OfferLetterData): Promise<Uint8Array> {
  const files = await loadAssets();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [serif, sans, sansBold] = await Promise.all([
    pdf.embedFont(files.serif, { features: PLAIN }),
    pdf.embedFont(files.sans, { features: PLAIN }),
    pdf.embedFont(files.sansBold, { features: PLAIN }),
  ]);
  const logo = await pdf.embedPng(files.logo);
  const name = printable(serif, data.name) || "Candidate";
  pdf.setTitle(`Offer letter: ${name}`);
  pdf.setAuthor(data.organization);

  const [W, H] = [595.28, 841.89];
  const page = pdf.addPage([W, H]);
  const left = 64;
  const width = W - left * 2;
  // Frame with the top-right corner cut at 45°, as on the site's cards.
  page.drawSvgPath(`M 28 28 L ${W - 28 - 40} 28 L ${W - 28} ${28 + 40} L ${W - 28} ${H - 28} L 28 ${H - 28} Z`, { x: 0, y: H, borderColor: NAVY, borderWidth: 1.2 });

  page.drawImage(logo, { x: left, y: H - 110, width: 40, height: 40 });
  page.drawText(printable(sansBold, data.organization), { x: left + 52, y: H - 88, size: 14, font: sansBold, color: NAVY });
  page.drawText(printable(sans, istDateTime(data.issuedAt)), { x: left + 52, y: H - 104, size: 9, font: sans, color: MUTED });

  let y = H - 170;
  page.drawLine({ start: { x: left, y: y - 2 }, end: { x: left + 14, y: y + 14 }, thickness: 4, color: BLUE });
  page.drawText("Offer of selection", { x: left + 26, y, size: 24, font: serif, color: NAVY });
  y -= 50;

  const paragraph = (text: string, font = sans, size = 11, color = NAVY, gap = 10) => {
    for (const line of wrap(font, printable(font, text), size, width)) {
      page.drawText(line, { x: left, y, size, font, color });
      y -= size + 6;
    }
    y -= gap;
  };
  paragraph(`Dear ${name},`, serif, 14);
  const hubNames = data.hubs.map((h) => h.name).join(" and ");
  paragraph(`Congratulations! You have been selected for ${hubNames} in ${data.cycle} at ${data.organization}.`);
  const answer = (h: OfferLetterData["hubs"][number]) =>
    h.accepted
      ? "You have accepted your place. Welcome!"
      : h.deadline
        ? `Please accept or decline your place on your status page by ${istDateTime(h.deadline)}.`
        : "Please accept or decline your place on your status page.";
  if (data.hubs.length === 1) paragraph(answer(data.hubs[0]));
  else {
    for (const h of data.hubs) paragraph(`${h.name}: ${answer(h)}`, sans, 11, NAVY, 4);
    y -= 6;
  }
  if (data.induction && (data.induction.at || data.induction.venue || data.induction.link)) {
    paragraph("Induction meeting", sansBold, 11, NAVY, 2);
    if (data.induction.at) paragraph(`When: ${istDateTime(data.induction.at)}`, sans, 11, NAVY, 2);
    if (data.induction.mode) paragraph(`Mode: ${data.induction.mode === "online" ? "Online" : "In person"}`, sans, 11, NAVY, 2);
    if (data.induction.venue) paragraph(`Venue: ${data.induction.venue}`, sans, 11, NAVY, 2);
    if (data.induction.link) paragraph(`Link: ${data.induction.link}`, sans, 10, MUTED, 2);
    y -= 8;
  } else {
    paragraph("Induction details will be shared soon on your status page.", sans, 11, MUTED);
  }
  y -= 20;
  page.drawText(printable(sansBold, data.organization), { x: left, y, size: 11, font: sansBold, color: NAVY });
  page.drawText("This letter was generated from the FusionX@SCRIET website.", { x: left, y: 54, size: 8, font: sans, color: MUTED });
  return pdf.save();
}
