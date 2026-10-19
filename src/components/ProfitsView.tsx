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
  deleteInvoiceAndRevert
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
}

export const ProfitsView: React.FC<ProfitsViewProps> = ({
  db,
  onUpdateDb,
  onPreviewInvoice,
  onEditInvoice,
  activeBranchId
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

  // 1. INVOICE PROFITS CALCULATION
  const invoiceProfitsData = useMemo(() => {
    const sales = db.invoices.filter(i => i.type === 'sale' && isDateMatch(i.date) && isTargetBranch(i.branchId));

    return sales.map(inv => {
      // Calculate COGS for this invoice using branch pricing
      const invBranch = inv.branchId || 'br_main';
      let invoiceCost = 0;
      inv.items.forEach(it => {
        const prod = db.products.find(p => p.id === it.productId);
        const branchProd = prod ? getProductForBranch(prod, invBranch) : null;
        const costPrice = it.costPrice || branchProd?.buyPrice || 0;
        invoiceCost += it.qty * costPrice;
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
        margin
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

  // Grand Total of Invoice Profits (ONLY Grand Total of Profits at bottom as requested!)
  const grandTotalInvoiceProfits = useMemo(() => {
    return invoiceProfitsData.reduce((sum, row) => sum + row.profit, 0);
  }, [invoiceProfitsData]);

  // 2. PRODUCT PROFITS CALCULATION
  const itemProfitsData = useMemo(() => {
    const sales = db.invoices.filter(i => i.type === 'sale' && isDateMatch(i.date) && isTargetBranch(i.branchId));

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
    }>();

    sales.forEach(inv => {
      const invBranch = inv.branchId || 'br_main';
      inv.items.forEach(it => {
        const prod = db.products.find(p => p.id === it.productId);
        const branchProd = prod ? getProductForBranch(prod, invBranch) : null;
        const costPrice = it.costPrice || branchProd?.buyPrice || 0;
        const itemRev = it.total;
        const itemCost = it.qty * costPrice;

        if (!map.has(it.productId)) {
          map.set(it.productId, {
            product: prod,
            productId: it.productId,
            code: it.productCode || prod?.code || '—',
            name: it.productName || prod?.name || 'صنف',
            category: prod?.category || 'عام',
            unit: it.unit || prod?.unit || 'قطعة',
            qtySold: 0,
            totalRevenue: 0,
            totalCost: 0
          });
        }

        const entry = map.get(it.productId)!;
        entry.qtySold += it.qty;
        entry.totalRevenue += itemRev;
        entry.totalCost += itemCost;
      });
    });

    const list = Array.from(map.values()).map(item => {
      const profit = item.totalRevenue - item.totalCost;
      const margin = item.totalRevenue > 0 ? (profit / item.totalRevenue) * 100 : 0;
      const avgSellPrice = item.qtySold > 0 ? item.totalRevenue / item.qtySold : 0;
      const avgCostPrice = item.qtySold > 0 ? item.totalCost / item.qtySold : 0;

      return {
        ...item,
        avgSellPrice,
        avgCostPrice,
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
  }, [db, dateFilter, fromDate, toDate, searchQuery]);

  // Grand Total of Item Profits (ONLY Grand Total of Profits at bottom as requested!)
  const grandTotalItemProfits = useMemo(() => {
    return itemProfitsData.reduce((sum, row) => sum + row.profit, 0);
  }, [itemProfitsData]);

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
      time: row.time,
      partyLabel: 'العميل:',
      partyName: row.customer,
      partySubId: `وسيلة الدفع: ${row.paymentMethod}`,
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
        const prod = db.products.find(p => p.id === it.productId);
        const cost = it.costPrice || prod?.buyPrice || 0;
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

  // Batch Print all product profits
  const handleBatchPrintItems = () => {
    if (itemProfitsData.length === 0) {
      alert('لا توجد أصناف للطباعة');
      return;
    }

    const block: MovementPrintBlock = {
      title: 'تقرير أرباح الأصناف المبيعة',
      serialNo: `#ITEMS-${Date.now().toString().slice(-4)}`,
      date: today,
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      partyLabel: 'النطاق الزمني:',
      partyName: dateFilter === 'all' ? 'جميع الفترات' : `من ${fromDate || today} إلى ${toDate || today}`,
      partySubId: `إجمالي الأصناف: ${itemProfitsData.length}`,
      badge: 'تقرير معتمد',
      typeTitle: 'أرباح ومبيعات الأصناف',
      tableHeaders: [
        { label: 'كود الصنف', width: '12%', align: 'right' },
        { label: 'اسم الصنف', width: '30%', align: 'right' },
        { label: 'الكمية', width: '10%', align: 'center' },
        { label: 'إجمالي المبيعات', width: '16%', align: 'center' },
        { label: 'إجمالي التكلفة', width: '16%', align: 'center' },
        { label: 'صافي الربح', width: '16%', align: 'center' }
      ],
      tableRows: itemProfitsData.map(it => ({
        cols: [
          it.code,
          it.name,
          formatCleanNumber(it.qtySold),
          formatCleanNumber(it.totalRevenue),
          formatCleanNumber(it.totalCost),
          formatCleanNumber(it.profit)
        ],
        isBold: false
      })),
      summaryLines: [
        { label: 'إجمالي أرباح الأصناف بالكامل', value: `${formatCleanNumber(grandTotalItemProfits)} ${db.settings.currency}`, isTotal: true }
      ],
      footerNotes: 'تم احتساب تكلفة الأصناف بدقة بناءً على أسعار الشراء المسجلة بالنظام.',
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
      it.avgSellPrice.toFixed(2),
      it.avgCostPrice.toFixed(2),
      it.totalRevenue,
      it.totalCost,
      it.profit,
      `${it.margin.toFixed(1)}%`
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
    <div className="space-y-4 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-blue-600" />
            <span>قسم تحليل الأرباح (أرباح الفواتير والأصناف)</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            عرض الأرباح التفصيلية لكل فاتورة وكل صنف مبيوع، مع إجمالي الأرباح الصافي في الأسفل
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-bold">
            <button
              onClick={() => setProfitTab('invoices')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                profitTab === 'invoices' ? 'bg-white text-slate-900 shadow-2xs font-black' : 'text-slate-600 hover:text-black'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>أرباح الفواتير ({invoiceProfitsData.length})</span>
            </button>
            <button
              onClick={() => setProfitTab('items')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                profitTab === 'items' ? 'bg-white text-slate-900 shadow-2xs font-black' : 'text-slate-600 hover:text-black'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>أرباح الأصناف ({itemProfitsData.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Branch Isolation Filter Bar */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-700">تحليل أرباح فرع:</span>
          <select
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-900 shadow-2xs focus:ring-1 focus:ring-black cursor-pointer"
          >
            <option value="all">🌐 كافة الفروع مجتمعة (مجمّع)</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>
                📍 {b.name} {b.isMain ? '(الرئيسي)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="text-[11px] text-slate-500 font-medium">
          يتم احتساب تكلفة البضاعة وهوامش الربح وفقاً لأسعار وتكاليف كل فرع بشكل مستقل تماماً
        </div>
      </div>

      {/* Date Filters & Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* Quick Date Filters */}
          <div className="flex items-center gap-1 overflow-x-auto text-xs font-bold">
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={profitTab === 'invoices' ? handleExportInvoicesCsv : handleExportItemsCsv}
              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
              title="تصدير جدول الأرباح الحالي إلى Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span>تصدير Excel</span>
            </button>

            <button
              type="button"
              onClick={profitTab === 'invoices' ? handleBatchPrintInvoices : handleBatchPrintItems}
              className="px-3 py-1.5 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
              title="طباعة وتصدير جماعي للتقرير في PDF بتنسيق رسمي"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة وتصدير جماعي PDF</span>
            </button>
          </div>
        </div>

        {/* Custom Date Inputs if selected */}
        {dateFilter === 'custom' && (
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 text-xs">
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
          TAB 1: INVOICE PROFITS VIEW
      -------------------------------------------------------------- */}
      {profitTab === 'invoices' ? (
        <div className="space-y-4">
          {invoiceProfitsData.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-2xs">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <div className="text-sm font-bold text-slate-700">لا توجد فواتير مبيعات مطابقة للفترة المحددة</div>
              <div className="text-xs text-slate-400 mt-1">قم بتغيير نطاق التاريخ أو إصدار فواتير مبيعات جديدة</div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Responsive Cards / Table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 font-black text-slate-700">
                      <tr>
                        <th className="p-2.5">رقم الفاتورة</th>
                        <th className="p-2.5">التاريخ</th>
                        <th className="p-2.5">العميل</th>
                        <th className="p-2.5">طريقة الدفع</th>
                        <th className="p-2.5 text-center">المبيعات</th>
                        <th className="p-2.5 text-center">التكلفة (COGS)</th>
                        <th className="p-2.5 text-center">صافي الربح</th>
                        <th className="p-2.5 text-center">نسبة الربح %</th>
                        <th className="p-2.5 text-center">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {invoiceProfitsData.map(row => (
                        <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-2.5 font-bold font-mono text-slate-950">
                            {row.number}
                          </td>
                          <td className="p-2.5 font-mono text-slate-600">
                            {row.date}
                          </td>
                          <td className="p-2.5 font-bold text-slate-900">
                            {row.customer}
                          </td>
                          <td className="p-2.5 text-slate-600">
                            <span className="px-2 py-0.5 bg-slate-100 rounded text-[11px]">
                              {row.paymentMethod}
                            </span>
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-slate-950">
                            {formatMoney(row.revenue, db.settings.currency)}
                          </td>
                          <td className="p-2.5 text-center font-mono text-slate-600">
                            {formatMoney(row.cost, db.settings.currency)}
                          </td>
                          <td className="p-2.5 text-center font-mono font-black text-emerald-700">
                            {formatMoney(row.profit, db.settings.currency)}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-amber-700">
                            {row.margin.toFixed(1)}%
                          </td>
                          <td className="p-2.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handlePrintSingleInvoice(row)}
                                className="p-1 text-slate-600 hover:text-black hover:bg-slate-100 rounded cursor-pointer"
                                title="طباعة وتحميل تفاصيل ربح الفاتورة"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              {onPreviewInvoice && (
                                <button
                                  type="button"
                                  onClick={() => onPreviewInvoice(row.invoice)}
                                  className="p-1 text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
                                  title="معاينة الفاتورة الأصلية"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {onEditInvoice && (
                                <button
                                  type="button"
                                  onClick={() => onEditInvoice(row.invoice)}
                                  className="p-1 text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded cursor-pointer"
                                  title="تعديل الفاتورة"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {canDeleteSales && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteInvoice(row.invoice)}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                                  title="حذف الفاتورة"
                                >
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
              </div>

              {/* BOTTOM SECTION: ONLY Grand Total of Profits (كما طلب المستخدم تماماً) */}
              <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white rounded-xl p-4 shadow-md flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white shrink-0">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-emerald-100 block">
                      إجمالي الأرباح لجميع الفواتير المعروضة:
                    </span>
                    <span className="text-xs text-white/80">
                      محسوبة بدقة من صافي مبيعات الفواتير بعد خصم تكلفة البضاعة المباعة
                    </span>
                  </div>
                </div>

                <div className="text-center sm:text-left bg-black/20 px-5 py-2.5 rounded-xl border border-white/20 shrink-0">
                  <span className="text-[11px] font-bold text-emerald-200 block">
                    إجمالي الأرباح فقط للاجمالي:
                  </span>
                  <span className="text-xl sm:text-2xl font-black font-mono tracking-tight text-white">
                    {formatMoney(grandTotalInvoiceProfits, db.settings.currency)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* -------------------------------------------------------------
            TAB 2: PRODUCT / ITEM PROFITS VIEW
        -------------------------------------------------------------- */
        <div className="space-y-4">
          {itemProfitsData.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-2xs">
              <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <div className="text-sm font-bold text-slate-700">لا توجد حركات بيع أصناف مطابقة للبحث أو الفترة</div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 font-black text-slate-700">
                      <tr>
                        <th className="p-2.5">كود الصنف</th>
                        <th className="p-2.5">اسم الصنف</th>
                        <th className="p-2.5">التصنيف</th>
                        <th className="p-2.5 text-center">الكمية المباعة</th>
                        <th className="p-2.5 text-center">متوسط التكلفة</th>
                        <th className="p-2.5 text-center">متوسط سعر البيع</th>
                        <th className="p-2.5 text-center">إجمالي المبيعات</th>
                        <th className="p-2.5 text-center">إجمالي التكلفة</th>
                        <th className="p-2.5 text-center">إجمالي ربح الصنف</th>
                        <th className="p-2.5 text-center">نسبة الربح %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {itemProfitsData.map(it => (
                        <tr key={it.productId} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-2.5 font-bold font-mono text-slate-600">
                            {it.code}
                          </td>
                          <td className="p-2.5 font-bold text-slate-900">
                            {it.name}
                          </td>
                          <td className="p-2.5 text-slate-500">
                            {it.category}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-slate-900">
                            {it.qtySold} {it.unit}
                          </td>
                          <td className="p-2.5 text-center font-mono text-slate-600">
                            {formatMoney(it.avgCostPrice, db.settings.currency)}
                          </td>
                          <td className="p-2.5 text-center font-mono text-slate-900">
                            {formatMoney(it.avgSellPrice, db.settings.currency)}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-slate-950">
                            {formatMoney(it.totalRevenue, db.settings.currency)}
                          </td>
                          <td className="p-2.5 text-center font-mono text-slate-600">
                            {formatMoney(it.totalCost, db.settings.currency)}
                          </td>
                          <td className="p-2.5 text-center font-mono font-black text-emerald-700">
                            {formatMoney(it.profit, db.settings.currency)}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-amber-700">
                            {it.margin.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* BOTTOM SECTION: ONLY Grand Total of Profits (كما طلب المستخدم تماماً) */}
              <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white rounded-xl p-4 shadow-md flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white shrink-0">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-emerald-100 block">
                      إجمالي الأرباح لجميع الأصناف المباعة:
                    </span>
                    <span className="text-xs text-white/80">
                      محسوبة تلقائياً من فروق أسعار الشراء والبيع لجميع أصناف الفواتير
                    </span>
                  </div>
                </div>

                <div className="text-center sm:text-left bg-black/20 px-5 py-2.5 rounded-xl border border-white/20 shrink-0">
                  <span className="text-[11px] font-bold text-emerald-200 block">
                    إجمالي الأرباح فقط للاجمالي:
                  </span>
                  <span className="text-xl sm:text-2xl font-black font-mono tracking-tight text-white">
                    {formatMoney(grandTotalItemProfits, db.settings.currency)}
                  </span>
                </div>
              </div>
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
