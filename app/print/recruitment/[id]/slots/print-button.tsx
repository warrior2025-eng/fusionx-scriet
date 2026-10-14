"use client";

/** Opens the browser's print dialog (choose "Save as PDF" there for a file). Not printed itself. */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="no-print border border-black px-3 py-1.5 text-sm font-medium">
      Print / Save as PDF
    </button>
  );
}
