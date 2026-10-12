import React, { useState } from 'react';
import {
  RotateCcw,
  Plus,
  Trash2,
  Calendar,
  X,
  FileText,
  Receipt,
  List,
  Printer,
  Download,
  FileSpreadsheet,
  Eye,
  Search
} from 'lucide-react';
import {
  AccountingDB,
  ReturnInvoice,
  Invoice
} from '../types/accounting';
import { formatMoney, logAudit } from '../services/accountingStorage';
import { UnifiedInvoicePage } from './UnifiedInvoicePage';
import { useModalBackHandler } from '../hooks/useModalBackHandler';
import {
  UniversalPrintModal,
  MovementPrintBlock,
  formatCleanNumber
} from './UniversalPrintModal';
import { exportTableToCsv } from '../services/exportService';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'sale' | 'purchase'>('all');

  // Print modal state
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printDocuments, setPrintDocuments] = useState<MovementPrintBlock[]>([]);
  const [printDocTitle, setPrintDocTitle] = useState('سند مرتجع');

  // Mobile back button: exit returns editor to list
  useModalBackHandler(activeTab === 'editor', () => setActiveTab('list'), 'returns_editor');

  // Filter returns
  const filteredReturns = (db.returns || []).filter(r => {
    const s = searchTerm.trim().toLowerCase();
    const matchSearch = !s ||
      r.number.toLowerCase().includes(s) ||
      r.partyName.toLowerCase().includes(s) ||
      r.productName.toLowerCase().includes(s);
    const matchType = typeFilter === 'all' || r.type === typeFilter;
    return matchSearch && matchType;
  });

  // Single return print handler
  const handlePrintReturn = (ret: ReturnInvoice) => {
    const isSale = ret.type === 'sale';
    const doc: MovementPrintBlock = {
      title: isSale ? 'سند مردود مبيعات' : 'سند مردود مشتريات',
      serialNo: ret.number,
      date: ret.date,
      partyLabel: isSale ? 'العميل:' : 'المورد:',
      partyName: ret.partyName,
      badge: isSale ? 'مردود مبيعات' : 'مردود مشتريات',
      tableHeaders: [
        { label: 'الصنف المردود', width: '40%', align: 'right' },
        { label: 'الكمية', width: '20%', align: 'center' },
        { label: 'سعر الوحدة', width: '20%', align: 'center' },
        { label: 'الإجمالي', width: '20%', align: 'center' }
      ],
      tableRows: [
        {
          cols: [
            ret.productName,
            ret.qty,
            formatMoney(ret.price, db.settings.currency),
            formatMoney(ret.total, db.settings.currency)
          ],
          isBold: true
        }
      ],
      summaryLines: [
        {
          label: 'طريقة التسوية',
          value: ret.paymentMethod
        },
        {
          label: 'إجمالي المرتجع',
          value: formatMoney(ret.total, db.settings.currency),
          isTotal: true,
          highlight: true
        }
      ],
      footerNotes: ret.notes || (isSale ? 'تم استلام البضاعة وإرجاعها للمخزن وقيد الحساب' : 'تم رد البضاعة للمورد وقيد الحساب')
    };

    setPrintDocuments([doc]);
    setPrintDocTitle(`سند مرتجع ${ret.number}`);
    setPrintModalOpen(true);
  };

  // Batch print all filtered returns
  const handlePrintBatch = () => {
    if (filteredReturns.length === 0) {
      alert('لا توجد سجلات مرتجعات للطباعة!');
      return;
    }

    const docs: MovementPrintBlock[] = filteredReturns.map(ret => {
      const isSale = ret.type === 'sale';
      return {
        title: isSale ? 'سند مردود مبيعات' : 'سند مردود مشتريات',
        serialNo: ret.number,
        date: ret.date,
        partyLabel: isSale ? 'العميل:' : 'المورد:',
        partyName: ret.partyName,
        badge: isSale ? 'مردود مبيعات' : 'مردود مشتريات',
        tableHeaders: [
          { label: 'الصنف المردود', width: '40%', align: 'right' },
          { label: 'الكمية', width: '20%', align: 'center' },
          { label: 'سعر الوحدة', width: '20%', align: 'center' },
          { label: 'الإجمالي', width: '20%', align: 'center' }
        ],
        tableRows: [
          {
            cols: [
              ret.productName,
              ret.qty,
              formatMoney(ret.price, db.settings.currency),
              formatMoney(ret.total, db.settings.currency)
            ],
            isBold: true
          }
        ],
        summaryLines: [
          {
            label: 'طريقة التسوية',
            value: ret.paymentMethod
          },
          {
            label: 'إجمالي المرتجع',
            value: formatMoney(ret.total, db.settings.currency),
            isTotal: true,
            highlight: true
          }
        ],
        footerNotes: ret.notes || (isSale ? 'تم استلام البضاعة وإرجاعها للمخزن وقيد الحساب' : 'تم رد البضاعة للمورد وقيد الحساب')
      };
    });

    setPrintDocuments(docs);
    setPrintDocTitle(`تقرير حركات المرتجعات الجماعي (${filteredReturns.length} حركة)`);
    setPrintModalOpen(true);
  };

  // Export CSV
  const handleExportCsv = () => {
    if (filteredReturns.length === 0) {
      alert('لا توجد بيانات مرتجعات للتصدير!');
      return;
    }
    const headers = ['رقم السند', 'النوع', 'التاريخ', 'الطرف', 'الصنف', 'الكمية', 'السعر', 'الإجمالي', 'طريقة السداد'];
    const rows = filteredReturns.map(r => [
      r.number,
      r.type === 'sale' ? 'مردود مبيعات' : 'مردود مشتريات',
      r.date,
      r.partyName,
      r.productName,
      r.qty,
      r.price,
      r.total,
      r.paymentMethod
    ]);
    exportTableToCsv(`returns_report_${Date.now()}.csv`, headers, rows);
  };

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

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            title="تصدير جدول المرتجعات Excel"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            <span>Excel</span>
          </button>

          <button
            type="button"
            onClick={handlePrintBatch}
            className="px-3 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
            title="طباعة وتصدير جميع المرتجعات المعروضة PDF وورق"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة وتصدير PDF ({filteredReturns.length})</span>
          </button>

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

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          <input
            type="text"
            placeholder="بحث برقم السند، الطرف، أو اسم الصنف..."
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

        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-slate-500">النوع:</span>
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 text-xs font-bold">
            <button
              type="button"
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                typeFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs font-black' : 'text-slate-600'
              }`}
            >
              الكل ({db.returns?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('sale')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                typeFilter === 'sale' ? 'bg-white text-rose-800 shadow-2xs font-black' : 'text-slate-600'
              }`}
            >
              مبيعات ({(db.returns || []).filter(r => r.type === 'sale').length})
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('purchase')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                typeFilter === 'purchase' ? 'bg-white text-purple-800 shadow-2xs font-black' : 'text-slate-600'
              }`}
            >
              مشتريات ({(db.returns || []).filter(r => r.type === 'purchase').length})
            </button>
          </div>
        </div>
      </div>

      {/* Returns Responsive Card System (No Horizontal Scroll) */}
      {filteredReturns.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-2xs">
          <RotateCcw className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <div className="text-sm font-bold text-slate-700">لا توجد حركات مرتجعات مطابقة للبحث أو الفلتر</div>
          <div className="text-xs text-slate-400 mt-1">يمكنك تسجيل مرتجع جديد في أي وقت بنقرة واحدة</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {filteredReturns.map(r => {
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

                {/* Footer: Preview, Print and Delete */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => handlePrintReturn(r)}
                    className="px-2.5 py-1 text-slate-700 hover:text-black hover:bg-slate-100 rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                    title="معاينة وطباعة سند المرتجع الفردي بتصميم الفاتورة المعتمد"
                  >
                    <Eye className="w-3.5 h-3.5 text-slate-500" />
                    <span>معاينة وطباعة</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDeleteReturn(r)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                      title="حذف المرتجع وعكس القيود والمخزن"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
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
