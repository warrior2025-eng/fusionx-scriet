import { csvResponse, toCsv, type Column } from "@/lib/admin/csv";
import { PDF_TOO_MANY, PdfTooLarge, renderTablePdf } from "@/lib/admin/pdf-table";

/**
 * One export, two formats: ?format=pdf gives the PDF, anything else the CSV.
 * Both are made from the same rows and columns, so they can never differ.
 */

export type ExportFormat = "csv" | "pdf";

export const exportFormat = (url: URL): ExportFormat => (url.searchParams.get("format") === "pdf" ? "pdf" : "csv");

type TableExport<T> = {
  /** The file name, without the date or extension. */
  filename: string;
  /** Heading of the PDF. */
  title: string;
  /** For the PDF's header: label → what it was set to. */
  filters?: Record<string, string | null | undefined>;
  rows: T[];
  columns: Column<T>[];
};

/** `fullName`: the exact file name (no date added), as the slot list's CSV has always had. */
export async function pdfResponse<T>(table: TableExport<T>, fullName?: string): Promise<Response> {
  try {
    const bytes = await renderTablePdf(table);
    const name = fullName ?? `${table.filename}-${new Date().toISOString().slice(0, 10)}`;
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof PdfTooLarge) return new Response(PDF_TOO_MANY, { status: 413 });
    throw error;
  }
}

export async function exportResponse<T>(format: ExportFormat, table: TableExport<T>): Promise<Response> {
  return format === "pdf" ? pdfResponse(table) : csvResponse(table.filename, toCsv(table.rows, table.columns));
}
