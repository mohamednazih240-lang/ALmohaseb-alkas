import React, { useState } from 'react';
import { 
  Search, 
  PlusCircle, 
  Bell, 
  User, 
  Calendar, 
  Menu, 
  Building2,
  CheckCircle2,
  Sparkles,
  Cloud,
  LogOut,
  MoreVertical,
  X,
  RefreshCw,
  FileText,
  ShoppingCart,
  ShoppingBag,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  Users
} from 'lucide-react';
import { AppSettings, User as UserType, Branch } from '../types/accounting';
import { PWAInstallButton } from './PWAInstallBanner';

interface HeaderProps {
  settings: AppSettings;
  currentUser: UserType;
  branches?: Branch[];
  activeBranchId?: string;
  onSelectBranch?: (branchId: string) => void;
  onOpenCreateBranch?: () => void;
  lowStockCount: number;
  onOpenQuickSearch: () => void;
  onToggleSidebar: () => void;
  onQuickAction: (action: string) => void;
  activePageTitle: string;
  onOpenDriveBackup?: () => void;
  onOpenLogin?: () => void;
  onLogout?: () => void;
  onManualSync?: () => void;
}

const HeaderComponent: React.FC<HeaderProps> = ({
  settings,
  currentUser,
  branches = [],
  activeBranchId = '',
  onSelectBranch = () => {},
  onOpenCreateBranch = () => {},
  lowStockCount,
  onOpenQuickSearch,
  onToggleSidebar,
  onQuickAction,
  activePageTitle,
  onOpenDriveBackup,
  onOpenLogin,
  onLogout,
  onManualSync
}) => {
  const [showQuickDropdown, setShowQuickDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const activeBranch = branches.find(b => b.id === activeBranchId) || branches[0];

  const todayArabic = new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const handleSyncClick = async () => {
    setIsSyncing(true);
    try {
      if (onManualSync) {
        await onManualSync();
      }
    } finally {
      setTimeout(() => setIsSyncing(false), 1000);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-2xs select-none w-full max-w-full overflow-hidden">
      <div className="flex items-center justify-between px-2.5 sm:px-4 py-2 h-14 sm:h-16 max-w-full">
        {/* Right side (RTL start): Toggle, Brand, Current view, Branch (Desktop) */}
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <button
            onClick={onToggleSidebar}
            className="p-1.5 sm:p-2 text-slate-800 hover:text-black hover:bg-slate-100 rounded-lg transition-colors focus:outline-hidden cursor-pointer shrink-0"
            title="تبديل القائمة الجانبية"
            aria-label="القائمة الجانبية"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div 
            onClick={onOpenLogin}
            className="flex items-center gap-1.5 sm:gap-2 cursor-pointer hover:opacity-85 transition-opacity min-w-0"
            title="انقر لتبديل المستخدم أو تسجيل الدخول"
          >
            <img
              src="/logo.png"
              alt="شعار حساباتي"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl object-contain shadow-2xs border border-slate-200 bg-white p-0.5 shrink-0"
            />
            <div className="min-w-0 truncate">
              <div className="font-black text-slate-900 text-xs sm:text-sm leading-tight truncate">
                حساباتي
              </div>
              <div className="text-[10px] sm:text-[11px] text-slate-500 font-medium truncate">
                {activePageTitle}
              </div>
            </div>
          </div>

          {/* Branch Switcher: Desktop Full Selector */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold shadow-2xs shrink-0">
            <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <select
              value={activeBranchId}
              onChange={(e) => {
                if (e.target.value === '__add_new__') {
                  onOpenCreateBranch();
                } else {
                  onSelectBranch(e.target.value);
                }
              }}
              className="bg-transparent text-slate-800 text-xs font-bold outline-none cursor-pointer max-w-[120px] sm:max-w-[150px] truncate"
              title="اختيار فرع المحل للعمليات والفواتير"
            >
              {(branches || []).map(b => (
                <option key={b.id} value={b.id}>
                  {b.isMain ? '🏢 ' : '🔒 '}{b.name} {b.isMain ? '(المقر الرئيسي)' : '(محمي برقم سري)'}
                </option>
              ))}
              <option value="__add_new__">+ إنشاء فرع جديد...</option>
            </select>
          </div>
        </div>

        {/* Center: Quick Search Bar (Tablet / Desktop) */}
        <div className="flex-1 max-w-md mx-3 hidden md:block">
          <button
            onClick={onOpenQuickSearch}
            className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-900 rounded-lg border border-slate-200 text-xs transition-all shadow-2xs group cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400 group-hover:text-black" />
              <span>بحث سريع عن صنف، عميل، مورد، فاتورة...</span>
            </div>
            <span className="bg-white border border-slate-200 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-sm text-slate-600">
              Ctrl + K
            </span>
          </button>
        </div>

        {/* Left side (RTL end): Desktop Full Actions */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          {/* Quick search button for medium screens */}
          <button
            onClick={onOpenQuickSearch}
            className="md:hidden p-2 text-slate-700 hover:text-black hover:bg-slate-100 rounded-lg cursor-pointer"
            title="بحث"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* PWA Mobile Install Button */}
          <PWAInstallButton />

          {/* Realtime Live Cloud Sync Button */}
          <button
            type="button"
            onClick={handleSyncClick}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer"
            title="مزامنة لحظية مباشرة بين كافة التليفونات"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[11px]">{isSyncing ? 'جارٍ التحديث...' : 'مزامنة لحظية'}</span>
          </button>

          {/* Backup & Data Protection Button */}
          {onOpenDriveBackup && (
            <button
              onClick={onOpenDriveBackup}
              className="p-2 text-emerald-800 hover:text-emerald-950 hover:bg-emerald-50 rounded-lg transition-colors border border-emerald-300 cursor-pointer flex items-center gap-1.5 text-xs font-bold"
              title="مركز النسخ الاحتياطي وحماية البيانات"
            >
              <Cloud className="w-4 h-4 text-emerald-600" />
              <span className="hidden lg:inline text-[11px]">النسخ الاحتياطي</span>
            </button>
          )}

          {/* Quick Add Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowQuickDropdown(!showQuickDropdown)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-black hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-colors shadow-xs cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>إجراء سريع</span>
            </button>

            {showQuickDropdown && (
              <div 
                className="absolute left-0 mt-2 w-52 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 text-right animate-in fade-in slide-in-from-top-2"
                onClick={() => setShowQuickDropdown(false)}
              >
                <div className="px-3 py-1 text-[11px] font-bold text-slate-400 border-b border-slate-100 mb-1">
                  العمليات الأكثر استخداماً
                </div>
                <button
                  onClick={() => onQuickAction('new_sale')}
                  className="w-full px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 hover:text-black flex items-center justify-between text-right cursor-pointer"
                >
                  <span>فاتورة بيع جديدة</span>
                  <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">F2</span>
                </button>
                <button
                  onClick={() => onQuickAction('new_purchase')}
                  className="w-full px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 hover:text-black flex items-center justify-between text-right cursor-pointer"
                >
                  <span>فاتورة شراء جديدة</span>
                  <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">F3</span>
                </button>
                <button
                  onClick={() => onQuickAction('new_receipt')}
                  className="w-full px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 hover:text-black flex items-center justify-between text-right cursor-pointer"
                >
                  <span>سند قبض من عميل</span>
                  <span className="text-[10px] text-emerald-600 font-mono">+قبض</span>
                </button>
                <button
                  onClick={() => onQuickAction('new_payment')}
                  className="w-full px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 hover:text-black flex items-center justify-between text-right cursor-pointer"
                >
                  <span>سند صرف لمورد</span>
                  <span className="text-[10px] text-rose-600 font-mono">-صرف</span>
                </button>
                <div className="my-1 border-t border-slate-100"></div>
                <button
                  onClick={() => onQuickAction('new_product')}
                  className="w-full px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-black text-right cursor-pointer"
                >
                  إضافة صنف للمخزون
                </button>
                <button
                  onClick={() => onQuickAction('new_customer')}
                  className="w-full px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-black text-right cursor-pointer"
                >
                  إضافة عميل جديد
                </button>
              </div>
            )}
          </div>

          {/* Low stock alerts badge */}
          {lowStockCount > 0 && (
            <button
              onClick={() => onQuickAction('view_low_stock')}
              className="relative p-2 text-slate-700 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors border border-amber-200 cursor-pointer"
              title={`${lowStockCount} أصناف قاربت على النفاد`}
            >
              <Bell className="w-4 h-4 text-amber-600" />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-600 text-white rounded-full text-[9px] font-bold flex items-center justify-center">
                {lowStockCount}
              </span>
            </button>
          )}

          {/* User badge with dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowUserDropdown(!showUserDropdown)}
              className="flex items-center gap-2 pl-1 pr-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 text-xs transition-colors cursor-pointer"
            >
              <div className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-[10px]">
                {currentUser?.name ? currentUser.name.charAt(0) : 'م'}
              </div>
              <div className="text-right">
                <div className="font-bold text-slate-900 text-[11px] leading-tight max-w-[80px] truncate">
                  {currentUser?.name || 'المدير'}
                </div>
                <div className="text-[9px] text-slate-500 leading-tight">
                  {currentUser?.role || 'مدير'}
                </div>
              </div>
            </button>

            {showUserDropdown && (
              <div
                className="absolute left-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 text-right animate-in fade-in slide-in-from-top-2"
                onClick={() => setShowUserDropdown(false)}
              >
                <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/60 rounded-t-xl">
                  <div className="font-extrabold text-xs text-slate-900">{currentUser?.name}</div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">{currentUser?.role}</div>
                  <div className="mt-1.5 pt-1.5 border-t border-slate-200/60 flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
                    <Building2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{settings.company}</span>
                  </div>
                </div>

                {onOpenDriveBackup && (
                  <button
                    onClick={onOpenDriveBackup}
                    className="w-full px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-black flex items-center gap-2 text-right cursor-pointer"
                  >
                    <Cloud className="w-4 h-4 text-emerald-600" />
                    <span>مركز النسخ الاحتياطي وحماية البيانات</span>
                  </button>
                )}

                {onOpenLogin && (
                  <button
                    onClick={onOpenLogin}
                    className="w-full px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 hover:text-black flex items-center gap-2 text-right cursor-pointer"
                  >
                    <User className="w-4 h-4 text-blue-600" />
                    <span>تبديل المستخدم (تسجيل دخول)</span>
                  </button>
                )}

                {onLogout && (
                  <button
                    onClick={onLogout}
                    className="w-full px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 flex items-center gap-2 text-right border-t border-slate-100 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>تسجيل الخروج</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* MOBILE HEADER (sm:hidden): Clean, spacious, with the 3-dots (⋮) Menu Button requested by user */}
        <div className="flex sm:hidden items-center gap-1.5 shrink-0">
          {/* Quick search button */}
          <button
            onClick={onOpenQuickSearch}
            className="p-1.5 text-slate-600 hover:text-black hover:bg-slate-100 rounded-lg cursor-pointer"
            title="بحث"
            aria-label="بحث"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* User Avatar Circle */}
          <div 
            onClick={onOpenLogin}
            className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs shadow-2xs cursor-pointer border border-slate-200"
            title={`المستخدم الحالي: ${currentUser?.name || 'المدير'}`}
          >
            {currentUser?.name ? currentUser.name.charAt(0) : 'م'}
          </div>

          {/* The 3 Vertical Dots (⋮) Menu Button - Organizes all mobile actions without overflow */}
          <button
            type="button"
            onClick={() => setShowMobileMenu(prev => !prev)}
            className="p-1.5 text-slate-800 hover:text-black bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors cursor-pointer relative"
            title="القائمة السريعة والأدوات (ثلاث نقاط)"
            aria-label="خيارات وأدوات الهيدر"
          >
            <MoreVertical className="w-5 h-5 text-slate-900" />
            {lowStockCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-500 rounded-full ring-2 ring-white" />
            )}
          </button>
        </div>
      </div>

      {/* MOBILE POPUP / BOTTOM SHEET MENU (Opened via the 3 Vertical Dots ⋮) */}
      {showMobileMenu && (
        <div className="sm:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex flex-col justify-end text-right animate-in fade-in duration-150">
          <div 
            className="bg-white rounded-t-3xl max-h-[85vh] overflow-y-auto p-4 shadow-2xl border-t border-slate-200 space-y-3.5 animate-in slide-in-from-bottom duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Menu Header with Close Button */}
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xs">
                  {currentUser?.name ? currentUser.name.charAt(0) : 'م'}
                </div>
                <div>
                  <div className="text-xs font-black text-slate-900">{currentUser?.name || 'مدير النظام'}</div>
                  <div className="text-[10px] text-slate-500">{currentUser?.role || 'مدير'} • {settings.company}</div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowMobileMenu(false)}
                className="p-1.5 text-slate-400 hover:text-slate-900 bg-slate-100 rounded-full cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Actions Grid (بيع، شراء، قبض، صرف) */}
            <div>
              <div className="text-[11px] font-black text-slate-500 mb-2">إجراء سريع:</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileMenu(false);
                    onQuickAction('new_sale');
                  }}
                  className="p-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 rounded-xl border border-emerald-200 font-bold flex items-center gap-2 cursor-pointer transition-colors text-right"
                >
                  <ShoppingCart className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>+ فاتورة بيع جديدة</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowMobileMenu(false);
                    onQuickAction('new_purchase');
                  }}
                  className="p-2.5 bg-blue-50 hover:bg-blue-100 text-blue-900 rounded-xl border border-blue-200 font-bold flex items-center gap-2 cursor-pointer transition-colors text-right"
                >
                  <ShoppingBag className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>+ فاتورة شراء جديدة</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowMobileMenu(false);
                    onQuickAction('new_receipt');
                  }}
                  className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-xl border border-slate-200 font-bold flex items-center gap-2 cursor-pointer transition-colors text-right text-[11px]"
                >
                  <ArrowDownLeft className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>سند قبض من عميل</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowMobileMenu(false);
                    onQuickAction('new_payment');
                  }}
                  className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-xl border border-slate-200 font-bold flex items-center gap-2 cursor-pointer transition-colors text-right text-[11px]"
                >
                  <ArrowUpRight className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>سند صرف لمورد</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowMobileMenu(false);
                    onQuickAction('new_product');
                  }}
                  className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-xl border border-slate-200 font-bold flex items-center gap-2 cursor-pointer transition-colors text-right text-[11px]"
                >
                  <Boxes className="w-4 h-4 text-slate-600 shrink-0" />
                  <span>إضافة صنف جديد</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowMobileMenu(false);
                    onQuickAction('new_customer');
                  }}
                  className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-xl border border-slate-200 font-bold flex items-center gap-2 cursor-pointer transition-colors text-right text-[11px]"
                >
                  <Users className="w-4 h-4 text-slate-600 shrink-0" />
                  <span>إضافة عميل جديد</span>
                </button>
              </div>
            </div>

            {/* Cloud Realtime Sync & Backup */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="text-[11px] font-black text-slate-500">المزامنة والسحابة:</div>
              <button
                type="button"
                onClick={async () => {
                  setShowMobileMenu(false);
                  await handleSyncClick();
                }}
                className="w-full p-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-950 rounded-xl text-xs font-bold flex items-center justify-between cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span>مزامنة لحظية مباشرة بين الهواتف</span>
                </div>
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${isSyncing ? 'animate-spin' : ''}`} />
              </button>

              {onOpenDriveBackup && (
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileMenu(false);
                    onOpenDriveBackup();
                  }}
                  className="w-full p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center justify-between cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-emerald-600" />
                    <span>النسخ الاحتياطي وحماية البيانات (Drive)</span>
                  </div>
                  <span className="text-[10px] text-slate-400">سحابي</span>
                </button>
              )}
            </div>

            {/* Branch Switcher on Mobile */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <label className="text-[11px] font-black text-slate-500 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-blue-600" />
                <span>فرع المحل الحالي:</span>
              </label>
              <select
                value={activeBranchId}
                onChange={(e) => {
                  if (e.target.value === '__add_new__') {
                    setShowMobileMenu(false);
                    onOpenCreateBranch();
                  } else {
                    onSelectBranch(e.target.value);
                  }
                }}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none"
              >
                {(branches || []).map(b => (
                  <option key={b.id} value={b.id}>
                    {b.isMain ? '🏢 ' : '🔒 '}{b.name} {b.isMain ? '(المقر الرئيسي)' : '(محمي برقم سري)'}
                  </option>
                ))}
                <option value="__add_new__">+ إنشاء فرع جديد...</option>
              </select>
            </div>

            {/* Low stock alerts if present */}
            {lowStockCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setShowMobileMenu(false);
                  onQuickAction('view_low_stock');
                }}
                className="w-full p-2.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs font-bold flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-600" />
                  <span>تنبيه: {lowStockCount} أصناف قاربت على النفاد</span>
                </div>
                <span className="bg-amber-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                  فحص المخزون
                </span>
              </button>
            )}

            {/* User Account & Logout */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
              {onOpenLogin && (
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileMenu(false);
                    onOpenLogin();
                  }}
                  className="flex-1 py-2 px-3 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>تبديل المستخدم</span>
                </button>
              )}

              {onLogout && (
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileMenu(false);
                    onLogout();
                  }}
                  className="py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>خروج</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export const Header = React.memo(HeaderComponent);
