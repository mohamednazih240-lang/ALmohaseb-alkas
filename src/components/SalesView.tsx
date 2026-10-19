import React, { useState } from 'react';
import {
  ShoppingCart,
  Boxes,
  Plus,
  Search,
  Filter,
  Eye,
  Edit,
  Trash2,
  Printer,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Clock,
  X,
  PlusCircle,
  FileText,
  Receipt,
  List,
  ArrowUpDown,
  Download,
  FileSpreadsheet,
  ShieldCheck,
  History
} from 'lucide-react';
import {
  AccountingDB,
  Invoice
} from '../types/accounting';
import { formatMoney, logAudit, deleteInvoiceAndRevert } from '../services/accountingStorage';
import { UnifiedInvoicePage } from './UnifiedInvoicePage';
import { InvoiceAuditLogModal } from './InvoiceAuditLogModal';
import { useModalBackHandler } from '../hooks/useModalBackHandler';
import {
  UniversalPrintModal,
  MovementPrintBlock,
  formatCleanNumber
} from './UniversalPrintModal';
import { exportTableToCsv } from '../services/exportService';

interface SalesViewProps {
  db: AccountingDB;
  onUpdateDb: (updated: AccountingDB) => void;
  onPreviewInvoice: (invoice: Invoice) => void;
  onOpenPartyModal: (type: 'customer' | 'supplier') => void;
  activeBranchId?: string;
  initialEditingInvoice?: Invoice | null;
  initialTab?: 'editor' | 'list';
}

export const SalesView: React.FC<SalesViewProps> = ({
  db,
  onUpdateDb,
  onPreviewInvoice,
  onOpenPartyModal,
  activeBranchId,
  initialEditingInvoice = null,
  initialTab = 'list'
}) => {
  const branches = db.branches || [{ id: 'br_main', name: 'الفرع الرئيسي', code: 'BR-01', isMain: true }];
  const targetBranchId = activeBranchId || branches[0]?.id || 'br_main';
  const currentBranch = branches.find(b => b.id === targetBranchId) || branches[0];
  const [branchFilter, setBranchFilter] = useState<'current' | 'all'>('current');

  const [activeTab, setActiveTab] = useState<'editor' | 'list'>(initialTab);
  const [salesMode, setSalesMode] = useState<'sale' | 'wholesale'>('sale');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'مدفوع' | 'جزئي' | 'آجل'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'month'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'highest' | 'lowest'>('newest');
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(initialEditingInvoice);

  React.useEffect(() => {
    if (initialEditingInvoice) {
      setEditingInvoice(initialEditingInvoice);
      setActiveTab('editor');
    }
  }, [initialEditingInvoice]);

  // Permissions checks
  const userPerms = db.currentUser?.permissions;
  const isManager = db.currentUser?.role === 'مدير';
  const canCreateSales = userPerms ? userPerms.canCreateSales !== false : true;
  const canEditSales = userPerms ? userPerms.canEditSales !== false : true;
  const canDeleteSales = userPerms ? userPerms.canDeleteSales !== false : isManager;
  const canPrintSales = userPerms ? userPerms.canPrintSales !== false : true;

  // Print modal state for batch & single invoice
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printDocuments, setPrintDocuments] = useState<MovementPrintBlock[]>([]);
  const [printDocTitle, setPrintDocTitle] = useState('فواتير المبيعات');
  const [selectedAuditInvoice, setSelectedAuditInvoice] = useState<Invoice | null>(null);

  // Mobile back button: If inside invoice editor, phone back button exits editor to list
  useModalBackHandler(
    activeTab === 'editor',
    () => {
      setEditingInvoice(null);
      setActiveTab('list');
    },
    'sales_editor'
  );

  // Filter sales invoices for active branch
  const todayStr = new Date().toISOString().slice(0, 10);
  const currentMonthStr = todayStr.slice(0, 7);

  const salesInvoices = db.invoices
    .filter(inv => inv.type === 'sale')
    .filter(inv => {
      const matchBranch = branchFilter === 'all' || (inv.branchId === targetBranchId || (!inv.branchId && targetBranchId === 'br_main'));
      if (!matchBranch) return false;

      const s = searchTerm.trim().toLowerCase();
      const matchSearch = !s ||
        inv.number.toLowerCase().includes(s) ||
        inv.partyName.toLowerCase().includes(s) ||
        (inv.notes && inv.notes.toLowerCase().includes(s)) ||
        inv.items.some(it => it.productName.toLowerCase().includes(s));

      const matchStatus = statusFilter === 'all' || inv.status === statusFilter;

      let matchDate = true;
      if (dateFilter === 'today') matchDate = inv.date === todayStr;
      else if (dateFilter === 'month') matchDate = inv.date.startsWith(currentMonthStr);

      return matchSearch && matchStatus && matchDate;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.date).getTime() - new Date(a.date).getTime();
      if (sortBy === 'oldest') return new Date(a.date).getTime() - new Date(b.date).getTime();
      if (sortBy === 'highest') return b.total - a.total;
      if (sortBy === 'lowest') return a.total - b.total;
      return 0;
    });

  // Statistics for this branch
  const branchSales = db.invoices
    .filter(i => i.type === 'sale')
    .filter(i => branchFilter === 'all' || (i.branchId === targetBranchId || (!i.branchId && targetBranchId === 'br_main')));

  const totalSales = branchSales.reduce((s, i) => s + i.total, 0);
  const totalCollected = branchSales.reduce((s, i) => s + i.paid, 0);
  const totalPending = totalSales - totalCollected;

  // Print all filtered sales invoices in approved design
  const handlePrintBatch = () => {
    if (salesInvoices.length === 0) {
      alert('لا توجد فواتير مبيعات للطباعة!');
      return;
    }

    const docs: MovementPrintBlock[] = salesInvoices.map(inv => ({
      title: inv.invoiceKind === 'wholesale' ? 'فاتورة مبيعات جملة' : 'فاتورة مبيعات',
      serialNo: inv.number,
      date: inv.date,
      time: inv.time,
      partyLabel: 'العميل:',
      partyName: inv.partyName,
      partySubId: inv.partyPhone,
      badge: inv.status,
      tableHeaders: [
        { label: 'م', width: '6%', align: 'center' },
        { label: 'الصنف', width: '40%', align: 'right' },
        { label: 'الكمية', width: '14%', align: 'center' },
        { label: 'السعر', width: '20%', align: 'center' },
        { label: 'الإجمالي', width: '20%', align: 'center' }
      ],
      tableRows: inv.items.map((it, idx) => ({
        cols: [
          idx + 1,
          it.productName,
          `${it.qty} ${it.unit || ''}`,
          formatMoney(it.unitPrice, db.settings.currency),
          formatMoney(it.total, db.settings.currency)
        ]
      })),
      summaryLines: [
        { label: 'إجمالي المبيعات', value: formatMoney(inv.subtotal || inv.total, db.settings.currency) },
        inv.discount ? { label: 'الخصم', value: formatMoney(inv.discount, db.settings.currency) } : null,
        inv.tax ? { label: 'ضريبة القيمة المضافة', value: formatMoney(inv.tax, db.settings.currency) } : null,
        { label: 'الصافي النهائي', value: formatMoney(inv.total, db.settings.currency), isTotal: true },
        { label: 'المحصل نقدياً', value: formatMoney(inv.paid, db.settings.currency) },
        { label: 'المتبقي آجل', value: formatMoney(inv.remaining, db.settings.currency), highlight: inv.remaining > 0 }
      ].filter(Boolean) as any[],
      footerNotes: inv.notes || 'شكراً لتعاملكم معنا'
    }));

    setPrintDocuments(docs);
    setPrintDocTitle(`فواتير المبيعات المحددة (${salesInvoices.length} فاتورة)`);
    setPrintModalOpen(true);
  };

  // Export CSV
  const handleExportCsv = () => {
    if (salesInvoices.length === 0) {
      alert('لا توجد فواتير مبيعات للتصدير!');
      return;
    }

    const headers = ['رقم الفاتورة', 'النوع', 'التاريخ', 'العميل', 'طريقة السداد', 'عدد الأصناف', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة'];
    const rows = salesInvoices.map(inv => [
      inv.number,
      inv.invoiceKind === 'wholesale' ? 'جملة' : 'قطاعي',
      inv.date,
      inv.partyName,
      inv.paymentMethod,
      inv.items.length,
      inv.total,
      inv.paid,
      inv.remaining,
      inv.status
    ]);

    exportTableToCsv(`sales_invoices_${Date.now()}.csv`, headers, rows);
  };

  const handleDeleteInvoice = (inv: Invoice) => {
    if (!canDeleteSales) {
      alert('عذراً، ليس لديك صلاحية لحذف فواتير المبيعات.');
      return;
    }

    if (!confirm(`هل أنت متأكد من حذف فاتورة البيع "${inv.number}"؟\nسيتم عكس كميات المخزون بالكامل وإعادتها، وعكس الخزينة والأرصدة والقيود المحاسبية.`)) {
      return;
    }

    const updated = deleteInvoiceAndRevert(db, inv);
    onUpdateDb(updated);
  };

  // If in Editor Mode: render the invoice page cleanly without redundant top spacing or banners
  if (activeTab === 'editor') {
    return (
      <div className="w-full transition-all">
        <UnifiedInvoicePage
          mode={salesMode}
          db={db}
          onUpdateDb={onUpdateDb}
          onPreviewInvoice={onPreviewInvoice}
          editingInvoice={editingInvoice}
          activeBranchId={targetBranchId}
          onClose={() => {
            setEditingInvoice(null);
            setActiveTab('list');
          }}
          onCloseEdit={() => {
            setEditingInvoice(null);
            setActiveTab('list');
          }}
        />
      </div>
    );
  }

  // When in Archive / List Mode: Modern responsive Card System with zero horizontal scroll
  return (
    <div className="space-y-4 pb-12">
      {/* Top Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-emerald-600 text-white rounded-lg shadow-2xs">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
              إدارة نقاط البيع وفواتير المبيعات
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">
              البيع السريع ونظام الكروت المباشر بدون أي تمرير أفقي
            </p>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            title="تصدير جدول المبيعات بصيغة Excel"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            <span>Excel</span>
          </button>

          {canPrintSales && (
            <button
              type="button"
              onClick={handlePrintBatch}
              className="px-3 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="طباعة وتصدير جميع فواتير المبيعات المحددة PDF وورقياً"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة وتصدير PDF ({salesInvoices.length})</span>
            </button>
          )}

          {canCreateSales && (
            <>
              <button
                onClick={() => {
                  setEditingInvoice(null);
                  setSalesMode('wholesale');
                  setActiveTab('editor');
                }}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Boxes className="w-4 h-4" />
                <span>+ فاتورة جملة</span>
              </button>

              <button
                onClick={() => {
                  setEditingInvoice(null);
                  setSalesMode('sale');
                  setActiveTab('editor');
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ إنشاء فاتورة بيع جديدة</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Branch Isolation Filter Bar */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-700">عرض فواتير المبيعات:</span>
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setBranchFilter('current')}
              className={`px-3 py-1 rounded-md font-bold text-xs transition-all ${
                branchFilter === 'current'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              فرع: {currentBranch.name} (المستقل)
            </button>
            <button
              type="button"
              onClick={() => setBranchFilter('all')}
              className={`px-3 py-1 rounded-md font-bold text-xs transition-all ${
                branchFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              كافة الفروع ({branches.length})
            </button>
          </div>
        </div>
        <div className="text-[11px] text-slate-500 font-medium">
          {branchFilter === 'current' ? `كل حركة وأموال ومخزون لفرع "${currentBranch.name}" معزولة بذاتها` : 'عرض مجمع لجميع فروع المنشأة'}
        </div>
      </div>

      {/* KPI Cards for Sales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 block mb-0.5">إجمالي المبيعات</span>
          <span className="text-base sm:text-lg font-black font-mono text-slate-950">
            {formatMoney(totalSales, db.settings.currency)}
          </span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 block mb-0.5">المحصل نقدياً</span>
          <span className="text-base sm:text-lg font-black font-mono text-emerald-700">
            {formatMoney(totalCollected, db.settings.currency)}
          </span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 block mb-0.5">المتبقي آجل</span>
          <span className="text-base sm:text-lg font-black font-mono text-rose-700">
            {formatMoney(totalPending, db.settings.currency)}
          </span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 block mb-0.5">عدد الفواتير</span>
          <span className="text-base sm:text-lg font-black font-mono text-slate-950">
            {salesInvoices.length} <span className="text-xs font-normal text-slate-500">فاتورة</span>
          </span>
        </div>
      </div>

      {/* Dynamic Search & Advanced Filter Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2.5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              placeholder="بحث ديناميكي برقم الفاتورة، اسم العميل، الصنف، أو ملاحظة..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pr-9 pl-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-hidden focus:border-black focus:bg-white transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl self-start sm:self-auto">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer"
            >
              <option value="newest">الأحدث تاريخاً</option>
              <option value="oldest">الأقدم تاريخاً</option>
              <option value="highest">الأعلى قيمة</option>
              <option value="lowest">الأقل قيمة</option>
            </select>
          </div>
        </div>

        {/* Filter Badges & Date Range */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-[11px] font-bold text-slate-500 ml-1">الحالة:</span>
            {(['all', 'مدفوع', 'جزئي', 'آجل'] as const).map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                  statusFilter === st
                    ? 'bg-black text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {st === 'all' ? 'جميع الفواتير' : st}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 text-xs font-bold">
            <span className="text-[11px] font-bold text-slate-500 ml-1">الفترة:</span>
            <button
              onClick={() => setDateFilter('all')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${dateFilter === 'all' ? 'bg-slate-200 text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}
            >
              الكل
            </button>
            <button
              onClick={() => setDateFilter('today')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${dateFilter === 'today' ? 'bg-slate-200 text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}
            >
              اليوم
            </button>
            <button
              onClick={() => setDateFilter('month')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${dateFilter === 'month' ? 'bg-slate-200 text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}
            >
              هذا الشهر
            </button>
          </div>
        </div>
      </div>

      {/* Sales Invoices: High-Density Responsive Card System (No Horizontal Scroll) */}
      {salesInvoices.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-2xs">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <div className="text-sm font-bold text-slate-700">لا توجد فواتير مبيعات مسجلة تطابق البحث</div>
          <button
            onClick={() => {
              setEditingInvoice(null);
              setSalesMode('sale');
              setActiveTab('editor');
            }}
            className="mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>إنشاء أول فاتورة مبيعات</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {salesInvoices.map(inv => {
            const isWholesale = inv.invoiceKind === 'wholesale';
            return (
              <div
                key={inv.id}
                className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between p-3.5"
              >
                {/* Card Header: Number, Date, Status */}
                <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-black text-sm text-slate-900">
                        {inv.number}
                      </span>
                      {isWholesale && (
                        <span className="px-1.5 py-0.2 bg-amber-100 text-amber-900 text-[9px] font-bold rounded">
                          جملة
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span>{inv.date}</span>
                      {inv.time && <span>• {inv.time}</span>}
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                      inv.status === 'مدفوع'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : inv.status === 'جزئي'
                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                        : 'bg-rose-50 text-rose-800 border-rose-300'
                    }`}
                  >
                    {inv.status}
                  </span>
                </div>

                {/* Card Body: Customer & Financial details */}
                <div className="py-2.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">العميل:</span>
                    <span className="font-bold text-slate-900 max-w-[180px] truncate">
                      {inv.partyName}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">طريقة السداد:</span>
                    <span className="px-2 py-0.5 bg-slate-100 rounded text-[11px] font-medium text-slate-800">
                      {inv.paymentMethod}
                    </span>
                  </div>

                  {inv.notes && (
                    <div className="text-[11px] text-slate-500 bg-slate-50 p-1.5 rounded truncate">
                      {inv.notes}
                    </div>
                  )}

                  {/* Financial Grid */}
                  <div className="bg-slate-50 rounded-lg p-2 grid grid-cols-3 gap-2 text-center border border-slate-100">
                    <div>
                      <span className="text-[10px] text-slate-500 block">الإجمالي</span>
                      <span className="text-xs font-black font-mono text-slate-950">
                        {formatMoney(inv.total, db.settings.currency)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">المدفوع</span>
                      <span className="text-xs font-black font-mono text-emerald-700">
                        {formatMoney(inv.paid, db.settings.currency)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">المتبقي</span>
                      <span className={`text-xs font-black font-mono ${inv.remaining > 0 ? 'text-rose-700' : 'text-slate-700'}`}>
                        {formatMoney(inv.remaining, db.settings.currency)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Footer: Items count, Creator User, and Actions */}
                <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-slate-500 font-medium">
                      {inv.items.length} أصناف
                    </span>
                    {inv.createdBy && (
                      <span className="text-[10px] bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded font-bold border border-emerald-200" title="منشئ الفاتورة">
                        المنشئ: {inv.createdBy}
                      </span>
                    )}
                    {inv.updatedBy && (
                      <span className="text-[10px] bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded font-bold border border-amber-200" title="آخر من قام بتعديل الفاتورة">
                        عُدلت: {inv.updatedBy}
                      </span>
                    )}
                    {inv.branchName && (
                      <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold border border-blue-200">
                        الفرع: {inv.branchName}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedAuditInvoice(inv)}
                      className="px-2 py-1 text-blue-700 hover:text-blue-900 hover:bg-blue-50 rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      title="عرض سجل الرقابة والتدقيق وتاريخ التعديلات"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                      <span className="hidden xs:inline">التدقيق</span>
                    </button>

                    <button
                      onClick={() => onPreviewInvoice(inv)}
                      className="px-2.5 py-1 text-slate-700 hover:text-black hover:bg-slate-100 rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      title="عرض وطباعة الفاتورة"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>معاينة</span>
                    </button>

                    {canEditSales && (
                      <button
                        onClick={() => {
                          setEditingInvoice(inv);
                          setSalesMode(inv.invoiceKind === 'wholesale' ? 'wholesale' : 'sale');
                          setActiveTab('editor');
                        }}
                        className="p-1.5 text-slate-600 hover:text-black hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                        title="تعديل الفاتورة في المحرر"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {canDeleteSales && (
                      <button
                        onClick={() => handleDeleteInvoice(inv)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                        title="حذف الفاتورة وعكس القيود"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Universal Print Modal for Sales */}
      <UniversalPrintModal
        isOpen={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        documentTitle={printDocTitle}
        documents={printDocuments}
        settings={db.settings}
      />

      {/* Invoice Audit Log Modal */}
      {selectedAuditInvoice && (
        <InvoiceAuditLogModal
          invoice={selectedAuditInvoice}
          isOpen={!!selectedAuditInvoice}
          onClose={() => setSelectedAuditInvoice(null)}
          currency={db.settings.currency}
        />
      )}
    </div>
  );
};
