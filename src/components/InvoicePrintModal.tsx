import React, { useState } from 'react';
import {
  Printer,
  Download,
  X,
  Loader2,
  Check,
  Eye,
  Maximize2
} from 'lucide-react';
import {
  Invoice,
  AppSettings
} from '../types/accounting';
import { downloadElementAsPdf } from '../services/printAndPdfService';

interface InvoicePrintModalProps {
  invoice: Invoice | null;
  settings: AppSettings;
  onClose: () => void;
}

export type PaperSize = 'A4' | 'A5' | 'thermal';

// Helper to format currency numbers cleanly with NO unnecessary fractional decimals (.00)
export const formatMoneyClean = (val: number | string | undefined): string => {
  const num = Number(val) || 0;
  // If it's an integer (no fractions), show without .00 (e.g. 580 instead of 580.00)
  if (Math.abs(num - Math.round(num)) < 0.001) {
    return Math.round(num).toString();
  }
  return num.toFixed(2);
};

export const InvoicePrintModal: React.FC<InvoicePrintModalProps> = ({
  invoice,
  settings,
  onClose
}) => {
  const [paperSize, setPaperSize] = useState<PaperSize>('A5');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportedSuccess, setExportedSuccess] = useState(false);
  const [fitScreen, setFitScreen] = useState(true);

  if (!invoice) return null;

  const isSale = invoice.type === 'sale';
  const invoiceTypeTitle = isSale ? (settings.invoiceTitle || 'فاتورة مبيعات') : 'فاتورة مشتريات';

  // Extract phone numbers into a list if multiple are provided
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

    // 5. Cleanup after print dialog
    setTimeout(() => {
      document.body.removeAttribute('data-paper-size');
      styleEl.remove();
    }, 1500);
  };

  const handleDownloadPdf = async () => {
    setIsExportingPdf(true);
    try {
      const format = paperSize === 'thermal' ? 'thermal' : paperSize === 'A5' ? 'a5' : 'a4';
      const success = await downloadElementAsPdf('invoice-printable-content', {
        format,
        filename: `${invoice.number}_${invoice.date}.pdf`
      });
      if (success) {
        setExportedSuccess(true);
        setTimeout(() => setExportedSuccess(false), 2500);
      }
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Check if there are delivery/transport fees or extra charges
  const hasFees = !!invoice.deliveryFee && invoice.deliveryFee > 0;
  const feesAmount = invoice.deliveryFee || 0;

  return (
    <div className="invoice-modal-overlay fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-1 sm:p-4 overflow-y-auto">
      <div className="invoice-modal-card bg-white rounded-2xl w-full max-w-4xl max-h-[96vh] flex flex-col shadow-2xl border border-slate-200">
        {/* Modal Controls (Hidden during print) */}
        <div className="no-print flex items-center justify-between p-3 sm:p-3.5 border-b border-slate-200 bg-slate-50 rounded-t-2xl">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <h2 className="text-xs sm:text-sm font-black text-slate-900">
              معاينة وطباعة ({invoice.number})
            </h2>
            
            {/* Paper Size Selector (A4, A5, Thermal) */}
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

            {/* Scale toggle for mobile */}
            <button
              type="button"
              onClick={() => setFitScreen(!fitScreen)}
              className={`hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                fitScreen
                  ? 'bg-slate-100 text-slate-800 border-slate-300'
                  : 'bg-white text-slate-600 border-slate-200'
              }`}
              title="ملاءمة الشاشة / الحجم الكامل"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>{fitScreen ? 'ملاءمة العرض' : '100%'}</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
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
              title="تصدير وتحميل PDF صفحة واحدة كاملة"
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

            {/* Instant Print Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 sm:px-4 py-1.5 sm:py-2 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="طباعة فورية بكامل الإطارات صفحة واحدة"
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

        {/* Invoice Printable Viewport */}
        <div className="invoice-preview-viewport p-2 sm:p-5 overflow-y-auto overflow-x-auto flex-1 bg-slate-100 flex flex-col items-center">
          <div
            id="invoice-printable-content"
            className={`transition-all ${
              paperSize === 'A4'
                ? 'invoice-wrapper-A4'
                : paperSize === 'A5'
                ? 'invoice-wrapper-A5'
                : 'invoice-wrapper-thermal'
            } ${fitScreen ? 'max-w-full' : ''}`}
            data-paper-size={paperSize}
          >
            <div className="invoice-container">
              <div>
                {/* 1. الترويسة الديناميكية */}
                <div className="invoice-header" id="invoiceHeader">
                  <div className="header-right">
                    <h2 id="settingCompanyName">{settings.company || 'اسم المنشأة'}</h2>
                    <p id="settingCompanyAddress">{settings.address || 'المقر الرئيسي'}</p>
                  </div>
                  
                  <div className="header-center">
                    {settings.logo ? (
                      <img
                        id="settingCompanyLogo"
                        className="logo-img"
                        src={settings.logo}
                        alt="الشعار"
                      />
                    ) : null}
                  </div>
                  
                  <div className="header-left">
                    <ul className="phones-list" id="settingPhonesList">
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

                {/* 2. صندوق البيانات */}
                <div className="info-box">
                  <div className="info-item" style={{ textAlign: 'right' }}>
                    <p>
                      <strong>اسم العميل: </strong>
                      <span id="lblClientName">{invoice.partyName || 'عميل نقدي'}</span>
                    </p>
                    <p>
                      <strong>رقم العميل: </strong>
                      <span id="lblClientId">{invoice.partyPhone || invoice.partyId || '—'}</span>
                    </p>
                  </div>
                  
                  <div className="info-item" style={{ textAlign: 'center' }}>
                    <p>
                      <strong id="lblInvoiceType">{invoiceTypeTitle}</strong> -{' '}
                      <strong style={{ fontSize: '1rem' }}>
                        #<span id="lblSerialNo">{invoice.number}</span>
                      </strong>
                    </p>
                    <p>
                      <strong>وسيلة الدفع: </strong>
                      <span id="lblPaymentMethod">{invoice.paymentMethod || 'نقدي'}</span>
                    </p>
                  </div>
                  
                  <div className="info-item" style={{ textAlign: 'left' }}>
                    <p>
                      <strong>التاريخ: </strong>
                      <span id="lblInvoiceDate">{invoice.date}</span>
                    </p>
                    <p>
                      <strong>الوقت: </strong>
                      <span id="lblInvoiceTime">
                        {invoice.time || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </p>
                  </div>
                </div>

                {/* 3. جدول الأصناف (بدون أعمدة خصم أو ضريبة وبدون كسور للأرقام) */}
                <div className="table-wrapper">
                  <table className="invoice-table">
                    <thead>
                      <tr>
                        <th style={{ width: '38%' }}>اسم الصنف</th>
                        <th style={{ width: '30%' }}>الوصف</th>
                        <th style={{ width: '10%' }}>العدد</th>
                        <th style={{ width: '10%' }}>السعر</th>
                        <th style={{ width: '12%' }}>الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody id="invoiceTable">
                      {invoice.items.map((it, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 'bold' }}>{it.productName}</td>
                          <td style={{ color: '#333' }}>{it.notes || it.unit || '—'}</td>
                          <td>{formatMoneyClean(it.qty)}</td>
                          <td>{formatMoneyClean(it.unitPrice)}</td>
                          <td style={{ fontWeight: 'bold' }}>{formatMoneyClean(it.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 4. ملخص الحسابات (بدون إظهار أسطر الخصم والضريبة التفصيلية، وتظهر الرسوم والمدفوع والمتبقي فقط عند وجودها وبدون كسور .00) */}
                <div className="bottom-section">
                  <div className="summary-vertical-list">
                    {/* النقل / الرسوم (تظهر فقط عند وجودها) */}
                    {hasFees && (
                      <div className="summary-line" id="row-fees">
                        <span id="lbl-fees">نقل:</span>
                        <span id="val-fees">{formatMoneyClean(feesAmount)}</span>
                      </div>
                    )}

                    {/* صافي القيمة / الإجمالي */}
                    <div className="summary-line total-line" id="row-total">
                      <span>صافي القيمة / الإجمالي:</span>
                      <span id="val-total">{formatMoneyClean(invoice.total)}</span>
                    </div>

                    {/* المبلغ المدفوع */}
                    <div className="summary-line" id="row-paid">
                      <span>المبلغ المدفوع:</span>
                      <span id="val-paid">{formatMoneyClean(invoice.paid || 0)}</span>
                    </div>

                    {/* المبلغ المتبقي (يظهر فقط إذا كان أكبر من الصفر) */}
                    {(invoice.remaining || 0) > 0 && (
                      <div className="summary-line" id="row-remaining">
                        <span>المبلغ المتبقي:</span>
                        <span id="val-remaining">{formatMoneyClean(invoice.remaining)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 5. تذييل الفاتورة والملاحظات */}
              <div className="invoice-footer-note">
                <div id="settingFooterNotes">
                  {settings.notes || 'شكراً لتعاملكم معنا'}
                </div>
                <div id="lblInvoiceCreatedBy">
                  {invoice.createdBy ? `المسؤول: ${invoice.createdBy}` : ''}
                </div>
              </div>
            </div>

            {/* حقوق النظام الخارجية */}
            <div className="copyright-outside">
              Powered by Hesabaty System
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
