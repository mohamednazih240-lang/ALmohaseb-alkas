import React, { useState } from 'react';
import {
  Printer,
  Download,
  X,
  FileSpreadsheet,
  Loader2,
  Check,
  Maximize2
} from 'lucide-react';
import { AppSettings } from '../types/accounting';
import { downloadElementAsPdf } from '../services/printAndPdfService';
import { exportMultipleTablesToCsv } from '../services/exportService';
import { useModalBackHandler } from '../hooks/useModalBackHandler';

export type PaperSize = 'A4' | 'A5' | 'thermal';

export interface MovementPrintBlock {
  title: string;                 // e.g. 'سند قبض نقدية', 'تقفيل يومية / وردية', 'تقرير أرباح الفواتير'
  serialNo?: string;             // e.g. '#REC-104', '#SHIFT-01'
  date?: string;
  time?: string;
  partyLabel?: string;           // e.g. 'اسم العميل:', 'المسؤول:', 'المورد:', 'الخزينة:'
  partyName?: string;
  partyCode?: string;
  partySubId?: string;           // Phone or ID
  badge?: string;                // e.g. 'نقدي', 'مغلق', 'معتمد'
  typeTitle?: string;
  statement?: string;            // Statement / Notes / description / Tafqeet
  tableHeaders: { label: string; width?: string; align?: 'right' | 'center' | 'left' }[];
  tableRows: {
    cols: (string | number)[];
    isBold?: boolean;
    highlight?: boolean;
  }[];
  summaryLines?: {
    label: string;
    value: string | number;
    isTotal?: boolean;
    highlight?: boolean;
  }[];
  footerNotes?: string;
  createdBy?: string;
}

export interface UniversalPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentTitle: string;
  documents: MovementPrintBlock[];
  settings: AppSettings;
  defaultPaperSize?: PaperSize;
}

export const formatCleanNumber = (val: number | string | undefined): string => {
  if (val === undefined || val === null || val === '') return '0';
  const num = Number(val);
  if (isNaN(num)) return String(val);
  if (Math.abs(num - Math.round(num)) < 0.0001) {
    return Math.round(num).toString();
  }
  const fixed = num.toFixed(2);
  return fixed.endsWith('.00') ? fixed.slice(0, -3) : fixed.endsWith('0') ? fixed.slice(0, -1) : fixed;
};

export const UniversalPrintModal: React.FC<UniversalPrintModalProps> = ({
  isOpen,
  onClose,
  documentTitle,
  documents,
  settings,
  defaultPaperSize = 'A5'
}) => {
  const [paperSize, setPaperSize] = useState<PaperSize>(defaultPaperSize);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportedSuccess, setExportedSuccess] = useState(false);
  const [fitScreen, setFitScreen] = useState(true);

  // Mobile Back button support
  useModalBackHandler(isOpen, onClose, 'universal_print_modal');

  if (!isOpen || documents.length === 0) return null;

  const phoneList = settings.phone
    ? settings.phone.split(/[,/\n]/).map(p => p.trim()).filter(Boolean)
    : [];

  const handlePrint = () => {
    // 1. Remove any previous dynamic print styles or isolated roots
    const prevStyle = document.getElementById('dynamic-paper-print-style');
    if (prevStyle) prevStyle.remove();
    const oldRoot = document.getElementById('isolated-print-root');
    if (oldRoot) oldRoot.remove();

    // 2. Clone the printable content into an isolated top-level container on document.body
    const contentEl = document.getElementById('universal-printable-content');
    if (!contentEl) return;

    const printRoot = document.createElement('div');
    printRoot.id = 'isolated-print-root';
    printRoot.innerHTML = contentEl.innerHTML;
    document.body.appendChild(printRoot);

    // 3. Inject exact dynamic @page rule
    const styleEl = document.createElement('style');
    styleEl.id = 'dynamic-paper-print-style';
    if (paperSize === 'A4') {
      styleEl.innerHTML = `
        @page { size: A4 portrait; margin: 6mm 8mm; }
      `;
    } else if (paperSize === 'A5') {
      styleEl.innerHTML = `
        @page { size: A5 portrait; margin: 4mm 5mm; }
      `;
    } else {
      styleEl.innerHTML = `
        @page { size: 80mm auto; margin: 0; }
      `;
    }
    document.head.appendChild(styleEl);

    // 4. Set attributes for paper size & isolation
    document.body.classList.add('is-printing-isolated');
    document.body.setAttribute('data-paper-size', paperSize);

    // 5. Trigger print
    window.print();

    // 6. Cleanup after print dialog
    const cleanup = () => {
      document.body.classList.remove('is-printing-isolated');
      document.body.removeAttribute('data-paper-size');
      printRoot.remove();
      styleEl.remove();
    };

    window.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(cleanup, 2000);
  };

  const handleDownloadPdf = async () => {
    setIsExportingPdf(true);
    try {
      const format = paperSize === 'thermal' ? 'thermal' : paperSize === 'A5' ? 'a5' : 'a4';
      const filename = `${documentTitle.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
      const success = await downloadElementAsPdf('universal-printable-content', {
        format,
        filename
      });
      if (success) {
        setExportedSuccess(true);
        setTimeout(() => setExportedSuccess(false), 2500);
      }
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportExcel = () => {
    const sections = documents.map(doc => ({
      title: `${doc.title} ${doc.serialNo ? `(${doc.serialNo})` : ''} - التاريخ: ${doc.date || ''}`,
      headers: doc.tableHeaders.map(th => th.label),
      rows: doc.tableRows.map(tr => tr.cols),
      summary: doc.summaryLines?.map(sm => ({
        label: sm.label,
        value: sm.value
      }))
    }));

    const filename = `${documentTitle.replace(/\s+/g, '_')}_${Date.now()}.csv`;
    exportMultipleTablesToCsv(filename, sections);
  };

  return (
    <div className="invoice-modal-overlay fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-1 sm:p-4 overflow-y-auto">
      <div className="invoice-modal-card bg-white rounded-2xl w-full max-w-4xl max-h-[96vh] flex flex-col shadow-2xl border border-slate-200">
        {/* Top Control Toolbar (Hidden when printing) */}
        <div className="no-print flex items-center justify-between p-3 sm:p-3.5 border-b border-slate-200 bg-slate-50 rounded-t-2xl">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <h2 className="text-xs sm:text-sm font-black text-slate-900">
              معاينة وطباعة ({documentTitle}) {documents.length > 1 ? `[${documents.length} حركة]` : ''}
            </h2>

            {/* Paper Size Selector */}
            <div className="flex items-center bg-slate-200 rounded-lg p-0.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => setPaperSize('A5')}
                className={`px-2.5 sm:px-3 py-1 rounded-md transition-all cursor-pointer ${
                  paperSize === 'A5' ? 'bg-white text-slate-950 shadow-2xs font-black' : 'text-slate-600 hover:text-black'
                }`}
                title="مقاس A5 (نصف ورقة - 148×210 مم)"
              >
                مقاس A5 (نصف ورقة)
              </button>
              <button
                type="button"
                onClick={() => setPaperSize('A4')}
                className={`px-2.5 sm:px-3 py-1 rounded-md transition-all cursor-pointer ${
                  paperSize === 'A4' ? 'bg-white text-slate-950 shadow-2xs font-black' : 'text-slate-600 hover:text-black'
                }`}
                title="مقاس A4 (ورقة كاملة - 210×297 مم)"
              >
                مقاس A4 (ورقة كاملة)
              </button>
              <button
                type="button"
                onClick={() => setPaperSize('thermal')}
                className={`px-2.5 sm:px-3 py-1 rounded-md transition-all cursor-pointer ${
                  paperSize === 'thermal' ? 'bg-white text-slate-950 shadow-2xs font-black' : 'text-slate-600 hover:text-black'
                }`}
                title="طباعة حراري (80 مم)"
              >
                حراري (80mm)
              </button>
            </div>

            {/* Scale toggle */}
            <button
              type="button"
              onClick={() => setFitScreen(!fitScreen)}
              className={`hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                fitScreen
                  ? 'bg-slate-100 text-slate-800 border-slate-300'
                  : 'bg-white text-slate-600 border-slate-200'
              }`}
              title="ملاءمة العرض"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>{fitScreen ? 'ملاءمة العرض' : '100%'}</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Excel Export */}
            <button
              type="button"
              onClick={handleExportExcel}
              className="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              title="تصدير جدول البيانات بصيغة Excel"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              <span className="hidden xs:inline">Excel</span>
            </button>

            {/* Direct PDF Download */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExportingPdf}
              className={`px-3 py-1.5 sm:py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                exportedSuccess
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300'
              }`}
              title="تصدير وتحميل PDF"
            >
              {isExportingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-600" />
              ) : exportedSuccess ? (
                <Check className="w-4 h-4" />
              ) : (
                <Download className="w-4 h-4 text-slate-700" />
              )}
              <span className="hidden xs:inline">{exportedSuccess ? 'تم التحميل!' : 'تحميل PDF'}</span>
            </button>

            {/* Print Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 sm:px-4 py-1.5 sm:py-2 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="طباعة فورية"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة فورية</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-black rounded-lg hover:bg-slate-200 cursor-pointer"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Viewport */}
        <div className="invoice-preview-viewport p-2 sm:p-5 overflow-y-auto overflow-x-auto flex-1 bg-slate-100 flex flex-col items-center gap-6">
          <div
            id="universal-printable-content"
            className={`w-full flex flex-col items-center gap-6 transition-all ${
              paperSize === 'A4'
                ? 'invoice-wrapper-A4'
                : paperSize === 'A5'
                ? 'invoice-wrapper-A5'
                : 'invoice-wrapper-thermal'
            } ${fitScreen ? 'max-w-full' : ''}`}
            data-paper-size={paperSize}
          >
            {documents.map((doc, docIdx) => (
              <div
                key={docIdx}
                className="w-full flex flex-col items-center"
                style={{
                  pageBreakAfter: docIdx < documents.length - 1 ? 'always' : 'auto',
                  breakAfter: docIdx < documents.length - 1 ? 'page' : 'auto'
                }}
              >
                {/* الحاوية الرئيسية المعتمدة مع نفس التنسيقات والنسب بمقاس A5 */}
                <div className="invoice-container">
                  <div className="invoice-main-content">
                    {/* 1. الترويسة العلوية الثلاثية */}
                    <div className="company-header" id={`invoiceHeader-${docIdx}`}>
                      <div className="header-right">
                        <h2>{settings.company || 'اسم المنشأة'}</h2>
                        <p>{settings.address || 'المقر الرئيسي'}</p>
                      </div>

                      <div className="header-center">
                        {settings.logo ? (
                          <img
                            className="logo-img"
                            src={settings.logo}
                            alt="الشعار"
                            onError={(e) => ((e.target as HTMLElement).style.display = 'none')}
                          />
                        ) : null}
                      </div>

                      <div className="header-left">
                        <div><strong>هاتف 1:</strong> {phoneList[0] || settings.phone || '01000000000'}</div>
                        {phoneList[1] ? (
                          <div><strong>هاتف 2:</strong> {phoneList[1]}</div>
                        ) : null}
                      </div>
                    </div>

                    {/* 2. صندوق البيانات المعتمد */}
                    <div className="invoice-info-box">
                      <div className="info-grid">
                        <div className="info-col-right">
                          {doc.partyCode ? (
                            <>
                              <strong>الكود:</strong> <span>{doc.partyCode}</span><br />
                            </>
                          ) : null}
                          <strong>{doc.partyLabel || 'الطرف المعني'}:</strong> <span>{doc.partyName || 'طرف نقدي عام'}</span><br />
                          {doc.partySubId ? (
                            <>
                              <strong>الهاتف / المعرف:</strong> <span>{doc.partySubId}</span>
                            </>
                          ) : null}
                        </div>

                        <div className="info-col-center">
                          <strong>{doc.typeTitle || doc.title}</strong><br />
                          {doc.serialNo ? (
                            <span style={{ fontSize: '13px', fontWeight: 800 }}>رقم: <span>{doc.serialNo}</span></span>
                          ) : null}
                          {doc.badge ? (
                            <div style={{ marginTop: '2px' }}>
                              <span className="payment-status-badge">{doc.badge}</span>
                            </div>
                          ) : null}
                        </div>

                        <div className="info-col-left">
                          <strong>التاريخ:</strong> <span>{doc.date || new Date().toISOString().slice(0, 10)}</span><br />
                          {doc.time ? (
                            <span className="print-hide-time"><strong>الوقت:</strong> <span>{doc.time}</span></span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {/* 3. مستطيل البيان (يختفي تماماً إذا ترك فارغاً) */}
                    {doc.statement ? (
                      <div className="invoice-statement-box">
                        <strong>البيان: </strong>
                        <span>{doc.statement}</span>
                      </div>
                    ) : (
                      <div className="invoice-statement-box"></div>
                    )}

                    {/* 4. جدول الأصناف والبيانات (أفقي متناسق بدون أي تمرير) */}
                    <div className="table-wrapper">
                      <table>
                        <thead>
                          <tr>
                            {doc.tableHeaders.map((th, thIdx) => (
                              <th
                                key={thIdx}
                                style={{
                                  width: th.width,
                                  textAlign: th.align || 'center'
                                }}
                              >
                                {th.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {doc.tableRows.map((tr, trIdx) => (
                            <tr key={trIdx} className={tr.highlight ? 'bg-amber-50/50' : ''}>
                              {tr.cols.map((col, cIdx) => {
                                const headerLabel = (doc.tableHeaders[cIdx]?.label || '').trim();
                                const isTextCol = headerLabel.includes('بيان') || headerLabel.includes('مستند') || headerLabel.includes('اسم') || headerLabel.includes('وصف') || headerLabel.includes('مواصفات') || headerLabel.includes('تفاصيل');
                                const isDateCol = headerLabel.includes('تاريخ');
                                const isNumericCol = !isTextCol && !isDateCol && (typeof col === 'number' || /[\d]/.test(String(col)));

                                return (
                                  <td
                                    key={cIdx}
                                    style={{
                                      fontWeight: tr.isBold || cIdx === 0 ? 700 : 600,
                                      textAlign: doc.tableHeaders[cIdx]?.align || 'center',
                                      whiteSpace: isTextCol ? 'normal' : isDateCol || isNumericCol ? 'nowrap' : 'normal',
                                      wordBreak: isTextCol ? 'break-word' : 'normal',
                                      overflowWrap: 'break-word',
                                      fontVariantNumeric: isNumericCol || isDateCol ? 'tabular-nums' : 'normal',
                                      padding: '4px 4px',
                                      fontSize: paperSize === 'A5' ? '10px' : '11px',
                                      lineHeight: isTextCol ? 1.35 : 1.2
                                    }}
                                  >
                                    {col}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* 5. قسم الإجماليات وتفاصيل الدفع */}
                    {doc.summaryLines && doc.summaryLines.length > 0 && (
                      <div className="totals-section">
                        {doc.summaryLines.map((sm, smIdx) => (
                          <div
                            key={smIdx}
                            className="total-row"
                            style={{
                              fontWeight: sm.isTotal ? 900 : 700,
                              fontSize: sm.isTotal ? '12px' : '11px',
                              borderTop: sm.isTotal ? '1.5px dashed #000' : 'none',
                              paddingTop: sm.isTotal ? '4px' : '2px',
                              marginTop: sm.isTotal ? '3px' : '0'
                            }}
                          >
                            <span>{sm.label}:</span>
                            <span>{sm.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 6. التزييل الداخلي */}
                  <div className="invoice-bottom-notes">
                    <p>{doc.footerNotes || settings.notes || 'البضاعة المباعة ترد وتستبدل خلال 14 يوماً وفقاً للشروط والأحكام'}</p>
                    {doc.createdBy ? (
                      <p style={{ fontSize: '9px', fontWeight: 600, marginTop: '2px', color: '#444' }}>
                        المسؤول: {doc.createdBy}
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* 7. حقوق الملكية الفكرية المعتمدة للمطور */}
                <div className="copyright-footer">
                  حقوق الملكية الفكرية محفوظة لمطور النظام Mohamed Nazih ت01029190615
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
