import React, { useState } from 'react';
import {
  Coins,
  Plus,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ArrowRightLeft,
  CheckCircle2,
  Edit,
  Trash2,
  Calendar,
  Download,
  Printer,
  ShieldCheck,
  Scale
} from 'lucide-react';
import { AccountingDB, Currency, JournalEntry } from '../types/accounting';
import { formatMoney, generateId, getTodayDate, logAudit } from '../services/accountingStorage';
import { downloadElementAsPdf } from '../services/printAndPdfService';
import { useModalBackHandler } from '../hooks/useModalBackHandler';

interface CurrenciesViewProps {
  db: AccountingDB;
  onUpdateDb: (updated: AccountingDB) => void;
}

export const CurrenciesView: React.FC<CurrenciesViewProps> = ({ db, onUpdateDb }) => {
  const [showModal, setShowModal] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<Currency | null>(null);

  useModalBackHandler(showModal, () => setShowModal(false), 'currency_modal');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [rate, setRate] = useState<number>(1);
  const [isBase, setIsBase] = useState(false);

  // Currency Converter state
  const [convertAmount, setConvertAmount] = useState<number>(100);
  const [convertFromCode, setConvertFromCode] = useState<string>('USD');
  const [convertToCode, setConvertToCode] = useState<string>('EGP');

  const baseCurrency = db.currencies.find(c => c.isBase) || db.currencies[0] || {
    id: 'curr_egp', code: 'EGP', name: 'الجنيه المصري', symbol: 'ج.م', rate: 1, isBase: true, lastUpdated: getTodayDate()
  };

  const openAddModal = () => {
    setEditingCurrency(null);
    setCode('');
    setName('');
    setSymbol('');
    setRate(1);
    setIsBase(false);
    setShowModal(true);
  };

  const openEditModal = (c: Currency) => {
    setEditingCurrency(c);
    setCode(c.code);
    setName(c.name);
    setSymbol(c.symbol);
    setRate(c.rate);
    setIsBase(c.isBase);
    setShowModal(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return alert('أدخل بيانات العملة بالكامل');

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;

    if (isBase) {
      // Unset other base currencies
      updated.currencies.forEach(c => c.isBase = false);
    }

    if (editingCurrency) {
      const idx = updated.currencies.findIndex(c => c.id === editingCurrency.id);
      if (idx !== -1) {
        updated.currencies[idx] = {
          ...updated.currencies[idx],
          code: code.trim().toUpperCase(),
          name: name.trim(),
          symbol: symbol.trim(),
          rate: isBase ? 1 : Number(rate) || 1,
          isBase,
          lastUpdated: getTodayDate()
        };
      }
      logAudit(updated, 'تعديل سعر صرف عملة', `${name} (${rate})`);
    } else {
      const newCurr: Currency = {
        id: generateId('curr'),
        code: code.trim().toUpperCase(),
        name: name.trim(),
        symbol: symbol.trim(),
        rate: isBase ? 1 : Number(rate) || 1,
        isBase,
        lastUpdated: getTodayDate()
      };
      updated.currencies.push(newCurr);
      logAudit(updated, 'إضافة عملة جديدة', `${newCurr.name} (${newCurr.code})`);
    }

    onUpdateDb(updated);
    setShowModal(false);
  };

  const handleDelete = (id: string, cName: string, isBaseCurr: boolean) => {
    if (isBaseCurr) {
      alert('لا يمكن حذف العملة الأساسية للنظام.');
      return;
    }
    if (!confirm(`هل أنت متأكد من حذف العملة (${cName})؟`)) return;
    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    updated.currencies = updated.currencies.filter(c => c.id !== id);
    logAudit(updated, 'حذف عملة', cName);
    onUpdateDb(updated);
  };

  // Convert calculation
  const fromCurr = db.currencies.find(c => c.code === convertFromCode) || baseCurrency;
  const toCurr = db.currencies.find(c => c.code === convertToCode) || baseCurrency;

  // Convert formula: fromAmount * (fromRate / toRate)
  // where rate is relative to base currency (e.g. 1 USD = 48.5 base, 1 EUR = 52.8 base, 1 base = 1)
  const convertedResult = toCurr.rate > 0 
    ? (convertAmount * fromCurr.rate) / toCurr.rate 
    : 0;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-amber-800 text-white rounded-xl">
              <Coins className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-black text-slate-900">
              تعدد العملات وأسعار الصرف اللحظية وفروق العملة
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            إدارة العملات الأجنبية، تحديد أسعار الصرف، تحويل العملات اللحظي، واحتساب فروق تقييم أسعار الصرف
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة عملة جديدة</span>
        </button>
      </div>

      {/* Grid: Currencies List + Live Converter */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Currencies Table */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="text-xs font-black text-slate-900 flex items-center gap-2">
              <span>أسعار الصرف الرسمية</span>
              <span className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                الأساسية: {baseCurrency.name} ({baseCurrency.code})
              </span>
            </h3>
            <span className="text-xs text-slate-500 font-mono">
              {db.currencies.length} عملات متاحة
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100/70 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">رمز العملة</th>
                  <th className="p-3">اسم العملة</th>
                  <th className="p-3">العلامة</th>
                  <th className="p-3">سعر الصرف ({baseCurrency.symbol})</th>
                  <th className="p-3">آخر تحديث</th>
                  <th className="p-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {db.currencies.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 font-mono font-black text-slate-900">
                      <div className="flex items-center gap-1.5">
                        <span>{c.code}</span>
                        {c.isBase && (
                          <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded">
                            رئيسية
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 font-bold text-slate-800">{c.name}</td>
                    <td className="p-3 font-mono font-bold text-slate-600">{c.symbol}</td>
                    <td className="p-3 font-mono font-bold text-slate-900">
                      1 {c.code} = {c.rate.toFixed(4)} {baseCurrency.symbol}
                    </td>
                    <td className="p-3 font-mono text-slate-400 text-[11px]">{c.lastUpdated}</td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEditModal(c)}
                          className="p-1.5 text-slate-600 hover:text-black rounded-lg hover:bg-slate-100"
                          title="تعديل السعر"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        {!c.isBase && (
                          <button
                            onClick={() => handleDelete(c.id, c.name, c.isBase)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50"
                            title="حذف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Col: Instant Currency Converter Widget */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <span className="p-1.5 bg-amber-100 text-amber-900 rounded-lg">
              <ArrowRightLeft className="w-4 h-4" />
            </span>
            <h3 className="text-xs font-black text-slate-900">حاسبة تحويل العملات اللحظية</h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ المراد تحويله</label>
              <input
                type="number"
                step="any"
                value={convertAmount}
                onChange={e => setConvertAmount(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">من عملة</label>
                <select
                  value={convertFromCode}
                  onChange={e => setConvertFromCode(e.target.value)}
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-xl text-xs font-bold bg-white"
                >
                  {db.currencies.map(c => (
                    <option key={c.id} value={c.code}>{c.code} ({c.symbol})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">إلى عملة</label>
                <select
                  value={convertToCode}
                  onChange={e => setConvertToCode(e.target.value)}
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-xl text-xs font-bold bg-white"
                >
                  {db.currencies.map(c => (
                    <option key={c.id} value={c.code}>{c.code} ({c.symbol})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Conversion Result Card */}
            <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl text-center space-y-1">
              <span className="text-[11px] text-amber-900 font-bold block">القيمة المحولة المعادلة</span>
              <div className="text-xl font-black font-mono text-amber-950">
                {convertedResult.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {toCurr.symbol}
              </div>
              <span className="text-[10px] text-amber-800 font-mono block">
                1 {fromCurr.code} = {((fromCurr.rate) / (toCurr.rate || 1)).toFixed(4)} {toCurr.code}
              </span>
            </div>

            {/* Accounting FX Gain/Loss Tip */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 space-y-1">
              <div className="font-bold text-slate-900 flex items-center gap-1">
                <Scale className="w-3.5 h-3.5 text-slate-700" />
                <span>المعالجة المحاسبية لفروق العملة:</span>
              </div>
              <p>
                يتم إثبات الفواتير والسندات بالعملة الأجنبية مع ترجمتها لـ ({baseCurrency.symbol}) بسعر تاريخ الحركة. الفروق الناتجة عند السداد تُرحل لحساب <strong>حـ/ 5501 فروق أسعار العملات</strong>.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Add / Edit Currency Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-700" />
              <span>{editingCurrency ? 'تعديل سعر صرف العملة' : 'إضافة عملة جديدة'}</span>
            </h3>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رمز العملة (ISO)</label>
                  <input
                    type="text"
                    required
                    placeholder="USD, EUR, SAR..."
                    value={code}
                    onChange={e => setCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رمز/علامة العملة</label>
                  <input
                    type="text"
                    required
                    placeholder="$, €, ر.س..."
                    value={symbol}
                    onChange={e => setSymbol(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم العملة الكامل</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: الدولار الأمريكي"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  سعر الصرف مقابل العملة الأساسية ({baseCurrency.symbol})
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  disabled={isBase}
                  value={isBase ? 1 : rate}
                  onChange={e => setRate(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-600 disabled:bg-slate-100"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isBaseCheckbox"
                  checked={isBase}
                  onChange={e => setIsBase(e.target.checked)}
                  className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                />
                <label htmlFor="isBaseCheckbox" className="text-xs font-bold text-slate-700 cursor-pointer">
                  تعيين كعملة رئيسية للنظام والتقارير
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-xl"
                >
                  حفظ العملة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
