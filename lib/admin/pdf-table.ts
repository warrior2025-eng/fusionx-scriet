import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { cellText, type Column } from "@/lib/admin/csv";
import { istDateTime } from "@/lib/events/format";
import { siteName } from "@/lib/site-config";

/**
 * The columns and rows of a CSV export as a table PDF (same fonts and logo as
 * the certificates and the offer letter). A4, landscape above 6 columns. The
 * column headers repeat on every page, long text wraps inside its cell, and a
 * row taller than a page continues on the next one, so nothing is cut off.
 */

/** Past this the file takes too long or gets too large: the page asks for narrower filters or the CSV. */
export const PDF_MAX_ROWS = 5000;
export const PDF_MAX_MS = 45_000;
export const PDF_TOO_MANY = "Too many rows for a PDF. Narrow the filters or use CSV.";

export class PdfTooLarge extends Error {}

const NAVY = rgb(0, 3 / 255, 13 / 255);
const BLUE = rgb(0, 77 / 255, 246 / 255);
const MUTED = rgb(0.33, 0.36, 0.43);
const LINE = rgb(0.84, 0.86, 0.9);
const ZEBRA = rgb(0.953, 0.965, 1);
const WHITE = rgb(1, 1, 1);
const PLAIN = { liga: false, clig: false, dlig: false, rlig: false, calt: false, rclt: false, rvrn: false, locl: false };

const MARGIN = 36;
const FOOTER = 30;
const PAD_X = 4;
const PAD_Y = 3.5;

// Each path spelled out so the bundler ships exactly these files with the routes.
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

/** Measures and cleans text for one font, remembering what it has measured (a long table repeats most words). */
function typeface(font: PDFFont) {
  const chars = new Set(font.getCharacterSet());
  const widths = new Map<string, number>();
  const unit = (text: string) => {
    let w = widths.get(text);
    if (w === undefined) {
      w = font.widthOfTextAtSize(text, 1);
      widths.set(text, w);
    }
    return w;
  };
  /** Paragraphs of drawable text: a character the font cannot draw becomes "?"; invisible joiners go. */
  const clean = (text: string): string[] => {
    const safe = [...text.normalize("NFC").replace(/[​-‏⁠︀-️﻿]/g, "")]
      .map((ch) => (ch === "\n" || ch === " " || chars.has(ch.codePointAt(0)!) ? ch : /\s/.test(ch) ? " " : "?"))
      .join("");
    return safe
      .split("\n")
      .map((line) => line.replace(/ +/g, " ").trim())
      .filter((line, i, all) => line !== "" || (i > 0 && i < all.length - 1));
  };
  /** Lines that fit `width`; a word longer than the width (a link) breaks between its letters. */
  const wrap = (paragraphs: string[], size: number, width: number): string[] => {
    const max = width / size;
    const space = unit(" ");
    const lines: string[] = [];
    for (const paragraph of paragraphs) {
      let line = "";
      let used = 0;
      for (const word of paragraph.split(" ")) {
        let w = unit(word);
        if (line && used + space + w <= max) {
          line += ` ${word}`;
          used += space + w;
          continue;
        }
        if (line) lines.push(line);
        line = word;
        used = w;
        if (w <= max) continue;
        // Too long for a line of its own.
        line = "";
        used = 0;
        for (const ch of word) {
          w = unit(ch);
          if (line && used + w > max) {
            lines.push(line);
            line = "";
            used = 0;
          }
          line += ch;
          used += w;
        }
      }
      lines.push(line);
    }
    return lines.length ? lines : [""];
  };
  return { font, unit, clean, wrap };
}
type Face = ReturnType<typeof typeface>;

/** Column widths: each gets room for its longest word, then the rest of the page by how much text it holds. */
function columnWidths(headers: string[][], cells: string[][][], face: Face, bold: Face, size: number, total: number): number[] {
  const space = face.unit(" ");
  const stats = headers.map((header, c) => {
    let word = 0;
    let longest = 0;
    let sum = 0;
    for (const paragraph of header) for (const w of paragraph.split(" ")) word = Math.max(word, bold.unit(w));
    longest = header.reduce((m, p) => Math.max(m, bold.unit(p)), 0);
    for (const row of cells) {
      let chars = 0;
      for (const paragraph of row[c]) {
        let line = 0;
        for (const w of paragraph.split(" ")) {
          const u = face.unit(w);
          // A link can break anywhere: it does not set the minimum width.
          if (u * size < 70) word = Math.max(word, u);
          line += u + space;
        }
        chars += line;
        longest = Math.max(longest, line);
      }
      sum += chars;
    }
    return { min: word * size + PAD_X * 2 + 1, natural: longest * size + PAD_X * 2 + 1, weight: Math.sqrt(sum / Math.max(cells.length, 1)) + 0.5 };
  });
  const floor = Math.min(26, total / headers.length);
  const minimum = stats.map((s) => Math.max(s.min, floor));
  const need = minimum.reduce((a, b) => a + b, 0);
  // Too many columns even for that: everyone gives up the same share.
  const widths = need > total ? minimum.map((m) => Math.max(floor, m * (total / need))) : minimum;
  const fix = total / Math.max(widths.reduce((a, b) => a + b, 0), total);
  for (let i = 0; i < widths.length; i++) widths[i] *= fix;
  // The rest goes where the text is, never past what a column can use.
  for (let round = 0; round < 6; round++) {
    const left = total - widths.reduce((a, b) => a + b, 0);
    if (left < 0.5) break;
    const open = stats.map((s, i) => (widths[i] < s.natural ? s.weight : 0));
    const weights = open.reduce((a, b) => a + b, 0);
    if (!weights) break;
    for (let i = 0; i < widths.length; i++) if (open[i]) widths[i] = Math.min(stats[i].natural, widths[i] + (left * open[i]) / weights);
  }
  // Short columns all fit: share what is left so the table fills the page.
  const spare = total - widths.reduce((a, b) => a + b, 0);
  if (spare > 0.5) for (let i = 0; i < widths.length; i++) widths[i] += spare / widths.length;
  return widths;
}

export type TablePdf<T> = {
  title: string;
  /** Label → what it was set to; empty ones are left out. */
  filters?: Record<string, string | null | undefined>;
  rows: T[];
  columns: Column<T>[];
};

export async function renderTablePdf<T>({ title, filters = {}, rows, columns }: TablePdf<T>): Promise<Uint8Array> {
  if (rows.length > PDF_MAX_ROWS) throw new PdfTooLarge(PDF_TOO_MANY);
  const started = Date.now();
  const files = await loadAssets();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [serifFont, sansFont, boldFont] = await Promise.all([
    pdf.embedFont(files.serif, { features: PLAIN }),
    pdf.embedFont(files.sans, { features: PLAIN }),
    pdf.embedFont(files.sansBold, { features: PLAIN }),
  ]);
  const logo = await pdf.embedPng(files.logo);
  const serif = typeface(serifFont);
  const sans = typeface(sansFont);
  const bold = typeface(boldFont);
  pdf.setTitle(title);
  pdf.setAuthor(siteName);

  const landscape = columns.length > 6;
  const [W, H] = landscape ? [841.89, 595.28] : [595.28, 841.89];
  const tableW = W - MARGIN * 2;
  const size = columns.length <= 6 ? 9 : columns.length <= 10 ? 8 : columns.length <= 16 ? 7 : 6;
  const lineH = size * 1.32;

  const headers = columns.map((c) => bold.clean(c.header));
  const cells = rows.map((row) => columns.map((c) => sans.clean(cellText(c.value(row)))));
  const widths = columnWidths(headers, cells, sans, bold, size, tableW);
  const headerLines = headers.map((h, c) => bold.wrap(h, size, widths[c] - PAD_X * 2));
  const headerH = Math.max(...headerLines.map((l) => l.length)) * lineH + PAD_Y * 2;

  let page: PDFPage = pdf.addPage([W, H]);

  // ── the header block, on the first page ──
  let y = H - MARGIN;
  page.drawImage(logo, { x: MARGIN, y: y - 28, width: 28, height: 28 });
  page.drawText(bold.clean(siteName).join(" "), { x: MARGIN + 36, y: y - 18, size: 13, font: boldFont, color: NAVY });
  y -= 46;
  for (const line of serif.wrap(serif.clean(title), 15, tableW)) {
    page.drawText(line, { x: MARGIN, y: y - 12, size: 15, font: serifFont, color: NAVY });
    y -= 19;
  }
  const applied = Object.entries(filters).filter(([, v]) => v);
  const meta = [
    `Filters: ${applied.length ? applied.map(([k, v]) => `${k}: ${v}`).join(" · ") : "none (all rows)"}`,
    `Generated on ${istDateTime(new Date().toISOString())} IST · ${rows.length} row${rows.length === 1 ? "" : "s"}`,
  ];
  y -= 3;
  for (const text of meta) {
    for (const line of sans.wrap(sans.clean(text), 8.5, tableW)) {
      page.drawText(line, { x: MARGIN, y: y - 8, size: 8.5, font: sansFont, color: MUTED });
      y -= 11.5;
    }
  }
  y -= 8;

  // ── the table ──
  const bottom = FOOTER + 10;
  const drawHeader = () => {
    page.drawRectangle({ x: MARGIN, y: y - headerH, width: tableW, height: headerH, color: BLUE });
    let x = MARGIN;
    headerLines.forEach((lines, c) => {
      lines.forEach((line, i) => {
        if (line) page.drawText(line, { x: x + PAD_X, y: y - PAD_Y - size - i * lineH + 1, size, font: boldFont, color: WHITE });
      });
      x += widths[c];
    });
    y -= headerH;
  };
  const newPage = () => {
    page = pdf.addPage([W, H]);
    y = H - MARGIN;
    drawHeader();
  };
  drawHeader();
  if (rows.length === 0) {
    page.drawText("No rows match.", { x: MARGIN + PAD_X, y: y - 16, size: 9, font: sansFont, color: MUTED });
  }

  const rowLinesMax = Math.floor((H - MARGIN - headerH - bottom - PAD_Y * 2) / lineH);
  cells.forEach((row, r) => {
    if (Date.now() - started > PDF_MAX_MS) throw new PdfTooLarge(PDF_TOO_MANY);
    const lines = row.map((paragraphs, c) => sans.wrap(paragraphs, size, widths[c] - PAD_X * 2));
    const total = Math.max(...lines.map((l) => l.length));
    let from = 0;
    while (from < total) {
      const room = Math.floor((y - bottom - PAD_Y * 2) / lineH);
      const rest = total - from;
      // A row goes whole onto a new page unless it would not fit on any page; then it fills the pages it needs.
      if (rest > room && (rest <= rowLinesMax || room < 3)) {
        newPage();
        continue;
      }
      const count = Math.min(rest, room);
      const h = count * lineH + PAD_Y * 2;
      if (r % 2 === 1) page.drawRectangle({ x: MARGIN, y: y - h, width: tableW, height: h, color: ZEBRA });
      let x = MARGIN;
      lines.forEach((cell, c) => {
        for (let i = from; i < Math.min(from + count, cell.length); i++) {
          if (cell[i]) page.drawText(cell[i], { x: x + PAD_X, y: y - PAD_Y - size - (i - from) * lineH + 1, size, font: sansFont, color: NAVY });
        }
        x += widths[c];
      });
      y -= h;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + tableW, y }, thickness: 0.4, color: LINE });
      from += count;
    }
  });

  // ── the footer, now that the page count is known ──
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: MARGIN, y: FOOTER }, end: { x: W - MARGIN, y: FOOTER }, thickness: 0.4, color: LINE });
    p.drawText(`Generated from the ${siteName} website`, { x: MARGIN, y: FOOTER - 11, size: 7.5, font: sansFont, color: MUTED });
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, { x: W - MARGIN - sansFont.widthOfTextAtSize(label, 7.5), y: FOOTER - 11, size: 7.5, font: sansFont, color: MUTED });
  });
  return pdf.save();
}
