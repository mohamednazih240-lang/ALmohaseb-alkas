import React, { useState } from 'react';
import {
  ShoppingBag,
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  Calendar,
  X,
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

interface PurchasesViewProps {
  db: AccountingDB;
  onUpdateDb: (updated: AccountingDB) => void;
  onPreviewInvoice: (invoice: Invoice) => void;
  onOpenPartyModal: (type: 'customer' | 'supplier') => void;
}

export const PurchasesView: React.FC<PurchasesViewProps> = ({
  db,
  onUpdateDb,
  onPreviewInvoice,
  onOpenPartyModal
}) => {
  const [activeTab, setActiveTab] = useState<'editor' | 'list'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'مدفوع' | 'جزئي' | 'آجل'>('all');
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);

  // Mobile back button: If inside purchase invoice editor, phone back button exits editor to list
  useModalBackHandler(
    activeTab === 'editor',
    () => {
      setEditingInvoice(null);
      setActiveTab('list');
    },
    'purchases_editor'
  );

  // Filter purchase invoices
  const purchaseInvoices = db.invoices
    .filter(inv => inv.type === 'purchase')
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
  const totalPurchases = db.invoices
    .filter(i => i.type === 'purchase')
    .reduce((s, i) => s + i.total, 0);

  const totalPaid = db.invoices
    .filter(i => i.type === 'purchase')
    .reduce((s, i) => s + i.paid, 0);

  const totalDue = totalPurchases - totalPaid;

  const handleDeleteInvoice = (inv: Invoice) => {
    if (!confirm(`هل أنت متأكد من حذف فاتورة الشراء "${inv.number}"؟ سيتم عكس كميات المخزون والمصروفات والقيود المحاسبية.`)) {
      return;
    }

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;

    // 1. Revert stock
    inv.items.forEach(oldItem => {
      const prod = updated.products.find(p => p.id === oldItem.productId);
      if (prod) {
        prod.currentQty = Math.max(0, prod.currentQty - oldItem.qty);
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

    logAudit(updated, 'حذف فاتورة شراء', `تم حذف فاتورة الشراء ${inv.number} وعكس أثرها`);

    onUpdateDb(updated);
  };

  // If in Editor Mode: render invoice editor cleanly with zero top space
  if (activeTab === 'editor') {
    return (
      <div className="w-full transition-all">
        <UnifiedInvoicePage
          mode="purchase"
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

  return (
    <div className="space-y-4 pb-12">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-600 text-white rounded-lg shadow-2xs">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
              إدارة فواتير المشتريات وتوريد البضائع
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">
              نظام الكروت السريع بدون أي تمرير أفقي
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setEditingInvoice(null);
            setActiveTab('editor');
          }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>+ إنشاء فاتورة شراء جديدة</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 block mb-0.5">إجمالي المشتريات</span>
          <span className="text-base sm:text-lg font-black font-mono text-slate-950">
            {formatMoney(totalPurchases, db.settings.currency)}
          </span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 block mb-0.5">المدفوع للموردين</span>
          <span className="text-base sm:text-lg font-black font-mono text-emerald-700">
            {formatMoney(totalPaid, db.settings.currency)}
          </span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 block mb-0.5">المستحق للموردين (آجل)</span>
          <span className="text-base sm:text-lg font-black font-mono text-rose-700">
            {formatMoney(totalDue, db.settings.currency)}
          </span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 block mb-0.5">عدد فواتير التوريد</span>
          <span className="text-base sm:text-lg font-black font-mono text-slate-950">
            {purchaseInvoices.length} <span className="text-xs font-normal text-slate-500">فاتورة</span>
          </span>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          <input
            type="text"
            placeholder="بحث برقم الفاتورة، اسم المورد..."
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

      {/* Purchases Invoices: Responsive Card System (No Horizontal Scroll) */}
      {purchaseInvoices.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-2xs">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <div className="text-sm font-bold text-slate-700">لا توجد فواتير شراء مطابقة للبحث</div>
          <button
            onClick={() => {
              setEditingInvoice(null);
              setActiveTab('editor');
            }}
            className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>إنشاء أول فاتورة شراء</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {purchaseInvoices.map(inv => (
            <div
              key={inv.id}
              className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between p-3.5"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                <div>
                  <span className="font-mono font-black text-sm text-slate-900 block">
                    {inv.number}
                  </span>
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

              {/* Card Body */}
              <div className="py-2.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">المورد:</span>
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
                    <span className="text-[10px] text-slate-500 block">المستحق</span>
                    <span className={`text-xs font-black font-mono ${inv.remaining > 0 ? 'text-rose-700' : 'text-slate-700'}`}>
                      {formatMoney(inv.remaining, db.settings.currency)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400 font-medium">
                  {inv.items.length} أصناف موردة
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
          ))}
        </div>
      )}
    </div>
  );
};
