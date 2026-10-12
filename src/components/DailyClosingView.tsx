import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Clock,
  DollarSign,
  TrendingUp,
  ArrowDownCircle,
  ArrowUpCircle,
  Wallet,
  ShieldCheck,
  Plus,
  Edit,
  Trash2,
  Printer,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  ChevronDown,
  X
} from 'lucide-react';
import {
  AccountingDB,
  DailyClosing
} from '../types/accounting';
import {
  formatMoney,
  generateId,
  getTodayDate,
  logAudit
} from '../services/accountingStorage';
import {
  UniversalPrintModal,
  MovementPrintBlock,
  formatCleanNumber
} from './UniversalPrintModal';
import { exportTableToCsv } from '../services/exportService';

interface DailyClosingViewProps {
  db: AccountingDB;
  onUpdateDb: (updated: AccountingDB) => void;
}

export const DailyClosingView: React.FC<DailyClosingViewProps> = ({
  db,
  onUpdateDb
}) => {
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDate());
  const [shiftName, setShiftName] = useState<string>('وردية اليوم');
  const [startingCash, setStartingCash] = useState<number>(0);
  const [actualCash, setActualCash] = useState<number>(0);
  const [shiftNotes, setShiftNotes] = useState<string>('');

  // Editing state
  const [editingClosing, setEditingClosing] = useState<DailyClosing | null>(null);

  // Search in history
  const [historySearch, setHistorySearch] = useState<string>('');

  // Print modal state
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printDocuments, setPrintDocuments] = useState<MovementPrintBlock[]>([]);
  const [printDocTitle, setPrintDocTitle] = useState('تقرير تقفيل اليومية');

  // Calculate live shift statistics for selectedDate
  const liveStats = useMemo(() => {
    // 1. Invoices on selected date
    const daySalesInvoices = db.invoices.filter(i => i.date === selectedDate && i.type === 'sale');
    const dayPurchaseInvoices = db.invoices.filter(i => i.date === selectedDate && i.type === 'purchase');
    const dayReturns = db.returns.filter(r => r.date === selectedDate);

    // Sales metrics
    const salesTotal = daySalesInvoices.reduce((sum, i) => sum + i.total, 0);
    const returnsTotal = dayReturns.reduce((sum, r) => sum + r.total, 0);
    const netSales = Math.max(0, salesTotal - returnsTotal);

    // Cash collections from sales
    const salesCashIn = daySalesInvoices.reduce((sum, i) => sum + (i.paid || 0), 0);
    const purchasesCashOut = dayPurchaseInvoices.reduce((sum, i) => sum + (i.paid || 0), 0);

    // Vouchers on date
    const receiptVouchers = db.vouchers.filter(v => v.date === selectedDate && v.type === 'receipt');
    const paymentVouchers = db.vouchers.filter(v => v.date === selectedDate && v.type === 'payment');
    const vouchersCashIn = receiptVouchers.reduce((sum, v) => sum + v.amount, 0);
    const vouchersCashOut = paymentVouchers.reduce((sum, v) => sum + v.amount, 0);

    // Treasury entries on date
    const dayTreasury = db.treasury.filter(t => t.date === selectedDate);
    const manualTreasuryIn = dayTreasury.filter(t => t.direction === 'in' && !t.sourceType?.includes('invoice') && !t.sourceType?.includes('voucher')).reduce((sum, t) => sum + t.amount, 0);
    const manualTreasuryOut = dayTreasury.filter(t => t.direction === 'out' && !t.sourceType?.includes('invoice') && !t.sourceType?.includes('voucher')).reduce((sum, t) => sum + t.amount, 0);

    // Expenses & Revenues on date
    const dayExpenses = db.expenses.filter(e => e.date === selectedDate).reduce((sum, e) => sum + e.amount, 0);
    const dayRevenues = db.revenues.filter(r => r.date === selectedDate).reduce((sum, r) => sum + r.amount, 0);

    // Total Cash In & Total Cash Out
    const totalCashIn = salesCashIn + vouchersCashIn + manualTreasuryIn + dayRevenues;
    const totalCashOut = purchasesCashOut + vouchersCashOut + manualTreasuryOut + dayExpenses;

    // Cost of Goods Sold (COGS)
    let cogs = 0;
    daySalesInvoices.forEach(inv => {
      inv.items.forEach(it => {
        const product = db.products.find(p => p.id === it.productId);
        const unitCost = it.costPrice || product?.buyPrice || 0;
        cogs += it.qty * unitCost;
      });
    });

    // Gross profit and profit margin % for this shift
    const grossProfit = netSales - cogs;
    const profitMargin = netSales > 0 ? (grossProfit / netSales) * 100 : 0;

    const expectedCash = startingCash + totalCashIn - totalCashOut;
    const diff = actualCash - expectedCash;

    return {
      salesCount: daySalesInvoices.length,
      salesTotal,
      returnsTotal,
      netSales,
      cogs,
      grossProfit,
      profitMargin,
      totalCashIn,
      totalCashOut,
      salesCashIn,
      vouchersCashIn,
      dayRevenues,
      purchasesCashOut,
      vouchersCashOut,
      dayExpenses,
      expectedCash,
      diff
    };
  }, [db, selectedDate, startingCash, actualCash]);

  // Convert a daily closing object into a MovementPrintBlock
  const buildClosingPrintBlock = (c: DailyClosing): MovementPrintBlock => {
    return {
      title: `تقفيل يومية (${c.shiftNumber})`,
      serialNo: `#${c.id.slice(-6).toUpperCase()}`,
      date: c.date,
      time: c.time || '18:00',
      partyLabel: 'المسؤول عن التقفيل:',
      partyName: c.closedBy || c.openedBy,
      partySubId: `الحالة: ${c.status}`,
      badge: c.status,
      typeTitle: 'تقرير تقفيل وردية / يومية',
      tableHeaders: [
        { label: 'البند / البيان المحاسبي', width: '45%', align: 'right' },
        { label: 'القيمة المحاسبية', width: '25%', align: 'center' },
        { label: 'ملاحظات وتفاصيل', width: '30%', align: 'right' }
      ],
      tableRows: [
        { cols: ['رصيد البداية (الافتتاحي)', `${formatCleanNumber(c.startingCash)} ${db.settings.currency}`, 'الرصيد المبدئي بالدرج'], isBold: true },
        { cols: ['إجمالي ما دخل الخزينة (مقبوضات)', `${formatCleanNumber(c.cashIn)} ${db.settings.currency}`, 'مبيعات نقدية، سندات قبض، إيرادات'], isBold: true },
        { cols: ['إجمالي ما خرج من الخزينة (مدفوعات)', `${formatCleanNumber(c.cashOut)} ${db.settings.currency}`, 'مشتريات نقدية، سندات صرف، مصروفات'], isBold: true },
        { cols: ['إجمالي المبيعات للوردية', `${formatCleanNumber(c.salesTotal)} ${db.settings.currency}`, 'قيمة الفواتير المصدرة'] },
        { cols: ['إجمالي المرتجعات', `${formatCleanNumber(c.returnsTotal)} ${db.settings.currency}`, 'مرتجعات المبيعات'] },
        { cols: ['صافي المبيعات', `${formatCleanNumber(c.netSales)} ${db.settings.currency}`, 'المبيعات - المرتجعات'] },
        { cols: ['تكلفة البضاعة المباعة (COGS)', `${formatCleanNumber(c.cogs)} ${db.settings.currency}`, 'تكلفة شراء الأصناف المباعة'] },
        { cols: ['مجمل أرباح الوردية', `${formatCleanNumber(c.grossProfit)} ${db.settings.currency}`, 'صافي المبيعات - تكلفة البضاعة'], isBold: true, highlight: true },
        { cols: ['نسبة الأرباح للوردية %', `${c.profitMargin.toFixed(1)}%`, 'هامش الربح المحقق'], isBold: true, highlight: true },
        { cols: ['النقد الفعلي المسلّم بالدرج', `${formatCleanNumber(c.actualCash)} ${db.settings.currency}`, 'الجرد اليدوي للدرج'] },
        { cols: ['النقد المتوقع حسب النظام', `${formatCleanNumber(c.expectedCash)} ${db.settings.currency}`, 'رصيد البداية + الداخل - الخارج'] },
        { cols: ['العجز / الفائض', `${formatCleanNumber(c.difference)} ${db.settings.currency}`, c.difference === 0 ? 'مطابق تماماً' : c.difference > 0 ? 'فائض بالدرج' : 'عجز بالدرج'], isBold: true }
      ],
      summaryLines: [
        { label: 'إجمالي دخل الخزينة', value: `${formatCleanNumber(c.cashIn)} ${db.settings.currency}` },
        { label: 'إجمالي خرج الخزينة', value: `${formatCleanNumber(c.cashOut)} ${db.settings.currency}` },
        { label: 'مجمل الربح المحقق', value: `${formatCleanNumber(c.grossProfit)} ${db.settings.currency}`, isTotal: true },
        { label: 'نسبة أرباح الوردية', value: `${c.profitMargin.toFixed(1)}%`, highlight: true }
      ],
      footerNotes: c.notes || 'تم اعتماد تقفيل الوردية ومطابقة النقدية مع الحسابات بنجاح.',
      createdBy: c.closedBy || c.openedBy
    };
  };

  // Save current shift closing
  const handleSaveClosing = () => {
    if (!confirm(`هل أنت متأكد من حفظ واعتماد تقفيل "${shiftName}" لتاريخ ${selectedDate}؟`)) {
      return;
    }

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    if (!updated.dailyClosings) updated.dailyClosings = [];

    const newClosing: DailyClosing = {
      id: generateId('cls'),
      shiftNumber: shiftName,
      date: selectedDate,
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      openedBy: db.currentUser?.name || 'مدير النظام',
      closedBy: db.currentUser?.name || 'مدير النظام',
      startingCash,
      cashIn: liveStats.totalCashIn,
      cashOut: liveStats.totalCashOut,
      salesTotal: liveStats.salesTotal,
      returnsTotal: liveStats.returnsTotal,
      netSales: liveStats.netSales,
      cogs: liveStats.cogs,
      grossProfit: liveStats.grossProfit,
      profitMargin: liveStats.profitMargin,
      actualCash,
      expectedCash: liveStats.expectedCash,
      difference: liveStats.diff,
      status: 'مغلق',
      notes: shiftNotes,
      createdAt: new Date().toISOString()
    };

    updated.dailyClosings.unshift(newClosing);
    logAudit(updated, 'تقفيل يومية ووردية', `تم تقفيل ${shiftName} بتاريخ ${selectedDate} بنسبة أرباح ${liveStats.profitMargin.toFixed(1)}%`);

    onUpdateDb(updated);
    alert('تم حفظ تقفيل الوردية بنجاح!');
    setActiveTab('history');
  };

  // Update existing closing
  const handleUpdateClosing = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClosing) return;

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    if (!updated.dailyClosings) updated.dailyClosings = [];

    const idx = updated.dailyClosings.findIndex(c => c.id === editingClosing.id);
    if (idx !== -1) {
      updated.dailyClosings[idx] = {
        ...editingClosing,
        difference: editingClosing.actualCash - editingClosing.expectedCash
      };
      logAudit(updated, 'تعديل تقفيل يومية', `تم تعديل بيانات التقفيل ${editingClosing.shiftNumber}`);
      onUpdateDb(updated);
      setEditingClosing(null);
      alert('تم تحديث التقفيل بنجاح');
    }
  };

  // Delete closing
  const handleDeleteClosing = (closing: DailyClosing) => {
    if (!confirm(`هل أنت متأكد من حذف سجل تقفيل الوردية "${closing.shiftNumber}" المؤرخ في ${closing.date}؟`)) {
      return;
    }

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    if (!updated.dailyClosings) updated.dailyClosings = [];

    updated.dailyClosings = updated.dailyClosings.filter(c => c.id !== closing.id);
    logAudit(updated, 'حذف تقفيل يومية', `تم حذف سجل التقفيل ${closing.shiftNumber}`);

    onUpdateDb(updated);
  };

  // Print single closing
  const handlePrintSingle = (closing: DailyClosing) => {
    const block = buildClosingPrintBlock(closing);
    setPrintDocuments([block]);
    setPrintDocTitle(`تقفيل_${closing.shiftNumber}_${closing.date}`);
    setPrintModalOpen(true);
  };

  // Batch Print all closings
  const handlePrintBatch = () => {
    const closings = (db.dailyClosings || []).filter(c =>
      !historySearch ||
      c.shiftNumber.includes(historySearch) ||
      c.date.includes(historySearch) ||
      c.closedBy.includes(historySearch)
    );

    if (closings.length === 0) {
      alert('لا توجد سجلات تقفيل للطباعة');
      return;
    }

    const blocks = closings.map(c => buildClosingPrintBlock(c));
    setPrintDocuments(blocks);
    setPrintDocTitle(`سجل_تقفيلات_الورديات_المجمعة`);
    setPrintModalOpen(true);
  };

  // Export history to CSV
  const handleExportHistoryCsv = () => {
    const closings = (db.dailyClosings || []);
    if (closings.length === 0) {
      alert('لا توجد تقفيلات لتصديرها');
      return;
    }

    const headers = [
      'الوردية / المسلسل',
      'التاريخ',
      'المسؤول',
      'رصيد البداية',
      'دخل الخزينة',
      'خرج الخزينة',
      'إجمالي المبيعات',
      'تكلفة المبيعات',
      'مجمل الربح',
      'نسبة الأرباح %',
      'النقد المتوقع',
      'النقد الفعلي',
      'العجز / الفائض',
      'الحالة',
      'ملاحظات'
    ];

    const rows = closings.map(c => [
      c.shiftNumber,
      c.date,
      c.closedBy,
      c.startingCash,
      c.cashIn,
      c.cashOut,
      c.salesTotal,
      c.cogs,
      c.grossProfit,
      `${c.profitMargin.toFixed(1)}%`,
      c.expectedCash,
      c.actualCash,
      c.difference,
      c.status,
      c.notes || ''
    ]);

    exportTableToCsv(`سجل_تقفيلات_الورديات_${Date.now()}.csv`, headers, rows);
  };

  // Filter history
  const filteredHistory = (db.dailyClosings || []).filter(c =>
    !historySearch ||
    c.shiftNumber.includes(historySearch) ||
    c.date.includes(historySearch) ||
    c.closedBy.includes(historySearch)
  );

  return (
    <div className="space-y-4 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
            <span>تقفيل اليومية والورديات وحساب أرباح الشفت</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            متابعة مدخلات ومخرجات الخزينة يومياً، مطابقة الدرج الفعلي، وعرض نسبة ومجمل الأرباح لكل شفت
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-bold">
            <button
              onClick={() => setActiveTab('current')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                activeTab === 'current' ? 'bg-white text-slate-900 shadow-2xs font-black' : 'text-slate-600 hover:text-black'
              }`}
            >
              تقفيل اليومية الحالي
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                activeTab === 'history' ? 'bg-white text-slate-900 shadow-2xs font-black' : 'text-slate-600 hover:text-black'
              }`}
            >
              سجل التقفيلات السابقة ({(db.dailyClosings || []).length})
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'current' ? (
        <div className="space-y-4">
          {/* Shift Configuration Bar */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">
                تاريخ اليومية / الوردية
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded-lg outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">
                اسم أو رقم الوردية
              </label>
              <input
                type="text"
                value={shiftName}
                onChange={e => setShiftName(e.target.value)}
                placeholder="مثال: وردية الصباح / تقفيل اليوم"
                className="w-full px-2.5 py-1.5 text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">
                رصيد البداية بالدرج ({db.settings.currency})
              </label>
              <input
                type="number"
                min="0"
                value={startingCash || ''}
                onChange={e => setStartingCash(Number(e.target.value) || 0)}
                placeholder="0"
                className="w-full px-2.5 py-1.5 text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded-lg outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">
                النقد الفعلي بالدرج ({db.settings.currency})
              </label>
              <input
                type="number"
                min="0"
                value={actualCash || ''}
                onChange={e => setActualCash(Number(e.target.value) || 0)}
                placeholder="0"
                className="w-full px-2.5 py-1.5 text-xs font-mono font-bold bg-slate-50 border border-emerald-400 rounded-lg outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Cash In */}
            <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3">
              <span className="text-[11px] font-bold text-emerald-800 flex items-center gap-1">
                <ArrowDownCircle className="w-3.5 h-3.5" />
                <span>ما دخل الخزينة</span>
              </span>
              <div className="text-base sm:text-lg font-black font-mono text-emerald-950 mt-1">
                {formatMoney(liveStats.totalCashIn, db.settings.currency)}
              </div>
              <span className="text-[10px] text-emerald-700">
                مبيعات نقدية + مقبوضات + إيرادات
              </span>
            </div>

            {/* Cash Out */}
            <div className="bg-rose-50/60 border border-rose-200/80 rounded-xl p-3">
              <span className="text-[11px] font-bold text-rose-800 flex items-center gap-1">
                <ArrowUpCircle className="w-3.5 h-3.5" />
                <span>ما خرج من الخزينة</span>
              </span>
              <div className="text-base sm:text-lg font-black font-mono text-rose-950 mt-1">
                {formatMoney(liveStats.totalCashOut, db.settings.currency)}
              </div>
              <span className="text-[10px] text-rose-700">
                مشتريات + مدفوعات + مصروفات
              </span>
            </div>

            {/* Gross Profit */}
            <div className="bg-blue-50/60 border border-blue-200/80 rounded-xl p-3">
              <span className="text-[11px] font-bold text-blue-800 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>مجمل ربح الوردية</span>
              </span>
              <div className="text-base sm:text-lg font-black font-mono text-blue-950 mt-1">
                {formatMoney(liveStats.grossProfit, db.settings.currency)}
              </div>
              <span className="text-[10px] text-blue-700">
                صافي المبيعات - تكلفة البضاعة
              </span>
            </div>

            {/* Profit Margin % */}
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3">
              <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5" />
                <span>نسبة الأرباح للوردية</span>
              </span>
              <div className="text-base sm:text-lg font-black font-mono text-amber-950 mt-1">
                {liveStats.profitMargin.toFixed(1)}%
              </div>
              <span className="text-[10px] text-amber-800">
                هامش الربح المحقق بالشفت
              </span>
            </div>
          </div>

          {/* Detailed Shift Breakdown Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-900">
                تفاصيل جرد حركة اليومية وتغذية الخزينة ({selectedDate})
              </h3>
              <span className="text-xs font-bold text-slate-500 font-mono">
                {liveStats.salesCount} فاتورة مسجلة
              </span>
            </div>

            <div className="p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="font-bold text-slate-900 border-b border-slate-200 pb-1">
                    حركة المبيعات والأرباح
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">إجمالي المبيعات:</span>
                    <strong className="font-mono">{formatMoney(liveStats.salesTotal, db.settings.currency)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">إجمالي المرتجعات:</span>
                    <strong className="font-mono">{formatMoney(liveStats.returnsTotal, db.settings.currency)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">صافي المبيعات:</span>
                    <strong className="font-mono">{formatMoney(liveStats.netSales, db.settings.currency)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">تكلفة البضاعة المباعة (COGS):</span>
                    <strong className="font-mono text-slate-800">{formatMoney(liveStats.cogs, db.settings.currency)}</strong>
                  </div>
                  <div className="flex justify-between text-blue-900 font-black border-t border-slate-200 pt-1.5">
                    <span>مجمل الربح:</span>
                    <span className="font-mono">{formatMoney(liveStats.grossProfit, db.settings.currency)}</span>
                  </div>
                  <div className="flex justify-between text-amber-900 font-black">
                    <span>نسبة الأرباح للشفت:</span>
                    <span className="font-mono text-sm">{liveStats.profitMargin.toFixed(1)}%</span>
                  </div>
                </div>

                <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="font-bold text-slate-900 border-b border-slate-200 pb-1">
                    مطابقة الخزينة والنقد الفعلي
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">رصيد الافتتاح (البداية):</span>
                    <strong className="font-mono">{formatMoney(startingCash, db.settings.currency)}</strong>
                  </div>
                  <div className="flex justify-between text-emerald-700">
                    <span>(+) المقبوضات النقدية:</span>
                    <strong className="font-mono">{formatMoney(liveStats.totalCashIn, db.settings.currency)}</strong>
                  </div>
                  <div className="flex justify-between text-rose-700">
                    <span>(-) المدفوعات والمصروفات:</span>
                    <strong className="font-mono">{formatMoney(liveStats.totalCashOut, db.settings.currency)}</strong>
                  </div>
                  <div className="flex justify-between font-bold border-t border-slate-200 pt-1">
                    <span className="text-slate-800">النقد المتوقع بالدرج:</span>
                    <strong className="font-mono">{formatMoney(liveStats.expectedCash, db.settings.currency)}</strong>
                  </div>
                  <div className="flex justify-between font-bold text-slate-950">
                    <span>النقد الفعلي المسجل بالدرج:</span>
                    <strong className="font-mono">{formatMoney(actualCash, db.settings.currency)}</strong>
                  </div>
                  <div className={`flex justify-between font-black border-t border-slate-200 pt-1.5 ${
                    liveStats.diff === 0 ? 'text-emerald-700' : liveStats.diff > 0 ? 'text-blue-700' : 'text-rose-700'
                  }`}>
                    <span>الفارق (العجز / الفائض):</span>
                    <span className="font-mono text-sm">
                      {liveStats.diff === 0 ? 'مطابق تماماً' : formatMoney(liveStats.diff, db.settings.currency)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  ملاحظات وتفاصيل التقفيل
                </label>
                <textarea
                  rows={2}
                  value={shiftNotes}
                  onChange={e => setShiftNotes(e.target.value)}
                  placeholder="أدخل أي ملاحظات حول الوردية أو أسباب العجز أو الفائض إن وجدت..."
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg outline-none focus:border-blue-600"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    const block = buildClosingPrintBlock({
                      id: `temp_${Date.now()}`,
                      shiftNumber: shiftName,
                      date: selectedDate,
                      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
                      openedBy: db.currentUser?.name || 'مدير النظام',
                      closedBy: db.currentUser?.name || 'مدير النظام',
                      startingCash,
                      cashIn: liveStats.totalCashIn,
                      cashOut: liveStats.totalCashOut,
                      salesTotal: liveStats.salesTotal,
                      returnsTotal: liveStats.returnsTotal,
                      netSales: liveStats.netSales,
                      cogs: liveStats.cogs,
                      grossProfit: liveStats.grossProfit,
                      profitMargin: liveStats.profitMargin,
                      actualCash,
                      expectedCash: liveStats.expectedCash,
                      difference: liveStats.diff,
                      status: 'مفتوح',
                      notes: shiftNotes,
                      createdAt: new Date().toISOString()
                    });
                    setPrintDocuments([block]);
                    setPrintDocTitle(`معاينة_تقفيل_${shiftName}`);
                    setPrintModalOpen(true);
                  }}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-slate-700" />
                  <span>معاينة وطباعة A4 / A5 / حراري</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveClosing}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>اعتماد وإغلاق الوردية واليومية</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* History Tab */
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3" />
              <input
                type="text"
                placeholder="بحث في سجل التقفيلات بالوردية، التاريخ، أو المسؤول..."
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                className="w-full pr-8 pl-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-600"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportHistoryCsv}
                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                title="تصدير السجل بالكامل إلى Excel"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                <span>تصدير Excel</span>
              </button>

              <button
                type="button"
                onClick={handlePrintBatch}
                className="px-3 py-1.5 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                title="طباعة وتصدير جماعي لكل التقفيلات في PDF مجمع"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>طباعة وتصدير جماعي PDF</span>
              </button>
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-2xs">
              <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <div className="text-sm font-bold text-slate-700">لا توجد تقفيلات يومية مسجلة حتى الآن</div>
              <div className="text-xs text-slate-400 mt-1">يمكنك إغلاق اليومية الحالية لحفظ أول سجل ومطابقة الخزينة</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredHistory.map(c => (
                <div
                  key={c.id}
                  className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 shadow-2xs p-3.5 flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                    <div>
                      <h4 className="text-xs font-black text-slate-900">{c.shiftNumber}</h4>
                      <span className="text-[10px] text-slate-500 font-mono">{c.date} - {c.time || '18:00'}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      {c.status}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">المسؤول:</span>
                      <span className="font-bold text-slate-900">{c.closedBy || c.openedBy}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100 text-[11px]">
                      <div>
                        <span className="text-slate-500 block">دخل الخزينة:</span>
                        <strong className="font-mono text-emerald-700">{formatMoney(c.cashIn, db.settings.currency)}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">خرج الخزينة:</span>
                        <strong className="font-mono text-rose-700">{formatMoney(c.cashOut, db.settings.currency)}</strong>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-blue-50/50 p-2 rounded-lg border border-blue-100 text-[11px]">
                      <div>
                        <span className="text-blue-900 block font-bold">مجمل الربح:</span>
                        <strong className="font-mono text-blue-950 font-black">{formatMoney(c.grossProfit, db.settings.currency)}</strong>
                      </div>
                      <div>
                        <span className="text-amber-900 block font-bold">نسبة الأرباح:</span>
                        <strong className="font-mono text-amber-950 font-black">{c.profitMargin.toFixed(1)}%</strong>
                      </div>
                    </div>

                    <div className="flex justify-between text-[11px] pt-1">
                      <span className="text-slate-500">العجز / الفائض:</span>
                      <strong className={`font-mono font-bold ${
                        c.difference === 0 ? 'text-emerald-700' : c.difference > 0 ? 'text-blue-700' : 'text-rose-700'
                      }`}>
                        {c.difference === 0 ? 'مطابق' : formatMoney(c.difference, db.settings.currency)}
                      </strong>
                    </div>

                    {c.notes && (
                      <div className="text-[10px] text-slate-500 bg-slate-50 p-1.5 rounded truncate">
                        {c.notes}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => handlePrintSingle(c)}
                      className="px-2 py-1 text-slate-700 hover:text-black hover:bg-slate-100 rounded text-xs font-bold flex items-center gap-1 cursor-pointer"
                      title="طباعة ومعاينة التقفيل بتنسيق رسمي"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>طباعة / PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditingClosing(c)}
                      className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                      title="تعديل بيانات التقفيل"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteClosing(c)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                      title="حذف سجل التقفيل"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit Closing Modal */}
      {editingClosing && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl w-full max-w-md p-4 space-y-3 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="text-sm font-black text-slate-900">
                تعديل تقفيل الوردية ({editingClosing.shiftNumber})
              </h3>
              <button
                onClick={() => setEditingClosing(null)}
                className="p-1 text-slate-400 hover:text-black rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateClosing} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">اسم / رقم الوردية</label>
                <input
                  type="text"
                  value={editingClosing.shiftNumber}
                  onChange={e => setEditingClosing({ ...editingClosing, shiftNumber: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg outline-none"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">تاريخ الوردية</label>
                <input
                  type="date"
                  value={editingClosing.date}
                  onChange={e => setEditingClosing({ ...editingClosing, date: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg outline-none font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">النقد الفعلي بالدرج</label>
                  <input
                    type="number"
                    value={editingClosing.actualCash}
                    onChange={e => setEditingClosing({ ...editingClosing, actualCash: Number(e.target.value) || 0 })}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg outline-none font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">النقد المتوقع</label>
                  <input
                    type="number"
                    value={editingClosing.expectedCash}
                    onChange={e => setEditingClosing({ ...editingClosing, expectedCash: Number(e.target.value) || 0 })}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg outline-none font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">الملاحظات</label>
                <textarea
                  rows={2}
                  value={editingClosing.notes || ''}
                  onChange={e => setEditingClosing({ ...editingClosing, notes: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingClosing(null)}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-2xs"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Universal Print Modal */}
      <UniversalPrintModal
        isOpen={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        documentTitle={printDocTitle}
        documents={printDocuments}
        settings={db.settings}
      />
    </div>
  );
};
