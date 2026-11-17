import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Printer,
  Eye,
  Download,
  FileSpreadsheet,
  Package,
  Users,
  Building,
  Building2,
  Check,
  Loader2,
  Scale,
  FileText
} from 'lucide-react';
import {
  AccountingDB
} from '../types/accounting';
import {
  formatMoney,
  calculateFinancialSummary,
  calculateCustomerBalance,
  calculateSupplierBalance,
  getProductForBranch,
  buildProductFifoLedger,
  isVoucherLinkedToInvoice,
  isBranchMatch
} from '../services/accountingStorage';
import {
  UniversalPrintModal,
  MovementPrintBlock
} from './UniversalPrintModal';
import { exportTableToCsv } from '../services/exportService';
import {
  exportFinancialReportToPdf,
  FinancialPdfReportConfig
} from '../services/printAndPdfService';
import { appAlert } from '../services/appDialog';

interface ReportsViewProps {
  db: AccountingDB;
  activeBranchId?: string;
  onSelectBranch?: (branchId: string) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ db, activeBranchId, onSelectBranch }) => {
  const branches = db.branches || [{ id: 'br_main', name: 'الفرع الرئيسي', code: 'BR-01', isMain: true }];
  const [selectedBranchId, setSelectedBranchId] = useState<string>(activeBranchId || 'all');

  useEffect(() => {
    if (activeBranchId) {
      setSelectedBranchId(activeBranchId);
    }
  }, [activeBranchId]);

  const [activeReportTab, setActiveReportTab] = useState<
    'income' | 'trial_balance' | 'statement' | 'sales' | 'purchases' | 'inventory' | 'receivables' | 'payables'
  >('income');

  // Account Statement selector state
  const [statementPartyType, setStatementPartyType] = useState<'customer' | 'supplier'>('customer');
  const [statementPartyId, setStatementPartyId] = useState<string>(() => db.customers[0]?.id || '');

  // PDF Export state
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfExportSuccess, setPdfExportSuccess] = useState(false);

  // Universal print modal state
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [reportAutoPrint, setReportAutoPrint] = useState(false);
  const [printDocuments, setPrintDocuments] = useState<MovementPrintBlock[]>([]);
  const [printDocTitle, setPrintDocTitle] = useState('تقرير مالي');

  const currentBranch = branches.find(b => b.id === selectedBranchId);
  const branchLabel = selectedBranchId === 'all' ? 'كافة الفروع (مجمّع)' : (currentBranch ? currentBranch.name : 'الفرع المحدد');

  const isTargetBranch = (bId?: string) => {
    if (selectedBranchId === 'all') return true;
    return isBranchMatch(bId, selectedBranchId);
  };

  const branchParam = selectedBranchId === 'all' ? undefined : selectedBranchId;
  const summary = useMemo(() => calculateFinancialSummary(db, branchParam), [db, branchParam]);
  const fifoLedger = useMemo(() => buildProductFifoLedger(db, branchParam), [db, branchParam]);

  // Filtered sales and purchases (memoized)
  const filteredSales = useMemo(
    () => db.invoices.filter(i => i.type === 'sale' && isTargetBranch(i.branchId)),
    [db.invoices, selectedBranchId]
  );
  const filteredPurchases = useMemo(
    () => db.invoices.filter(i => i.type === 'purchase' && isTargetBranch(i.branchId)),
    [db.invoices, selectedBranchId]
  );

  // Resolved branch products (memoized)
  const branchProducts = useMemo(
    () => db.products.map(p => selectedBranchId === 'all' ? p : getProductForBranch(p, selectedBranchId)),
    [db.products, selectedBranchId]
  );

  // Keep selected statement party synchronized when switching type or db updates
  const availableStatementParties = statementPartyType === 'customer' ? db.customers : db.suppliers;
  useEffect(() => {
    if (!availableStatementParties.some(p => p.id === statementPartyId)) {
      setStatementPartyId(availableStatementParties[0]?.id || '');
    }
  }, [statementPartyType, availableStatementParties, statementPartyId]);

  const selectedStatementParty = useMemo(
    () => availableStatementParties.find(p => p.id === statementPartyId) || null,
    [availableStatementParties, statementPartyId]
  );

  // Trial Balance calculation (Accounts + Journals)
  const trialBalanceData = useMemo(() => {
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

    const rows = db.accounts.map(acc => {
      const entry = map[acc.id] || { debit: 0, credit: 0, balance: 0 };
      const isDebitNormal = acc.type === 'asset' || acc.type === 'expense';
      const net = isDebitNormal ? entry.debit - entry.credit : entry.credit - entry.debit;
      const debitBalance = entry.debit > entry.credit ? entry.debit - entry.credit : 0;
      const creditBalance = entry.credit > entry.debit ? entry.credit - entry.debit : 0;
      return {
        account: acc,
        debit: entry.debit,
        credit: entry.credit,
        debitBalance,
        creditBalance,
        net,
        isDebitNormal
      };
    });

    const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
    const totalDebitBalance = rows.reduce((s, r) => s + r.debitBalance, 0);
    const totalCreditBalance = rows.reduce((s, r) => s + r.creditBalance, 0);
    const diff = Math.abs(totalDebit - totalCredit);
    return {
      rows,
      totalDebit,
      totalCredit,
      totalDebitBalance,
      totalCreditBalance,
      diff,
      isBalanced: diff < 0.01
    };
  }, [db.accounts, db.journals]);

  // Statement of Account rows for selected customer/supplier
  const statementReportData = useMemo(() => {
    if (!selectedStatementParty) {
      return { rows: [] as { date: string; desc: string; debit: number; credit: number; balance: number }[], totalDebit: 0, totalCredit: 0, netBalance: 0 };
    }
    const isCustomer = statementPartyType === 'customer';
    const rawEvents: { date: string; desc: string; debit: number; credit: number; delta: number }[] = [];

    const opening = selectedStatementParty.openingBalance || 0;
    if (opening !== 0) {
      rawEvents.push({
        date: '0000-00-00',
        desc: 'رصيد افتتاحي سابق',
        debit: opening > 0 ? opening : 0,
        credit: opening < 0 ? Math.abs(opening) : 0,
        delta: opening
      });
    }

    db.invoices
      .filter(i =>
        i.partyId === selectedStatementParty.id &&
        isTargetBranch(i.branchId) &&
        i.invoiceKind !== 'quote' &&
        (i.invoiceKind as string) !== 'order' &&
        i.invoiceKind !== 'sale_return' &&
        i.invoiceKind !== 'purchase_return'
      )
      .forEach(inv => {
        if (isCustomer && (inv.type === 'sale' || inv.invoiceKind === 'sale' || inv.invoiceKind === 'wholesale')) {
          const hasLinkedVoucher = db.vouchers.some(v => v.type === 'receipt' && isVoucherLinkedToInvoice(v, inv));
          if (hasLinkedVoucher) {
            rawEvents.push({
              date: inv.date,
              desc: `فاتورة بيع رقم ${inv.number}`,
              debit: inv.total,
              credit: 0,
              delta: inv.total
            });
          } else {
            rawEvents.push({
              date: inv.date,
              desc: `فاتورة بيع رقم ${inv.number}`,
              debit: inv.total,
              credit: inv.paid,
              delta: inv.total - inv.paid
            });
          }
        } else if (!isCustomer && (inv.type === 'purchase' || inv.invoiceKind === 'purchase')) {
          const hasLinkedVoucher = db.vouchers.some(v => v.type === 'payment' && isVoucherLinkedToInvoice(v, inv));
          if (hasLinkedVoucher) {
            rawEvents.push({
              date: inv.date,
              desc: `فاتورة شراء رقم ${inv.number}`,
              debit: 0,
              credit: inv.total,
              delta: inv.total
            });
          } else {
            rawEvents.push({
              date: inv.date,
              desc: `فاتورة شراء رقم ${inv.number}`,
              debit: inv.paid,
              credit: inv.total,
              delta: inv.total - inv.paid
            });
          }
        }
      });

    db.vouchers
      .filter(v => v.partyId === selectedStatementParty.id && isTargetBranch(v.branchId))
      .forEach(v => {
        if (isCustomer && v.type === 'receipt') {
          rawEvents.push({
            date: v.date,
            desc: v.referenceNumber ? `سند قبض رقم ${v.number} (فاتورة ${v.referenceNumber})` : `سند قبض رقم ${v.number}${v.description ? ` - ${v.description}` : ''}`,
            debit: 0,
            credit: v.amount,
            delta: -v.amount
          });
        } else if (!isCustomer && v.type === 'payment') {
          rawEvents.push({
            date: v.date,
            desc: v.referenceNumber ? `سند صرف رقم ${v.number} (فاتورة ${v.referenceNumber})` : `سند صرف رقم ${v.number}${v.description ? ` - ${v.description}` : ''}`,
            debit: v.amount,
            credit: 0,
            delta: -v.amount
          });
        }
      });

    (db.returns || [])
      .filter(r => r.partyId === selectedStatementParty.id && isTargetBranch(r.branchId) && r.type === (isCustomer ? 'sale' : 'purchase'))
      .forEach(r => {
        if (r.paymentMethod === 'آجل') {
          rawEvents.push({
            date: r.date,
            desc: `مرتجع ${isCustomer ? 'مبيعات' : 'مشتريات'} رقم ${r.number}`,
            debit: isCustomer ? 0 : r.total,
            credit: isCustomer ? r.total : 0,
            delta: -r.total
          });
        }
      });

    rawEvents.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));
    let running = 0;
    const rows = rawEvents.map(ev => {
      running += ev.delta;
      return {
        date: ev.date === '0000-00-00' ? '—' : ev.date,
        desc: ev.desc,
        debit: ev.debit,
        credit: ev.credit,
        balance: running
      };
    });

    const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
    const netBalance = isCustomer
      ? calculateCustomerBalance(db, selectedStatementParty.id, branchParam)
      : calculateSupplierBalance(db, selectedStatementParty.id, branchParam);

    return { rows, totalDebit, totalCredit, netBalance };
  }, [db, selectedStatementParty, statementPartyType, selectedBranchId, branchParam]);

  // Generate structured report blocks for UniversalPrintModal
  const generateReportBlocks = (): { title: string; docs: MovementPrintBlock[] } => {
    const today = new Date().toISOString().slice(0, 10);
    const curr = db.settings.currency;

    if (activeReportTab === 'trial_balance') {
      const accountTypeLabel = (t: string) =>
        t === 'asset' ? 'أصول' : t === 'liability' ? 'التزامات' : t === 'equity' ? 'حقوق ملكية' : t === 'revenue' ? 'إيرادات' : 'مصروفات';
      const doc: MovementPrintBlock = {
        title: 'ميزان المراجعة بالمجاميع والأرصدة',
        serialNo: `#TB-${today}`,
        date: today,
        partyLabel: 'المنشأة',
        partyName: db.settings.company,
        badge: trialBalanceData.isBalanced ? 'متزن محاسبياً' : 'فارق اتزان',
        tableHeaders: [
          { label: 'الكود', width: '12%', align: 'center' },
          { label: 'اسم الحساب', width: '32%', align: 'right' },
          { label: 'التصنيف', width: '12%', align: 'center' },
          { label: 'مجموع مدين', width: '14%', align: 'center' },
          { label: 'مجموع دائن', width: '14%', align: 'center' },
          { label: 'الرصيد الصافي', width: '16%', align: 'center' }
        ],
        tableRows: trialBalanceData.rows.map(r => ({
          cols: [
            r.account.code,
            r.account.name,
            accountTypeLabel(r.account.type),
            formatMoney(r.debit, curr),
            formatMoney(r.credit, curr),
            formatMoney(r.net, curr)
          ],
          isBold: r.net !== 0,
          highlight: r.net < 0
        })),
        summaryLines: [
          { label: 'إجمالي المجاميع المدينة', value: formatMoney(trialBalanceData.totalDebit, curr) },
          { label: 'إجمالي المجاميع الدائنة', value: formatMoney(trialBalanceData.totalCredit, curr) },
          { label: 'حالة الاتزان المحاسبي', value: trialBalanceData.isBalanced ? 'متزن 100%' : `فارق: ${formatMoney(trialBalanceData.diff, curr)}`, isTotal: true, highlight: true }
        ],
        footerNotes: 'ميزان المراجعة الشامل المستخرج من واقع قيود اليومية ودفتر الأستاذ العام.'
      };
      return { title: 'ميزان المراجعة بالمجاميع والأرصدة', docs: [doc] };
    }

    if (activeReportTab === 'statement') {
      const party = selectedStatementParty;
      const doc: MovementPrintBlock = {
        title: party ? `كشف حساب: ${party.name}` : 'كشف حساب تفصيلي',
        serialNo: `#STMT-${party?.code || today}`,
        date: today,
        partyLabel: statementPartyType === 'customer' ? 'العميل' : 'المورد',
        partyName: party ? party.name : 'لم يتم اختيار طرف',
        partyCode: party?.code || '—',
        partySubId: party?.phone || party?.address || '—',
        badge: statementPartyType === 'customer' ? 'كشف حساب عميل' : 'كشف حساب مورد',
        tableHeaders: [
          { label: 'التاريخ', width: '15%', align: 'center' },
          { label: 'البيان والحركة المالية', width: '40%', align: 'right' },
          { label: 'مدين (+)', width: '15%', align: 'center' },
          { label: 'دائن (-)', width: '15%', align: 'center' },
          { label: 'الرصيد التراكمي', width: '15%', align: 'center' }
        ],
        tableRows: statementReportData.rows.map(r => ({
          cols: [
            r.date,
            r.desc,
            r.debit > 0 ? formatMoney(r.debit, curr) : '—',
            r.credit > 0 ? formatMoney(r.credit, curr) : '—',
            formatMoney(r.balance, curr)
          ],
          highlight: r.balance > 0,
          isBold: r.balance !== 0
        })),
        summaryLines: [
          { label: 'إجمالي الحركات المدينة', value: formatMoney(statementReportData.totalDebit, curr) },
          { label: 'إجمالي الحركات الدائنة', value: formatMoney(statementReportData.totalCredit, curr) },
          { label: 'الرصيد الصافي المستحق', value: formatMoney(statementReportData.netBalance, curr), isTotal: true, highlight: true }
        ],
        footerNotes: `كشف حساب تحليلي - ${branchLabel}`
      };
      return { title: party ? `كشف حساب - ${party.name}` : 'كشف حساب', docs: [doc] };
    }

    if (activeReportTab === 'income') {
      const doc: MovementPrintBlock = {
        title: `قائمة الدخل الشاملة - ${branchLabel}`,
        serialNo: `#INC-${today}`,
        date: today,
        partyLabel: 'المنشأة والفرع',
        partyName: `${db.settings.company} - ${branchLabel}`,
        badge: summary.netProfit >= 0 ? 'صافي ربح' : 'صافي خسارة',
        tableHeaders: [
          { label: 'البند المالي', width: '60%', align: 'right' },
          { label: 'القيمة', width: '40%', align: 'center' }
        ],
        tableRows: [
          { cols: ['إجمالي إيرادات المبيعات المحققة', formatMoney(summary.totalSalesAll, curr)], isBold: true },
          { cols: ['(يُخصم) تكلفة البضاعة المباعة (COGS)', `- ${formatMoney(summary.totalCOGS, curr)}`] },
          { cols: ['مجمل الربح التجاري (Gross Profit)', formatMoney(summary.grossProfit, curr)], isBold: true, highlight: true },
          { cols: ['(+) إيرادات تشغيلية وأخرى', `+ ${formatMoney(summary.totalOtherRevenues, curr)}`] },
          { cols: ['(يُخصم) المصروفات العمومية والتشغيلية', `- ${formatMoney(summary.totalExpenses, curr)}`] },
          { cols: ['صافي الأرباح المحققة (Net Profit)', formatMoney(summary.netProfit, curr)], isBold: true, highlight: true }
        ],
        summaryLines: [
          { label: 'مجمل الربح', value: formatMoney(summary.grossProfit, curr) },
          { label: 'إجمالي المصروفات', value: formatMoney(summary.totalExpenses, curr) },
          { label: 'صافي الربح / الخسارة', value: formatMoney(summary.netProfit, curr), isTotal: true, highlight: true }
        ],
        footerNotes: `تم استخراج قائمة الدخل الخاصة بـ (${branchLabel}) من واقع القيود والمبيعات والمصروفات المستقلة.`
      };
      return { title: `قائمة الدخل - ${branchLabel}`, docs: [doc] };
    }

    if (activeReportTab === 'sales') {
      const totalPaid = filteredSales.reduce((s, i) => s + i.paid, 0);
      const totalRem = filteredSales.reduce((s, i) => s + i.remaining, 0);

      const doc: MovementPrintBlock = {
        title: `تقرير المبيعات والتحصيلات - ${branchLabel}`,
        serialNo: `#SAL-${today}`,
        date: today,
        partyLabel: 'إجمالي الفواتير',
        partyName: `${filteredSales.length} فاتورة مسجلة (${branchLabel})`,
        badge: 'مبيعات',
        tableHeaders: [
          { label: 'رقم الفاتورة', width: '16%', align: 'center' },
          { label: 'التاريخ', width: '17%', align: 'center' },
          { label: 'العميل', width: '25%', align: 'right' },
          { label: 'الإجمالي', width: '14%', align: 'center' },
          { label: 'المحصل', width: '14%', align: 'center' },
          { label: 'المتبقي', width: '14%', align: 'center' }
        ],
        tableRows: filteredSales.map(s => ({
          cols: [
            s.number,
            s.date,
            s.partyName || 'عميل نقدي',
            formatMoney(s.total, curr),
            formatMoney(s.paid, curr),
            formatMoney(s.remaining, curr)
          ],
          highlight: s.remaining > 0
        })),
        summaryLines: [
          { label: 'إجمالي المبيعات', value: formatMoney(summary.totalSalesAll, curr) },
          { label: 'إجمالي المحصل نقداً', value: formatMoney(totalPaid, curr) },
          { label: 'إجمالي المتبقي آجل', value: formatMoney(totalRem, curr), isTotal: true, highlight: true }
        ],
        footerNotes: `تقرير مبيعات فرع (${branchLabel})`
      };
      return { title: `تقرير مبيعات - ${branchLabel}`, docs: [doc] };
    }

    if (activeReportTab === 'purchases') {
      const totalPaid = filteredPurchases.reduce((s, i) => s + i.paid, 0);
      const totalRem = filteredPurchases.reduce((s, i) => s + i.remaining, 0);

      const doc: MovementPrintBlock = {
        title: `تقرير المشتريات والتوريدات - ${branchLabel}`,
        serialNo: `#PUR-${today}`,
        date: today,
        partyLabel: 'إجمالي الفواتير',
        partyName: `${filteredPurchases.length} فاتورة شراء (${branchLabel})`,
        badge: 'مشتريات',
        tableHeaders: [
          { label: 'رقم الفاتورة', width: '16%', align: 'center' },
          { label: 'التاريخ', width: '17%', align: 'center' },
          { label: 'المورد', width: '25%', align: 'right' },
          { label: 'الإجمالي', width: '14%', align: 'center' },
          { label: 'المدفوع', width: '14%', align: 'center' },
          { label: 'المستحق', width: '14%', align: 'center' }
        ],
        tableRows: filteredPurchases.map(p => ({
          cols: [
            p.number,
            p.date,
            p.partyName || 'مورد عام',
            formatMoney(p.total, curr),
            formatMoney(p.paid, curr),
            formatMoney(p.remaining, curr)
          ],
          highlight: p.remaining > 0
        })),
        summaryLines: [
          { label: 'إجمالي المشتريات', value: formatMoney(summary.totalPurchasesAll, curr) },
          { label: 'إجمالي المدفوع للموردين', value: formatMoney(totalPaid, curr) },
          { label: 'إجمالي المستحق للموردين', value: formatMoney(totalRem, curr), isTotal: true, highlight: true }
        ],
        footerNotes: `تقرير مشتريات فرع (${branchLabel})`
      };
      return { title: `تقرير مشتريات - ${branchLabel}`, docs: [doc] };
    }

    if (activeReportTab === 'inventory') {
      const totalSell = branchProducts.reduce((s, p) => s + (p.currentQty * p.sellPrice), 0);
      const fifoLedger = buildProductFifoLedger(db, branchParam);

      const doc: MovementPrintBlock = {
        title: `تقرير جرد وتقييم المخزون - ${branchLabel}`,
        serialNo: `#INV-VAL-${today}`,
        date: today,
        partyLabel: 'عدد الأصناف',
        partyName: `${branchProducts.length} صنف مسجل (${branchLabel})`,
        badge: 'تقييم مخزون',
        tableHeaders: [
          { label: 'الكود', width: '14%', align: 'center' },
          { label: 'اسم الصنف', width: '32%', align: 'right' },
          { label: 'الرصيد بالفرع', width: '14%', align: 'center' },
          { label: 'آخر تكلفة موثقة', width: '14%', align: 'center' },
          { label: 'قيمة FIFO', width: '14%', align: 'center' },
          { label: 'قيمة البيع', width: '12%', align: 'center' }
        ],
        tableRows: branchProducts.map(p => {
          const fifo = fifoLedger.getProductSummary(p.id, p.name);
          return {
            cols: [
              p.code,
              p.name,
              `${p.currentQty} ${p.unit}`,
              fifo.hasVerifiedPurchase ? formatMoney(fifo.latestBuyPrice, curr) : 'غير محدد',
              formatMoney(fifo.batchValuation, curr),
              formatMoney(p.currentQty * p.sellPrice, curr)
            ]
          };
        }),
        summaryLines: [
          { label: 'إجمالي قيمة المخزون بدفعات FIFO', value: formatMoney(summary.totalStockValue, curr) },
          { label: 'إجمالي القيمة التقديرية بسعر البيع', value: formatMoney(totalSell, curr) },
          { label: 'الربح المتوقع للمخزون الحالي', value: formatMoney(totalSell - summary.totalStockValue, curr), isTotal: true, highlight: true }
        ],
        footerNotes: `تقييم مخزون خاص بـ (${branchLabel}) طبقاً لدفعات الشراء الفعلية (FIFO).`
      };
      return { title: `تقرير مخزون - ${branchLabel}`, docs: [doc] };
    }

    if (activeReportTab === 'receivables') {
      const doc: MovementPrintBlock = {
        title: `تقرير ديون العملاء (ذمم مدينة) - ${branchLabel}`,
        serialNo: `#REC-${today}`,
        date: today,
        partyLabel: 'عدد العملاء',
        partyName: `${db.customers.length} عميل`,
        badge: 'ديون عملاء',
        tableHeaders: [
          { label: 'الكود', width: '15%', align: 'center' },
          { label: 'اسم العميل', width: '35%', align: 'right' },
          { label: 'الهاتف', width: '20%', align: 'center' },
          { label: 'حد الائتمان', width: '15%', align: 'center' },
          { label: 'المديونية المستحقة', width: '15%', align: 'center' }
        ],
        tableRows: db.customers.map(c => {
          const bal = calculateCustomerBalance(db, c.id, branchParam);
          return {
            cols: [
              c.code || '—',
              c.name,
              c.phone || '—',
              formatMoney(c.creditLimit || 0, curr),
              formatMoney(bal, curr)
            ],
            highlight: bal > 0,
            isBold: bal > 0
          };
        }),
        summaryLines: [
          { label: 'إجمالي مديونيات العملاء المستحقة', value: formatMoney(summary.totalCustomerReceivables, curr), isTotal: true, highlight: true }
        ],
        footerNotes: `تقرير أرصدة ومطالبات العملاء بـ (${branchLabel})`
      };
      return { title: `تقرير عملاء - ${branchLabel}`, docs: [doc] };
    }

    // Default payables
    const doc: MovementPrintBlock = {
      title: `تقرير مستحقات الموردين (ذمم دائنة) - ${branchLabel}`,
      serialNo: `#PAY-${today}`,
      date: today,
      partyLabel: 'عدد الموردين',
      partyName: `${db.suppliers.length} مورد`,
      badge: 'مستحقات موردين',
      tableHeaders: [
        { label: 'الكود', width: '15%', align: 'center' },
        { label: 'اسم المورد', width: '35%', align: 'right' },
        { label: 'الهاتف', width: '25%', align: 'center' },
        { label: 'المستحق للمورد', width: '25%', align: 'center' }
      ],
      tableRows: db.suppliers.map(s => {
        const bal = calculateSupplierBalance(db, s.id, branchParam);
        return {
          cols: [
            s.code || '—',
            s.name,
            s.phone || '—',
            formatMoney(bal, curr)
          ],
          highlight: bal > 0,
          isBold: bal > 0
        };
      }),
      summaryLines: [
        { label: 'إجمالي مستحقات الموردين', value: formatMoney(summary.totalSupplierPayables, curr), isTotal: true, highlight: true }
      ],
      footerNotes: `تقرير التزامات الموردين بـ (${branchLabel})`
    };
    return { title: `تقرير موردين - ${branchLabel}`, docs: [doc] };
  };

  const handleOpenPrintModal = (autoPrint: boolean = false) => {
    const { title, docs } = generateReportBlocks();
    setPrintDocTitle(title);
    setPrintDocuments(docs);
    setReportAutoPrint(autoPrint);
    setPrintModalOpen(true);
  };

  const handleExportExcel = () => {
    const { docs } = generateReportBlocks();
    if (docs.length === 0) return;
    const doc = docs[0];
    const headers = doc.tableHeaders.map(h => h.label);
    const rows = doc.tableRows.map(r => r.cols);
    exportTableToCsv(`تقرير_${activeReportTab}_${branchLabel}_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  // Export clean, structured, paginated A4 Arabic Financial PDF using jsPDF
  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const curr = db.settings.currency || 'ج.م';
      let config: FinancialPdfReportConfig | null = null;

      if (activeReportTab === 'trial_balance') {
        const accountTypeLabel = (t: string) =>
          t === 'asset' ? 'أصول' : t === 'liability' ? 'التزامات' : t === 'equity' ? 'حقوق ملكية' : t === 'revenue' ? 'إيرادات' : 'مصروفات';
        config = {
          title: 'ميزان المراجعة بالمجاميع والأرصدة',
          subtitle: 'كشف أرصدة الحسابات ودفتر الأستاذ العام على مستوى المنشأة',
          serialNo: `TB-${today}`,
          date: today,
          branchName: branchLabel,
          badge: trialBalanceData.isBalanced ? 'متزن محاسبياً ✓' : 'يوجد فارق اتزان',
          settings: db.settings,
          kpis: [
            { label: 'إجمالي المجاميع المدينة', value: formatMoney(trialBalanceData.totalDebit, curr), tone: 'info' },
            { label: 'إجمالي المجاميع الدائنة', value: formatMoney(trialBalanceData.totalCredit, curr), tone: 'info' },
            { label: 'الأرصدة المدينة', value: formatMoney(trialBalanceData.totalDebitBalance, curr), tone: 'positive' },
            { label: 'الأرصدة الدائنة', value: formatMoney(trialBalanceData.totalCreditBalance, curr), tone: 'neutral' }
          ],
          columns: [
            { header: 'الكود', width: '10%', align: 'center' },
            { header: 'اسم الحساب', width: '28%', align: 'right' },
            { header: 'التصنيف', width: '10%', align: 'center' },
            { header: 'مجموع مدين', width: '13%', align: 'center', isNumeric: true },
            { header: 'مجموع دائن', width: '13%', align: 'center', isNumeric: true },
            { header: 'رصيد مدين', width: '13%', align: 'center', isNumeric: true },
            { header: 'رصيد دائن', width: '13%', align: 'center', isNumeric: true }
          ],
          rows: trialBalanceData.rows.map(r => ({
            cells: [
              r.account.code,
              r.account.name,
              accountTypeLabel(r.account.type),
              formatMoney(r.debit, curr),
              formatMoney(r.credit, curr),
              r.debitBalance > 0 ? formatMoney(r.debitBalance, curr) : '—',
              r.creditBalance > 0 ? formatMoney(r.creditBalance, curr) : '—'
            ],
            isBold: r.debit > 0 || r.credit > 0
          })),
          totalsRow: {
            cells: [
              '—',
              'الإجمالي العام لميزان المراجعة',
              `${trialBalanceData.rows.length} حساب`,
              formatMoney(trialBalanceData.totalDebit, curr),
              formatMoney(trialBalanceData.totalCredit, curr),
              formatMoney(trialBalanceData.totalDebitBalance, curr),
              formatMoney(trialBalanceData.totalCreditBalance, curr)
            ]
          },
          summaryLines: [
            { label: 'إجمالي الحركات المدينة (مجاميع)', value: formatMoney(trialBalanceData.totalDebit, curr) },
            { label: 'إجمالي الحركات الدائنة (مجاميع)', value: formatMoney(trialBalanceData.totalCredit, curr) },
            {
              label: 'نتيجة مطابقة وتوازن الميزان',
              value: trialBalanceData.isBalanced ? 'متزن محاسبياً بالكامل ✓' : `فارق بمقدار ${formatMoney(trialBalanceData.diff, curr)}`,
              isTotal: true,
              highlight: true
            }
          ],
          footerNotes: 'تم استخراج ميزان المراجعة بالمجاميع والأرصدة آلياً من واقع القيود المحاسبية المعتمدة.',
          filename: `ميزان_المراجعة_${today}.pdf`
        };
      } else if (activeReportTab === 'statement') {
        const party = selectedStatementParty;
        if (!party) {
          await appAlert('يرجى اختيار عميل أو مورد أولاً لتصدير كشف الحساب.');
          return;
        }
        config = {
          title: `كشف حساب ${statementPartyType === 'customer' ? 'عميل' : 'مورد'}: ${party.name}`,
          subtitle: `بيان تحليلي شامل للفواتير والسندات والمرتجعات — ${branchLabel}`,
          serialNo: `STMT-${party.code || party.id.slice(0, 6)}`,
          date: today,
          branchName: branchLabel,
          partyLabel: statementPartyType === 'customer' ? 'اسم العميل' : 'اسم المورد',
          partyName: party.name,
          partyCode: party.code || '—',
          partyPhone: party.phone || undefined,
          badge: statementPartyType === 'customer' ? 'كشف حساب عميل' : 'كشف حساب مورد',
          settings: db.settings,
          kpis: [
            { label: 'عدد الحركات', value: String(statementReportData.rows.length), tone: 'info' },
            { label: 'إجمالي المدين (+)', value: formatMoney(statementReportData.totalDebit, curr), tone: 'neutral' },
            { label: 'إجمالي الدائن (-)', value: formatMoney(statementReportData.totalCredit, curr), tone: 'positive' },
            { label: 'الرصيد الصافي الحالي', value: formatMoney(statementReportData.netBalance, curr), tone: statementReportData.netBalance > 0 ? 'negative' : 'positive' }
          ],
          columns: [
            { header: 'التاريخ', width: '15%', align: 'center' },
            { header: 'البيان والحركة المالية', width: '40%', align: 'right' },
            { header: 'مدين (+)', width: '15%', align: 'center', isNumeric: true },
            { header: 'دائن (-)', width: '15%', align: 'center', isNumeric: true },
            { header: 'الرصيد التراكمي', width: '15%', align: 'center', isNumeric: true }
          ],
          rows: statementReportData.rows.map(r => ({
            cells: [
              r.date,
              r.desc,
              r.debit > 0 ? formatMoney(r.debit, curr) : '—',
              r.credit > 0 ? formatMoney(r.credit, curr) : '—',
              formatMoney(r.balance, curr)
            ],
            highlight: r.balance > 0,
            isBold: r.balance !== 0
          })),
          totalsRow: {
            cells: [
              '—',
              'إجمالي حركات كشف الحساب',
              formatMoney(statementReportData.totalDebit, curr),
              formatMoney(statementReportData.totalCredit, curr),
              formatMoney(statementReportData.netBalance, curr)
            ]
          },
          summaryLines: [
            { label: 'إجمالي الحركات المدينة', value: formatMoney(statementReportData.totalDebit, curr) },
            { label: 'إجمالي الحركات الدائنة', value: formatMoney(statementReportData.totalCredit, curr) },
            { label: 'الرصيد الصافي المستحق حتى تاريخه', value: formatMoney(statementReportData.netBalance, curr), isTotal: true, highlight: true }
          ],
          footerNotes: 'هذا الكشف صادر إلكترونياً ويعتبر مطابقاً لحسابات المنشأة وفقاً للمستندات المعتمدة.',
          filename: `كشف_حساب_${party.name.replace(/\s+/g, '_')}_${today}.pdf`
        };
      } else {
        const { title, docs } = generateReportBlocks();
        if (!docs.length) return;
        const doc = docs[0];
        config = {
          title: doc.title,
          subtitle: `تقرير مالي معتمد — ${branchLabel}`,
          serialNo: doc.serialNo?.replace('#', ''),
          date: doc.date || today,
          branchName: branchLabel,
          partyLabel: doc.partyLabel,
          partyName: doc.partyName,
          badge: doc.badge,
          settings: db.settings,
          columns: doc.tableHeaders.map((h, idx) => ({
            header: h.label,
            width: h.width,
            align: h.align || 'center',
            isNumeric: activeReportTab === 'income'
              ? idx === 1
              : (activeReportTab === 'sales' || activeReportTab === 'purchases' || activeReportTab === 'inventory')
                ? idx >= 2
                : idx >= 3
          })),
          rows: doc.tableRows.map(r => ({
            cells: r.cols,
            isBold: r.isBold,
            highlight: r.highlight
          })),
          summaryLines: doc.summaryLines,
          footerNotes: doc.footerNotes,
          filename: `${title.replace(/\s+/g, '_')}_${today}.pdf`
        };
      }

      if (config) {
        const ok = await exportFinancialReportToPdf(config);
        if (ok) {
          setPdfExportSuccess(true);
          setTimeout(() => setPdfExportSuccess(false), 2500);
        }
      }
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="space-y-4 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6" />
            <span>التقارير المالية والتحليل المحاسبي</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            قوائم الدخل، الأرباح والخسائر، حركة المبيعات والمشتريات، وتقييم أصول المخزون المستقلة
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="تصدير التقرير المالي كملف PDF منظم احترافياً (jsPDF)"
          >
            {isExportingPdf ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : pdfExportSuccess ? (
              <Check className="w-4 h-4" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>{isExportingPdf ? 'جارٍ التصدير...' : pdfExportSuccess ? 'تم تحميل PDF!' : 'تصدير PDF'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="تصدير جدول التقرير إلى Excel"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            <span>تصدير Excel</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenPrintModal(false)}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="معاينة التقرير وتحديد مقاس الورقة (A4 / A5 / حراري)"
          >
            <Eye className="w-4 h-4 text-slate-600" />
            <span>معاينة التقرير</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenPrintModal(true)}
            className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
            title="طباعة فورية للتقرير بالمقاس المعتمد (A5 افتراضي)"
          >
            <Printer className="w-4 h-4 text-slate-200" />
            <span>طباعة فورية</span>
          </button>
        </div>
      </div>

      {/* Branch Isolation Filter Banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-blue-600" />
          <span className="text-xs font-bold text-slate-800">فرع إصدار التقرير:</span>
          <select
            value={selectedBranchId}
            onChange={(e) => {
              if (onSelectBranch && e.target.value !== 'all') {
                onSelectBranch(e.target.value);
              } else {
                setSelectedBranchId(e.target.value);
              }
            }}
            className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 shadow-2xs focus:ring-2 focus:ring-black cursor-pointer"
          >
            <option value="all">🌐 كافة الفروع مجتمعة (تقرير مركزي شامل)</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>
                📍 {b.name} {b.isMain ? '(الرئيسي)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="text-[11px] text-slate-500 font-bold bg-white px-2.5 py-1 rounded-lg border border-slate-200">
          التقرير يغطي: <span className="text-blue-700">{branchLabel}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2">
        {[
          { id: 'income', label: 'قائمة الدخل والأرباح', icon: DollarSign },
          { id: 'trial_balance', label: 'ميزان المراجعة', icon: Scale },
          { id: 'statement', label: 'كشف حساب عميل / مورد', icon: FileText },
          { id: 'sales', label: 'تقرير المبيعات والتحصيلات', icon: TrendingUp },
          { id: 'purchases', label: 'تقرير المشتريات والتوريدات', icon: BarChart3 },
          { id: 'inventory', label: 'تقرير تقييم المخزون', icon: Package },
          { id: 'receivables', label: 'ديون العملاء (ذمم مدينة)', icon: Users },
          { id: 'payables', label: 'مستحقات الموردين (ذمم دائنة)', icon: Building }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeReportTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveReportTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                isActive
                  ? 'bg-black text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Report Content Wrapper for PDF export */}
      <div id="current-report-content" className="bg-white rounded-2xl">
      {/* 0A. TRIAL BALANCE (ميزان المراجعة بالمجاميع والأرصدة) */}
      {activeReportTab === 'trial_balance' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 block">إجمالي المجاميع المدينة</span>
              <span className="text-base font-black font-mono text-slate-950">{formatMoney(trialBalanceData.totalDebit, db.settings.currency)}</span>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 block">إجمالي المجاميع الدائنة</span>
              <span className="text-base font-black font-mono text-slate-950">{formatMoney(trialBalanceData.totalCredit, db.settings.currency)}</span>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 block">مجموع الأرصدة المدينة</span>
              <span className="text-base font-black font-mono text-blue-700">{formatMoney(trialBalanceData.totalDebitBalance, db.settings.currency)}</span>
            </div>
            <div className={`p-3.5 rounded-xl border shadow-2xs ${trialBalanceData.isBalanced ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
              <span className="text-[11px] font-bold text-slate-600 block">حالة اتزان الميزان</span>
              <span className={`text-sm font-black ${trialBalanceData.isBalanced ? 'text-emerald-700' : 'text-rose-700'}`}>
                {trialBalanceData.isBalanced ? '✓ متزن محاسبياً بالكامل' : `فارق: ${formatMoney(trialBalanceData.diff, db.settings.currency)}`}
              </span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold">
                    <th className="py-2.5 px-3 text-center">الكود</th>
                    <th className="py-2.5 px-3">اسم الحساب</th>
                    <th className="py-2.5 px-3 text-center">التصنيف</th>
                    <th className="py-2.5 px-3 text-center">مجموع مدين</th>
                    <th className="py-2.5 px-3 text-center">مجموع دائن</th>
                    <th className="py-2.5 px-3 text-center">رصيد مدين</th>
                    <th className="py-2.5 px-3 text-center">رصيد دائن</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trialBalanceData.rows.map(r => (
                    <tr key={r.account.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 text-center font-mono text-slate-600">{r.account.code}</td>
                      <td className="py-2 px-3 font-bold text-slate-900">{r.account.name}</td>
                      <td className="py-2 px-3 text-center">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-700">
                          {r.account.type === 'asset' ? 'أصول' : r.account.type === 'liability' ? 'التزامات' : r.account.type === 'equity' ? 'حقوق ملكية' : r.account.type === 'revenue' ? 'إيرادات' : 'مصروفات'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center font-mono font-bold text-slate-900">{formatMoney(r.debit, db.settings.currency)}</td>
                      <td className="py-2 px-3 text-center font-mono font-bold text-slate-900">{formatMoney(r.credit, db.settings.currency)}</td>
                      <td className="py-2 px-3 text-center font-mono font-bold text-blue-700">{r.debitBalance > 0 ? formatMoney(r.debitBalance, db.settings.currency) : '—'}</td>
                      <td className="py-2 px-3 text-center font-mono font-bold text-emerald-700">{r.creditBalance > 0 ? formatMoney(r.creditBalance, db.settings.currency) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 border-t-2 border-slate-300 font-black text-slate-950">
                    <td colSpan={3} className="py-2.5 px-3">الإجمالي العام لميزان المراجعة</td>
                    <td className="py-2.5 px-3 text-center font-mono">{formatMoney(trialBalanceData.totalDebit, db.settings.currency)}</td>
                    <td className="py-2.5 px-3 text-center font-mono">{formatMoney(trialBalanceData.totalCredit, db.settings.currency)}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-blue-800">{formatMoney(trialBalanceData.totalDebitBalance, db.settings.currency)}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-emerald-800">{formatMoney(trialBalanceData.totalCreditBalance, db.settings.currency)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 0B. ACCOUNT STATEMENT (كشف حساب عميل / مورد) */}
      {activeReportTab === 'statement' && (
        <div className="space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setStatementPartyType('customer')}
                className={`px-3 py-1 rounded-md text-xs font-bold cursor-pointer transition-all ${statementPartyType === 'customer' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
              >
                كشف حساب عميل
              </button>
              <button
                type="button"
                onClick={() => setStatementPartyType('supplier')}
                className={`px-3 py-1 rounded-md text-xs font-bold cursor-pointer transition-all ${statementPartyType === 'supplier' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
              >
                كشف حساب مورد
              </button>
            </div>

            <select
              value={statementPartyId}
              onChange={e => setStatementPartyId(e.target.value)}
              className="flex-1 min-w-[200px] bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900"
            >
              {availableStatementParties.length === 0 ? (
                <option value="">لا يوجد أطراف مسجلة</option>
              ) : (
                availableStatementParties.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.code ? `[${p.code}]` : ''} {p.phone ? `— ${p.phone}` : ''}
                  </option>
                ))
              )}
            </select>
          </div>

          {selectedStatementParty && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-500 block">إجمالي الحركات المدينة (+)</span>
                  <span className="text-base font-black font-mono text-slate-950">{formatMoney(statementReportData.totalDebit, db.settings.currency)}</span>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-500 block">إجمالي الحركات الدائنة (-)</span>
                  <span className="text-base font-black font-mono text-emerald-700">{formatMoney(statementReportData.totalCredit, db.settings.currency)}</span>
                </div>
                <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-300 block">الرصيد الصافي الحالي ({selectedStatementParty.name})</span>
                  <span className="text-base font-black font-mono text-amber-300">{formatMoney(statementReportData.netBalance, db.settings.currency)}</span>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-white font-bold">
                        <th className="py-2.5 px-3 text-center">التاريخ</th>
                        <th className="py-2.5 px-3">البيان والحركة المالية</th>
                        <th className="py-2.5 px-3 text-center">مدين (+)</th>
                        <th className="py-2.5 px-3 text-center">دائن (-)</th>
                        <th className="py-2.5 px-3 text-center">الرصيد التراكمي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {statementReportData.rows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400 font-bold">لا توجد حركات مالية مسجلة لهذا الحساب</td>
                        </tr>
                      ) : (
                        statementReportData.rows.map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="py-2 px-3 text-center font-mono text-slate-600">{r.date}</td>
                            <td className="py-2 px-3 font-bold text-slate-900">{r.desc}</td>
                            <td className="py-2 px-3 text-center font-mono font-bold text-slate-900">{r.debit > 0 ? formatMoney(r.debit, db.settings.currency) : '—'}</td>
                            <td className="py-2 px-3 text-center font-mono font-bold text-emerald-700">{r.credit > 0 ? formatMoney(r.credit, db.settings.currency) : '—'}</td>
                            <td className="py-2 px-3 text-center font-mono font-black text-slate-950">{formatMoney(r.balance, db.settings.currency)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
      {/* 1. INCOME STATEMENT (قائمة الدخل والأرباح) */}
      {activeReportTab === 'income' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs max-w-3xl space-y-4">
          <div className="text-center border-b border-slate-200 pb-3">
            <h2 className="text-base font-black text-slate-900">{db.settings.company}</h2>
            <div className="text-xs font-bold text-slate-600 mt-0.5">
              قائمة الدخل الشاملة (الأرباح والخسائر) - {branchLabel}
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
              الفترة حتى: {new Date().toLocaleDateString('ar-EG')}
            </div>
          </div>

          <div className="space-y-3 text-xs">
            {/* Sales Revenue */}
            <div className="flex items-center justify-between py-2 border-b border-slate-100 font-bold">
              <span className="text-slate-800 text-sm">إجمالي إيرادات المبيعات:</span>
              <span className="font-mono text-sm font-black text-slate-950">
                {formatMoney(summary.totalSalesAll, db.settings.currency)}
              </span>
            </div>

            {/* COGS */}
            <div className="flex items-center justify-between py-2 border-b border-slate-100 text-slate-600">
              <span>(يُخصم) تكلفة البضاعة المباعة (COGS):</span>
              <span className="font-mono font-bold text-rose-700">
                - {formatMoney(summary.totalCOGS, db.settings.currency)}
              </span>
            </div>

            {/* Gross Profit */}
            <div className="flex items-center justify-between py-2.5 bg-slate-50 px-3 rounded-lg font-black text-slate-900 border border-slate-200">
              <span>مجمل الربح (Gross Profit):</span>
              <span className="font-mono text-sm">
                {formatMoney(summary.grossProfit, db.settings.currency)}
              </span>
            </div>

            {/* Other Revenues */}
            <div className="flex items-center justify-between py-2 border-b border-slate-100 text-slate-600">
              <span>(+) إيرادات تشغيلية وأخرى:</span>
              <span className="font-mono font-bold text-emerald-700">
                + {formatMoney(summary.totalOtherRevenues, db.settings.currency)}
              </span>
            </div>

            {/* Expenses */}
            <div className="flex items-center justify-between py-2 border-b border-slate-100 text-slate-600">
              <span>(يُخصم) المصروفات العمومية والتشغيلية:</span>
              <span className="font-mono font-bold text-rose-700">
                - {formatMoney(summary.totalExpenses, db.settings.currency)}
              </span>
            </div>

            {/* Net Profit */}
            <div className="flex items-center justify-between p-3.5 bg-slate-950 text-white rounded-xl font-black text-sm sm:text-base mt-4 shadow-xs">
              <span>صافي الأرباح المحققة (Net Profit):</span>
              <span className={`font-mono text-base sm:text-lg ${summary.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatMoney(summary.netProfit, db.settings.currency)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 2. SALES REPORT */}
      {activeReportTab === 'sales' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-bold text-slate-600 block mb-1">إجمالي المبيعات ({branchLabel})</span>
              <span className="text-lg font-black font-mono text-slate-950">{formatMoney(summary.totalSalesAll, db.settings.currency)}</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-bold text-slate-600 block mb-1">المحصل نقدياً وإلكترونياً</span>
              <span className="text-lg font-black font-mono text-emerald-700">
                {formatMoney(filteredSales.reduce((s, i) => s + i.paid, 0), db.settings.currency)}
              </span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-bold text-slate-600 block mb-1">المتبقي آجل</span>
              <span className="text-lg font-black font-mono text-rose-700">{formatMoney(filteredSales.reduce((s, i) => s + i.remaining, 0), db.settings.currency)}</span>
            </div>
          </div>

          {/* Sales Report Responsive Cards System (No Horizontal Scroll) */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredSales.map(inv => (
              <div key={inv.id} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs hover:shadow-xs transition-all space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-mono font-bold text-xs text-slate-900">{inv.number}</span>
                  <span className="font-mono text-[11px] text-slate-500">{inv.date}</span>
                </div>
                <div className="text-xs">
                  <span className="text-slate-500 text-[11px] block">العميل:</span>
                  <span className="font-bold text-slate-900 truncate block">{inv.partyName || 'عميل نقدي'}</span>
                </div>
                <div className="bg-slate-50 p-2 rounded-lg grid grid-cols-3 gap-1 text-center border border-slate-100 font-mono text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans">الإجمالي</span>
                    <span className="font-bold text-slate-950">{formatMoney(inv.total, db.settings.currency)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans">المدفوع</span>
                    <span className="font-bold text-emerald-700">{formatMoney(inv.paid, db.settings.currency)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans">المتبقي</span>
                    <span className="font-bold text-rose-700">{formatMoney(inv.remaining, db.settings.currency)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    inv.status === 'مدفوع' ? 'bg-emerald-100 text-emerald-800' :
                    inv.status === 'جزئي' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {inv.status}
                  </span>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold">
                    {inv.createdBy && (
                      <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                        أنشأها: {inv.createdBy}
                      </span>
                    )}
                    {inv.branchName && (
                      <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">
                        {inv.branchName}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. PURCHASES REPORT */}
      {activeReportTab === 'purchases' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-bold text-slate-600 block mb-1">إجمالي المشتريات ({branchLabel})</span>
              <span className="text-lg font-black font-mono text-slate-950">{formatMoney(summary.totalPurchasesAll, db.settings.currency)}</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-bold text-slate-600 block mb-1">المسدد للموردين</span>
              <span className="text-lg font-black font-mono text-emerald-700">
                {formatMoney(filteredPurchases.reduce((s, i) => s + i.paid, 0), db.settings.currency)}
              </span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-bold text-slate-600 block mb-1">المتبقي دين للموردين</span>
              <span className="text-lg font-black font-mono text-rose-700">{formatMoney(filteredPurchases.reduce((s, i) => s + i.remaining, 0), db.settings.currency)}</span>
            </div>
          </div>

          {/* Purchases Report Responsive Cards System */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredPurchases.map(inv => (
              <div key={inv.id} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs hover:shadow-xs transition-all space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-mono font-bold text-xs text-slate-900">{inv.number}</span>
                  <span className="font-mono text-[11px] text-slate-500">{inv.date}</span>
                </div>
                <div className="text-xs">
                  <span className="text-slate-500 text-[11px] block">المورد:</span>
                  <span className="font-bold text-slate-900 truncate block">{inv.partyName || 'مورد عام'}</span>
                </div>
                <div className="bg-slate-50 p-2 rounded-lg grid grid-cols-3 gap-1 text-center border border-slate-100 font-mono text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans">الإجمالي</span>
                    <span className="font-bold text-slate-950">{formatMoney(inv.total, db.settings.currency)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans">المسدد</span>
                    <span className="font-bold text-emerald-700">{formatMoney(inv.paid, db.settings.currency)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans">المتبقي</span>
                    <span className="font-bold text-rose-700">{formatMoney(inv.remaining, db.settings.currency)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    inv.status === 'مدفوع' ? 'bg-emerald-100 text-emerald-800' :
                    inv.status === 'جزئي' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {inv.status}
                  </span>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold">
                    {inv.createdBy && (
                      <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                        أنشأها: {inv.createdBy}
                      </span>
                    )}
                    {inv.branchName && (
                      <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">
                        {inv.branchName}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. INVENTORY VALUATION */}
      {activeReportTab === 'inventory' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between flex-wrap gap-3">
            <div>
              <span className="text-xs font-bold text-slate-600">إجمالي قيمة المخزون بسعر التكلفة ({branchLabel}):</span>
              <div className="text-xl font-black font-mono text-slate-950 mt-1">
                {formatMoney(summary.totalStockValue, db.settings.currency)}
              </div>
            </div>
            <div>
              <span className="text-xs font-bold text-slate-600">إجمالي القيمة التقديرية بسعر البيع:</span>
              <div className="text-xl font-black font-mono text-emerald-700 mt-1">
                {formatMoney(branchProducts.reduce((s, p) => s + (p.currentQty * p.sellPrice), 0), db.settings.currency)}
              </div>
            </div>
          </div>

          {/* Inventory Valuation Cards System */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {branchProducts.map(p => {
              const snap = fifoLedger.getProductSummary(p.id, p.name);
              const cost = snap.hasVerifiedPurchase ? snap.latestBuyPrice : undefined;
              const totalCost = snap.batchValuation;
              const totalSell = p.currentQty * p.sellPrice;
              const profit = totalSell - totalCost;

              return (
                <div key={p.id} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs hover:shadow-xs transition-all space-y-2.5">
                  <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                    <div>
                      <h4 className="font-bold text-sm text-slate-900">{p.name}</h4>
                      <span className="font-mono text-xs text-slate-500">كود: {p.code}</span>
                    </div>
                    <span className="font-mono font-black text-xs text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                      {p.currentQty} {p.unit}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2 rounded-lg border border-slate-100 font-mono">
                    <div>
                      <span className="text-[10px] text-slate-500 block font-sans">تكلفة آخر دفعة (FIFO):</span>
                      <span className="font-bold">{cost !== undefined ? formatMoney(cost, db.settings.currency) : 'غير محدد'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block font-sans">سعر البيع:</span>
                      <span className="font-bold">{formatMoney(p.sellPrice, db.settings.currency)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block font-sans">قيمة المخزون (FIFO):</span>
                      <span className="font-bold text-slate-950">{formatMoney(totalCost, db.settings.currency)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block font-sans">الربح المتوقع:</span>
                      <span className="font-bold text-emerald-700">
                        {cost !== undefined ? `+${formatMoney(profit, db.settings.currency)}` : 'غير محدد'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. RECEIVABLES (العملاء - ديون ومستحقات) */}
      {activeReportTab === 'receivables' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {db.customers.map(c => {
            const bal = calculateCustomerBalance(db, c.id, branchParam);
            const isOverLimit = (c.creditLimit || 0) > 0 && bal > (c.creditLimit || 0);

            return (
              <div key={c.id} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs hover:shadow-xs transition-all space-y-2.5">
                <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                  <div>
                    <h4 className="font-bold text-sm text-slate-900">{c.name}</h4>
                    <span className="font-mono text-xs text-slate-500">{c.phone || 'بدون هاتف'}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    isOverLimit ? 'bg-rose-100 text-rose-800' :
                    bal > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {isOverLimit ? 'تجاوز الحد' : bal > 0 ? 'مستحق السداد' : 'خالص'}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-slate-500">
                    <span>حد الائتمان المسموح:</span>
                    <span className="font-mono font-bold text-slate-800">{formatMoney(c.creditLimit || 0, db.settings.currency)}</span>
                  </div>
                  <div className="bg-amber-50/70 p-2 rounded-lg flex items-center justify-between border border-amber-200">
                    <span className="font-bold text-amber-950">إجمالي المديونية المستحقة:</span>
                    <span className="font-mono font-black text-amber-900 text-sm">{formatMoney(bal, db.settings.currency)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 6. PAYABLES (الموردون - التزامات ومستحقات) */}
      {activeReportTab === 'payables' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {db.suppliers.map(s => {
            const bal = calculateSupplierBalance(db, s.id, branchParam);

            return (
              <div key={s.id} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs hover:shadow-xs transition-all space-y-2.5">
                <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                  <div>
                    <h4 className="font-bold text-sm text-slate-900">{s.name}</h4>
                    <span className="font-mono text-xs text-slate-500">{s.phone || 'بدون هاتف'}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    bal > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {bal > 0 ? 'مطلوب سداده' : 'خالص'}
                  </span>
                </div>

                <div className="bg-rose-50/70 p-2 rounded-lg flex items-center justify-between border border-rose-200 text-xs">
                  <span className="font-bold text-rose-950">المستحق دفعه للمورد:</span>
                  <span className="font-mono font-black text-rose-900 text-sm">{formatMoney(bal, db.settings.currency)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>

      {/* Universal Print Modal for Financial Reports */}
      <UniversalPrintModal
        isOpen={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        documentTitle={printDocTitle}
        documents={printDocuments}
        settings={db.settings}
        autoPrint={reportAutoPrint}
      />
    </div>
  );
};
