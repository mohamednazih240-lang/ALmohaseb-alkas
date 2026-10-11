import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';

export interface PdfExportOptions {
  format?: 'a4' | 'a5' | 'thermal' | 'barcode';
  orientation?: 'portrait' | 'landscape';
  margin?: number;
  filename?: string;
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
      margin = 5,
      filename = `doc_${Date.now()}.pdf`
    } = options;

    // Render HTML element to high-res canvas using html2canvas-pro (full support for oklch, oklab & modern CSS)
    const canvas = await html2canvas(el, {
      scale: 2.5, // 2.5x for sharp crisp text and lines
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      onclone: (clonedDoc, clonedEl) => {
        // Normalize any modern CSS color functions for 100% fail-safe compatibility
        try {
          const styleTags = clonedDoc.querySelectorAll('style');
          styleTags.forEach(style => {
            if (style.textContent && style.textContent.includes('oklch')) {
              style.textContent = style.textContent.replace(/oklch\([^)]+\)/g, '#000000');
            }
          });
          const allEls = clonedEl.querySelectorAll('*');
          allEls.forEach(node => {
            const elem = node as HTMLElement;
            if (elem.style) {
              if (elem.style.color && elem.style.color.includes('oklch')) {
                elem.style.color = '#000000';
              }
              if (elem.style.backgroundColor && elem.style.backgroundColor.includes('oklch')) {
                elem.style.backgroundColor = '#ffffff';
              }
              if (elem.style.borderColor && elem.style.borderColor.includes('oklch')) {
                elem.style.borderColor = '#000000';
              }
            }
          });
        } catch {
          // Continue if dom traversal in clone encounters non-standard nodes
        }
      }
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

    if (format === 'a5') {
      const pdf = new jsPDF({
        orientation,
        unit: 'mm',
        format: 'a5'
      });
      const pageWidth = orientation === 'landscape' ? 210 : 148;
      const pageHeight = orientation === 'landscape' ? 148 : 210;
      const contentWidth = pageWidth - margin * 2;
      const contentHeight = (canvas.height * contentWidth) / canvas.width;

      if (contentHeight <= (pageHeight - margin * 2) * 1.1) {
        const fitHeight = Math.min(contentHeight, pageHeight - margin * 2);
        pdf.addImage(imgData, 'JPEG', margin, margin, contentWidth, fitHeight);
      } else {
        let heightLeft = contentHeight;
        let position = margin;
        const effectivePageHeight = pageHeight - margin * 2;
        pdf.addImage(imgData, 'JPEG', margin, position, contentWidth, contentHeight);
        heightLeft -= effectivePageHeight;
        while (heightLeft > 0) {
          position -= effectivePageHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'JPEG', margin, position, contentWidth, contentHeight);
          heightLeft -= effectivePageHeight;
        }
      }
      pdf.save(filename);
      return true;
    }

    // Standard A4 Layout
    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = orientation === 'landscape' ? 297 : 210;
    const pageHeight = orientation === 'landscape' ? 210 : 297;
    const contentWidth = pageWidth - margin * 2;
    const contentHeight = (canvas.height * contentWidth) / canvas.width;

    if (contentHeight <= (pageHeight - margin * 2) * 1.1) {
      // Single Page Fit
      const fitHeight = Math.min(contentHeight, pageHeight - margin * 2);
      pdf.addImage(imgData, 'JPEG', margin, margin, contentWidth, fitHeight);
    } else {
      // Multi-Page Slicing
      let heightLeft = contentHeight;
      let position = margin;
      const effectivePageHeight = pageHeight - margin * 2;

      pdf.addImage(imgData, 'JPEG', margin, position, contentWidth, contentHeight);
      heightLeft -= effectivePageHeight;

      while (heightLeft > 0) {
        position -= effectivePageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', margin, position, contentWidth, contentHeight);
        heightLeft -= effectivePageHeight;
      }
    }

    pdf.save(filename);
    return true;
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
