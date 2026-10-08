import React, { useState } from 'react';
import {
  FolderTree,
  Plus,
  Briefcase,
  Building,
  Car,
  Tag,
  TrendingUp,
  TrendingDown,
  Scale,
  Percent,
  Download,
  Printer,
  Edit,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Search,
  Filter
} from 'lucide-react';
import { AccountingDB, CostCenter } from '../types/accounting';
import { formatMoney, generateId, getTodayDate, logAudit } from '../services/accountingStorage';
import { downloadElementAsPdf } from '../services/printAndPdfService';
import { useModalBackHandler } from '../hooks/useModalBackHandler';

interface CostCentersViewProps {
  db: AccountingDB;
  onUpdateDb: (updated: AccountingDB) => void;
}

export const CostCentersView: React.FC<CostCentersViewProps> = ({ db, onUpdateDb }) => {
  const [showModal, setShowModal] = useState(false);
  const [editingCenter, setEditingCenter] = useState<CostCenter | null>(null);

  useModalBackHandler(showModal, () => setShowModal(false), 'cost_center_modal');
  const [selectedCenterId, setSelectedCenterId] = useState<string>(
    db.costCenters[0]?.id || ''
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Form fields
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<CostCenter['type']>('مشروع');
  const [budget, setBudget] = useState<number>(0);
  const [manager, setManager] = useState('');
  const [notes, setNotes] = useState('');

  const openAddModal = () => {
    setEditingCenter(null);
    const nextCode = `CC-${String(db.costCenters.length + 1).padStart(3, '0')}`;
    setCode(nextCode);
    setName('');
    setType('مشروع');
    setBudget(0);
    setManager('');
    setNotes('');
    setShowModal(true);
  };

  const openEditModal = (cc: CostCenter) => {
    setEditingCenter(cc);
    setCode(cc.code);
    setName(cc.name);
    setType(cc.type);
    setBudget(cc.budget || 0);
    setManager(cc.manager || '');
    setNotes(cc.notes || '');
    setShowModal(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return alert('أدخل اسم مركز التكلفة');

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;

    if (editingCenter) {
      const idx = updated.costCenters.findIndex(c => c.id === editingCenter.id);
      if (idx !== -1) {
        updated.costCenters[idx] = {
          ...updated.costCenters[idx],
          code: code.trim(),
          name: name.trim(),
          type,
          budget: Number(budget) || 0,
          manager: manager.trim(),
          notes: notes.trim()
        };
      }
      logAudit(updated, 'تعديل مركز تكلفة', name);
    } else {
      const newCC: CostCenter = {
        id: generateId('cc'),
        code: code.trim() || `CC-${Date.now().toString().slice(-3)}`,
        name: name.trim(),
        type,
        budget: Number(budget) || 0,
        manager: manager.trim(),
        notes: notes.trim(),
        status: 'نشط'
      };
      updated.costCenters.push(newCC);
      setSelectedCenterId(newCC.id);
      logAudit(updated, 'إضافة مركز تكلفة جديد', newCC.name);
    }

    onUpdateDb(updated);
    setShowModal(false);
  };

  const handleDelete = (id: string, ccName: string) => {
    if (!confirm(`هل أنت متأكد من حذف مركز التكلفة (${ccName})؟`)) return;
    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    updated.costCenters = updated.costCenters.filter(c => c.id !== id);
    if (selectedCenterId === id) {
      setSelectedCenterId(updated.costCenters[0]?.id || '');
    }
    logAudit(updated, 'حذف مركز تكلفة', ccName);
    onUpdateDb(updated);
  };

  // Compute Cost Center P&L and utilization
  const getCenterFinancials = (centerId: string) => {
    let revenues = 0;
    let expenses = 0;

    // Sales invoices
    db.invoices.forEach(inv => {
      if (inv.costCenterId === centerId) {
        if (inv.type === 'sale') revenues += Number(inv.total || 0);
        else if (inv.type === 'purchase') expenses += Number(inv.total || 0);
      }
    });

    // Operational expenses
    db.expenses.forEach(exp => {
      if (exp.costCenterId === centerId) {
        expenses += Number(exp.amount || 0);
      }
    });

    // Revenues
    db.revenues.forEach(rev => {
      if (rev.costCenterId === centerId) {
        revenues += Number(rev.amount || 0);
      }
    });

    // Vouchers
    db.vouchers.forEach(v => {
      if (v.costCenterId === centerId) {
        if (v.type === 'receipt') revenues += Number(v.amount || 0);
        else if (v.type === 'payment') expenses += Number(v.amount || 0);
      }
    });

    // Journal lines
    db.journals.forEach(j => {
      j.lines.forEach(l => {
        if (l.costCenterId === centerId) {
          if (l.credit > 0) revenues += Number(l.credit || 0);
          if (l.debit > 0) expenses += Number(l.debit || 0);
        }
      });
    });

    const netProfit = revenues - expenses;
    return { revenues, expenses, netProfit };
  };

  const selectedCenter = db.costCenters.find(c => c.id === selectedCenterId) || db.costCenters[0];
  const selectedFinancials = selectedCenter ? getCenterFinancials(selectedCenter.id) : { revenues: 0, expenses: 0, netProfit: 0 };
  const budgetUtilization = selectedCenter && selectedCenter.budget && selectedCenter.budget > 0
    ? (selectedFinancials.expenses / selectedCenter.budget) * 100
    : 0;

  const handleDownloadPdf = async () => {
    setIsExportingPdf(true);
    try {
      await downloadElementAsPdf('cost-center-report', {
        format: 'a4',
        filename: `cost_center_${selectedCenter?.name || 'report'}.pdf`
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const filteredCenters = db.costCenters.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getTypeIcon = (t: CostCenter['type']) => {
    switch (t) {
      case 'مشروع': return <Briefcase className="w-4 h-4 text-blue-600" />;
      case 'فرع': return <Building className="w-4 h-4 text-emerald-600" />;
      case 'سيارة/آلية': return <Car className="w-4 h-4 text-amber-600" />;
      default: return <FolderTree className="w-4 h-4 text-purple-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-purple-900 text-white rounded-xl">
              <FolderTree className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-black text-slate-900">
              مراكز التكلفة المتقدمة وتوزيع النفقات والمشاريع
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            ربط الإيرادات والمصروفات بالمشاريع والفروع والآليات، واحتساب الأرباح والخسائر لكل مركز تكلفة بشكل مستقل
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة مركز تكلفة جديد</span>
        </button>
      </div>

      {/* Main Workspace */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Cost Centers List */}
        <div className="md:col-span-1 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black text-slate-900">مراكز التكلفة والمشاريع</h3>
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono font-bold">
              {db.costCenters.length} مركز
            </span>
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder="بحث باسم أو كود المركز..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-3 pr-8 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-purple-600"
            />
            <Search className="w-3.5 h-3.5 absolute right-3 top-2.5 text-slate-400" />
          </div>

          <div className="space-y-2 max-h-[460px] overflow-y-auto">
            {filteredCenters.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                لا توجد مراكز تكلفة معرفة حالياً. انقر على "إضافة مركز تكلفة جديد" للبدء.
              </div>
            ) : (
              filteredCenters.map(cc => {
                const isSelected = cc.id === selectedCenterId;
                const fin = getCenterFinancials(cc.id);
                return (
                  <div
                    key={cc.id}
                    onClick={() => setSelectedCenterId(cc.id)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-purple-600 bg-purple-50/50 shadow-2xs'
                        : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getTypeIcon(cc.type)}
                        <span className="font-bold text-xs text-slate-900">{cc.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 font-bold">{cc.code}</span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] mt-2 pt-1 border-t border-slate-100 font-mono">
                      <span className="text-slate-500">الصافي:</span>
                      <span className={`font-bold ${fin.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {formatMoney(fin.netProfit, db.settings.currency)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Selected Cost Center Performance & P&L */}
        <div className="md:col-span-2 space-y-4">
          {selectedCenter ? (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-5">
              {/* Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    {getTypeIcon(selectedCenter.type)}
                    <h2 className="text-base font-black text-slate-900">{selectedCenter.name}</h2>
                    <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-mono font-bold">
                      {selectedCenter.code}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-purple-100 text-purple-800">
                      {selectedCenter.type}
                    </span>
                  </div>
                  {selectedCenter.manager && (
                    <div className="text-xs text-slate-500 mt-1">
                      المسؤول / المشرف: <strong>{selectedCenter.manager}</strong>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(selectedCenter)}
                    className="p-1.5 text-slate-600 hover:text-black rounded-lg hover:bg-slate-100 transition-colors"
                    title="تعديل"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(selectedCenter.id, selectedCenter.name)}
                    className="p-1.5 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50 transition-colors"
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
                    <span>تحميل تقرير PDF</span>
                  </button>
                </div>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-100">
                  <div className="flex items-center gap-1.5 text-emerald-800 text-xs font-bold">
                    <TrendingUp className="w-4 h-4" />
                    <span>إيرادات المركز المحققة</span>
                  </div>
                  <div className="text-base font-black font-mono text-emerald-950 mt-1">
                    {formatMoney(selectedFinancials.revenues, db.settings.currency)}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-rose-50/50 border border-rose-100">
                  <div className="flex items-center gap-1.5 text-rose-800 text-xs font-bold">
                    <TrendingDown className="w-4 h-4" />
                    <span>مصروفات وتكاليف المركز</span>
                  </div>
                  <div className="text-base font-black font-mono text-rose-950 mt-1">
                    {formatMoney(selectedFinancials.expenses, db.settings.currency)}
                  </div>
                </div>

                <div className={`p-4 rounded-xl border ${
                  selectedFinancials.netProfit >= 0 ? 'bg-indigo-50/50 border-indigo-100' : 'bg-amber-50/50 border-amber-100'
                }`}>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Scale className="w-4 h-4" />
                    <span>صافي أرباح المركز (P&L)</span>
                  </div>
                  <div className={`text-base font-black font-mono mt-1 ${
                    selectedFinancials.netProfit >= 0 ? 'text-indigo-950' : 'text-amber-950'
                  }`}>
                    {formatMoney(selectedFinancials.netProfit, db.settings.currency)}
                  </div>
                </div>
              </div>

              {/* Budget Progress Bar */}
              {selectedCenter.budget && selectedCenter.budget > 0 ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-bold text-slate-700">الميزانية التقديرية المعتمدة:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {formatMoney(selectedCenter.budget, db.settings.currency)}
                    </span>
                  </div>

                  <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all rounded-full ${
                        budgetUtilization > 100
                          ? 'bg-rose-600'
                          : budgetUtilization > 80
                          ? 'bg-amber-500'
                          : 'bg-emerald-600'
                      }`}
                      style={{ width: `${Math.min(100, budgetUtilization)}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                    <span>تم صرف: {formatMoney(selectedFinancials.expenses, db.settings.currency)}</span>
                    <span className="font-bold">{budgetUtilization.toFixed(1)}% من الميزانية</span>
                  </div>
                </div>
              ) : null}

              {/* Printable Cost Center Report Area */}
              <div id="cost-center-report" className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
                <div className="border-b border-slate-200 pb-2 flex justify-between items-center text-xs">
                  <div className="font-black text-slate-900">
                    تقرير قائمة الدخل والأداء المالي لمركز التكلفة: {selectedCenter.name}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {db.settings.company}
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between p-2 bg-slate-50 rounded">
                    <span className="font-bold">إجمالي الإيرادات المباشرة:</span>
                    <span className="font-mono font-bold text-emerald-700">
                      {formatMoney(selectedFinancials.revenues, db.settings.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between p-2 bg-slate-50 rounded">
                    <span className="font-bold">إجمالي المصروفات والتكاليف المباشرة:</span>
                    <span className="font-mono font-bold text-rose-700">
                      {formatMoney(selectedFinancials.expenses, db.settings.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between p-2.5 bg-slate-900 text-white rounded font-bold">
                    <span>صافي هامش الربح التشغيلي:</span>
                    <span className="font-mono text-sm">
                      {formatMoney(selectedFinancials.netProfit, db.settings.currency)}
                    </span>
                  </div>
                </div>

                {selectedCenter.notes && (
                  <div className="text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded border border-slate-200">
                    <strong>ملاحظات ونطاق العمل:</strong> {selectedCenter.notes}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white p-12 text-center text-slate-400 rounded-2xl border border-slate-200 shadow-2xs">
              حدد مركز تكلفة من القائمة للاطلاع على تفاصيل الأرباح والمصروفات
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2">
              <FolderTree className="w-4 h-4 text-purple-600" />
              <span>{editingCenter ? 'تعديل مركز تكلفة' : 'إضافة مركز تكلفة جديد'}</span>
            </h3>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">كود المركز</label>
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-purple-600"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم المركز / المشروع</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: مشروع برج الأمل، فرع الإسكندرية..."
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-purple-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نوع المركز</label>
                  <select
                    value={type}
                    onChange={e => setType(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white"
                  >
                    <option value="مشروع">مشروع</option>
                    <option value="فرع">فرع</option>
                    <option value="قسم">قسم إداري</option>
                    <option value="سيارة/آلية">سيارة / آلية</option>
                    <option value="عام">عام</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الميزانية التقديرية</label>
                  <input
                    type="number"
                    step="any"
                    value={budget}
                    onChange={e => setBudget(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-purple-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المسؤول / المشرف</label>
                <input
                  type="text"
                  placeholder="اسم المهندس أو مدير الفرع"
                  value={manager}
                  onChange={e => setManager(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-600"
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
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl"
                >
                  {editingCenter ? 'حفظ التعديلات' : 'إضافة المركز'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
