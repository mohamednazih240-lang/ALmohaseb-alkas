import React, { useState } from 'react';
import {
  Printer,
  Download,
  X,
  Building2,
  QrCode,
  FileText,
  Loader2,
  Check,
  Receipt,
  CreditCard
} from 'lucide-react';
import {
  Voucher,
  AppSettings
} from '../types/accounting';
import { formatMoney } from '../services/accountingStorage';
import { downloadElementAsPdf, generateBarcodePattern } from '../services/printAndPdfService';
import { useModalBackHandler } from '../hooks/useModalBackHandler';

interface VoucherPrintModalProps {
  voucher: Voucher | null;
  settings: AppSettings;
  onClose: () => void;
}

export const VoucherPrintModal: React.FC<VoucherPrintModalProps> = ({
  voucher,
  settings,
  onClose
}) => {
  const [printFormat, setPrintFormat] = useState<'a4' | 'thermal'>('a4');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Mobile back button integration
  useModalBackHandler(!!voucher, onClose, 'voucher_print_modal');

  if (!voucher) return null;

  const isReceipt = voucher.type === 'receipt';
  const voucherTitle = isReceipt ? 'سند قبض نقدية وشيكات' : 'سند صرف نقدية وشيكات';
  const partyLabel = isReceipt ? 'استلمنا من السيد / السادة:' : 'اصرفوا إلى السيد / السادة:';

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    setIsExportingPdf(true);
    try {
      await downloadElementAsPdf('voucher-printable-content', {
        format: printFormat === 'thermal' ? 'thermal' : 'a4',
        filename: `${voucher.number}_${voucher.partyName}.pdf`
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const barcodeBars = generateBarcodePattern(voucher.number);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      {/* Container */}
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Top Control Bar (Never Printed) */}
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2">
            <div className={`p-2 text-white rounded-lg shadow-2xs ${isReceipt ? 'bg-emerald-600' : 'bg-rose-600'}`}>
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 leading-tight">
                طباعة ومعاينة {isReceipt ? 'سند القبض' : 'سند الصرف'}
              </h2>
              <span className="text-xs font-mono font-bold text-slate-500">
                {voucher.number}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {/* Format toggle: A4 vs Thermal */}
            <div className="bg-white border border-slate-200 p-0.5 rounded-lg flex items-center shadow-2xs">
              <button
                type="button"
                onClick={() => setPrintFormat('a4')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                  printFormat === 'a4'
                    ? 'bg-black text-white shadow-xs'
                    : 'text-slate-600 hover:text-black'
                }`}
              >
                A4 رسمي
              </button>
              <button
                type="button"
                onClick={() => setPrintFormat('thermal')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                  printFormat === 'thermal'
                    ? 'bg-black text-white shadow-xs'
                    : 'text-slate-600 hover:text-black'
                }`}
              >
                إيصال حراري (80mm)
              </button>
            </div>

            {/* Direct PDF Download button */}
            <button
              onClick={handleDownloadPdf}
              disabled={isExportingPdf}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              title="تحميل السند بصيغة PDF عالية الدقة"
            >
              {isExportingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>تحميل PDF</span>
            </button>

            {/* Direct Print button */}
            <button
              onClick={handlePrint}
              className="px-4 py-1.5 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              title="إرسال للطابعة فوراً"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة فورية</span>
            </button>

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-200 text-slate-500 rounded-lg transition-colors cursor-pointer"
              title="إغلاق (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Paper Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100 flex justify-center">
          <div
            id="voucher-printable-content"
            className={`bg-white shadow-xl border border-slate-200 transition-all text-slate-900 ${
              printFormat === 'thermal'
                ? 'w-[320px] p-4 text-[12px] font-sans'
                : 'w-full max-w-[760px] p-8 text-sm'
            }`}
          >
            {printFormat === 'a4' ? (
              /* A4 LAYOUT */
              <div className="space-y-6">
                {/* Official Header */}
                <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
                  <div className="space-y-1">
                    <h1 className="text-xl font-black text-slate-900 tracking-tight">
                      {settings.company || 'المؤسسة التجارية'}
                    </h1>
                    <p className="text-xs text-slate-600 font-medium">
                      {settings.phone ? `هاتف: ${settings.phone}` : ''}
                      {settings.taxNumber ? ` | الرقم الضريبي: ${settings.taxNumber}` : ''}
                    </p>
                  </div>
                  <div className="text-left space-y-1">
                    <span className={`inline-block px-3 py-1 rounded-md text-xs font-black text-white ${
                      isReceipt ? 'bg-emerald-700' : 'bg-rose-700'
                    }`}>
                      {voucherTitle}
                    </span>
                    <div className="text-xs font-mono font-bold text-slate-700">
                      رقم السند: {voucher.number}
                    </div>
                    <div className="text-xs text-slate-500">
                      التاريخ: {voucher.date}
                    </div>
                  </div>
                </div>

                {/* Amount Highlight Box */}
                <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-500 block mb-0.5">المبلغ المدفوع / المحصل:</span>
                    <span className="text-2xl font-black font-mono text-slate-900">
                      {formatMoney(voucher.amount, settings.currency)}
                    </span>
                  </div>
                  <div className="text-left">
                    <span className="text-xs font-bold text-slate-500 block mb-0.5">طريقة الدفع:</span>
                    <span className="px-2.5 py-1 bg-white border border-slate-300 rounded-md text-xs font-bold text-slate-800">
                      {voucher.paymentMethod}
                    </span>
                  </div>
                </div>

                {/* Body Details */}
                <div className="space-y-3 bg-white p-4 rounded-lg border border-slate-200">
                  <div className="flex items-baseline gap-2 border-b border-slate-100 pb-2">
                    <span className="font-bold text-slate-700 text-xs w-36 shrink-0">
                      {partyLabel}
                    </span>
                    <span className="font-black text-slate-900 text-sm flex-1">
                      {voucher.partyName || 'طرف عام'}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2 border-b border-slate-100 pb-2">
                    <span className="font-bold text-slate-700 text-xs w-36 shrink-0">
                      وذلك عن (البيان):
                    </span>
                    <span className="text-slate-800 text-xs flex-1">
                      {voucher.description || 'سداد دفعة تحت الحساب'}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className="font-bold text-slate-700 text-xs w-36 shrink-0">
                      حالة القيد المالي:
                    </span>
                    <span className="text-slate-600 font-mono text-xs flex-1">
                      مرحل تلقائياً للدفاتر المحاسبية والخزينة
                    </span>
                  </div>
                </div>

                {/* Barcode & Footer Signatures */}
                <div className="pt-6 border-t border-slate-200 flex items-center justify-between">
                  {/* Barcode */}
                  <div className="text-center space-y-1">
                    <div className="flex justify-center items-end h-8 gap-[1px]">
                      {barcodeBars.slice(0, 36).map((isBar, idx) => (
                        <div
                          key={idx}
                          className={`w-[2px] h-full ${isBar ? 'bg-black' : 'bg-transparent'}`}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] font-mono tracking-widest text-slate-600 block">
                      *{voucher.number}*
                    </span>
                  </div>

                  {/* Signatures */}
                  <div className="flex items-center gap-12 text-center text-xs">
                    <div>
                      <div className="text-slate-500 font-bold mb-8">توقيع المستلم</div>
                      <div className="border-t border-slate-400 w-28"></div>
                    </div>
                    <div>
                      <div className="text-slate-500 font-bold mb-8">أمين الخزينة</div>
                      <div className="border-t border-slate-400 w-28"></div>
                    </div>
                    <div>
                      <div className="text-slate-500 font-bold mb-8">الاعتماد المالي</div>
                      <div className="border-t border-slate-400 w-28"></div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* THERMAL 80MM LAYOUT */
              <div className="space-y-3 font-mono text-[11px] leading-tight">
                {/* Header */}
                <div className="text-center space-y-1 border-b border-dashed border-slate-400 pb-2">
                  <h2 className="font-black text-sm text-slate-900">{settings.company || 'المؤسسة'}</h2>
                  <p className="text-[10px] text-slate-600">{settings.phone ? `هاتف: ${settings.phone}` : ''}</p>
                  <div className="font-bold text-[12px] mt-1 bg-black text-white px-2 py-0.5 rounded inline-block">
                    {isReceipt ? 'إيصال استلام نقدية' : 'إيصال صرف نقدية'}
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-1.5 py-1 border-b border-dashed border-slate-400">
                  <div className="flex justify-between">
                    <span className="text-slate-500">رقم الإيصال:</span>
                    <span className="font-bold">{voucher.number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">التاريخ:</span>
                    <span>{voucher.date}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">الطرف:</span>
                    <span className="font-bold">{voucher.partyName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">طريقة الدفع:</span>
                    <span>{voucher.paymentMethod}</span>
                  </div>
                </div>

                {/* Big Amount */}
                <div className="bg-slate-100 p-2 text-center rounded border border-slate-300">
                  <span className="text-[10px] text-slate-600 block">المبلغ الإجمالي</span>
                  <span className="text-lg font-black font-mono">
                    {formatMoney(voucher.amount, settings.currency)}
                  </span>
                </div>

                {voucher.description && (
                  <div className="text-[10px] text-slate-600 pt-1 border-b border-dashed border-slate-400 pb-2">
                    <span className="font-bold">البيان: </span>
                    <span>{voucher.description}</span>
                  </div>
                )}

                {/* Barcode & Footer */}
                <div className="text-center pt-2 space-y-1">
                  <div className="flex justify-center items-end h-6 gap-[1px]">
                    {barcodeBars.slice(0, 30).map((isBar, idx) => (
                      <div
                        key={idx}
                        className={`w-[1.5px] h-full ${isBar ? 'bg-black' : 'bg-transparent'}`}
                      />
                    ))}
                  </div>
                  <div className="text-[9px] font-mono text-slate-500">*{voucher.number}*</div>
                  <div className="text-[9px] text-slate-400 mt-2">شكراً لتعاملكم معنا</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
