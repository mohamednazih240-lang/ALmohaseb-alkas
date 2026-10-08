import React, { useState } from 'react';
import {
  Package,
  Warehouse,
  ArrowLeftRight,
  Calculator,
  TrendingDown,
  Plus,
  Search,
  Edit,
  Trash2,
  AlertTriangle,
  X,
  FileSpreadsheet,
  Boxes
} from 'lucide-react';
import {
  AccountingDB,
  Product,
  Warehouse as WarehouseType,
  StockAdjustment,
  StockTransfer
} from '../types/accounting';
import {
  formatMoney,
  generateId,
  getTodayDate,
  logAudit
} from '../services/accountingStorage';
import { useModalBackHandler } from '../hooks/useModalBackHandler';

interface InventoryViewProps {
  subPage: 'products' | 'warehouses' | 'stock' | 'inventory' | 'prices';
  db: AccountingDB;
  onUpdateDb: (updated: AccountingDB) => void;
  onOpenProductModal: (p?: Product) => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  subPage,
  db,
  onUpdateDb,
  onOpenProductModal
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [showWhModal, setShowWhModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);

  // Mobile back buttons: close open modal without leaving the view
  useModalBackHandler(showWhModal, () => setShowWhModal(false), 'inventory_wh_modal');
  useModalBackHandler(showTransferModal, () => setShowTransferModal(false), 'inventory_transfer_modal');
  useModalBackHandler(showAdjustModal, () => setShowAdjustModal(false), 'inventory_adjust_modal');

  // Warehouse form state
  const [whName, setWhName] = useState('');
  const [whLocation, setWhLocation] = useState('');

  // Transfer form state
  const [transferProductId, setTransferProductId] = useState(db.products[0]?.id || '');
  const [fromWhId, setFromWhId] = useState(db.warehouses[0]?.id || '');
  const [toWhId, setToWhId] = useState(db.warehouses[1]?.id || db.warehouses[0]?.id || '');
  const [transferQty, setTransferQty] = useState<number>(1);
  const [transferNotes, setTransferNotes] = useState('');

  // Adjust form state
  const [adjustProductId, setAdjustProductId] = useState(db.products[0]?.id || '');
  const [actualQty, setActualQty] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState('مطابقة الجرد الدوري');

  // Filtered products
  const filteredProducts = db.products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.barcode?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Save new Warehouse
  const handleSaveWarehouse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!whName.trim()) return alert('اكتب اسم المخزن');
    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const newWh: WarehouseType = {
      id: generateId('wh'),
      name: whName.trim(),
      location: whLocation.trim()
    };
    updated.warehouses.push(newWh);
    logAudit(updated, 'إضافة مخزن جديد', whName);
    onUpdateDb(updated);
    setWhName('');
    setWhLocation('');
    setShowWhModal(false);
  };

  // Stock Transfer between Warehouses
  const handleSaveTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (fromWhId === toWhId) return alert('اختر مخزنين مختلفين للتحويل');
    if (transferQty <= 0) return alert('الكمية يجب أن تكون أكبر من صفر');

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const prod = updated.products.find(p => p.id === transferProductId);
    if (!prod) return;

    if (prod.currentQty < transferQty) {
      alert('الرصيد الإجمالي للصنف لا يكفي لإتمام هذا التحويل');
      return;
    }

    const fromWh = updated.warehouses.find(w => w.id === fromWhId);
    const toWh = updated.warehouses.find(w => w.id === toWhId);
    const tId = generateId('trf');

    const transferRecord: StockTransfer = {
      id: tId,
      date: getTodayDate(),
      productId: prod.id,
      productName: prod.name,
      fromWarehouseId: fromWhId,
      toWarehouseId: toWhId,
      qty: transferQty,
      notes: transferNotes
    };

    updated.transfers.unshift(transferRecord);

    // Stock movements (out from source, in to destination)
    updated.stockMovements.unshift({
      id: generateId('sm'),
      date: getTodayDate(),
      productId: prod.id,
      productName: prod.name,
      warehouseId: fromWhId,
      warehouseName: fromWh ? fromWh.name : 'مخزن المصدر',
      qtyChange: -transferQty,
      balanceAfter: prod.currentQty,
      unitCost: prod.avgCost || prod.buyPrice,
      type: 'transfer_out',
      refNumber: `TRF-${tId.slice(-4)}`,
      sourceId: tId
    });

    updated.stockMovements.unshift({
      id: generateId('sm'),
      date: getTodayDate(),
      productId: prod.id,
      productName: prod.name,
      warehouseId: toWhId,
      warehouseName: toWh ? toWh.name : 'مخزن الوجهة',
      qtyChange: transferQty,
      balanceAfter: prod.currentQty,
      unitCost: prod.avgCost || prod.buyPrice,
      type: 'transfer_in',
      refNumber: `TRF-${tId.slice(-4)}`,
      sourceId: tId
    });

    logAudit(updated, 'تحويل مخزون بين مستودعين', `${prod.name} كمية ${transferQty} من ${fromWh?.name} إلى ${toWh?.name}`);
    onUpdateDb(updated);
    setShowTransferModal(false);
  };

  // Stock Adjustment (الجرد والتسويات)
  const handleSaveAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const prod = updated.products.find(p => p.id === adjustProductId);
    if (!prod) return;

    const systemQty = prod.currentQty;
    const diff = actualQty - systemQty;
    if (diff === 0) return alert('الرصيد الفعلي مطابق للرصيد الدفتري، لا يوجد فرق تسوية');

    const adjId = generateId('adj');
    const unitCost = prod.avgCost || prod.buyPrice;
    const diffValue = Math.abs(diff) * unitCost;

    const adjustmentRecord: StockAdjustment = {
      id: adjId,
      date: getTodayDate(),
      productId: prod.id,
      productName: prod.name,
      systemQty,
      actualQty,
      diffQty: diff,
      unitCost,
      reason: adjustReason
    };

    // Update physical product qty
    prod.currentQty = actualQty;
    updated.adjustments.unshift(adjustmentRecord);

    // Stock Movement
    updated.stockMovements.unshift({
      id: generateId('sm'),
      date: getTodayDate(),
      productId: prod.id,
      productName: prod.name,
      warehouseId: updated.warehouses[0]?.id || 'wh_main',
      warehouseName: 'المخزن الرئيسي',
      qtyChange: diff,
      balanceAfter: prod.currentQty,
      unitCost,
      type: 'adjustment',
      refNumber: `ADJ-${adjId.slice(-4)}`,
      sourceId: adjId
    });

    // Accounting Journal Entry:
    // If deficit (diff < 0): Debit Inventory Variance / Loss (5301), Credit Inventory (1301)
    // If surplus (diff > 0): Debit Inventory (1301), Credit Other Revenue (4201)
    const invAcc = updated.accounts.find(a => a.id === 'acc_inv')!;
    const adjAcc = updated.accounts.find(a => a.id === 'acc_adj') || updated.accounts.find(a => a.id === 'acc_exp')!;
    const revAcc = updated.accounts.find(a => a.id === 'acc_other_rev')!;

    const lines = [];
    if (diff < 0) {
      lines.push({
        accountId: adjAcc.id,
        accountCode: adjAcc.code,
        accountName: adjAcc.name,
        debit: diffValue,
        credit: 0,
        notes: `عجز تسوية جرد للصنف ${prod.name}`
      });
      lines.push({
        accountId: invAcc.id,
        accountCode: invAcc.code,
        accountName: invAcc.name,
        debit: 0,
        credit: diffValue,
        notes: `تخفيض قيمة المخزون الدفتري`
      });
    } else {
      lines.push({
        accountId: invAcc.id,
        accountCode: invAcc.code,
        accountName: invAcc.name,
        debit: diffValue,
        credit: 0,
        notes: `زيادة وفائض جرد للصنف ${prod.name}`
      });
      lines.push({
        accountId: revAcc.id,
        accountCode: revAcc.code,
        accountName: revAcc.name,
        debit: 0,
        credit: diffValue,
        notes: `أرباح فروق جرد`
      });
    }

    updated.journals.unshift({
      id: generateId('j'),
      number: `J-${Date.now().toString().slice(-6)}`,
      date: getTodayDate(),
      description: `قيد تسوية جرد للصنف ${prod.name} (${diff > 0 ? 'زيادة' : 'عجز'} ${Math.abs(diff)} ${prod.unit})`,
      sourceType: 'adjustment',
      sourceId: adjId,
      lines,
      createdAt: new Date().toISOString()
    });

    logAudit(updated, 'تسوية جرد مخزني', `${prod.name}: الرصيد السابق ${systemQty} -> الرصيد الفعلي ${actualQty} (فرق: ${diff})`);
    onUpdateDb(updated);
    setShowAdjustModal(false);
  };

  const handleDeleteProduct = (p: Product) => {
    const hasMovements = db.stockMovements.some(sm => sm.productId === p.id);
    if (hasMovements) {
      alert('لا يمكن حذف الصنف لوجود حركات وفواتير سابقة مرتبطة به.');
      return;
    }
    if (!confirm(`هل ترغب في حذف الصنف "${p.name}"؟`)) return;

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    updated.products = updated.products.filter(item => item.id !== p.id);
    onUpdateDb(updated);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. PRODUCTS SUBPAGE */}
      {subPage === 'products' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <Package className="w-6 h-6" />
                <span>دليل الأصناف والمستودعات</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                تعريف الأصناف، الباركود، أسعار البيع والتكلفة، والحد الأدنى للطلب
              </p>
            </div>
            <button
              onClick={() => onOpenProductModal()}
              className="px-4 py-2 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة صنف جديد</span>
            </button>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="relative max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                placeholder="بحث بالاسم، الكود، أو الباركود..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pr-9 pl-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-hidden focus:border-black"
              />
            </div>
          </div>

          {/* Products Responsive Card System (No Horizontal Scroll) */}
          {filteredProducts.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-2xs">
              <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <div className="text-sm font-bold text-slate-700">لا توجد أصناف تطابق البحث</div>
              <button
                onClick={() => onOpenProductModal()}
                className="mt-3 px-4 py-2 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة صنف جديد</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {filteredProducts.map(p => {
                const isLow = p.currentQty <= p.minStock;
                const val = p.currentQty * (p.avgCost || p.buyPrice);

                return (
                  <div
                    key={p.id}
                    className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between p-3.5"
                  >
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                      <div>
                        <h3 className="font-black text-sm text-slate-900">
                          {p.name}
                        </h3>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-2">
                          <span>كود: {p.code}</span>
                          {p.barcode && <span>| باركود: {p.barcode}</span>}
                        </div>
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                          isLow
                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        }`}
                      >
                        {isLow ? 'منخفض الرصيد' : 'متوفر بالمستودع'}
                      </span>
                    </div>

                    {/* Card Body */}
                    <div className="py-2.5 space-y-2 text-xs">
                      {/* Price Grid */}
                      <div className="grid grid-cols-3 gap-1.5 text-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <div>
                          <span className="text-[10px] text-slate-500 block">سعر القطاعي</span>
                          <span className="font-bold font-mono text-slate-950">
                            {formatMoney(p.sellPrice, db.settings.currency)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">سعر الجملة</span>
                          <span className="font-bold font-mono text-slate-700">
                            {formatMoney(p.wholesalePrice, db.settings.currency)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">التكلفة / شراء</span>
                          <span className="font-bold font-mono text-slate-600">
                            {formatMoney(p.buyPrice, db.settings.currency)}
                          </span>
                        </div>
                      </div>

                      {/* Stock & Valuation */}
                      <div className="flex items-center justify-between pt-1">
                        <div>
                          <span className="text-slate-500 text-[11px] block">الرصيد الفعلي:</span>
                          <span className="text-base font-black font-mono text-slate-950">
                            {p.currentQty} <span className="text-xs font-normal text-slate-500">{p.unit}</span>
                          </span>
                        </div>

                        <div className="text-left">
                          <span className="text-slate-500 text-[11px] block">قيمة المخزون:</span>
                          <span className="text-xs font-bold font-mono text-slate-800">
                            {formatMoney(val, db.settings.currency)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                        {p.category || 'عامة'}
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onOpenProductModal(p)}
                          className="px-2.5 py-1 text-slate-700 hover:text-black hover:bg-slate-100 rounded-md text-xs font-bold transition-all flex items-center gap-1"
                          title="تعديل بيانات الصنف"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>تعديل</span>
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(p)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                          title="حذف الصنف"
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
        </>
      )}

      {/* 2. WAREHOUSES SUBPAGE */}
      {subPage === 'warehouses' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <Warehouse className="w-6 h-6" />
                <span>إدارة الفروع والمخازن والتحويلات</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                توزيع البضائع على المستودعات وتحويل الأرصدة الداخلية
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowTransferModal(true)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <ArrowLeftRight className="w-4 h-4" />
                <span>تحويل بين المخازن</span>
              </button>
              <button
                onClick={() => setShowWhModal(true)}
                className="px-3.5 py-2 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>مخزن جديد</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {db.warehouses.map(w => (
              <div key={w.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <Warehouse className="w-4 h-4 text-slate-500" />
                    <span>{w.name}</span>
                    {w.isDefault && (
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-800 text-[9px] font-bold rounded">
                        افتراضي
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">{w.location || 'لا يوجد موقع مسجل'}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Transfers History (Responsive Card System) */}
          <div className="mt-6 space-y-3">
            <h3 className="text-xs font-bold text-slate-800">
              سجل التحويلات بين المخازن
            </h3>
            {db.transfers.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-slate-200 shadow-2xs text-slate-400 text-xs">
                لا توجد تحويلات بين المخازن بعد
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {db.transfers.map(t => (
                  <div key={t.id} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="font-bold text-xs text-slate-900">{t.productName}</span>
                      <span className="font-mono text-[11px] text-slate-500">{t.date}</span>
                    </div>
                    <div className="text-xs space-y-1">
                      <div className="flex items-center justify-between text-slate-600">
                        <span>من مستودع:</span>
                        <span className="font-medium text-slate-900">{db.warehouses.find(w => w.id === t.fromWarehouseId)?.name || 'مخزن'}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>إلى مستودع:</span>
                        <span className="font-medium text-slate-900">{db.warehouses.find(w => w.id === t.toWarehouseId)?.name || 'مخزن'}</span>
                      </div>
                      <div className="bg-slate-50 p-1.5 rounded flex items-center justify-between">
                        <span className="text-[11px] text-slate-500">الكمية المحولة:</span>
                        <span className="font-mono font-black text-xs text-slate-950">{t.qty}</span>
                      </div>
                    </div>
                    {t.notes && <p className="text-[10px] text-slate-400 truncate">{t.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* 3. STOCK MOVEMENTS (كارت حركة الصنف - Responsive Card System) */}
      {subPage === 'stock' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <ArrowLeftRight className="w-6 h-6" />
                <span>كارت حركة المخزون الشامل</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                تتبع كل صادر ووارد مع الرصيد التراكمي الدقيق بنظام الكروت
              </p>
            </div>
          </div>

          {db.stockMovements.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-2xs text-slate-400 text-xs">
              لا توجد حركات مخزنية مسجلة حتى الآن
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {db.stockMovements.map(sm => {
                const isPositive = sm.qtyChange > 0;
                return (
                  <div
                    key={sm.id}
                    className="bg-white p-3.5 rounded-xl border border-slate-200 hover:border-slate-300 shadow-2xs hover:shadow-xs transition-all space-y-2"
                  >
                    <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                      <div>
                        <span className="font-bold text-xs text-slate-900 block">{sm.productName}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{sm.date} • {sm.refNumber}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        sm.type === 'sale' ? 'bg-slate-100 text-slate-900' :
                        sm.type === 'purchase' ? 'bg-emerald-100 text-emerald-800' :
                        sm.type === 'adjustment' ? 'bg-purple-100 text-purple-800' :
                        'bg-slate-200 text-slate-800'
                      }`}>
                        {sm.type === 'sale' ? 'فاتورة بيع' :
                         sm.type === 'purchase' ? 'فاتورة شراء' :
                         sm.type === 'sale_return' ? 'مرتجع مبيعات' :
                         sm.type === 'purchase_return' ? 'مرتجع مشتريات' :
                         sm.type === 'adjustment' ? 'تسوية جرد' : sm.type}
                      </span>
                    </div>

                    <div className="text-xs space-y-1.5">
                      <div className="flex items-center justify-between text-slate-600">
                        <span>المستودع:</span>
                        <span className="font-medium text-slate-800">{sm.warehouseName}</span>
                      </div>

                      <div className="bg-slate-50 p-2 rounded-lg grid grid-cols-3 gap-1 text-center border border-slate-100">
                        <div>
                          <span className="text-[10px] text-slate-500 block">حركة الكمية</span>
                          <span className={`font-mono font-black text-xs ${isPositive ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {isPositive ? `+${sm.qtyChange}` : sm.qtyChange}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">الرصيد بعدها</span>
                          <span className="font-mono font-bold text-xs text-slate-950">{sm.balanceAfter}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">تكلفة الوحدة</span>
                          <span className="font-mono text-xs text-slate-700">{formatMoney(sm.unitCost, db.settings.currency)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 4. PHYSICAL INVENTORY & ADJUSTMENT (الجرد والتسويات) */}
      {subPage === 'inventory' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <Calculator className="w-6 h-6" />
                <span>الجرد الفعلي والتسويات المخزنية</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                مطابقة الرصيد الدفتري مع العد الفعلي بالمستودع وإثبات العجز أو الزيادة بقيد محاسبي
              </p>
            </div>
            <button
              onClick={() => {
                setAdjustProductId(db.products[0]?.id || '');
                setActualQty(db.products[0]?.currentQty || 0);
                setShowAdjustModal(true);
              }}
              className="px-4 py-2 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>إجراء تسوية جردية جديدة</span>
            </button>
          </div>

          {/* Adjustments Responsive Card System */}
          {db.adjustments.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-2xs text-slate-400 text-xs">
              لا توجد تسويات جرد مسجلة
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {db.adjustments.map(adj => {
                const isShortage = adj.diffQty < 0;
                return (
                  <div key={adj.id} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                    <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                      <div>
                        <span className="font-bold text-xs text-slate-900 block">{adj.productName}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{adj.date}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        isShortage ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {isShortage ? 'عجز مخزني' : 'زيادة مخزنية'}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-2 rounded-lg grid grid-cols-3 gap-1 text-center border border-slate-100 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 block">الدفتري</span>
                        <span className="font-mono text-slate-700">{adj.systemQty}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">الفعلي</span>
                        <span className="font-mono font-bold text-slate-900">{adj.actualQty}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">الفرق</span>
                        <span className={`font-mono font-black ${isShortage ? 'text-rose-700' : 'text-emerald-700'}`}>
                          {adj.diffQty > 0 ? `+${adj.diffQty}` : adj.diffQty}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-slate-500">قيمة فرق الجرد:</span>
                      <span className="font-mono font-black text-slate-950">
                        {formatMoney(Math.abs(adj.diffQty) * adj.unitCost, db.settings.currency)}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600 bg-slate-50 p-1.5 rounded">{adj.reason}</p>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 5. PRICES SUBPAGE (Responsive Card System) */}
      {subPage === 'prices' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <TrendingDown className="w-6 h-6" />
                <span>مقارنة وتقلبات أسعار الشراء</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                تتبع التغيرات في أسعار توريد المنتجات عبر الزمن ومتوسط التكلفة
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {db.products.map(p => {
              const hist = p.priceHistory || [];
              const lastPrice = hist.length > 0 ? hist[hist.length - 1].price : p.buyPrice;
              const prevPrice = hist.length > 1 ? hist[hist.length - 2].price : lastPrice;
              const margin = p.sellPrice > 0 ? (((p.sellPrice - (p.avgCost || p.buyPrice)) / p.sellPrice) * 100).toFixed(1) : '0';

              return (
                <div key={p.id} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="font-bold text-xs text-slate-900">{p.name}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      هامش: {margin}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-50 p-2 rounded border border-slate-100">
                      <span className="text-[10px] text-slate-500 block">آخر سعر توريد</span>
                      <span className="font-mono font-bold text-slate-900">{formatMoney(lastPrice, db.settings.currency)}</span>
                    </div>
                    <div className="bg-slate-50 p-2 rounded border border-slate-100">
                      <span className="text-[10px] text-slate-500 block">السعر السابق</span>
                      <span className="font-mono text-slate-600">{formatMoney(prevPrice, db.settings.currency)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-slate-500">متوسط التكلفة:</span>
                    <span className="font-mono font-bold text-slate-800">{formatMoney(p.avgCost || p.buyPrice, db.settings.currency)}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-1.5">
                    <span className="text-slate-500">سعر البيع الحالي:</span>
                    <span className="font-mono font-black text-slate-950">{formatMoney(p.sellPrice, db.settings.currency)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Warehouse Modal */}
      {showWhModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl w-full max-w-sm p-4 space-y-3">
            <h2 className="text-sm font-black text-slate-900">إضافة مستودع / فرع جديد</h2>
            <form onSubmit={handleSaveWarehouse} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">اسم المخزن</label>
                <input
                  type="text"
                  required
                  value={whName}
                  onChange={e => setWhName(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">الموقع / العنوان</label>
                <input
                  type="text"
                  value={whLocation}
                  onChange={e => setWhLocation(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowWhModal(false)} className="px-3 py-1.5 bg-slate-100 rounded text-xs">إلغاء</button>
                <button type="submit" className="px-4 py-1.5 bg-black text-white rounded text-xs font-bold">حفظ</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl w-full max-w-md p-4 space-y-3">
            <h2 className="text-sm font-black text-slate-900">تحويل بضاعة بين المستودعات</h2>
            <form onSubmit={handleSaveTransfer} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">الصنف المراد تحويله</label>
                <select
                  value={transferProductId}
                  onChange={e => setTransferProductId(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  {db.products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (رصيد: {p.currentQty})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">من مخزن</label>
                  <select
                    value={fromWhId}
                    onChange={e => setFromWhId(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    {db.warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">إلى مخزن</label>
                  <select
                    value={toWhId}
                    onChange={e => setToWhId(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    {db.warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">الكمية المحولة</label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={transferQty}
                  onChange={e => setTransferQty(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowTransferModal(false)} className="px-3 py-1.5 bg-slate-100 rounded text-xs">إلغاء</button>
                <button type="submit" className="px-4 py-1.5 bg-black text-white rounded text-xs font-bold">تنفيذ التحويل</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjustment Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl w-full max-w-md p-4 space-y-3">
            <h2 className="text-sm font-black text-slate-900">تسوية جردية لمطابقة الرصيد الفعلي</h2>
            <form onSubmit={handleSaveAdjustment} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">الصنف</label>
                <select
                  value={adjustProductId}
                  onChange={e => {
                    setAdjustProductId(e.target.value);
                    const prod = db.products.find(p => p.id === e.target.value);
                    if (prod) setActualQty(prod.currentQty);
                  }}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  {db.products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (دفتري: {p.currentQty} {p.unit})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">الرصيد الفعلي بعد الجرد</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={actualQty}
                  onChange={e => setActualQty(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-black"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">سبب التسوية</label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAdjustModal(false)} className="px-3 py-1.5 bg-slate-100 rounded text-xs">إلغاء</button>
                <button type="submit" className="px-4 py-1.5 bg-black text-white rounded text-xs font-bold">تسوية وإصدار قيد</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
