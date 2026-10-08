import React, { useState } from 'react';
import {
  Users,
  Building,
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  FileSpreadsheet,
  Printer,
  Download,
  X,
  CreditCard,
  Phone,
  MapPin,
  AlertTriangle
} from 'lucide-react';
import {
  AccountingDB,
  Party
} from '../types/accounting';
import {
  formatMoney,
  generateId,
  calculateCustomerBalance,
  calculateSupplierBalance,
  logAudit
} from '../services/accountingStorage';
import { downloadElementAsPdf } from '../services/printAndPdfService';
import { useModalBackHandler } from '../hooks/useModalBackHandler';

interface PartiesViewProps {
  type: 'customer' | 'supplier';
  db: AccountingDB;
  onUpdateDb: (updated: AccountingDB) => void;
  onOpenVoucherModal: (type: 'receipt' | 'payment', partyId?: string) => void;
}

export const PartiesView: React.FC<PartiesViewProps> = ({
  type,
  db,
  onUpdateDb,
  onOpenVoucherModal
}) => {
  const isCustomer = type === 'customer';
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);

  // Statement modal state
  const [statementParty, setStatementParty] = useState<Party | null>(null);

  // Mobile back button handlers
  useModalBackHandler(showModal, () => setShowModal(false), 'party_modal');
  useModalBackHandler(!!statementParty, () => setStatementParty(null), 'party_statement_modal');

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [creditLimit, setCreditLimit] = useState<number>(10000);
  const [taxNumber, setTaxNumber] = useState('');
  const [notes, setNotes] = useState('');

  const partiesList = isCustomer ? db.customers : db.suppliers;

  const filteredParties = partiesList.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.address?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalBalance = partiesList.reduce((sum, p) => {
    const bal = isCustomer ? calculateCustomerBalance(db, p.id) : calculateSupplierBalance(db, p.id);
    return sum + Math.max(0, bal);
  }, 0);

  const handleOpenNewModal = () => {
    setEditingParty(null);
    setName('');
    setPhone('');
    setAddress('');
    setOpeningBalance(0);
    setCreditLimit(15000);
    setTaxNumber('');
    setNotes('');
    setShowModal(true);
  };

  const handleOpenEditModal = (p: Party) => {
    setEditingParty(p);
    setName(p.name);
    setPhone(p.phone || '');
    setAddress(p.address || '');
    setOpeningBalance(p.openingBalance || 0);
    setCreditLimit(p.creditLimit || 0);
    setTaxNumber(p.taxNumber || '');
    setNotes(p.notes || '');
    setShowModal(true);
  };

  const handleSaveParty = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return alert('يرجى كتابة الاسم');

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const targetArray = isCustomer ? updated.customers : updated.suppliers;

    if (editingParty) {
      const idx = targetArray.findIndex(p => p.id === editingParty.id);
      if (idx !== -1) {
        targetArray[idx] = {
          ...targetArray[idx],
          name: name.trim(),
          phone,
          address,
          openingBalance,
          creditLimit,
          taxNumber,
          notes
        };
        logAudit(updated, `تعديل بيانات ${isCustomer ? 'عميل' : 'مورد'}`, `الاسم: ${name}`);
      }
    } else {
      const newParty: Party = {
        id: generateId(isCustomer ? 'cust' : 'supp'),
        type,
        name: name.trim(),
        phone,
        address,
        openingBalance,
        creditLimit,
        taxNumber,
        notes
      };
      targetArray.push(newParty);
      logAudit(updated, `إضافة ${isCustomer ? 'عميل' : 'مورد'} جديد`, `الاسم: ${name}`);
    }

    onUpdateDb(updated);
    setShowModal(false);
  };

  const handleDeleteParty = (partyId: string, partyName: string) => {
    const hasInvoices = db.invoices.some(i => i.partyId === partyId);
    const hasVouchers = db.vouchers.some(v => v.partyId === partyId);

    if (hasInvoices || hasVouchers) {
      alert('لا يمكن حذف هذه الجهة لوجود فواتير أو سندات مالية مسجلة باسمها.');
      return;
    }

    if (!confirm(`هل أنت متأكد من حذف ${isCustomer ? 'العميل' : 'المورد'} "${partyName}"؟`)) {
      return;
    }

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    if (isCustomer) {
      updated.customers = updated.customers.filter(c => c.id !== partyId);
    } else {
      updated.suppliers = updated.suppliers.filter(s => s.id !== partyId);
    }
    logAudit(updated, `حذف ${isCustomer ? 'عميل' : 'مورد'}`, `تم حذف ${partyName}`);
    onUpdateDb(updated);
  };

  // Build Statement of Account ledger rows
  const getStatementRows = (party: Party) => {
    const rows: {
      date: string;
      desc: string;
      type: string;
      debit: number;
      credit: number;
      balance: number;
    }[] = [];

    let running = party.openingBalance || 0;
    if (running !== 0) {
      rows.push({
        date: '-',
        desc: 'رصيد افتتاحي سابق',
        type: 'opening',
        debit: running > 0 ? running : 0,
        credit: running < 0 ? Math.abs(running) : 0,
        balance: running
      });
    }

    // Invoices
    db.invoices
      .filter(i => i.partyId === party.id)
      .forEach(inv => {
        if (isCustomer && inv.type === 'sale') {
          // Sale adds debt to customer (Debit)
          const unpaid = inv.total - inv.paid;
          running += unpaid;
          rows.push({
            date: inv.date,
            desc: `فاتورة بيع رقم ${inv.number}`,
            type: 'sale',
            debit: inv.total,
            credit: inv.paid,
            balance: running
          });
        } else if (!isCustomer && inv.type === 'purchase') {
          // Purchase adds debt to us towards supplier (Credit)
          const unpaid = inv.total - inv.paid;
          running += unpaid;
          rows.push({
            date: inv.date,
            desc: `فاتورة شراء رقم ${inv.number}`,
            type: 'purchase',
            debit: inv.paid,
            credit: inv.total,
            balance: running
          });
        }
      });

    // Vouchers (سندات القبض والصرف)
    db.vouchers
      .filter(v => v.partyId === party.id)
      .forEach(v => {
        if (isCustomer && v.type === 'receipt') {
          running -= v.amount;
          rows.push({
            date: v.date,
            desc: `سند قبض نقدي/بنكي رقم ${v.number} - (${v.description || ''})`,
            type: 'receipt',
            debit: 0,
            credit: v.amount,
            balance: running
          });
        } else if (!isCustomer && v.type === 'payment') {
          running -= v.amount;
          rows.push({
            date: v.date,
            desc: `سند صرف للمورد رقم ${v.number} - (${v.description || ''})`,
            type: 'payment',
            debit: v.amount,
            credit: 0,
            balance: running
          });
        }
      });

    // Returns
    db.returns
      .filter(r => r.partyId === party.id)
      .forEach(r => {
        if (r.paymentMethod === 'آجل') {
          running -= r.total;
          rows.push({
            date: r.date,
            desc: `مرتجع رقم ${r.number}`,
            type: 'return',
            debit: 0,
            credit: r.total,
            balance: running
          });
        }
      });

    return rows.sort((a, b) => (a.date > b.date ? 1 : -1));
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            {isCustomer ? <Users className="w-6 h-6" /> : <Building className="w-6 h-6" />}
            <span>إدارة {isCustomer ? 'العملاء والذمم المدينة' : 'الموردين والذمم الدائنة'}</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            متابعة أرصدة الحسابات الجارية، حدود الائتمان، وكشوف الحسابات المالية التفصيلية
          </p>
        </div>

        <button
          onClick={handleOpenNewModal}
          className="px-4 py-2 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة {isCustomer ? 'عميل جديد' : 'مورد جديد'}</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-bold text-slate-600 block mb-1">
            إجمالي عدد {isCustomer ? 'العملاء' : 'الموردين'}
          </span>
          <span className="text-lg sm:text-xl font-black font-mono text-slate-950">
            {partiesList.length} <span className="text-xs font-normal text-slate-500">طرف مسجل</span>
          </span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-bold text-slate-600 block mb-1">
            {isCustomer ? 'إجمالي المديونية المستحقة على العملاء' : 'إجمالي المستحق دفعه للموردين'}
          </span>
          <span className={`text-lg sm:text-xl font-black font-mono ${isCustomer ? 'text-amber-700' : 'text-rose-700'}`}>
            {formatMoney(totalBalance, db.settings.currency)}
          </span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-bold text-slate-600 block mb-1">
            إجراء فوري سريع
          </span>
          <button
            onClick={() => onOpenVoucherModal(isCustomer ? 'receipt' : 'payment')}
            className="mt-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 rounded-lg text-xs font-bold transition-all"
          >
            {isCustomer ? '+ سند قبض من عميل' : '+ سند صرف لمورد'}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          <input
            type="text"
            placeholder={`بحث باسم ${isCustomer ? 'العميل' : 'المورد'} أو رقم الهاتف...`}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pr-9 pl-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-hidden focus:border-black"
          />
        </div>
      </div>

      {/* Parties Responsive Card System (No Horizontal Scroll) */}
      {filteredParties.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-sm font-bold text-slate-700">لا توجد بيانات تطابق البحث</div>
          <button
            onClick={handleOpenNewModal}
            className="mt-3 px-4 py-2 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة {isCustomer ? 'عميل' : 'مورد'} جديد</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {filteredParties.map(p => {
            const bal = isCustomer
              ? calculateCustomerBalance(db, p.id)
              : calculateSupplierBalance(db, p.id);
            const isOverLimit = p.creditLimit > 0 && bal > p.creditLimit;

            return (
              <div
                key={p.id}
                className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between p-3.5"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                  <div>
                    <h3 className="font-black text-sm text-slate-900 flex items-center gap-1.5">
                      {p.name}
                    </h3>
                    {p.phone && (
                      <span className="text-[11px] text-slate-500 font-mono mt-0.5 block" dir="ltr">
                        {p.phone}
                      </span>
                    )}
                  </div>

                  {isOverLimit ? (
                    <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[9px] font-black rounded-full border border-rose-300">
                      تجاوز الائتمان
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded-full">
                      {isCustomer ? 'عميل' : 'مورد'}
                    </span>
                  )}
                </div>

                {/* Body */}
                <div className="py-2.5 space-y-2 text-xs">
                  {p.address && (
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-400">العنوان:</span>
                      <span className="font-medium truncate max-w-[180px]">{p.address}</span>
                    </div>
                  )}

                  {p.creditLimit > 0 && (
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-400">سقف الائتمان:</span>
                      <span className="font-mono">{formatMoney(p.creditLimit, db.settings.currency)}</span>
                    </div>
                  )}

                  {/* Net Balance Box */}
                  <div className="bg-slate-50 rounded-lg p-2.5 flex items-center justify-between border border-slate-100 mt-1">
                    <span className="text-xs font-bold text-slate-600">الرصيد الصافي:</span>
                    <span
                      className={`text-base font-black font-mono ${
                        bal > 0 ? (isCustomer ? 'text-amber-700' : 'text-rose-700') : 'text-emerald-700'
                      }`}
                    >
                      {formatMoney(bal, db.settings.currency)}
                    </span>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setStatementParty(p)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-md text-xs font-bold flex items-center gap-1 transition-colors"
                      title="عرض كشف الحساب التفصيلي"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-slate-600" />
                      <span>كشف حساب</span>
                    </button>

                    <button
                      onClick={() => onOpenVoucherModal(isCustomer ? 'receipt' : 'payment', p.id)}
                      className="px-2 py-1 bg-black text-white hover:bg-slate-800 rounded-md text-xs font-bold transition-colors"
                      title={isCustomer ? 'تسجيل سند قبض' : 'تسجيل سند صرف'}
                    >
                      {isCustomer ? '+ قبض' : '- صرف'}
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEditModal(p)}
                      className="p-1.5 text-slate-600 hover:text-black hover:bg-slate-100 rounded-md transition-colors"
                      title="تعديل البيانات"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleDeleteParty(p.id, p.name)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                      title="حذف الطرف"
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

      {/* Modal: Add/Edit Party */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50 rounded-t-2xl">
              <h2 className="text-base font-black text-slate-900">
                {editingParty ? `تعديل بيانات ${isCustomer ? 'العميل' : 'المورد'}` : `إضافة ${isCustomer ? 'عميل' : 'مورد'} جديد`}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-slate-200 rounded">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <form onSubmit={handleSaveParty} className="p-4 space-y-3 overflow-y-auto flex-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  الاسم الكامل / الشركة *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="مثال: شركة الأمل للمقاولات"
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    رقم الهاتف / الواتساب
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="010..."
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    الرقم الضريبي (اختياري)
                  </label>
                  <input
                    type="text"
                    value={taxNumber}
                    onChange={e => setTaxNumber(e.target.value)}
                    placeholder="123-456-789"
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  العنوان والفرع
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="المدينة، الشارع، رقم المبنى..."
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    الرصيد الافتتاحي السابق
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={openingBalance}
                    onChange={e => setOpeningBalance(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    حد الائتمان المسموح
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={creditLimit}
                    onChange={e => setCreditLimit(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  ملاحظات إضافية
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-100 rounded-lg text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-black text-white rounded-lg text-xs font-bold"
                >
                  حفظ البيانات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Detailed Statement of Account (كشف حساب تفصيلي) */}
      {statementParty && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50 rounded-t-2xl">
              <div>
                <h2 className="text-base font-black text-slate-900">
                  كشف حساب تفصيلي: {statementParty.name}
                </h2>
                <p className="text-[11px] text-slate-500 font-medium">
                  بيان تاريخي لجميع الفواتير والتحصيلات والسندات الجارية
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadElementAsPdf('statement-printable-sheet', { format: 'a4', filename: `statement_${statementParty.name}.pdf` })}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold flex items-center gap-1 shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تحميل PDF</span>
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1 bg-slate-200 hover:bg-slate-300 rounded text-xs font-bold flex items-center gap-1"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة الكشف</span>
                </button>
                <button onClick={() => setStatementParty(null)} className="p-1 hover:bg-slate-200 rounded">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
            </div>

            <div id="statement-printable-sheet" className="p-4 overflow-y-auto flex-1 space-y-4 bg-white">
              <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500 block">الهاتف:</span>
                  <span className="font-bold text-slate-900 font-mono">{statementParty.phone || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">العنوان:</span>
                  <span className="font-bold text-slate-900">{statementParty.address || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">الرصيد الصافي الحالي:</span>
                  <span className="font-black font-mono text-sm text-slate-950">
                    {formatMoney(
                      isCustomer
                        ? calculateCustomerBalance(db, statementParty.id)
                        : calculateSupplierBalance(db, statementParty.id),
                      db.settings.currency
                    )}
                  </span>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-black">
                      <th className="py-2.5 px-3">التاريخ</th>
                      <th className="py-2.5 px-3">البيان والحركة</th>
                      <th className="py-2.5 px-3">مدين (+)</th>
                      <th className="py-2.5 px-3">دائن (-)</th>
                      <th className="py-2.5 px-3">الرصيد التراكمي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {getStatementRows(statementParty).map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono text-slate-600">{r.date}</td>
                        <td className="py-2.5 px-3 font-medium text-slate-900">{r.desc}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-950">
                          {r.debit > 0 ? formatMoney(r.debit, db.settings.currency) : '—'}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">
                          {r.credit > 0 ? formatMoney(r.credit, db.settings.currency) : '—'}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-black text-slate-950">
                          {formatMoney(r.balance, db.settings.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
