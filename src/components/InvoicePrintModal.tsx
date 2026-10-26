import React, { useState } from 'react';
import {
  Printer,
  Download,
  X,
  Loader2,
  Check,
  Eye,
  Maximize2,
  ShieldCheck,
  History,
  User,
  Clock,
  Calendar,
  ArrowRight,
  PlusCircle,
  Edit,
  CheckCircle2
} from 'lucide-react';
import {
  Invoice,
  AppSettings,
  InvoiceAuditEntry
} from '../types/accounting';
import { downloadElementAsPdf } from '../services/printAndPdfService';
import { formatAuditDateTime } from './InvoiceAuditLogModal';

interface InvoicePrintModalProps {
  invoice: Invoice | null;
  settings: AppSettings;
  onClose: () => void;
}

export type PaperSize = 'A4' | 'A5' | 'thermal';

// Helper to format currency numbers cleanly with NO unnecessary fractional decimals (.00) and no floating point artifacts
export const formatMoneyClean = (val: number | string | undefined): string => {
  if (val === undefined || val === null || val === '') return '0';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return String(val);
  if (Math.abs(num - Math.round(num)) < 0.005) {
    return Math.round(num).toLocaleString('en-US');
  }
  const fixed = num.toFixed(2);
  const clean = fixed.endsWith('.00') ? fixed.slice(0, -3) : fixed.endsWith('0') ? fixed.slice(0, -1) : fixed;
  return Number(clean).toLocaleString('en-US');
};

export const InvoicePrintModal: React.FC<InvoicePrintModalProps> = ({
  invoice,
  settings,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'audit'>('preview');
  const [paperSize, setPaperSize] = useState<PaperSize>('A5');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportedSuccess, setExportedSuccess] = useState(false);
  const [fitScreen, setFitScreen] = useState(true);

  if (!invoice) return null;

  const isSale = invoice.type === 'sale';
  const customTitle = settings.invoiceTitle?.trim();
  const isTaxTitle = !customTitle || customTitle.includes('ضريب') || customTitle.includes('فاتورة مبيعات') || customTitle.includes('فاتورة ضريبية');
  const invoiceTypeTitle = isSale
    ? (isTaxTitle ? 'بيان' : customTitle)
    : 'بيان مشتريات';

  // Helper to extract sequential number starting from 1
  const formatInvoiceSerial = (rawNum: string | number | undefined): string => {
    if (!rawNum) return '1';
    const str = String(rawNum).trim();
    const digits = str.replace(/\D/g, '');
    if (digits) {
      const parsed = parseInt(digits, 10);
      return isNaN(parsed) || parsed === 0 ? '1' : String(parsed);
    }
    return str || '1';
  };
  const serialNo = formatInvoiceSerial(invoice.number);

  // Extract phone numbers into a list if multiple are provided
  const phoneList = settings.phone
    ? settings.phone.split(/[,/\n]/).map(p => p.trim()).filter(Boolean)
    : [];

  const handlePrint = () => {
    // 1. Remove any previous dynamic print styles
    const prevStyle = document.getElementById('dynamic-paper-print-style');
    if (prevStyle) prevStyle.remove();

    // 2. Inject exact dynamic @page rule and container rules calibrated to fit strictly without cutting borders or rows
    const styleEl = document.createElement('style');
    styleEl.id = 'dynamic-paper-print-style';
    if (paperSize === 'A4') {
      styleEl.innerHTML = `
        @page { size: A4 portrait; margin: 8mm 10mm; }
        @media print {
          html, body {
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            background: #ffffff !important;
          }
          #invoice-printable-content, .invoice-container {
            width: 100% !important;
            max-width: 190mm !important;
            height: auto !important;
            margin: 0 auto !important;
            padding: 6mm 8mm !important;
            border: 2px solid #000000 !important;
            box-sizing: border-box !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            overflow: visible !important;
            background: #ffffff !important;
          }
          tr, td, th {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          /* خلفية بيضاء نقية 100% بدون أي تظليل */
          table, th, td, tr, .info-box, .header, .invoice-header {
            background: #ffffff !important;
            background-color: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `;
    } else if (paperSize === 'A5') {
      styleEl.innerHTML = `
        @page { size: A5 portrait; margin: 6mm 7mm; }
        @media print {
          html, body {
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            background: #ffffff !important;
          }
          #invoice-printable-content, .invoice-container {
            width: 100% !important;
            max-width: 135mm !important;
            height: auto !important;
            margin: 0 auto !important;
            padding: 4mm 5mm !important;
            border: 1.5px solid #000000 !important;
            box-sizing: border-box !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            overflow: visible !important;
            background: #ffffff !important;
          }
          tr, td, th {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          table, th, td, tr, .info-box, .header, .invoice-header {
            background: #ffffff !important;
            background-color: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `;
    } else {
      styleEl.innerHTML = `
        @page { size: 80mm auto; margin: 0; }
        @media print {
          html, body {
            width: 80mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          #invoice-printable-content, .invoice-container {
            width: 76mm !important;
            max-width: 76mm !important;
            margin: 0 auto !important;
            padding: 3mm 2mm !important;
            border: 1px dashed #000000 !important;
            box-sizing: border-box !important;
            overflow: visible !important;
            background: #ffffff !important;
          }
          tr, td, th {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `;
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

  // Audit log data derivation
  const auditLogs: InvoiceAuditEntry[] = (invoice.auditLog && invoice.auditLog.length > 0)
    ? invoice.auditLog
    : [
        {
          id: 'aud_initial',
          action: 'create',
          actionTitle: 'إنشاء الفاتورة',
          userName: invoice.createdBy || 'مدير النظام',
          userId: invoice.createdById || 'usr_admin',
          userRole: 'مدير',
          timestamp: invoice.createdAt || `${invoice.date}T12:00:00Z`,
          formattedDate: invoice.date,
          formattedTime: invoice.time || '12:00',
          summary: `تم إنشاء الفاتورة لأول مرة بقيمة ${invoice.total.toLocaleString()} ${settings.currency || 'ر.س'} (${invoice.items.length} أصناف)`,
          newTotal: invoice.total,
          itemsCount: invoice.items.length
        }
      ];

  const creationEntry = auditLogs.find(l => l.action === 'create') || auditLogs[auditLogs.length - 1];
  const lastEditEntry = auditLogs.find(l => l.action === 'edit');
  const creationTimeFormatted = formatAuditDateTime(
    creationEntry?.timestamp || invoice.createdAt,
    creationEntry?.formattedDate || invoice.date,
    creationEntry?.formattedTime || invoice.time
  );
  const editTimeFormatted = lastEditEntry
    ? formatAuditDateTime(
        lastEditEntry.timestamp || invoice.updatedAt,
        lastEditEntry.formattedDate,
        lastEditEntry.formattedTime
      )
    : null;

  return (
    <div className="invoice-modal-overlay fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-1 sm:p-4 overflow-y-auto">
      <div className="invoice-modal-card bg-white rounded-2xl w-full max-w-4xl max-h-[96vh] flex flex-col shadow-2xl border border-slate-200">
        {/* Modal Controls (Hidden during print) */}
        <div className="no-print flex items-center justify-between p-3 sm:p-3.5 border-b border-slate-200 bg-slate-50 rounded-t-2xl">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <h2 className="text-xs sm:text-sm font-black text-slate-900">
              {activeTab === 'preview' ? `معاينة وطباعة (${invoice.number})` : `سجل الرقابة المالية والتدقيق (${invoice.number})`}
            </h2>

            {/* Tab Switcher: Preview vs Audit Log */}
            <div className="flex items-center bg-slate-200 rounded-lg p-0.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`px-2.5 sm:px-3 py-1 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'preview'
                    ? 'bg-white text-slate-950 shadow-2xs font-black'
                    : 'text-slate-600 hover:text-black'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>معاينة الفاتورة</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('audit')}
                className={`px-2.5 sm:px-3 py-1 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'audit'
                    ? 'bg-blue-600 text-white shadow-2xs font-black'
                    : 'text-slate-700 hover:text-blue-700'
                }`}
                title="عرض سجل تاريخ إنشاء وتعديل الفاتورة مع التواريخ والأوقات"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                <span>سجل الرقابة والتدقيق</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-mono ${
                  activeTab === 'audit' ? 'bg-white/20 text-white' : 'bg-slate-300 text-slate-700'
                }`}>
                  {auditLogs.length}
                </span>
              </button>
            </div>
            
            {/* Paper Size Selector (Only in preview tab) */}
            {activeTab === 'preview' && (
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
            )}

            {/* Scale toggle for mobile */}
            {activeTab === 'preview' && (
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
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {activeTab === 'preview' ? (
              <>
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
              </>
            ) : (
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 sm:px-4 py-1.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                title="طباعة تقرير سجل التدقيق"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة سجل التدقيق</span>
              </button>
            )}

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

        {activeTab === 'preview' ? (
          /* Invoice Printable Viewport */
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
            {/* حاوية المستند النظيفة بمقاس A5 الأصلي المعتمد */}
            <div className="invoice-container">
              <div className="invoice-main-content">
                {/* 1. الترويسة العلوية الثلاثية */}
                <div className="company-header">
                  <div className="header-right">
                    <h2>{settings.company || 'اسم الشركة'}</h2>
                    <p>{invoice.branchName || settings.address || 'المقر الرئيسي'}</p>
                  </div>
                  <div className="header-center">
                    {settings.logo ? (
                      <img
                        src={settings.logo}
                        alt="شعار الشركة"
                        className="logo-img"
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

                {/* 2. مربع بيانات المستند المعتمد */}
                <div className="invoice-info-box">
                  <div className="info-grid">
                    <div className="info-col-right">
                      <strong>كود {isSale ? 'العميل' : 'المورد'}:</strong> <span>{invoice.partyCode || invoice.partyId || '—'}</span><br />
                      <strong>اسم {isSale ? 'العميل' : 'المورد'}:</strong> <span>{invoice.partyName || (isSale ? 'عميل نقدي' : 'مورد عام')}</span><br />
                      <strong>الهاتف:</strong> <span>{invoice.partyPhone || '—'}</span>
                    </div>
                    <div className="info-col-center">
                      <strong>{invoiceTypeTitle}</strong><br />
                      <span style={{ fontSize: '13px', fontWeight: 800 }}>رقم: <span>{serialNo}</span></span>
                    </div>
                    <div className="info-col-left">
                      <strong>التاريخ:</strong> <span>{invoice.date}</span><br />
                      {invoice.time ? (
                        <span className="print-hide-time"><strong>الوقت:</strong> <span>{invoice.time}</span></span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* 3. مستطيل البيان (يختفي تماماً إذا ترك فارغاً) */}
                {invoice.notes || invoice.jobSite ? (
                  <div className="invoice-statement-box">
                    <strong>البيان: </strong>
                    <span>{invoice.notes || invoice.jobSite}</span>
                  </div>
                ) : (
                  <div className="invoice-statement-box"></div>
                )}

                {/* 4. جدول الأصناف (أفقي متناسق بدون أي تمرير) */}
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th className="col-item-name">اسم الصنف</th>
                        <th className="col-item-note">البيان</th>
                        <th className="col-item-qty">العدد</th>
                        <th className="col-item-price">السعر</th>
                        <th className="col-item-total">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="col-item-name">{it.productName}</td>
                          <td className="col-item-note">{it.spec || it.notes || it.unit || '—'}</td>
                          <td className="col-item-qty">{formatMoneyClean(it.qty)}</td>
                          <td className="col-item-price">{formatMoneyClean(it.unitPrice)}</td>
                          <td className="col-item-total">{formatMoneyClean(it.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 5. قسم الإجماليات وتفاصيل الدفع */}
                <div className="totals-section">
                  <div className="total-row">
                    <span>إجمالي الفاتورة:</span>
                    <span>{formatMoneyClean(invoice.total)} {settings.currency || 'ج.م'}</span>
                  </div>

                  <div className="total-row" style={{ borderTop: '1px dashed #666', paddingTop: '4px', marginTop: '3px' }}>
                    <span>طريقة الدفع: <span className="payment-status-badge">{(invoice.remaining || 0) <= 0 ? 'كاش / نقدي' : (invoice.paid || 0) <= 0 ? 'آجل ذمم' : 'سداد جزئي'}</span></span>
                    <span>المدفوع: <strong>{formatMoneyClean(invoice.paid || 0)} {settings.currency || 'ج.م'}</strong></span>
                  </div>

                  {(invoice.remaining || 0) > 0 ? (
                    <div className="total-row" style={{ color: '#b91c1c' }}>
                      <span>المبلغ المتبقي (الآجل):</span>
                      <strong>{formatMoneyClean(invoice.remaining)} {settings.currency || 'ج.م'}</strong>
                    </div>
                  ) : null}

                  {hasFees ? (
                    <div className="total-row" style={{ fontWeight: 600, fontSize: '11px', color: '#444' }}>
                      <span>رسوم النقل / الشحن:</span>
                      <span>{formatMoneyClean(feesAmount)} {settings.currency || 'ج.م'}</span>
                    </div>
                  ) : null}

                  {(invoice.tax || 0) > 0 ? (
                    <div className="total-row tax-discount-row" style={{ fontWeight: 600, fontSize: '11px', color: '#444' }}>
                      <span>الضريبة:</span>
                      <span>{formatMoneyClean(invoice.tax)} {settings.currency || 'ج.م'}</span>
                    </div>
                  ) : null}

                  {(invoice.discount || 0) > 0 ? (
                    <div className="total-row tax-discount-row" style={{ fontWeight: 600, fontSize: '11px', color: '#444' }}>
                      <span>الخصم:</span>
                      <span>{formatMoneyClean(invoice.discount)} {settings.currency || 'ج.م'}</span>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* 6. التزييل الداخلي */}
              <div className="invoice-bottom-notes">
                <p>{settings.notes || 'البضاعة المباعة ترد وتستبدل خلال 14 يوماً وفقاً للشروط والأحكام'}</p>
              </div>
            </div>

            {/* 7. حقوق الملكية الفكرية المعتمدة للمطور */}
            <div className="copyright-footer">
              حقوق الملكية الفكرية محفوظة لمطور النظام Mohamed Nazih ت01029190615
            </div>
          </div>
        </div>
      ) : (
          /* Audit Log Tab View */
          <div className="p-3.5 sm:p-6 overflow-y-auto flex-1 bg-slate-50 space-y-4 text-right">
            <div className="max-w-2xl mx-auto space-y-4">
              {/* Creator & Modifier Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-emerald-800 uppercase block">من قام بإنشاء الفاتورة</span>
                    <div className="flex items-center gap-2 mt-1">
                      <User className="w-4 h-4 text-emerald-700" />
                      <span className="font-black text-slate-900 text-sm">
                        {creationEntry.userName || invoice.createdBy || 'مدير النظام'}
                      </span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold">
                        {creationEntry.userRole || 'مدير'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-emerald-200/60 flex items-center justify-between text-[11px] text-emerald-950">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-emerald-600" />
                      <span>{creationTimeFormatted.date}</span>
                    </span>
                    <span className="font-mono font-bold flex items-center gap-1">
                      <Clock className="w-3 h-3 text-emerald-600" />
                      <span>{creationTimeFormatted.time}</span>
                    </span>
                  </div>
                </div>

                <div className={`border rounded-xl p-3.5 flex flex-col justify-between ${
                  lastEditEntry ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'
                }`}>
                  <div>
                    <span className={`text-[10px] font-bold uppercase block ${
                      lastEditEntry ? 'text-amber-800' : 'text-slate-500'
                    }`}>
                      آخر تعديل مسجل
                    </span>
                    {lastEditEntry ? (
                      <div className="flex items-center gap-2 mt-1">
                        <User className="w-4 h-4 text-amber-700" />
                        <span className="font-black text-slate-900 text-sm">{lastEditEntry.userName || invoice.updatedBy}</span>
                        {lastEditEntry.userRole && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold">
                            {lastEditEntry.userRole}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 mt-1 text-slate-500 text-xs font-medium">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>لم يطرأ أي تعديل (الفاتورة بحالتها الأصلية)</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                    {lastEditEntry && editTimeFormatted ? (
                      <>
                        <span className="text-amber-950 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-amber-600" />
                          <span>{editTimeFormatted.date}</span>
                        </span>
                        <span className="font-mono font-bold text-amber-950 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-600" />
                          <span>{editTimeFormatted.time}</span>
                        </span>
                      </>
                    ) : (
                      <span className="text-[10px] text-slate-400">إجمالي التعديلات: 0</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Certified Financial Overview */}
              <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3 text-xs flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">القيمة:</span>
                  <span className="font-mono font-black text-slate-900 text-sm">{invoice.total.toLocaleString()} {settings.currency || 'ر.س'}</span>
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                    {invoice.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-500 text-[11px]">
                  <span>الأصناف: <strong className="text-slate-800">{invoice.items.length}</strong></span>
                  <span>•</span>
                  <span>الفرع: <strong className="text-slate-800">{invoice.branchName || 'الرئيسي'}</strong></span>
                  <span>•</span>
                  <span>العمليات: <strong className="text-blue-700 font-mono font-bold">{auditLogs.length}</strong></span>
                </div>
              </div>

              {/* Timeline Tree */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <History className="w-4 h-4 text-blue-600" />
                    <span>التسلسل الزمني للرقابة المالية ({auditLogs.length})</span>
                  </h3>
                  <span className="text-[10px] text-slate-400">مرتب من الأحدث للأقدم</span>
                </div>

                <div className="relative pr-5 border-r-2 border-slate-200 space-y-3.5 my-2">
                  {auditLogs.map((log, idx) => {
                    const isCreation = log.action === 'create';
                    const tData = formatAuditDateTime(log.timestamp, log.formattedDate, log.formattedTime);
                    return (
                      <div key={log.id || idx} className="relative">
                        <div className={`absolute -right-[27px] top-1 w-4 h-4 rounded-full border-2 bg-white ${
                          isCreation ? 'border-emerald-600' : 'border-blue-600'
                        }`} />
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                          <div className="flex items-center justify-between flex-wrap gap-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                isCreation ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                              }`}>
                                {log.actionTitle || (isCreation ? 'إنشاء الفاتورة' : 'تعديل الفاتورة')}
                              </span>
                              <span className="text-xs font-bold text-slate-900">{log.userName}</span>
                              {log.userRole && <span className="text-[10px] text-slate-500">({log.userRole})</span>}
                            </div>
                            <span className="text-[10px] font-mono text-slate-500">
                              {tData.date} • {tData.time}
                            </span>
                          </div>
                          {log.summary && (
                            <p className="mt-1.5 text-xs text-slate-700 leading-relaxed font-sans">{log.summary}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Anti-fraud Notice */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-[11px] text-blue-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0" />
                <span>
                  نظام الرقابة المالية يسجل بصمة الوقت والاسم تلقائياً لكل عملية حفظ أو تعديل لضمان الشفافية ومكافحة التلاعب المالي.
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
