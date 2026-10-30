import React, { useState } from 'react';
import {
  ArrowRight,
  ShoppingCart,
  ShoppingBag,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  Users,
  Building2,
  FileText,
  Sparkles,
  Cloud,
  RefreshCw,
  User,
  LogOut,
  Building,
  CheckCircle2,
  ShieldCheck,
  Zap,
  Info
} from 'lucide-react';
import { AccountingDB, Branch } from '../types/accounting';
import { PageId } from './Sidebar';

interface QuickMenuPageProps {
  db: AccountingDB;
  onNavigate: (page: PageId) => void;
  onQuickAction: (action: string) => void;
  onOpenProductModal: () => void;
  onOpenPartyModal: (type: 'customer' | 'supplier') => void;
  onOpenCreateBranch: () => void;
  onSelectBranch: (branchId: string) => void;
  activeBranchId: string;
  onManualSync?: () => Promise<void>;
  onOpenDriveBackup?: () => void;
  onOpenLogin?: () => void;
  onLogout?: () => void;
  onBack?: () => void;
}

export const QuickMenuPage: React.FC<QuickMenuPageProps> = ({
  db,
  onNavigate,
  onQuickAction,
  onOpenProductModal,
  onOpenPartyModal,
  onOpenCreateBranch,
  onSelectBranch,
  activeBranchId,
  onManualSync,
  onOpenDriveBackup,
  onOpenLogin,
  onLogout,
  onBack
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const branches = db.branches || [{ id: 'br_main', name: 'الفرع الرئيسي', code: 'BR-01', isMain: true }];
  const currentBranch = branches.find(b => b.id === activeBranchId) || branches[0];
  const currentUser = db.currentUser || db.users[0];

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      if (onManualSync) {
        await onManualSync();
      }
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6 pb-16 animate-in fade-in duration-200 select-none">
      {/* Top Navigation & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl transition-colors cursor-pointer flex items-center justify-center shrink-0 border border-slate-300"
              title="العودة للصفحة السابقة"
            >
              <ArrowRight className="w-5 h-5 text-slate-900" />
            </button>
          )}

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                مركز العمليات والأدوات السريعة
              </h1>
              <span className="text-xs bg-slate-900 text-blue-300 font-bold px-2 py-0.5 rounded font-mono">
                {db.settings.companyCode || 'COMP-102'}
              </span>
              <span className="text-xs bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded border border-emerald-200">
                {db.settings.company || 'شركة الموان'}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              صفحة مخصصة لقراءة وتنفيذ كل ما يحتويه زر الثلاث نقاط (⋮) بكل وضوح وتفصيل
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer border border-slate-300 flex items-center gap-1.5"
          >
            <span>الصفحة الرئيسية</span>
          </button>
        </div>
      </div>

      {/* Current Session & Context Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-md border border-slate-700">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-amber-400 font-black text-lg border border-white/20">
              {currentUser?.name ? currentUser.name.charAt(0) : 'م'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-base text-white">{currentUser?.name || 'مدير النظام'}</span>
                <span className="text-[10px] bg-emerald-500 text-slate-950 font-black px-2 py-0.5 rounded-full">
                  {currentUser?.role || 'مدير'}
                </span>
              </div>
              <div className="text-xs text-slate-300 font-medium mt-0.5 flex items-center gap-2 flex-wrap">
                <span>الفرع النشط: {currentBranch.name}</span>
                <span>•</span>
                <span>كود الشركة: {db.settings.companyCode || 'COMP-102'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleSync}
              disabled={isSyncing}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 text-white rounded-xl text-xs font-black shadow transition-all flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'جارٍ المزامنة...' : 'مزامنة سحابية لحظية'}</span>
            </button>

            {onOpenLogin && (
              <button
                type="button"
                onClick={onOpenLogin}
                className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer border border-white/20 flex items-center gap-1.5"
              >
                <User className="w-3.5 h-3.5 text-blue-400" />
                <span>تبديل المستخدم</span>
              </button>
            )}

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="px-3 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-xl text-xs font-bold transition-colors cursor-pointer border border-rose-500/30 flex items-center gap-1"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>خروج</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 1: الفواتير والمبيعات والمشتريات (Primary Invoices) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg">
            <ShoppingCart className="w-4 h-4" />
          </div>
          <h2 className="text-base font-black text-slate-900">
            1. الفواتير والعمليات التجارية الأساسية
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Card: New Sale */}
          <div className="bg-white rounded-2xl p-4 border-2 border-emerald-200 hover:border-emerald-400 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl font-bold">
                  <ShoppingCart className="w-5 h-5" />
                </span>
                <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded font-mono">
                  اختصار F2
                </span>
              </div>
              <h3 className="font-black text-sm text-slate-900 mb-1">
                فاتورة بيع جديدة
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                إصدار فاتورة بيع نقدية أو آجلة، مع الخصم التلقائي من المخزون، تسجيل الإيراد بالخزينة، وترحيل قيود اليومية.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('sales')}
              className="mt-4 w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-black shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>+ فتح فاتورة بيع جديدة</span>
            </button>
          </div>

          {/* Card: New Purchase */}
          <div className="bg-white rounded-2xl p-4 border-2 border-blue-200 hover:border-blue-400 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="p-2 bg-blue-50 text-blue-600 rounded-xl font-bold">
                  <ShoppingBag className="w-5 h-5" />
                </span>
                <span className="text-xs bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded font-mono">
                  اختصار F3
                </span>
              </div>
              <h3 className="font-black text-sm text-slate-900 mb-1">
                فاتورة شراء جديدة
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                إثبات توريد بضائع من الموردين، زيادة أرصدة المخازن، حساب متوسط التكلفة، وإثبات المدفوعات النقدية والآجلة.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('purchases')}
              className="mt-4 w-full py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-black shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>+ فتح فاتورة شراء جديدة</span>
            </button>
          </div>

          {/* Card: Wholesale Sale */}
          <div className="bg-white rounded-2xl p-4 border-2 border-amber-200 hover:border-amber-400 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="p-2 bg-amber-50 text-amber-600 rounded-xl font-bold">
                  <Boxes className="w-5 h-5" />
                </span>
                <span className="text-xs bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded">
                  سعر الجملة
                </span>
              </div>
              <h3 className="font-black text-sm text-slate-900 mb-1">
                مبيعات جملة وتوزيع
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                إصدار فواتير بيع لتجار الجملة مع التطبيق التلقائي لأسعار الجملة المحددة مسبقاً لكل صنف.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onQuickAction('new_wholesale')}
              className="mt-4 w-full py-2.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-xl text-xs font-black shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>+ مبيعات بسعر الجملة</span>
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 2: السندات المالية (Financial Vouchers) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-teal-100 text-teal-800 rounded-lg">
            <ArrowDownLeft className="w-4 h-4" />
          </div>
          <h2 className="text-base font-black text-slate-900">
            2. السندات المالية والتحصيل والصرف
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Card: Receipt Voucher */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 hover:border-teal-400 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="p-2 bg-teal-50 text-teal-600 rounded-xl font-bold">
                  <ArrowDownLeft className="w-5 h-5" />
                </span>
                <span className="text-xs bg-teal-100 text-teal-800 font-bold px-2 py-0.5 rounded">
                  إيداع / تحصيل
                </span>
              </div>
              <h3 className="font-black text-sm text-slate-900 mb-1">
                سند قبض نقدية
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                تحصيل نقدية من عميل، إثبات سداد دفعات الحسابات الآجلة، أو إيرادات أخرى مع ترحيل فوري لحساب الخزينة ودفتر الأستاذ.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('receipts')}
              className="mt-4 w-full py-2.5 bg-teal-600 hover:bg-teal-700 active:scale-95 text-white rounded-xl text-xs font-black shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>+ تسجيل سند قبض جديد</span>
            </button>
          </div>

          {/* Card: Payment Voucher */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 hover:border-rose-400 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="p-2 bg-rose-50 text-rose-600 rounded-xl font-bold">
                  <ArrowUpRight className="w-5 h-5" />
                </span>
                <span className="text-xs bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded">
                  سداد / مصروف
                </span>
              </div>
              <h3 className="font-black text-sm text-slate-900 mb-1">
                سند صرف نقدية
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                سداد مستحقات موردين، مصاريف عمومية ونثرية وتشغيلية من الخزينة، مع إثبات الخصم الفوري وتحديث كشف الحساب.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('payments')}
              className="mt-4 w-full py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl text-xs font-black shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>- تسجيل سند صرف جديد</span>
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 3: الأدلة والبيانات الأساسية (Master Data) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-100 text-indigo-800 rounded-lg">
            <Building2 className="w-4 h-4" />
          </div>
          <h2 className="text-base font-black text-slate-900">
            3. أدلة النظام والأصناف والتقارير
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Item 1: Product */}
          <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <span className="p-2 bg-slate-100 text-slate-700 rounded-xl inline-block mb-2">
                <Boxes className="w-4 h-4" />
              </span>
              <h4 className="font-black text-xs text-slate-900 mb-1">دليل الأصناف</h4>
              <p className="text-[11px] text-slate-500">إضافة صنف جديد وضبط الأسعار والباركود بالمخزن.</p>
            </div>
            <button
              type="button"
              onClick={onOpenProductModal}
              className="mt-3 w-full py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold cursor-pointer"
            >
              + إضافة صنف
            </button>
          </div>

          {/* Item 2: Customer */}
          <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <span className="p-2 bg-blue-50 text-blue-600 rounded-xl inline-block mb-2">
                <Users className="w-4 h-4" />
              </span>
              <h4 className="font-black text-xs text-slate-900 mb-1">دليل العملاء</h4>
              <p className="text-[11px] text-slate-500">تسجيل عميل أو شركة جديدة والأرصدة الافتتاحية.</p>
            </div>
            <button
              type="button"
              onClick={() => onOpenPartyModal('customer')}
              className="mt-3 w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold cursor-pointer"
            >
              + إضافة عميل
            </button>
          </div>

          {/* Item 3: Supplier */}
          <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <span className="p-2 bg-amber-50 text-amber-600 rounded-xl inline-block mb-2">
                <Building2 className="w-4 h-4" />
              </span>
              <h4 className="font-black text-xs text-slate-900 mb-1">دليل الموردين</h4>
              <p className="text-[11px] text-slate-500">تسجيل شركات التوريد والموردين وبياناتهم.</p>
            </div>
            <button
              type="button"
              onClick={() => onOpenPartyModal('supplier')}
              className="mt-3 w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold cursor-pointer"
            >
              + إضافة مورد
            </button>
          </div>

          {/* Item 4: Reports */}
          <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl inline-block mb-2">
                <FileText className="w-4 h-4" />
              </span>
              <h4 className="font-black text-xs text-slate-900 mb-1">التقارير المالية</h4>
              <p className="text-[11px] text-slate-500">كشوف الحسابات، الأرباح، الخزينة، والميزان.</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="mt-3 w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer"
            >
              فتح التقارير
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 4: الربط المالي المتقدم والمزامنة (Linking & Cloud Tools) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-amber-100 text-amber-800 rounded-lg">
            <Sparkles className="w-4 h-4 text-amber-600" />
          </div>
          <h2 className="text-base font-black text-slate-900">
            4. الربط المالي والمزامنة السحابية والحماية
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Feature 1: Past Vouchers Generator */}
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-4 border-2 border-emerald-300 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-black text-emerald-950 mb-1.5">
                <Sparkles className="w-4 h-4 text-emerald-600 animate-pulse" />
                <span>توليد سندات الفواتير السابقة</span>
              </div>
              <p className="text-xs text-emerald-900 leading-relaxed mb-3">
                يقوم بفحص كافة فواتير المبيعات والمشتريات المسجلة سابقاً في النظام وتوليد سندات قبض وصرف فورية لأي مبالغ مسددة دون تكرار لضمان الربط المالي الشامل.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onQuickAction('sync_past_vouchers')}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-black shadow transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>فحص وتوليد السندات الآن</span>
            </button>
          </div>

          {/* Feature 2: Realtime Cloud Sync */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-black text-slate-900 mb-1.5">
                <Zap className="w-4 h-4 text-emerald-600" />
                <span>المزامنة السحابية اللحظية</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed mb-3">
                ربط النظام سحابياً عبر قاعدة بيانات Firebase Firestore للتحديث الفوري المتبادل بين أجهزة المديرين (محمد نزيه وأحمد نزيه) وكافة التليفونات في نفس اللحظة.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSync}
              disabled={isSyncing}
              className="w-full py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'جارٍ المزامنة السحابية...' : 'مزامنة السحابة الآن'}</span>
            </button>
          </div>

          {/* Feature 3: Drive Backup */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-black text-slate-900 mb-1.5">
                <Cloud className="w-4 h-4 text-blue-600" />
                <span>مركز النسخ الاحتياطي وحماية البيانات</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed mb-3">
                تصدير نسخة كاملة من قاعدة البيانات، الفواتير، الحسابات، والمخزون وحفظها بأمان على Google Drive أو ملف محلي للاسترجاع عند الحاجة.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenDriveBackup && onOpenDriveBackup()}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Cloud className="w-3.5 h-3.5" />
              <span>فتح مركز النسخ الاحتياطي</span>
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 5: إدارة الفروع (Branches Management) */}
      <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
              <Building className="w-4 h-4 text-blue-600" />
              <span>فرع العمل النشط وعزل الفروع</span>
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              كل فرع يتميز برقم سري مستقل ومخزون وحسابات منفصلة تماماً
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={activeBranchId}
              onChange={(e) => {
                if (e.target.value === '__add_new__') {
                  onOpenCreateBranch();
                } else {
                  onSelectBranch(e.target.value);
                }
              }}
              className="p-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-blue-500 shadow-2xs"
            >
              {(branches || []).map(b => (
                <option key={b.id} value={b.id}>
                  {b.isMain ? '🏢 ' : '🔒 '}{b.name} {b.isMain ? '(المقر الرئيسي)' : '(محمي برقم سري)'}
                </option>
              ))}
              <option value="__add_new__">+ إنشاء فرع جديد...</option>
            </select>

            <button
              type="button"
              onClick={onOpenCreateBranch}
              className="px-3.5 py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl cursor-pointer transition-colors shadow-xs"
            >
              + فرع جديد
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
