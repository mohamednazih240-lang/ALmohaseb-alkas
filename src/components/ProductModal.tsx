import React, { useState, useEffect } from 'react';
import {
  X,
  Package,
  Building2,
  Info
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
  updateProductBranchData
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

  if (!isOpen) return null;

  const currentBranch = branches.find(b => b.id === selectedBranchId) || branches[0];

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return alert('اكتب اسم الصنف');

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const branchName = currentBranch?.name || 'الفرع الرئيسي';

    if (product) {
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
        logAudit(updated, `تعديل صنف في ${branchName}`, `${name.trim()} (سعر: ${sellPrice} | مخزون: ${initialQty})`);
      }
    } else {
      const newProdId = generateId('prod');
      let newProduct: Product = {
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
    }

    onUpdateDb(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50 rounded-t-2xl">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-black text-slate-900">
              {product ? 'تعديل بيانات الصنف والتسعير' : 'إضافة صنف جديد للنظام'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-4 space-y-3.5 overflow-y-auto flex-1">
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

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">اسم الصنف الكامل *</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="مثال: شاشة سامسونج 27 بوصة"
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
            />
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">كود الصنف</label>
              <input
                type="text"
                required
                value={code}
                onChange={e => setCode(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">الباركود</label>
              <input
                type="text"
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                placeholder="622..."
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">الوحدة</label>
              <input
                type="text"
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <span className="block text-[11px] font-black text-slate-900 mb-2">
              تسعير الصنف الخاص بـ ({currentBranch.name}):
            </span>
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">سعر الشراء / التكلفة</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={buyPrice}
                  onChange={e => setBuyPrice(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">سعر البيع قطاعي</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={sellPrice}
                  onChange={e => setSellPrice(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-emerald-700"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">سعر الجملة</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={wholesalePrice}
                  onChange={e => setWholesalePrice(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                رصيد المخزون بـ ({currentBranch.name})
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={initialQty}
                onChange={e => setInitialQty(parseFloat(e.target.value) || 0)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-black text-blue-700"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">الحد الأدنى للطلب بالمخزن</label>
              <input
                type="number"
                min="0"
                value={minStock}
                onChange={e => setMinStock(parseInt(e.target.value) || 0)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold transition-colors"
            >
              حفظ بيانات الصنف ({currentBranch.name})
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
