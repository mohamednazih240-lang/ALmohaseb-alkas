import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Package,
  Users,
  Building,
  Receipt,
  ArrowRight,
  X
} from 'lucide-react';
import {
  AccountingDB,
  Invoice
} from '../types/accounting';
import {
  formatMoney,
  calculateCustomerBalance,
  calculateSupplierBalance
} from '../services/accountingStorage';

interface QuickSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  db: AccountingDB;
  onSelectProduct: (productId: string) => void;
  onSelectCustomer: (customerId: string) => void;
  onSelectSupplier: (supplierId: string) => void;
  onSelectInvoice: (invoice: Invoice) => void;
}

export const QuickSearchModal: React.FC<QuickSearchModalProps> = ({
  isOpen,
  onClose,
  db,
  onSelectProduct,
  onSelectCustomer,
  onSelectSupplier,
  onSelectInvoice
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const q = query.trim().toLowerCase();

  const matchingProducts = q
    ? db.products.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q)
      ).slice(0, 5)
    : [];

  const matchingCustomers = q
    ? db.customers.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q)
      ).slice(0, 4)
    : [];

  const matchingSuppliers = q
    ? db.suppliers.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.phone?.toLowerCase().includes(q)
      ).slice(0, 4)
    : [];

  const matchingInvoices = q
    ? db.invoices.filter(i =>
        i.number.toLowerCase().includes(q) ||
        i.partyName.toLowerCase().includes(q)
      ).slice(0, 4)
    : [];

  const hasResults =
    matchingProducts.length > 0 ||
    matchingCustomers.length > 0 ||
    matchingSuppliers.length > 0 ||
    matchingInvoices.length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-start justify-center p-4 pt-16 sm:pt-24">
      <div 
        className="bg-white rounded-2xl w-full max-w-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3 border-b border-slate-200 bg-slate-50">
          <Search className="w-5 h-5 text-slate-400 ml-2" />
          <input
            ref={inputRef}
            type="text"
            placeholder="ابحث عن صنف، باركود، عميل، مورد، أو رقم فاتورة..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full bg-transparent border-0 text-sm font-bold text-slate-900 focus:outline-hidden placeholder:text-slate-400 placeholder:font-normal"
          />
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-black rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results Area */}
        <div className="max-h-[60vh] overflow-y-auto p-3 space-y-3">
          {!q ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              ابدأ بكتابة اسم الصنف، الباركود، اسم العميل، أو رقم الفاتورة للبحث المباشر
            </div>
          ) : !hasResults ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              لم يتم العثور على أي نتائج تطابق "{query}"
            </div>
          ) : (
            <>
              {/* Products Section */}
              {matchingProducts.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] font-black text-slate-400 px-2">الأصناف والمخزون</div>
                  {matchingProducts.map(p => (
                    <div
                      key={p.id}
                      onClick={() => {
                        onSelectProduct(p.id);
                        onClose();
                      }}
                      className="p-2 hover:bg-slate-50 rounded-lg cursor-pointer flex items-center justify-between border border-transparent hover:border-slate-200 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <Package className="w-4 h-4 text-slate-600" />
                        <div>
                          <div className="text-xs font-bold text-slate-900">{p.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            كود: {p.code} {p.barcode ? `| باركود: ${p.barcode}` : ''}
                          </div>
                        </div>
                      </div>
                      <div className="text-left">
                        <div className="text-xs font-mono font-bold text-slate-900">
                          {formatMoney(p.sellPrice, db.settings.currency)}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          المتوفر: {p.currentQty} {p.unit}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Customers Section */}
              {matchingCustomers.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] font-black text-slate-400 px-2">العملاء</div>
                  {matchingCustomers.map(c => {
                    const bal = calculateCustomerBalance(db, c.id);
                    return (
                      <div
                        key={c.id}
                        onClick={() => {
                          onSelectCustomer(c.id);
                          onClose();
                        }}
                        className="p-2 hover:bg-slate-50 rounded-lg cursor-pointer flex items-center justify-between border border-transparent hover:border-slate-200 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <Users className="w-4 h-4 text-slate-600" />
                          <div>
                            <div className="text-xs font-bold text-slate-900">{c.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{c.phone || 'بدون هاتف'}</div>
                          </div>
                        </div>
                        <div className="text-left font-mono font-bold text-xs text-amber-700">
                          مديونية: {formatMoney(bal, db.settings.currency)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Suppliers Section */}
              {matchingSuppliers.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] font-black text-slate-400 px-2">الموردون</div>
                  {matchingSuppliers.map(s => {
                    const bal = calculateSupplierBalance(db, s.id);
                    return (
                      <div
                        key={s.id}
                        onClick={() => {
                          onSelectSupplier(s.id);
                          onClose();
                        }}
                        className="p-2 hover:bg-slate-50 rounded-lg cursor-pointer flex items-center justify-between border border-transparent hover:border-slate-200 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <Building className="w-4 h-4 text-slate-600" />
                          <div>
                            <div className="text-xs font-bold text-slate-900">{s.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{s.phone || 'بدون هاتف'}</div>
                          </div>
                        </div>
                        <div className="text-left font-mono font-bold text-xs text-rose-700">
                          مستحق له: {formatMoney(bal, db.settings.currency)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Invoices Section */}
              {matchingInvoices.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] font-black text-slate-400 px-2">الفواتير</div>
                  {matchingInvoices.map(inv => (
                    <div
                      key={inv.id}
                      onClick={() => {
                        onSelectInvoice(inv);
                        onClose();
                      }}
                      className="p-2 hover:bg-slate-50 rounded-lg cursor-pointer flex items-center justify-between border border-transparent hover:border-slate-200 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <Receipt className="w-4 h-4 text-slate-600" />
                        <div>
                          <div className="text-xs font-bold text-slate-900">
                            {inv.number} ({inv.type === 'sale' ? 'بيع' : 'شراء'})
                          </div>
                          <div className="text-[10px] text-slate-500">{inv.partyName} - {inv.date}</div>
                        </div>
                      </div>
                      <div className="text-left font-mono font-black text-xs text-slate-950">
                        {formatMoney(inv.total, db.settings.currency)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Shortcut Helper */}
        <div className="p-2.5 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-400 flex items-center justify-between">
          <span>اضغط على العنصر للانتقال الفوري إليه</span>
          <span className="font-mono bg-white border border-slate-200 px-1 rounded">Esc للإغلاق</span>
        </div>
      </div>
    </div>
  );
};
