import React, { useState } from 'react';
import {
  RotateCcw,
  Plus,
  Trash2,
  Calendar,
  X,
  FileText,
  Receipt,
  List
} from 'lucide-react';
import {
  AccountingDB,
  ReturnInvoice,
  Invoice
} from '../types/accounting';
import { formatMoney, logAudit } from '../services/accountingStorage';
import { UnifiedInvoicePage } from './UnifiedInvoicePage';
import { useModalBackHandler } from '../hooks/useModalBackHandler';

interface ReturnsViewProps {
  db: AccountingDB;
  onUpdateDb: (updated: AccountingDB) => void;
  onPreviewInvoice?: (invoice: Invoice) => void;
}

export const ReturnsView: React.FC<ReturnsViewProps> = ({
  db,
  onUpdateDb,
  onPreviewInvoice
}) => {
  const [activeTab, setActiveTab] = useState<'editor' | 'list'>('list');
  const [returnSubMode, setReturnSubMode] = useState<'sale_return' | 'purchase_return'>('sale_return');

  // Mobile back button: exit returns editor to list
  useModalBackHandler(activeTab === 'editor', () => setActiveTab('list'), 'returns_editor');

  const handleDeleteReturn = (ret: ReturnInvoice) => {
    if (!confirm(`هل أنت متأكد من حذف المرتجع "${ret.number}" وعكس آثاره؟`)) return;

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const prod = updated.products.find(p => p.id === ret.productId);
    if (prod) {
      prod.currentQty += ret.type === 'sale' ? -ret.qty : ret.qty;
    }

    updated.stockMovements = updated.stockMovements.filter(sm => sm.sourceId !== ret.id);
    updated.treasury = updated.treasury.filter(tr => tr.sourceId !== ret.id);
    updated.journals = updated.journals.filter(j => j.sourceId !== ret.id);
    updated.returns = updated.returns.filter(r => r.id !== ret.id);

    logAudit(updated, 'حذف مرتجع', `تم حذف المرتجع ${ret.number} وعكس قيوده`);
    onUpdateDb(updated);
  };

  // If in Editor Mode: clean full screen editor without redundant top banners
  if (activeTab === 'editor') {
    return (
      <div className="w-full transition-all">
        <UnifiedInvoicePage
          mode={returnSubMode}
          db={db}
          onUpdateDb={onUpdateDb}
          onPreviewInvoice={inv => onPreviewInvoice && onPreviewInvoice(inv)}
          onClose={() => setActiveTab('list')}
          onCloseEdit={() => setActiveTab('list')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-12">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-rose-600 text-white rounded-lg shadow-2xs">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
              إدارة مردودات المبيعات والمشتريات
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">
              نظام الكروت السريع لحركات المرتجع بدون أي تمرير أفقي
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setReturnSubMode('sale_return');
              setActiveTab('editor');
            }}
            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ مرتجع مبيعات</span>
          </button>

          <button
            onClick={() => {
              setReturnSubMode('purchase_return');
              setActiveTab('editor');
            }}
            className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ مرتجع مشتريات</span>
          </button>
        </div>
      </div>

      {/* Returns Responsive Card System (No Horizontal Scroll) */}
      {db.returns.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-2xs">
          <RotateCcw className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <div className="text-sm font-bold text-slate-700">لا توجد حركات مرتجعات مسجلة حالياً</div>
          <div className="text-xs text-slate-400 mt-1">يمكنك تسجيل مرتجع جديد في أي وقت بنقرة واحدة</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {db.returns.map(r => {
            const isSaleReturn = r.type === 'sale';
            return (
              <div
                key={r.id}
                className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between p-3.5"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                  <div>
                    <span className="font-mono font-black text-sm text-slate-900 block">
                      {r.number}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono mt-0.5 block">
                      {r.date}
                    </span>
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                      isSaleReturn
                        ? 'bg-rose-50 text-rose-800 border-rose-300'
                        : 'bg-purple-50 text-purple-800 border-purple-300'
                    }`}
                  >
                    {isSaleReturn ? 'مرتجع مبيعات' : 'مرتجع مشتريات'}
                  </span>
                </div>

                {/* Body */}
                <div className="py-2.5 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">الطرف:</span>
                    <span className="font-bold text-slate-900 truncate max-w-[170px]">{r.partyName}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">الصنف المردود:</span>
                    <span className="font-bold text-slate-800 truncate max-w-[170px]">{r.productName}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">الكمية والسعر:</span>
                    <span className="font-mono font-bold text-slate-700">
                      {r.qty} × {formatMoney(r.price, db.settings.currency)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">طريقة التسوية:</span>
                    <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] text-slate-800">
                      {r.paymentMethod}
                    </span>
                  </div>

                  <div className="bg-slate-50 rounded-lg p-2 flex items-center justify-between border border-slate-100 mt-2">
                    <span className="text-xs font-bold text-slate-600">القيمة الإجمالية:</span>
                    <span className="text-sm font-black font-mono text-slate-950">
                      {formatMoney(r.total, db.settings.currency)}
                    </span>
                  </div>
                </div>

                {/* Footer */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-end">
                  <button
                    onClick={() => handleDeleteReturn(r)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                    title="حذف المرتجع وعكس القيود"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
