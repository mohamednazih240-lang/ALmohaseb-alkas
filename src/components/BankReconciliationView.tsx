import React, { useState } from 'react';
import {
  Building2,
  CheckCircle2,
  AlertCircle,
  Calendar,
  DollarSign,
  Download,
  Printer,
  Plus,
  RefreshCw,
  Search,
  Check,
  ShieldCheck,
  FileSpreadsheet,
  ArrowDownLeft,
  ArrowUpRight
} from 'lucide-react';
import { AccountingDB, BankReconciliation, PaymentMethod, Voucher } from '../types/accounting';
import { formatMoney, generateId, getTodayDate, logAudit } from '../services/accountingStorage';
import { downloadElementAsPdf } from '../services/printAndPdfService';
import { useModalBackHandler } from '../hooks/useModalBackHandler';

interface BankReconciliationViewProps {
  db: AccountingDB;
  onUpdateDb: (updated: AccountingDB) => void;
}

interface ReconcileItem {
  id: string;
  date: string;
  type: 'deposit' | 'payment';
  source: string;
  reference: string;
  partyName?: string;
  amount: number;
  cleared: boolean;
}

export const BankReconciliationView: React.FC<BankReconciliationViewProps> = ({ db, onUpdateDb }) => {
  // Accounts eligible for bank reconciliation: bank accounts, wallets, cash
  const bankAccounts = db.accounts.filter(a => 
    a.type === 'asset' && 
    (a.id === 'acc_bank' || a.id === 'acc_cash' || a.id === 'acc_vodafone' || a.id === 'acc_instapay' || a.id === 'acc_visa' || a.code.startsWith('11'))
  );

  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    bankAccounts.find(a => a.id === 'acc_bank')?.id || bankAccounts[0]?.id || 'acc_bank'
  );
  const [statementDate, setStatementDate] = useState<string>(getTodayDate());
  const [statementBalance, setStatementBalance] = useState<number>(0);
  const [clearedIds, setClearedIds] = useState<Set<string>>(new Set());
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'deposits' | 'payments'>('all');

  // Modal for quick bank fee / charge entry
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [feeAmount, setFeeAmount] = useState<number>(50);
  const [feeDescription, setFeeDescription] = useState('عمولة ومصاريف فتح وإدارة حساب بنكي');

  useModalBackHandler(showFeeModal, () => setShowFeeModal(false), 'bank_fee_modal');

  const selectedAccount = db.accounts.find(a => a.id === selectedAccountId) || bankAccounts[0];

  // Map payment methods to account
  const getMethodForAccount = (accId: string): PaymentMethod | null => {
    switch (accId) {
      case 'acc_bank': return 'تحويل بنكي';
      case 'acc_vodafone': return 'Vodafone Cash';
      case 'acc_instapay': return 'InstaPay';
      case 'acc_visa': return 'Visa / POS';
      case 'acc_cash': return 'نقدي';
      default: return null;
    }
  };

  const accountMethod = getMethodForAccount(selectedAccountId);

  // Collect all transactions for this account up to statement date
  const items: ReconcileItem[] = [];
  let calculatedBookBalance = 0;

  // 1. Receipts (Deposits)
  db.vouchers.forEach(v => {
    if (v.date <= statementDate && (!accountMethod || v.paymentMethod === accountMethod)) {
      if (v.type === 'receipt') {
        items.push({
          id: v.id,
          date: v.date,
          type: 'deposit',
          source: 'سند قبض',
          reference: v.number,
          partyName: v.partyName,
          amount: Number(v.amount),
          cleared: clearedIds.has(v.id)
        });
        calculatedBookBalance += Number(v.amount);
      } else if (v.type === 'payment') {
        items.push({
          id: v.id,
          date: v.date,
          type: 'payment',
          source: 'سند صرف',
          reference: v.number,
          partyName: v.partyName,
          amount: Number(v.amount),
          cleared: clearedIds.has(v.id)
        });
        calculatedBookBalance -= Number(v.amount);
      }
    }
  });

  // 2. Operational Expenses
  db.expenses.forEach(exp => {
    if (exp.date <= statementDate && (!accountMethod || exp.method === accountMethod)) {
      items.push({
        id: exp.id,
        date: exp.date,
        type: 'payment',
        source: 'مصروف تشغيلي',
        reference: exp.category,
        partyName: exp.description,
        amount: Number(exp.amount),
        cleared: clearedIds.has(exp.id)
      });
      calculatedBookBalance -= Number(exp.amount);
    }
  });

  // 3. Other Revenues
  db.revenues.forEach(rev => {
    if (rev.date <= statementDate && (!accountMethod || rev.method === accountMethod)) {
      items.push({
        id: rev.id,
        date: rev.date,
        type: 'deposit',
        source: 'إيراد إضافي',
        reference: rev.category,
        partyName: rev.description,
        amount: Number(rev.amount),
        cleared: clearedIds.has(rev.id)
      });
      calculatedBookBalance += Number(rev.amount);
    }
  });

  // 4. Paid Invoices
  db.invoices.forEach(inv => {
    if (inv.date <= statementDate && inv.paid > 0 && (!accountMethod || inv.paymentMethod === accountMethod)) {
      if (inv.type === 'sale') {
        items.push({
          id: `${inv.id}_paid`,
          date: inv.date,
          type: 'deposit',
          source: 'سداد مبيعات كاش',
          reference: inv.number,
          partyName: inv.partyName,
          amount: Number(inv.paid),
          cleared: clearedIds.has(`${inv.id}_paid`)
        });
        calculatedBookBalance += Number(inv.paid);
      } else if (inv.type === 'purchase') {
        items.push({
          id: `${inv.id}_paid`,
          date: inv.date,
          type: 'payment',
          source: 'سداد مشتريات نقدي',
          reference: inv.number,
          partyName: inv.partyName,
          amount: Number(inv.paid),
          cleared: clearedIds.has(`${inv.id}_paid`)
        });
        calculatedBookBalance -= Number(inv.paid);
      }
    }
  });

  // Sort items by date descending
  items.sort((a, b) => b.date.localeCompare(a.date));

  // Cleared calculations
  const clearedDeposits = items
    .filter(it => it.type === 'deposit' && clearedIds.has(it.id))
    .reduce((s, it) => s + it.amount, 0);

  const clearedPayments = items
    .filter(it => it.type === 'payment' && clearedIds.has(it.id))
    .reduce((s, it) => s + it.amount, 0);

  const unclearedDeposits = items
    .filter(it => it.type === 'deposit' && !clearedIds.has(it.id))
    .reduce((s, it) => s + it.amount, 0);

  const unclearedPayments = items
    .filter(it => it.type === 'payment' && !clearedIds.has(it.id))
    .reduce((s, it) => s + it.amount, 0);

  // Adjusted Bank Balance = Statement Balance + Uncleared Deposits - Uncleared Payments
  const adjustedBankBalance = statementBalance + unclearedDeposits - unclearedPayments;
  const difference = Math.abs(calculatedBookBalance - adjustedBankBalance);
  const isBalanced = difference < 0.05 && items.length > 0;

  // Toggle single item
  const toggleCleared = (id: string) => {
    const next = new Set(clearedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setClearedIds(next);
  };

  // Select all or clear all
  const selectAll = () => {
    const next = new Set(items.map(i => i.id));
    setClearedIds(next);
  };

  const deselectAll = () => {
    setClearedIds(new Set());
  };

  // Add Bank Fee voucher
  const handleAddFee = (e: React.FormEvent) => {
    e.preventDefault();
    if (feeAmount <= 0) return;

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const newFeeVoucher: Voucher = {
      id: generateId('vch_fee'),
      number: `FEE-${Date.now().toString().slice(-4)}`,
      type: 'payment',
      date: statementDate,
      partyName: 'مصاريف وعمولات بنكية',
      amount: Number(feeAmount),
      paymentMethod: (accountMethod || 'تحويل بنكي') as PaymentMethod,
      description: feeDescription.trim()
    };
    updated.vouchers.push(newFeeVoucher);

    // Also record audit
    logAudit(updated, 'تسجيل عمولة بنكية', `${formatMoney(feeAmount, db.settings.currency)} - ${feeDescription}`);
    onUpdateDb(updated);
    setShowFeeModal(false);
    // Auto clear the newly added fee
    const next = new Set(clearedIds);
    next.add(newFeeVoucher.id);
    setClearedIds(next);
  };

  // Save Finalized Reconciliation
  const handleSaveReconciliation = () => {
    if (!selectedAccount) return;

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const recRecord: BankReconciliation = {
      id: generateId('rec'),
      statementDate,
      bankAccountId: selectedAccount.id,
      bankAccountName: selectedAccount.name,
      statementEndingBalance: statementBalance,
      bookBalance: calculatedBookBalance,
      difference,
      matchedTransactionIds: Array.from(clearedIds),
      status: isBalanced ? 'مطابق ومغلق' : 'مسودة',
      createdAt: new Date().toISOString()
    };

    updated.bankReconciliations.unshift(recRecord);
    logAudit(
      updated,
      'اعتماد مذكرة تسوية بنكية',
      `تسوية حساب ${selectedAccount.name} بتاريخ ${statementDate} - الفارق: ${difference.toFixed(2)}`
    );
    onUpdateDb(updated);
    alert(isBalanced ? 'تم حفظ واعتماد التسوية البنكية بنجاح (مطابقة تامة 100%).' : 'تم حفظ مسودة التسوية البنكية للمراجعة لاحقاً.');
  };

  const handleDownloadPdf = async () => {
    setIsExportingPdf(true);
    try {
      await downloadElementAsPdf('bank-rec-printable', {
        format: 'a4',
        filename: `bank_reconciliation_${statementDate}.pdf`
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const filteredItems = items.filter(it => {
    if (filterType === 'deposits') return it.type === 'deposit';
    if (filterType === 'payments') return it.type === 'payment';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-900 text-white rounded-xl">
              <Building2 className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-black text-slate-900">
              تسوية الحسابات البنكية ومطابقة كشوف الحساب
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            مطابقة حركة الدفاتر مع كشف الحساب الوارد من البنك، اكتشاف الفروقات، ورصد الإيداعات والسحوبات غير المسواة
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setShowFeeModal(true)}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>تسجيل عمولة/فائدة بنكية</span>
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={isExportingPdf}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-xs"
          >
            <Download className="w-4 h-4" />
            <span>تحميل مذكرة التسوية PDF</span>
          </button>
        </div>
      </div>

      {/* Control Panel: Account & Statement Info */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">الحساب البنكي / الخزينة المراد تسويته</label>
          <select
            value={selectedAccountId}
            onChange={e => {
              setSelectedAccountId(e.target.value);
              setClearedIds(new Set());
            }}
            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-600 bg-white"
          >
            {bankAccounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.code})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ كشف الحساب البنكي</label>
          <input
            type="date"
            value={statementDate}
            onChange={e => setStatementDate(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-600"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            الرصيد الختامي في كشف البنك (Ending Balance)
          </label>
          <div className="relative">
            <input
              type="number"
              step="any"
              value={statementBalance}
              onChange={e => setStatementBalance(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-600"
              placeholder="0.00"
            />
            <span className="absolute left-3 top-2 text-[10px] text-slate-400 font-bold">
              {db.settings.currency}
            </span>
          </div>
        </div>
      </div>

      {/* Live Reconciliation KPI Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] text-slate-500 font-bold block">رصيد الدفاتر الحالي</span>
          <span className="text-sm font-black font-mono text-slate-900 block mt-1">
            {formatMoney(calculatedBookBalance, db.settings.currency)}
          </span>
          <span className="text-[10px] text-slate-400">إجمالي الحركات بالدفاتر</span>
        </div>

        <div className="p-3.5 bg-emerald-50/50 rounded-2xl border border-emerald-100 shadow-2xs">
          <span className="text-[11px] text-emerald-800 font-bold block">إيداعات مطابقة (+)</span>
          <span className="text-sm font-black font-mono text-emerald-900 block mt-1">
            {formatMoney(clearedDeposits, db.settings.currency)}
          </span>
          <span className="text-[10px] text-emerald-700">مقبوضات ظهرت بالبنك</span>
        </div>

        <div className="p-3.5 bg-rose-50/50 rounded-2xl border border-rose-100 shadow-2xs">
          <span className="text-[11px] text-rose-800 font-bold block">سحوبات مطابقة (-)</span>
          <span className="text-sm font-black font-mono text-rose-900 block mt-1">
            {formatMoney(clearedPayments, db.settings.currency)}
          </span>
          <span className="text-[10px] text-rose-700">مدفوعات خصمت بالبنك</span>
        </div>

        <div className="p-3.5 bg-indigo-50/50 rounded-2xl border border-indigo-100 shadow-2xs">
          <span className="text-[11px] text-indigo-800 font-bold block">رصيد كشف البنك المدخل</span>
          <span className="text-sm font-black font-mono text-indigo-950 block mt-1">
            {formatMoney(statementBalance, db.settings.currency)}
          </span>
          <span className="text-[10px] text-indigo-700">بحسب ورقة البنك</span>
        </div>

        <div className={`p-3.5 col-span-2 md:col-span-1 rounded-2xl border shadow-2xs ${
          isBalanced ? 'bg-emerald-50 border-emerald-300' : 'bg-amber-50 border-amber-300'
        }`}>
          <span className="text-[11px] font-bold block flex items-center gap-1">
            {isBalanced ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            )}
            <span className={isBalanced ? 'text-emerald-800' : 'text-amber-800'}>
              {isBalanced ? 'الفارق: مطابقة تامة' : 'الفارق (غير مطابق)'}
            </span>
          </span>
          <span className={`text-base font-black font-mono block mt-1 ${
            isBalanced ? 'text-emerald-950' : 'text-amber-950'
          }`}>
            {formatMoney(difference, db.settings.currency)}
          </span>
          <span className="text-[10px] font-bold block mt-0.5 text-slate-600">
            {isBalanced ? 'مستعد للاعتماد النهائي' : 'حدد الحركات المطابقة'}
          </span>
        </div>
      </div>

      {/* Checklist Workspace */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-black text-slate-900">
              حركات الدفاتر غير المطابقة ({filteredItems.length})
            </h3>
            <div className="flex items-center bg-slate-200 rounded-lg p-0.5 text-xs font-bold">
              <button
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  filterType === 'all' ? 'bg-white text-slate-950 shadow-2xs' : 'text-slate-600'
                }`}
              >
                الكل
              </button>
              <button
                onClick={() => setFilterType('deposits')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  filterType === 'deposits' ? 'bg-white text-emerald-950 shadow-2xs' : 'text-slate-600'
                }`}
              >
                إيداعات
              </button>
              <button
                onClick={() => setFilterType('payments')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  filterType === 'payments' ? 'bg-white text-rose-950 shadow-2xs' : 'text-slate-600'
                }`}
              >
                مدفوعات
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={selectAll}
              className="px-3 py-1 bg-white border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-100"
            >
              تحديد الكل كمطابق
            </button>
            <button
              onClick={deselectAll}
              className="px-3 py-1 bg-white border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-100"
            >
              إلغاء التحديد
            </button>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100/70 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3 w-12 text-center">مطابق</th>
                <th className="p-3">التاريخ</th>
                <th className="p-3">نوع الحركة</th>
                <th className="p-3">المرجع والوصف</th>
                <th className="p-3">الجهة / المستفيد</th>
                <th className="p-3 text-left">المبلغ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    لا توجد حركات مسجلة بهذا الحساب حتى تاريخ {statementDate}
                  </td>
                </tr>
              ) : (
                filteredItems.map(it => {
                  const isChecked = clearedIds.has(it.id);
                  const isDeposit = it.type === 'deposit';
                  return (
                    <tr
                      key={it.id}
                      onClick={() => toggleCleared(it.id)}
                      className={`cursor-pointer transition-colors ${
                        isChecked ? 'bg-indigo-50/40 hover:bg-indigo-50/60' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="p-3 text-center">
                        <div
                          className={`w-5 h-5 mx-auto rounded-md flex items-center justify-center transition-all ${
                            isChecked
                              ? 'bg-indigo-600 text-white'
                              : 'border-2 border-slate-300 bg-white'
                          }`}
                        >
                          {isChecked && <Check className="w-3.5 h-3.5" />}
                        </div>
                      </td>
                      <td className="p-3 font-mono text-slate-600">{it.date}</td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isDeposit
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {isDeposit ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                          {it.source}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-slate-900">{it.reference}</td>
                      <td className="p-3 text-slate-600">{it.partyName || '—'}</td>
                      <td className={`p-3 text-left font-mono font-bold ${
                        isDeposit ? 'text-emerald-700' : 'text-rose-700'
                      }`}>
                        {formatMoney(it.amount, db.settings.currency)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Confirmation Bar */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            تمت مطابقة <strong>{clearedIds.size}</strong> من إجمالي <strong>{items.length}</strong> حركة بنكية.
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveReconciliation}
              className={`px-6 py-2.5 text-xs font-black rounded-xl transition-all flex items-center gap-2 shadow-xs ${
                isBalanced
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-slate-900 hover:bg-slate-800 text-white'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isBalanced ? 'اعتماد وإغلاق التسوية البنكية (مطابق)' : 'حفظ مسودة التسوية'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Hidden Printable Area for Direct PDF Generation */}
      <div className="hidden">
        <div id="bank-rec-printable" className="p-8 bg-white text-black font-sans space-y-6">
          <div className="border-b-2 border-black pb-4 flex justify-between items-start">
            <div>
              <h1 className="text-xl font-black">{db.settings.company}</h1>
              <h2 className="text-base font-bold mt-1">مذكرة التسوية البنكية (Bank Reconciliation Statement)</h2>
              <p className="text-xs text-slate-600 mt-0.5">الحساب: {selectedAccount.name} ({selectedAccount.code})</p>
            </div>
            <div className="text-left font-mono text-xs">
              <div>تاريخ التسوية: {statementDate}</div>
              <div className="font-bold">الحالة: {isBalanced ? 'مطابق ومعتمد 100%' : 'مسودة قيد المراجعة'}</div>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between border-b pb-1 font-bold">
              <span>رصيد الحساب البنكي بحسب الدفاتر المحاسبية:</span>
              <span className="font-mono">{formatMoney(calculatedBookBalance, db.settings.currency)}</span>
            </div>
            <div className="flex justify-between text-slate-700">
              <span>+ إيداعات بالطريق (غير مخصومة في كشف البنك):</span>
              <span className="font-mono">{formatMoney(unclearedDeposits, db.settings.currency)}</span>
            </div>
            <div className="flex justify-between text-slate-700">
              <span>- شيكات ومدفوعات محررة لم تصرف بعد:</span>
              <span className="font-mono">{formatMoney(unclearedPayments, db.settings.currency)}</span>
            </div>
            <div className="flex justify-between border-t-2 border-black pt-2 font-black text-sm">
              <span>الرصيد الدفتري المعدل:</span>
              <span className="font-mono">{formatMoney(adjustedBankBalance, db.settings.currency)}</span>
            </div>
            <div className="flex justify-between border-t pt-1 font-black">
              <span>رصيد كشف الحساب البنكي الفعلي:</span>
              <span className="font-mono">{formatMoney(statementBalance, db.settings.currency)}</span>
            </div>
            <div className="flex justify-between border-t border-black pt-1 font-black">
              <span>الفارق المتبقي:</span>
              <span className="font-mono">{formatMoney(difference, db.settings.currency)}</span>
            </div>
          </div>

          <div className="pt-8 grid grid-cols-2 text-center text-xs font-bold">
            <div className="border-t border-black w-44 mx-auto pt-1">إعداد المحاسب المسؤول</div>
            <div className="border-t border-black w-44 mx-auto pt-1">اعتماد المدير المالي</div>
          </div>
        </div>
      </div>

      {/* Quick Bank Fee Modal */}
      {showFeeModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              <span>تسجيل مصروف / عمولة بنكية تلقائية</span>
            </h3>

            <form onSubmit={handleAddFee} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={feeAmount}
                  onChange={e => setFeeAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">البيان والوصف</label>
                <input
                  type="text"
                  required
                  value={feeDescription}
                  onChange={e => setFeeDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowFeeModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl"
                >
                  إثبات بالسجلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
