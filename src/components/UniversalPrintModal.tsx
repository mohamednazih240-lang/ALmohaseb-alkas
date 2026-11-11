import React, { useState } from 'react';
import { createPortal } from 'react-dom';
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
  autoPrint?: boolean;
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
  defaultPaperSize = 'A5',
  autoPrint = false
}) => {
  const [paperSize, setPaperSize] = useState<PaperSize>(defaultPaperSize);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportedSuccess, setExportedSuccess] = useState(false);
  const [fitScreen, setFitScreen] = useState(true);
  const [windowWidth, setWindowWidth] = useState<number>(() => typeof window !== 'undefined' ? window.innerWidth : 600);

  React.useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  React.useEffect(() => {
    if (isOpen && autoPrint && documents.length > 0) {
      const timer = setTimeout(() => {
        handlePrint();
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoPrint, documents]);

  const paperBaseWidth = paperSize === 'thermal' ? 300 : paperSize === 'A4' ? 794 : 560;
  const isNarrowScreen = windowWidth < paperBaseWidth + 24;
  const mobileScale = isNarrowScreen && fitScreen
    ? Math.max(0.48, (windowWidth - 28) / paperBaseWidth)
    : 1;

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
    printRoot.setAttribute('data-paper-size', paperSize);
    printRoot.innerHTML = contentEl.innerHTML;
    document.body.appendChild(printRoot);

    // 3. Inject exact dynamic @page rule
    const styleEl = document.createElement('style');
    styleEl.id = 'dynamic-paper-print-style';
    if (paperSize === 'A4') {
      styleEl.innerHTML = `
        @page { size: A4 portrait; margin: 8mm 10mm; }
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

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="invoice-modal-overlay fixed inset-0 z-[99999] bg-black/80 flex flex-col items-center justify-center p-0 sm:p-4 overflow-hidden">
      <div className="invoice-modal-card bg-white rounded-none sm:rounded-2xl w-full max-w-4xl h-full sm:h-auto sm:max-h-[96vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden relative">
        {/* Top Control Toolbar (Hidden when printing) */}
        <div className="no-print border-b border-slate-200 bg-slate-50 px-3 py-2 sm:px-4 sm:py-2.5 shrink-0 z-30 sticky top-0 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs sm:text-sm font-black text-slate-900 truncate">
              معاينة وطباعة ({documentTitle}) {documents.length > 1 ? `[${documents.length} حركة]` : ''}
            </h2>

            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Excel Export */}
              <button
                type="button"
                onClick={handleExportExcel}
                className="px-2.5 sm:px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                title="تصدير جدول البيانات بصيغة Excel"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                <span className="hidden xs:inline">Excel</span>
              </button>

              {/* Direct PDF Download */}
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isExportingPdf}
                className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                title="تصدير وتحميل PDF"
              >
                {isExportingPdf ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-600" />
                ) : exportedSuccess ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Download className="w-3.5 h-3.5 text-slate-700" />
                )}
                <span className="hidden xs:inline">{exportedSuccess ? 'تم التحميل!' : 'تحميل PDF'}</span>
              </button>

              {/* Prominent Instant Print Button */}
              <button
                type="button"
                onClick={handlePrint}
                className="px-3.5 sm:px-5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs sm:text-sm font-black transition-all flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                title="طباعة فورية بكامل الإطارات صفحة واحدة"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة فورية</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-black rounded-lg hover:bg-slate-200 cursor-pointer"
                title="إغلاق المعاينة"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Sub Row: Paper Size Selector */}
          <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-200/70 text-xs flex-wrap">
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold text-slate-500 ml-1">حجم الورق:</span>
              <div className="inline-flex bg-slate-200/80 rounded-lg p-0.5 font-bold">
                <button
                  type="button"
                  onClick={() => setPaperSize('A5')}
                  className={`px-2.5 py-0.5 rounded-md text-[11px] transition-all cursor-pointer ${
                    paperSize === 'A5' ? 'bg-blue-600 text-white shadow-xs font-black' : 'text-slate-600 hover:text-black'
                  }`}
                  title="مقاس A5 (نصف ورقة - 148×210 مم)"
                >
                  مقاس A5 (نصف ورقة - افتراضي)
                </button>
                <button
                  type="button"
                  onClick={() => setPaperSize('A4')}
                  className={`px-2.5 py-0.5 rounded-md text-[11px] transition-all cursor-pointer ${
                    paperSize === 'A4' ? 'bg-slate-900 text-white shadow-xs font-black' : 'text-slate-600 hover:text-black'
                  }`}
                  title="مقاس A4 (ورقة كاملة - 210×297 مم)"
                >
                  مقاس A4 (ورقة كاملة)
                </button>
                <button
                  type="button"
                  onClick={() => setPaperSize('thermal')}
                  className={`px-2.5 py-0.5 rounded-md text-[11px] transition-all cursor-pointer ${
                    paperSize === 'thermal' ? 'bg-slate-900 text-white shadow-xs font-black' : 'text-slate-600 hover:text-black'
                  }`}
                  title="طباعة حراري (80 مم)"
                >
                  حراري (80mm)
                </button>
              </div>
            </div>
            <span className="text-[10px] text-slate-500 hidden sm:inline font-medium">
              عرض A5 متناسق ومنظم صفحة واحدة بدون أي تمرير أفقي
            </span>
          </div>
        </div>

        {/* Printable Viewport */}
        <div className="invoice-preview-viewport p-2 sm:p-5 overflow-y-auto overflow-x-hidden flex-1 bg-slate-100 flex flex-col items-center gap-6 w-full">
          <div
            id="universal-printable-content"
            className={`w-full flex flex-col items-center gap-6 transition-all ${
              paperSize === 'A4'
                ? 'invoice-wrapper-A4'
                : paperSize === 'A5'
                ? 'invoice-wrapper-A5'
                : 'invoice-wrapper-thermal'
            }`}
            style={{
              maxWidth: paperSize === 'thermal' ? '320px' : paperSize === 'A4' ? '794px' : '560px',
              width: '100%'
            }}
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
                            style={{ maxHeight: '55px', maxWidth: '120px', objectFit: 'contain' }}
                            onError={(e) => ((e.target as HTMLElement).style.display = 'none')}
                          />
                        ) : null}
                      </div>

                      <div className="header-left">
                        {phoneList.length > 0 ? (
                          phoneList.map((ph, idx) => (
                            <div key={idx}>
                              <strong>{phoneList.length === 1 ? 'هاتف:' : `هاتف ${idx + 1}:`}</strong>{' '}
                              <bdi dir="ltr" className="font-mono">{ph}</bdi>
                            </div>
                          ))
                        ) : settings.phone ? (
                          <div><strong>هاتف:</strong> <bdi dir="ltr" className="font-mono">{settings.phone}</bdi></div>
                        ) : null}
                      </div>
                    </div>

                    {/* 2. صندوق البيانات المعتمد بدون أي تداخل أو انضغاط نصوص */}
                    <div className="invoice-info-box">
                      <div className="info-grid">
                        <div
                          className="info-col-right"
                          style={{
                            flex: '1.25 1 38%',
                            minWidth: '100px',
                            overflow: 'visible',
                            wordBreak: 'keep-all',
                            overflowWrap: 'break-word'
                          }}
                        >
                          {doc.partyCode && doc.partyCode !== doc.serialNo ? (
                            <div className="mb-0.5 text-[10px]">
                              <strong>الكود: </strong>
                              <bdi dir="ltr" className="font-mono font-bold mr-1">{doc.partyCode}</bdi>
                            </div>
                          ) : null}
                          <div className="text-[10.5px]">
                            <strong>{(doc.partyLabel || 'الطرف المعني').replace(/:+\s*$/, '')}: </strong>
                            <span className="font-bold">{doc.partyName || 'طرف نقدي عام'}</span>
                          </div>
                          {doc.partySubId ? (
                            <div className="text-[9.5px] mt-0.5 text-slate-700">
                              <strong>الهاتف / المعرف: </strong>
                              <span dir="ltr">{doc.partySubId}</span>
                            </div>
                          ) : null}
                        </div>

                        <div
                          className="info-col-center"
                          style={{
                            flex: '1 1 34%',
                            minWidth: '90px',
                            overflow: 'visible',
                            whiteSpace: 'normal',
                            wordBreak: 'keep-all',
                            overflowWrap: 'break-word'
                          }}
                        >
                          <div className="font-extrabold text-[11.5px] text-slate-900 leading-snug">{doc.typeTitle || doc.title}</div>
                          {doc.serialNo ? (
                            <div className="text-[10px] font-bold mt-0.5">
                              <span>رقم: </span>
                              <bdi dir="ltr" className="font-mono font-extrabold">{doc.serialNo}</bdi>
                            </div>
                          ) : null}
                          {doc.badge ? (
                            <div style={{ marginTop: '3px' }}>
                              <span className="payment-status-badge">{doc.badge}</span>
                            </div>
                          ) : null}
                        </div>

                        <div className="info-col-left" style={{ flex: '0 0 auto', minWidth: 'max-content', textAlign: 'start' }}>
                          <div className="text-[10px] whitespace-nowrap flex items-center gap-1 justify-start">
                            <strong className="whitespace-nowrap">التاريخ:</strong>
                            <span dir="ltr" className="font-mono font-bold whitespace-nowrap inline-block" style={{ wordBreak: 'keep-all', whiteSpace: 'nowrap' }}>
                              {doc.date || new Date().toISOString().slice(0, 10)}
                            </span>
                          </div>
                          {doc.time ? (
                            <div className="print-hide-time text-[9px] mt-0.5 text-slate-600 whitespace-nowrap flex items-center gap-1 justify-start">
                              <strong className="whitespace-nowrap">الوقت:</strong>
                              <span dir="ltr" className="font-mono whitespace-nowrap inline-block" style={{ wordBreak: 'keep-all', whiteSpace: 'nowrap' }}>
                                {doc.time}
                              </span>
                            </div>
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

                    {/* 4. جدول الأصناف والبيانات (أفقي متناسق بدون أي تمرير أو تداخل نهائياً) */}
                    <div className="table-wrapper">
                      <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                        <colgroup>
                          {doc.tableHeaders.map((th, thIdx) => (
                            <col
                              key={thIdx}
                              style={{
                                width: th.width || 'auto'
                              }}
                            />
                          ))}
                        </colgroup>
                        <thead>
                          <tr>
                            {doc.tableHeaders.map((th, thIdx) => (
                              <th
                                key={thIdx}
                                style={{
                                  width: th.width,
                                  textAlign: th.align || 'center',
                                  whiteSpace: 'normal',
                                  wordBreak: 'keep-all',
                                  overflowWrap: 'break-word',
                                  fontSize: paperSize === 'A5' ? '10px' : paperSize === 'thermal' ? '9px' : '11px',
                                  padding: '4px 5px',
                                  lineHeight: 1.25,
                                  overflow: 'hidden'
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
                                      wordBreak: 'keep-all',
                                      overflowWrap: 'break-word',
                                      padding: isDateCol ? '4px 5px' : '4px 4px',
                                      fontSize: paperSize === 'A5' ? '10px' : paperSize === 'thermal' ? '9px' : '11px',
                                      lineHeight: isTextCol ? 1.35 : 1.2,
                                      overflow: isDateCol ? 'visible' : 'hidden'
                                    }}
                                  >
                                    {isDateCol ? (
                                      <span
                                        dir="ltr"
                                        className="inline-block font-mono text-[9px] tabular-nums whitespace-nowrap px-0.5"
                                        style={{ wordBreak: 'keep-all', whiteSpace: 'nowrap', display: 'inline-block' }}
                                      >
                                        {col}
                                      </span>
                                    ) : isNumericCol ? (
                                      <span className="inline-block tabular-nums font-bold">
                                        {col}
                                      </span>
                                    ) : (
                                      col
                                    )}
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

        {/* Sticky Mobile/Desktop Bottom Action Bar */}
        <div className="no-print border-t border-slate-200 bg-white px-3 py-2 sm:px-4 sm:py-2.5 shrink-0 flex items-center justify-between gap-2 shadow-md z-30">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-2.5 sm:py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
            title="طباعة فورية للمستند الآن"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة المستند الآن ({paperSize === 'A5' ? 'مقاس A5' : paperSize === 'A4' ? 'مقاس A4' : 'حراري'})</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isExportingPdf}
            className="py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            title="تحميل PDF"
          >
            <Download className="w-4 h-4 text-slate-700" />
            <span className="hidden xs:inline">تحميل PDF</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 sm:py-3 px-3 sm:px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center cursor-pointer transition-all"
            title="إغلاق"
          >
            <span>إغلاق</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
