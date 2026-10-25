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
  FileText
} from 'lucide-react';
import {
  AccountingDB,
  Voucher,
  PaymentMethod
} from '../types/accounting';
import {
  formatMoney,
  PAYMENT_METHODS,
  generateId,
  getTodayDate,
  createVoucherJournal,
  logAudit,
  isDuplicateVoucherNumber,
  getNextUniqueVoucherNumber
} from '../services/accountingStorage';
import { downloadElementAsPdf } from '../services/printAndPdfService';
import { VoucherPrintModal } from './VoucherPrintModal';
import { UniversalPrintModal, MovementPrintBlock, formatCleanNumber } from './UniversalPrintModal';
import { exportTableToCsv } from '../services/exportService';
import { useModalBackHandler } from '../hooks/useModalBackHandler';

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

  const [showModal, setShowModal] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<Voucher | null>(null);
  const [printingVoucher, setPrintingVoucher] = useState<Voucher | null>(null);
  const [batchPrintOpen, setBatchPrintOpen] = useState(false);

  // Hook for mobile back button: closes new voucher modal without jumping to dashboard
  useModalBackHandler(showModal, () => {
    setShowModal(false);
    setEditingVoucher(null);
  }, 'new_voucher_modal');

  // Form states
  const [voucherDate, setVoucherDate] = useState(getTodayDate());
  const [partyId, setPartyId] = useState(preselectedPartyId || '');
  const [amount, setAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('نقدي');
  const [description, setDescription] = useState('');

  const isTargetBranch = (bId?: string) => {
    if (branchFilter === 'all') return true;
    return bId === targetBranchId || (!bId && targetBranchId === 'br_main');
  };

  const vouchersList = db.vouchers
    .filter(v => v.type === type && isTargetBranch(v.branchId))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalAmount = vouchersList.reduce((sum, v) => sum + v.amount, 0);

  const handleOpenNewModal = () => {
    setEditingVoucher(null);
    setVoucherDate(getTodayDate());
    const defaultParty = isReceipt ? db.customers[0]?.id : db.suppliers[0]?.id;
    setPartyId(preselectedPartyId || defaultParty || '');
    setAmount(0);
    setPaymentMethod('نقدي');
    setDescription(isReceipt ? 'دفعة نقدية سداد حساب' : 'سداد دفعة للمورد');
    setShowModal(true);
  };

  const handleOpenEditModal = (v: Voucher) => {
    setEditingVoucher(v);
    setVoucherDate(v.date);
    setPartyId(v.partyId || '');
    setAmount(v.amount);
    setPaymentMethod(v.paymentMethod);
    setDescription(v.description);
    setShowModal(true);
  };

  const handleSaveVoucher = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) return alert('المبلغ يجب أن يكون أكبر من صفر');

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const list = isReceipt ? updated.customers : updated.suppliers;
    const party = list.find(p => p.id === partyId);
    const partyName = party ? party.name : (isReceipt ? 'عميل نقدي' : 'مورد عام');

    if (editingVoucher) {
      // Update existing voucher
      const vIdx = updated.vouchers.findIndex(v => v.id === editingVoucher.id);
      if (vIdx !== -1) {
        updated.vouchers[vIdx] = {
          ...editingVoucher,
          date: voucherDate,
          partyId: partyId || undefined,
          partyName,
          amount,
          paymentMethod,
          description
        };

        // Update corresponding treasury entry
        const trIdx = updated.treasury.findIndex(t => t.sourceId === editingVoucher.id);
        if (trIdx !== -1) {
          updated.treasury[trIdx].amount = amount;
          updated.treasury[trIdx].date = voucherDate;
          updated.treasury[trIdx].method = paymentMethod;
          updated.treasury[trIdx].description = `${isReceipt ? 'سند قبض' : 'سند صرف'} ${editingVoucher.number} - ${partyName}: ${description}`;
        }

        // Update journal entry
        const jIdx = updated.journals.findIndex(j => j.sourceId === editingVoucher.id);
        if (jIdx !== -1) {
          const freshJournal = createVoucherJournal(updated, updated.vouchers[vIdx]);
          freshJournal.id = updated.journals[jIdx].id;
          freshJournal.number = updated.journals[jIdx].number;
          updated.journals[jIdx] = freshJournal;
        }

        logAudit(
          updated,
          isReceipt ? 'تعديل سند قبض' : 'تعديل سند صرف',
          `تعديل سند رقم ${editingVoucher.number} بقيمة ${formatMoney(amount, updated.settings.currency)}`
        );

        onUpdateDb(updated);
        setShowModal(false);
        setEditingVoucher(null);
        return;
      }
    }

    const nextSettingKey = isReceipt ? 'nextReceipt' : 'nextPayment';
    const { number: vNumber, nextSeq } = getNextUniqueVoucherNumber(updated, type);
    updated.settings[nextSettingKey] = nextSeq + 1;

    const vId = generateId(isReceipt ? 'rec' : 'pay');

    const newVoucher: Voucher = {
      id: vId,
      number: vNumber,
      type,
      date: voucherDate,
      partyId: partyId || undefined,
      partyName,
      amount,
      paymentMethod,
      description,
      branchId: targetBranchId,
      branchName: currentBranch.name
    };

    // 1. Treasury Entry
    updated.treasury.unshift({
      id: generateId('tr'),
      date: voucherDate,
      direction: isReceipt ? 'in' : 'out',
      amount,
      method: paymentMethod,
      description: `${isReceipt ? 'سند قبض' : 'سند صرف'} ${vNumber} - ${partyName}: ${description}`,
      sourceType: type,
      sourceId: vId,
      branchId: targetBranchId,
      branchName: currentBranch.name
    });

    // 2. Automated Balanced Double-Entry Journal Entry
    const journal = createVoucherJournal(updated, newVoucher);
    newVoucher.journalEntryId = journal.id;
    updated.journals.unshift(journal);

    // 3. Save voucher
    updated.vouchers.unshift(newVoucher);

    // 4. Audit
    logAudit(
      updated,
      isReceipt ? 'تسجيل سند قبض' : 'تسجيل سند صرف',
      `سند رقم ${vNumber} بقيمة ${formatMoney(amount, updated.settings.currency)} للطرف ${partyName}`
    );

    onUpdateDb(updated);
    setShowModal(false);
    setEditingVoucher(null);
  };

  const handleDeleteVoucher = (v: Voucher) => {
    const isManager = db.currentUser?.role === 'مدير';
    if (!isManager) {
      alert('عذراً، لا يمكن حذف أي سند مالي إلا من قِبل المدير العام فقط.');
      return;
    }

    if (!confirm(`هل أنت متأكد من حذف ${isReceipt ? 'سند القبض' : 'سند الصرف'} "${v.number}" وعكس القيود المالية؟`)) {
      return;
    }

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;

    // 1. Remove treasury entry
    updated.treasury = updated.treasury.filter(tr => tr.sourceId !== v.id);

    // 2. Remove journal entry
    updated.journals = updated.journals.filter(j => j.sourceId !== v.id);

    // 3. Remove voucher
    updated.vouchers = updated.vouchers.filter(item => item.id !== v.id);

    logAudit(updated, `حذف ${isReceipt ? 'سند قبض' : 'سند صرف'}`, `تم حذف ${v.number}`);
    onUpdateDb(updated);
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
    const voucherTitle = isReceipt ? 'سند قبض نقدية وشيكات' : 'سند صرف نقدية وشيكات';
    const partyLabel = isReceipt ? 'استلمنا من السيد / السادة:' : 'اصرفوا إلى السيد / السادة:';
    return {
      title: voucherTitle,
      serialNo: v.number,
      date: v.date,
      time: '12:00',
      partyLabel,
      partyName: v.partyName || 'طرف نقدي عام',
      partySubId: `طريقة السداد: ${v.paymentMethod}`,
      badge: v.paymentMethod,
      typeTitle: voucherTitle,
      tableHeaders: [
        { label: 'البيان / تفاصيل السند', width: '60%', align: 'right' },
        { label: 'طريقة الدفع', width: '20%', align: 'center' },
        { label: 'المبلغ المسدد', width: '20%', align: 'center' }
      ],
      tableRows: [
        {
          cols: [
            v.description || (isReceipt ? 'دفعة نقدية تحت الحساب' : 'مصروفات / دفعة نقدية'),
            v.paymentMethod,
            `${formatCleanNumber(v.amount)} ${v.currencyCode || db.settings.currency}`
          ],
          isBold: true
        }
      ],
      summaryLines: [
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
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-700">عرض سندات فرع:</span>
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 shadow-2xs">
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
              <div className="pt-2.5 border-t border-slate-100 flex items-center justify-end gap-1.5 no-print">
                <button
                  onClick={() => setPrintingVoucher(v)}
                  className="px-2.5 py-1 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                  title="معاينة وتحميل السند PDF"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PDF</span>
                </button>

                <button
                  onClick={() => setPrintingVoucher(v)}
                  className="px-2.5 py-1 text-slate-700 hover:text-black hover:bg-slate-100 rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                  title="طباعة السند حراري / A4"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة</span>
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
        onClose={() => setPrintingVoucher(null)}
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
                  onChange={e => setPartyId(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium"
                >
                  <option value="">{isReceipt ? 'عميل نقدي عام' : 'مورد عام'}</option>
                  {(isReceipt ? db.customers : db.suppliers).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">المبلغ المطلوب *</label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    required
                    value={amount}
                    onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-black"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">طريقة السداد / الخزينة</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
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
                  className="px-5 py-2 bg-black text-white rounded-lg text-xs font-bold"
                >
                  حفظ وترحيل السند
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
