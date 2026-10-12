import React, { useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Printer,
  Download,
  Calendar,
  FileSpreadsheet,
  Package,
  Users,
  Building,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import {
  AccountingDB
} from '../types/accounting';
import {
  formatMoney,
  calculateFinancialSummary,
  calculateCustomerBalance,
  calculateSupplierBalance,
  calculateTreasuryBalance
} from '../services/accountingStorage';
import {
  UniversalPrintModal,
  MovementPrintBlock,
  formatCleanNumber
} from './UniversalPrintModal';
import { exportTableToCsv } from '../services/exportService';

interface ReportsViewProps {
  db: AccountingDB;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ db }) => {
  const [activeReportTab, setActiveReportTab] = useState<
    'income' | 'sales' | 'purchases' | 'inventory' | 'receivables' | 'payables'
  >('income');

  // Universal print modal state
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printDocuments, setPrintDocuments] = useState<MovementPrintBlock[]>([]);
  const [printDocTitle, setPrintDocTitle] = useState('تقرير مالي');

  const summary = calculateFinancialSummary(db);

  // Generate structured report blocks for UniversalPrintModal
  const generateReportBlocks = (): { title: string; docs: MovementPrintBlock[] } => {
    const today = new Date().toISOString().slice(0, 10);
    const curr = db.settings.currency;

    if (activeReportTab === 'income') {
      const doc: MovementPrintBlock = {
        title: 'قائمة الدخل الشاملة (الأرباح والخسائر)',
        serialNo: `#INC-${today}`,
        date: today,
        partyLabel: 'المنشأة:',
        partyName: db.settings.company,
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
        footerNotes: 'تم استخراج قائمة الدخل تلقائياً من واقع قيود اليومية وحركات البيع والشراء والمصروفات'
      };
      return { title: 'قائمة الدخل والأرباح', docs: [doc] };
    }

    if (activeReportTab === 'sales') {
      const sales = db.invoices.filter(i => i.type === 'sale');
      const totalPaid = sales.reduce((s, i) => s + i.paid, 0);
      const totalRem = sales.reduce((s, i) => s + i.remaining, 0);

      const doc: MovementPrintBlock = {
        title: 'تقرير المبيعات والتحصيلات الشامل',
        serialNo: `#SAL-${today}`,
        date: today,
        partyLabel: 'إجمالي الفواتير:',
        partyName: `${sales.length} فاتورة مسجلة`,
        badge: 'مبيعات',
        tableHeaders: [
          { label: 'رقم الفاتورة', width: '18%', align: 'center' },
          { label: 'التاريخ', width: '14%', align: 'center' },
          { label: 'العميل', width: '26%', align: 'right' },
          { label: 'الإجمالي', width: '14%', align: 'center' },
          { label: 'المحصل', width: '14%', align: 'center' },
          { label: 'المتبقي', width: '14%', align: 'center' }
        ],
        tableRows: sales.map(s => ({
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
        footerNotes: 'تقرير شامل بكافة فواتير المبيعات الصادرة والتحصيلات والمستحقات الآجلة'
      };
      return { title: 'تقرير المبيعات والتحصيلات', docs: [doc] };
    }

    if (activeReportTab === 'purchases') {
      const purchases = db.invoices.filter(i => i.type === 'purchase');
      const totalPaid = purchases.reduce((s, i) => s + i.paid, 0);
      const totalRem = purchases.reduce((s, i) => s + i.remaining, 0);

      const doc: MovementPrintBlock = {
        title: 'تقرير المشتريات وتوريد البضائع',
        serialNo: `#PUR-${today}`,
        date: today,
        partyLabel: 'إجمالي الفواتير:',
        partyName: `${purchases.length} فاتورة شراء`,
        badge: 'مشتريات',
        tableHeaders: [
          { label: 'رقم الفاتورة', width: '18%', align: 'center' },
          { label: 'التاريخ', width: '14%', align: 'center' },
          { label: 'المورد', width: '26%', align: 'right' },
          { label: 'الإجمالي', width: '14%', align: 'center' },
          { label: 'المدفوع', width: '14%', align: 'center' },
          { label: 'المستحق', width: '14%', align: 'center' }
        ],
        tableRows: purchases.map(p => ({
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
        footerNotes: 'تقرير شامل بكافة فواتير المشتريات وتوريدات البضاعة والمستحقات'
      };
      return { title: 'تقرير المشتريات والتوريدات', docs: [doc] };
    }

    if (activeReportTab === 'inventory') {
      const totalSell = db.products.reduce((s, p) => s + (p.currentQty * p.sellPrice), 0);

      const doc: MovementPrintBlock = {
        title: 'تقرير جرد وتقييم المخزون',
        serialNo: `#INV-VAL-${today}`,
        date: today,
        partyLabel: 'عدد الأصناف:',
        partyName: `${db.products.length} صنف مسجل`,
        badge: 'تقييم مخزون',
        tableHeaders: [
          { label: 'الكود', width: '14%', align: 'center' },
          { label: 'اسم الصنف', width: '32%', align: 'right' },
          { label: 'الرصيد', width: '14%', align: 'center' },
          { label: 'التكلفة', width: '14%', align: 'center' },
          { label: 'إجمالي التكلفة', width: '14%', align: 'center' },
          { label: 'قيمة البيع', width: '12%', align: 'center' }
        ],
        tableRows: db.products.map(p => {
          const cost = p.avgCost || p.buyPrice;
          return {
            cols: [
              p.code,
              p.name,
              `${p.currentQty} ${p.unit}`,
              formatMoney(cost, curr),
              formatMoney(p.currentQty * cost, curr),
              formatMoney(p.currentQty * p.sellPrice, curr)
            ]
          };
        }),
        summaryLines: [
          { label: 'إجمالي قيمة المخزون بسعر التكلفة', value: formatMoney(summary.totalStockValue, curr) },
          { label: 'إجمالي القيمة التقديرية بسعر البيع', value: formatMoney(totalSell, curr) },
          { label: 'الربح المتوقع للمخزون الحالي', value: formatMoney(totalSell - summary.totalStockValue, curr), isTotal: true, highlight: true }
        ],
        footerNotes: 'تقرير تقييم أصول المخزون وفقاً لمتوسط التكلفة المرجح وأسعار البيع المعتمدة'
      };
      return { title: 'تقرير تقييم المخزون', docs: [doc] };
    }

    if (activeReportTab === 'receivables') {
      const doc: MovementPrintBlock = {
        title: 'تقرير أعمار ديون العملاء (ذمم مدينة)',
        serialNo: `#REC-${today}`,
        date: today,
        partyLabel: 'عدد العملاء:',
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
          const bal = calculateCustomerBalance(db, c.id);
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
        footerNotes: 'تقرير أرصدة ومطالبات العملاء المستحقة للتحصيل الفوري'
      };
      return { title: 'ديون العملاء (ذمم مدينة)', docs: [doc] };
    }

    // Payables
    const doc: MovementPrintBlock = {
      title: 'تقرير مستحقات الموردين (ذمم دائنة)',
      serialNo: `#PAY-${today}`,
      date: today,
      partyLabel: 'عدد الموردين:',
      partyName: `${db.suppliers.length} مورد`,
      badge: 'مستحقات موردين',
      tableHeaders: [
        { label: 'الكود', width: '15%', align: 'center' },
        { label: 'اسم المورد', width: '35%', align: 'right' },
        { label: 'الهاتف', width: '25%', align: 'center' },
        { label: 'المستحق دفعه للمورد', width: '25%', align: 'center' }
      ],
      tableRows: db.suppliers.map(s => {
        const bal = calculateSupplierBalance(db, s.id);
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
        { label: 'إجمالي مستحقات الموردين الواجبة السداد', value: formatMoney(summary.totalSupplierPayables, curr), isTotal: true, highlight: true }
      ],
      footerNotes: 'تقرير التزامات المنشأة للموردين الواجبة السداد'
    };
    return { title: 'مستحقات الموردين (ذمم دائنة)', docs: [doc] };
  };

  const handleOpenPrintModal = () => {
    const { title, docs } = generateReportBlocks();
    setPrintDocTitle(title);
    setPrintDocuments(docs);
    setPrintModalOpen(true);
  };

  const handleExportExcel = () => {
    const { title, docs } = generateReportBlocks();
    if (docs.length === 0) return;
    const doc = docs[0];
    const headers = doc.tableHeaders.map(th => th.label);
    const rows = doc.tableRows.map(tr => tr.cols);
    exportTableToCsv(`${activeReportTab}_report_${Date.now()}.csv`, headers, rows);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6" />
            <span>التقارير المالية والتحليل المحاسبي</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            قوائم الدخل، الأرباح والخسائر، حركة المبيعات والمشتريات، وتقييم أصول المخزون
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
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
            onClick={handleOpenPrintModal}
            className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
            title="معاينة وطباعة التقرير بدقة متناهية (A4، A5، حراري، PDF)"
          >
            <Printer className="w-4 h-4" />
            <span>معاينة وطباعة التقرير (A4 / A5 / حراري / PDF)</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-200 pb-2">
        {[
          { id: 'income', label: 'قائمة الدخل والأرباح', icon: DollarSign },
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
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
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
      {/* 1. INCOME STATEMENT (قائمة الدخل والأرباح) */}
      {activeReportTab === 'income' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs max-w-3xl space-y-4">
          <div className="text-center border-b border-slate-200 pb-3">
            <h2 className="text-base font-black text-slate-900">{db.settings.company}</h2>
            <div className="text-xs font-bold text-slate-600 mt-0.5">قائمة الدخل الشاملة (الأرباح والخسائر)</div>
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
              <span className="text-xs font-bold text-slate-600 block mb-1">إجمالي المبيعات</span>
              <span className="text-lg font-black font-mono text-slate-950">{formatMoney(summary.totalSalesAll, db.settings.currency)}</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-bold text-slate-600 block mb-1">المحصل نقدياً وإلكترونياً</span>
              <span className="text-lg font-black font-mono text-emerald-700">
                {formatMoney(db.invoices.filter(i => i.type === 'sale').reduce((s, i) => s + i.paid, 0), db.settings.currency)}
              </span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-bold text-slate-600 block mb-1">المتبقي آجل</span>
              <span className="text-lg font-black font-mono text-rose-700">{formatMoney(summary.totalCustomerReceivables, db.settings.currency)}</span>
            </div>
          </div>

          {/* Sales Report Responsive Cards System (No Horizontal Scroll) */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {db.invoices.filter(i => i.type === 'sale').map(inv => (
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
              <span className="text-xs font-bold text-slate-600 block mb-1">إجمالي المشتريات</span>
              <span className="text-lg font-black font-mono text-slate-950">{formatMoney(summary.totalPurchasesAll, db.settings.currency)}</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-bold text-slate-600 block mb-1">المسدد للموردين</span>
              <span className="text-lg font-black font-mono text-emerald-700">
                {formatMoney(db.invoices.filter(i => i.type === 'purchase').reduce((s, i) => s + i.paid, 0), db.settings.currency)}
              </span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-bold text-slate-600 block mb-1">المتبقي دين للموردين</span>
              <span className="text-lg font-black font-mono text-rose-700">{formatMoney(summary.totalSupplierPayables, db.settings.currency)}</span>
            </div>
          </div>

          {/* Purchases Report Responsive Cards System */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {db.invoices.filter(i => i.type === 'purchase').map(inv => (
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
              <span className="text-xs font-bold text-slate-600">إجمالي قيمة المخزون بسعر التكلفة:</span>
              <div className="text-xl font-black font-mono text-slate-950 mt-1">
                {formatMoney(summary.totalStockValue, db.settings.currency)}
              </div>
            </div>
            <div>
              <span className="text-xs font-bold text-slate-600">إجمالي القيمة التقديرية بسعر البيع:</span>
              <div className="text-xl font-black font-mono text-emerald-700 mt-1">
                {formatMoney(db.products.reduce((s, p) => s + (p.currentQty * p.sellPrice), 0), db.settings.currency)}
              </div>
            </div>
          </div>

          {/* Inventory Valuation Cards System */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {db.products.map(p => {
              const cost = p.avgCost || p.buyPrice;
              const totalCost = p.currentQty * cost;
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
                      <span className="text-[10px] text-slate-500 block font-sans">تكلفة الوحدة:</span>
                      <span className="font-bold">{formatMoney(cost, db.settings.currency)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block font-sans">سعر البيع:</span>
                      <span className="font-bold">{formatMoney(p.sellPrice, db.settings.currency)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block font-sans">إجمالي التكلفة:</span>
                      <span className="font-bold text-slate-950">{formatMoney(totalCost, db.settings.currency)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block font-sans">الربح المتوقع:</span>
                      <span className="font-bold text-emerald-700">+{formatMoney(profit, db.settings.currency)}</span>
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
            const bal = calculateCustomerBalance(db, c.id);
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
            const bal = calculateSupplierBalance(db, s.id);

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
      />
    </div>
  );
};
