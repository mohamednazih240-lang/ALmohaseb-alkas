import React, { useState } from 'react';
import {
  FileText,
  ClipboardList,
  Plus,
  ArrowRightCircle,
  Eye,
  Trash2,
  Calendar,
  X,
  CheckCircle2,
  Clock,
  Send,
  Receipt,
  List
} from 'lucide-react';
import {
  AccountingDB,
  Quote,
  Order,
  InvoiceItem,
  Invoice
} from '../types/accounting';
import {
  formatMoney,
  generateId,
  getTodayDate,
  createInvoiceJournal,
  logAudit
} from '../services/accountingStorage';
import { UnifiedInvoicePage } from './UnifiedInvoicePage';
import { useModalBackHandler } from '../hooks/useModalBackHandler';

interface QuotesOrdersViewProps {
  db: AccountingDB;
  onUpdateDb: (updated: AccountingDB) => void;
  initialTab?: 'quotes' | 'orders';
  onPreviewInvoice: (invoice: Invoice) => void;
}

export const QuotesOrdersView: React.FC<QuotesOrdersViewProps> = ({
  db,
  onUpdateDb,
  initialTab = 'quotes',
  onPreviewInvoice
}) => {
  const [activeTab, setActiveTab] = useState<'quotes' | 'orders'>(initialTab);
  const [viewSubTab, setViewSubTab] = useState<'editor' | 'list'>('list');
  const [showOrderModal, setShowOrderModal] = useState(false);

  // Mobile back buttons: exit quote editor or close order modal
  useModalBackHandler(viewSubTab === 'editor', () => setViewSubTab('list'), 'quotes_editor');
  useModalBackHandler(showOrderModal, () => setShowOrderModal(false), 'order_modal');

  // Order form state
  const [orderType, setOrderType] = useState<'sale' | 'purchase'>('sale');
  const [orderPartyId, setOrderPartyId] = useState(db.customers[0]?.id || '');
  const [orderDate, setOrderDate] = useState(getTodayDate());
  const [orderItems, setOrderItems] = useState<InvoiceItem[]>([]);
  const [orderNotes, setOrderNotes] = useState('');

  // Initialize order item
  const openNewOrderModal = () => {
    setOrderType('sale');
    setOrderPartyId(db.customers[0]?.id || '');
    setOrderDate(getTodayDate());
    setOrderNotes('');
    if (db.products.length > 0) {
      const p = db.products[0];
      setOrderItems([
        {
          productId: p.id,
          productCode: p.code,
          productName: p.name,
          unit: p.unit,
          qty: 1,
          unitPrice: p.sellPrice,
          costPrice: p.avgCost || p.buyPrice,
          discount: 0,
          taxRate: 0,
          total: p.sellPrice
        }
      ]);
    } else {
      setOrderItems([]);
    }
    setShowOrderModal(true);
  };

  // Convert Quote to Sale Invoice Directly
  const handleConvertQuoteToSale = (q: Quote) => {
    if (q.status === 'تم التحويل') {
      alert('تم تحويل عرض السعر هذا إلى فاتورة بالفعل مسبقاً.');
      return;
    }

    if (!confirm(`هل ترغب في تحويل عرض السعر "${q.number}" إلى فاتورة بيع فعلية وترحيلها للحسابات والمخزن؟`)) {
      return;
    }

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const invNumber = `INV-${String(updated.settings.nextSale).padStart(6, '0')}`;
    updated.settings.nextSale += 1;

    const invId = generateId('inv');
    const warehouseId = updated.warehouses[0]?.id || 'wh_main';
    const wh = updated.warehouses.find(w => w.id === warehouseId);

    const newInvoice: Invoice = {
      id: invId,
      number: invNumber,
      type: 'sale',
      date: getTodayDate(),
      partyId: q.partyId,
      partyName: q.partyName,
      warehouseId,
      paymentMethod: 'نقدي',
      subtotal: q.total,
      discount: 0,
      tax: 0,
      total: q.total,
      paid: q.total,
      remaining: 0,
      status: 'مدفوع',
      notes: `تم توليدها تلقائياً من عرض السعر رقم ${q.number}`,
      items: JSON.parse(JSON.stringify(q.items))
    };

    // Deduct stock
    newInvoice.items.forEach(item => {
      const prod = updated.products.find(p => p.id === item.productId);
      if (prod) {
        prod.currentQty -= item.qty;
        updated.stockMovements.unshift({
          id: generateId('sm'),
          date: newInvoice.date,
          productId: prod.id,
          productName: prod.name,
          warehouseId,
          warehouseName: wh ? wh.name : 'المخزن الرئيسي',
          qtyChange: -item.qty,
          balanceAfter: prod.currentQty,
          unitCost: item.costPrice,
          type: 'sale',
          refNumber: newInvoice.number,
          sourceId: invId
        });
      }
    });

    // Treasury entry
    updated.treasury.unshift({
      id: generateId('tr'),
      date: newInvoice.date,
      direction: 'in',
      amount: newInvoice.total,
      method: 'نقدي',
      description: `تحصيل فاتورة بيع ${newInvoice.number} (عرض سعر ${q.number})`,
      sourceType: 'sale',
      sourceId: invId
    });

    // Journal
    const journal = createInvoiceJournal(updated, newInvoice);
    newInvoice.journalEntryId = journal.id;
    updated.journals.unshift(journal);

    // Save invoice
    updated.invoices.unshift(newInvoice);

    // Mark quote as converted
    const currentQuote = updated.quotes.find(item => item.id === q.id);
    if (currentQuote) currentQuote.status = 'تم التحويل';

    logAudit(updated, 'تحويل عرض سعر إلى بيع', `تم تحويل ${q.number} إلى فاتورة ${newInvoice.number}`);

    onUpdateDb(updated);
    alert(`تم تحويل عرض السعر بنجاح إلى فاتورة بيع رقم ${newInvoice.number} وتم قيدها في الخزينة والمخزن.`);
  };

  const handleSaveOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (orderItems.length === 0) return alert('أضف بنوداً للأمر');

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const list = orderType === 'sale' ? updated.customers : updated.suppliers;
    const party = list.find(p => p.id === orderPartyId);

    const oNumber = `ORD-${String(updated.settings.nextOrder).padStart(6, '0')}`;
    updated.settings.nextOrder += 1;

    const total = orderItems.reduce((s, it) => s + it.total, 0);

    const newOrder: Order = {
      id: generateId('ord'),
      number: oNumber,
      type: orderType,
      date: orderDate,
      partyId: orderPartyId,
      partyName: party ? party.name : 'طرف تجاري',
      items: orderItems,
      total,
      status: 'قيد التنفيذ',
      notes: orderNotes
    };

    updated.orders.unshift(newOrder);
    logAudit(updated, 'إنشاء أمر توريد/بيع', `أمر ${newOrder.number} (${orderType === 'sale' ? 'بيع' : 'شراء'})`);
    onUpdateDb(updated);
    setShowOrderModal(false);
  };

  const handleDeleteQuote = (id: string) => {
    if (!confirm('هل ترغب في حذف عرض السعر؟')) return;
    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    updated.quotes = updated.quotes.filter(q => q.id !== id);
    onUpdateDb(updated);
  };

  const handleDeleteOrder = (id: string) => {
    if (!confirm('هل ترغب في حذف الأمر؟')) return;
    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    updated.orders = updated.orders.filter(o => o.id !== id);
    onUpdateDb(updated);
  };

  // If in Editor Mode for Quotes: render clean invoice editor with close X button
  if (activeTab === 'quotes' && viewSubTab === 'editor') {
    return (
      <div className="w-full transition-all">
        <UnifiedInvoicePage
          mode="quote"
          db={db}
          onUpdateDb={onUpdateDb}
          onPreviewInvoice={onPreviewInvoice}
          onClose={() => setViewSubTab('list')}
          onCloseEdit={() => setViewSubTab('list')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            {activeTab === 'quotes' ? <FileText className="w-5 h-5 text-teal-700" /> : <ClipboardList className="w-5 h-5" />}
            <span>{activeTab === 'quotes' ? 'عروض الأسعار للعملاء' : 'أوامر البيع والشراء'}</span>
          </h1>
          <p className="text-[11px] text-slate-500 font-medium mt-0.5">
            إعداد المقايسات وعروض الأسعار مع إمكانية التحويل التلقائي بنقرة واحدة إلى فواتير بيع
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'quotes' && (
            <button
              onClick={() => setViewSubTab('editor')}
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ إنشاء عرض سعر جديد</span>
            </button>
          )}

          {activeTab === 'orders' && (
            <button
              onClick={openNewOrderModal}
              className="px-4 py-2 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ أمر جديد</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => {
            setActiveTab('quotes');
            setViewSubTab('list');
          }}
          className={`pb-2 px-3 text-xs font-black transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'quotes'
              ? 'border-teal-700 text-teal-800'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>عروض الأسعار ({db.quotes.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`pb-2 px-3 text-xs font-black transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'orders'
              ? 'border-black text-black'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span>أوامر البيع والتوريد ({db.orders.length})</span>
        </button>
      </div>

      {/* Content for Quotes (Responsive Card System) */}
      {activeTab === 'quotes' && (
        <>
          {db.quotes.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-2xs">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <div className="text-sm font-bold text-slate-700">لا توجد عروض أسعار مسجلة حالياً</div>
              <button
                onClick={() => setViewSubTab('editor')}
                className="mt-3 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>إنشاء أول عرض سعر</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {db.quotes.map(q => (
                <div
                  key={q.id}
                  className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between p-3.5"
                >
                  <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                    <div>
                      <span className="font-mono font-black text-sm text-slate-900 block">
                        {q.number}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono mt-0.5 block">
                        {q.date}
                      </span>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                        q.status === 'تم التحويل'
                          ? 'bg-purple-50 text-purple-800 border-purple-300'
                          : q.status === 'مقبول'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : q.status === 'مرفوض'
                          ? 'bg-rose-50 text-rose-800 border-rose-300'
                          : 'bg-slate-100 text-slate-800 border-slate-300'
                      }`}
                    >
                      {q.status}
                    </span>
                  </div>

                  <div className="py-2.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">العميل:</span>
                      <span className="font-bold text-slate-900 truncate max-w-[170px]">{q.partyName}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">عدد البنود:</span>
                      <span className="text-slate-700 font-bold">{q.items.length} أصناف</span>
                    </div>

                    <div className="bg-slate-50 rounded-lg p-2 flex items-center justify-between border border-slate-100">
                      <span className="text-xs font-bold text-slate-600">إجمالي العرض:</span>
                      <span className="text-sm font-black font-mono text-slate-950">
                        {formatMoney(q.total, db.settings.currency)}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                    {q.status !== 'تم التحويل' ? (
                      <button
                        onClick={() => handleConvertQuoteToSale(q)}
                        className="px-2.5 py-1.5 bg-black hover:bg-slate-800 text-white rounded-md text-xs font-bold flex items-center gap-1 shadow-2xs"
                      >
                        <ArrowRightCircle className="w-3.5 h-3.5" />
                        <span>تحويل لفاتورة بيع</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-purple-700 font-bold">✓ تم التحويل لفاتورة</span>
                    )}

                    <button
                      onClick={() => handleDeleteQuote(q.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                      title="حذف عرض السعر"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Content for Orders (Responsive Card System) */}
      {activeTab === 'orders' && (
        <>
          {db.orders.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-2xs">
              <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <div className="text-sm font-bold text-slate-700">لا توجد أوامر بيع أو شراء مسجلة</div>
              <button
                onClick={openNewOrderModal}
                className="mt-3 px-4 py-2 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>إنشاء أول أمر</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {db.orders.map(o => (
                <div
                  key={o.id}
                  className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between p-3.5"
                >
                  <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                    <div>
                      <span className="font-mono font-black text-sm text-slate-900 block">
                        {o.number}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono mt-0.5 block">
                        {o.date}
                      </span>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                        o.type === 'sale'
                          ? 'bg-slate-950 text-white border-black'
                          : 'bg-slate-100 text-slate-800 border-slate-300'
                      }`}
                    >
                      {o.type === 'sale' ? 'أمر بيع' : 'أمر شراء'}
                    </span>
                  </div>

                  <div className="py-2.5 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">الطرف:</span>
                      <span className="font-bold text-slate-900 truncate max-w-[170px]">{o.partyName}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">الحالة:</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 border border-slate-200">
                        {o.status}
                      </span>
                    </div>

                    {o.notes && (
                      <div className="text-[11px] text-slate-500 bg-slate-50 p-1.5 rounded truncate">
                        {o.notes}
                      </div>
                    )}

                    <div className="bg-slate-50 rounded-lg p-2 flex items-center justify-between border border-slate-100 mt-2">
                      <span className="text-xs font-bold text-slate-600">القيمة:</span>
                      <span className="text-sm font-black font-mono text-slate-950">
                        {formatMoney(o.total, db.settings.currency)}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-end">
                    <button
                      onClick={() => handleDeleteOrder(o.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                      title="حذف الأمر"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal: New Order */}
      {showOrderModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50 rounded-t-2xl">
              <h2 className="text-base font-black text-slate-900">إنشاء أمر بيع / توريد جديد</h2>
              <button onClick={() => setShowOrderModal(false)} className="p-1 hover:bg-slate-200 rounded">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <form onSubmit={handleSaveOrder} className="p-4 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">نوع الأمر</label>
                  <select
                    value={orderType}
                    onChange={e => setOrderType(e.target.value as 'sale' | 'purchase')}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                  >
                    <option value="sale">أمر بيع لعميل</option>
                    <option value="purchase">أمر توريد من مورد</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">الطرف</label>
                  <select
                    value={orderPartyId}
                    onChange={e => setOrderPartyId(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                  >
                    {(orderType === 'sale' ? db.customers : db.suppliers).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">التاريخ</label>
                  <input
                    type="date"
                    value={orderDate}
                    onChange={e => setOrderDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">الملاحظات وتاريخ التسليم المخطط</label>
                <textarea
                  value={orderNotes}
                  onChange={e => setOrderNotes(e.target.value)}
                  placeholder="ملاحظات التعاقد..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowOrderModal(false)}
                  className="px-4 py-2 bg-slate-100 rounded-lg text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-black text-white rounded-lg text-xs font-bold"
                >
                  حفظ الأمر
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
