import React, { useState } from 'react';
import { createPortal } from 'react-dom';
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
  autoPrint?: boolean;
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
  onClose,
  autoPrint = false
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'audit'>('preview');
  const [paperSize, setPaperSize] = useState<PaperSize>('A5');
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
    if (autoPrint && invoice) {
      const timer = setTimeout(() => {
        handlePrint();
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [autoPrint, invoice?.id]);

  const paperBaseWidth = paperSize === 'thermal' ? 300 : paperSize === 'A4' ? 794 : 560;
  const isNarrowScreen = windowWidth < paperBaseWidth + 24;
  const mobileScale = isNarrowScreen && fitScreen
    ? Math.max(0.48, (windowWidth - 28) / paperBaseWidth)
    : 1;

  if (!invoice) return null;

  const isSale = invoice.type === 'sale';
  const customTitle = settings.invoiceTitle?.trim();
  const isTaxTitle = !customTitle || customTitle.includes('ضريب') || customTitle.includes('فاتورة مبيعات') || customTitle.includes('فاتورة ضريبية');
  const invoiceTypeTitle = isSale
    ? (isTaxTitle ? 'بيان' : customTitle)
    : 'بيان مشتريات';

  // Helper to extract sequential number starting from 1
  const rawInvoiceNo = invoice.number?.trim() || (invoice as any).id?.replace(/\D/g, '') || '1';
  const formatInvoiceSerial = (rawNum: string | number | undefined): string => {
    if (!rawNum) return '1';
    const str = String(rawNum).trim();
    return str || '1';
  };
  const serialNo = formatInvoiceSerial(rawInvoiceNo);

  // Extract phone numbers into a list if multiple are provided
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
    const contentEl = document.getElementById('invoice-printable-content');
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

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="invoice-modal-overlay fixed inset-0 z-[99999] bg-black/80 flex items-center justify-center p-0 sm:p-4 overflow-hidden">
      <div className="invoice-modal-card bg-white rounded-none sm:rounded-2xl w-full max-w-4xl h-full sm:h-auto sm:max-h-[96vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden relative">
        {/* Modal Controls (Hidden during print) */}
        <div className="no-print border-b border-slate-200 bg-slate-50 px-3 py-2 sm:px-4 sm:py-2.5 shrink-0 sticky top-0 z-30 shadow-2xs">
          {/* Top Row: Title, Tabs, Actions, Close */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xs sm:text-sm font-black text-slate-900">
                معاينة الفاتورة ({rawInvoiceNo})
              </h2>

              {/* Tab Switcher: Preview vs Audit Log */}
              <div className="inline-flex bg-slate-200/80 rounded-lg p-0.5 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 cursor-pointer ${
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
                  className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 cursor-pointer ${
                    activeTab === 'audit'
                      ? 'bg-blue-600 text-white shadow-2xs font-black'
                      : 'text-slate-700 hover:text-blue-700'
                  }`}
                  title="عرض سجل تاريخ إنشاء وتعديل الفاتورة"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>التدقيق ({auditLogs.length})</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              {activeTab === 'preview' ? (
                <>
                  {/* Direct PDF Download */}
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    disabled={isExportingPdf}
                    className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                    title="تصدير وتحميل PDF صفحة واحدة كاملة"
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

                  {/* Instant Print Button */}
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="px-3.5 sm:px-5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs sm:text-sm font-black transition-all flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                    title="طباعة فورية بكامل الإطارات صفحة واحدة"
                  >
                    <Printer className="w-4 h-4" />
                    <span>طباعة الفاتورة</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 sm:px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                  title="طباعة تقرير سجل التدقيق"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-500 hover:text-black rounded-lg hover:bg-slate-200 cursor-pointer"
                title="إغلاق المعاينة"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Sub Row: Paper Size Selector (Only in preview tab) */}
          {activeTab === 'preview' && (
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
          )}
        </div>

        {activeTab === 'preview' ? (
          /* Invoice Printable Viewport */
          <div className="invoice-preview-viewport p-2 sm:p-5 overflow-y-auto overflow-x-hidden flex-1 bg-slate-100 flex flex-col items-center w-full">
            <div
              id="invoice-printable-content"
              className={`w-full flex flex-col items-center transition-all ${
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
                        style={{ maxHeight: '55px', maxWidth: '120px', objectFit: 'contain' }}
                        onError={(e) => ((e.target as HTMLElement).style.display = 'none')}
                      />
                    ) : null}
                  </div>
                  <div className="header-left">
                    <div><strong>هاتف:</strong> {settings.phone || phoneList[0] || '—'}</div>
                    {phoneList[1] ? (
                      <div><strong>هاتف 2:</strong> {phoneList[1]}</div>
                    ) : null}
                  </div>
                </div>

                {/* 2. مربع بيانات المستند المعتمد بدون أي تداخل نصوص */}
                <div className="invoice-info-box">
                  <div className="info-grid">
                    <div className="info-col-right" style={{ flex: '1.4', overflow: 'hidden' }}>
                      <div className="text-[10px] mb-0.5">
                        <strong>كود {isSale ? 'العميل' : 'المورد'}: </strong>
                        <bdi dir="ltr" className="font-mono font-bold mr-1">{invoice.partyCode || invoice.partyId || '—'}</bdi>
                      </div>
                      <div className="text-[10.5px]">
                        <strong>اسم {isSale ? 'العميل' : 'المورد'}: </strong>
                        <span className="font-bold">{invoice.partyName || (isSale ? 'عميل نقدي' : 'مورد عام')}</span>
                      </div>
                      {invoice.partyPhone ? (
                        <div className="text-[9.5px] mt-0.5 text-slate-700">
                          <strong>الهاتف: </strong>
                          <span dir="ltr">{invoice.partyPhone}</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="info-col-center" style={{ flex: '1', overflow: 'hidden' }}>
                      <div className="font-extrabold text-[12px] text-slate-900">{invoiceTypeTitle}</div>
                      <div className="text-[10.5px] font-bold mt-0.5">
                        <span>رقم: </span>
                        <bdi dir="ltr" className="font-mono font-extrabold">{serialNo}</bdi>
                      </div>
                    </div>

                    <div className="info-col-left" style={{ flex: '0 0 auto', minWidth: 'max-content', textAlign: 'start' }}>
                      <div className="text-[10.5px] whitespace-nowrap flex items-center gap-1 justify-start">
                        <strong className="whitespace-nowrap">التاريخ:</strong>
                        <span dir="ltr" className="font-mono font-bold whitespace-nowrap inline-block" style={{ wordBreak: 'keep-all', whiteSpace: 'nowrap' }}>
                          {invoice.date}
                        </span>
                      </div>
                      {invoice.time ? (
                        <div className="print-hide-time text-[9px] mt-0.5 text-slate-600 whitespace-nowrap flex items-center gap-1 justify-start">
                          <strong className="whitespace-nowrap">الوقت:</strong>
                          <span dir="ltr" className="font-mono whitespace-nowrap inline-block" style={{ wordBreak: 'keep-all', whiteSpace: 'nowrap' }}>
                            {invoice.time}
                          </span>
                        </div>
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
                  <div className="total-row" style={{ color: '#475569', fontSize: '10px' }}>
                    <span>إجمالي عدد الأصناف / الكميات:</span>
                    <strong className="font-mono text-slate-800">{formatMoneyClean(invoice.items.reduce((s, it) => s + (Number(it.qty) || 0), 0))}</strong>
                  </div>

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

              {/* 7. حقوق الملكية الفكرية المعتمدة للمطور */}
              <div className="copyright-footer">
                حقوق الملكية الفكرية محفوظة لمطور النظام Mohamed Nazih ت01029190615
              </div>
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

        {/* Sticky Mobile/Desktop Bottom Action Bar */}
        <div className="no-print border-t border-slate-200 bg-white px-3 py-2 sm:px-4 sm:py-2.5 shrink-0 flex items-center justify-between gap-2 shadow-md z-30">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-2.5 sm:py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
            title="طباعة الفاتورة فوراً"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة الفاتورة الآن ({paperSize === 'A5' ? 'مقاس A5' : paperSize === 'A4' ? 'مقاس A4' : 'حراري'})</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isExportingPdf}
            className="py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            title="تحميل الفاتورة PDF"
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
