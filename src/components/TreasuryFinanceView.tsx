import React, { useState } from 'react';
import {
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  BookOpen,
  FileSpreadsheet,
  BookMarked,
  Plus,
  ArrowLeftRight,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  FileText,
  DollarSign
} from 'lucide-react';
import {
  AccountingDB,
  PaymentMethod,
  SimpleRecord,
  Account,
  JournalEntry,
  TreasuryEntry
} from '../types/accounting';
import {
  formatMoney,
  PAYMENT_METHODS,
  getMethodAccountId,
  generateId,
  getTodayDate,
  calculateTreasuryBalance,
  logAudit
} from '../services/accountingStorage';
import { downloadElementAsPdf } from '../services/printAndPdfService';
import { useModalBackHandler } from '../hooks/useModalBackHandler';

interface TreasuryFinanceViewProps {
  subPage: 'treasury' | 'expenses' | 'revenues' | 'accounts' | 'journals' | 'ledger';
  db: AccountingDB;
  onUpdateDb: (updated: AccountingDB) => void;
}

export const TreasuryFinanceView: React.FC<TreasuryFinanceViewProps> = ({
  subPage,
  db,
  onUpdateDb
}) => {
  // Modals
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showSimpleModal, setShowSimpleModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showJournalModal, setShowJournalModal] = useState(false);

  // Mobile back buttons: close modal without leaving treasury view
  useModalBackHandler(showMoveModal, () => setShowMoveModal(false), 'treasury_move_modal');
  useModalBackHandler(showTransferModal, () => setShowTransferModal(false), 'treasury_transfer_modal');
  useModalBackHandler(showSimpleModal, () => setShowSimpleModal(false), 'treasury_simple_modal');
  useModalBackHandler(showAccountModal, () => setShowAccountModal(false), 'treasury_account_modal');
  useModalBackHandler(showJournalModal, () => setShowJournalModal(false), 'treasury_journal_modal');

  // Manual movement form
  const [moveDir, setMoveDir] = useState<'in' | 'out'>('in');
  const [moveAmount, setMoveAmount] = useState<number>(0);
  const [moveMethod, setMoveMethod] = useState<PaymentMethod>('نقدي');
  const [moveDesc, setMoveDesc] = useState('');

  // Internal transfer form
  const [fromMethod, setFromMethod] = useState<PaymentMethod>('نقدي');
  const [toMethod, setToMethod] = useState<PaymentMethod>('InstaPay');
  const [transferAmount, setTransferAmount] = useState<number>(0);
  const [transferNote, setTransferNote] = useState('تحويل وتغذية رصيد داخلي');

  // Expense/Revenue form
  const [simpleDate, setSimpleDate] = useState(getTodayDate());
  const [simpleCategory, setSimpleCategory] = useState('');
  const [simpleAmount, setSimpleAmount] = useState<number>(0);
  const [simpleMethod, setSimpleMethod] = useState<PaymentMethod>('نقدي');
  const [simpleDesc, setSimpleDesc] = useState('');

  // Account form
  const [accCode, setAccCode] = useState('');
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState<'asset' | 'liability' | 'equity' | 'revenue' | 'expense'>('expense');

  // Manual Journal form
  const [journalDate, setJournalDate] = useState(getTodayDate());
  const [journalDesc, setJournalDesc] = useState('');
  const [debitAccId, setDebitAccId] = useState(db.accounts[0]?.id || '');
  const [creditAccId, setCreditAccId] = useState(db.accounts[1]?.id || '');
  const [journalAmount, setJournalAmount] = useState<number>(0);

  // Save manual treasury in/out
  const handleSaveMove = (e: React.FormEvent) => {
    e.preventDefault();
    if (moveAmount <= 0) return alert('المبلغ غير صالح');

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const entryId = generateId('tr');

    updated.treasury.unshift({
      id: entryId,
      date: getTodayDate(),
      direction: moveDir,
      amount: moveAmount,
      method: moveMethod,
      description: moveDesc || (moveDir === 'in' ? 'إيداع نقدي مباشر' : 'سحب نقدي مباشر'),
      sourceType: 'manual',
      sourceId: entryId
    });

    logAudit(updated, 'حركة خزينة يدوية', `${moveDir === 'in' ? 'إيداع' : 'سحب'} ${formatMoney(moveAmount, updated.settings.currency)} (${moveMethod})`);
    onUpdateDb(updated);
    setMoveAmount(0);
    setMoveDesc('');
    setShowMoveModal(false);
  };

  // Transfer between payment methods (e.g. from Cash to InstaPay)
  const handleSaveTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (fromMethod === toMethod) return alert('اختر وسيلتين مختلفتين للتحويل');
    if (transferAmount <= 0) return alert('المبلغ غير صالح');

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const fromBal = calculateTreasuryBalance(updated, fromMethod);
    if (fromBal < transferAmount) {
      alert(`رصيد ${fromMethod} الحالي (${formatMoney(fromBal, updated.settings.currency)}) لا يكفي لإتمام التحويل.`);
      return;
    }

    const tId = generateId('tr');
    // 1. Out from source method
    updated.treasury.unshift({
      id: generateId('tr'),
      date: getTodayDate(),
      direction: 'out',
      amount: transferAmount,
      method: fromMethod,
      description: `تحويل صادر إلى ${toMethod}: ${transferNote}`,
      sourceType: 'transfer',
      sourceId: tId
    });

    // 2. In to destination method
    updated.treasury.unshift({
      id: generateId('tr'),
      date: getTodayDate(),
      direction: 'in',
      amount: transferAmount,
      method: toMethod,
      description: `تحويل وارد من ${fromMethod}: ${transferNote}`,
      sourceType: 'transfer',
      sourceId: tId
    });

    // 3. Double-entry journal between asset accounts
    const fromAccId = getMethodAccountId(fromMethod);
    const toAccId = getMethodAccountId(toMethod);
    const fromAcc = updated.accounts.find(a => a.id === fromAccId) || updated.accounts[0];
    const toAcc = updated.accounts.find(a => a.id === toAccId) || updated.accounts[1];

    updated.journals.unshift({
      id: generateId('j'),
      number: `J-${Date.now().toString().slice(-6)}`,
      date: getTodayDate(),
      description: `تحويل سيولة داخلية من ${fromMethod} إلى ${toMethod}`,
      sourceType: 'manual',
      sourceId: tId,
      lines: [
        { accountId: toAcc.id, accountCode: toAcc.code, accountName: toAcc.name, debit: transferAmount, credit: 0, notes: `تغذية رصيد ${toMethod}` },
        { accountId: fromAcc.id, accountCode: fromAcc.code, accountName: fromAcc.name, debit: 0, credit: transferAmount, notes: `سحب من ${fromMethod}` }
      ],
      createdAt: new Date().toISOString()
    });

    logAudit(updated, 'تحويل سيولة بين الخزائن', `تحويل ${formatMoney(transferAmount, updated.settings.currency)} من ${fromMethod} إلى ${toMethod}`);
    onUpdateDb(updated);
    setShowTransferModal(false);
  };

  // Save Expense or Revenue
  const handleSaveSimple = (e: React.FormEvent) => {
    e.preventDefault();
    if (simpleAmount <= 0) return alert('المبلغ غير صالح');
    const isExpense = subPage === 'expenses';

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const recId = generateId(isExpense ? 'exp' : 'rev');

    const record: SimpleRecord = {
      id: recId,
      date: simpleDate,
      category: simpleCategory || (isExpense ? 'مصروفات عامة' : 'إيرادات تشغيلية'),
      amount: simpleAmount,
      method: simpleMethod,
      description: simpleDesc
    };

    if (isExpense) {
      updated.expenses.unshift(record);
      // Treasury Outflow
      updated.treasury.unshift({
        id: generateId('tr'),
        date: simpleDate,
        direction: 'out',
        amount: simpleAmount,
        method: simpleMethod,
        description: `مصروف: ${record.category} (${simpleDesc})`,
        sourceType: 'expense',
        sourceId: recId
      });
      // Journal: Debit Expenses (5201), Credit Cash/Bank
      const expAcc = updated.accounts.find(a => a.id === 'acc_exp')!;
      const cashAccId = getMethodAccountId(simpleMethod);
      const cashAcc = updated.accounts.find(a => a.id === cashAccId) || updated.accounts.find(a => a.id === 'acc_cash')!;

      updated.journals.unshift({
        id: generateId('j'),
        number: `J-${Date.now().toString().slice(-6)}`,
        date: simpleDate,
        description: `إثبات مصروف: ${record.category} - ${simpleDesc}`,
        sourceType: 'expense',
        sourceId: recId,
        lines: [
          { accountId: expAcc.id, accountCode: expAcc.code, accountName: expAcc.name, debit: simpleAmount, credit: 0, notes: record.category },
          { accountId: cashAcc.id, accountCode: cashAcc.code, accountName: cashAcc.name, debit: 0, credit: simpleAmount, notes: `سداد بطريقة ${simpleMethod}` }
        ],
        createdAt: new Date().toISOString()
      });
    } else {
      updated.revenues.unshift(record);
      // Treasury Inflow
      updated.treasury.unshift({
        id: generateId('tr'),
        date: simpleDate,
        direction: 'in',
        amount: simpleAmount,
        method: simpleMethod,
        description: `إيراد: ${record.category} (${simpleDesc})`,
        sourceType: 'revenue',
        sourceId: recId
      });
      // Journal: Debit Cash/Bank, Credit Other Revenues (4201)
      const revAcc = updated.accounts.find(a => a.id === 'acc_other_rev')!;
      const cashAccId = getMethodAccountId(simpleMethod);
      const cashAcc = updated.accounts.find(a => a.id === cashAccId) || updated.accounts.find(a => a.id === 'acc_cash')!;

      updated.journals.unshift({
        id: generateId('j'),
        number: `J-${Date.now().toString().slice(-6)}`,
        date: simpleDate,
        description: `إثبات إيراد: ${record.category} - ${simpleDesc}`,
        sourceType: 'revenue',
        sourceId: recId,
        lines: [
          { accountId: cashAcc.id, accountCode: cashAcc.code, accountName: cashAcc.name, debit: simpleAmount, credit: 0, notes: `تحصيل بطريقة ${simpleMethod}` },
          { accountId: revAcc.id, accountCode: revAcc.code, accountName: revAcc.name, debit: 0, credit: simpleAmount, notes: record.category }
        ],
        createdAt: new Date().toISOString()
      });
    }

    logAudit(updated, isExpense ? 'تسجيل مصروف' : 'تسجيل إيراد', `${record.category} بمبلغ ${formatMoney(simpleAmount, updated.settings.currency)}`);
    onUpdateDb(updated);
    setShowSimpleModal(false);
    setSimpleAmount(0);
    setSimpleDesc('');
  };

  // Add Account to Chart of Accounts
  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accCode.trim() || !accName.trim()) return alert('أكمل بيانات الحساب');

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    if (updated.accounts.some(a => a.code === accCode.trim())) {
      alert('كود الحساب موجود بالفعل');
      return;
    }

    const newAcc: Account = {
      id: generateId('acc'),
      code: accCode.trim(),
      name: accName.trim(),
      type: accType
    };

    updated.accounts.push(newAcc);
    updated.accounts.sort((a, b) => a.code.localeCompare(b.code));
    logAudit(updated, 'إضافة حساب جديد في الدليل', `${accCode} - ${accName}`);
    onUpdateDb(updated);
    setShowAccountModal(false);
    setAccCode('');
    setAccName('');
  };

  // Add Manual Journal Entry
  const handleSaveJournal = (e: React.FormEvent) => {
    e.preventDefault();
    if (journalAmount <= 0) return alert('المبلغ غير صالح');
    if (debitAccId === creditAccId) return alert('لا يمكن اختيار نفس الحساب للمدين والدائن');

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const debitAcc = updated.accounts.find(a => a.id === debitAccId);
    const creditAcc = updated.accounts.find(a => a.id === creditAccId);
    if (!debitAcc || !creditAcc) return;

    const jId = generateId('j');
    const newEntry: JournalEntry = {
      id: jId,
      number: `J-${Date.now().toString().slice(-6)}`,
      date: journalDate,
      description: journalDesc || 'قيد يومية تسوية يدوي',
      sourceType: 'manual',
      sourceId: jId,
      lines: [
        { accountId: debitAcc.id, accountCode: debitAcc.code, accountName: debitAcc.name, debit: journalAmount, credit: 0 },
        { accountId: creditAcc.id, accountCode: creditAcc.code, accountName: creditAcc.name, debit: 0, credit: journalAmount }
      ],
      createdAt: new Date().toISOString()
    };

    updated.journals.unshift(newEntry);
    logAudit(updated, 'إنشاء قيد يومية يدوي', `${newEntry.number}: ${journalDesc} (${formatMoney(journalAmount, updated.settings.currency)})`);
    onUpdateDb(updated);
    setShowJournalModal(false);
    setJournalAmount(0);
    setJournalDesc('');
  };

  // General Ledger & Trial Balance Calculations
  const getLedgerMap = () => {
    const map: Record<string, { debit: number; credit: number; balance: number }> = {};
    db.accounts.forEach(acc => {
      map[acc.id] = { debit: 0, credit: 0, balance: 0 };
    });

    db.journals.forEach(j => {
      j.lines.forEach(l => {
        if (!map[l.accountId]) {
          map[l.accountId] = { debit: 0, credit: 0, balance: 0 };
        }
        map[l.accountId].debit += Number(l.debit) || 0;
        map[l.accountId].credit += Number(l.credit) || 0;
      });
    });

    Object.keys(map).forEach(accId => {
      const acc = db.accounts.find(a => a.id === accId);
      const isDebitNormal = acc?.type === 'asset' || acc?.type === 'expense';
      map[accId].balance = isDebitNormal
        ? map[accId].debit - map[accId].credit
        : map[accId].credit - map[accId].debit;
    });

    return map;
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. TREASURY (الخزائن وطرق الدفع) */}
      {subPage === 'treasury' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <Wallet className="w-6 h-6" />
                <span>الخزائن وقنوات الدفع الإلكترونية</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                متابعة أرصدة الكاش، فودافون كاش، إنستاباي، والفيزا مع إمكانية التحويل الداخلي بين الخزائن
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowTransferModal(true)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <ArrowLeftRight className="w-4 h-4" />
                <span>تحويل بين الخزائن</span>
              </button>
              <button
                onClick={() => setShowMoveModal(true)}
                className="px-3.5 py-2 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>حركة نقدية حرة</span>
              </button>
            </div>
          </div>

          {/* Cards for each method */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {PAYMENT_METHODS.filter(m => m !== 'آجل').map(m => {
              const bal = calculateTreasuryBalance(db, m);
              return (
                <div key={m} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-xs font-bold text-slate-600 block mb-1">{m}</span>
                  <span className="text-base sm:text-lg font-black font-mono text-slate-950">
                    {formatMoney(bal, db.settings.currency)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Treasury Log (Responsive Card System) */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-800">
              سجل حركات الخزينة والنقدية التفصيلي
            </h3>

            {db.treasury.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-2xs text-slate-400 text-xs">
                لا توجد حركات نقدية مسجلة حتى الآن
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                {db.treasury.map(tr => {
                  const isIncoming = tr.direction === 'in';
                  return (
                    <div
                      key={tr.id}
                      className="bg-white p-3.5 rounded-xl border border-slate-200 hover:border-slate-300 shadow-2xs hover:shadow-xs transition-all space-y-2"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span className="font-mono text-[11px] text-slate-500">{tr.date}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                          isIncoming
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : 'bg-rose-50 text-rose-800 border-rose-300'
                        }`}>
                          {isIncoming ? 'وارد (+)' : 'صادر (-)'}
                        </span>
                      </div>

                      <div className="text-xs space-y-1">
                        <div className="flex items-center justify-between text-slate-600">
                          <span>طريقة الدفع / القناة:</span>
                          <span className="font-bold text-slate-900">{tr.method}</span>
                        </div>
                        {tr.description && (
                          <p className="text-[11px] text-slate-500 bg-slate-50 p-1.5 rounded truncate">{tr.description}</p>
                        )}
                      </div>

                      <div className="bg-slate-50 p-2 rounded-lg flex items-center justify-between border border-slate-100 mt-2">
                        <span className="text-xs font-bold text-slate-600">المبلغ:</span>
                        <span className={`text-base font-black font-mono ${isIncoming ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {formatMoney(tr.amount, db.settings.currency)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* 2. EXPENSES & REVENUES (المصروفات والإيرادات - Responsive Card System) */}
      {(subPage === 'expenses' || subPage === 'revenues') && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                {subPage === 'expenses' ? <ArrowDownCircle className="w-6 h-6 text-rose-600" /> : <ArrowUpCircle className="w-6 h-6 text-emerald-600" />}
                <span>{subPage === 'expenses' ? 'المصروفات العمومية والتشغيلية' : 'الإيرادات الأخرى والتشغيلية'}</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {subPage === 'expenses'
                  ? 'إثبات مصروفات الإيجار، الرواتب، الفواتير، والصيانة مع خصمها التلقائي من الخزينة'
                  : 'إثبات الإيرادات الإضافية من الخدمات والاستشارات مع إيداعها التلقائي بالخزينة'}
              </p>
            </div>
            <button
              onClick={() => {
                setSimpleCategory(subPage === 'expenses' ? 'إيجار المقر' : 'أرباح خدمات');
                setSimpleAmount(0);
                setSimpleDesc('');
                setShowSimpleModal(true);
              }}
              className="px-4 py-2 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>{subPage === 'expenses' ? 'تسجيل مصروف جديد' : 'تسجيل إيراد جديد'}</span>
            </button>
          </div>

          {(subPage === 'expenses' ? db.expenses : db.revenues).length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-2xs text-slate-400 text-xs">
              {subPage === 'expenses' ? 'لا توجد مصروفات مسجلة حالياً' : 'لا توجد إيرادات مسجلة حالياً'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {(subPage === 'expenses' ? db.expenses : db.revenues).map(item => (
                <div
                  key={item.id}
                  className="bg-white p-3.5 rounded-xl border border-slate-200 hover:border-slate-300 shadow-2xs space-y-2"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="font-bold text-xs text-slate-900">{item.category}</span>
                    <span className="font-mono text-[11px] text-slate-500">{item.date}</span>
                  </div>

                  <div className="text-xs space-y-1">
                    <div className="flex items-center justify-between text-slate-600">
                      <span>الخزينة المسدد منها:</span>
                      <span className="font-medium text-slate-800">{item.method}</span>
                    </div>
                    {item.description && (
                      <p className="text-[11px] text-slate-500 bg-slate-50 p-1.5 rounded truncate">{item.description}</p>
                    )}
                  </div>

                  <div className="bg-slate-50 p-2 rounded-lg flex items-center justify-between border border-slate-100">
                    <span className="text-xs font-bold text-slate-600">المبلغ:</span>
                    <span className={`text-base font-black font-mono ${subPage === 'expenses' ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {formatMoney(item.amount, db.settings.currency)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* 3. CHART OF ACCOUNTS (دليل الحسابات - Responsive Card System) */}
      {subPage === 'accounts' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <BookOpen className="w-6 h-6" />
                <span>دليل الحسابات (شجرة الحسابات المحاسبية)</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                تصنيف الأصول والالتزامات وحقوق الملكية والإيرادات والمصروفات بالأكواد الموحدة
              </p>
            </div>
            <button
              onClick={() => setShowAccountModal(true)}
              className="px-4 py-2 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة حساب فرعي</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {db.accounts.map(acc => {
              const isDebit = acc.type === 'asset' || acc.type === 'expense';
              return (
                <div key={acc.id} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="font-mono font-black text-sm text-slate-900">{acc.code}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 border border-slate-200 text-slate-800">
                      {acc.type === 'asset' ? 'أصول' :
                       acc.type === 'liability' ? 'التزامات' :
                       acc.type === 'equity' ? 'حقوق ملكية' :
                       acc.type === 'revenue' ? 'إيرادات' : 'مصروفات'}
                    </span>
                  </div>

                  <div className="text-xs space-y-1">
                    <h4 className="font-bold text-slate-900">{acc.name}</h4>
                    <div className="flex items-center justify-between text-slate-500 pt-1">
                      <span>طبيعة الحساب:</span>
                      <span className={`font-bold ${isDebit ? 'text-emerald-700' : 'text-blue-700'}`}>
                        {isDebit ? 'مدين بطبيعته' : 'دائن بطبيعته'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 4. JOURNALS (القيود اليومية) */}
      {subPage === 'journals' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <FileSpreadsheet className="w-6 h-6" />
                <span>دفتر القيود اليومية (نظام القيد المزدوج)</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                توليد آلي لقيود المبيعات والمشتريات والمخازن مع إمكانية إدخال قيود تسوية يدوية متوازنة
              </p>
            </div>
            <button
              onClick={() => setShowJournalModal(true)}
              className="px-4 py-2 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة قيد يومية يدوي</span>
            </button>
          </div>

          <div className="space-y-4">
            {db.journals.map(j => {
              const totalDebit = j.lines.reduce((s, l) => s + l.debit, 0);
              const totalCredit = j.lines.reduce((s, l) => s + l.credit, 0);
              const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

              return (
                <div key={j.id} className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                  <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {j.number}
                      </span>
                      <span className="text-xs font-black text-slate-900">{j.description}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-mono text-slate-500">{j.date}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        isBalanced ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {isBalanced ? '✓ متوازن' : '⚠ غير متوازن'}
                      </span>
                    </div>
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-500 bg-slate-50/50">
                          <th className="py-2 px-3">كود الحساب</th>
                          <th className="py-2 px-3">اسم الحساب</th>
                          <th className="py-2 px-3">البيان والشرح</th>
                          <th className="py-2 px-3">مدين (Debit)</th>
                          <th className="py-2 px-3">دائن (Credit)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {j.lines.map((l, idx) => (
                          <tr key={idx}>
                            <td className="py-2 px-3 font-mono text-slate-600">{l.accountCode}</td>
                            <td className="py-2 px-3 font-bold text-slate-900">{l.accountName}</td>
                            <td className="py-2 px-3 text-slate-500">{l.notes || '—'}</td>
                            <td className="py-2 px-3 font-mono font-bold text-slate-950">
                              {l.debit > 0 ? formatMoney(l.debit, db.settings.currency) : '—'}
                            </td>
                            <td className="py-2 px-3 font-mono font-bold text-slate-950">
                              {l.credit > 0 ? formatMoney(l.credit, db.settings.currency) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50 border-t border-slate-200 font-mono font-black text-xs">
                          <td colSpan={3} className="py-2 px-3 text-right">الإجمالي:</td>
                          <td className="py-2 px-3">{formatMoney(totalDebit, db.settings.currency)}</td>
                          <td className="py-2 px-3">{formatMoney(totalCredit, db.settings.currency)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Mobile Cards View (No Horizontal Scroll) */}
                  <div className="sm:hidden p-3 space-y-2.5">
                    {j.lines.map((l, idx) => (
                      <div key={idx} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/60 text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{l.accountName}</span>
                          <span className="font-mono text-[10px] text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                            كود: {l.accountCode}
                          </span>
                        </div>
                        {l.notes && <p className="text-[11px] text-slate-500">{l.notes}</p>}
                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60 font-mono">
                          <div className="bg-white p-1 rounded border border-slate-200 text-center">
                            <span className="block text-[9px] text-slate-400">مدين (Debit)</span>
                            <span className={`font-bold ${l.debit > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                              {l.debit > 0 ? formatMoney(l.debit, db.settings.currency) : '0.00'}
                            </span>
                          </div>
                          <div className="bg-white p-1 rounded border border-slate-200 text-center">
                            <span className="block text-[9px] text-slate-400">دائن (Credit)</span>
                            <span className={`font-bold ${l.credit > 0 ? 'text-blue-700' : 'text-slate-400'}`}>
                              {l.credit > 0 ? formatMoney(l.credit, db.settings.currency) : '0.00'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between p-2 bg-slate-100 rounded-lg text-xs font-mono font-black">
                      <span>إجمالي القيد:</span>
                      <span>{formatMoney(totalDebit, db.settings.currency)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 5. GENERAL LEDGER & TRIAL BALANCE (دفتر الأستاذ وميزان المراجعة - Cards System) */}
      {subPage === 'ledger' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <BookMarked className="w-6 h-6" />
                <span>دفتر الأستاذ وميزان المراجعة بالمجاميع والأرصدة</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                تجميع حركات جميع الحسابات، مجموع المدين والدائن، والرصيد الختامي الصافي
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => downloadElementAsPdf('ledger-printable-container', { format: 'a4', filename: `ledger_trial_balance_${new Date().toISOString().slice(0, 10)}.pdf` })}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                title="تحميل ميزان المراجعة بصيغة PDF"
              >
                <span>تحميل PDF</span>
              </button>
              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>طباعة فورية</span>
              </button>
            </div>
          </div>

          {/* Responsive Ledger Cards System (No Horizontal Scroll) */}
          <div id="ledger-printable-container" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {(() => {
              const ledger = getLedgerMap();
              return db.accounts.map(acc => {
                const data = ledger[acc.id] || { debit: 0, credit: 0, balance: 0 };
                const isDebitNature = acc.type === 'asset' || acc.type === 'expense';
                return (
                  <div
                    key={acc.id}
                    className="bg-white p-4 rounded-xl border border-slate-200 hover:border-slate-300 shadow-2xs hover:shadow-xs transition-all space-y-3"
                  >
                    <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                      <div>
                        <h4 className="font-black text-sm text-slate-900">{acc.name}</h4>
                        <span className="font-mono text-xs text-slate-500">كود: {acc.code}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 border border-slate-200 text-slate-700">
                        {acc.type === 'asset' ? 'أصول' :
                         acc.type === 'liability' ? 'التزامات' :
                         acc.type === 'equity' ? 'حقوق ملكية' :
                         acc.type === 'revenue' ? 'إيرادات' : 'مصروفات'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-center text-xs">
                      <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <span className="block text-[10px] text-slate-500">مجموع المدين</span>
                        <span className="font-mono font-bold text-slate-900">
                          {formatMoney(data.debit, db.settings.currency)}
                        </span>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <span className="block text-[10px] text-slate-500">مجموع الدائن</span>
                        <span className="font-mono font-bold text-slate-900">
                          {formatMoney(data.credit, db.settings.currency)}
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-100/80 p-2.5 rounded-lg flex items-center justify-between border border-slate-200/80">
                      <div>
                        <span className="text-[11px] font-bold text-slate-600 block">الرصيد الصافي الختامي:</span>
                        <span className="text-[10px] text-slate-400">
                          {isDebitNature ? 'مدين بطبيعته' : 'دائن بطبيعته'}
                        </span>
                      </div>
                      <span className={`text-base font-black font-mono ${data.balance >= 0 ? 'text-slate-950' : 'text-rose-700'}`}>
                        {formatMoney(data.balance, db.settings.currency)}
                      </span>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </>
      )}

      {/* Modal: Free Cash In/Out */}
      {showMoveModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl w-full max-w-sm p-4 space-y-3">
            <h2 className="text-sm font-black text-slate-900">تسجيل حركة نقدية مباشرة</h2>
            <form onSubmit={handleSaveMove} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">نوع الحركة</label>
                <select
                  value={moveDir}
                  onChange={e => setMoveDir(e.target.value as 'in' | 'out')}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                >
                  <option value="in">إيداع وارد في الخزينة (+)</option>
                  <option value="out">سحب صادر من الخزينة (-)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">المبلغ *</label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  required
                  value={moveAmount}
                  onChange={e => setMoveAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-black"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">طريقة الدفع والخزينة</label>
                <select
                  value={moveMethod}
                  onChange={e => setMoveMethod(e.target.value as PaymentMethod)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  {PAYMENT_METHODS.filter(m => m !== 'آجل').map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">البيان والسبب</label>
                <input
                  type="text"
                  value={moveDesc}
                  onChange={e => setMoveDesc(e.target.value)}
                  placeholder="سبب الإيداع أو السحب..."
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowMoveModal(false)} className="px-3 py-1.5 bg-slate-100 rounded text-xs font-bold">إلغاء</button>
                <button type="submit" className="px-4 py-1.5 bg-black text-white rounded text-xs font-bold">حفظ الحركة</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Transfer Between Payment Channels */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl w-full max-w-sm p-4 space-y-3">
            <h2 className="text-sm font-black text-slate-900">تحويل سيولة نقدية بين الخزائن</h2>
            <form onSubmit={handleSaveTransfer} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">من خزينة</label>
                  <select
                    value={fromMethod}
                    onChange={e => setFromMethod(e.target.value as PaymentMethod)}
                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    {PAYMENT_METHODS.filter(m => m !== 'آجل').map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">إلى خزينة</label>
                  <select
                    value={toMethod}
                    onChange={e => setToMethod(e.target.value as PaymentMethod)}
                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    {PAYMENT_METHODS.filter(m => m !== 'آجل').map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">المبلغ المحول *</label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  required
                  value={transferAmount}
                  onChange={e => setTransferAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-black"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">ملاحظات التحويل</label>
                <input
                  type="text"
                  value={transferNote}
                  onChange={e => setTransferNote(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowTransferModal(false)} className="px-3 py-1.5 bg-slate-100 rounded text-xs font-bold">إلغاء</button>
                <button type="submit" className="px-4 py-1.5 bg-black text-white rounded text-xs font-bold">تنفيذ التحويل وقيده</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Simple Expense/Revenue */}
      {showSimpleModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl w-full max-w-sm p-4 space-y-3">
            <h2 className="text-sm font-black text-slate-900">
              {subPage === 'expenses' ? 'تسجيل مصروف' : 'تسجيل إيراد'}
            </h2>
            <form onSubmit={handleSaveSimple} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">التاريخ</label>
                <input
                  type="date"
                  required
                  value={simpleDate}
                  onChange={e => setSimpleDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">التصنيف والبند</label>
                <input
                  type="text"
                  required
                  value={simpleCategory}
                  onChange={e => setSimpleCategory(e.target.value)}
                  placeholder="إيجار، كهرباء، مرتبات، صيانة..."
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">المبلغ *</label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  required
                  value={simpleAmount}
                  onChange={e => setSimpleAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-black"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">طريقة الدفع والخزينة</label>
                <select
                  value={simpleMethod}
                  onChange={e => setSimpleMethod(e.target.value as PaymentMethod)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  {PAYMENT_METHODS.filter(m => m !== 'آجل').map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">البيان والشرح</label>
                <input
                  type="text"
                  value={simpleDesc}
                  onChange={e => setSimpleDesc(e.target.value)}
                  placeholder="تفاصيل الفاتورة أو المستلم..."
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowSimpleModal(false)} className="px-3 py-1.5 bg-slate-100 rounded text-xs font-bold">إلغاء</button>
                <button type="submit" className="px-4 py-1.5 bg-black text-white rounded text-xs font-bold">حفظ وترحيل</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Account in Chart of Accounts */}
      {showAccountModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl w-full max-w-sm p-4 space-y-3">
            <h2 className="text-sm font-black text-slate-900">إضافة حساب بدليل الحسابات</h2>
            <form onSubmit={handleSaveAccount} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">كود الحساب (مثال: 5202)</label>
                <input
                  type="text"
                  required
                  value={accCode}
                  onChange={e => setAccCode(e.target.value)}
                  placeholder="5202"
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">اسم الحساب</label>
                <input
                  type="text"
                  required
                  value={accName}
                  onChange={e => setAccName(e.target.value)}
                  placeholder="مصروفات بوفيه وضيافة"
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">التصنيف الرئيسي</label>
                <select
                  value={accType}
                  onChange={e => setAccType(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                >
                  <option value="asset">أصل (Asset)</option>
                  <option value="liability">التزام (Liability)</option>
                  <option value="equity">حقوق ملكية (Equity)</option>
                  <option value="revenue">إيراد (Revenue)</option>
                  <option value="expense">مصروف (Expense)</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAccountModal(false)} className="px-3 py-1.5 bg-slate-100 rounded text-xs font-bold">إلغاء</button>
                <button type="submit" className="px-4 py-1.5 bg-black text-white rounded text-xs font-bold">حفظ الحساب</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Manual Double-Entry Journal */}
      {showJournalModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl w-full max-w-md p-4 space-y-3">
            <h2 className="text-sm font-black text-slate-900">إنشاء قيد يومية متوازن يدوي</h2>
            <form onSubmit={handleSaveJournal} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">تاريخ القيد</label>
                <input
                  type="date"
                  value={journalDate}
                  onChange={e => setJournalDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">شرح وبيان القيد</label>
                <input
                  type="text"
                  required
                  value={journalDesc}
                  onChange={e => setJournalDesc(e.target.value)}
                  placeholder="قيد إثبات استهلاك، تسوية رأس مال..."
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">الطرف المدين (Debit)</label>
                <select
                  value={debitAccId}
                  onChange={e => setDebitAccId(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  {db.accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">الطرف الدائن (Credit)</label>
                <select
                  value={creditAccId}
                  onChange={e => setCreditAccId(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  {db.accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">المبلغ *</label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  required
                  value={journalAmount}
                  onChange={e => setJournalAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-black"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowJournalModal(false)} className="px-3 py-1.5 bg-slate-100 rounded text-xs font-bold">إلغاء</button>
                <button type="submit" className="px-4 py-1.5 bg-black text-white rounded text-xs font-bold">ترحيل القيد</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
