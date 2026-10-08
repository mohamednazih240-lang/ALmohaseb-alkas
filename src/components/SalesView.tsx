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
  List
} from 'lucide-react';
import {
  AccountingDB,
  Invoice
} from '../types/accounting';
import { formatMoney, logAudit } from '../services/accountingStorage';
import { UnifiedInvoicePage } from './UnifiedInvoicePage';
import { useModalBackHandler } from '../hooks/useModalBackHandler';

interface SalesViewProps {
  db: AccountingDB;
  onUpdateDb: (updated: AccountingDB) => void;
  onPreviewInvoice: (invoice: Invoice) => void;
  onOpenPartyModal: (type: 'customer' | 'supplier') => void;
}

export const SalesView: React.FC<SalesViewProps> = ({
  db,
  onUpdateDb,
  onPreviewInvoice,
  onOpenPartyModal
}) => {
  const [activeTab, setActiveTab] = useState<'editor' | 'list'>('list');
  const [salesMode, setSalesMode] = useState<'sale' | 'wholesale'>('sale');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'مدفوع' | 'جزئي' | 'آجل'>('all');
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);

  // Mobile back button: If inside invoice editor, phone back button exits editor to list
  useModalBackHandler(
    activeTab === 'editor',
    () => {
      setEditingInvoice(null);
      setActiveTab('list');
    },
    'sales_editor'
  );

  // Filter sales invoices
  const salesInvoices = db.invoices
    .filter(inv => inv.type === 'sale')
    .filter(inv => {
      const matchSearch =
        inv.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.partyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.notes?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'all' || inv.status === statusFilter;
      return matchSearch && matchStatus;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Statistics
  const totalSales = db.invoices
    .filter(i => i.type === 'sale')
    .reduce((s, i) => s + i.total, 0);

  const totalCollected = db.invoices
    .filter(i => i.type === 'sale')
    .reduce((s, i) => s + i.paid, 0);

  const totalPending = totalSales - totalCollected;

  const handleDeleteInvoice = (inv: Invoice) => {
    if (!confirm(`هل أنت متأكد من حذف فاتورة البيع "${inv.number}"؟ سيتم عكس المخزون والقيود المحاسبية بالكامل.`)) {
      return;
    }

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;

    // 1. Revert stock
    inv.items.forEach(oldItem => {
      const prod = updated.products.find(p => p.id === oldItem.productId);
      if (prod) {
        prod.currentQty += oldItem.qty;
      }
    });

    // 2. Remove stock movements
    updated.stockMovements = updated.stockMovements.filter(sm => sm.sourceId !== inv.id);

    // 3. Remove treasury entries
    updated.treasury = updated.treasury.filter(tr => tr.sourceId !== inv.id);

    // 4. Remove journal entry
    updated.journals = updated.journals.filter(j => j.sourceId !== inv.id);

    // 5. Remove invoice
    updated.invoices = updated.invoices.filter(i => i.id !== inv.id);

    logAudit(updated, 'حذف فاتورة بيع', `تم حذف الفاتورة ${inv.number} وعكس جميع حركاتها المحاسبية`);

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditingInvoice(null);
              setSalesMode('wholesale');
              setActiveTab('editor');
            }}
            className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
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

      {/* Search & Filter Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          <input
            type="text"
            placeholder="بحث برقم الفاتورة، اسم العميل، أو ملاحظة..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pr-9 pl-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-hidden focus:border-black"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {(['all', 'مدفوع', 'جزئي', 'آجل'] as const).map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                statusFilter === st
                  ? 'bg-black text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {st === 'all' ? 'جميع الفواتير' : st}
            </button>
          ))}
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

                {/* Card Footer: Items count and Actions */}
                <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400 font-medium">
                    {inv.items.length} صنف مسجل
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onPreviewInvoice(inv)}
                      className="px-2.5 py-1 text-slate-700 hover:text-black hover:bg-slate-100 rounded-md text-xs font-bold transition-all flex items-center gap-1"
                      title="عرض وطباعة الفاتورة"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>معاينة</span>
                    </button>

                    <button
                      onClick={() => {
                        setEditingInvoice(inv);
                        setSalesMode(inv.invoiceKind === 'wholesale' ? 'wholesale' : 'sale');
                        setActiveTab('editor');
                      }}
                      className="p-1.5 text-slate-600 hover:text-black hover:bg-slate-100 rounded-md transition-colors"
                      title="تعديل الفاتورة في المحرر"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleDeleteInvoice(inv)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                      title="حذف الفاتورة وعكس القيود"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
