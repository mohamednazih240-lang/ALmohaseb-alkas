import React, { useState, useEffect } from 'react';
import {
  X,
  Package
} from 'lucide-react';
import {
  AccountingDB,
  Product
} from '../types/accounting';
import {
  generateId,
  getTodayDate,
  logAudit
} from '../services/accountingStorage';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: Product | null;
  db: AccountingDB;
  onUpdateDb: (updated: AccountingDB) => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  isOpen,
  onClose,
  product,
  db,
  onUpdateDb
}) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [barcode, setBarcode] = useState('');
  const [unit, setUnit] = useState('قطعة');
  const [buyPrice, setBuyPrice] = useState<number>(0);
  const [sellPrice, setSellPrice] = useState<number>(0);
  const [wholesalePrice, setWholesalePrice] = useState<number>(0);
  const [minStock, setMinStock] = useState<number>(5);
  const [initialQty, setInitialQty] = useState<number>(0);

  useEffect(() => {
    if (product) {
      setName(product.name);
      setCode(product.code);
      setBarcode(product.barcode || '');
      setUnit(product.unit || 'قطعة');
      setBuyPrice(product.buyPrice);
      setSellPrice(product.sellPrice);
      setWholesalePrice(product.wholesalePrice);
      setMinStock(product.minStock);
      setInitialQty(product.currentQty);
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
  }, [product, isOpen, db.products.length]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return alert('اكتب اسم الصنف');

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;

    if (product) {
      const idx = updated.products.findIndex(p => p.id === product.id);
      if (idx !== -1) {
        updated.products[idx] = {
          ...updated.products[idx],
          name: name.trim(),
          code: code.trim(),
          barcode: barcode.trim(),
          unit,
          buyPrice,
          sellPrice,
          wholesalePrice,
          minStock
        };
        logAudit(updated, 'تعديل بيانات صنف', name.trim());
      }
    } else {
      const newProdId = generateId('prod');
      const newProduct: Product = {
        id: newProdId,
        name: name.trim(),
        code: code.trim(),
        barcode: barcode.trim(),
        unit,
        buyPrice,
        sellPrice,
        wholesalePrice,
        minStock,
        currentQty: initialQty,
        avgCost: buyPrice,
        priceHistory: buyPrice > 0 ? [{ date: getTodayDate(), price: buyPrice, qty: initialQty }] : []
      };

      updated.products.push(newProduct);

      // If initial stock provided, log opening movement and accounting journal
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
          refNumber: 'رصيد افتتاحي',
          sourceId: newProdId
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
            description: `إثبات رصيد بضاعة أول المدة للصنف ${newProduct.name}`,
            sourceType: 'manual',
            sourceId: newProdId,
            lines: [
              { accountId: invAcc.id, accountCode: invAcc.code, accountName: invAcc.name, debit: totalValue, credit: 0, notes: `بضاعة أول المدة` },
              { accountId: eqAcc.id, accountCode: eqAcc.code, accountName: eqAcc.name, debit: 0, credit: totalValue, notes: `رأس مال بضاعة` }
            ],
            createdAt: new Date().toISOString()
          });
        }
      }

      logAudit(updated, 'إضافة صنف جديد للمخزون', `${name} (${initialQty} ${unit})`);
    }

    onUpdateDb(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50 rounded-t-2xl">
          <h2 className="text-base font-black text-slate-900">
            {product ? 'تعديل بيانات الصنف' : 'إضافة صنف جديد للمخزون'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-4 space-y-3.5 overflow-y-auto flex-1">
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
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
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

          <div className="grid grid-cols-2 gap-3">
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
            {!product && (
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">رصيد افتتاحي أولي (كمية)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={initialQty}
                  onChange={e => setInitialQty(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-black"
                />
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 rounded-lg text-xs font-bold"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-black text-white rounded-lg text-xs font-bold"
            >
              حفظ الصنف
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
