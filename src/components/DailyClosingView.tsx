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
  X,
  Eye,
  FileText,
  Receipt
} from 'lucide-react';
import {
  AccountingDB,
  DailyClosing,
  DailyClosingChannelSummary,
  PaymentMethod
} from '../types/accounting';
import {
  formatMoney,
  generateId,
  getTodayDate,
  logAudit,
  roundMoney,
  isFiniteNonNegative,
  PAYMENT_METHODS,
  buildProductFifoLedger,
  markRecordsDeleted,
  isBranchMatch
} from '../services/accountingStorage';
import { useSubmitLock } from '../hooks/useSubmitLock';
import { useModalBackHandler } from '../hooks/useModalBackHandler';
import {
  UniversalPrintModal,
  MovementPrintBlock,
  formatCleanNumber
} from './UniversalPrintModal';
import { exportTableToCsv } from '../services/exportService';

interface DailyClosingViewProps {
  db: AccountingDB;
  onUpdateDb: (updated: AccountingDB) => void;
  activeBranchId?: string;
}

export const DailyClosingView: React.FC<DailyClosingViewProps> = ({
  db,
  onUpdateDb,
  activeBranchId
}) => {
  const branches = db.branches || [{ id: 'br_main', name: 'الفرع الرئيسي', code: 'BR-01', isMain: true }];
  const targetBranchId = activeBranchId || branches[0]?.id || 'br_main';
  const currentBranch = branches.find(b => b.id === targetBranchId) || branches[0];
  const [historyBranchFilter, setHistoryBranchFilter] = useState<'current' | 'all'>('current');
  const { isSubmitting, runWithLock } = useSubmitLock();

  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDate());
  const [shiftName, setShiftName] = useState<string>(`وردية ${currentBranch.name}`);
  const [startingCash, setStartingCash] = useState<number>(0);
  const [startingCashEdited, setStartingCashEdited] = useState<boolean>(false);
  const [actualCash, setActualCash] = useState<number>(0);
  const [actualCashEdited, setActualCashEdited] = useState<boolean>(false);
  const [shiftNotes, setShiftNotes] = useState<string>('');
  const [justClosedRecord, setJustClosedRecord] = useState<DailyClosing | null>(null);

  // Review & Editing state
  const [reviewingClosing, setReviewingClosing] = useState<DailyClosing | null>(null);
  const [reviewSubTab, setReviewSubTab] = useState<'summary' | 'invoices' | 'treasury' | 'other'>('summary');
  const [editingClosing, setEditingClosing] = useState<DailyClosing | null>(null);

  // Search & Date filter in history
  const [historySearch, setHistorySearch] = useState<string>('');
  const [historyDateFilter, setHistoryDateFilter] = useState<string>('');

  // Print modal state
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printDocuments, setPrintDocuments] = useState<MovementPrintBlock[]>([]);
  const [printDocTitle, setPrintDocTitle] = useState('تقرير تقفيل اليومية');

  useModalBackHandler(!!reviewingClosing, () => setReviewingClosing(null), 'daily_closing_review_modal');
  useModalBackHandler(!!editingClosing, () => setEditingClosing(null), 'daily_closing_edit_modal');

  const isTargetBranch = (bId?: string) => {
    return isBranchMatch(bId, targetBranchId);
  };

  const addOneDay = (dateStr: string): string => {
    const dt = new Date(`${dateStr}T12:00:00`);
    if (isNaN(dt.getTime())) return getTodayDate();
    dt.setDate(dt.getDate() + 1);
    return dt.toISOString().slice(0, 10);
  };

  const nextDayDate = useMemo(() => addOneDay(selectedDate), [selectedDate]);
  const treasuryMethods = useMemo<PaymentMethod[]>(
    () => PAYMENT_METHODS.filter(m => m !== 'آجل'),
    []
  );

  // Prior closing record for carried-over opening cash reference
  const latestPriorClosing = useMemo(() => {
    return (db.dailyClosings || [])
      .filter(c => isTargetBranch(c.branchId) && c.date < selectedDate)
      .sort((a, b) => (a.date === b.date ? (b.createdAt || '').localeCompare(a.createdAt || '') : b.date.localeCompare(a.date)))[0];
  }, [db.dailyClosings, selectedDate, targetBranchId]);

  const hasPriorClosing = Boolean(latestPriorClosing);
  // Day-1 manual baseline mode defaults to TRUE when there is no prior closing for this branch
  const [isBaselineMode, setIsBaselineMode] = useState<boolean>(() => !hasPriorClosing);
  const [actualCashInput, setActualCashInput] = useState<string>('');
  const [baselineChannelInputs, setBaselineChannelInputs] = useState<Record<string, string>>({});
  const [showReconcileChannels, setShowReconcileChannels] = useState<boolean>(false);
  const [reconcileInputs, setReconcileInputs] = useState<Record<string, string>>({});

  // Cumulative treasury book opening balances prior to selectedDate across all 5 payment channels
  const priorChannelBookBalances = useMemo(() => {
    const map: Record<string, number> = {};
    treasuryMethods.forEach(m => {
      map[m] = 0;
    });

    if (latestPriorClosing?.nextDayOpeningBalances) {
      const priorDate = latestPriorClosing.date;
      treasuryMethods.forEach(m => {
        const carried = latestPriorClosing.nextDayOpeningBalances?.[m] ?? 0;
        const betweenNet = db.treasury
          .filter(t => t.date > priorDate && t.date < selectedDate && t.method === m && isTargetBranch(t.branchId))
          .reduce((s, t) => s + (t.direction === 'in' ? (Number(t.amount) || 0) : -(Number(t.amount) || 0)), 0);
        map[m] = roundMoney(carried + betweenNet);
      });
    }
    return map;
  }, [db.treasury, selectedDate, targetBranchId, treasuryMethods, latestPriorClosing]);

  // Reset manual edit flags and sync baseline/audit mode when date, branch, or prior closing availability switches
  React.useEffect(() => {
    setStartingCashEdited(false);
    setActualCashEdited(false);
    setBaselineChannelInputs({});
    setReconcileInputs({});
    setShowReconcileChannels(false);
    setIsBaselineMode(!hasPriorClosing);
    setStartingCash(roundMoney(priorChannelBookBalances['نقدي'] || 0));
    if (!hasPriorClosing) {
      setActualCashInput('');
    }
  }, [selectedDate, targetBranchId, hasPriorClosing]);

  React.useEffect(() => {
    if (!startingCashEdited) {
      setStartingCash(roundMoney(priorChannelBookBalances['نقدي'] || 0));
    }
  }, [priorChannelBookBalances, startingCashEdited]);

  const fifoLedger = useMemo(
    () => buildProductFifoLedger(db, targetBranchId),
    [db, targetBranchId]
  );

  // Calculate live shift statistics & per-channel next-day opening balances for selectedDate strictly for this branch
  const liveStats = useMemo(() => {
    // 1. Invoices on selected date for target branch (exclude quotes and sale_return)
    const daySalesInvoices = db.invoices.filter(
      i =>
        i.date === selectedDate &&
        (i.type === 'sale' || i.invoiceKind === 'sale' || i.invoiceKind === 'wholesale') &&
        i.invoiceKind !== 'quote' &&
        i.invoiceKind !== 'sale_return' &&
        isTargetBranch(i.branchId)
    );
    const dayPurchaseInvoices = db.invoices.filter(
      i => i.date === selectedDate && i.type === 'purchase' && i.invoiceKind !== 'purchase_return' && isTargetBranch(i.branchId)
    );
    const dayReturns = (db.returns || []).filter(r => r.date === selectedDate && isTargetBranch(r.branchId));

    // Sales metrics (only count sale returns against net sales, never purchase returns)
    const salesTotal = roundMoney(daySalesInvoices.reduce((sum, i) => sum + (Number(i.total) || 0), 0));
    const returnsTotal = roundMoney(
      dayReturns.filter(r => r.type === 'sale').reduce((sum, r) => sum + (Number(r.total) || 0), 0)
    );
    const netSales = roundMoney(Math.max(0, salesTotal - returnsTotal));

    // Authoritative Treasury movements on selected date for target branch (single source of truth - zero double counting)
    const dayTreasury = db.treasury.filter(t => t.date === selectedDate && isTargetBranch(t.branchId));

    const totalCashIn = roundMoney(
      dayTreasury.filter(t => t.direction === 'in').reduce((s, t) => s + (Number(t.amount) || 0), 0)
    );
    const totalCashOut = roundMoney(
      dayTreasury.filter(t => t.direction === 'out').reduce((s, t) => s + (Number(t.amount) || 0), 0)
    );

    const salesCashIn = roundMoney(
      dayTreasury
        .filter(t => t.direction === 'in' && (t.sourceType === 'sale' || t.sourceType === 'wholesale' || t.sourceType === 'purchase_return'))
        .reduce((s, t) => s + (Number(t.amount) || 0), 0)
    );
    const purchasesCashOut = roundMoney(
      dayTreasury
        .filter(t => t.direction === 'out' && (t.sourceType === 'purchase' || t.sourceType === 'sale_return'))
        .reduce((s, t) => s + (Number(t.amount) || 0), 0)
    );
    const vouchersCashIn = roundMoney(
      dayTreasury
        .filter(t => t.direction === 'in' && (t.sourceType === 'receipt' || t.sourceType === 'voucher'))
        .reduce((s, t) => s + (Number(t.amount) || 0), 0)
    );
    const vouchersCashOut = roundMoney(
      dayTreasury
        .filter(t => t.direction === 'out' && (t.sourceType === 'payment' || t.sourceType === 'voucher'))
        .reduce((s, t) => s + (Number(t.amount) || 0), 0)
    );

    const dayExpenses = roundMoney(
      db.expenses.filter(e => e.date === selectedDate && isTargetBranch(e.branchId)).reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
    );
    const dayRevenues = roundMoney(
      db.revenues.filter(r => r.date === selectedDate && isTargetBranch(r.branchId)).reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
    );

    // Cash drawer ('نقدي') inflows/outflows specifically for drawer reconciliation
    const drawerIn = roundMoney(
      dayTreasury.filter(t => t.method === 'نقدي' && t.direction === 'in').reduce((s, t) => s + (Number(t.amount) || 0), 0)
    );
    const drawerOut = roundMoney(
      dayTreasury.filter(t => t.method === 'نقدي' && t.direction === 'out').reduce((s, t) => s + (Number(t.amount) || 0), 0)
    );

    // Cost of Goods Sold (COGS) & Gross Profit strictly via FIFO ledger (reconciled with ProfitsView)
    let rawVerifiedRev = 0;
    let rawCogs = 0;
    daySalesInvoices.forEach(inv => {
      let invVerifiedRev = 0;
      let invCogs = 0;
      let invLinesSum = 0;
      let hasAnyVerified = false;
      let hasUndefined = false;

      inv.items.forEach((it, idx) => {
        const q = Number(it.qty) || 0;
        const lineTotal = Number(it.total) || q * (Number(it.unitPrice) || 0);
        invLinesSum += lineTotal;
        const alloc = fifoLedger.getSaleAllocation(inv.id, it.productId, it.productName, idx);
        if (alloc && alloc.hasVerifiedCost) {
          hasAnyVerified = true;
          invCogs += alloc.verifiedCostTotal;
          const coveredRatio = q > 0 ? Math.min(1, alloc.coveredQty / q) : 0;
          invVerifiedRev += lineTotal * coveredRatio;
          if (!alloc.hasFullVerifiedCost) hasUndefined = true;
        } else {
          hasUndefined = true;
        }
      });

      if (hasAnyVerified) {
        const invNetAdj = (Number(inv.total) || 0) - invLinesSum;
        const effRev = hasUndefined ? (invVerifiedRev + invNetAdj) : (Number(inv.total) || 0);
        rawVerifiedRev += effRev;
        rawCogs += invCogs;
      }
    });

    const cogs = roundMoney(rawCogs);
    const grossProfit = roundMoney(rawVerifiedRev - rawCogs - returnsTotal);
    const profitMargin = rawVerifiedRev > 0 ? (grossProfit / rawVerifiedRev) * 100 : 0;

    // Expected cash in drawer ('نقدي')
    const rawExpectedCash = roundMoney(startingCash + drawerIn - drawerOut);
    const cashBaselineRaw = baselineChannelInputs['نقدي'];
    const effectiveActualCash = isBaselineMode
      ? roundMoney(actualCashEdited ? actualCash : (cashBaselineRaw !== undefined && cashBaselineRaw.trim() !== '' ? (parseFloat(cashBaselineRaw) || 0) : 0))
      : (actualCashEdited
          ? roundMoney(actualCash)
          : (reconcileInputs['نقدي'] !== undefined && reconcileInputs['نقدي'].trim() !== ''
              ? roundMoney(parseFloat(reconcileInputs['نقدي']) || 0)
              : rawExpectedCash));

    // On Day-1 baseline mode, user-entered values across all 5 channels become the exact opening balances with zero deficits/surpluses
    const expectedCash = isBaselineMode ? effectiveActualCash : rawExpectedCash;

    // Per-channel summary & Next-Day Opening Balance for ALL 5 treasury payment methods
    const channelSummaries: DailyClosingChannelSummary[] = treasuryMethods.map(m => {
      const opening = isBaselineMode ? 0 : (m === 'نقدي' ? roundMoney(startingCash) : roundMoney(priorChannelBookBalances[m] || 0));
      const chIn = roundMoney(
        dayTreasury.filter(t => t.method === m && t.direction === 'in').reduce((s, t) => s + (Number(t.amount) || 0), 0)
      );
      const chOut = roundMoney(
        dayTreasury.filter(t => t.method === m && t.direction === 'out').reduce((s, t) => s + (Number(t.amount) || 0), 0)
      );
      const closing = roundMoney(opening + chIn - chOut);

      let actualBal = closing;
      if (isBaselineMode) {
        if (m === 'نقدي') {
          actualBal = effectiveActualCash;
        } else {
          const raw = baselineChannelInputs[m];
          actualBal = raw !== undefined && raw.trim() !== '' ? roundMoney(Math.max(0, parseFloat(raw) || 0)) : 0;
        }
      } else {
        if (m === 'نقدي') {
          actualBal = effectiveActualCash;
        } else {
          const raw = reconcileInputs[m];
          actualBal = raw !== undefined && raw.trim() !== '' ? roundMoney(Math.max(0, parseFloat(raw) || 0)) : closing;
        }
      }

      const channelVariance = isBaselineMode ? 0 : roundMoney(actualBal - closing);

      return {
        method: m,
        openingBalance: opening,
        cashIn: chIn,
        cashOut: chOut,
        closingBalance: isBaselineMode ? actualBal : closing,
        actualBalance: actualBal,
        variance: channelVariance,
        nextDayOpeningBalance: actualBal
      };
    });

    const totalChannelVariance = isBaselineMode
      ? 0
      : roundMoney(channelSummaries.reduce((s, cs) => s + (cs.variance || 0), 0));
    const diff = isBaselineMode ? 0 : roundMoney(effectiveActualCash - expectedCash);

    const nextDayOpeningBalances: Record<string, number> = {};
    channelSummaries.forEach(cs => {
      nextDayOpeningBalances[cs.method] = cs.nextDayOpeningBalance;
    });
    const totalNextDayOpening = roundMoney(
      channelSummaries.reduce((s, cs) => s + cs.nextDayOpeningBalance, 0)
    );

    return {
      salesCount: daySalesInvoices.length,
      purchasesCount: dayPurchaseInvoices.length,
      salesTotal,
      returnsTotal,
      netSales,
      cogs,
      grossProfit,
      profitMargin,
      totalCashIn,
      totalCashOut,
      drawerIn,
      drawerOut,
      salesCashIn,
      vouchersCashIn,
      dayRevenues,
      purchasesCashOut,
      vouchersCashOut,
      dayExpenses,
      rawExpectedCash,
      expectedCash,
      effectiveActualCash,
      diff,
      totalChannelVariance,
      channelSummaries,
      nextDayOpeningBalances,
      totalNextDayOpening
    };
  }, [db, fifoLedger, selectedDate, startingCash, actualCash, actualCashEdited, isBaselineMode, baselineChannelInputs, reconcileInputs, targetBranchId, treasuryMethods, priorChannelBookBalances]);

  // Keep actualCash synced to expectedCash in audit mode until cashier enters a manual drawer count
  React.useEffect(() => {
    if (!actualCashEdited && !isBaselineMode) {
      setActualCash(liveStats.rawExpectedCash);
      setActualCashInput(String(liveStats.rawExpectedCash));
    }
  }, [liveStats.rawExpectedCash, actualCashEdited, isBaselineMode]);

  // Convert a daily closing object into a MovementPrintBlock
  const buildClosingPrintBlock = (c: DailyClosing): MovementPrintBlock => {
    const channelRows = (c.channelSummaries || []).map(cs => ({
      cols: [
        `الرصيد الافتتاحي لليوم التالي — ${cs.method}`,
        `${formatCleanNumber(cs.nextDayOpeningBalance)} ${db.settings.currency}`,
        `افتتاحي اليوم: ${formatCleanNumber(cs.openingBalance)} | وارد: +${formatCleanNumber(cs.cashIn)} | صادر: -${formatCleanNumber(cs.cashOut)}`
      ],
      isBold: true,
      highlight: true
    }));

    return {
      title: `تقفيل يومية (${c.shiftNumber})`,
      serialNo: `#${c.id.slice(-6).toUpperCase()}`,
      date: c.date,
      time: c.time || '18:00',
      partyLabel: 'المسؤول',
      partyName: c.closedBy || c.openedBy || 'مدير النظام',
      partySubId: `الفرع: ${c.branchName || 'الرئيسي'}`,
      statement: c.notes || 'تقرير إقفال حسابات الخزينة ومطابقة النقدية والأرصدة الافتتاحية لليوم التالي',
      badge: c.status || 'معتمد ومغلق',
      typeTitle: 'تقرير تقفيل وردية / يومية',
      tableHeaders: [
        { label: 'البند / البيان المحاسبي', width: '42%', align: 'right' },
        { label: 'القيمة المحاسبية', width: '24%', align: 'center' },
        { label: 'ملاحظات وتفاصيل', width: '34%', align: 'right' }
      ],
      tableRows: [
        { cols: ['رصيد بداية الدرج (نقدي)', `${formatCleanNumber(c.startingCash)} ${db.settings.currency}`, 'الرصيد الافتتاحي بالدرج'], isBold: true },
        { cols: ['إجمالي الوارد لكل الخزائن', `${formatCleanNumber(c.cashIn)} ${db.settings.currency}`, 'مبيعات، سندات قبض، إيرادات'], isBold: true },
        { cols: ['إجمالي الصادر من كل الخزائن', `${formatCleanNumber(c.cashOut)} ${db.settings.currency}`, 'مشتريات، سندات صرف، مصروفات'], isBold: true },
        { cols: ['إجمالي المبيعات للوردية', `${formatCleanNumber(c.salesTotal)} ${db.settings.currency}`, 'قيمة الفواتير المصدرة'] },
        { cols: ['إجمالي المرتجعات', `${formatCleanNumber(c.returnsTotal)} ${db.settings.currency}`, 'مرتجعات المبيعات'] },
        { cols: ['صافي المبيعات', `${formatCleanNumber(c.netSales)} ${db.settings.currency}`, 'المبيعات - المرتجعات'] },
        { cols: ['تكلفة البضاعة المباعة (FIFO)', `${formatCleanNumber(c.cogs)} ${db.settings.currency}`, 'تكلفة الدفعات الفعلية'], },
        { cols: ['مجمل أرباح الوردية', `${formatCleanNumber(c.grossProfit)} ${db.settings.currency}`, 'وفق دفعات FIFO الموثقة'], isBold: true, highlight: true },
        { cols: ['نسبة الأرباح للوردية %', `${c.profitMargin.toFixed(1)}%`, 'هامش الربح المحقق'], isBold: true, highlight: true },
        { cols: ['النقد الفعلي بالدرج (نقدي)', `${formatCleanNumber(c.actualCash)} ${db.settings.currency}`, 'الجرد الفعلي للدرج'] },
        ...(c.isInitialBaseline
          ? []
          : [
              { cols: ['النقد المتوقع بالدرج (نقدي)', `${formatCleanNumber(c.expectedCash)} ${db.settings.currency}`, 'بداية الدرج + وارد الكاش - صادر الكاش'] },
              { cols: ['العجز / الفائض بالدرج', `${formatCleanNumber(c.difference)} ${db.settings.currency}`, c.difference === 0 ? 'مطابق تماماً' : c.difference > 0 ? 'فائض بالدرج' : 'عجز بالدرج'], isBold: true }
            ]),
        ...channelRows
      ],
      summaryLines: [
        { label: 'إجمالي دخل الخزائن', value: `${formatCleanNumber(c.cashIn)} ${db.settings.currency}` },
        { label: 'إجمالي خرج الخزائن', value: `${formatCleanNumber(c.cashOut)} ${db.settings.currency}` },
        { label: 'مجمل الربح المحقق', value: `${formatCleanNumber(c.grossProfit)} ${db.settings.currency}`, isTotal: true },
        ...(c.channelSummaries || []).map(cs => ({
          label: `افتتاحي ${c.nextDayDate || 'اليوم التالي'} (${cs.method})`,
          value: `${formatCleanNumber(cs.nextDayOpeningBalance)} ${db.settings.currency}`,
          highlight: true
        }))
      ],
      footerNotes: c.notes || 'تم اعتماد تقفيل الوردية وترحيل الأرصدة الافتتاحية لليوم التالي لجميع وسائل الخزينة.',
      createdBy: c.closedBy || c.openedBy
    };
  };

  // Save current shift closing with full next-day opening balances for all payment methods
  const handleSaveClosing = () => {
    runWithLock(() => {
      const cleanStarting = roundMoney(isBaselineMode ? 0 : startingCash);
      const cleanActual = roundMoney(liveStats.effectiveActualCash);
      const hasAnyBaselineInput = actualCashEdited || Object.values(baselineChannelInputs).some(v => v.trim() !== '');
      if (isBaselineMode && !hasAnyBaselineInput) {
        alert('يرجى إدخال المبلغ الفعلي الموجود في وسائل الخزينة أولاً.');
        return;
      }
      if (cleanActual < 0) {
        alert('النقد الفعلي يجب أن يكون قيمة غير سالبة.');
        return;
      }
      if (!shiftName.trim()) {
        alert('يرجى كتابة اسم أو رقم الوردية.');
        return;
      }
      const confirmMsg = isBaselineMode
        ? `سيتم اعتماد "${shiftName}" وترحيل الأرصدة المدخلة لجميع وسائل الخزينة (${formatMoney(liveStats.totalNextDayOpening, db.settings.currency)}) كرصيد افتتاحي ليوم ${nextDayDate}. هل أنت متأكد؟`
        : `هل أنت متأكد من حفظ واعتماد تقفيل "${shiftName}" لتاريخ ${selectedDate} وترحيل الرصيد الافتتاحي لليوم التالي (${nextDayDate})؟`;
      if (!confirm(confirmMsg)) {
        return;
      }

      const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
      if (!updated.dailyClosings) updated.dailyClosings = [];

      const expected = isBaselineMode ? cleanActual : roundMoney(liveStats.expectedCash);
      const diff = isBaselineMode ? 0 : roundMoney(liveStats.totalChannelVariance !== 0 ? liveStats.totalChannelVariance : (cleanActual - expected));

      const newClosing: DailyClosing = {
        id: generateId('cls'),
        shiftNumber: shiftName.trim(),
        date: selectedDate,
        time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        openedBy: db.currentUser?.name || 'مدير النظام',
        closedBy: db.currentUser?.name || 'مدير النظام',
        startingCash: cleanStarting,
        cashIn: roundMoney(liveStats.totalCashIn),
        cashOut: roundMoney(liveStats.totalCashOut),
        salesTotal: roundMoney(liveStats.salesTotal),
        returnsTotal: roundMoney(liveStats.returnsTotal),
        netSales: roundMoney(liveStats.netSales),
        cogs: roundMoney(liveStats.cogs),
        grossProfit: roundMoney(liveStats.grossProfit),
        profitMargin: Number(liveStats.profitMargin.toFixed(2)),
        actualCash: cleanActual,
        expectedCash: expected,
        difference: diff,
        status: 'مغلق',
        notes: isBaselineMode
          ? (shiftNotes ? `${shiftNotes} — [أول تقفيل يومية: تأسيس الرصيد الفعلي باليد]` : 'أول تقفيل يومية: إدخال الرصيد النقدي الفعلي يدوياً كبداية للمراجعة الحقيقية من الغد')
          : shiftNotes,
        branchId: targetBranchId,
        branchName: currentBranch.name,
        createdAt: new Date().toISOString(),
        nextDayDate,
        channelSummaries: liveStats.channelSummaries,
        nextDayOpeningBalances: liveStats.nextDayOpeningBalances,
        isInitialBaseline: isBaselineMode
      };

      updated.dailyClosings.unshift(newClosing);
      logAudit(
        updated,
        isBaselineMode ? 'تأسيس رصيد أول تقفيل يومية' : 'تقفيل يومية ووردية',
        `تم تقفيل ${shiftName} لفرع ${currentBranch.name} بتاريخ ${selectedDate} وترحيل الرصيد الافتتاحي (${formatMoney(cleanActual, db.settings.currency)}) ليوم ${nextDayDate}`
      );

      onUpdateDb(updated);
      setJustClosedRecord(newClosing);
    });
  };

  // Update existing closing
  const handleUpdateClosing = (e: React.FormEvent) => {
    e.preventDefault();
    runWithLock(() => {
      if (!editingClosing) return;
      const cleanActual = roundMoney(editingClosing.actualCash);
      const cleanExpected = roundMoney(editingClosing.expectedCash);
      if (!isFiniteNonNegative(cleanActual) || !isFiniteNonNegative(cleanExpected)) {
        alert('قيم النقد الفعلي والمتوقع يجب أن تكون أرقاماً غير سالبة.');
        return;
      }

      const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
      if (!updated.dailyClosings) updated.dailyClosings = [];

      const idx = updated.dailyClosings.findIndex(c => c.id === editingClosing.id);
      if (idx !== -1) {
        const prevClosing = updated.dailyClosings[idx];
        const nextDifference = roundMoney(cleanActual - cleanExpected);
        const updatedChannelSummaries = Array.isArray(prevClosing.channelSummaries)
          ? prevClosing.channelSummaries.map(cs => {
              if (cs.method !== 'نقدي') return cs;
              return {
                ...cs,
                actualBalance: cleanActual,
                variance: prevClosing.isInitialBaseline ? 0 : roundMoney(cleanActual - (cs.closingBalance || 0)),
                nextDayOpeningBalance: cleanActual
              };
            })
          : prevClosing.channelSummaries;
        const updatedNextDayOpeningBalances = prevClosing.nextDayOpeningBalances
          ? { ...prevClosing.nextDayOpeningBalances, ['نقدي']: cleanActual }
          : prevClosing.nextDayOpeningBalances;

        const savedClosing: DailyClosing = {
          ...editingClosing,
          actualCash: cleanActual,
          expectedCash: cleanExpected,
          difference: nextDifference,
          channelSummaries: updatedChannelSummaries,
          nextDayOpeningBalances: updatedNextDayOpeningBalances
        };

        updated.dailyClosings[idx] = savedClosing;
        logAudit(updated, 'تعديل تقفيل يومية', `تم تعديل بيانات التقفيل ${editingClosing.shiftNumber}`);
        onUpdateDb(updated);
        if (reviewingClosing?.id === savedClosing.id) {
          setReviewingClosing(savedClosing);
        }
        setEditingClosing(null);
        alert('تم تحديث التقفيل بنجاح');
      }
    });
  };

  // Delete closing
  const handleDeleteClosing = (closing: DailyClosing) => {
    runWithLock(() => {
      if (!confirm(`هل أنت متأكد من حذف سجل تقفيل الوردية "${closing.shiftNumber}" المؤرخ في ${closing.date}؟`)) {
        return;
      }

      const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
      if (!updated.dailyClosings) updated.dailyClosings = [];

      updated.dailyClosings = updated.dailyClosings.filter(c => c.id !== closing.id);
      markRecordsDeleted(updated, [closing.id]);
      logAudit(updated, 'حذف تقفيل يومية', `تم حذف سجل التقفيل ${closing.shiftNumber}`);

      onUpdateDb(updated);
      if (reviewingClosing?.id === closing.id) {
        setReviewingClosing(null);
      }
      if (justClosedRecord?.id === closing.id) {
        setJustClosedRecord(null);
      }
    });
  };

  // Print single closing
  const handlePrintSingle = (closing: DailyClosing) => {
    const block = buildClosingPrintBlock(closing);
    setPrintDocuments([block]);
    setPrintDocTitle(`تقفيل_${closing.shiftNumber}_${closing.date}`);
    setPrintModalOpen(true);
  };

  // Batch Print all closings (respects current branch/date/search filters)
  const handlePrintBatch = () => {
    const closings = filteredHistory;

    if (closings.length === 0) {
      alert('لا توجد سجلات تقفيل للطباعة');
      return;
    }

    const blocks = closings.map(c => buildClosingPrintBlock(c));
    setPrintDocuments(blocks);
    setPrintDocTitle(`سجل_تقفيلات_الورديات_المجمعة`);
    setPrintModalOpen(true);
  };

  // Export history to CSV (respects current branch/date/search filters)
  const handleExportHistoryCsv = () => {
    const closings = filteredHistory;
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

  const isHistoryTargetBranch = (bId?: string) => {
    if (historyBranchFilter === 'all') return true;
    return isBranchMatch(bId, targetBranchId);
  };

  const sortClosingsDesc = (a: DailyClosing, b: DailyClosing) =>
    a.date === b.date
      ? (b.createdAt || '').localeCompare(a.createdAt || '')
      : b.date.localeCompare(a.date);

  const branchScopedHistory = useMemo(
    () => (db.dailyClosings || []).filter(c => isHistoryTargetBranch(c.branchId)).sort(sortClosingsDesc),
    [db.dailyClosings, historyBranchFilter, targetBranchId]
  );

  // Unique saved dates for one-tap day review
  const availableHistoryDates = useMemo(() => {
    const counts = new Map<string, number>();
    branchScopedHistory.forEach(c => {
      counts.set(c.date, (counts.get(c.date) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, count]) => ({ date, count }));
  }, [branchScopedHistory]);

  // Closings already saved for the selectedDate in current tab
  const closingsForSelectedDate = useMemo(
    () => (db.dailyClosings || [])
      .filter(c => isTargetBranch(c.branchId) && c.date === selectedDate)
      .sort(sortClosingsDesc),
    [db.dailyClosings, selectedDate, targetBranchId]
  );

  // Filter history by branch, date, and search query
  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return branchScopedHistory
      .filter(c => !historyDateFilter || c.date === historyDateFilter)
      .filter(c => {
        if (!q) return true;
        return (
          (c.shiftNumber || '').toLowerCase().includes(q) ||
          (c.date || '').includes(q) ||
          (c.closedBy || '').toLowerCase().includes(q) ||
          (c.openedBy || '').toLowerCase().includes(q) ||
          (c.branchName || '').toLowerCase().includes(q) ||
          (c.notes || '').toLowerCase().includes(q)
        );
      });
  }, [branchScopedHistory, historyDateFilter, historySearch]);

  const openClosingReview = (closing: DailyClosing) => {
    setReviewSubTab('summary');
    setReviewingClosing(closing);
  };

  // Day-level movements & documents for the closing currently being reviewed
  const reviewDayDetails = useMemo(() => {
    if (!reviewingClosing) {
      return { invoices: [], treasury: [], returns: [], expenses: [], revenues: [] };
    }
    const rDate = reviewingClosing.date;
    const rBranch = reviewingClosing.branchId || targetBranchId;
    const matchesReviewScope = (bId?: string) => isBranchMatch(bId, rBranch);

    const invoices = (db.invoices || []).filter(
      inv => inv.date === rDate && inv.invoiceKind !== 'quote' && matchesReviewScope(inv.branchId)
    );
    const treasury = (db.treasury || []).filter(
      t => t.date === rDate && matchesReviewScope(t.branchId)
    );
    const returns = (db.returns || []).filter(
      r => r.date === rDate && matchesReviewScope(r.branchId)
    );
    const expenses = (db.expenses || []).filter(
      e => e.date === rDate && matchesReviewScope(e.branchId)
    );
    const revenues = (db.revenues || []).filter(
      r => r.date === rDate && matchesReviewScope(r.branchId)
    );

    return { invoices, treasury, returns, expenses, revenues };
  }, [reviewingClosing, db.invoices, db.treasury, db.returns, db.expenses, db.revenues, targetBranchId]);

  return (
    <div className="space-y-4 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-emerald-600" />
              <span>تقفيل اليومية والورديات وحساب أرباح الشفت</span>
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
              فرع: {currentBranch.name}
            </span>
          </div>
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
          {/* Post-Closing Confirmation Banner with Next-Day Opening Balances for ALL Channels */}
          {justClosedRecord && (
            <div className="bg-emerald-950 text-white rounded-xl p-4 border-2 border-emerald-400 shadow-lg space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <h3 className="text-sm font-black text-white">
                      ✓ تم اعتماد وتقفيل "{justClosedRecord.shiftNumber}" بنجاح وحفظه في السجل
                    </h3>
                    <p className="text-[11px] text-emerald-200">
                      الأرصدة الافتتاحية المرحلة لليوم التالي ({justClosedRecord.nextDayDate || nextDayDate}) في جميع وسائل الخزينة:
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openClosingReview(justClosedRecord)}
                    className="px-3 py-1.5 bg-emerald-400 text-emerald-950 hover:bg-emerald-300 rounded-lg text-xs font-black flex items-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>مراجعة الإغلاق</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrintSingle(justClosedRecord)}
                    className="px-3 py-1.5 bg-white text-emerald-950 hover:bg-emerald-100 rounded-lg text-xs font-black flex items-center gap-1 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>طباعة التقفيل</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('history')}
                    className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold cursor-pointer"
                  >
                    سجل التقفيلات
                  </button>
                  <button
                    type="button"
                    onClick={() => setJustClosedRecord(null)}
                    className="p-1 text-emerald-300 hover:text-white cursor-pointer"
                    title="إغلاق الإشعار"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-center">
                {(justClosedRecord.channelSummaries || []).map(cs => (
                  <div key={cs.method} className="bg-emerald-900/70 border border-emerald-500/40 rounded-lg p-2">
                    <span className="text-[10px] text-emerald-200 font-bold block truncate">{cs.method}</span>
                    <span className="text-xs sm:text-sm font-black font-mono text-white block mt-0.5">
                      {formatMoney(cs.nextDayOpeningBalance, db.settings.currency)}
                    </span>
                  </div>
                ))}
                <div className="bg-emerald-500 text-emerald-950 rounded-lg p-2 font-black">
                  <span className="text-[10px] block">إجمالي الخزينة</span>
                  <span className="text-xs sm:text-sm font-mono block mt-0.5">
                    {formatMoney(
                      (justClosedRecord.channelSummaries || []).reduce((s, c) => s + c.nextDayOpeningBalance, 0),
                      db.settings.currency
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Shift Configuration Bar */}
          <div className={`bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs grid grid-cols-1 ${isBaselineMode ? 'sm:grid-cols-3' : 'sm:grid-cols-4'} gap-3`}>
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">
                تاريخ اليومية / الوردية
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={e => {
                  setSelectedDate(e.target.value);
                  setJustClosedRecord(null);
                }}
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

            {!isBaselineMode && (
              <div>
                <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between mb-1">
                  <span>رصيد بداية الدرج (مرحل)</span>
                  {startingCashEdited && (
                    <button
                      type="button"
                      onClick={() => setStartingCashEdited(false)}
                      className="text-[10px] text-blue-600 hover:underline font-bold cursor-pointer"
                    >
                      تلقائي
                    </button>
                  )}
                </label>
                <input
                  type="number"
                  value={startingCash}
                  onChange={e => {
                    setStartingCashEdited(true);
                    setStartingCash(Number(e.target.value) || 0);
                  }}
                  placeholder="0"
                  className="w-full px-2.5 py-1.5 text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded-lg outline-none focus:border-blue-600"
                />
              </div>
            )}

            <div>
              <label className="text-[11px] font-black text-emerald-900 flex items-center justify-between mb-1">
                <span>{isBaselineMode ? 'المبلغ النقدي الفعلي (كاش) *' : 'الجرد الفعلي بالدرج (نقدي) *'}</span>
                {!isBaselineMode && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextMap: Record<string, string> = {};
                      liveStats.channelSummaries.forEach(cs => {
                        nextMap[cs.method] = reconcileInputs[cs.method] ?? String(cs.closingBalance);
                      });
                      setReconcileInputs(nextMap);
                      setShowReconcileChannels(true);
                    }}
                    className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-black cursor-pointer"
                  >
                    تطابق
                  </button>
                )}
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={actualCashEdited ? actualCashInput : (isBaselineMode ? (baselineChannelInputs['نقدي'] ?? '') : String(liveStats.rawExpectedCash))}
                onFocus={e => e.target.select()}
                onChange={e => {
                  const val = e.target.value;
                  setActualCashInput(val);
                  if (isBaselineMode) {
                    setBaselineChannelInputs(prev => ({ ...prev, ['نقدي']: val }));
                  } else {
                    setReconcileInputs(prev => ({ ...prev, ['نقدي']: val }));
                  }
                  if (val === '') {
                    setActualCashEdited(false);
                    setActualCash(0);
                  } else {
                    setActualCashEdited(true);
                    setActualCash(Math.max(0, parseFloat(val) || 0));
                  }
                }}
                placeholder="0"
                className="w-full px-2.5 py-1.5 text-xs font-mono font-black rounded-lg outline-none bg-slate-50 border-2 border-emerald-500 text-slate-950 focus:border-emerald-700"
              />
            </div>
          </div>

          {/* Saved Closings Quick-Review Bar for Selected Date */}
          {closingsForSelectedDate.length > 0 && (
            <div className="bg-blue-50/90 border border-blue-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-950">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  يوجد {closingsForSelectedDate.length} إغلاق يومية محفوظ ليوم{' '}
                  <span className="font-mono font-black">{selectedDate}</span> — اضغط على أي يومية لمراجعتها:
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {closingsForSelectedDate.map(sc => (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => openClosingReview(sc)}
                    className="px-2.5 py-1 bg-white hover:bg-blue-600 text-blue-900 hover:text-white border border-blue-300 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{sc.shiftNumber}</span>
                    <span className="text-[10px] font-mono opacity-80">({sc.time || '18:00'})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

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
                    {isBaselineMode ? 'ملخص النقدية (كاش)' : 'مطابقة درج النقدية (الكاش فقط)'}
                  </div>
                  {!isBaselineMode && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">رصيد الافتتاح (البداية):</span>
                      <strong className="font-mono">{formatMoney(startingCash, db.settings.currency)}</strong>
                    </div>
                  )}
                  <div className="flex justify-between text-emerald-700">
                    <span>(+) وارد الكاش للدرج:</span>
                    <strong className="font-mono">{formatMoney(liveStats.drawerIn, db.settings.currency)}</strong>
                  </div>
                  <div className="flex justify-between text-rose-700">
                    <span>(-) صادر الكاش من الدرج:</span>
                    <strong className="font-mono">{formatMoney(liveStats.drawerOut, db.settings.currency)}</strong>
                  </div>
                  {!isBaselineMode && (
                    <div className="flex justify-between font-bold border-t border-slate-200 pt-1">
                      <span className="text-slate-800">النقد المتوقع بالدرج (دفترياً):</span>
                      <strong className="font-mono">{formatMoney(liveStats.expectedCash, db.settings.currency)}</strong>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-slate-950">
                    <span>النقد الفعلي الموجود بالدرج:</span>
                    <strong className="font-mono">{formatMoney(liveStats.effectiveActualCash, db.settings.currency)}</strong>
                  </div>
                  {!isBaselineMode && (
                    <div className={`flex justify-between font-black border-t border-slate-200 pt-1.5 ${
                      liveStats.diff === 0
                        ? 'text-emerald-700'
                        : liveStats.diff > 0
                        ? 'text-blue-700'
                        : 'text-rose-700'
                    }`}>
                      <span>الفارق (العجز / الزيادة):</span>
                      <span className="font-mono text-sm">
                        {liveStats.diff === 0
                          ? 'مطابق تماماً ✓'
                          : liveStats.diff > 0
                          ? `زيادة +${formatMoney(liveStats.diff, db.settings.currency)}`
                          : `عجز ${formatMoney(liveStats.diff, db.settings.currency)}`}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Next-Day Opening Balances & Day 2+ «تطابق» Reconciliation Across ALL 5 Treasury Channels */}
              <div className="bg-slate-900 text-white rounded-xl p-3.5 border border-slate-700 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 pb-2">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-emerald-400 shrink-0" />
                    <h4 className="text-xs font-black text-white">
                      الرصيد الافتتاحي لليوم التالي ({nextDayDate}) في جميع وسائل الخزينة
                    </h4>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isBaselineMode && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!showReconcileChannels) {
                            const nextMap: Record<string, string> = {};
                            liveStats.channelSummaries.forEach(cs => {
                              nextMap[cs.method] = reconcileInputs[cs.method] ?? String(cs.closingBalance);
                            });
                            setReconcileInputs(nextMap);
                          }
                          setShowReconcileChannels(prev => !prev);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all ${
                          showReconcileChannels
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-blue-600 hover:bg-blue-500 text-white shadow-xs'
                        }`}
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>{showReconcileChannels ? 'إخفاء المطابقة' : 'تطابق'}</span>
                      </button>
                    )}
                    <div className="bg-emerald-500/20 border border-emerald-400/50 px-2.5 py-1 rounded-lg text-left">
                      <span className="text-[9.5px] text-emerald-200 block">إجمالي الافتتاحي لليوم التالي</span>
                      <span className="text-xs font-black font-mono text-emerald-300">
                        {formatMoney(liveStats.totalNextDayOpening, db.settings.currency)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-center text-[11px] border-collapse">
                    <thead>
                      <tr className="bg-slate-800 text-slate-300 font-bold border-b border-slate-700">
                        <th className="py-1.5 px-2 text-right">وسيلة الدفع / الخزينة</th>
                        {!isBaselineMode && <th className="py-1.5 px-2">افتتاحي اليوم</th>}
                        <th className="py-1.5 px-2 text-emerald-300">الوارد (+)</th>
                        <th className="py-1.5 px-2 text-rose-300">الصادر (-)</th>
                        {!isBaselineMode && <th className="py-1.5 px-2 text-slate-200">رصيد النظام</th>}
                        <th className="py-1.5 px-2 text-amber-300 font-black">
                          {isBaselineMode ? 'المبلغ الفعلي المعتمد' : (showReconcileChannels ? 'تصحيح المبلغ الفعلي' : 'الرصيد الافتتاحي لليوم التالي')}
                        </th>
                        {!isBaselineMode && showReconcileChannels && (
                          <th className="py-1.5 px-2 text-blue-300 font-black">الفارق (عجز / زيادة)</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 font-mono">
                      {liveStats.channelSummaries.map(cs => {
                        const chDiff = cs.variance || 0;
                        return (
                          <tr key={cs.method} className="hover:bg-slate-800/60">
                            <td className="py-1.5 px-2 text-right font-sans font-bold text-white">{cs.method}</td>
                            {!isBaselineMode && (
                              <td className="py-1.5 px-2 text-slate-300">{formatCleanNumber(cs.openingBalance)}</td>
                            )}
                            <td className="py-1.5 px-2 text-emerald-400">+{formatCleanNumber(cs.cashIn)}</td>
                            <td className="py-1.5 px-2 text-rose-400">-{formatCleanNumber(cs.cashOut)}</td>
                            {!isBaselineMode && (
                              <td className="py-1.5 px-2 text-slate-200 font-bold">{formatCleanNumber(cs.closingBalance)}</td>
                            )}
                            <td className="py-1.5 px-2">
                              {isBaselineMode ? (
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={cs.method === 'نقدي' ? (actualCashEdited ? actualCashInput : (baselineChannelInputs['نقدي'] ?? '')) : (baselineChannelInputs[cs.method] ?? '')}
                                  onFocus={e => e.target.select()}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setBaselineChannelInputs(prev => ({ ...prev, [cs.method]: val }));
                                    if (cs.method === 'نقدي') {
                                      setActualCashInput(val);
                                      if (val === '') {
                                        setActualCashEdited(false);
                                        setActualCash(0);
                                      } else {
                                        setActualCashEdited(true);
                                        setActualCash(Math.max(0, parseFloat(val) || 0));
                                      }
                                    }
                                  }}
                                  placeholder="0"
                                  className="w-28 px-2 py-1 text-center bg-slate-800 border border-amber-400/70 text-amber-200 font-mono font-black rounded outline-none focus:border-emerald-400"
                                />
                              ) : showReconcileChannels ? (
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={reconcileInputs[cs.method] ?? String(cs.closingBalance)}
                                  onFocus={e => e.target.select()}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setReconcileInputs(prev => ({ ...prev, [cs.method]: val }));
                                    if (cs.method === 'نقدي') {
                                      setActualCashInput(val);
                                      if (val === '') {
                                        setActualCashEdited(false);
                                        setActualCash(0);
                                      } else {
                                        setActualCashEdited(true);
                                        setActualCash(Math.max(0, parseFloat(val) || 0));
                                      }
                                    }
                                  }}
                                  className="w-28 px-2 py-1 text-center bg-slate-800 border border-blue-400/80 text-white font-mono font-black rounded outline-none focus:border-emerald-400"
                                />
                              ) : (
                                <span className="inline-block bg-emerald-600/30 border border-emerald-400/50 text-emerald-200 font-black px-2 py-0.5 rounded">
                                  {formatMoney(cs.nextDayOpeningBalance, db.settings.currency)}
                                </span>
                              )}
                            </td>
                            {!isBaselineMode && showReconcileChannels && (
                              <td className="py-1.5 px-2 font-black">
                                <span className={`inline-block px-2 py-0.5 rounded text-[10.5px] ${
                                  chDiff === 0
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                    : chDiff > 0
                                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                }`}>
                                  {chDiff === 0
                                    ? 'مطابق ✓'
                                    : chDiff > 0
                                    ? `زيادة +${formatMoney(chDiff, db.settings.currency)}`
                                    : `عجز ${formatMoney(chDiff, db.settings.currency)}`}
                                </span>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {!isBaselineMode && showReconcileChannels && (
                  <div className={`flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-700 text-xs font-black ${
                    liveStats.totalChannelVariance === 0
                      ? 'text-emerald-300'
                      : liveStats.totalChannelVariance > 0
                      ? 'text-blue-300'
                      : 'text-rose-300'
                  }`}>
                    <span>إجمالي فروقات المطابقة لجميع الوسائل:</span>
                    <span className="font-mono text-sm">
                      {liveStats.totalChannelVariance === 0
                        ? 'جميع الوسائل مطابقة تماماً ✓'
                        : liveStats.totalChannelVariance > 0
                        ? `زيادة إجمالية +${formatMoney(liveStats.totalChannelVariance, db.settings.currency)}`
                        : `عجز إجمالي ${formatMoney(liveStats.totalChannelVariance, db.settings.currency)}`}
                    </span>
                  </div>
                )}
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
                      actualCash: liveStats.effectiveActualCash,
                      expectedCash: liveStats.expectedCash,
                      difference: liveStats.diff,
                      status: 'مفتوح',
                      notes: shiftNotes,
                      createdAt: new Date().toISOString(),
                      branchId: targetBranchId,
                      branchName: currentBranch.name,
                      nextDayDate,
                      channelSummaries: liveStats.channelSummaries,
                      nextDayOpeningBalances: liveStats.nextDayOpeningBalances
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
                  disabled={isSubmitting}
                  onClick={handleSaveClosing}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isSubmitting ? 'جارٍ الإغلاق...' : 'اعتماد وإغلاق الوردية واليومية'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* History Tab */
        <div className="space-y-3">
          {/* Toolbar: Search + Exact Day Picker + Branch Filter + Export/Print */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-2.5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="بحث بالوردية، التاريخ، المسؤول، أو الملاحظات..."
                    value={historySearch}
                    onChange={e => setHistorySearch(e.target.value)}
                    className="w-full pr-8 pl-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-600"
                  />
                </div>

                {/* Pick any day */}
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                    <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span className="text-[11px] font-bold text-slate-600 whitespace-nowrap">اختر يوماً:</span>
                    <input
                      type="date"
                      value={historyDateFilter}
                      onChange={e => setHistoryDateFilter(e.target.value)}
                      className="bg-transparent text-xs font-mono font-bold text-slate-900 outline-none"
                    />
                  </div>
                  {historyDateFilter && (
                    <button
                      type="button"
                      onClick={() => setHistoryDateFilter('')}
                      className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-[11px] font-bold cursor-pointer"
                    >
                      كل الأيام
                    </button>
                  )}
                </div>

                {branches.length > 1 && (
                  <select
                    value={historyBranchFilter}
                    onChange={e => setHistoryBranchFilter(e.target.value as 'current' | 'all')}
                    className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none cursor-pointer"
                  >
                    <option value="current">فرع: {currentBranch.name}</option>
                    <option value="all">كل الفروع</option>
                  </select>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
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

            {/* Quick Saved Days Bar */}
            {availableHistoryDates.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-slate-100 pb-0.5">
                <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap ml-1">
                  الأيام المحفوظة ({availableHistoryDates.length}):
                </span>
                <button
                  type="button"
                  onClick={() => setHistoryDateFilter('')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer ${
                    !historyDateFilter
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  الكل ({branchScopedHistory.length})
                </button>
                {availableHistoryDates.map(item => (
                  <button
                    key={item.date}
                    type="button"
                    onClick={() => {
                      setHistoryDateFilter(item.date);
                      const dayClosings = branchScopedHistory.filter(c => c.date === item.date);
                      if (dayClosings.length === 1) {
                        openClosingReview(dayClosings[0]);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer ${
                      historyDateFilter === item.date
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-800 hover:bg-blue-50 hover:text-blue-700 border border-slate-200'
                    }`}
                  >
                    <span>{item.date}</span>
                    {item.count > 1 && (
                      <span className="text-[10px] opacity-80">({item.count})</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {filteredHistory.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-2xs">
              <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <div className="text-sm font-bold text-slate-700">
                {historyDateFilter || historySearch
                  ? 'لا توجد تقفيلات مطابقة لليوم أو البحث المحدد'
                  : 'لا توجد تقفيلات يومية مسجلة حتى الآن'}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {historyDateFilter || historySearch
                  ? 'يمكنك مسح الفلتر لعرض جميع الأيام المحفوظة في السجل'
                  : 'يمكنك إغلاق اليومية الحالية لحفظ أول سجل ومطابقة الخزينة'}
              </div>
              {(historyDateFilter || historySearch) && (
                <button
                  type="button"
                  onClick={() => {
                    setHistoryDateFilter('');
                    setHistorySearch('');
                  }}
                  className="mt-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  عرض جميع التقفيلات المحفوظة
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredHistory.map(c => (
                <div
                  key={c.id}
                  onClick={() => openClosingReview(c)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openClosingReview(c);
                    }
                  }}
                  className="bg-white rounded-xl border border-slate-200 hover:border-blue-400 hover:shadow-md shadow-2xs p-3.5 flex flex-col justify-between space-y-3 transition-all cursor-pointer group text-right"
                >
                  <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                    <div>
                      <h4 className="text-xs font-black text-slate-900 group-hover:text-blue-700 transition-colors">
                        {c.shiftNumber}
                      </h4>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {c.date} - {c.time || '18:00'}
                        {historyBranchFilter === 'all' && c.branchName ? ` • ${c.branchName}` : ''}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      c.isInitialBaseline ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {c.isInitialBaseline ? 'تأسيس البداية' : c.status}
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

                    {!c.isInitialBaseline && (
                      <div className="flex justify-between text-[11px] pt-1">
                        <span className="text-slate-500">العجز / الزيادة:</span>
                        <strong className={`font-mono font-bold ${
                          c.difference === 0 ? 'text-emerald-700' : c.difference > 0 ? 'text-blue-700' : 'text-rose-700'
                        }`}>
                          {c.difference === 0
                            ? 'مطابق'
                            : c.difference > 0
                            ? `زيادة +${formatMoney(c.difference, db.settings.currency)}`
                            : `عجز ${formatMoney(c.difference, db.settings.currency)}`}
                        </strong>
                      </div>
                    )}

                    {c.channelSummaries && c.channelSummaries.length > 0 && (
                      <div className="bg-slate-900 text-white p-2 rounded-lg space-y-1 text-[10px]">
                        <div className="font-bold text-emerald-300 border-b border-slate-700 pb-0.5">
                          الافتتاحي لليوم التالي ({c.nextDayDate || addOneDay(c.date)}):
                        </div>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono">
                          {c.channelSummaries.map(cs => (
                            <div key={cs.method} className="flex justify-between items-center">
                              <span className="font-sans text-slate-300 truncate">{cs.method}:</span>
                              <span className="font-bold text-emerald-200">{formatCleanNumber(cs.nextDayOpeningBalance)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {c.notes && (
                      <div className="text-[10px] text-slate-500 bg-slate-50 p-1.5 rounded truncate">
                        {c.notes}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5">
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        openClosingReview(c);
                      }}
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>مراجعة اليومية</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          handlePrintSingle(c);
                        }}
                        className="px-2 py-1 text-slate-700 hover:text-black hover:bg-slate-100 rounded text-xs font-bold flex items-center gap-1 cursor-pointer"
                        title="طباعة ومعاينة التقفيل بتنسيق رسمي"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>طباعة</span>
                      </button>

                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setEditingClosing(c);
                        }}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                        title="تعديل بيانات التقفيل"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          handleDeleteClosing(c);
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                        title="حذف سجل التقفيل"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Full Daily Closing Review Modal */}
      {reviewingClosing && (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-2xs flex items-center justify-center p-2 sm:p-4"
          onClick={() => setReviewingClosing(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-3.5 sm:p-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/20 border border-emerald-400/40 rounded-xl">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm sm:text-base font-black text-white">
                      مراجعة يومية: {reviewingClosing.shiftNumber}
                    </h3>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      reviewingClosing.isInitialBaseline
                        ? 'bg-amber-400/20 text-amber-200 border border-amber-400/40'
                        : 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                    }`}>
                      {reviewingClosing.isInitialBaseline ? 'تأسيس البداية' : reviewingClosing.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 font-mono mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span>التاريخ: {reviewingClosing.date}</span>
                    <span>الوقت: {reviewingClosing.time || '18:00'}</span>
                    <span className="font-sans">المسؤول: {reviewingClosing.closedBy || reviewingClosing.openedBy}</span>
                    {reviewingClosing.branchName && (
                      <span className="font-sans">الفرع: {reviewingClosing.branchName}</span>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setReviewingClosing(null)}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
                title="إغلاق المراجعة"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-Tabs inside Review Modal */}
            <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto shrink-0 text-xs font-bold">
              <button
                type="button"
                onClick={() => setReviewSubTab('summary')}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                  reviewSubTab === 'summary'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                ملخص الإغلاق والخزينة
              </button>
              <button
                type="button"
                onClick={() => setReviewSubTab('invoices')}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer ${
                  reviewSubTab === 'invoices'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>فواتير اليوم ({reviewDayDetails.invoices.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setReviewSubTab('treasury')}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer ${
                  reviewSubTab === 'treasury'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>حركات الخزينة والسندات ({reviewDayDetails.treasury.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setReviewSubTab('other')}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer ${
                  reviewSubTab === 'other'
                    ? 'bg-amber-600 text-white'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>
                  مصروفات وإيرادات ومرتجعات (
                  {reviewDayDetails.expenses.length + reviewDayDetails.revenues.length + reviewDayDetails.returns.length}
                  )
                </span>
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-3.5 sm:p-4 overflow-y-auto space-y-4 flex-1">
              {reviewSubTab === 'summary' && (
                <>
                  {/* KPI Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                      <span className="text-[11px] font-bold text-emerald-800 block">إجمالي دخل الخزينة</span>
                      <span className="text-sm sm:text-base font-black font-mono text-emerald-950 mt-1 block">
                        {formatMoney(reviewingClosing.cashIn, db.settings.currency)}
                      </span>
                    </div>
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
                      <span className="text-[11px] font-bold text-rose-800 block">إجمالي خرج الخزينة</span>
                      <span className="text-sm sm:text-base font-black font-mono text-rose-950 mt-1 block">
                        {formatMoney(reviewingClosing.cashOut, db.settings.currency)}
                      </span>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                      <span className="text-[11px] font-bold text-blue-800 block">مجمل ربح اليومية</span>
                      <span className="text-sm sm:text-base font-black font-mono text-blue-950 mt-1 block">
                        {formatMoney(reviewingClosing.grossProfit, db.settings.currency)}
                      </span>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <span className="text-[11px] font-bold text-amber-900 block">نسبة الربح المحققة</span>
                      <span className="text-sm sm:text-base font-black font-mono text-amber-950 mt-1 block">
                        {reviewingClosing.profitMargin.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Sales & Drawer Breakdown */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <div className="font-black text-slate-900 border-b border-slate-200 pb-1">
                        ملخص المبيعات والتكلفة والأرباح
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">إجمالي المبيعات:</span>
                        <strong className="font-mono">{formatMoney(reviewingClosing.salesTotal, db.settings.currency)}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">إجمالي المرتجعات:</span>
                        <strong className="font-mono">{formatMoney(reviewingClosing.returnsTotal, db.settings.currency)}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">صافي المبيعات:</span>
                        <strong className="font-mono">{formatMoney(reviewingClosing.netSales, db.settings.currency)}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">تكلفة البضاعة المباعة (FIFO):</span>
                        <strong className="font-mono">{formatMoney(reviewingClosing.cogs, db.settings.currency)}</strong>
                      </div>
                      <div className="flex justify-between text-blue-900 font-black border-t border-slate-200 pt-1.5">
                        <span>مجمل الربح:</span>
                        <span className="font-mono">{formatMoney(reviewingClosing.grossProfit, db.settings.currency)}</span>
                      </div>
                    </div>

                    <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <div className="font-black text-slate-900 border-b border-slate-200 pb-1">
                        مطابقة درج النقدية (الكاش)
                      </div>
                      {!reviewingClosing.isInitialBaseline && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">رصيد بداية الدرج:</span>
                          <strong className="font-mono">{formatMoney(reviewingClosing.startingCash, db.settings.currency)}</strong>
                        </div>
                      )}
                      {!reviewingClosing.isInitialBaseline && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">النقد المتوقع دفترياً:</span>
                          <strong className="font-mono">{formatMoney(reviewingClosing.expectedCash, db.settings.currency)}</strong>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-slate-950">
                        <span>النقد الفعلي المسجل:</span>
                        <strong className="font-mono">{formatMoney(reviewingClosing.actualCash, db.settings.currency)}</strong>
                      </div>
                      {!reviewingClosing.isInitialBaseline && (
                        <div className={`flex justify-between font-black border-t border-slate-200 pt-1.5 ${
                          reviewingClosing.difference === 0
                            ? 'text-emerald-700'
                            : reviewingClosing.difference > 0
                            ? 'text-blue-700'
                            : 'text-rose-700'
                        }`}>
                          <span>الفارق (العجز / الزيادة):</span>
                          <span className="font-mono">
                            {reviewingClosing.difference === 0
                              ? 'مطابق تماماً ✓'
                              : reviewingClosing.difference > 0
                              ? `زيادة +${formatMoney(reviewingClosing.difference, db.settings.currency)}`
                              : `عجز ${formatMoney(reviewingClosing.difference, db.settings.currency)}`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* All 5 Treasury Channels Table */}
                  {reviewingClosing.channelSummaries && reviewingClosing.channelSummaries.length > 0 && (
                    <div className="bg-slate-900 text-white rounded-xl p-3.5 border border-slate-700 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 pb-2">
                        <span className="text-xs font-black flex items-center gap-1.5">
                          <Wallet className="w-4 h-4 text-emerald-400" />
                          <span>تفاصيل وسائل الخزينة والرصيد المرحل لليوم التالي ({reviewingClosing.nextDayDate || addOneDay(reviewingClosing.date)})</span>
                        </span>
                        <span className="text-xs font-mono font-black text-emerald-300">
                          الإجمالي المرحل:{' '}
                          {formatMoney(
                            reviewingClosing.channelSummaries.reduce((s, cs) => s + (cs.nextDayOpeningBalance || 0), 0),
                            db.settings.currency
                          )}
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-center text-[11px] border-collapse">
                          <thead>
                            <tr className="bg-slate-800 text-slate-300 font-bold border-b border-slate-700">
                              <th className="py-1.5 px-2 text-right">الوسيلة</th>
                              <th className="py-1.5 px-2">افتتاحي</th>
                              <th className="py-1.5 px-2 text-emerald-300">وارد (+)</th>
                              <th className="py-1.5 px-2 text-rose-300">صادر (-)</th>
                              <th className="py-1.5 px-2">رصيد النظام</th>
                              <th className="py-1.5 px-2 text-amber-300">الفعلي المرحل</th>
                              {!reviewingClosing.isInitialBaseline && <th className="py-1.5 px-2 text-blue-300">الفارق</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800 font-mono">
                            {reviewingClosing.channelSummaries.map(cs => {
                              const chVar = cs.variance || 0;
                              return (
                                <tr key={cs.method} className="hover:bg-slate-800/60">
                                  <td className="py-1.5 px-2 text-right font-sans font-bold text-white">{cs.method}</td>
                                  <td className="py-1.5 px-2 text-slate-300">{formatCleanNumber(cs.openingBalance)}</td>
                                  <td className="py-1.5 px-2 text-emerald-400">+{formatCleanNumber(cs.cashIn)}</td>
                                  <td className="py-1.5 px-2 text-rose-400">-{formatCleanNumber(cs.cashOut)}</td>
                                  <td className="py-1.5 px-2 text-slate-200">{formatCleanNumber(cs.closingBalance)}</td>
                                  <td className="py-1.5 px-2 font-black text-emerald-300">
                                    {formatMoney(cs.nextDayOpeningBalance, db.settings.currency)}
                                  </td>
                                  {!reviewingClosing.isInitialBaseline && (
                                    <td className={`py-1.5 px-2 font-bold ${
                                      chVar === 0 ? 'text-emerald-300' : chVar > 0 ? 'text-blue-300' : 'text-rose-300'
                                    }`}>
                                      {chVar === 0 ? 'مطابق' : chVar > 0 ? `+${formatCleanNumber(chVar)}` : formatCleanNumber(chVar)}
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {reviewingClosing.notes && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
                      <span className="font-bold text-slate-700 block mb-1">ملاحظات اليومية:</span>
                      <p className="text-slate-800 whitespace-pre-wrap">{reviewingClosing.notes}</p>
                    </div>
                  )}
                </>
              )}

              {reviewSubTab === 'invoices' && (
                <div className="space-y-2">
                  {reviewDayDetails.invoices.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                      لا توجد فواتير مسجلة بتاريخ {reviewingClosing.date}
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-xs text-right border-collapse">
                        <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                          <tr>
                            <th className="p-2.5">رقم الفاتورة</th>
                            <th className="p-2.5">النوع</th>
                            <th className="p-2.5">العميل / المورد</th>
                            <th className="p-2.5">طريقة الدفع</th>
                            <th className="p-2.5 text-center">الإجمالي</th>
                            <th className="p-2.5 text-center">المدفوع</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {reviewDayDetails.invoices.map(inv => {
                            const isSale = inv.type === 'sale' || inv.invoiceKind === 'sale' || inv.invoiceKind === 'wholesale';
                            return (
                              <tr key={inv.id} className="hover:bg-slate-50">
                                <td className="p-2.5 font-mono font-bold text-slate-900">#{inv.number}</td>
                                <td className="p-2.5">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    isSale ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                                  }`}>
                                    {inv.invoiceKind === 'wholesale' ? 'مبيعات جملة' : isSale ? 'مبيعات' : 'مشتريات'}
                                  </span>
                                </td>
                                <td className="p-2.5 font-bold text-slate-800">{inv.partyName || '—'}</td>
                                <td className="p-2.5 text-slate-600">{inv.paymentMethod || 'نقدي'}</td>
                                <td className="p-2.5 text-center font-mono font-black text-slate-950">
                                  {formatMoney(inv.total, db.settings.currency)}
                                </td>
                                <td className="p-2.5 text-center font-mono text-emerald-700 font-bold">
                                  {formatMoney(inv.paid ?? inv.total, db.settings.currency)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {reviewSubTab === 'treasury' && (
                <div className="space-y-2">
                  {reviewDayDetails.treasury.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                      لا توجد حركات خزينة أو سندات مسجلة بتاريخ {reviewingClosing.date}
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-xs text-right border-collapse">
                        <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                          <tr>
                            <th className="p-2.5">الحركة</th>
                            <th className="p-2.5">الوسيلة</th>
                            <th className="p-2.5">البيان / الوصف</th>
                            <th className="p-2.5 text-center">المبلغ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {reviewDayDetails.treasury.map(tr => (
                            <tr key={tr.id} className="hover:bg-slate-50">
                              <td className="p-2.5">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  tr.direction === 'in'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}>
                                  {tr.direction === 'in' ? 'وارد (+)' : 'صادر (-)'}
                                </span>
                              </td>
                              <td className="p-2.5 font-bold text-slate-800">{tr.method}</td>
                              <td className="p-2.5 text-slate-700">{tr.description || 'حركة خزينة'}</td>
                              <td className={`p-2.5 text-center font-mono font-black ${
                                tr.direction === 'in' ? 'text-emerald-700' : 'text-rose-700'
                              }`}>
                                {tr.direction === 'in' ? '+' : '-'}{formatMoney(tr.amount, db.settings.currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {reviewSubTab === 'other' && (
                <div className="space-y-3 text-xs">
                  {reviewDayDetails.expenses.length === 0 &&
                  reviewDayDetails.revenues.length === 0 &&
                  reviewDayDetails.returns.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                      لا توجد مصروفات أو إيرادات أو مرتجعات مسجلة بتاريخ {reviewingClosing.date}
                    </div>
                  ) : (
                    <>
                      {reviewDayDetails.expenses.length > 0 && (
                        <div className="border border-rose-200 rounded-xl overflow-hidden">
                          <div className="bg-rose-50 px-3 py-2 font-black text-rose-900 border-b border-rose-200">
                            المصروفات ({reviewDayDetails.expenses.length})
                          </div>
                          <div className="divide-y divide-slate-100">
                            {reviewDayDetails.expenses.map(ex => (
                              <div key={ex.id} className="p-2.5 flex justify-between items-center">
                                <span className="font-bold text-slate-800">{ex.category} {ex.description ? `— ${ex.description}` : ''}</span>
                                <span className="font-mono font-black text-rose-700">{formatMoney(ex.amount, db.settings.currency)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {reviewDayDetails.revenues.length > 0 && (
                        <div className="border border-emerald-200 rounded-xl overflow-hidden">
                          <div className="bg-emerald-50 px-3 py-2 font-black text-emerald-900 border-b border-emerald-200">
                            الإيرادات الأخرى ({reviewDayDetails.revenues.length})
                          </div>
                          <div className="divide-y divide-slate-100">
                            {reviewDayDetails.revenues.map(rv => (
                              <div key={rv.id} className="p-2.5 flex justify-between items-center">
                                <span className="font-bold text-slate-800">{rv.category} {rv.description ? `— ${rv.description}` : ''}</span>
                                <span className="font-mono font-black text-emerald-700">{formatMoney(rv.amount, db.settings.currency)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {reviewDayDetails.returns.length > 0 && (
                        <div className="border border-amber-200 rounded-xl overflow-hidden">
                          <div className="bg-amber-50 px-3 py-2 font-black text-amber-900 border-b border-amber-200">
                            المرتجعات ({reviewDayDetails.returns.length})
                          </div>
                          <div className="divide-y divide-slate-100">
                            {reviewDayDetails.returns.map(ret => (
                              <div key={ret.id} className="p-2.5 flex justify-between items-center">
                                <span className="font-bold text-slate-800">
                                  {ret.type === 'sale' ? 'مرتجع مبيعات' : 'مرتجع مشتريات'} — {ret.partyName || ''}
                                </span>
                                <span className="font-mono font-black text-amber-800">{formatMoney(ret.total, db.settings.currency)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handlePrintSingle(reviewingClosing)}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة / PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingClosing(reviewingClosing)}
                  className="px-3 py-1.5 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>تعديل</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate(reviewingClosing.date);
                    setReviewingClosing(null);
                    setActiveTab('current');
                  }}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold cursor-pointer"
                >
                  فتح يومية {reviewingClosing.date}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setReviewingClosing(null)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-900 rounded-lg text-xs font-bold cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
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
                  disabled={isSubmitting}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-bold shadow-2xs"
                >
                  {isSubmitting ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
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
