import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp,
  DollarSign,
  Package,
  FileText,
  Calendar,
  Search,
  Filter,
  Printer,
  Download,
  FileSpreadsheet,
  Eye,
  Trash2,
  Edit,
  ArrowUpDown,
  RefreshCw
} from 'lucide-react';
import {
  AccountingDB,
  Invoice,
  Product
} from '../types/accounting';
import {
  formatMoney,
  getTodayDate,
  getProductForBranch,
  deleteInvoiceAndRevert,
  getLatestVerifiedPurchaseInfo,
  buildPurchaseCostMap
} from '../services/accountingStorage';
import {
  UniversalPrintModal,
  MovementPrintBlock,
  formatCleanNumber
} from './UniversalPrintModal';
import { exportTableToCsv } from '../services/exportService';

interface ProfitsViewProps {
  db: AccountingDB;
  onUpdateDb: (updated: AccountingDB) => void;
  onPreviewInvoice?: (inv: Invoice) => void;
  onEditInvoice?: (inv: Invoice) => void;
  activeBranchId?: string;
  onSelectBranch?: (branchId: string) => void;
}

export const ProfitsView: React.FC<ProfitsViewProps> = ({
  db,
  onUpdateDb,
  onPreviewInvoice,
  onEditInvoice,
  activeBranchId,
  onSelectBranch
}) => {
  const branches = db.branches || [{ id: 'br_main', name: 'الفرع الرئيسي', code: 'BR-01', isMain: true }];
  const [selectedBranchId, setSelectedBranchId] = useState<string>(activeBranchId || 'all');

  useEffect(() => {
    if (activeBranchId) setSelectedBranchId(activeBranchId);
  }, [activeBranchId]);

  const [profitTab, setProfitTab] = useState<'invoices' | 'items'>('invoices');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom'>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Print modal state
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printDocuments, setPrintDocuments] = useState<MovementPrintBlock[]>([]);
  const [printDocTitle, setPrintDocTitle] = useState('تقرير الأرباح');

  const today = getTodayDate();

  const isTargetBranch = (bId?: string) => {
    if (selectedBranchId === 'all') return true;
    return bId === selectedBranchId || (!bId && selectedBranchId === 'br_main');
  };

  // Helper date filter
  const isDateMatch = (dateStr: string) => {
    if (dateFilter === 'all') return true;
    if (dateFilter === 'today') return dateStr === today;
    if (dateFilter === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      return dateStr === y.toISOString().slice(0, 10);
    }
    if (dateFilter === 'week') {
      const w = new Date();
      w.setDate(w.getDate() - 7);
      return dateStr >= w.toISOString().slice(0, 10) && dateStr <= today;
    }
    if (dateFilter === 'month') {
      const m = new Date();
      m.setDate(1);
      return dateStr >= m.toISOString().slice(0, 10) && dateStr <= today;
    }
    if (dateFilter === 'custom') {
      if (fromDate && dateStr < fromDate) return false;
      if (toDate && dateStr > toDate) return false;
      return true;
    }
    return true;
  };

  // 1. INVOICE PROFITS CALCULATION (O(N) Indexed Purchase Cost Lookup)
  const costIndex = useMemo(() => buildPurchaseCostMap(db), [db.invoices, db.products]);

  const invoiceProfitsData = useMemo(() => {
    const sales = db.invoices.filter(i => (i.type === 'sale' || i.invoiceKind === 'sale' || i.invoiceKind === 'wholesale') && isDateMatch(i.date) && isTargetBranch(i.branchId));

    return sales.map(inv => {
      let invoiceCost = 0;
      let hasUndefinedCost = false;

      inv.items.forEach(it => {
        const costInfo = costIndex.getCost(it.productId, it.productName);
        if (costInfo.hasPurchases) {
          const unitCost = (db.settings.cost === 'average')
            ? (costInfo.avgCost || costInfo.latestBuyPrice)
            : (costInfo.latestBuyPrice || costInfo.avgCost);
          invoiceCost += it.qty * unitCost;
        } else if (it.costPrice && it.costPrice > 0) {
          invoiceCost += it.qty * it.costPrice;
        } else {
          hasUndefinedCost = true;
        }
      });

      const revenue = inv.total;
      const profit = revenue - invoiceCost;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

      return {
        invoice: inv,
        id: inv.id,
        number: inv.number,
        date: inv.date,
        time: inv.time || '12:00',
        customer: inv.partyName || 'عميل نقدي',
        paymentMethod: inv.paymentMethod,
        itemsCount: inv.items.length,
        revenue,
        cost: invoiceCost,
        profit,
        margin,
        hasUndefinedCost
      };
    }).filter(row => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        row.number.toLowerCase().includes(q) ||
        row.customer.toLowerCase().includes(q) ||
        row.paymentMethod.toLowerCase().includes(q)
      );
    });
  }, [db, dateFilter, fromDate, toDate, searchQuery, selectedBranchId]);

  // Grand Total of Gross Invoice Profits
  const grandTotalInvoiceProfits = useMemo(() => {
    return invoiceProfitsData.reduce((sum, row) => sum + row.profit, 0);
  }, [invoiceProfitsData]);

  // Operating Expenses for date and branch filter
  const operatingExpenses = useMemo(() => {
    return (db.expenses || [])
      .filter(e => isDateMatch(e.date) && isTargetBranch(e.branchId))
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [db.expenses, dateFilter, fromDate, toDate, selectedBranchId]);

  // Net Business Profit = Gross Merchandise Profit - Operating Expenses
  const netBusinessProfit = useMemo(() => {
    return grandTotalInvoiceProfits - operatingExpenses;
  }, [grandTotalInvoiceProfits, operatingExpenses]);

  // 2. PRODUCT PROFITS CALCULATION (Strict Rule 4: Verified Purchase Info)
  const itemProfitsData = useMemo(() => {
    const sales = db.invoices.filter(i => (i.type === 'sale' || i.invoiceKind === 'sale' || i.invoiceKind === 'wholesale') && isDateMatch(i.date) && isTargetBranch(i.branchId));

    // Map: productId -> aggregated data
    const map = new Map<string, {
      product: Product | undefined;
      productId: string;
      code: string;
      name: string;
      category: string;
      unit: string;
      qtySold: number;
      totalRevenue: number;
      totalCost: number;
      hasVerifiedCost: boolean;
      verifiedCostPrice: number;
    }>();

    sales.forEach(inv => {
      inv.items.forEach(it => {
        const normName = it.productName ? it.productName.trim().toLowerCase() : '';
        const prod = db.products.find(p => p.id === it.productId || (it.productCode && p.code === it.productCode) || (normName && p.name.trim().toLowerCase() === normName));
        const groupKey = prod?.id || it.productId || normName || it.productName;
        const costInfo = costIndex.getCost(prod?.id || it.productId, it.productName);
        const hasVerified = costInfo.hasPurchases;
        const verifiedCost = hasVerified
          ? ((db.settings.cost === 'average') ? (costInfo.avgCost || costInfo.latestBuyPrice) : (costInfo.latestBuyPrice || costInfo.avgCost))
          : (it.costPrice && it.costPrice > 0 ? it.costPrice : 0);
        const itemQty = Number(it.qty) || 0;
        const itemRev = Number(it.total) || (itemQty * (Number(it.unitPrice) || 0));
        const itemCost = itemQty * verifiedCost;

        if (!map.has(groupKey)) {
          map.set(groupKey, {
            product: prod,
            productId: groupKey,
            code: it.productCode || prod?.code || '—',
            name: it.productName || prod?.name || 'صنف',
            category: prod?.category || 'عام',
            unit: it.unit || prod?.unit || 'قطعة',
            qtySold: 0,
            totalRevenue: 0,
            totalCost: 0,
            hasVerifiedCost: hasVerified || (Boolean(it.costPrice) && it.costPrice > 0),
            verifiedCostPrice: verifiedCost
          });
        }

        const entry = map.get(groupKey)!;
        entry.qtySold += itemQty;
        entry.totalRevenue += itemRev;
        entry.totalCost += itemCost;
        if (hasVerified) {
          entry.hasVerifiedCost = true;
          entry.verifiedCostPrice = verifiedCost;
        }
      });
    });

    const list = Array.from(map.values()).map(item => {
      const actualSellPrice = item.qtySold > 0
        ? Number((item.totalRevenue / item.qtySold).toFixed(2))
        : (item.product?.sellPrice && item.product.sellPrice > 0 ? item.product.sellPrice : 0);
      const totalCost = item.hasVerifiedCost ? Number(item.totalCost.toFixed(2)) : 0;
      const profit = item.hasVerifiedCost ? Number((item.totalRevenue - totalCost).toFixed(2)) : 0;
      const unitNetProfit = item.hasVerifiedCost
        ? Number((actualSellPrice - item.verifiedCostPrice).toFixed(2))
        : 0;
      const margin = (item.hasVerifiedCost && item.totalRevenue > 0) ? (profit / item.totalRevenue) * 100 : 0;

      return {
        ...item,
        rawTotalCost: item.hasVerifiedCost ? item.totalCost : 0,
        totalCost,
        actualSellPrice,
        unitNetProfit,
        profit,
        margin
      };
    });

    // Search filter
    return list.filter(it => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        it.name.toLowerCase().includes(q) ||
        it.code.toLowerCase().includes(q) ||
        it.category.toLowerCase().includes(q)
      );
    });
  }, [db, dateFilter, fromDate, toDate, searchQuery, selectedBranchId]);

  // Invoice-level discounts, extra income & taxes for exact reconciliation between Item Profits and Invoice Profits
  const salesAdjustments = useMemo(() => {
    const sales = db.invoices.filter(i => (i.type === 'sale' || i.invoiceKind === 'sale' || i.invoiceKind === 'wholesale') && isDateMatch(i.date) && isTargetBranch(i.branchId));
    let discounts = 0;
    let extraIncome = 0;
    let taxes = 0;
    for (const inv of sales) {
      discounts += Number(inv.discount) || 0;
      extraIncome += Number(inv.extraIncomeVal) || 0;
      taxes += Number(inv.tax) || 0;
    }
    return {
      discounts: Number(discounts.toFixed(2)),
      extraIncome: Number(extraIncome.toFixed(2)),
      taxes: Number(taxes.toFixed(2))
    };
  }, [db.invoices, dateFilter, fromDate, toDate, selectedBranchId]);

  const totalItemsRevenueSum = useMemo(
    () => Number(itemProfitsData.reduce((s, it) => s + it.totalRevenue, 0).toFixed(2)),
    [itemProfitsData]
  );
  const totalItemsCostSum = useMemo(
    () => Number(itemProfitsData.reduce((s, it) => s + it.rawTotalCost, 0).toFixed(2)),
    [itemProfitsData]
  );

  // Grand Total of Item Profits (before invoice-level discounts/extra income)
  const grandTotalItemProfits = useMemo(() => {
    return Number((totalItemsRevenueSum - totalItemsCostSum).toFixed(2));
  }, [totalItemsRevenueSum, totalItemsCostSum]);

  // Adjusted Item Profits (after invoice-level discounts/extra income/taxes when not filtered by product search) -> matches grandTotalInvoiceProfits identically
  const adjustedGrandTotalItemProfits = useMemo(() => {
    if (searchQuery.trim()) return grandTotalItemProfits;
    return Number((grandTotalItemProfits - salesAdjustments.discounts + salesAdjustments.extraIncome + salesAdjustments.taxes).toFixed(2));
  }, [grandTotalItemProfits, salesAdjustments, searchQuery]);

  // Permission check for invoice deletion
  const userPerms = db.currentUser?.permissions;
  const isManager = db.currentUser?.role === 'مدير';
  const canDeleteSales = userPerms ? userPerms.canDeleteSales !== false : isManager;

  // Delete invoice handler
  const handleDeleteInvoice = (inv: Invoice) => {
    if (!canDeleteSales) {
      alert('عذراً، ليس لديك صلاحية لحذف الفواتير. الحذف مقتصر على المدير أو من يمنحه المدير الصلاحية.');
      return;
    }

    if (!confirm(`هل أنت متأكد من حذف الفاتورة "${inv.number}"؟\nسيتم عكس كميات المخزون بالكامل وإعادتها، وعكس الخزينة والأرصدة والقيود المحاسبية.`)) {
      return;
    }

    const updated = deleteInvoiceAndRevert(db, inv);
    onUpdateDb(updated);
  };

  // Convert an invoice profit row to a print block
  const buildInvoiceProfitPrintBlock = (row: typeof invoiceProfitsData[0]): MovementPrintBlock => {
    return {
      title: 'تحليل أرباح فاتورة مبيعات',
      serialNo: row.number,
      date: row.date,
      partyLabel: 'العميل',
      partyName: row.customer,
      partyCode: row.invoice.partyId || '—',
      partySubId: `وسيلة الدفع: ${row.paymentMethod}`,
      statement: `تقرير تفصيلي لربحية الفاتورة (${row.number}) ومقارنة سعر البيع مع تكلفة الشراء`,
      badge: row.profit >= 0 ? 'ربح محقق' : 'خسارة',
      typeTitle: 'بيان ربحية الفاتورة',
      tableHeaders: [
        { label: 'الصنف', width: '40%', align: 'right' },
        { label: 'العدد', width: '12%', align: 'center' },
        { label: 'سعر البيع', width: '16%', align: 'center' },
        { label: 'سعر التكلفة', width: '16%', align: 'center' },
        { label: 'ربح الصنف', width: '16%', align: 'center' }
      ],
      tableRows: row.invoice.items.map(it => {
        const costInfo = costIndex.getCost(it.productId, it.productName);
        const cost = costInfo.hasPurchases
          ? ((db.settings.cost === 'average') ? costInfo.avgCost : costInfo.latestBuyPrice)
          : (it.costPrice || 0);
        const lineProfit = it.total - (it.qty * cost);
        return {
          cols: [
            it.productName,
            formatCleanNumber(it.qty),
            formatCleanNumber(it.unitPrice),
            formatCleanNumber(cost),
            formatCleanNumber(lineProfit)
          ],
          isBold: false
        };
      }),
      summaryLines: [
        { label: 'إجمالي قيمة الفاتورة', value: `${formatCleanNumber(row.revenue)} ${db.settings.currency}` },
        { label: 'إجمالي تكلفة البضاعة', value: `${formatCleanNumber(row.cost)} ${db.settings.currency}` },
        { label: 'صافي ربح الفاتورة', value: `${formatCleanNumber(row.profit)} ${db.settings.currency}`, isTotal: true },
        { label: 'نسبة الربح %', value: `${row.margin.toFixed(1)}%`, highlight: true }
      ],
      footerNotes: `فارق الإيرادات والتكلفة لفاتورة ${row.number}`,
      createdBy: row.invoice.createdBy || db.currentUser?.name
    };
  };

  // Print single invoice profit
  const handlePrintSingleInvoice = (row: typeof invoiceProfitsData[0]) => {
    const block = buildInvoiceProfitPrintBlock(row);
    setPrintDocuments([block]);
    setPrintDocTitle(`أرباح_${row.number}`);
    setPrintModalOpen(true);
  };

  // Batch Print all invoice profits
  const handleBatchPrintInvoices = () => {
    if (invoiceProfitsData.length === 0) {
      alert('لا توجد فواتير للطباعة');
      return;
    }
    const blocks = invoiceProfitsData.map(r => buildInvoiceProfitPrintBlock(r));
    setPrintDocuments(blocks);
    setPrintDocTitle(`تقرير_أرباح_الفواتير_المجمعة`);
    setPrintModalOpen(true);
  };

  // Batch Print all product profits (Image 2 clean bordered table style)
  const handleBatchPrintItems = () => {
    if (itemProfitsData.length === 0) {
      alert('لا توجد أصناف للطباعة');
      return;
    }

    const summaryLines: MovementPrintBlock['summaryLines'] = [
      { label: 'إجمالي مبيعات الأصناف', value: `${formatCleanNumber(totalItemsRevenueSum)} ${db.settings.currency}` },
      { label: 'إجمالي تكلفة الشراء', value: `${formatCleanNumber(totalItemsCostSum)} ${db.settings.currency}` },
      { label: 'إجمالي أرباح الأصناف', value: `${formatCleanNumber(grandTotalItemProfits)} ${db.settings.currency}`, highlight: true }
    ];

    if (!searchQuery.trim()) {
      if (salesAdjustments.extraIncome > 0) {
        summaryLines.push({
          label: 'رسوم شحن / إيراد إضافي (+)',
          value: `+ ${formatCleanNumber(salesAdjustments.extraIncome)} ${db.settings.currency}`
        });
      }
      if (salesAdjustments.taxes > 0) {
        summaryLines.push({
          label: 'الضرائب (+)',
          value: `+ ${formatCleanNumber(salesAdjustments.taxes)} ${db.settings.currency}`
        });
      }
      if (salesAdjustments.discounts > 0) {
        summaryLines.push({
          label: 'خصومات الفواتير (-)',
          value: `- ${formatCleanNumber(salesAdjustments.discounts)} ${db.settings.currency}`
        });
      }
    }

    summaryLines.push({
      label: 'المصروفات التشغيلية',
      value: `${formatCleanNumber(operatingExpenses)} ${db.settings.currency}`
    });
    summaryLines.push({
      label: 'صافي ربح النشاط التجاري',
      value: `${formatCleanNumber(adjustedGrandTotalItemProfits - operatingExpenses)} ${db.settings.currency}`,
      isTotal: true
    });

    const block: MovementPrintBlock = {
      title: 'تقرير أرباح الأصناف التفصيلي',
      serialNo: `#PROF-${Date.now().toString().slice(-4)}`,
      date: today,
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      partyLabel: 'النطاق الزمني:',
      partyName: dateFilter === 'all' ? 'جميع الفترات' : `من ${fromDate || today} إلى ${toDate || today}`,
      partySubId: `عدد الأصناف المخرجة: ${itemProfitsData.length}`,
      badge: 'تقرير معتمد',
      typeTitle: 'بيان أرباح الأصناف',
      tableHeaders: [
        { label: 'اسم الصنف', width: '32%', align: 'right' },
        { label: 'الكمية المخرجة', width: '12%', align: 'center' },
        { label: 'سعر الشراء', width: '14%', align: 'center' },
        { label: 'سعر البيع', width: '14%', align: 'center' },
        { label: 'الربح الصافي', width: '14%', align: 'center' },
        { label: 'إجمالي الربح للصنف', width: '14%', align: 'center' }
      ],
      tableRows: itemProfitsData.map(it => ({
        cols: [
          it.name,
          formatCleanNumber(it.qtySold),
          it.hasVerifiedCost ? formatCleanNumber(it.verifiedCostPrice) : 'غير محدد',
          formatCleanNumber(it.actualSellPrice),
          it.hasVerifiedCost ? formatCleanNumber(it.unitNetProfit) : '—',
          it.hasVerifiedCost ? formatCleanNumber(it.profit) : '—'
        ],
        isBold: false
      })),
      summaryLines,
      footerNotes: 'تم احتساب سعر الشراء من فواتير الشراء المسجلة وسعر البيع من فواتير البيع الفعلية ومراعاة الخصومات والإضافات.',
      createdBy: db.currentUser?.name
    };

    setPrintDocuments([block]);
    setPrintDocTitle(`تقرير_أرباح_الأصناف`);
    setPrintModalOpen(true);
  };

  // Export Invoices to Excel
  const handleExportInvoicesCsv = () => {
    if (invoiceProfitsData.length === 0) {
      alert('لا توجد بيانات للتصدير');
      return;
    }

    const headers = [
      'رقم الفاتورة',
      'التاريخ',
      'العميل',
      'طريقة الدفع',
      'عدد الأصناف',
      'إجمالي المبيعات',
      'تكلفة البضاعة (COGS)',
      'صافي الربح',
      'نسبة الربح %'
    ];

    const rows = invoiceProfitsData.map(r => [
      r.number,
      r.date,
      r.customer,
      r.paymentMethod,
      r.itemsCount,
      r.revenue,
      r.cost,
      r.profit,
      `${r.margin.toFixed(1)}%`
    ]);

    // Bottom grand total row
    rows.push([
      'إجمالي الأرباح فقط للإجمالي',
      '',
      '',
      '',
      '',
      '',
      '',
      grandTotalInvoiceProfits,
      ''
    ]);

    exportTableToCsv(`تقرير_أرباح_الفواتير_${Date.now()}.csv`, headers, rows);
  };

  // Export Items to Excel
  const handleExportItemsCsv = () => {
    if (itemProfitsData.length === 0) {
      alert('لا توجد بيانات للتصدير');
      return;
    }

    const headers = [
      'كود الصنف',
      'اسم الصنف',
      'التصنيف',
      'الوحدة',
      'الكمية المباعة',
      'متوسط سعر البيع',
      'متوسط التكلفة',
      'إجمالي المبيعات',
      'إجمالي التكلفة',
      'صافي ربح الصنف',
      'نسبة الربح %'
    ];

    const rows = itemProfitsData.map(it => [
      it.code,
      it.name,
      it.category,
      it.unit,
      it.qtySold,
      it.actualSellPrice.toFixed(2),
      it.hasVerifiedCost ? it.verifiedCostPrice.toFixed(2) : 'غير محدد',
      it.totalRevenue,
      it.totalCost,
      it.profit,
      it.hasVerifiedCost ? `${it.margin.toFixed(1)}%` : '—'
    ]);

    // Bottom grand total row
    rows.push([
      'إجمالي الأرباح فقط للإجمالي',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      grandTotalItemProfits,
      ''
    ]);

    exportTableToCsv(`تقرير_أرباح_الأصناف_${Date.now()}.csv`, headers, rows);
  };

  return (
    <div className="space-y-3.5 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-200">
        <h1 className="text-base sm:text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 shrink-0" />
          <span>قسم تحليل الأرباح (أرباح الفواتير والأصناف)</span>
        </h1>

        {/* Tab switcher */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-bold w-full sm:w-auto">
            <button
              onClick={() => setProfitTab('invoices')}
              className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                profitTab === 'invoices' ? 'bg-white text-slate-900 shadow-2xs font-black' : 'text-slate-600 hover:text-black'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>أرباح الفواتير ({invoiceProfitsData.length})</span>
            </button>
            <button
              onClick={() => setProfitTab('items')}
              className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                profitTab === 'items' ? 'bg-white text-slate-900 shadow-2xs font-black' : 'text-slate-600 hover:text-black'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>أرباح الأصناف ({itemProfitsData.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* TOP SECTION: Grand Total Profit Counter Banner (بأعلى الصفحة) */}
      <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white rounded-xl p-3 sm:p-4 shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-white/20 rounded-xl flex items-center justify-center text-white shrink-0">
              <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <span className="text-xs sm:text-sm font-black text-white block truncate">
                {profitTab === 'invoices' ? 'عداد الأرباح الإجمالية للنشاط' : 'عداد أرباح الأصناف المخرجة'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleBatchPrintItems}
            className="px-2.5 py-1.5 bg-white text-emerald-900 hover:bg-emerald-50 rounded-lg text-[11px] font-black transition-all flex items-center gap-1 shadow-xs shrink-0 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>معاينة وطباعة الأرباح</span>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="text-center bg-black/20 px-2 sm:px-3.5 py-2 rounded-xl border border-white/20">
            <span className="text-[10px] font-bold text-emerald-100 block truncate">
              {profitTab === 'invoices' ? 'ربح البضاعة' : 'ربح الأصناف'}
            </span>
            <span className="text-xs sm:text-base font-black font-mono tracking-tight text-white">
              {formatMoney(profitTab === 'invoices' ? grandTotalInvoiceProfits : adjustedGrandTotalItemProfits, db.settings.currency)}
            </span>
          </div>
          <div className="text-center bg-black/20 px-2 sm:px-3.5 py-2 rounded-xl border border-white/20">
            <span className="text-[10px] font-bold text-rose-200 block truncate">
              المصروفات
            </span>
            <span className="text-xs sm:text-base font-black font-mono tracking-tight text-rose-200">
              {formatMoney(operatingExpenses, db.settings.currency)}
            </span>
          </div>
          <div className="text-center bg-emerald-950/60 px-2 sm:px-4 py-2 rounded-xl border-2 border-emerald-300 shadow-xs">
            <span className="text-[10px] font-black text-emerald-300 block truncate">
              صافي الربح
            </span>
            <span className="text-xs sm:text-lg font-black font-mono tracking-tight text-white">
              {formatMoney((profitTab === 'invoices' ? netBusinessProfit : (adjustedGrandTotalItemProfits - operatingExpenses)), db.settings.currency)}
            </span>
          </div>
        </div>
      </div>

      {/* Branch Filter Bar (Zero Horizontal Overflow) */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center gap-2 text-xs max-w-full min-w-0">
        <span className="font-bold text-slate-700 shrink-0">الفرع:</span>
        <select
          value={selectedBranchId}
          onChange={(e) => {
            if (onSelectBranch && e.target.value !== 'all') {
              onSelectBranch(e.target.value);
            } else {
              setSelectedBranchId(e.target.value);
            }
          }}
          className="flex-1 min-w-0 max-w-full truncate bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-900 shadow-2xs focus:ring-1 focus:ring-black cursor-pointer"
        >
          <option value="all">🌐 كافة الفروع مجتمعة (مجمّع)</option>
          {branches.map(b => (
            <option key={b.id} value={b.id}>
              📍 {b.name} {b.isMain ? '(الرئيسي)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Date Filters & Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* Quick Date Filters */}
          <div className="flex flex-wrap items-center gap-1 text-xs font-bold">
            {[
              { id: 'all', label: 'الكل' },
              { id: 'today', label: 'اليوم' },
              { id: 'yesterday', label: 'أمس' },
              { id: 'week', label: 'آخر 7 أيام' },
              { id: 'month', label: 'هذا الشهر' },
              { id: 'custom', label: 'فترة مخصصة' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setDateFilter(f.id as any)}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  dateFilter === f.id
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Export Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={profitTab === 'invoices' ? handleExportInvoicesCsv : handleExportItemsCsv}
              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span>تصدير Excel</span>
            </button>

            <button
              type="button"
              onClick={profitTab === 'invoices' ? handleBatchPrintInvoices : handleBatchPrintItems}
              className="px-3 py-1.5 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>معاينة وطباعة PDF</span>
            </button>
          </div>
        </div>

        {/* Custom Date Inputs if selected */}
        {dateFilter === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-slate-500 font-bold">من تاريخ:</span>
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="px-2 py-1 bg-slate-50 border border-slate-300 rounded font-mono"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-slate-500 font-bold">إلى تاريخ:</span>
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="px-2 py-1 bg-slate-50 border border-slate-300 rounded font-mono"
              />
            </div>
          </div>
        )}

        {/* Search input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
          <input
            type="text"
            placeholder={
              profitTab === 'invoices'
                ? 'بحث برقم الفاتورة، اسم العميل، أو وسيلة الدفع...'
                : 'بحث باسم الصنف، الكود، أو التصنيف...'
            }
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pr-8 pl-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-600"
          />
        </div>
      </div>

      {/* -------------------------------------------------------------
          TAB 1: INVOICE PROFITS VIEW (Bordered Compact Table on All Screens)
      -------------------------------------------------------------- */}
      {profitTab === 'invoices' ? (
        <div className="space-y-3">
          {invoiceProfitsData.length === 0 ? (
            <div className="p-10 text-center bg-white rounded-xl border border-slate-200 shadow-2xs">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <div className="text-sm font-bold text-slate-700">لا توجد فواتير مبيعات مطابقة للفترة المحددة</div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-300 overflow-hidden shadow-2xs">
              <table className="w-full table-fixed border-collapse text-center text-[10px] sm:text-xs">
                <colgroup>
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '24%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '14%' }} />
                </colgroup>
                <thead className="bg-slate-100 border-b border-slate-300 font-black text-slate-900">
                  <tr>
                    <th className="py-2 px-1 border-l border-slate-300">الفاتورة</th>
                    <th className="py-2 px-1 border-l border-slate-300 text-right">العميل</th>
                    <th className="py-2 px-1 border-l border-slate-300">المبيعات</th>
                    <th className="py-2 px-1 border-l border-slate-300">التكلفة</th>
                    <th className="py-2 px-1 border-l border-slate-300">صافي الربح</th>
                    <th className="py-2 px-1">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {invoiceProfitsData.map(row => (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-1.5 px-1 border-l border-slate-200 font-mono">
                        <div className="font-black text-slate-950">{row.number}</div>
                        <div className="text-[9px] text-slate-500 leading-tight">{row.date.slice(5)}</div>
                      </td>
                      <td className="py-1.5 px-1 border-l border-slate-200 text-right font-bold text-slate-900 break-words">
                        <div>{row.customer}</div>
                        <div className="text-[9px] text-slate-500 font-normal">{row.paymentMethod}</div>
                      </td>
                      <td className="py-1.5 px-1 border-l border-slate-200 font-mono font-bold text-slate-950 break-words">
                        {formatCleanNumber(row.revenue)}
                      </td>
                      <td className="py-1.5 px-1 border-l border-slate-200 font-mono text-slate-700 break-words">
                        {formatCleanNumber(row.cost)}
                      </td>
                      <td className="py-1.5 px-1 border-l border-slate-200 font-mono">
                        <div className="font-black text-emerald-700">{formatCleanNumber(row.profit)}</div>
                        <div className="text-[9px] font-bold text-amber-700">{row.margin.toFixed(1)}%</div>
                      </td>
                      <td className="py-1.5 px-0.5">
                        <div className="flex flex-wrap items-center justify-center gap-0.5">
                          <button type="button" onClick={() => handlePrintSingleInvoice(row)} className="p-1 text-slate-700 hover:bg-slate-200 rounded cursor-pointer" title="طباعة أرباح الفاتورة">
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {onPreviewInvoice && (
                            <button type="button" onClick={() => onPreviewInvoice(row.invoice)} className="p-1 text-blue-600 hover:bg-blue-50 rounded cursor-pointer" title="معاينة الفاتورة">
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {onEditInvoice && (
                            <button type="button" onClick={() => onEditInvoice(row.invoice)} className="hidden sm:inline-flex p-1 text-slate-600 hover:bg-slate-200 rounded cursor-pointer" title="تعديل">
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDeleteSales && (
                            <button type="button" onClick={() => handleDeleteInvoice(row.invoice)} className="hidden sm:inline-flex p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer" title="حذف">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* -------------------------------------------------------------
            TAB 2: PRODUCT / ITEM PROFITS VIEW (Image 2 Crisp Bordered Table)
        -------------------------------------------------------------- */
        <div className="space-y-3">
          {itemProfitsData.length === 0 ? (
            <div className="p-10 text-center bg-white rounded-xl border border-slate-200 shadow-2xs">
              <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <div className="text-sm font-bold text-slate-700">لا توجد حركات بيع أصناف مطابقة للبحث أو الفترة</div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-300 overflow-hidden shadow-2xs">
              <table className="w-full table-fixed border-collapse text-center text-[10px] sm:text-xs">
                <colgroup>
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '16%' }} />
                </colgroup>
                <thead className="bg-slate-100 border-b border-slate-300 font-black text-slate-900">
                  <tr>
                    <th className="py-2 px-1 border-l border-slate-300 text-right">اسم الصنف</th>
                    <th className="py-2 px-1 border-l border-slate-300 leading-tight">الكمية المخرجة</th>
                    <th className="py-2 px-1 border-l border-slate-300 leading-tight">سعر الشراء</th>
                    <th className="py-2 px-1 border-l border-slate-300 leading-tight">سعر البيع</th>
                    <th className="py-2 px-1 border-l border-slate-300 leading-tight">الربح الصافي</th>
                    <th className="py-2 px-1 leading-tight">إجمالي الربح للصنف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {itemProfitsData.map(it => (
                    <tr key={it.productId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-1.5 px-1.5 border-l border-slate-200 text-right font-bold text-slate-900 break-words leading-snug">
                        {it.name}
                      </td>
                      <td className="py-1.5 px-1 border-l border-slate-200 font-mono font-bold text-slate-900">
                        {formatCleanNumber(it.qtySold)}
                      </td>
                      <td className="py-1.5 px-1 border-l border-slate-200 font-mono text-slate-700">
                        {it.hasVerifiedCost ? formatCleanNumber(it.verifiedCostPrice) : '—'}
                      </td>
                      <td className="py-1.5 px-1 border-l border-slate-200 font-mono font-bold text-slate-950">
                        {formatCleanNumber(it.actualSellPrice)}
                      </td>
                      <td className="py-1.5 px-1 border-l border-slate-200 font-mono font-bold text-emerald-700">
                        {it.hasVerifiedCost ? formatCleanNumber(it.unitNetProfit) : '—'}
                      </td>
                      <td className="py-1.5 px-1 font-mono font-black text-emerald-700">
                        {it.hasVerifiedCost ? formatCleanNumber(it.profit) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
