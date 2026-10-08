import React, { useState } from 'react';
import {
  Boxes,
  Plus,
  Calculator,
  Calendar,
  Building,
  Truck,
  Laptop,
  Armchair,
  Wrench,
  TrendingDown,
  DollarSign,
  Download,
  Printer,
  Trash2,
  Edit,
  CheckCircle2,
  ShieldCheck,
  FileSpreadsheet
} from 'lucide-react';
import { AccountingDB, FixedAsset, JournalEntry, JournalLine } from '../types/accounting';
import { formatMoney, generateId, getTodayDate, logAudit } from '../services/accountingStorage';
import { downloadElementAsPdf } from '../services/printAndPdfService';
import { useModalBackHandler } from '../hooks/useModalBackHandler';

interface FixedAssetsViewProps {
  db: AccountingDB;
  onUpdateDb: (updated: AccountingDB) => void;
}

export const FixedAssetsView: React.FC<FixedAssetsViewProps> = ({ db, onUpdateDb }) => {
  const [showModal, setShowModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<FixedAsset | null>(null);

  useModalBackHandler(showModal, () => setShowModal(false), 'fixed_asset_modal');
  const [selectedAssetId, setSelectedAssetId] = useState<string>(
    db.fixedAssets[0]?.id || ''
  );
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Form State
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<FixedAsset['category']>('أجهزة حاسوب وتكنولوجيا');
  const [purchaseDate, setPurchaseDate] = useState(getTodayDate());
  const [purchaseCost, setPurchaseCost] = useState<number>(10000);
  const [salvageValue, setSalvageValue] = useState<number>(500);
  const [usefulLifeYears, setUsefulLifeYears] = useState<number>(3);
  const [notes, setNotes] = useState('');

  const openAddModal = () => {
    setEditingAsset(null);
    setCode(`AST-${String(db.fixedAssets.length + 1).padStart(3, '0')}`);
    setName('');
    setCategory('أجهزة حاسوب وتكنولوجيا');
    setPurchaseDate(getTodayDate());
    setPurchaseCost(10000);
    setSalvageValue(500);
    setUsefulLifeYears(3);
    setNotes('');
    setShowModal(true);
  };

  const openEditModal = (ast: FixedAsset) => {
    setEditingAsset(ast);
    setCode(ast.code);
    setName(ast.name);
    setCategory(ast.category);
    setPurchaseDate(ast.purchaseDate);
    setPurchaseCost(ast.purchaseCost);
    setSalvageValue(ast.salvageValue);
    setUsefulLifeYears(ast.usefulLifeYears);
    setNotes(ast.notes || '');
    setShowModal(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || purchaseCost <= 0) return alert('أكمل بيانات الأصل وتكلفة الشراء');

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;

    if (editingAsset) {
      const idx = updated.fixedAssets.findIndex(a => a.id === editingAsset.id);
      if (idx !== -1) {
        updated.fixedAssets[idx] = {
          ...updated.fixedAssets[idx],
          code: code.trim(),
          name: name.trim(),
          category,
          purchaseDate,
          purchaseCost: Number(purchaseCost),
          salvageValue: Number(salvageValue) || 0,
          usefulLifeYears: Number(usefulLifeYears) || 1,
          notes: notes.trim()
        };
      }
      logAudit(updated, 'تعديل أصل ثابت', name);
    } else {
      const newAsset: FixedAsset = {
        id: generateId('ast'),
        code: code.trim(),
        name: name.trim(),
        category,
        purchaseDate,
        purchaseCost: Number(purchaseCost),
        salvageValue: Number(salvageValue) || 0,
        usefulLifeYears: Number(usefulLifeYears) || 1,
        depreciationMethod: 'straight_line',
        accumulatedDepreciation: 0,
        notes: notes.trim()
      };
      updated.fixedAssets.push(newAsset);
      setSelectedAssetId(newAsset.id);
      logAudit(updated, 'إضافة أصل ثابت جديد', `${newAsset.name} - تكلفة ${newAsset.purchaseCost}`);
    }

    onUpdateDb(updated);
    setShowModal(false);
  };

  const handleDelete = (id: string, astName: string) => {
    if (!confirm(`هل أنت متأكد من حذف الأصل (${astName})؟`)) return;
    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    updated.fixedAssets = updated.fixedAssets.filter(a => a.id !== id);
    if (selectedAssetId === id) {
      setSelectedAssetId(updated.fixedAssets[0]?.id || '');
    }
    logAudit(updated, 'حذف أصل ثابت', astName);
    onUpdateDb(updated);
  };

  // Automated Depreciation calculation
  const calculateDepreciation = (ast: FixedAsset) => {
    const depreciableBase = Math.max(0, ast.purchaseCost - ast.salvageValue);
    const annualDepreciation = ast.usefulLifeYears > 0 ? depreciableBase / ast.usefulLifeYears : 0;
    const monthlyDepreciation = annualDepreciation / 12;
    const netBookValue = Math.max(ast.salvageValue, ast.purchaseCost - ast.accumulatedDepreciation);

    return {
      depreciableBase,
      annualDepreciation,
      monthlyDepreciation,
      netBookValue
    };
  };

  // Post Automated Depreciation Entry for Selected Asset
  const handlePostDepreciation = (ast: FixedAsset, monthsToDepreciate: number = 12) => {
    const { annualDepreciation, monthlyDepreciation, netBookValue } = calculateDepreciation(ast);
    const amount = monthsToDepreciate === 12 ? annualDepreciation : monthlyDepreciation * monthsToDepreciate;

    if (amount <= 0 || netBookValue <= ast.salvageValue) {
      alert('الأصل مهلك دفترياً بالكامل أو تم الوصول لقيمة الخردة.');
      return;
    }

    const confirmMsg = `تأكيد ترحيل قيد الإهلاك:\n\n` +
      `الأصل: ${ast.name} (${ast.code})\n` +
      `مبلغ الإهلاك المحتسب: ${formatMoney(amount, db.settings.currency)}\n\n` +
      `سيتم إنشاء قيد يومية مزدوج:\n` +
      `من حـ/ مصروف إهلاك الأصول الثابتة (5401)\n` +
      `إلى حـ/ مجمع إهلاك الأصول الثابتة (1402)`;

    if (!confirm(confirmMsg)) return;

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const today = getTodayDate();
    const entryId = generateId('jrn_dep');
    const entryNumber = `DEP-${ast.code}-${Date.now().toString().slice(-4)}`;

    const depExpAcc = updated.accounts.find(a => a.id === 'acc_dep_exp') || {
      id: 'acc_dep_exp', code: '5401', name: 'مصروف إهلاك الأصول الثابتة'
    };
    const accumAcc = updated.accounts.find(a => a.id === 'acc_accum_dep') || {
      id: 'acc_accum_dep', code: '1402', name: 'مجمع إهلاك الأصول الثابتة'
    };

    const lines: JournalLine[] = [
      {
        accountId: depExpAcc.id,
        accountName: depExpAcc.name,
        accountCode: depExpAcc.code,
        debit: amount,
        credit: 0,
        notes: `إهلاك أصل ${ast.name} (${monthsToDepreciate} شهر)`
      },
      {
        accountId: accumAcc.id,
        accountName: accumAcc.name,
        accountCode: accumAcc.code,
        debit: 0,
        credit: amount,
        notes: `مجمع إهلاك ${ast.name}`
      }
    ];

    const jEntry: JournalEntry = {
      id: entryId,
      number: entryNumber,
      date: today,
      description: `قيد إهلاك أصل ${ast.name} (${ast.code})`,
      sourceType: 'adjustment',
      sourceId: ast.id,
      lines,
      createdAt: new Date().toISOString()
    };
    updated.journals.push(jEntry);

    // Update asset accumulated depreciation
    const astIdx = updated.fixedAssets.findIndex(a => a.id === ast.id);
    if (astIdx !== -1) {
      updated.fixedAssets[astIdx].accumulatedDepreciation += amount;
      updated.fixedAssets[astIdx].lastDepreciationDate = today;
    }

    logAudit(updated, 'ترحيل قيد إهلاك أصل ثابت', `${ast.name} بمبلغ ${formatMoney(amount, db.settings.currency)}`);
    onUpdateDb(updated);
    alert('تم احتساب وترحيل قيد الإهلاك إلى دفتر اليومية ومجمع الإهلاك بنجاح.');
  };

  const selectedAsset = db.fixedAssets.find(a => a.id === selectedAssetId) || db.fixedAssets[0];
  const selectedCalc = selectedAsset ? calculateDepreciation(selectedAsset) : null;

  // Total summary of all assets
  const totalAssetsCost = db.fixedAssets.reduce((s, a) => s + a.purchaseCost, 0);
  const totalAccumDep = db.fixedAssets.reduce((s, a) => s + a.accumulatedDepreciation, 0);
  const totalNetBookValue = totalAssetsCost - totalAccumDep;

  const handleDownloadPdf = async () => {
    setIsExportingPdf(true);
    try {
      await downloadElementAsPdf('asset-schedule-printable', {
        format: 'a4',
        filename: `fixed_asset_${selectedAsset?.code || 'sheet'}.pdf`
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const getCategoryIcon = (cat: FixedAsset['category']) => {
    switch (cat) {
      case 'مباني وعقارات': return <Building className="w-4 h-4 text-amber-700" />;
      case 'سيارات ومركبات': return <Truck className="w-4 h-4 text-blue-700" />;
      case 'أجهزة حاسوب وتكنولوجيا': return <Laptop className="w-4 h-4 text-emerald-700" />;
      case 'أثاث ومفروشات': return <Armchair className="w-4 h-4 text-purple-700" />;
      default: return <Wrench className="w-4 h-4 text-slate-700" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-blue-900 text-white rounded-xl">
              <Boxes className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-black text-slate-900">
              إدارة الأصول الثابتة وحساب الإهلاك التلقائي
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            تسجيل الأصول، تتبع القيمة الدفترية، احتساب الإهلاك بالقسط الثابت، وتوليد القيود المحاسبية التلقائية
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة أصل ثابت جديد</span>
        </button>
      </div>

      {/* Aggregate KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-bold text-slate-500 block">إجمالي تكلفة شراء الأصول</span>
          <span className="text-lg font-black font-mono text-slate-900 block mt-1">
            {formatMoney(totalAssetsCost, db.settings.currency)}
          </span>
          <span className="text-[10px] text-slate-400">{db.fixedAssets.length} أصول مسجلة</span>
        </div>

        <div className="p-4 bg-rose-50/50 rounded-2xl border border-rose-100 shadow-2xs">
          <span className="text-xs font-bold text-rose-800 block">إجمالي مجمع الإهلاك المتراكم</span>
          <span className="text-lg font-black font-mono text-rose-950 block mt-1">
            {formatMoney(totalAccumDep, db.settings.currency)}
          </span>
          <span className="text-[10px] text-rose-700">حـ/ 1402 مجمع إهلاك الأصول</span>
        </div>

        <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 shadow-2xs">
          <span className="text-xs font-bold text-emerald-800 block">صافي القيمة الدفترية الحالية</span>
          <span className="text-lg font-black font-mono text-emerald-950 block mt-1">
            {formatMoney(totalNetBookValue, db.settings.currency)}
          </span>
          <span className="text-[10px] text-emerald-700">صافي قيمة الأصول المتبقية بالدفاتر</span>
        </div>
      </div>

      {/* Main Grid: Assets List & Selected Asset Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col: List of Assets */}
        <div className="lg:col-span-1 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black text-slate-900">سجل الأصول الثابتة</h3>
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono font-bold">
              {db.fixedAssets.length} أصل
            </span>
          </div>

          <div className="space-y-2 max-h-[460px] overflow-y-auto">
            {db.fixedAssets.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                لا توجد أصول ثابتة مسجلة بعد. انقر على "إضافة أصل ثابت جديد" لتسجيل المعدات أو السيارات أو الأجهزة.
              </div>
            ) : (
              db.fixedAssets.map(ast => {
                const isSelected = ast.id === selectedAssetId;
                const net = ast.purchaseCost - ast.accumulatedDepreciation;
                return (
                  <div
                    key={ast.id}
                    onClick={() => setSelectedAssetId(ast.id)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/40 shadow-2xs'
                        : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getCategoryIcon(ast.category)}
                        <span className="font-bold text-xs text-slate-900">{ast.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 font-bold">{ast.code}</span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] mt-2 pt-1 border-t border-slate-100 font-mono">
                      <span className="text-slate-500">القيمة الدفترية:</span>
                      <span className="font-bold text-slate-900">
                        {formatMoney(net, db.settings.currency)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right 2 Cols: Selected Asset Details & Action Bar */}
        <div className="lg:col-span-2 space-y-4">
          {selectedAsset && selectedCalc ? (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-5">
              {/* Card Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    {getCategoryIcon(selectedAsset.category)}
                    <h2 className="text-base font-black text-slate-900">{selectedAsset.name}</h2>
                    <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-mono font-bold">
                      {selectedAsset.code}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-blue-100 text-blue-800">
                      {selectedAsset.category}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1 font-mono">
                    تاريخ الشراء: {selectedAsset.purchaseDate} | العمر الإنتاجي: {selectedAsset.usefulLifeYears} سنوات
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(selectedAsset)}
                    className="p-1.5 text-slate-600 hover:text-black rounded-lg hover:bg-slate-100"
                    title="تعديل"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(selectedAsset.id, selectedAsset.name)}
                    className="p-1.5 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50"
                    title="حذف"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleDownloadPdf}
                    disabled={isExportingPdf}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تحميل بطاقة الأصل PDF</span>
                  </button>
                </div>
              </div>

              {/* Financial Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[11px] text-slate-500 font-bold block">تكلفة الشراء الأصلية</span>
                  <span className="text-sm font-black font-mono text-slate-900 block mt-1">
                    {formatMoney(selectedAsset.purchaseCost, db.settings.currency)}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[11px] text-slate-500 font-bold block">قيمة الخردة التقديرية</span>
                  <span className="text-sm font-black font-mono text-slate-900 block mt-1">
                    {formatMoney(selectedAsset.salvageValue, db.settings.currency)}
                  </span>
                </div>

                <div className="p-3 bg-rose-50/50 rounded-xl border border-rose-100">
                  <span className="text-[11px] text-rose-800 font-bold block">مجمع الإهلاك المحتسب</span>
                  <span className="text-sm font-black font-mono text-rose-950 block mt-1">
                    {formatMoney(selectedAsset.accumulatedDepreciation, db.settings.currency)}
                  </span>
                </div>

                <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100">
                  <span className="text-[11px] text-emerald-800 font-bold block">صافي القيمة الدفترية</span>
                  <span className="text-sm font-black font-mono text-emerald-950 block mt-1">
                    {formatMoney(selectedCalc.netBookValue, db.settings.currency)}
                  </span>
                </div>
              </div>

              {/* Depreciation Plan Card & Actions */}
              <div className="p-4 bg-blue-50/40 border border-blue-200 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-blue-700" />
                    <span className="text-xs font-black text-blue-950">
                      خطة الإهلاك (طريقة القسط الثابت Straight-Line):
                    </span>
                  </div>
                  <div className="text-xs font-mono font-bold text-blue-900">
                    القسط السنوي: {formatMoney(selectedCalc.annualDepreciation, db.settings.currency)} / سنة ({formatMoney(selectedCalc.monthlyDepreciation, db.settings.currency)} / شهر)
                  </div>
                </div>

                {/* Depreciation Posting Buttons */}
                <div className="pt-2 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handlePostDepreciation(selectedAsset, 12)}
                    className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>ترحيل قيد إهلاك سنوي (سنة كاملة)</span>
                  </button>
                  <button
                    onClick={() => handlePostDepreciation(selectedAsset, 1)}
                    className="px-3.5 py-2 bg-white border border-blue-300 hover:bg-blue-50 text-blue-900 rounded-xl text-xs font-bold transition-all"
                  >
                    <span>ترحيل قيد إهلاك شهري (شهر واحد)</span>
                  </button>
                  {selectedAsset.lastDepreciationDate && (
                    <span className="text-[11px] text-slate-500 font-mono">
                      آخر ترحيل: {selectedAsset.lastDepreciationDate}
                    </span>
                  )}
                </div>
              </div>

              {/* Printable Asset Card Area */}
              <div id="asset-schedule-printable" className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
                <div className="flex justify-between items-center border-b border-slate-200 pb-2 text-xs">
                  <span className="font-black text-slate-900">بطاقة الأصل الثابت ودليل الإهلاك</span>
                  <span className="font-mono text-slate-500">{db.settings.company}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>اسم الأصل: <strong>{selectedAsset.name}</strong></div>
                  <div>الكود: <strong className="font-mono">{selectedAsset.code}</strong></div>
                  <div>التصنيف: <strong>{selectedAsset.category}</strong></div>
                  <div>تاريخ الاقتناء: <strong className="font-mono">{selectedAsset.purchaseDate}</strong></div>
                  <div>تكلفة الأصل: <strong className="font-mono">{formatMoney(selectedAsset.purchaseCost, db.settings.currency)}</strong></div>
                  <div>القيمة المتبقية (الدفترية): <strong className="font-mono">{formatMoney(selectedCalc.netBookValue, db.settings.currency)}</strong></div>
                </div>

                {selectedAsset.notes && (
                  <div className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded border border-slate-200">
                    <strong>ملاحظات الأصل وموقعه:</strong> {selectedAsset.notes}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white p-12 text-center text-slate-400 rounded-2xl border border-slate-200 shadow-2xs">
              حدد أصلاً من القائمة لعرض تفاصيل الإهلاك وبطاقة الأصل
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Asset Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2">
              <Boxes className="w-4 h-4 text-blue-700" />
              <span>{editingAsset ? 'تعديل بيانات أصل ثابت' : 'إضافة أصل ثابت جديد'}</span>
            </h3>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">كود الأصل</label>
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم الأصل</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: سيارة توزيع شيفروليه، ماكينة تغليف..."
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تصنيف الأصل</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                  >
                    <option value="أجهزة حاسوب وتكنولوجيا">أجهزة حاسوب وتكنولوجيا</option>
                    <option value="آلات ومعدات">آلات ومعدات</option>
                    <option value="سيارات ومركبات">سيارات ومركبات</option>
                    <option value="أثاث ومفروشات">أثاث ومفروشات</option>
                    <option value="مباني وعقارات">مباني وعقارات</option>
                    <option value="أخرى">أخرى</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الشراء</label>
                  <input
                    type="date"
                    required
                    value={purchaseDate}
                    onChange={e => setPurchaseDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تكلفة الشراء</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={purchaseCost}
                    onChange={e => setPurchaseCost(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">قيمة الخردة</label>
                  <input
                    type="number"
                    step="any"
                    value={salvageValue}
                    onChange={e => setSalvageValue(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">العمر (سنوات)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={usefulLifeYears}
                    onChange={e => setUsefulLifeYears(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات وموقع الأصل</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
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
                  className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl"
                >
                  حفظ الأصل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
