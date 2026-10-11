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
  partySubId?: string;           // Phone or ID
  badge?: string;                // e.g. 'نقدي', 'مغلق', 'معتمد'
  typeTitle?: string;
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
  if (Math.abs(num - Math.round(num)) < 0.001) {
    return Math.round(num).toString();
  }
  return num.toFixed(2);
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
    // 1. Remove any previous dynamic print styles
    const prevStyle = document.getElementById('dynamic-paper-print-style');
    if (prevStyle) prevStyle.remove();

    // 2. Inject exact dynamic @page rule with safe margins calibrated for each paper size
    const styleEl = document.createElement('style');
    styleEl.id = 'dynamic-paper-print-style';
    if (paperSize === 'A4') {
      styleEl.innerHTML = `@page { size: A4 portrait; margin: 4mm; }`;
    } else if (paperSize === 'A5') {
      styleEl.innerHTML = `@page { size: A5 portrait; margin: 3.5mm; }`;
    } else {
      styleEl.innerHTML = `@page { size: 80mm auto; margin: 0; }`;
    }
    document.head.appendChild(styleEl);

    // 3. Set attribute for paper size
    document.body.setAttribute('data-paper-size', paperSize);

    // 4. Trigger print
    window.print();

    // 5. Cleanup after print
    setTimeout(() => {
      document.body.removeAttribute('data-paper-size');
      styleEl.remove();
    }, 1500);
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
              >
                مقاس A5
              </button>
              <button
                type="button"
                onClick={() => setPaperSize('A4')}
                className={`px-2.5 sm:px-3 py-1 rounded-md transition-all cursor-pointer ${
                  paperSize === 'A4' ? 'bg-white text-slate-950 shadow-2xs font-black' : 'text-slate-600 hover:text-black'
                }`}
              >
                مقاس A4
              </button>
              <button
                type="button"
                onClick={() => setPaperSize('thermal')}
                className={`px-2.5 sm:px-3 py-1 rounded-md transition-all cursor-pointer ${
                  paperSize === 'thermal' ? 'bg-white text-slate-950 shadow-2xs font-black' : 'text-slate-600 hover:text-black'
                }`}
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
                {/* الحاوية الرئيسية المعتمدة مع نفس التنسيقات والنسب */}
                <div className="invoice-container w-full">
                  <div>
                    {/* 1. الترويسة الديناميكية */}
                    <div className="header invoice-header" id={`invoiceHeader-${docIdx}`}>
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
                          />
                        ) : null}
                      </div>

                      <div className="header-left">
                        <ul className="phones-list">
                          {phoneList.length > 0 ? (
                            phoneList.map((ph, idx) => (
                              <li key={idx}>{ph}</li>
                            ))
                          ) : settings.phone ? (
                            <li>{settings.phone}</li>
                          ) : null}
                        </ul>
                      </div>
                    </div>

                    {/* 2. صندوق البيانات المعتمد */}
                    <div className="info-box">
                      <div className="info-item" style={{ textAlign: 'right' }}>
                        <p>
                          <strong>{doc.partyLabel || 'الطرف المعني:'} </strong>
                          <span>{doc.partyName || '—'}</span>
                        </p>
                        {doc.partySubId ? (
                          <p>
                            <strong>الرقم / الهاتف: </strong>
                            <span>{doc.partySubId}</span>
                          </p>
                        ) : null}
                      </div>

                      <div className="info-item" style={{ textAlign: 'center' }}>
                        <p>
                          <strong>{doc.title}</strong>
                          {doc.serialNo ? (
                            <>
                              {' '} - <strong style={{ fontSize: '1rem' }}>{doc.serialNo}</strong>
                            </>
                          ) : null}
                        </p>
                        {doc.badge ? (
                          <p>
                            <strong>الحالة / الطريقة: </strong>
                            <span>{doc.badge}</span>
                          </p>
                        ) : null}
                      </div>

                      <div className="info-item" style={{ textAlign: 'left' }}>
                        <p>
                          <strong>التاريخ: </strong>
                          <span>{doc.date || new Date().toISOString().slice(0, 10)}</span>
                        </p>
                        <p>
                          <strong>الوقت: </strong>
                          <span>{doc.time || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                        </p>
                      </div>
                    </div>

                    {/* 3. جدول الأصناف / الحركات الأصلي المعتمد */}
                    <div className="table-wrapper">
                      <table className="items-table invoice-table">
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
                              {tr.cols.map((col, cIdx) => (
                                <td
                                  key={cIdx}
                                  style={{
                                    fontWeight: tr.isBold || cIdx === 0 ? 'bold' : 'normal',
                                    textAlign: doc.tableHeaders[cIdx]?.align || 'center'
                                  }}
                                >
                                  {col}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* 4. ملخص الحسابات السفلي الأصلي */}
                    {doc.summaryLines && doc.summaryLines.length > 0 && (
                      <div className="bottom-section">
                        <div className="summary-vertical-list">
                          {doc.summaryLines.map((sm, smIdx) => (
                            <div
                              key={smIdx}
                              className={`summary-line ${sm.isTotal ? 'total-line' : ''}`}
                            >
                              <span>{sm.label}:</span>
                              <span>{sm.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 5. تذييل الفاتورة والملاحظات */}
                  <div className="invoice-footer-note">
                    <div>
                      {doc.footerNotes || settings.notes || 'شكراً لتعاملكم معنا'}
                    </div>
                    <div>
                      {doc.createdBy ? `المسؤول: ${doc.createdBy}` : ''}
                    </div>
                  </div>
                </div>

                {/* حقوق الملكية الخارجية المعتمدة */}
                <div className="copyright-outside">
                  Powered by Hesabaty System
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
