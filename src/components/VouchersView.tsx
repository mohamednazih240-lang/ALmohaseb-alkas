import React, { useState } from 'react';
import {
  Receipt,
  CreditCard,
  Plus,
  Trash2,
  Edit,
  Printer,
  Download,
  FileSpreadsheet,
  Calendar,
  X,
  FileText,
  Eye
} from 'lucide-react';
import {
  AccountingDB,
  Voucher,
  PaymentMethod,
  TreasuryEntry
} from '../types/accounting';
import {
  formatMoney,
  PAYMENT_METHODS,
  generateId,
  getTodayDate,
  getNextUniqueVoucherNumber,
  roundMoney,
  isFinitePositive
} from '../services/accountingStorage';
import {
  postManualVoucherTransaction,
  cancelOrDeleteVoucherTransaction,
  isReturnRelatedVoucher
} from '../services/accountingEngine';
import { downloadElementAsPdf } from '../services/printAndPdfService';
import { VoucherPrintModal } from './VoucherPrintModal';
import { UniversalPrintModal, MovementPrintBlock, formatCleanNumber } from './UniversalPrintModal';
import { exportTableToCsv } from '../services/exportService';
import { useModalBackHandler } from '../hooks/useModalBackHandler';
import { useSubmitLock } from '../hooks/useSubmitLock';
import { tafqeetCurrency } from '../services/tafqeetService';

interface VouchersViewProps {
  type: 'receipt' | 'payment';
  db: AccountingDB;
  onUpdateDb: (updated: AccountingDB) => void;
  preselectedPartyId?: string;
  activeBranchId?: string;
}

export const VouchersView: React.FC<VouchersViewProps> = ({
  type,
  db,
  onUpdateDb,
  preselectedPartyId,
  activeBranchId
}) => {
  const isReceipt = type === 'receipt';
  const branches = db.branches || [{ id: 'br_main', name: 'الفرع الرئيسي', code: 'BR-01', isMain: true }];
  const targetBranchId = activeBranchId || branches[0]?.id || 'br_main';
  const currentBranch = branches.find(b => b.id === targetBranchId) || branches[0];
  const [branchFilter, setBranchFilter] = useState<'current' | 'all'>('current');
  const { isSubmitting, runWithLock } = useSubmitLock();

  const [showModal, setShowModal] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<Voucher | null>(null);
  const [printingVoucher, setPrintingVoucher] = useState<Voucher | null>(null);
  const [voucherAutoPrint, setVoucherAutoPrint] = useState(false);
  const [batchPrintOpen, setBatchPrintOpen] = useState(false);

  // Hook for mobile back button: closes new voucher modal without jumping to dashboard
  useModalBackHandler(showModal, () => {
    setShowModal(false);
    setEditingVoucher(null);
  }, 'new_voucher_modal');

  // Form states
  const [voucherDate, setVoucherDate] = useState(getTodayDate());
  const [partyId, setPartyId] = useState(preselectedPartyId || '');
  const [linkedInvoiceId, setLinkedInvoiceId] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('نقدي');
  const [description, setDescription] = useState('');

  const isTargetBranch = (bId?: string) => {
    if (branchFilter === 'all') return true;
    return bId === targetBranchId || (!bId && targetBranchId === 'br_main');
  };

  // Eligible unpaid / partially paid invoices for linking installments (aligned with voucher cash direction; exclude returns)
  const linkableInvoices = (db.invoices || []).filter(inv => {
    if (inv.invoiceKind === 'quote' || (inv.invoiceKind as string) === 'order') return false;
    if (inv.invoiceKind === 'sale_return' || inv.invoiceKind === 'purchase_return' || (inv.type as string) === 'sale_return' || (inv.type as string) === 'purchase_return') {
      return false;
    }
    const isInvReceipt = inv.type === 'sale' || inv.invoiceKind === 'sale' || inv.invoiceKind === 'wholesale';
    if (isInvReceipt !== isReceipt) return false;
    if (partyId && inv.partyId !== partyId) return false;
    const isCurrentlyLinked = editingVoucher?.invoiceId === inv.id;
    return isCurrentlyLinked || (Number(inv.remaining) || 0) > 0.009;
  });

  const selectedLinkedInvoice = linkableInvoices.find(inv => inv.id === linkedInvoiceId);

  const vouchersList = db.vouchers
    .filter(v => v.type === type && isTargetBranch(v.branchId) && !isReturnRelatedVoucher(v))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalAmount = vouchersList.reduce((sum, v) => sum + v.amount, 0);

  const handleOpenNewModal = () => {
    setEditingVoucher(null);
    setVoucherDate(getTodayDate());
    const defaultParty = isReceipt ? db.customers[0]?.id : db.suppliers[0]?.id;
    setPartyId(preselectedPartyId || defaultParty || '');
    setLinkedInvoiceId('');
    setAmount(0);
    setPaymentMethod('نقدي');
    setDescription(isReceipt ? 'دفعة نقدية سداد حساب' : 'سداد دفعة للمورد');
    setShowModal(true);
  };

  const handleOpenEditModal = (v: Voucher) => {
    setEditingVoucher(v);
    setVoucherDate(v.date);
    setPartyId(v.partyId || '');
    setLinkedInvoiceId(v.invoiceId || '');
    setAmount(v.amount);
    setPaymentMethod(v.paymentMethod);
    setDescription(v.description);
    setShowModal(true);
  };

  const handleSaveVoucher = (e: React.FormEvent) => {
    e.preventDefault();
    runWithLock(() => {
      const cleanAmt = roundMoney(amount);
      if (!isFinitePositive(cleanAmt)) return alert('المبلغ يجب أن يكون أكبر من صفر');
      if (paymentMethod === 'آجل') return alert('يرجى اختيار وسيلة سداد/تحصيل نقدية أو بنكية للسند.');

      const list = isReceipt ? db.customers : db.suppliers;
      const party = list.find(p => p.id === partyId);
      const partyName = party ? party.name : (isReceipt ? 'عميل نقدي' : 'مورد عام');
      const operatorName = db.currentUser?.name || 'مدير النظام';

      let voucherPayload: Voucher;
      let workingDb = db;

      if (editingVoucher) {
        voucherPayload = {
          ...editingVoucher,
          date: voucherDate,
          partyId: partyId || undefined,
          partyName,
          amount: cleanAmt,
          paymentMethod,
          description: description.trim(),
          invoiceId: linkedInvoiceId || undefined,
          referenceNumber: selectedLinkedInvoice ? selectedLinkedInvoice.number : undefined,
          updatedAt: new Date().toISOString(),
          updatedBy: operatorName
        };
      } else {
        const nextSettingKey = isReceipt ? 'nextReceipt' : 'nextPayment';
        const { number: vNumber, nextSeq } = getNextUniqueVoucherNumber(db, type);
        workingDb = {
          ...db,
          settings: {
            ...db.settings,
            [nextSettingKey]: nextSeq + 1
          }
        };

        const vId = generateId(isReceipt ? 'rec' : 'pay');
        voucherPayload = {
          id: vId,
          number: vNumber,
          type,
          date: voucherDate,
          partyId: partyId || undefined,
          partyName,
          amount: cleanAmt,
          paymentMethod,
          description: description.trim(),
          invoiceId: linkedInvoiceId || undefined,
          referenceNumber: selectedLinkedInvoice ? selectedLinkedInvoice.number : undefined,
          isManualInstallment: true,
          isAutoFromInvoice: false,
          branchId: targetBranchId,
          branchName: currentBranch.name,
          createdAt: new Date().toISOString(),
          createdBy: operatorName
        };
      }

      const result = postManualVoucherTransaction(workingDb, voucherPayload, operatorName);
      if (!result.success) {
        alert(result.message);
        return;
      }

      onUpdateDb(result.db);
      setShowModal(false);
      setEditingVoucher(null);
    });
  };

  const handleDeleteVoucher = (v: Voucher) => {
    runWithLock(() => {
      const isManager = db.currentUser?.role === 'مدير';
      if (!isManager) {
        alert('عذراً، لا يمكن حذف أي سند مالي إلا من قِبل المدير العام فقط.');
        return;
      }

      if (!confirm(`هل أنت متأكد من حذف ${isReceipt ? 'سند القبض' : 'سند الصرف'} "${v.number}" وعكس القيود والأرصدة المالية بالكامل؟`)) {
        return;
      }

      const res = cancelOrDeleteVoucherTransaction(db, v.id, db.currentUser?.name || 'المدير العام', 'حذف السند من إدارة السندات');
      if (!res.success) {
        alert(res.message);
        return;
      }
      onUpdateDb(res.db);
    });
  };

  const handleBatchExportExcel = () => {
    if (vouchersList.length === 0) return alert('لا توجد سندات للتصدير');
    const headers = ['رقم السند', 'التاريخ', 'الطرف', 'طريقة السداد', 'البيان', 'المبلغ'];
    const rows = vouchersList.map(v => [
      v.number,
      v.date,
      v.partyName,
      v.paymentMethod,
      v.description,
      v.amount
    ]);
    exportTableToCsv(`سندات_${isReceipt ? 'القبض' : 'الصرف'}_${Date.now()}.csv`, headers, rows);
  };

  const batchPrintBlocks: MovementPrintBlock[] = vouchersList.map(v => {
    const voucherTitle = isReceipt ? 'سند قبض مالي' : 'سند صرف مالي';
    const partyLabel = isReceipt ? 'المستلم منه' : 'المستفيد / يصرف إلى';
    const tafqeetWords = tafqeetCurrency(v.amount, v.currencyCode || db.settings.currency || 'ج.م');
    return {
      title: voucherTitle,
      serialNo: v.number,
      date: v.date,
      partyLabel,
      partyName: v.partyName || 'طرف نقدي عام',
      partySubId: `طريقة السداد: ${v.paymentMethod}`,
      statement: v.description ? `${v.description} — فقط ${tafqeetWords}` : `فقط ${tafqeetWords}`,
      badge: v.paymentMethod,
      typeTitle: voucherTitle,
      tableHeaders: [
        { label: 'البيان / تفاصيل السند والحركة', width: '50%', align: 'right' },
        { label: 'المبلغ كتابةً (تفقيط)', width: '30%', align: 'center' },
        { label: 'المبلغ رقماً', width: '20%', align: 'center' }
      ],
      tableRows: [
        {
          cols: [
            v.description || (isReceipt ? 'دفعة نقدية تحت الحساب' : 'مصروفات / دفعة نقدية'),
            tafqeetWords,
            `${formatCleanNumber(v.amount)} ${v.currencyCode || db.settings.currency}`
          ],
          isBold: true
        }
      ],
      summaryLines: [
        {
          label: 'طريقة السداد / الخزينة',
          value: v.paymentMethod
        },
        {
          label: 'المبلغ كتابةً',
          value: tafqeetWords
        },
        {
          label: 'صافي قيمة السند الإجمالية',
          value: `${formatCleanNumber(v.amount)} ${v.currencyCode || db.settings.currency}`,
          isTotal: true
        }
      ],
      footerNotes: db.settings.notes || 'سند رسمي معتمد وموثق بالسجلات المالية.',
      createdBy: db.settings.company || 'المسؤول المالي'
    };
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            {isReceipt ? <Receipt className="w-6 h-6" /> : <CreditCard className="w-6 h-6" />}
            <span>إدارة {isReceipt ? 'سندات القبض (تحصيلات العملاء)' : 'سندات الصرف (مدفوعات الموردين)'}</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            إثبات حركات النقدية والشيكات والتحويلات مع الربط التلقائي بدفتر الأستاذ ورصيد الجهة
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleBatchExportExcel}
            className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
            title="تصدير السندات إلى Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            <span>تصدير Excel</span>
          </button>

          <button
            type="button"
            onClick={() => setBatchPrintOpen(true)}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
            title="طباعة وتصدير جماعي لجميع السندات في PDF بتنسيق رسمي"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>طباعة وتصدير جماعي PDF</span>
          </button>

          <button
            onClick={handleOpenNewModal}
            className="px-4 py-2 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{isReceipt ? 'سند قبض جديد (+)' : 'سند صرف جديد (-)'}</span>
          </button>
        </div>
      </div>

      {/* Branch Isolation Filter Bar */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-slate-700">عرض سندات فرع:</span>
          <div className="inline-flex flex-wrap rounded-lg border border-slate-300 bg-white p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setBranchFilter('current')}
              className={`px-3 py-1 rounded-md font-bold text-xs transition-all ${
                branchFilter === 'current' ? 'bg-black text-white shadow-xs' : 'text-slate-600 hover:text-black'
              }`}
            >
              فرع {currentBranch.name} {currentBranch.isMain ? '(الرئيسي)' : ''}
            </button>
            <button
              type="button"
              onClick={() => setBranchFilter('all')}
              className={`px-3 py-1 rounded-md font-bold text-xs transition-all ${
                branchFilter === 'all' ? 'bg-black text-white shadow-xs' : 'text-slate-600 hover:text-black'
              }`}
            >
              كافة الفروع
            </button>
          </div>
        </div>
        <div className="text-[11px] text-slate-500 font-medium">
          يتم تسجيل أي سند جديد تلقائياً بحساب فرع: <span className="font-bold text-slate-900">{currentBranch.name}</span>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-bold text-slate-600 block mb-1">
            إجمالي {isReceipt ? 'المقبوضات' : 'المدفوعات'}
          </span>
          <span className={`text-lg sm:text-xl font-black font-mono ${isReceipt ? 'text-emerald-700' : 'text-rose-700'}`}>
            {formatMoney(totalAmount, db.settings.currency)}
          </span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-bold text-slate-600 block mb-1">
            عدد السندات المسجلة
          </span>
          <span className="text-lg sm:text-xl font-black font-mono text-slate-950">
            {vouchersList.length} <span className="text-xs font-normal text-slate-500">سند</span>
          </span>
        </div>
      </div>

      {/* Vouchers Responsive Card System (No Horizontal Scroll) */}
      {vouchersList.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-2xs">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <div className="text-sm font-bold text-slate-700">لا توجد سندات مسجلة حالياً</div>
          <button
            onClick={handleOpenNewModal}
            className="mt-3 px-4 py-2 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>تسجيل أول سند</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {vouchersList.map(v => (
            <div
              key={v.id}
              id={`voucher-card-${v.id}`}
              className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between p-3.5 print-card"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                <div>
                  <span className="font-mono font-black text-sm text-slate-900 block">
                    {v.number}
                  </span>
                  <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    <span>{v.date}</span>
                  </div>
                </div>

                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                    isReceipt
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-rose-50 text-rose-800 border-rose-300'
                  }`}
                >
                  {isReceipt ? 'سند قبض وارد' : 'سند صرف صادر'}
                </span>
              </div>

              {/* Card Body */}
              <div className="py-2.5 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">{isReceipt ? 'العميل:' : 'المورد:'}</span>
                  <span className="font-bold text-slate-900 truncate max-w-[180px]">{v.partyName}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">طريقة السداد:</span>
                  <span className="px-2 py-0.5 bg-slate-100 rounded text-[11px] font-medium text-slate-800">
                    {v.paymentMethod}
                  </span>
                </div>

                {v.referenceNumber && (
                  <div className="flex items-center justify-between text-[10.5px] text-blue-800 bg-blue-50/80 p-1.5 rounded-lg border border-blue-200 font-bold">
                    <span>مرجع الفاتورة المرتبطة:</span>
                    <span className="font-mono font-black text-blue-900">#{v.referenceNumber}</span>
                  </div>
                )}

                {v.description && (
                  <div className="text-[11px] text-slate-500 bg-slate-50 p-1.5 rounded truncate">
                    {v.description}
                  </div>
                )}

                {/* Amount Box */}
                <div className="bg-slate-50 rounded-lg p-2.5 flex items-center justify-between border border-slate-100 mt-2">
                  <span className="text-xs font-bold text-slate-600">مبلغ السند:</span>
                  <span className={`text-base font-black font-mono ${isReceipt ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {formatMoney(v.amount, db.settings.currency)}
                  </span>
                </div>
              </div>

              {/* Card Footer */}
              <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-end gap-1.5 no-print">
                <button
                  onClick={() => {
                    setPrintingVoucher(v);
                    setVoucherAutoPrint(false);
                  }}
                  className="px-2.5 py-1 text-slate-700 hover:text-black hover:bg-slate-100 rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                  title="معاينة السند"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>معاينة</span>
                </button>

                <button
                  onClick={() => {
                    setPrintingVoucher(v);
                    setVoucherAutoPrint(true);
                  }}
                  className="px-2.5 py-1 text-white bg-slate-900 hover:bg-black rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                  title="طباعة السند فورية بمقاس A5 / A4 / حراري"
                >
                  <Printer className="w-3.5 h-3.5 text-emerald-400" />
                  <span>طباعة</span>
                </button>

                <button
                  onClick={() => {
                    setPrintingVoucher(v);
                    setVoucherAutoPrint(false);
                  }}
                  className="px-2 py-1 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                  title="تحميل السند كملف PDF"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PDF</span>
                </button>

                <button
                  onClick={() => handleOpenEditModal(v)}
                  className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                  title="تعديل بيانات السند"
                >
                  <Edit className="w-3.5 h-3.5" />
                </button>

                {db.currentUser?.role === 'مدير' && (
                  <button
                    onClick={() => handleDeleteVoucher(v)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                    title="حذف السند وعكس القيود (صلاحية المدير العام)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Single Voucher Print & PDF Modal */}
      <VoucherPrintModal
        voucher={printingVoucher}
        settings={db.settings}
        autoPrint={voucherAutoPrint}
        onClose={() => {
          setPrintingVoucher(null);
          setVoucherAutoPrint(false);
        }}
      />

      {/* Batch Vouchers Print Modal */}
      <UniversalPrintModal
        isOpen={batchPrintOpen}
        onClose={() => setBatchPrintOpen(false)}
        documentTitle={`سندات_${isReceipt ? 'القبض' : 'الصرف'}_المجمعة`}
        documents={batchPrintBlocks}
        settings={db.settings}
      />

      {/* Modal: New Voucher */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50 rounded-t-2xl">
              <h2 className="text-base font-black text-slate-900">
                {editingVoucher
                  ? (isReceipt ? `تعديل سند قبض (${editingVoucher.number})` : `تعديل سند صرف (${editingVoucher.number})`)
                  : (isReceipt ? 'تسجيل سند قبض مالي' : 'تسجيل سند صرف مالي')}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-slate-200 rounded">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <form onSubmit={handleSaveVoucher} className="p-4 space-y-3.5 overflow-y-auto flex-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">تاريخ السند</label>
                <input
                  type="date"
                  required
                  value={voucherDate}
                  onChange={e => setVoucherDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  الطرف ({isReceipt ? 'العميل' : 'المورد'})
                </label>
                <select
                  value={partyId}
                  onChange={e => {
                    setPartyId(e.target.value);
                    setLinkedInvoiceId('');
                  }}
                  className="w-full min-w-0 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium"
                >
                  <option value="">{isReceipt ? 'عميل نقدي عام' : 'مورد عام'}</option>
                  {(isReceipt ? db.customers : db.suppliers).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  ربط بفاتورة مستحقة / جزئية (اختياري لسداد الأقساط)
                </label>
                <select
                  value={linkedInvoiceId}
                  onChange={e => {
                    const invId = e.target.value;
                    setLinkedInvoiceId(invId);
                    const target = linkableInvoices.find(i => i.id === invId);
                    if (target && !editingVoucher && (amount <= 0 || amount > target.remaining)) {
                      setAmount(Number(target.remaining) || 0);
                    }
                  }}
                  className="w-full min-w-0 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium"
                >
                  <option value="">— سند عام على حساب الطرف (غير مربوط بفاتورة محددة) —</option>
                  {linkableInvoices.map(inv => (
                    <option key={inv.id} value={inv.id}>
                      فاتورة #{inv.number} ({inv.date}) — متبقي: {formatMoney(inv.remaining, db.settings.currency)} من {formatMoney(inv.total, db.settings.currency)}
                    </option>
                  ))}
                </select>
                {selectedLinkedInvoice && (
                  <div className="mt-1 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-200">
                    إجمالي الفاتورة #{selectedLinkedInvoice.number}: {formatMoney(selectedLinkedInvoice.total, db.settings.currency)} • المتبقي قبل هذا السند: {formatMoney(
                      Math.max(0, selectedLinkedInvoice.total - db.vouchers.filter(v => v.id !== editingVoucher?.id && (v.invoiceId === selectedLinkedInvoice.id || v.referenceNumber === selectedLinkedInvoice.number)).reduce((s, v) => s + (Number(v.amount) || 0), 0)),
                      db.settings.currency
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">المبلغ المطلوب *</label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    required
                    value={amount === 0 ? '' : amount}
                    placeholder="0.00"
                    onFocus={e => e.target.select()}
                    onChange={e => setAmount(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-black"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">طريقة السداد / الخزينة</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full min-w-0 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                  >
                    {PAYMENT_METHODS.filter(m => m !== 'آجل').map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">البيان والشرح</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="سداد دفعة تحت الحساب، شيك رقم..."
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-100 rounded-lg text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-black disabled:opacity-50 text-white rounded-lg text-xs font-bold"
                >
                  {isSubmitting ? 'جارٍ الترحيل...' : 'حفظ وترحيل السند'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
