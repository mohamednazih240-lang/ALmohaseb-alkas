import React, { useState } from 'react';
import {
  FileText,
  ClipboardList,
  Plus,
  ArrowRightCircle,
  Trash2,
  X,
  CheckCircle2,
  PenSquare,
  Printer,
  Wallet,
  Building2
} from 'lucide-react';
import {
  AccountingDB,
  Quote,
  Order,
  InvoiceItem,
  Invoice,
  PaymentMethod
} from '../types/accounting';
import {
  formatMoney,
  generateId,
  getTodayDate,
  logAudit,
  roundMoney,
  getNextUniqueInvoiceNumber,
  markRecordsDeleted,
  PAYMENT_METHODS
} from '../services/accountingStorage';
import { postInvoiceTransaction } from '../services/accountingEngine';
import { UnifiedInvoicePage } from './UnifiedInvoicePage';
import { useModalBackHandler } from '../hooks/useModalBackHandler';
import { useSubmitLock } from '../hooks/useSubmitLock';
import { appAlert, appConfirm } from '../services/appDialog';

interface QuotesOrdersViewProps {
  db: AccountingDB;
  onUpdateDb: (updated: AccountingDB) => void;
  initialTab?: 'quotes' | 'orders';
  onPreviewInvoice: (invoice: Invoice) => void;
  activeBranchId?: string;
}

export const QuotesOrdersView: React.FC<QuotesOrdersViewProps> = ({
  db,
  onUpdateDb,
  initialTab = 'quotes',
  onPreviewInvoice,
  activeBranchId
}) => {
  const branches = db.branches || [{ id: 'br_main', name: 'الفرع الرئيسي', code: 'BR-01', isMain: true }];
  const targetBranchId = activeBranchId || branches[0]?.id || 'br_main';
  const currentBranch = branches.find(b => b.id === targetBranchId) || branches[0];

  const [activeTab, setActiveTab] = useState<'quotes' | 'orders'>(initialTab);
  const [viewSubTab, setViewSubTab] = useState<'editor' | 'list'>('list');
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);

  // Convert Quote to Approved Invoice Modal State
  const [convertingQuote, setConvertingQuote] = useState<Quote | null>(null);
  const [convertSettlement, setConvertSettlement] = useState<'cash' | 'credit'>('cash');
  const [convertPayMethod, setConvertPayMethod] = useState<PaymentMethod>('نقدي');
  const [convertDate, setConvertDate] = useState<string>(getTodayDate());

  const { isSubmitting, runWithLock } = useSubmitLock();

  // Mobile back buttons: exit quote editor or close modals
  useModalBackHandler(viewSubTab === 'editor', () => {
    if ((window as any).__hesabaty_has_open_modal && typeof (window as any).__hesabaty_close_topmost_modal === 'function') {
      const closed = (window as any).__hesabaty_close_topmost_modal();
      if (closed) return;
    }
    setEditingQuote(null);
    setViewSubTab('list');
  }, 'quotes_editor');
  useModalBackHandler(showOrderModal, () => setShowOrderModal(false), 'order_modal');
  useModalBackHandler(Boolean(convertingQuote), () => setConvertingQuote(null), 'convert_quote_modal');

  // Helper: convert a Quote into an Invoice-compatible preview payload for InvoicePrintModal
  const quoteToPreviewInvoice = (q: Quote): Invoice => {
    const subtotalVal = q.subtotal !== undefined
      ? roundMoney(q.subtotal)
      : roundMoney((q.items || []).reduce((s, it) => s + (Number(it.total) || 0), 0));
    const payMethod: PaymentMethod = q.paymentMethod || 'نقدي';
    const isCredit = payMethod === 'آجل';
    const matchedCust = db.customers.find(
      c =>
        (q.partyId && c.id === q.partyId) ||
        (q.partyCode && c.code && c.code.trim().toLowerCase() === q.partyCode.trim().toLowerCase()) ||
        (q.partyName && q.partyName !== 'نقدي' && c.name.trim().toLowerCase() === q.partyName.trim().toLowerCase())
    );
    const resolvedBranch =
      (db.branches || []).find(b => b.id === q.branchId) ||
      (db.branches || []).find(b => b.isMain) ||
      (db.branches || [])[0];
    return {
      id: q.id,
      number: q.number,
      type: 'sale',
      invoiceKind: 'quote',
      date: q.date,
      time: q.time,
      jobSite: q.jobSite || q.notes,
      priceType: q.priceType,
      partyId: q.partyId || matchedCust?.id,
      partyCode: q.partyCode || matchedCust?.code,
      partyName: q.partyName,
      partyPhone: q.partyPhone || matchedCust?.phone,
      warehouseId: db.warehouses?.[0]?.id || 'wh_main',
      paymentMethod: payMethod,
      payments: !isCredit ? [{ method: payMethod, amount: roundMoney(q.total) }] : [],
      subtotal: subtotalVal,
      discount: roundMoney(q.discount || 0),
      discountType: q.discountType,
      tax: roundMoney(q.tax || 0),
      taxType: q.taxType,
      extraIncomeName: q.extraIncomeName,
      extraIncomeVal: q.extraIncomeVal,
      total: roundMoney(q.total),
      paid: isCredit ? 0 : roundMoney(q.total),
      remaining: isCredit ? roundMoney(q.total) : 0,
      status: isCredit ? 'آجل' : 'مدفوع',
      notes: q.notes || q.jobSite,
      branchId: q.branchId || targetBranchId,
      branchName: resolvedBranch?.name || q.branchName || currentBranch.name,
      createdBy: q.createdBy,
      createdAt: q.createdAt,
      items: q.items || []
    };
  };

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
          costPrice: p.buyPrice || 0,
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

  const openConvertQuoteModal = (q: Quote) => {
    if (q.status === 'تم التحويل') {
      void appAlert('تم تحويل عرض السعر هذا إلى فاتورة معتمدة مسبقاً.');
      return;
    }
    if (!q.items || q.items.length === 0) {
      void appAlert('عرض السعر فارغ ولا يحتوي على أصناف.');
      return;
    }
    const qMethod = q.paymentMethod && q.paymentMethod !== 'آجل' ? q.paymentMethod : 'نقدي';
    setConvertSettlement(q.paymentMethod === 'آجل' ? 'credit' : 'cash');
    setConvertPayMethod(qMethod);
    setConvertDate(getTodayDate());
    setConvertingQuote(q);
  };

  // Convert Quote to Approved Sale Invoice via central atomic accountingEngine
  const handleConfirmConvertQuote = () => {
    if (!convertingQuote) return;
    const q = convertingQuote;

    runWithLock(async () => {
      if (q.status === 'تم التحويل') {
        await appAlert('تم تحويل عرض السعر هذا إلى فاتورة معتمدة بالفعل مسبقاً.');
        setConvertingQuote(null);
        return;
      }

      if (!q.items || q.items.length === 0) {
        await appAlert('عرض السعر فارغ ولا يحتوي على أصناف.');
        return;
      }

      const workingDb = JSON.parse(JSON.stringify(db)) as AccountingDB;
      const { number: invNumber } = getNextUniqueInvoiceNumber(workingDb, 'sale');
      const invId = generateId('inv');
      const warehouseId = workingDb.warehouses[0]?.id || 'wh_main';

      const branchIdForSale = q.branchId || targetBranchId;
      const branchForSale = branches.find(b => b.id === branchIdForSale) || currentBranch;
      const cleanTotal = roundMoney(q.total);
      const subtotalVal = q.subtotal !== undefined
        ? roundMoney(q.subtotal)
        : roundMoney(q.items.reduce((s, it) => s + (Number(it.total) || 0), 0));
      const discVal = roundMoney(q.discount || 0);
      const taxVal = roundMoney(q.tax || 0);

      const isCredit = convertSettlement === 'credit';
      const chosenMethod: PaymentMethod = isCredit ? 'آجل' : convertPayMethod;
      const paidVal = isCredit ? 0 : cleanTotal;
      const remainingVal = isCredit ? cleanTotal : 0;
      const nowTime = new Date().toTimeString().slice(0, 5);

      const matchedCustForConv = workingDb.customers.find(
        c =>
          (q.partyId && c.id === q.partyId) ||
          (q.partyCode && c.code && c.code.trim().toLowerCase() === q.partyCode.trim().toLowerCase()) ||
          (q.partyName && q.partyName !== 'نقدي' && c.name.trim().toLowerCase() === q.partyName.trim().toLowerCase())
      );

      const newInvoice: Invoice = {
        id: invId,
        number: invNumber,
        type: 'sale',
        invoiceKind: q.priceType === 'wholesale' ? 'wholesale' : 'sale',
        date: convertDate || getTodayDate(),
        time: nowTime,
        jobSite: q.jobSite,
        priceType: q.priceType || 'cash',
        partyId: q.partyId || matchedCustForConv?.id,
        partyCode: q.partyCode || matchedCustForConv?.code,
        partyName: q.partyName === 'نقدي' ? 'عميل نقدي' : q.partyName,
        partyPhone: q.partyPhone || matchedCustForConv?.phone,
        warehouseId,
        paymentMethod: chosenMethod,
        payments: !isCredit && cleanTotal > 0 ? [{ method: chosenMethod, amount: cleanTotal }] : [],
        subtotal: subtotalVal,
        discount: discVal,
        discountType: q.discountType,
        tax: taxVal,
        taxType: q.taxType,
        extraIncomeName: q.extraIncomeName,
        extraIncomeVal: q.extraIncomeVal,
        total: cleanTotal,
        paid: paidVal,
        remaining: remainingVal,
        status: isCredit ? 'آجل' : 'مدفوع',
        notes: q.notes || `فاتورة معتمدة محولة من عرض السعر رقم ${q.number}`,
        branchId: branchIdForSale,
        branchName: branchForSale.name,
        createdBy: workingDb.currentUser?.name || 'مدير النظام',
        createdAt: new Date().toISOString(),
        items: JSON.parse(JSON.stringify(q.items))
      };

      const res = postInvoiceTransaction(workingDb, newInvoice, workingDb.currentUser?.name || 'مدير النظام');
      if (!res.success) {
        await appAlert(res.message || 'تعذر تحويل عرض السعر إلى فاتورة بيع بسبب فشل التحقق المحاسبي.', { variant: 'error' });
        return;
      }

      const updated = res.db;
      const currentQuote = updated.quotes.find(item => item.id === q.id);
      if (currentQuote) {
        currentQuote.status = 'تم التحويل';
        currentQuote.convertedInvoiceId = newInvoice.id;
        currentQuote.convertedInvoiceNumber = newInvoice.number;
        currentQuote.updatedAt = new Date().toISOString();
      }

      logAudit(
        updated,
        'اعتماد وتحويل عرض سعر إلى فاتورة بيع',
        `تم تحويل عرض السعر ${q.number} إلى فاتورة بيع معتمدة رقم ${newInvoice.number} (${chosenMethod})`
      );

      onUpdateDb(updated);
      setConvertingQuote(null);

      const savedInv = updated.invoices.find(i => i.id === newInvoice.id) || newInvoice;
      const wantsPreview = await appConfirm(
        `تم اعتماد وتحويل عرض السعر (${q.number}) إلى فاتورة بيع معتمدة رقم (${newInvoice.number}) بنجاح!\n\nهل ترغب في معاينة وطباعة الفاتورة المعتمدة الآن؟`,
        { variant: 'success', title: 'تحويل عرض السعر', confirmText: 'معاينة وطباعة', cancelText: 'إغلاق' }
      );
      if (wantsPreview) {
        onPreviewInvoice(savedInv);
      }
    });
  };

  const handleSaveOrder = (e: React.FormEvent) => {
    e.preventDefault();
    runWithLock(async () => {
      if (orderItems.length === 0) {
        await appAlert('أضف بنوداً للأمر');
        return;
      }

      const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
      const list = orderType === 'sale' ? updated.customers : updated.suppliers;
      const party = list.find(p => p.id === orderPartyId);

      const oNumber = `ORD-${String(updated.settings.nextOrder).padStart(6, '0')}`;
      updated.settings.nextOrder += 1;

      const total = roundMoney(orderItems.reduce((s, it) => s + (Number(it.total) || 0), 0));
      const nowIso = new Date().toISOString();

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
        notes: orderNotes,
        branchId: targetBranchId,
        branchName: currentBranch.name,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      updated.orders.unshift(newOrder);
      logAudit(updated, 'إنشاء أمر توريد/بيع', `أمر ${newOrder.number} (${orderType === 'sale' ? 'بيع' : 'شراء'}) لفرع ${currentBranch.name}`);
      onUpdateDb(updated);
      setShowOrderModal(false);
    });
  };

  const handleDeleteQuote = (id: string) => {
    runWithLock(async () => {
      const ok = await appConfirm('هل ترغب في حذف عرض السعر نهائياً؟', { variant: 'danger', title: 'تأكيد حذف عرض السعر' });
      if (!ok) return;
      const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
      updated.quotes = updated.quotes.filter(q => q.id !== id);
      markRecordsDeleted(updated, [id]);
      onUpdateDb(updated);
    });
  };

  const handleDeleteOrder = (id: string) => {
    runWithLock(async () => {
      const ok = await appConfirm('هل ترغب في حذف الأمر نهائياً؟', { variant: 'danger', title: 'تأكيد حذف الأمر' });
      if (!ok) return;
      const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
      updated.orders = updated.orders.filter(o => o.id !== id);
      markRecordsDeleted(updated, [id]);
      onUpdateDb(updated);
    });
  };

  // If in Editor Mode for Quotes: render clean invoice editor with close X button
  if (activeTab === 'quotes' && viewSubTab === 'editor') {
    return (
      <div className="w-full transition-all">
        <UnifiedInvoicePage
          mode="quote"
          db={db}
          activeBranchId={targetBranchId}
          editingQuote={editingQuote}
          onUpdateDb={onUpdateDb}
          onPreviewInvoice={onPreviewInvoice}
          onClose={() => {
            setEditingQuote(null);
            setViewSubTab('list');
          }}
          onCloseEdit={() => {
            setEditingQuote(null);
            setViewSubTab('list');
          }}
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
            إعداد وحفظ عروض الأسعار للعملاء مع إمكانية المعاينة والطباعة والتحويل المباشر لفاتورة بيع معتمدة
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'quotes' && (
            <button
              onClick={() => {
                setEditingQuote(null);
                setViewSubTab('editor');
              }}
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
          className={`pb-2 px-3 text-xs font-black transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
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
          className={`pb-2 px-3 text-xs font-black transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
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
                onClick={() => {
                  setEditingQuote(null);
                  setViewSubTab('editor');
                }}
                className="mt-3 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إنشاء أول عرض سعر</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {db.quotes.map(q => {
                const convertedInv = q.convertedInvoiceId
                  ? db.invoices.find(i => i.id === q.convertedInvoiceId)
                  : undefined;

                return (
                  <div
                    key={q.id}
                    className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between p-3.5"
                  >
                    <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                      <div>
                        <span className="font-mono font-black text-sm text-slate-900 block">
                          عرض سعر #{q.number}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono mt-0.5 block">
                          {q.date} {q.time ? `• ${q.time}` : ''}
                        </span>
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                          q.status === 'تم التحويل'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : q.status === 'مقبول'
                            ? 'bg-blue-50 text-blue-800 border-blue-300'
                            : q.status === 'مرفوض'
                            ? 'bg-rose-50 text-rose-800 border-rose-300'
                            : 'bg-slate-100 text-slate-800 border-slate-300'
                        }`}
                      >
                        {q.status === 'تم التحويل' ? '✓ معتمد (فاتورة)' : q.status}
                      </span>
                    </div>

                    <div className="py-2.5 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium">العميل:</span>
                        <span className="font-bold text-slate-900 truncate max-w-[180px]">{q.partyName}</span>
                      </div>

                      {q.partyPhone && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 font-medium">الهاتف:</span>
                          <span className="font-mono text-slate-700" dir="ltr">{q.partyPhone}</span>
                        </div>
                      )}

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

                      {q.status === 'تم التحويل' && (q.convertedInvoiceNumber || convertedInv) && (
                        <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg px-2.5 py-1.5 flex items-center justify-between text-[11px]">
                          <span className="font-bold text-emerald-800">
                            فاتورة معتمدة #{q.convertedInvoiceNumber || convertedInv?.number}
                          </span>
                          {convertedInv && (
                            <button
                              type="button"
                              onClick={() => onPreviewInvoice(convertedInv)}
                              className="text-emerald-700 hover:text-emerald-950 font-black underline cursor-pointer"
                            >
                              عرض الفاتورة
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => onPreviewInvoice(quoteToPreviewInvoice(q))}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                          title="معاينة وطباعة عرض السعر"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>معاينة / طباعة</span>
                        </button>

                        {q.status !== 'تم التحويل' && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingQuote(q);
                                setViewSubTab('editor');
                              }}
                              className="px-2 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                              title="تعديل عرض السعر"
                            >
                              <PenSquare className="w-3.5 h-3.5" />
                              <span>تعديل</span>
                            </button>

                            <button
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => openConvertQuoteModal(q)}
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-md text-xs font-bold flex items-center gap-1 shadow-2xs cursor-pointer transition-colors"
                            >
                              <ArrowRightCircle className="w-3.5 h-3.5" />
                              <span>تحويل لفاتورة معتمدة</span>
                            </button>
                          </>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteQuote(q.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                        title="حذف عرض السعر"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modal: Convert Quote to Approved Sales Invoice */}
      {convertingQuote && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-emerald-700 text-white">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                <h2 className="text-sm font-black">تحويل عرض السعر لفاتورة بيع معتمدة</h2>
              </div>
              <button
                type="button"
                onClick={() => setConvertingQuote(null)}
                className="p-1 hover:bg-white/20 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">عرض السعر:</span>
                  <span className="font-mono font-black text-slate-900">#{convertingQuote.number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">العميل:</span>
                  <span className="font-bold text-slate-900">{convertingQuote.partyName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">الإجمالي المعتمد:</span>
                  <span className="font-mono font-black text-emerald-700 text-sm">
                    {formatMoney(convertingQuote.total, db.settings.currency)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">تاريخ اعتماد الفاتورة</label>
                <input
                  type="date"
                  value={convertDate}
                  onChange={e => setConvertDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-xs bg-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">حالة السداد عند الاعتماد</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConvertSettlement('cash')}
                    className={`py-2 px-3 rounded-lg border font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      convertSettlement === 'cash'
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    <span>مسدد بالكامل</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConvertSettlement('credit')}
                    className={`py-2 px-3 rounded-lg border font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      convertSettlement === 'credit'
                        ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>آجل (على الحساب)</span>
                  </button>
                </div>
              </div>

              {convertSettlement === 'cash' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">وسيلة التحصيل / الخزينة</label>
                  <div className="flex flex-wrap gap-1.5">
                    {PAYMENT_METHODS.filter(m => m !== 'آجل').map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setConvertPayMethod(m)}
                        className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer transition-all ${
                          convertPayMethod === m
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConvertingQuote(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleConfirmConvertQuote}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-black flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSubmitting ? 'جارٍ الاعتماد...' : 'اعتماد وتحويل لفاتورة'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
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
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-black disabled:opacity-50 text-white rounded-lg text-xs font-bold"
                >
                  {isSubmitting ? 'جارٍ الحفظ...' : 'حفظ الأمر'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
