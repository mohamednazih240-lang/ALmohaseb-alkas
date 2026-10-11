/**
 * High-performance, universal CSV / Excel export service with full UTF-8 BOM
 * support for crystal-clear Arabic text rendering across Microsoft Excel, Google Sheets,
 * and mobile office suites.
 */

function escapeCsvField(val: string | number | undefined | null): string {
  if (val === undefined || val === null) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Exports a single table with headers and data rows to a downloaded CSV/Excel file.
 */
export function exportTableToCsv(
  filename: string,
  headers: string[],
  rows: (string | number | undefined | null)[][]
): void {
  try {
    const csvRows: string[] = [];

    // Header row
    csvRows.push(headers.map(h => escapeCsvField(h)).join(','));

    // Data rows
    rows.forEach(row => {
      csvRows.push(row.map(cell => escapeCsvField(cell)).join(','));
    });

    const csvContent = '\uFEFF' + csvRows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const cleanFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    link.setAttribute('href', url);
    link.setAttribute('download', cleanFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Failed to export CSV:', err);
  }
}

/**
 * Exports multiple sections / tables to a single organized CSV file
 * (e.g. for batch export of multiple transactions or composite reports).
 */
export function exportMultipleTablesToCsv(
  filename: string,
  sections: {
    title?: string;
    headers: string[];
    rows: (string | number | undefined | null)[][];
    summary?: { label: string; value: string | number }[];
  }[]
): void {
  try {
    const csvLines: string[] = [];

    sections.forEach((sec, idx) => {
      if (idx > 0) {
        csvLines.push('');
        csvLines.push('----------------------------------------');
        csvLines.push('');
      }

      if (sec.title) {
        csvLines.push(escapeCsvField(sec.title));
      }

      csvLines.push(sec.headers.map(h => escapeCsvField(h)).join(','));

      sec.rows.forEach(r => {
        csvLines.push(r.map(c => escapeCsvField(c)).join(','));
      });

      if (sec.summary && sec.summary.length > 0) {
        csvLines.push('');
        sec.summary.forEach(sm => {
          csvLines.push(`${escapeCsvField(sm.label)},${escapeCsvField(sm.value)}`);
        });
      }
    });

    const csvContent = '\uFEFF' + csvLines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const cleanFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    link.setAttribute('href', url);
    link.setAttribute('download', cleanFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Failed to export multi-table CSV:', err);
  }
}
