import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Package,
  Users,
  Building,
  DollarSign,
  AlertTriangle,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
  CreditCard,
  ShoppingCart,
  ShoppingBag,
  FileText,
  Boxes,
  Eye,
  Printer,
  ChevronLeft
} from 'lucide-react';
import { 
  AccountingDB, 
  Invoice, 
  Product 
} from '../types/accounting';
import { PageId } from './Sidebar';
import { 
  formatMoney, 
  calculateFinancialSummary, 
  calculateTreasuryBalance, 
  calculateCustomerBalance, 
  calculateSupplierBalance 
} from '../services/accountingStorage';

interface DashboardViewProps {
  db: AccountingDB;
  onNavigate: (page: PageId) => void;
  onOpenInvoiceModal: (type: 'sale' | 'purchase') => void;
  onOpenVoucherModal: (type: 'receipt' | 'payment') => void;
  onOpenProductModal: (product?: Product) => void;
  onOpenPartyModal: (type: 'customer' | 'supplier') => void;
  onPreviewInvoice: (invoice: Invoice) => void;
  onOpenCashMoveModal: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  db,
  onNavigate,
  onOpenInvoiceModal,
  onOpenVoucherModal,
  onOpenProductModal,
  onOpenPartyModal,
  onPreviewInvoice,
  onOpenCashMoveModal
}) => {
  const summary = calculateFinancialSummary(db);

  // 7-day Sales & Purchases chart data
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const isoDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayLabel = d.toLocaleDateString('ar-EG', { weekday: 'short' });

    const daySales = db.invoices
      .filter(inv => inv.type === 'sale' && inv.date === isoDate)
      .reduce((sum, inv) => sum + inv.total, 0);

    const dayPurchases = db.invoices
      .filter(inv => inv.type === 'purchase' && inv.date === isoDate)
      .reduce((sum, inv) => sum + inv.total, 0);

    return {
      date: isoDate,
      label: dayLabel,
      sales: daySales,
      purchases: dayPurchases
    };
  });

  const maxVal = Math.max(1, ...last7Days.map(d => Math.max(d.sales, d.purchases)));

  // Critical Low stock products
  const lowStockProducts = db.products
    .filter(p => p.minStock > 0 && p.currentQty <= p.minStock)
    .slice(0, 5);

  // Recent invoices
  const recentInvoices = [...db.invoices]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 6);

  // Treasury by channels
  const channels = [
    { name: 'نقدي', balance: calculateTreasuryBalance(db, 'نقدي') },
    { name: 'فودافون كاش', balance: calculateTreasuryBalance(db, 'Vodafone Cash') },
    { name: 'إنستاباي', balance: calculateTreasuryBalance(db, 'InstaPay') },
    { name: 'فيزا POS', balance: calculateTreasuryBalance(db, 'Visa / POS') },
    { name: 'تحويل بنكي', balance: calculateTreasuryBalance(db, 'تحويل بنكي') }
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Top Welcome & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            لوحة المؤشرات والرقابة المالية
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            متابعة حية وشاملة للمبيعات والمشتريات وأرصدة الخزائن والمخزون بنظام القيد المزدوج
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onOpenInvoiceModal('sale')}
            className="px-3.5 py-2 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>+ فاتورة بيع فورية</span>
          </button>
          <button
            onClick={() => onOpenInvoiceModal('purchase')}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>+ فاتورة شراء</span>
          </button>
        </div>
      </div>

      {/* 1. TOP SECTION: Quick Operations Launchpad (الكروت السريعة بالواجهة الرئيسية بالأعلى) */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border-2 border-slate-200 shadow-xs">
        <div className="flex items-center justify-between mb-3.5">
          <div>
            <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>مركز العمليات والإجراءات السريعة</span>
            </h2>
            <p className="text-[11px] text-slate-500">
              تنفيذ القيود والفواتير والسندات المحاسبية مباشرة بنقرة زر واحدة
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          {/* Card 1: Sale */}
          <button
            onClick={() => onOpenInvoiceModal('sale')}
            className="flex flex-col items-center justify-center p-3 rounded-xl border border-slate-200 hover:border-black hover:bg-slate-50 text-slate-900 transition-all text-center group cursor-pointer shadow-2xs hover:shadow-xs"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white flex items-center justify-center mb-1.5 transition-colors">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-slate-900">فاتورة بيع</span>
            <span className="text-[10px] text-slate-400">إيراد ومخزن</span>
          </button>

          {/* Card 2: Purchase */}
          <button
            onClick={() => onOpenInvoiceModal('purchase')}
            className="flex flex-col items-center justify-center p-3 rounded-xl border border-slate-200 hover:border-black hover:bg-slate-50 text-slate-900 transition-all text-center group cursor-pointer shadow-2xs hover:shadow-xs"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 group-hover:bg-blue-600 group-hover:text-white flex items-center justify-center mb-1.5 transition-colors">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-slate-900">فاتورة شراء</span>
            <span className="text-[10px] text-slate-400">توريد وتكلفة</span>
          </button>

          {/* Card 3: Receipt */}
          <button
            onClick={() => onOpenVoucherModal('receipt')}
            className="flex flex-col items-center justify-center p-3 rounded-xl border border-slate-200 hover:border-black hover:bg-slate-50 text-slate-900 transition-all text-center group cursor-pointer shadow-2xs hover:shadow-xs"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white flex items-center justify-center mb-1.5 transition-colors">
              <Receipt className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-slate-900">سند قبض</span>
            <span className="text-[10px] text-slate-400">تحصيل عميل</span>
          </button>

          {/* Card 4: Payment */}
          <button
            onClick={() => onOpenVoucherModal('payment')}
            className="flex flex-col items-center justify-center p-3 rounded-xl border border-slate-200 hover:border-black hover:bg-slate-50 text-slate-900 transition-all text-center group cursor-pointer shadow-2xs hover:shadow-xs"
          >
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 group-hover:bg-rose-600 group-hover:text-white flex items-center justify-center mb-1.5 transition-colors">
              <CreditCard className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-slate-900">سند صرف</span>
            <span className="text-[10px] text-slate-400">سداد مورد</span>
          </button>

          {/* Card 5: Add Product */}
          <button
            onClick={() => onOpenProductModal()}
            className="flex flex-col items-center justify-center p-3 rounded-xl border border-slate-200 hover:border-black hover:bg-slate-50 text-slate-900 transition-all text-center group cursor-pointer shadow-2xs hover:shadow-xs"
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white flex items-center justify-center mb-1.5 transition-colors">
              <Package className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-slate-900">صنف جديد</span>
            <span className="text-[10px] text-slate-400">باركود وتسعير</span>
          </button>

          {/* Card 6: Add Customer */}
          <button
            onClick={() => onOpenPartyModal('customer')}
            className="flex flex-col items-center justify-center p-3 rounded-xl border border-slate-200 hover:border-black hover:bg-slate-50 text-slate-900 transition-all text-center group cursor-pointer shadow-2xs hover:shadow-xs"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 group-hover:bg-amber-600 group-hover:text-white flex items-center justify-center mb-1.5 transition-colors">
              <Users className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-slate-900">عميل جديد</span>
            <span className="text-[10px] text-slate-400">بيانات وائتمان</span>
          </button>

          {/* Card 7: Treasury Movement */}
          <button
            onClick={onOpenCashMoveModal}
            className="flex flex-col items-center justify-center p-3 rounded-xl border border-slate-200 hover:border-black hover:bg-slate-50 text-slate-900 transition-all text-center group cursor-pointer shadow-2xs hover:shadow-xs"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 group-hover:bg-purple-600 group-hover:text-white flex items-center justify-center mb-1.5 transition-colors">
              <Wallet className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-slate-900">حركة خزينة</span>
            <span className="text-[10px] text-slate-400">إيداع / سحب</span>
          </button>

          {/* Card 8: Physical Inventory */}
          <button
            onClick={() => onNavigate('inventory')}
            className="flex flex-col items-center justify-center p-3 rounded-xl border border-slate-200 hover:border-black hover:bg-slate-50 text-slate-900 transition-all text-center group cursor-pointer shadow-2xs hover:shadow-xs"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-800 group-hover:bg-black group-hover:text-white flex items-center justify-center mb-1.5 transition-colors">
              <Boxes className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-slate-900">تسوية جرد</span>
            <span className="text-[10px] text-slate-400">مطابقة الفعلي</span>
          </button>
        </div>
      </div>

      {/* 2. Executive KPI Cards (تحت الكروت السريعة) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {/* KPI 1: Sales Today */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold text-slate-700">مبيعات اليوم</span>
            <div className="p-1.5 bg-slate-100 text-slate-900 rounded-md">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg sm:text-xl font-black text-slate-950 font-mono tracking-tight">
            {formatMoney(summary.salesToday, db.settings.currency)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-1.5">
            <span>إجمالي المبيعات:</span>
            <span className="font-bold text-slate-800 font-mono">{formatMoney(summary.totalSalesAll, db.settings.currency)}</span>
          </div>
        </div>

        {/* KPI 2: Purchases Today */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold text-slate-700">مشتريات اليوم</span>
            <div className="p-1.5 bg-slate-100 text-slate-900 rounded-md">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg sm:text-xl font-black text-slate-950 font-mono tracking-tight">
            {formatMoney(summary.purchasesToday, db.settings.currency)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-1.5">
            <span>إجمالي المشتريات:</span>
            <span className="font-bold text-slate-800 font-mono">{formatMoney(summary.totalPurchasesAll, db.settings.currency)}</span>
          </div>
        </div>

        {/* KPI 3: Treasury Cash & Electronic */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold text-slate-700">السيولة النقدية والخزائن</span>
            <div className="p-1.5 bg-slate-100 text-slate-900 rounded-md">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg sm:text-xl font-black text-slate-950 font-mono tracking-tight">
            {formatMoney(summary.totalTreasury, db.settings.currency)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-1.5">
            <span>النقد السائل الفعلي:</span>
            <span className="font-bold text-emerald-700 font-mono">
              {formatMoney(calculateTreasuryBalance(db, 'نقدي'), db.settings.currency)}
            </span>
          </div>
        </div>

        {/* KPI 4: Inventory Valuation */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold text-slate-700">قيمة المخزون (بالتكلفة)</span>
            <div className="p-1.5 bg-slate-100 text-slate-900 rounded-md">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg sm:text-xl font-black text-slate-950 font-mono tracking-tight">
            {formatMoney(summary.totalStockValue, db.settings.currency)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-1.5">
            <span>عدد الأصناف المسجلة:</span>
            <span className="font-bold text-slate-800">{summary.totalProductsCount} صنف</span>
          </div>
        </div>

        {/* KPI 5: Customer Receivables */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold text-slate-700">ديون العملاء (ذمم مدينة)</span>
            <div className="p-1.5 bg-slate-100 text-slate-900 rounded-md">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg sm:text-xl font-black text-slate-950 font-mono tracking-tight text-amber-700">
            {formatMoney(summary.totalCustomerReceivables, db.settings.currency)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-1.5">
            <span>مستحقات للتحصيل:</span>
            <span className="font-bold text-slate-700">{db.customers.length} عميل</span>
          </div>
        </div>

        {/* KPI 6: Supplier Payables */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold text-slate-700">مستحقات الموردين (ذمم دائنة)</span>
            <div className="p-1.5 bg-slate-100 text-slate-900 rounded-md">
              <Building className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg sm:text-xl font-black text-slate-950 font-mono tracking-tight text-rose-700">
            {formatMoney(summary.totalSupplierPayables, db.settings.currency)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-1.5">
            <span>مطلوب سدادها:</span>
            <span className="font-bold text-slate-700">{db.suppliers.length} مورد</span>
          </div>
        </div>

        {/* KPI 7: Net Profit */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold text-slate-700">صافي الأرباح المحققة</span>
            <div className="p-1.5 bg-slate-100 text-slate-900 rounded-md">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-lg sm:text-xl font-black font-mono tracking-tight ${summary.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {formatMoney(summary.netProfit, db.settings.currency)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-1.5">
            <span>مجمل ربح المبيعات:</span>
            <span className="font-bold text-slate-800 font-mono">{formatMoney(summary.grossProfit, db.settings.currency)}</span>
          </div>
        </div>

        {/* KPI 8: Low Stock Alert */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold text-slate-700">تنبيهات نواقص المخزون</span>
            <div className="p-1.5 bg-amber-50 text-amber-700 rounded-md border border-amber-200">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg sm:text-xl font-black text-slate-950 font-mono tracking-tight">
            {summary.lowStockCount} <span className="text-xs font-bold text-slate-500">أصناف حرجة</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-1.5">
            <span>الحالة العامة:</span>
            <span className={`font-bold ${summary.lowStockCount > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
              {summary.lowStockCount > 0 ? 'تحتاج طلب شراء' : 'المخزون مستقر'}
            </span>
          </div>
        </div>
      </div>

      {/* Middle Grid: 7-day Bar Chart & Treasury Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 7-day sales and purchases chart */}
        <div className="lg:col-span-2 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-black text-slate-900">
                مقارنة المبيعات والمشتريات خلال آخر 7 أيام
              </h2>
              <p className="text-[11px] text-slate-500">
                متابعة حركة النشاط التجاري وتدفق البضائع اليومي
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-bold">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-slate-950"></span>
                <span className="text-slate-700">المبيعات</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-slate-300"></span>
                <span className="text-slate-500">المشتريات</span>
              </div>
            </div>
          </div>

          <div className="h-52 flex items-end justify-between gap-3 pt-6 pb-2 px-2 border-b border-slate-100">
            {last7Days.map((day, idx) => {
              const salesHeight = Math.max(8, (day.sales / maxVal) * 160);
              const purchasesHeight = Math.max(8, (day.purchases / maxVal) * 160);
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 group">
                  <div className="w-full flex items-end justify-center gap-1 h-44">
                    {/* Sales bar */}
                    <div
                      style={{ height: `${salesHeight}px` }}
                      className="w-1/2 max-w-[20px] bg-slate-950 rounded-t-xs transition-all group-hover:bg-black relative"
                      title={`مبيعات: ${formatMoney(day.sales, db.settings.currency)}`}
                    ></div>
                    {/* Purchases bar */}
                    <div
                      style={{ height: `${purchasesHeight}px` }}
                      className="w-1/2 max-w-[20px] bg-slate-300 rounded-t-xs transition-all group-hover:bg-slate-400 relative"
                      title={`مشتريات: ${formatMoney(day.purchases, db.settings.currency)}`}
                    ></div>
                  </div>
                  <div className="text-[11px] font-bold text-slate-700 mt-1">
                    {day.label}
                  </div>
                  <div className="text-[9px] text-slate-400 font-mono">
                    {day.date.slice(5)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>ملاحظة: البيانات تتحدث فورياً مع كل فاتورة مسجلة</span>
            <button
              onClick={() => onNavigate('reports')}
              className="font-bold text-black hover:underline flex items-center gap-1"
            >
              <span>عرض تفاصيل التقارير المالية</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Treasury balances per method */}
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-black text-slate-900">
                أرصدة قنوات الدفع والخزينة
              </h2>
              <button
                onClick={() => onNavigate('treasury')}
                className="text-xs text-black font-bold hover:underline"
              >
                إدارة
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mb-4">
              الرصيد الفعلي المتوفر في كل حساب وطريقة دفع
            </p>

            <div className="space-y-2.5">
              {channels.map((ch, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-100"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-slate-900"></div>
                    <span className="text-xs font-bold text-slate-800">{ch.name}</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-950">
                    {formatMoney(ch.balance, db.settings.currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 mt-4 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">إجمالي الأرصدة النقدية:</span>
            <span className="text-sm font-black font-mono text-slate-950">
              {formatMoney(summary.totalTreasury, db.settings.currency)}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Row: Low Stock Alerts & Recent Invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Low Stock Alerts */}
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-black text-slate-900">
                تنبيهات نواقص المخزون
              </h2>
            </div>
            <button
              onClick={() => onNavigate('products')}
              className="text-xs text-black font-bold hover:underline"
            >
              عرض الكل ({summary.lowStockCount})
            </button>
          </div>

          {lowStockProducts.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
              <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <div className="text-xs font-bold text-slate-700">لا توجد نواقص حرجة حالياً</div>
              <div className="text-[11px] text-slate-400">جميع الأصناف تتجاوز الحد الأدنى للطلب</div>
            </div>
          ) : (
            <div className="space-y-2">
              {lowStockProducts.map(p => (
                <div
                  key={p.id}
                  className="p-3 bg-amber-50/50 rounded-lg border border-amber-200 flex items-center justify-between"
                >
                  <div>
                    <div className="text-xs font-bold text-slate-900">{p.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                      كود: {p.code} | الحد الأدنى: {p.minStock} {p.unit}
                    </div>
                  </div>
                  <div className="text-left">
                    <span className="inline-block px-2 py-0.5 bg-amber-100 text-amber-900 font-mono font-bold text-xs rounded border border-amber-300">
                      متبقي {p.currentQty} {p.unit}
                    </span>
                    <button
                      onClick={() => onOpenInvoiceModal('purchase')}
                      className="block mt-1 text-[10px] text-black font-bold hover:underline"
                    >
                      طلب شراء +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Invoices Card System (No Horizontal Scroll) */}
        <div className="lg:col-span-2 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-black text-slate-900">
                أحدث الفواتير والحركات التجارية
              </h2>
              <p className="text-[11px] text-slate-500">
                سجل آخر الفواتير المنشأة للمبيعات والمشتريات
              </p>
            </div>
            <button
              onClick={() => onNavigate('sales')}
              className="text-xs text-black font-bold hover:underline"
            >
              كل فواتير البيع
            </button>
          </div>

          {recentInvoices.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              لا توجد فواتير مسجلة حتى الآن
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {recentInvoices.map(inv => {
                const isSale = inv.type === 'sale';
                return (
                  <div
                    key={inv.id}
                    onClick={() => onPreviewInvoice(inv)}
                    className="p-3 rounded-lg border border-slate-200 hover:border-black/30 hover:shadow-2xs transition-all cursor-pointer bg-slate-50/50 flex flex-col justify-between space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-xs text-slate-900">
                          {inv.number}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          isSale ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-800'
                        }`}>
                          {isSale ? 'بيع' : 'شراء'}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {inv.date}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800 truncate max-w-[140px]">
                        {inv.partyName || (isSale ? 'عميل نقدي' : 'مورد عام')}
                      </span>
                      <span className="font-mono font-black text-slate-950">
                        {formatMoney(inv.total, db.settings.currency)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[11px]">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        inv.status === 'مدفوع' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                        inv.status === 'جزئي' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                        'bg-rose-50 text-rose-800 border border-rose-200'
                      }`}>
                        {inv.status}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onPreviewInvoice(inv);
                        }}
                        className="text-slate-600 hover:text-black font-medium inline-flex items-center gap-1 text-[11px]"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>معاينة</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
