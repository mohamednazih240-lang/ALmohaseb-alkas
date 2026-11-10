import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Package,
  Building2,
  Info,
  Calculator,
  Check,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  TrendingDown,
  Percent,
  Boxes
} from 'lucide-react';
import {
  AccountingDB,
  Product
} from '../types/accounting';
import {
  generateId,
  getTodayDate,
  logAudit,
  getProductForBranch,
  updateProductBranchData,
  isDuplicateProduct
} from '../services/accountingStorage';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: Product | null;
  db: AccountingDB;
  onUpdateDb: (updated: AccountingDB) => void;
  activeBranchId?: string;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  isOpen,
  onClose,
  product,
  db,
  onUpdateDb,
  activeBranchId
}) => {
  const branches = db.branches || [{ id: 'br_main', name: 'الفرع الرئيسي', code: 'BR-01', isMain: true }];
  const [selectedBranchId, setSelectedBranchId] = useState<string>(activeBranchId || branches[0]?.id || 'br_main');

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [barcode, setBarcode] = useState('');
  const [unit, setUnit] = useState('قطعة');
  const [buyPrice, setBuyPrice] = useState<number>(0);
  const [sellPrice, setSellPrice] = useState<number>(0);
  const [wholesalePrice, setWholesalePrice] = useState<number>(0);
  const [minStock, setMinStock] = useState<number>(5);
  const [initialQty, setInitialQty] = useState<number>(0);

  // Success Notification for continuous entry
  const [continuousNotification, setContinuousNotification] = useState<string | null>(null);

  // Reverse Calculation State for Purchase Price / Cost
  const [showReverseCalc, setShowReverseCalc] = useState(false);
  const [reverseMode, setReverseMode] = useState<'carton' | 'margin'>('carton');
  const [cartonTotalCost, setCartonTotalCost] = useState('');
  const [cartonUnitsCount, setCartonUnitsCount] = useState('');
  const [cartonShippingCost, setCartonShippingCost] = useState('');
  const [marginBaseSellPrice, setMarginBaseSellPrice] = useState('');
  const [marginPercentage, setMarginPercentage] = useState('20');

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Sync selected branch if activeBranchId changes
  useEffect(() => {
    if (activeBranchId) {
      setSelectedBranchId(activeBranchId);
    }
  }, [activeBranchId, isOpen]);

  // Load product branch-specific pricing and stock when product or selected branch changes
  useEffect(() => {
    if (product) {
      setName(product.name);
      setCode(product.code);
      setBarcode(product.barcode || '');
      setUnit(product.unit || 'قطعة');

      // Load branch-specific numbers
      const branchProd = getProductForBranch(product, selectedBranchId);
      setBuyPrice(branchProd.buyPrice);
      setSellPrice(branchProd.sellPrice);
      setWholesalePrice(branchProd.wholesalePrice);
      setMinStock(branchProd.minStock);
      setInitialQty(branchProd.currentQty);
      setContinuousNotification(null);
    } else {
      const nextCode = `PRD-${100 + db.products.length + 1}`;
      setName('');
      setCode(nextCode);
      setBarcode('');
      setUnit('قطعة');
      setBuyPrice(0);
      setSellPrice(0);
      setWholesalePrice(0);
      setMinStock(5);
      setInitialQty(0);
    }
  }, [product, isOpen, db.products.length, selectedBranchId]);

  // Auto-focus name field whenever modal opens or resets
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        nameInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Reverse Calculations computed on the fly
  const calculatedCartonUnitCost = useMemo(() => {
    const total = (parseFloat(cartonTotalCost) || 0) + (parseFloat(cartonShippingCost) || 0);
    const count = parseFloat(cartonUnitsCount) || 0;
    if (count <= 0 || total <= 0) return 0;
    return total / count;
  }, [cartonTotalCost, cartonShippingCost, cartonUnitsCount]);

  const calculatedMarginBuyPrice = useMemo(() => {
    const retail = parseFloat(marginBaseSellPrice) || sellPrice || 0;
    const margin = parseFloat(marginPercentage) || 0;
    if (retail <= 0) return 0;
    if (margin >= 100) return 0;
    // Buy cost = Retail ÷ (1 + Margin% / 100)
    return retail / (1 + margin / 100);
  }, [marginBaseSellPrice, sellPrice, marginPercentage]);

  if (!isOpen) return null;

  const currentBranch = branches.find(b => b.id === selectedBranchId) || branches[0];

  const handleSave = (e?: React.FormEvent, shouldClose: boolean = false) => {
    if (e) e.preventDefault();
    if (!name.trim()) {
      alert('يرجى كتابة اسم الصنف');
      nameInputRef.current?.focus();
      return;
    }

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;

    // Strict duplicate check for code & barcode
    const dupCheck = isDuplicateProduct(updated, code.trim(), barcode.trim(), product?.id);
    if (dupCheck.isDuplicate) {
      alert(`⚠️ منع التكرار: ${dupCheck.reason}`);
      return;
    }

    const branchName = currentBranch?.name || 'الفرع الرئيسي';

    if (product) {
      // Editing existing product
      const idx = updated.products.findIndex(p => p.id === product.id);
      if (idx !== -1) {
        // 1. Update master metadata (name, code, barcode, unit)
        let targetProd = {
          ...updated.products[idx],
          name: name.trim(),
          code: code.trim(),
          barcode: barcode.trim(),
          unit,
        };

        const prevBp = getProductForBranch(updated.products[idx], selectedBranchId);
        const qtyDiff = Number((initialQty - (prevBp.currentQty ?? updated.products[idx].currentQty ?? 0)).toFixed(4));

        // 2. Update branch-specific pricing and stock for the selected branch only!
        targetProd = updateProductBranchData(targetProd, selectedBranchId, {
          buyPrice,
          sellPrice,
          wholesalePrice,
          minStock,
          currentQty: initialQty,
          avgCost: buyPrice > 0 ? buyPrice : targetProd.avgCost
        });

        updated.products[idx] = targetProd;

        if (Math.abs(qtyDiff) > 0.0001) {
          const whId = updated.warehouses[0]?.id || 'wh_mawan';
          const wh = updated.warehouses.find(w => w.id === whId);
          const adjId = generateId('adj_edit');
          updated.stockMovements.unshift({
            id: generateId('sm'),
            date: getTodayDate(),
            productId: targetProd.id,
            productName: targetProd.name,
            warehouseId: whId,
            warehouseName: wh ? wh.name : 'المخزن الرئيسي',
            qtyChange: qtyDiff,
            balanceAfter: initialQty,
            unitCost: buyPrice > 0 ? buyPrice : (targetProd.avgCost || targetProd.buyPrice || 0),
            type: 'adjustment',
            refNumber: `تعديل يدوي`,
            sourceId: adjId,
            branchId: selectedBranchId,
            branchName
          });
        }

        logAudit(updated, `تعديل صنف في ${branchName}`, `${name.trim()} (سعر: ${sellPrice} | مخزون: ${initialQty})`);
      }
      onUpdateDb(updated);
      onClose();
    } else {
      // Adding NEW product
      const newProdId = generateId('prod');
      const newProduct: Product = {
        id: newProdId,
        name: name.trim(),
        code: code.trim(),
        barcode: barcode.trim(),
        unit,
        buyPrice: selectedBranchId === 'br_main' ? buyPrice : 0,
        sellPrice: selectedBranchId === 'br_main' ? sellPrice : 0,
        wholesalePrice: selectedBranchId === 'br_main' ? wholesalePrice : 0,
        minStock: minStock || 5,
        currentQty: selectedBranchId === 'br_main' ? initialQty : 0,
        avgCost: buyPrice,
        priceHistory: buyPrice > 0 ? [{ date: getTodayDate(), price: buyPrice, qty: initialQty, branchId: selectedBranchId }] : [],
        branchesData: {
          [selectedBranchId]: {
            currentQty: initialQty,
            buyPrice,
            sellPrice,
            wholesalePrice,
            minStock: minStock || 5,
            avgCost: buyPrice
          }
        }
      };

      updated.products.push(newProduct);

      // If initial stock provided for this branch, log opening movement with branchId
      if (initialQty > 0) {
        const whId = updated.warehouses[0]?.id || 'wh_main';
        const wh = updated.warehouses.find(w => w.id === whId);

        updated.stockMovements.push({
          id: generateId('sm'),
          date: getTodayDate(),
          productId: newProdId,
          productName: newProduct.name,
          warehouseId: whId,
          warehouseName: wh ? wh.name : 'المخزن الرئيسي',
          qtyChange: initialQty,
          balanceAfter: initialQty,
          unitCost: buyPrice,
          type: 'opening',
          refNumber: `افتتاحي - ${branchName}`,
          sourceId: newProdId,
          branchId: selectedBranchId,
          branchName: branchName
        });

        // Journal: Debit Inventory (1301), Credit Capital / Opening Balance (3101)
        const totalValue = initialQty * buyPrice;
        if (totalValue > 0) {
          const invAcc = updated.accounts.find(a => a.id === 'acc_inv')!;
          const eqAcc = updated.accounts.find(a => a.id === 'acc_equity')!;

          updated.journals.push({
            id: generateId('j'),
            number: `J-${Date.now().toString().slice(-6)}`,
            date: getTodayDate(),
            description: `إثبات رصيد بضاعة أول المدة للصنف ${newProduct.name} بفرع ${branchName}`,
            sourceType: 'manual',
            sourceId: newProdId,
            lines: [
              { accountId: invAcc.id, accountCode: invAcc.code, accountName: invAcc.name, debit: totalValue, credit: 0, notes: `بضاعة أول المدة (${branchName})` },
              { accountId: eqAcc.id, accountCode: eqAcc.code, accountName: eqAcc.name, debit: 0, credit: totalValue, notes: `رأس مال بضاعة` }
            ],
            createdAt: new Date().toISOString()
          });
        }
      }

      logAudit(updated, `إضافة صنف جديد بفرع ${branchName}`, `${name} (${initialQty} ${unit})`);

      // Update parent DB state
      onUpdateDb(updated);

      if (shouldClose) {
        onClose();
        return;
      }

      // Continuous entry: Do NOT close the modal, clear fields completely and prepare for next item
      const savedItemName = name.trim();
      setName('');
      const nextCode = `PRD-${100 + updated.products.length + 1}`;
      setCode(nextCode);
      setBarcode('');
      setUnit('قطعة');
      setBuyPrice(0);
      setSellPrice(0);
      setWholesalePrice(0);
      setMinStock(5);
      setInitialQty(0);
      setShowReverseCalc(false);
      setCartonTotalCost('');
      setCartonUnitsCount('');
      setCartonShippingCost('');
      setMarginBaseSellPrice('');

      setContinuousNotification(`✓ تم حفظ الصنف "${savedItemName}" بنجاح! تم تفريغ الكارت وجاهز لإدخال صنف جديد.`);
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50 rounded-t-2xl">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-600 text-white rounded-lg shadow-2xs">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">
                {product ? 'تعديل بيانات الصنف والتسعير' : 'إضافة صنف جديد للنظام'}
              </h2>
              <span className="text-[11px] text-slate-500 font-medium">
                {!product ? 'إدخال مستمر وسريع بدون مغادرة النافذة' : 'تحديث أسعار وتكاليف الصنف'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-200 text-slate-500 hover:text-slate-900 rounded-lg transition-colors cursor-pointer"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={e => handleSave(e, false)} className="p-4 space-y-3.5 overflow-y-auto flex-1">
          {/* Continuous addition success banner */}
          {continuousNotification && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between text-xs text-emerald-900 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{continuousNotification}</span>
              </div>
              <button
                type="button"
                onClick={() => setContinuousNotification(null)}
                className="text-emerald-700 hover:text-emerald-950 p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Branch Specificity Selector & Notice */}
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-blue-900 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-blue-600" />
                <span>الفرع المستهدف للتسعير والمخزون:</span>
              </label>
              <select
                value={selectedBranchId}
                onChange={e => setSelectedBranchId(e.target.value)}
                className="bg-white border border-blue-300 text-blue-900 font-bold text-xs rounded-lg px-2.5 py-1 outline-none shadow-2xs"
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name} {b.isMain ? '(الرئيسي)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-start gap-1.5 text-[10.5px] text-blue-800">
              <Info className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
              <span>
                الأصناف موحدة في كل الفروع، لكن <strong>الأعداد والأسعار مستقلة تماماً</strong> وتدخل حسب هذا الفرع ولا تؤثر على أي فرع آخر.
              </span>
            </div>
          </div>

          {/* Product Name */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">اسم الصنف الكامل *</label>
            <input
              ref={nameInputRef}
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="مثال: شاشة سامسونج 27 بوصة"
              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:bg-white focus:border-blue-500 outline-none transition-colors"
            />
          </div>

          {/* Code, Barcode, Unit */}
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">كود الصنف</label>
              <input
                type="text"
                required
                value={code}
                onChange={e => setCode(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-center focus:bg-white focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">الباركود</label>
              <input
                type="text"
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                placeholder="622..."
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-center focus:bg-white focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">الوحدة</label>
              <input
                type="text"
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-center focus:bg-white focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Pricing Section with Reverse Cost Calculation */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="flex items-center justify-between">
              <span className="block text-[11px] font-black text-slate-900">
                تسعير الصنف الخاص بـ ({currentBranch.name}):
              </span>
              {/* Backward / Reverse calculation button */}
              <button
                type="button"
                onClick={() => setShowReverseCalc(prev => !prev)}
                className={`text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                  showReverseCalc
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200'
                }`}
                title="حساب سعر الشراء والتكلفة عكسياً من إجمالي الفاتورة أو الكرتونة أو نسبة الربح"
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>الحساب العكسي لسعر الشراء 🧮</span>
              </button>
            </div>

            {/* REVERSE CALCULATION PANEL */}
            {showReverseCalc && (
              <div className="p-3 bg-gradient-to-br from-blue-50/90 to-indigo-50/70 border border-blue-300/80 rounded-xl space-y-2.5 shadow-xs animate-in fade-in duration-150">
                <div className="flex items-center justify-between border-b border-blue-200 pb-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-black text-blue-950">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    <span>أداة الحساب العكسي لتكلفة شراء الصنف:</span>
                  </div>
                  {/* Segmented Mode Selector */}
                  <div className="inline-flex rounded-lg border border-blue-200 bg-white p-0.5 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setReverseMode('carton')}
                      className={`px-2 py-0.5 rounded font-bold transition-all cursor-pointer ${
                        reverseMode === 'carton' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      من إجمالي الكرتونة / الدفعة
                    </button>
                    <button
                      type="button"
                      onClick={() => setReverseMode('margin')}
                      className={`px-2 py-0.5 rounded font-bold transition-all cursor-pointer ${
                        reverseMode === 'margin' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      من سعر البيع وهامش الربح
                    </button>
                  </div>
                </div>

                {reverseMode === 'carton' ? (
                  <div className="space-y-2 text-xs">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                          إجمالي سعر الكرتونة / الدفعة
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          placeholder="مثال: 1200"
                          value={cartonTotalCost}
                          onFocus={e => e.target.select()}
                          onChange={e => setCartonTotalCost(e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded-md text-xs font-mono font-bold text-center focus:border-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                          عدد القطع بالكرتونة
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="1"
                          placeholder="مثال: 24"
                          value={cartonUnitsCount}
                          onFocus={e => e.target.select()}
                          onChange={e => setCartonUnitsCount(e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded-md text-xs font-mono font-bold text-center focus:border-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                          مصاريف نقل وشحن إضافية
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          placeholder="0.00"
                          value={cartonShippingCost}
                          onFocus={e => e.target.select()}
                          onChange={e => setCartonShippingCost(e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded-md text-xs font-mono font-bold text-center focus:border-blue-500 outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-blue-200/50">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-600 font-bold text-xs">سعر شراء القطعة المحسوب:</span>
                        <span className="font-mono font-black text-blue-900 text-sm bg-white px-2 py-0.5 rounded border border-blue-200">
                          {calculatedCartonUnitCost > 0 ? calculatedCartonUnitCost.toFixed(2) : '0.00'} {db.settings.currency}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={calculatedCartonUnitCost <= 0}
                        onClick={() => {
                          if (calculatedCartonUnitCost > 0) {
                            setBuyPrice(Number(calculatedCartonUnitCost.toFixed(2)));
                            setShowReverseCalc(false);
                          }
                        }}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>✓ اعتماد كسعر شراء للقطعة</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                          سعر البيع قطاعي المستهدف
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          placeholder="مثال: 100"
                          value={marginBaseSellPrice || (sellPrice > 0 ? String(sellPrice) : '')}
                          onFocus={e => e.target.select()}
                          onChange={e => setMarginBaseSellPrice(e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded-md text-xs font-mono font-bold text-center focus:border-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                          نسبة هامش الربح المطلوب (%)
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          placeholder="مثال: 20"
                          value={marginPercentage}
                          onFocus={e => e.target.select()}
                          onChange={e => setMarginPercentage(e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded-md text-xs font-mono font-bold text-center focus:border-blue-500 outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-blue-200/50">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-600 font-bold text-xs">سعر الشراء المستنتج:</span>
                        <span className="font-mono font-black text-blue-900 text-sm bg-white px-2 py-0.5 rounded border border-blue-200">
                          {calculatedMarginBuyPrice > 0 ? calculatedMarginBuyPrice.toFixed(2) : '0.00'} {db.settings.currency}
                        </span>
                        <span className="text-[10px] text-emerald-700 font-bold mr-1">
                          (ربح: {(Number(marginBaseSellPrice || sellPrice) - calculatedMarginBuyPrice).toFixed(2)})
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={calculatedMarginBuyPrice <= 0}
                        onClick={() => {
                          if (calculatedMarginBuyPrice > 0) {
                            setBuyPrice(Number(calculatedMarginBuyPrice.toFixed(2)));
                            setShowReverseCalc(false);
                          }
                        }}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>✓ اعتماد كسعر شراء للقطعة</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Price Inputs Grid */}
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">سعر الشراء / التكلفة</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={buyPrice === 0 ? '' : buyPrice}
                  placeholder="0.00"
                  onFocus={e => e.target.select()}
                  onChange={e => setBuyPrice(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-center focus:bg-white focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">سعر البيع قطاعي</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={sellPrice === 0 ? '' : sellPrice}
                  placeholder="0.00"
                  onFocus={e => e.target.select()}
                  onChange={e => setSellPrice(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-center text-emerald-700 focus:bg-white focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">سعر الجملة</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={wholesalePrice === 0 ? '' : wholesalePrice}
                  placeholder="0.00"
                  onFocus={e => e.target.select()}
                  onChange={e => setWholesalePrice(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-center focus:bg-white focus:border-blue-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Stock Quantities */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                رصيد المخزون بـ ({currentBranch.name})
              </label>
              <input
                type="number"
                step="any"
                value={initialQty === 0 ? '' : initialQty}
                placeholder="0"
                onFocus={e => e.target.select()}
                onChange={e => setInitialQty(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                className={`w-full px-2.5 py-1.5 bg-slate-50 border rounded-lg text-xs font-mono font-black text-center focus:bg-white focus:border-blue-500 outline-none ${
                  initialQty < 0
                    ? 'border-red-400 text-red-600 bg-red-50/50'
                    : 'border-slate-200 text-blue-700'
                }`}
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">الحد الأدنى للطلب بالمخزن</label>
              <input
                type="number"
                min="0"
                value={minStock === 0 || minStock === 5 ? '' : minStock}
                placeholder="5"
                onFocus={e => e.target.select()}
                onChange={e => setMinStock(e.target.value === '' ? 5 : parseInt(e.target.value) || 0)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-center focus:bg-white focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Quick Reconciliation Helper if Stock is Negative */}
          {initialQty < 0 && (
            <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 space-y-1.5">
              <div className="flex items-center justify-between font-bold">
                <span>⚠️ الصنف مباع/منصرف بالسالب: ({initialQty})</span>
                <span className="text-[10px] text-amber-700">كمية منصرفة قبل الشراء</span>
              </div>
              <div className="text-[11px] text-amber-800">
                عند شراء أو توريد نفس الكمية المنصرفة ({Math.abs(initialQty)}) سيتساوى الرصيد إلى صفر، وإذا زادت الكمية عن ({Math.abs(initialQty)}) سيزيد الرصيد بالموجب.
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setInitialQty(0)}
                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10.5px] font-bold cursor-pointer transition-colors"
                >
                  ✓ تسوية الرصيد إلى (0) لمساواة المنصرف
                </button>
                <button
                  type="button"
                  onClick={() => setInitialQty(prev => prev + Math.abs(prev) + 5)}
                  className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10.5px] font-bold cursor-pointer transition-colors"
                >
                  + شراء ({Math.abs(initialQty) + 5}) ليصبح الرصيد (+5)
                </button>
              </div>
            </div>
          )}

          {/* Modal Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
            >
              إلغاء
            </button>

            <div className="flex items-center gap-2">
              {!product ? (
                <>
                  <button
                    type="button"
                    onClick={e => handleSave(e, true)}
                    className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    title="حفظ هذا الصنف والخروج من النافذة"
                  >
                    حفظ وإغلاق
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>حفظ وتفريغ لإدخال صنف جديد</span>
                  </button>
                </>
              ) : (
                <button
                  type="submit"
                  className="px-5 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  حفظ تعديل بيانات الصنف
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
