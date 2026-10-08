import React, { useState } from 'react';
import {
  Lock,
  Unlock,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Scale,
  FileText,
  Printer,
  Download,
  Plus,
  RefreshCw,
  ShieldCheck,
  Building2
} from 'lucide-react';
import { AccountingDB, FiscalPeriod, JournalEntry, JournalLine } from '../types/accounting';
import { formatMoney, generateId, getTodayDate, logAudit } from '../services/accountingStorage';
import { downloadElementAsPdf } from '../services/printAndPdfService';
import { useModalBackHandler } from '../hooks/useModalBackHandler';

interface YearEndClosingViewProps {
  db: AccountingDB;
  onUpdateDb: (updated: AccountingDB) => void;
}

export const YearEndClosingView: React.FC<YearEndClosingViewProps> = ({ db, onUpdateDb }) => {
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>(
    db.periods[0]?.id || ''
  );
  const [showNewPeriodModal, setShowNewPeriodModal] = useState(false);

  useModalBackHandler(showNewPeriodModal, () => setShowNewPeriodModal(false), 'new_period_modal');
  const [newPeriodName, setNewPeriodName] = useState('');
  const [newPeriodFrom, setNewPeriodFrom] = useState(`${new Date().getFullYear() + 1}-01-01`);
  const [newPeriodTo, setNewPeriodTo] = useState(`${new Date().getFullYear() + 1}-12-31`);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const selectedPeriod = db.periods.find(p => p.id === selectedPeriodId) || db.periods[0];

  // Calculate Revenues & Expenses within selected period
  const calculatePeriodFinancials = (period?: FiscalPeriod) => {
    if (!period) return { revenues: 0, expenses: 0, netProfit: 0, revenueAccounts: [], expenseAccounts: [] };

    const fromDate = period.from;
    const toDate = period.to;

    // Filter journal entries within period date range, excluding previous closing entries
    const periodJournals = db.journals.filter(j => 
      j.date >= fromDate && 
      j.date <= toDate &&
      !j.description.includes('قيد الإقفال السنوي')
    );

    // Sum balances by account
    const accBalances: Record<string, { name: string; code: string; type: string; debit: number; credit: number }> = {};
    
    // Also include sales invoices
    db.invoices.forEach(inv => {
      if (inv.date >= fromDate && inv.date <= toDate) {
        if (!accBalances['acc_sales']) {
          accBalances['acc_sales'] = { name: 'إيراد المبيعات', code: '4101', type: 'revenue', debit: 0, credit: 0 };
        }
        accBalances['acc_sales'].credit += Number(inv.subtotal || inv.total || 0);

        // COGS
        const cogsTotal = inv.items.reduce((s, it) => s + (Number(it.costPrice || 0) * Number(it.qty || 0)), 0);
        if (cogsTotal > 0) {
          if (!accBalances['acc_cogs']) {
            accBalances['acc_cogs'] = { name: 'تكلفة البضاعة المباعة (COGS)', code: '5101', type: 'expense', debit: 0, credit: 0 };
          }
          accBalances['acc_cogs'].debit += cogsTotal;
        }
      }
    });

    // Include operational expenses
    db.expenses.forEach(exp => {
      if (exp.date >= fromDate && exp.date <= toDate) {
        if (!accBalances['acc_exp']) {
          accBalances['acc_exp'] = { name: 'المصروفات العمومية والتشغيلية', code: '5201', type: 'expense', debit: 0, credit: 0 };
        }
        accBalances['acc_exp'].debit += Number(exp.amount || 0);
      }
    });

    // Include other revenues
    db.revenues.forEach(rev => {
      if (rev.date >= fromDate && rev.date <= toDate) {
        if (!accBalances['acc_other_rev']) {
          accBalances['acc_other_rev'] = { name: 'إيرادات تشغيلية وأخرى', code: '4201', type: 'revenue', debit: 0, credit: 0 };
        }
        accBalances['acc_other_rev'].credit += Number(rev.amount || 0);
      }
    });

    // Include journal entries lines
    periodJournals.forEach(j => {
      j.lines.forEach(l => {
        const acc = db.accounts.find(a => a.id === l.accountId);
        if (acc && (acc.type === 'revenue' || acc.type === 'expense')) {
          if (!accBalances[acc.id]) {
            accBalances[acc.id] = { name: acc.name, code: acc.code, type: acc.type, debit: 0, credit: 0 };
          }
          accBalances[acc.id].debit += Number(l.debit || 0);
          accBalances[acc.id].credit += Number(l.credit || 0);
        }
      });
    });

    const revenueAccounts: { id: string; name: string; code: string; netCredit: number }[] = [];
    const expenseAccounts: { id: string; name: string; code: string; netDebit: number }[] = [];

    let totalRevenues = 0;
    let totalExpenses = 0;

    Object.entries(accBalances).forEach(([accId, data]) => {
      if (data.type === 'revenue') {
        const netCredit = data.credit - data.debit;
        if (netCredit > 0) {
          revenueAccounts.push({ id: accId, name: data.name, code: data.code, netCredit });
          totalRevenues += netCredit;
        }
      } else if (data.type === 'expense') {
        const netDebit = data.debit - data.credit;
        if (netDebit > 0) {
          expenseAccounts.push({ id: accId, name: data.name, code: data.code, netDebit });
          totalExpenses += netDebit;
        }
      }
    });

    const netProfit = totalRevenues - totalExpenses;

    return {
      revenues: totalRevenues,
      expenses: totalExpenses,
      netProfit,
      revenueAccounts,
      expenseAccounts
    };
  };

  const financials = calculatePeriodFinancials(selectedPeriod);

  // Execute Year-End Closing
  const handleExecuteClosing = () => {
    if (!selectedPeriod) return;
    if (selectedPeriod.status === 'مغلق') {
      alert('هذه الفترة مغلقة بالفعل ومرحلة مسبقاً.');
      return;
    }

    const confirmMsg = `تأكيد هام: هل ترغب في إقفال الفترة المالية (${selectedPeriod.name})؟\n\n` +
      `إجمالي الإيرادات: ${formatMoney(financials.revenues, db.settings.currency)}\n` +
      `إجمالي المصروفات: ${formatMoney(financials.expenses, db.settings.currency)}\n` +
      `صافي الأرباح/الخسائر: ${formatMoney(financials.netProfit, db.settings.currency)}\n\n` +
      `سيتم إنشاء قيد إقفال آلي وترحيل صافي النتيجة لحساب (الأرباح والخسائر المرحلة) وقفل الفترة لمنع التعديل.`;

    if (!confirm(confirmMsg)) return;

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const closingDate = selectedPeriod.to;
    const closingEntryId = generateId('jrn_close');
    const closingNumber = `CLOSE-${selectedPeriod.to.replace(/-/g, '').slice(0, 4)}`;

    const lines: JournalLine[] = [];

    // 1. Debit all revenue accounts to zero them out
    financials.revenueAccounts.forEach(rev => {
      lines.push({
        accountId: rev.id,
        accountName: rev.name,
        accountCode: rev.code,
        debit: rev.netCredit,
        credit: 0,
        notes: `إقفال حساب ${rev.name} السنوي`
      });
    });

    // 2. Credit all expense accounts to zero them out
    financials.expenseAccounts.forEach(exp => {
      lines.push({
        accountId: exp.id,
        accountName: exp.name,
        accountCode: exp.code,
        debit: 0,
        credit: exp.netDebit,
        notes: `إقفال حساب ${exp.name} السنوي`
      });
    });

    // 3. Balance transfer to Retained Earnings
    const retainedAcc = updated.accounts.find(a => a.id === 'acc_retained_earnings') || {
      id: 'acc_retained_earnings',
      name: 'الأرباح والخسائر المرحلة (السنوات السابقة)',
      code: '3201',
      type: 'equity'
    };

    if (financials.netProfit > 0) {
      // Net Profit: Credit Retained Earnings
      lines.push({
        accountId: retainedAcc.id,
        accountName: retainedAcc.name,
        accountCode: retainedAcc.code,
        debit: 0,
        credit: financials.netProfit,
        notes: `ترحيل صافي أرباح الفترة (${selectedPeriod.name}) للأرباح المرحلة`
      });
    } else if (financials.netProfit < 0) {
      // Net Loss: Debit Retained Earnings
      lines.push({
        accountId: retainedAcc.id,
        accountName: retainedAcc.name,
        accountCode: retainedAcc.code,
        debit: Math.abs(financials.netProfit),
        credit: 0,
        notes: `ترحيل صافي خسائر الفترة (${selectedPeriod.name}) للأرباح المرحلة`
      });
    }

    if (lines.length > 0) {
      const closingEntry: JournalEntry = {
        id: closingEntryId,
        number: closingNumber,
        date: closingDate,
        description: `قيد الإقفال السنوي وترحيل الأرصدة للفترة ${selectedPeriod.name}`,
        sourceType: 'adjustment',
        sourceId: selectedPeriod.id,
        lines,
        createdAt: new Date().toISOString()
      };
      updated.journals.push(closingEntry);
    }

    // Update Period
    const perIndex = updated.periods.findIndex(p => p.id === selectedPeriod.id);
    if (perIndex !== -1) {
      updated.periods[perIndex] = {
        ...updated.periods[perIndex],
        status: 'مغلق',
        closedAt: new Date().toISOString(),
        closingJournalId: closingEntryId,
        netIncome: financials.netProfit,
        retainedEarningsAccountId: retainedAcc.id
      };
    }

    logAudit(
      updated,
      'إقفال فترة مالية سنوية',
      `تم إقفال الفترة ${selectedPeriod.name} بصافي نتيجة ${formatMoney(financials.netProfit, db.settings.currency)} وتوليد قيد الإقفال ${closingNumber}`
    );

    onUpdateDb(updated);
    alert('تم إقفال الفترة المالية وترحيل الأرصدة بنجاح وقفل العمليات.');
  };

  // Re-open period
  const handleReopenPeriod = () => {
    if (!selectedPeriod) return;
    if (selectedPeriod.status !== 'مغلق') return;

    if (!confirm(`هل أنت متأكد من فتح الفترة المالية (${selectedPeriod.name}) مجدداً؟\nسيتم حذف قيد الإقفال السنوي التلقائي للسماح بإدخال تسويات إضافية.`)) {
      return;
    }

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    if (selectedPeriod.closingJournalId) {
      updated.journals = updated.journals.filter(j => j.id !== selectedPeriod.closingJournalId);
    }

    const perIndex = updated.periods.findIndex(p => p.id === selectedPeriod.id);
    if (perIndex !== -1) {
      updated.periods[perIndex] = {
        ...updated.periods[perIndex],
        status: 'مفتوح',
        closedAt: undefined,
        closingJournalId: undefined
      };
    }

    logAudit(updated, 'إلغاء إقفال فترة مالية', `تم إعادة فتح الفترة ${selectedPeriod.name}`);
    onUpdateDb(updated);
    alert('تم فتح الفترة المالية بنجاح.');
  };

  // Create new period
  const handleCreatePeriod = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPeriodName.trim() || !newPeriodFrom || !newPeriodTo) {
      alert('يرجى استكمال جميع بيانات الفترة المالية.');
      return;
    }

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const newPer: FiscalPeriod = {
      id: generateId('per'),
      name: newPeriodName.trim(),
      from: newPeriodFrom,
      to: newPeriodTo,
      status: 'مفتوح'
    };

    updated.periods.push(newPer);
    logAudit(updated, 'إنشاء فترة مالية جديدة', newPer.name);
    onUpdateDb(updated);
    setSelectedPeriodId(newPer.id);
    setShowNewPeriodModal(false);
    setNewPeriodName('');
  };

  const handleDownloadPdf = async () => {
    setIsExportingPdf(true);
    try {
      await downloadElementAsPdf('closing-summary-sheet', {
        format: 'a4',
        filename: `year_closing_${selectedPeriod?.name || 'report'}.pdf`
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-slate-900 text-white rounded-xl">
              <Lock className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-black text-slate-900">
              إقفال الفترات المالية والسنوية وترحيل الأرصدة
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            احتساب صافي الدخل، إقفال حسابات الإيرادات والمصروفات، ترحيل الأرباح والخسائر المرحلة، وقفل العمليات
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setShowNewPeriodModal(true)}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>إنشاء فترة مالية جديدة</span>
          </button>
        </div>
      </div>

      {/* Period Selector Tabs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
          <h3 className="text-xs font-black text-slate-700 flex items-center justify-between">
            <span>الفترات المالية والسنوات</span>
            <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full font-mono">
              {db.periods.length} فترة
            </span>
          </h3>

          <div className="space-y-2 max-h-[380px] overflow-y-auto">
            {db.periods.map(p => {
              const isSelected = p.id === (selectedPeriod?.id || '');
              const isClosed = p.status === 'مغلق';
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPeriodId(p.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-slate-900 bg-slate-50/80 shadow-xs'
                      : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-xs text-slate-900">{p.name}</span>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 ${
                        isClosed
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {isClosed ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
                      {p.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono mt-1">
                    {p.from} إلى {p.to}
                  </div>
                  {p.closedAt && (
                    <div className="text-[10px] text-slate-400 mt-1">
                      أغلقت: {new Date(p.closedAt).toLocaleDateString('ar-EG')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Period Details & Actions */}
        <div className="md:col-span-2 space-y-4">
          {selectedPeriod && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-black text-slate-900">{selectedPeriod.name}</h2>
                    <span
                      className={`text-xs font-black px-2.5 py-0.5 rounded-full ${
                        selectedPeriod.status === 'مغلق'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {selectedPeriod.status === 'مغلق' ? 'مقفل ومرحل رسمياً' : 'مفتوح للعمليات'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1 font-mono">
                    الفترة الزمنية: من {selectedPeriod.from} حتى {selectedPeriod.to}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadPdf}
                    disabled={isExportingPdf}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تحميل تقرير الإقفال PDF</span>
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg transition-all"
                    title="طباعة"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-100">
                  <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold">
                    <TrendingUp className="w-4 h-4" />
                    <span>إجمالي الإيرادات للفترة</span>
                  </div>
                  <div className="text-lg font-black text-emerald-950 font-mono mt-1">
                    {formatMoney(financials.revenues, db.settings.currency)}
                  </div>
                  <div className="text-[10px] text-emerald-700 mt-0.5">
                    {financials.revenueAccounts.length} حسابات إيراد
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-rose-50/50 border border-rose-100">
                  <div className="flex items-center gap-2 text-rose-800 text-xs font-bold">
                    <TrendingDown className="w-4 h-4" />
                    <span>إجمالي المصروفات والتكاليف</span>
                  </div>
                  <div className="text-lg font-black text-rose-950 font-mono mt-1">
                    {formatMoney(financials.expenses, db.settings.currency)}
                  </div>
                  <div className="text-[10px] text-rose-700 mt-0.5">
                    {financials.expenseAccounts.length} حسابات مصروف
                  </div>
                </div>

                <div className={`p-4 rounded-xl border ${
                  financials.netProfit >= 0 ? 'bg-indigo-50/50 border-indigo-100' : 'bg-amber-50/50 border-amber-100'
                }`}>
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <Scale className="w-4 h-4" />
                    <span>صافي النتيجة (أرباح/خسائر)</span>
                  </div>
                  <div className={`text-lg font-black font-mono mt-1 ${
                    financials.netProfit >= 0 ? 'text-indigo-950' : 'text-amber-950'
                  }`}>
                    {formatMoney(financials.netProfit, db.settings.currency)}
                  </div>
                  <div className="text-[10px] text-slate-600 mt-0.5">
                    {financials.netProfit >= 0 ? 'صافي ربح مرحل' : 'صافي خسارة مرحلة'}
                  </div>
                </div>
              </div>

              {/* Printable Closing Summary Sheet */}
              <div id="closing-summary-sheet" className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                  <div className="font-black text-xs text-slate-800">
                    كشف حسابات الإقفال السنوي المقترح ({selectedPeriod.name})
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {db.settings.company}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {/* Revenue Accounts */}
                  <div>
                    <h4 className="font-bold text-emerald-800 mb-1.5 flex items-center gap-1">
                      <span>حسابات الإيرادات (تُقفل مدين)</span>
                    </h4>
                    {financials.revenueAccounts.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic">لا توجد حركات إيراد في هذه الفترة</p>
                    ) : (
                      <div className="space-y-1">
                        {financials.revenueAccounts.map(r => (
                          <div key={r.id} className="flex justify-between p-1.5 bg-white rounded border border-slate-200 text-[11px]">
                            <span>{r.name} <span className="text-[10px] text-slate-400 font-mono">({r.code})</span></span>
                            <span className="font-mono font-bold text-emerald-700">{formatMoney(r.netCredit, db.settings.currency)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Expense Accounts */}
                  <div>
                    <h4 className="font-bold text-rose-800 mb-1.5 flex items-center gap-1">
                      <span>حسابات المصروفات (تُقفل دائن)</span>
                    </h4>
                    {financials.expenseAccounts.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic">لا توجد حركات مصروفات في هذه الفترة</p>
                    ) : (
                      <div className="space-y-1">
                        {financials.expenseAccounts.map(e => (
                          <div key={e.id} className="flex justify-between p-1.5 bg-white rounded border border-slate-200 text-[11px]">
                            <span>{e.name} <span className="text-[10px] text-slate-400 font-mono">({e.code})</span></span>
                            <span className="font-mono font-bold text-rose-700">{formatMoney(e.netDebit, db.settings.currency)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Closing Target */}
                <div className="border-t border-slate-200 pt-3 flex flex-col sm:flex-row justify-between items-center text-xs gap-2">
                  <div className="text-slate-600 font-medium">
                    حساب الأرباح المحتجزة / المرحلة المستهدف: <strong className="text-slate-900 font-black">حـ/ 3201 الأرباح والخسائر المرحلة</strong>
                  </div>
                  <div className="font-mono font-black text-slate-950 text-sm">
                    الرصيد المرحل: {formatMoney(financials.netProfit, db.settings.currency)}
                  </div>
                </div>
              </div>

              {/* Action Bar */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                {selectedPeriod.status === 'مفتوح' ? (
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      onClick={handleExecuteClosing}
                      className="w-full sm:w-auto px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl transition-all flex items-center justify-center gap-2 shadow-xs"
                    >
                      <Lock className="w-4 h-4" />
                      <span>تنفيذ الإقفال السنوي وترحيل الأرصدة وقفل العمليات</span>
                    </button>
                    <span className="text-[11px] text-slate-500">
                      يُمنع تعديل أي فاتورة أو سند داخل نطاق هذه الفترة بعد الإقفال.
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 w-full justify-between">
                    <div className="flex items-center gap-2 text-xs text-rose-700 font-bold">
                      <ShieldCheck className="w-4 h-4" />
                      <span>هذه الفترة مقفلة ومؤمنة في سجل التدقيق</span>
                    </div>
                    <button
                      onClick={handleReopenPeriod}
                      className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
                    >
                      <Unlock className="w-4 h-4" />
                      <span>إلغاء الإقفال والفتح المؤقت</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Period Modal */}
      {showNewPeriodModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>إنشاء فترة محاسبية جديدة</span>
            </h3>

            <form onSubmit={handleCreatePeriod} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم الفترة / السنة المالية</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: السنة المالية 2026"
                  value={newPeriodName}
                  onChange={e => setNewPeriodName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ البداية</label>
                  <input
                    type="date"
                    required
                    value={newPeriodFrom}
                    onChange={e => setNewPeriodFrom(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ النهاية</label>
                  <input
                    type="date"
                    required
                    value={newPeriodTo}
                    onChange={e => setNewPeriodTo(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewPeriodModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl"
                >
                  حفظ الفترة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
