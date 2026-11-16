import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';
import { AppSettings } from '../types/accounting';

export interface PdfExportOptions {
  format?: 'a4' | 'a5' | 'thermal' | 'barcode';
  orientation?: 'portrait' | 'landscape';
  margin?: number;
  filename?: string;
}

export interface FinancialPdfKpi {
  label: string;
  value: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'info';
}

export interface FinancialPdfColumn {
  header: string;
  width?: string;
  align?: 'right' | 'center' | 'left';
  isNumeric?: boolean;
}

export interface FinancialPdfRow {
  cells: (string | number)[];
  isBold?: boolean;
  highlight?: boolean;
}

export interface FinancialPdfSummaryLine {
  label: string;
  value: string | number;
  isTotal?: boolean;
  highlight?: boolean;
}

export interface FinancialPdfReportConfig {
  title: string;
  subtitle?: string;
  serialNo?: string;
  date?: string;
  branchName?: string;
  partyLabel?: string;
  partyName?: string;
  partyCode?: string;
  partyPhone?: string;
  badge?: string;
  settings: AppSettings;
  kpis?: FinancialPdfKpi[];
  columns: FinancialPdfColumn[];
  rows: FinancialPdfRow[];
  totalsRow?: {
    cells: (string | number)[];
  };
  summaryLines?: FinancialPdfSummaryLine[];
  footerNotes?: string;
  filename?: string;
}

const escapeHtml = (val: string | number | undefined | null): string => {
  if (val === undefined || val === null) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const getKpiColors = (tone: FinancialPdfKpi['tone']) => {
  switch (tone) {
    case 'positive':
      return { bg: '#ecfdf5', border: '#a7f3d0', label: '#065f46', value: '#047857' };
    case 'negative':
      return { bg: '#fff1f2', border: '#fecdd3', label: '#9f1239', value: '#be123c' };
    case 'info':
      return { bg: '#eff6ff', border: '#bfdbfe', label: '#1e40af', value: '#1d4ed8' };
    default:
      return { bg: '#f8fafc', border: '#cbd5e1', label: '#475569', value: '#0f172a' };
  }
};

/**
 * Generates a structured, multi-page A4 Arabic financial report PDF using jsPDF.
 * Preserves full RTL typography, tabular financial alignment, company header, KPIs,
 * repeated table headers across page breaks, totals row, summary box, and page numbering.
 */
export async function exportFinancialReportToPdf(
  config: FinancialPdfReportConfig
): Promise<boolean> {
  if (typeof document === 'undefined') return false;

  const {
    title,
    subtitle,
    serialNo,
    date = new Date().toISOString().slice(0, 10),
    branchName,
    partyLabel,
    partyName,
    partyCode,
    partyPhone,
    badge,
    settings,
    kpis = [],
    columns,
    rows,
    totalsRow,
    summaryLines = [],
    footerNotes,
    filename = `financial_report_${Date.now()}.pdf`
  } = config;

  // Ensure web fonts (Cairo) are ready before measuring/rendering
  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Ignore font promise failure
    }
  }

  const sandbox = document.createElement('div');
  sandbox.setAttribute('data-pdf-sandbox', 'true');
  sandbox.style.cssText = [
    'position: fixed',
    'left: -12000px',
    'top: 0',
    'width: 794px',
    'background: #ffffff',
    'color: #0f172a',
    'direction: rtl',
    "font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif",
    'z-index: -1',
    'pointer-events: none'
  ].join(';');
  document.body.appendChild(sandbox);

  try {
    const A4_WIDTH_PX = 794;
    const A4_HEIGHT_PX = 1122; // 297mm @ 96dpi

    const phoneList = settings.phone
      ? settings.phone.split(/[,/\n]/).map(p => p.trim()).filter(Boolean)
      : [];
    const nowTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    const buildCompanyHeaderHtml = (isContinuation: boolean) => {
      if (isContinuation) {
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0f172a;padding-bottom:8px;margin-bottom:10px;">
            <div>
              <div style="font-size:13px;font-weight:800;color:#0f172a;">${escapeHtml(settings.company)} — ${escapeHtml(title)}</div>
              ${branchName ? `<div style="font-size:10px;color:#475569;font-weight:600;">الفرع: ${escapeHtml(branchName)}</div>` : ''}
            </div>
            <div style="font-size:10px;color:#334155;font-weight:700;text-align:left;" dir="ltr">
              ${serialNo ? `${escapeHtml(serialNo)} | ` : ''}${escapeHtml(date)}
            </div>
          </div>
        `;
      }

      return `
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:10px;gap:12px;">
          <div style="flex:1.25;text-align:right;">
            <div style="font-size:17px;font-weight:900;color:#0f172a;line-height:1.25;">${escapeHtml(settings.company)}</div>
            ${settings.address ? `<div style="font-size:10.5px;color:#475569;font-weight:600;margin-top:2px;">${escapeHtml(settings.address)}</div>` : ''}
            ${branchName ? `<div style="font-size:10.5px;color:#1e40af;font-weight:700;margin-top:2px;">الفرع: ${escapeHtml(branchName)}</div>` : ''}
          </div>
          ${settings.logo ? `
            <div style="flex:0 0 auto;text-align:center;">
              <img src="${escapeHtml(settings.logo)}" alt="logo" style="max-height:52px;max-width:96px;object-fit:contain;" />
            </div>
          ` : ''}
          <div style="flex:1;text-align:left;font-size:10px;font-weight:700;color:#334155;line-height:1.45;" dir="ltr">
            ${phoneList.map((ph, i) => `<div>Tel ${i + 1}: ${escapeHtml(ph)}</div>`).join('')}
            <div>Date: ${escapeHtml(date)} ${escapeHtml(nowTime)}</div>
          </div>
        </div>

        <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:10px 14px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:12px;">
          <div style="text-align:right;flex:1;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span style="font-size:14.5px;font-weight:900;color:#0f172a;">${escapeHtml(title)}</span>
              ${badge ? `<span style="background:#0f172a;color:#ffffff;font-size:9.5px;font-weight:800;padding:2px 8px;border-radius:5px;">${escapeHtml(badge)}</span>` : ''}
            </div>
            ${subtitle ? `<div style="font-size:10.5px;color:#475569;font-weight:600;margin-top:2px;">${escapeHtml(subtitle)}</div>` : ''}
          </div>
          <div style="text-align:left;font-size:10.5px;color:#1e293b;line-height:1.5;min-width:170px;">
            ${partyName ? `<div><span style="color:#64748b;font-weight:600;">${escapeHtml(partyLabel || 'البيان')}:</span> <strong>${escapeHtml(partyName)}</strong></div>` : ''}
            ${partyCode ? `<div><span style="color:#64748b;font-weight:600;">الكود:</span> <span style="font-family:monospace;font-weight:700;">${escapeHtml(partyCode)}</span></div>` : ''}
            ${partyPhone ? `<div><span style="color:#64748b;font-weight:600;">الهاتف:</span> <span dir="ltr" style="font-family:monospace;font-weight:700;">${escapeHtml(partyPhone)}</span></div>` : ''}
            ${serialNo ? `<div><span style="color:#64748b;font-weight:600;">المرجع:</span> <span dir="ltr" style="font-family:monospace;font-weight:700;">${escapeHtml(serialNo)}</span></div>` : ''}
          </div>
        </div>
      `;
    };

    const buildKpisHtml = () => {
      if (!kpis.length) return '';
      const cols = Math.min(kpis.length, 4);
      return `
        <div style="display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:8px;margin-bottom:10px;">
          ${kpis.map(k => {
            const c = getKpiColors(k.tone);
            return `
              <div style="background:${c.bg};border:1px solid ${c.border};border-radius:7px;padding:7px 10px;text-align:center;">
                <div style="font-size:9.5px;font-weight:700;color:${c.label};margin-bottom:2px;">${escapeHtml(k.label)}</div>
                <div style="font-size:12.5px;font-weight:900;color:${c.value};font-family:'Cairo',monospace;" dir="ltr">${escapeHtml(k.value)}</div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    };

    const buildTableHeadHtml = () => `
      <thead>
        <tr style="background:#0f172a;color:#ffffff;">
          ${columns.map(col => `
            <th style="padding:7px 8px;font-size:10.5px;font-weight:800;text-align:${col.align || 'center'};border:1px solid #334155;${col.width ? `width:${col.width};` : ''}white-space:nowrap;">
              ${escapeHtml(col.header)}
            </th>
          `).join('')}
        </tr>
      </thead>
    `;

    const buildRowHtml = (row: FinancialPdfRow, idx: number) => {
      const bg = row.highlight ? '#fef9c3' : (idx % 2 === 1 ? '#f8fafc' : '#ffffff');
      const weight = row.isBold ? '800' : '600';
      return `
        <tr style="background:${bg};page-break-inside:avoid;">
          ${columns.map((col, cIdx) => {
            const cellVal = row.cells[cIdx] ?? '';
            const align = col.align || 'center';
            const dirAttr = col.isNumeric ? 'dir="ltr"' : '';
            const numFont = col.isNumeric ? "font-family:'Cairo',monospace;font-variant-numeric:tabular-nums;" : '';
            return `
              <td ${dirAttr} style="padding:6px 8px;font-size:10px;font-weight:${weight};color:#0f172a;text-align:${align};border:1px solid #cbd5e1;line-height:1.4;word-break:break-word;${numFont}">
                ${escapeHtml(cellVal)}
              </td>
            `;
          }).join('')}
        </tr>
      `;
    };

    const buildTotalsRowHtml = () => {
      if (!totalsRow) return '';
      return `
        <tfoot>
          <tr style="background:#e2e8f0;color:#0f172a;">
            ${columns.map((col, cIdx) => {
              const cellVal = totalsRow.cells[cIdx] ?? '';
              const align = col.align || 'center';
              const dirAttr = col.isNumeric ? 'dir="ltr"' : '';
              return `
                <td ${dirAttr} style="padding:7px 8px;font-size:10.5px;font-weight:900;text-align:${align};border:1px solid #94a3b8;font-variant-numeric:tabular-nums;">
                  ${escapeHtml(cellVal)}
                </td>
              `;
            }).join('')}
          </tr>
        </tfoot>
      `;
    };

    const buildSummaryAndSignHtml = () => {
      const summaryHtml = summaryLines.length > 0 ? `
        <div style="margin-top:10px;border:1.5px solid #cbd5e1;border-radius:8px;overflow:hidden;background:#f8fafc;">
          ${summaryLines.map(line => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 12px;border-bottom:1px solid #e2e8f0;${line.isTotal ? 'background:#0f172a;color:#ffffff;font-weight:900;font-size:12px;' : line.highlight ? 'background:#fefce8;color:#0f172a;font-weight:800;font-size:10.5px;' : 'color:#1e293b;font-weight:700;font-size:10.5px;'}">
              <span>${escapeHtml(line.label)}</span>
              <span dir="ltr" style="font-family:'Cairo',monospace;font-variant-numeric:tabular-nums;">${escapeHtml(line.value)}</span>
            </div>
          `).join('')}
        </div>
      ` : '';

      const notesHtml = footerNotes ? `
        <div style="margin-top:8px;padding:7px 10px;background:#f8fafc;border-right:3px solid #0f172a;font-size:9.5px;font-weight:600;color:#334155;">
          ${escapeHtml(footerNotes)}
        </div>
      ` : '';

      const signaturesHtml = `
        <div style="margin-top:14px;padding-top:10px;border-top:1px dashed #cbd5e1;display:flex;justify-content:space-between;font-size:10px;font-weight:700;color:#475569;">
          <div>إعداد المحاسب: ....................................</div>
          <div>المراجعة والتدقيق: ....................................</div>
          <div>اعتماد الإدارة: ....................................</div>
        </div>
      `;

      return `${summaryHtml}${notesHtml}${signaturesHtml}`;
    };

    const createPageShell = (isContinuation: boolean) => {
      const pageEl = document.createElement('div');
      pageEl.style.cssText = [
        `width:${A4_WIDTH_PX}px`,
        `height:${A4_HEIGHT_PX}px`,
        'padding:26px 28px 22px 28px',
        'box-sizing:border-box',
        'background:#ffffff',
        'display:flex',
        'flex-direction:column',
        'justify-content:space-between',
        'overflow:hidden'
      ].join(';');

      const bodyEl = document.createElement('div');
      bodyEl.style.cssText = 'flex:1 1 auto;min-height:0;overflow:hidden;display:flex;flex-direction:column;';
      bodyEl.innerHTML = `
        ${buildCompanyHeaderHtml(isContinuation)}
        ${!isContinuation ? buildKpisHtml() : ''}
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;direction:rtl;">
          ${buildTableHeadHtml()}
          <tbody></tbody>
        </table>
      `;

      const footerEl = document.createElement('div');
      footerEl.style.cssText = 'flex-shrink:0;border-top:1px solid #cbd5e1;padding-top:6px;margin-top:8px;display:flex;justify-content:space-between;align-items:center;font-size:9.5px;color:#64748b;font-weight:700;';
      footerEl.innerHTML = `
        <span>تقرير مالي صادر من نظام ${escapeHtml(settings.company || 'حساباتي')}</span>
        <span data-page-label="true">صفحة 1 من 1</span>
      `;

      pageEl.appendChild(bodyEl);
      pageEl.appendChild(footerEl);
      return { pageEl, bodyEl, footerEl };
    };

    // Pack rows cleanly across discrete A4 pages using real DOM measurement
    const pages: { pageEl: HTMLDivElement; bodyEl: HTMLDivElement; footerEl: HTMLDivElement }[] = [];
    const safeMaxBodyHeight = A4_HEIGHT_PX - 26 - 22 - 34; // Header + Body must fit cleanly above footer

    let currentPage = createPageShell(false);
    sandbox.appendChild(currentPage.pageEl);
    pages.push(currentPage);

    const tbody = () => currentPage.bodyEl.querySelector('tbody')!;

    if (rows.length === 0) {
      tbody().innerHTML = `
        <tr>
          <td colspan="${columns.length}" style="padding:18px;text-align:center;color:#64748b;font-size:11px;font-weight:700;border:1px solid #cbd5e1;">
            لا توجد بيانات مسجلة ضمن نطاق هذا التقرير
          </td>
        </tr>
      `;
    } else {
      for (let i = 0; i < rows.length; i++) {
        const tempWrapper = document.createElement('tbody');
        tempWrapper.innerHTML = buildRowHtml(rows[i], i);
        const rowNode = tempWrapper.firstElementChild as HTMLTableRowElement;
        tbody().appendChild(rowNode);

        // If adding this row overflows the page body, move it onto a fresh continuation page
        if (currentPage.bodyEl.scrollHeight > safeMaxBodyHeight && tbody().children.length > 1) {
          tbody().removeChild(rowNode);
          currentPage = createPageShell(true);
          sandbox.appendChild(currentPage.pageEl);
          pages.push(currentPage);
          tbody().appendChild(rowNode);
        }
      }
    }

    // Append totals row onto last page's table if provided
    if (totalsRow) {
      const tableEl = currentPage.bodyEl.querySelector('table')!;
      const tfootHolder = document.createElement('table');
      tfootHolder.innerHTML = buildTotalsRowHtml();
      const tfootNode = tfootHolder.querySelector('tfoot');
      if (tfootNode) {
        tableEl.appendChild(tfootNode);
        if (currentPage.bodyEl.scrollHeight > safeMaxBodyHeight && tbody().children.length > 1) {
          // Move last row + tfoot to next page so totals never detach awkwardly
          const lastRow = tbody().lastElementChild;
          tableEl.removeChild(tfootNode);
          if (lastRow) tbody().removeChild(lastRow);

          currentPage = createPageShell(true);
          sandbox.appendChild(currentPage.pageEl);
          pages.push(currentPage);
          if (lastRow) tbody().appendChild(lastRow);
          currentPage.bodyEl.querySelector('table')!.appendChild(tfootNode);
        }
      }
    }

    // Append Summary & Signatures block
    const summaryContainer = document.createElement('div');
    summaryContainer.innerHTML = buildSummaryAndSignHtml();
    currentPage.bodyEl.appendChild(summaryContainer);

    if (currentPage.bodyEl.scrollHeight > safeMaxBodyHeight) {
      currentPage.bodyEl.removeChild(summaryContainer);
      const finalPage = document.createElement('div');
      finalPage.style.cssText = currentPage.pageEl.style.cssText;
      const finalBody = document.createElement('div');
      finalBody.style.cssText = 'flex:1 1 auto;min-height:0;overflow:hidden;display:flex;flex-direction:column;';
      finalBody.innerHTML = buildCompanyHeaderHtml(true);
      finalBody.appendChild(summaryContainer);

      const finalFooter = currentPage.footerEl.cloneNode(true) as HTMLDivElement;
      finalPage.appendChild(finalBody);
      finalPage.appendChild(finalFooter);
      sandbox.appendChild(finalPage);
      pages.push({ pageEl: finalPage, bodyEl: finalBody, footerEl: finalFooter });
    }

    // Stamp accurate page numbers (صفحة X من Y)
    const totalPages = pages.length;
    pages.forEach((p, idx) => {
      const labelEl = p.footerEl.querySelector('[data-page-label="true"]');
      if (labelEl) {
        labelEl.textContent = `صفحة ${idx + 1} من ${totalPages}`;
      }
    });

    // Compile all A4 pages into a single crisp jsPDF document
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i].pageEl, {
        scale: 2.2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: A4_WIDTH_PX,
        height: A4_HEIGHT_PX
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.96);
      if (i > 0) {
        pdf.addPage('a4', 'portrait');
      }
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    }

    pdf.save(filename);
    return true;
  } catch (err) {
    console.error('Failed to export structured financial PDF via jsPDF:', err);
    return false;
  } finally {
    sandbox.remove();
  }
}

/**
 * Exports an HTML element directly as a high-resolution, downloadable PDF file
 */
export async function downloadElementAsPdf(
  target: string | HTMLElement,
  options: PdfExportOptions = {}
): Promise<boolean> {
  try {
    const el: HTMLElement | null =
      typeof target === 'string' ? document.getElementById(target) : target;

    if (!el) {
      console.error('Target element for PDF export not found:', target);
      return false;
    }

    const {
      format = 'a4',
      orientation = 'portrait',
      filename = `doc_${Date.now()}.pdf`
    } = options;

    // Render HTML element to high-res canvas using html2canvas-pro (full support for oklch, oklab & modern CSS)
    const canvas = await html2canvas(el, {
      scale: 2.5, // 2.5x for sharp crisp text and lines
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.98);

    if (format === 'thermal') {
      // 80mm continuous roll
      const mmWidth = 80;
      const mmHeight = Math.max(100, (canvas.height * mmWidth) / canvas.width);

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [mmWidth, mmHeight]
      });

      pdf.addImage(imgData, 'JPEG', 0, 0, mmWidth, mmHeight);
      pdf.save(filename);
      return true;
    }

    if (format === 'barcode') {
      // Barcode labels sheet or single label
      const mmWidth = 100;
      const mmHeight = Math.max(50, (canvas.height * mmWidth) / canvas.width);

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [mmWidth, mmHeight]
      });

      pdf.addImage(imgData, 'JPEG', 0, 0, mmWidth, mmHeight);
      pdf.save(filename);
      return true;
    }

    if (format === 'a5' || format === 'a4') {
      const isA5 = format === 'a5';
      const pdf = new jsPDF({
        orientation,
        unit: 'mm',
        format: isA5 ? 'a5' : 'a4'
      });
      const pageWidth = orientation === 'landscape' ? (isA5 ? 210 : 297) : (isA5 ? 148 : 210);
      const pageHeight = orientation === 'landscape' ? (isA5 ? 148 : 210) : (isA5 ? 210 : 297);
      const safeMargin = isA5 ? 3.5 : 5;
      const maxAvailableWidth = pageWidth - safeMargin * 2;
      const maxAvailableHeight = pageHeight - safeMargin * 2;

      // Aspect ratio calculation to guarantee 100% single page fit
      const aspectRatio = canvas.width / canvas.height;
      let renderWidth = maxAvailableWidth;
      let renderHeight = renderWidth / aspectRatio;

      // If calculated height exceeds printable height, scale down by height to avoid breaking
      if (renderHeight > maxAvailableHeight) {
        renderHeight = maxAvailableHeight;
        renderWidth = renderHeight * aspectRatio;
      }

      // Center horizontally on page
      const posX = safeMargin + (maxAvailableWidth - renderWidth) / 2;
      const posY = safeMargin;

      pdf.addImage(imgData, 'JPEG', posX, posY, renderWidth, renderHeight);
      pdf.save(filename);
      return true;
    }

    return false;
  } catch (error) {
    console.error('Failed to generate PDF:', error);
    // Fallback: window.print()
    window.print();
    return false;
  }
}

/**
 * Generates visual SVG bars for Code 128 / EAN style barcodes
 */
export function generateBarcodePattern(text: string): boolean[] {
  // Simple deterministic pattern generator based on character codes
  const pattern: boolean[] = [true, false, true]; // start guard
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    for (let bit = 0; bit < 7; bit++) {
      pattern.push(((charCode >> bit) & 1) === 1);
    }
    pattern.push(false); // spacer
  }
  pattern.push(true, false, true, true); // stop guard
  return pattern;
}
