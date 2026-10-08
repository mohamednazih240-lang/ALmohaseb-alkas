import React, { useState } from 'react';
import {
  FileCheck2,
  Plus,
  ClipboardList,
  PackageCheck,
  Receipt,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Printer,
  Download,
  Search,
  Building,
  ArrowRight,
  ShieldCheck,
  Eye,
  Filter
} from 'lucide-react';
import {
  AccountingDB,
  GoodsReceivedNote,
  GoodsReceivedItem,
  Order,
  Invoice,
  StockMovement
} from '../types/accounting';
import { formatMoney, generateId, getTodayDate, logAudit } from '../services/accountingStorage';
import { downloadElementAsPdf } from '../services/printAndPdfService';
import { useModalBackHandler } from '../hooks/useModalBackHandler';

interface ProcurementViewProps {
  db: AccountingDB;
  onUpdateDb: (updated: AccountingDB) => void;
  onPreviewInvoice?: (inv: Invoice) => void;
}

export const ProcurementView: React.FC<ProcurementViewProps> = ({
  db,
  onUpdateDb,
  onPreviewInvoice
}) => {
  const [activeTab, setActiveTab] = useState<'matching' | 'grn' | 'orders'>('matching');
  const [selectedPOId, setSelectedPOId] = useState<string>(
    db.orders.find(o => o.type === 'purchase')?.id || ''
  );
  const [showGRNModal, setShowGRNModal] = useState(false);

  useModalBackHandler(showGRNModal, () => setShowGRNModal(false), 'grn_modal');
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Purchase Orders from db.orders
  const purchaseOrders = db.orders.filter(o => o.type === 'purchase');

  // Supplier Invoices
  const purchaseInvoices = db.invoices.filter(i => i.type === 'purchase');

  // Selected PO
  const selectedPO = db.orders.find(o => o.id === selectedPOId);

  // Find linked GRN (Goods Received Notes)
  const linkedGRNs = db.goodsReceivedNotes.filter(
    g => g.orderId === selectedPOId || (selectedPO && g.orderNumber === selectedPO.number)
  );

  // Find linked Invoice
  const linkedInvoice = purchaseInvoices.find(
    i => (selectedPO && (i.notes?.includes(selectedPO.number) || i.number === selectedPO.number)) ||
         linkedGRNs.some(g => g.matchedInvoiceId === i.id)
  );

  // Compute 3-Way Match Rows
  interface MatchRow {
    productName: string;
    productCode: string;
    unit: string;
    poQty: number;
    poPrice: number;
    grnQty: number;
    invQty: number;
    invPrice: number;
    qtyMatch: boolean;
    priceMatch: boolean;
  }

  const matchRows: MatchRow[] = [];
  let isOverallMatched = true;

  if (selectedPO) {
    selectedPO.items.forEach(poItem => {
      // Find matching items in GRN
      let grnQty = 0;
      linkedGRNs.forEach(grn => {
        const found = grn.items.find(it => it.productId === poItem.productId || it.productCode === poItem.productCode);
        if (found) grnQty += Number(found.acceptedQty || found.receivedQty || 0);
      });

      // Find matching items in Invoice
      let invQty = 0;
      let invPrice = poItem.unitPrice;
      if (linkedInvoice) {
        const found = linkedInvoice.items.find(it => it.productId === poItem.productId || it.productCode === poItem.productCode);
        if (found) {
          invQty = Number(found.qty);
          invPrice = Number(found.unitPrice);
        }
      } else {
        invQty = grnQty; // if invoice not yet entered, compare PO vs GRN
      }

      const qtyMatch = linkedGRNs.length > 0 ? (poItem.qty === grnQty && (linkedInvoice ? poItem.qty === invQty : true)) : false;
      const priceMatch = poItem.unitPrice === invPrice;

      if (!qtyMatch || !priceMatch) {
        isOverallMatched = false;
      }

      matchRows.push({
        productName: poItem.productName,
        productCode: poItem.productCode,
        unit: poItem.unit,
        poQty: poItem.qty,
        poPrice: poItem.unitPrice,
        grnQty,
        invQty,
        invPrice,
        qtyMatch,
        priceMatch
      });
    });
  }

  // Create GRN (Goods Received Note) from selected PO
  const handleCreateGRNFromPO = () => {
    if (!selectedPO) return;

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const nextGRNNum = updated.settings.nextGRN || 7001;
    const grnNumber = `GRN-${nextGRNNum}`;
    const defaultWh = updated.warehouses.find(w => w.isDefault) || updated.warehouses[0];

    const grnItems: GoodsReceivedItem[] = selectedPO.items.map(it => ({
      productId: it.productId,
      productCode: it.productCode,
      productName: it.productName,
      unit: it.unit,
      orderedQty: it.qty,
      receivedQty: it.qty,
      acceptedQty: it.qty,
      unitCost: it.unitPrice
    }));

    const newGRN: GoodsReceivedNote = {
      id: generateId('grn'),
      number: grnNumber,
      date: getTodayDate(),
      orderId: selectedPO.id,
      orderNumber: selectedPO.number,
      supplierId: selectedPO.partyId || 'supp_1',
      supplierName: selectedPO.partyName,
      warehouseId: defaultWh.id,
      warehouseName: defaultWh.name,
      items: grnItems,
      status: 'معتمد ومستلم',
      receivedBy: db.currentUser?.name || 'أمين المخزن'
    };

    // Update stock levels for each item
    selectedPO.items.forEach(it => {
      const prod = updated.products.find(p => p.id === it.productId);
      if (prod) {
        prod.currentQty += Number(it.qty);
      }
      const sm: StockMovement = {
        id: generateId('sm'),
        date: getTodayDate(),
        productId: it.productId,
        productName: it.productName,
        warehouseId: defaultWh.id,
        warehouseName: defaultWh.name,
        qtyChange: Number(it.qty),
        balanceAfter: (prod?.currentQty || 0),
        unitCost: it.unitPrice,
        type: 'purchase',
        refNumber: grnNumber,
        sourceId: newGRN.id
      };
      updated.stockMovements.push(sm);
    });

    updated.goodsReceivedNotes.push(newGRN);
    updated.settings.nextGRN = nextGRNNum + 1;

    // Update PO status to Completed
    const poIdx = updated.orders.findIndex(o => o.id === selectedPO.id);
    if (poIdx !== -1) {
      updated.orders[poIdx].status = 'مكتمل';
    }

    logAudit(updated, 'استلام بضاعة مخزنية (GRN)', `تم استلام أمر الشراء ${selectedPO.number} بموجب الإذن ${grnNumber}`);
    onUpdateDb(updated);
    alert(`تم إصدار إذن استلام المخزن ${grnNumber} وتحديث أرصدة المخازن بنجاح.`);
  };

  const handleDownloadPdf = async () => {
    setIsExportingPdf(true);
    try {
      await downloadElementAsPdf('three-way-match-sheet', {
        format: 'a4',
        filename: `3way_match_${selectedPO?.number || 'audit'}.pdf`
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-teal-900 text-white rounded-xl">
              <FileCheck2 className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-black text-slate-900">
              دورة المشتريات والمخازن الكاملة والمطابقة الثلاثية (3-Way Matching)
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            مطابقة أمر الشراء (PO) مع محضر استلام المخزن (GRN) وفاتورة المورد قبل الاعتماد والصرف
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold">
          <button
            onClick={() => setActiveTab('matching')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'matching' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
            }`}
          >
            المطابقة الثلاثية
          </button>
          <button
            onClick={() => setActiveTab('grn')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'grn' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
            }`}
          >
            سندات استلام المخزن (GRN)
          </button>
        </div>
      </div>

      {activeTab === 'matching' ? (
        <div className="space-y-6">
          {/* 3-Way Match Visual Workflow Stepper */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
            <h3 className="text-xs font-black text-slate-900 mb-4">
              خطوات دورة الشراء والرقابة المخزنية:
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Step 1: PO */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-start gap-3">
                <span className="p-2 bg-blue-100 text-blue-900 rounded-lg">
                  <ClipboardList className="w-5 h-5" />
                </span>
                <div>
                  <span className="text-[10px] font-bold text-blue-700 block">المرحلة الأولى</span>
                  <span className="font-black text-xs text-slate-900 block">1. أمر الشراء الصادر (PO)</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    تثبيت الأصناف والكميات والأسعار المتفق عليها مع المورد
                  </p>
                </div>
              </div>

              {/* Step 2: GRN */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-start gap-3">
                <span className="p-2 bg-amber-100 text-amber-900 rounded-lg">
                  <PackageCheck className="w-5 h-5" />
                </span>
                <div>
                  <span className="text-[10px] font-bold text-amber-700 block">المرحلة الثانية</span>
                  <span className="font-black text-xs text-slate-900 block">2. الفحص والاستلام بالمخزن (GRN)</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    التحقق من سلامة البضاعة والكميات الفعلية الواردة للمستودع
                  </p>
                </div>
              </div>

              {/* Step 3: Invoice Matching */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-start gap-3">
                <span className="p-2 bg-teal-100 text-teal-900 rounded-lg">
                  <Receipt className="w-5 h-5" />
                </span>
                <div>
                  <span className="text-[10px] font-bold text-teal-700 block">المرحلة الثالثة</span>
                  <span className="font-black text-xs text-slate-900 block">3. المطابقة واعتماد الفاتورة</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    مطابقة الفاتورة الثلاثية وحماية الخزينة من أي فروقات أسعار أو عجز كميات
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* PO Selector & Matching Audit Matrix */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            {/* Header Toolbar */}
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-slate-700">اختر أمر الشراء المراد تدقيقه:</label>
                <select
                  value={selectedPOId}
                  onChange={e => setSelectedPOId(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  {purchaseOrders.length === 0 ? (
                    <option value="">لا توجد أوامر شراء مسجلة</option>
                  ) : (
                    purchaseOrders.map(po => (
                      <option key={po.id} value={po.id}>
                        {po.number} - {po.partyName} ({formatMoney(po.total, db.settings.currency)})
                      </option>
                    ))
                  )}
                </select>
              </div>

              {selectedPO && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadPdf}
                    disabled={isExportingPdf}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تحميل شهادة المطابقة PDF</span>
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg transition-all"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {selectedPO ? (
              <div className="p-6 space-y-6">
                {/* Status Badge & Summary */}
                <div className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                  isOverallMatched
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                    : 'bg-amber-50 border-amber-300 text-amber-950'
                }`}>
                  <div className="flex items-center gap-3">
                    {isOverallMatched ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
                    )}
                    <div>
                      <div className="font-black text-sm">
                        {isOverallMatched
                          ? 'نتيجة التدقيق: مطابقة تامة 100% (معتمد للصرف الفوري)'
                          : 'نتيجة التدقيق: يوجد تفاوت في الكميات أو الأسعار يتطلب مراجعة'}
                      </div>
                      <div className="text-xs opacity-80 mt-0.5">
                        المورد: <strong>{selectedPO.partyName}</strong> | أمر الشراء: <strong>{selectedPO.number}</strong>
                      </div>
                    </div>
                  </div>

                  {linkedGRNs.length === 0 && (
                    <button
                      onClick={handleCreateGRNFromPO}
                      className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                    >
                      <PackageCheck className="w-4 h-4" />
                      <span>إصدار محضر استلام مخزني (GRN) وتحديث الأرصدة</span>
                    </button>
                  )}
                </div>

                {/* 3-Way Match Table */}
                <div id="three-way-match-sheet" className="space-y-4">
                  <div className="flex justify-between items-center text-xs border-b border-slate-200 pb-2">
                    <span className="font-black text-slate-900">
                      جدول التدقيق والمطابقة الثلاثية (PO vs GRN vs Invoice)
                    </span>
                    <span className="font-mono text-slate-500">{db.settings.company}</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs border border-slate-300">
                      <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                        <tr>
                          <th className="p-2.5 border-l border-slate-300">الصنف والوصف</th>
                          <th className="p-2.5 border-l border-slate-300 text-center bg-blue-50 text-blue-950">كمية أمر الشراء (PO)</th>
                          <th className="p-2.5 border-l border-slate-300 text-center bg-blue-50 text-blue-950">سعر أمر الشراء</th>
                          <th className="p-2.5 border-l border-slate-300 text-center bg-amber-50 text-amber-950">الكمية المستلمة (GRN)</th>
                          <th className="p-2.5 border-l border-slate-300 text-center bg-teal-50 text-teal-950">كمية الفاتورة</th>
                          <th className="p-2.5 border-l border-slate-300 text-center bg-teal-50 text-teal-950">سعر الفاتورة</th>
                          <th className="p-2.5 text-center">حالة المطابقة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {matchRows.map((r, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-2.5 border-l border-slate-200 font-bold text-slate-900">
                              {r.productName}
                              <span className="block text-[10px] text-slate-500 font-mono font-normal">
                                {r.productCode}
                              </span>
                            </td>
                            <td className="p-2.5 border-l border-slate-200 text-center font-mono font-bold bg-blue-50/40">
                              {r.poQty} {r.unit}
                            </td>
                            <td className="p-2.5 border-l border-slate-200 text-center font-mono bg-blue-50/40">
                              {formatMoney(r.poPrice, db.settings.currency)}
                            </td>
                            <td className="p-2.5 border-l border-slate-200 text-center font-mono font-bold bg-amber-50/40">
                              {r.grnQty > 0 ? `${r.grnQty} ${r.unit}` : <span className="text-amber-700 italic">بانتظار الاستلام</span>}
                            </td>
                            <td className="p-2.5 border-l border-slate-200 text-center font-mono font-bold bg-teal-50/40">
                              {r.invQty} {r.unit}
                            </td>
                            <td className="p-2.5 border-l border-slate-200 text-center font-mono bg-teal-50/40">
                              {formatMoney(r.invPrice, db.settings.currency)}
                            </td>
                            <td className="p-2.5 text-center">
                              {r.qtyMatch && r.priceMatch ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  <CheckCircle2 className="w-3 h-3" /> مطابق
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                                  <XCircle className="w-3 h-3" /> فارق
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Signatures */}
                  <div className="pt-8 grid grid-cols-3 text-center text-xs font-bold border-t border-slate-200">
                    <div>
                      <div className="border-t border-black w-36 mx-auto pt-1">مدير المشتريات</div>
                    </div>
                    <div>
                      <div className="border-t border-black w-36 mx-auto pt-1">أمين المستودع (GRN)</div>
                    </div>
                    <div>
                      <div className="border-t border-black w-36 mx-auto pt-1">مراجعة الحسابات والصرف</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-slate-400 text-xs">
                لا توجد أوامر شراء مسجلة حالياً لعرض المطابقة الثلاثية. أنشئ أمر شراء من قسم أوامر البيع والشراء.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* GRN Tab: Goods Received Notes list */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="text-xs font-black text-slate-900">سجل سندات ومحاضر الاستلام المخزنية (GRN)</h3>
            <span className="text-xs text-slate-500 font-mono font-bold">
              {db.goodsReceivedNotes.length} سندات
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100/70 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">رقم السند</th>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">أمر الشراء المرتبط</th>
                  <th className="p-3">المورد</th>
                  <th className="p-3">المستودع</th>
                  <th className="p-3">المستلم</th>
                  <th className="p-3 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {db.goodsReceivedNotes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      لا توجد أذون استلام مخزنية حتى الآن. يتم إصدارها تلقائياً عند فحص واستلام أمر الشراء.
                    </td>
                  </tr>
                ) : (
                  db.goodsReceivedNotes.map(g => (
                    <tr key={g.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold text-slate-900">{g.number}</td>
                      <td className="p-3 font-mono text-slate-600">{g.date}</td>
                      <td className="p-3 font-mono font-bold text-blue-700">{g.orderNumber || '—'}</td>
                      <td className="p-3 font-bold text-slate-800">{g.supplierName}</td>
                      <td className="p-3 text-slate-600">{g.warehouseName}</td>
                      <td className="p-3 text-slate-600">{g.receivedBy || '—'}</td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {g.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
