import React, { useState } from 'react';
import {
  Printer,
  Download,
  X,
  Building2,
  QrCode,
  FileText,
  Loader2,
  Check
} from 'lucide-react';
import {
  Invoice,
  AppSettings
} from '../types/accounting';
import { formatMoney } from '../services/accountingStorage';
import { downloadElementAsPdf, generateBarcodePattern } from '../services/printAndPdfService';

interface InvoicePrintModalProps {
  invoice: Invoice | null;
  settings: AppSettings;
  onClose: () => void;
}

export const InvoicePrintModal: React.FC<InvoicePrintModalProps> = ({
  invoice,
  settings,
  onClose
}) => {
  const [printLayout, setPrintLayout] = useState<'a4' | 'thermal'>('a4');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportedSuccess, setExportedSuccess] = useState(false);

  if (!invoice) return null;

  const isSale = invoice.type === 'sale';

  const handlePrint = () => {
    if (printLayout === 'thermal') {
      document.body.classList.add('printing-thermal');
    } else {
      document.body.classList.remove('printing-thermal');
    }
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-thermal');
    }, 1000);
  };

  const handleDownloadPdf = async () => {
    setIsExportingPdf(true);
    try {
      const success = await downloadElementAsPdf('invoice-printable-content', {
        format: printLayout === 'thermal' ? 'thermal' : 'a4',
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

  const barcodePattern = generateBarcodePattern(invoice.number);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[94vh] flex flex-col shadow-2xl border border-slate-200">
        {/* Modal Controls (Not printed) */}
        <div className="no-print flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-black text-slate-900">
              معاينة وطباعة الفاتورة ({invoice.number})
            </h2>
            <div className="flex items-center bg-slate-200 rounded-lg p-0.5 text-xs font-bold">
              <button
                onClick={() => setPrintLayout('a4')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  printLayout === 'a4' ? 'bg-white text-slate-950 shadow-2xs' : 'text-slate-600'
                }`}
              >
                قياس A4 ضريبي
              </button>
              <button
                onClick={() => setPrintLayout('thermal')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  printLayout === 'thermal' ? 'bg-white text-slate-950 shadow-2xs' : 'text-slate-600'
                }`}
              >
                إيصال كاشير (80mm)
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Direct PDF Download Button */}
            <button
              onClick={handleDownloadPdf}
              disabled={isExportingPdf}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              title="تحميل الفاتورة مباشرة بصيغة PDF"
            >
              {isExportingPdf ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جاري التصدير...</span>
                </>
              ) : exportedSuccess ? (
                <>
                  <Check className="w-4 h-4 text-emerald-200" />
                  <span>تم التحميل!</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>تحميل PDF</span>
                </>
              )}
            </button>

            {/* Instant Print Button */}
            <button
              onClick={handlePrint}
              className="px-3.5 py-2 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة فورية</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-black rounded-lg hover:bg-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Invoice Printable Area */}
        <div className="p-6 overflow-y-auto flex-1 bg-white text-black font-sans">
          <div id="invoice-printable-content" className="bg-white p-2">
          {printLayout === 'a4' ? (
            /* Standard A4 Layout */
            <div className="space-y-6 border border-slate-300 p-6 rounded-xl bg-white">
              {/* Header */}
              <div className="flex items-start justify-between border-b-2 border-black pb-4">
                <div>
                  <h1 className="text-xl font-black text-black">{settings.company}</h1>
                  <p className="text-xs text-slate-700 mt-1 font-medium">{settings.address || 'المقر الرئيسي'}</p>
                  <p className="text-xs text-slate-700 font-mono">هاتف: {settings.phone}</p>
                </div>
                <div className="text-left">
                  <div className="inline-block px-3 py-1 bg-black text-white text-xs font-black rounded-xs">
                    {isSale ? settings.invoiceTitle : 'فاتورة شراء وتوريد'}
                  </div>
                  <div className="text-sm font-black font-mono mt-2">{invoice.number}</div>
                  <div className="text-xs text-slate-700 font-mono">التاريخ: {invoice.date}</div>
                </div>
              </div>

              {/* Party & Warehouse Info */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs">
                <div>
                  <span className="font-bold text-slate-600 block mb-0.5">
                    {isSale ? 'بيانات العميل:' : 'بيانات المورد:'}
                  </span>
                  <div className="font-black text-sm text-black">{invoice.partyName}</div>
                  {invoice.partyPhone && (
                    <div className="text-slate-600 font-mono mt-0.5">هاتف: {invoice.partyPhone}</div>
                  )}
                </div>
                <div className="text-left">
                  <span className="font-bold text-slate-600 block mb-0.5">طريقة الدفع:</span>
                  <span className="font-black text-black">{invoice.paymentMethod}</span>
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    الحالة: <strong className="text-black">{invoice.status}</strong>
                  </div>
                  {invoice.costCenterName && (
                    <div className="text-[11px] text-indigo-700 font-bold mt-1">
                      مركز التكلفة: {invoice.costCenterName}
                    </div>
                  )}
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full text-right text-xs border border-black">
                <thead>
                  <tr className="bg-slate-100 border-b border-black text-black font-black">
                    <th className="p-2 border-l border-black w-10 text-center">#</th>
                    <th className="p-2 border-l border-black">الصنف والوصف</th>
                    <th className="p-2 border-l border-black w-16 text-center">الكمية</th>
                    <th className="p-2 border-l border-black w-24">سعر الوحدة</th>
                    <th className="p-2 border-l border-black w-20">الخصم</th>
                    <th className="p-2 w-28">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300">
                  {invoice.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="p-2 border-l border-slate-300 text-center font-mono">{idx + 1}</td>
                      <td className="p-2 border-l border-slate-300 font-bold">
                        {it.productName}
                        <span className="block text-[10px] text-slate-600 font-mono font-normal">كود: {it.productCode}</span>
                      </td>
                      <td className="p-2 border-l border-slate-300 text-center font-mono font-bold">{it.qty} {it.unit}</td>
                      <td className="p-2 border-l border-slate-300 font-mono">{formatMoney(it.unitPrice, settings.currency)}</td>
                      <td className="p-2 border-l border-slate-300 font-mono">{it.discount > 0 ? formatMoney(it.discount, settings.currency) : '—'}</td>
                      <td className="p-2 font-mono font-black">{formatMoney(it.total, settings.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals & Breakdown */}
              <div className="flex justify-between items-end">
                {/* Visual Barcode */}
                <div className="flex flex-col items-center p-2 border border-slate-200 rounded-lg bg-slate-50">
                  <div className="flex items-center h-8 gap-[1px]">
                    {barcodePattern.map((bar, i) => (
                      <span
                        key={i}
                        className={`inline-block h-full ${bar ? 'w-[1.5px] bg-black' : 'w-[1px] bg-transparent'}`}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] font-mono tracking-widest mt-1 text-slate-700">{invoice.number}</span>
                </div>

                <div className="w-72 border border-black rounded-lg p-3 space-y-1.5 text-xs bg-white">
                  <div className="flex justify-between font-medium">
                    <span>إجمالي الفاتورة:</span>
                    <span className="font-mono font-bold">{formatMoney(invoice.subtotal, settings.currency)}</span>
                  </div>
                  {invoice.discount > 0 && (
                    <div className="flex justify-between text-slate-700">
                      <span>خصم الفاتورة:</span>
                      <span className="font-mono font-bold">- {formatMoney(invoice.discount, settings.currency)}</span>
                    </div>
                  )}
                  {invoice.tax > 0 && (
                    <div className="flex justify-between text-slate-700">
                      <span>ضريبة القيمة المضافة:</span>
                      <span className="font-mono font-bold">+ {formatMoney(invoice.tax, settings.currency)}</span>
                    </div>
                  )}
                  <div className="border-t border-black pt-1.5 flex justify-between font-black text-sm">
                    <span>الصافي الإجمالي:</span>
                    <span className="font-mono">{formatMoney(invoice.total, settings.currency)}</span>
                  </div>
                  <div className="flex justify-between text-slate-800 pt-1 border-t border-slate-300">
                    <span>المبلغ المسدد:</span>
                    <span className="font-mono font-bold">{formatMoney(invoice.paid, settings.currency)}</span>
                  </div>
                  <div className="flex justify-between font-black text-slate-900">
                    <span>المتبقي (آجل):</span>
                    <span className="font-mono">{formatMoney(invoice.remaining, settings.currency)}</span>
                  </div>
                </div>
              </div>

              {/* Notes & Terms */}
              {settings.notes && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-700">
                  <strong className="block text-black mb-0.5">الشروط والأحكام:</strong>
                  {settings.notes}
                </div>
              )}

              {/* Signatures */}
              <div className="grid grid-cols-2 pt-6 text-center text-xs font-bold">
                <div>
                  <div className="border-t border-black w-40 mx-auto pt-1">توقيع المستلم</div>
                </div>
                <div>
                  <div className="border-t border-black w-40 mx-auto pt-1">توقيع وختم الإدارة</div>
                </div>
              </div>
            </div>
          ) : (
            /* 80mm Thermal POS Receipt Layout */
            <div className="max-w-[340px] mx-auto border-2 border-dashed border-black p-4 text-xs space-y-3 font-mono bg-white text-black">
              <div className="text-center border-b-2 border-black pb-2">
                <div className="font-black text-base">{settings.company}</div>
                {settings.address && <div className="text-[10px] text-slate-800">{settings.address}</div>}
                {settings.phone && <div className="text-[10px] text-slate-800">هاتف: {settings.phone}</div>}
                <div className="text-xs font-black mt-1.5 bg-black text-white py-0.5 px-2 inline-block">
                  {isSale ? 'إيصال مبيعات كاشير' : 'إيصال مشتريات'}
                </div>
                <div className="text-sm font-black mt-1">{invoice.number}</div>
                <div className="text-[10px] text-slate-700">{invoice.date}</div>
              </div>

              <div className="text-[11px] border-b border-black pb-1.5 space-y-0.5">
                <div className="flex justify-between">
                  <span className="font-bold">العميل:</span>
                  <span>{invoice.partyName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold">طريقة الدفع:</span>
                  <span>{invoice.paymentMethod}</span>
                </div>
                {invoice.costCenterName && (
                  <div className="flex justify-between text-[10px]">
                    <span className="font-bold">المركز:</span>
                    <span>{invoice.costCenterName}</span>
                  </div>
                )}
              </div>

              {/* Items List */}
              <div className="space-y-1.5 border-b border-black pb-2 text-[11px]">
                <div className="flex justify-between font-black border-b border-slate-300 pb-0.5 text-[10px]">
                  <span>الصنف</span>
                  <span>الكمية × السعر</span>
                  <span>الإجمالي</span>
                </div>
                {invoice.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between items-start text-[11px]">
                    <div className="max-w-[140px] truncate font-bold">
                      {it.productName}
                    </div>
                    <div className="text-[10px] text-slate-800">
                      {it.qty} × {it.unitPrice}
                    </div>
                    <div className="font-black">{it.total}</div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="space-y-1 text-xs pt-1">
                <div className="flex justify-between font-black text-sm border-b border-black pb-1">
                  <span>الصافي المطلوب:</span>
                  <span>{formatMoney(invoice.total, settings.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span>المبلغ المدفوع:</span>
                  <span>{formatMoney(invoice.paid, settings.currency)}</span>
                </div>
                <div className="flex justify-between font-black text-slate-900">
                  <span>المتبقي:</span>
                  <span>{formatMoney(invoice.remaining, settings.currency)}</span>
                </div>
              </div>

              {/* Thermal Barcode */}
              <div className="flex flex-col items-center pt-2 border-t border-dashed border-black">
                <div className="flex items-center h-7 gap-[1px]">
                  {barcodePattern.map((bar, i) => (
                    <span
                      key={i}
                      className={`inline-block h-full ${bar ? 'w-[1.5px] bg-black' : 'w-[1px] bg-transparent'}`}
                    />
                  ))}
                </div>
                <span className="text-[9px] font-mono mt-0.5">{invoice.number}</span>
              </div>

              <div className="text-center pt-1 text-[10px] text-slate-800">
                <div>شكراً لتعاملكم معنا!</div>
                <div>البضاعة المباعة ترد وتستبدل بالفاتورة خلال 14 يوماً</div>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};
