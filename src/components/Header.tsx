import React, { useState } from 'react';
import { 
  Search, 
  PlusCircle, 
  Bell, 
  User, 
  Calendar, 
  Menu, 
  Printer, 
  Building2,
  CheckCircle2,
  Sparkles,
  Cloud,
  LogOut
} from 'lucide-react';
import { AppSettings, User as UserType } from '../types/accounting';
import { PWAInstallButton } from './PWAInstallBanner';

interface HeaderProps {
  settings: AppSettings;
  currentUser: UserType;
  lowStockCount: number;
  onOpenQuickSearch: () => void;
  onToggleSidebar: () => void;
  onQuickAction: (action: string) => void;
  activePageTitle: string;
  onOpenDriveBackup?: () => void;
  onOpenLogin?: () => void;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  currentUser,
  lowStockCount,
  onOpenQuickSearch,
  onToggleSidebar,
  onQuickAction,
  activePageTitle,
  onOpenDriveBackup,
  onOpenLogin,
  onLogout
}) => {
  const [showQuickDropdown, setShowQuickDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  const todayArabic = new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs select-none">
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 h-16">
        {/* Right side (RTL start): Toggle, Brand, Current view */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={onToggleSidebar}
            className="p-2 text-slate-800 hover:text-black hover:bg-slate-100 rounded-lg transition-colors focus:outline-hidden cursor-pointer"
            title="تبديل القائمة الجانبية"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div 
            onClick={onOpenLogin}
            className="flex items-center gap-2 cursor-pointer hover:opacity-85 transition-opacity"
            title="انقر لتبديل المنشأة أو تأسيس شركة جديدة"
          >
            <div className="w-9 h-9 rounded-lg bg-black text-white flex items-center justify-center font-black text-base shadow-xs">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="font-extrabold text-slate-900 text-sm leading-tight flex items-center gap-1.5">
                <span>{settings.company || 'حساباتي'}</span>
                <span className="text-[10px] bg-emerald-50 text-emerald-800 font-bold px-1.5 py-0.5 rounded-sm border border-emerald-200">
                  مساحة معزولة
                </span>
              </div>
              <div className="text-[11px] text-slate-500 font-medium">
                {activePageTitle}
              </div>
            </div>
          </div>
        </div>

        {/* Center: Quick Search Bar */}
        <div className="flex-1 max-w-md mx-4 hidden md:block">
          <button
            onClick={onOpenQuickSearch}
            className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-900 rounded-lg border border-slate-200 text-xs transition-all shadow-2xs group cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400 group-hover:text-black" />
              <span>بحث سريع عن صنف، عميل، مورد، فاتورة، أو باركود...</span>
            </div>
            <span className="bg-white border border-slate-200 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-sm text-slate-600">
              Ctrl + K
            </span>
          </button>
        </div>

        {/* Left side (RTL end): Actions, alerts, Google Drive, user */}
        <div className="flex items-center gap-2">
          {/* Quick search button for small screens */}
          <button
            onClick={onOpenQuickSearch}
            className="md:hidden p-2 text-slate-700 hover:text-black hover:bg-slate-100 rounded-lg cursor-pointer"
            title="بحث"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* PWA Mobile Install Button */}
          <PWAInstallButton />

          {/* Backup & Data Protection Button */}
          {onOpenDriveBackup && (
            <button
              onClick={onOpenDriveBackup}
              className="p-2 text-emerald-800 hover:text-emerald-950 hover:bg-emerald-50 rounded-lg transition-colors border border-emerald-300 cursor-pointer flex items-center gap-1.5 text-xs font-bold"
              title="مركز النسخ الاحتياطي وحماية البيانات"
            >
              <Cloud className="w-4 h-4 text-emerald-600" />
              <span className="hidden sm:inline text-[11px]">النسخ الاحتياطي</span>
            </button>
          )}

          {/* Quick Add Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowQuickDropdown(!showQuickDropdown)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-black hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-colors shadow-xs cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span className="hidden sm:inline">إجراء سريع</span>
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
                  <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">F2</span>
                </button>
                <button
                  onClick={() => onQuickAction('new_purchase')}
                  className="w-full px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 hover:text-black flex items-center justify-between text-right cursor-pointer"
                >
                  <span>فاتورة شراء جديدة</span>
                  <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">F3</span>
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

          {/* Date Indicator */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-medium text-[11px]">{todayArabic}</span>
          </div>

          {/* User badge with dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowUserDropdown(!showUserDropdown)}
              className="flex items-center gap-2 pl-1 pr-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 text-xs transition-colors cursor-pointer"
            >
              <div className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-[10px]">
                {currentUser.name.charAt(0)}
              </div>
              <div className="hidden sm:block text-right">
                <div className="font-bold text-slate-900 text-[11px] leading-tight">
                  {currentUser.name}
                </div>
                <div className="text-[9px] text-slate-500 leading-tight">
                  {currentUser.role}
                </div>
              </div>
            </button>

            {showUserDropdown && (
              <div
                className="absolute left-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 text-right animate-in fade-in slide-in-from-top-2"
                onClick={() => setShowUserDropdown(false)}
              >
                <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/60 rounded-t-xl">
                  <div className="font-extrabold text-xs text-slate-900">{currentUser.name}</div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">{currentUser.role}</div>
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
                    <Building2 className="w-4 h-4 text-slate-700" />
                    <span>تبديل المنشأة / تأسيس شركة جديدة</span>
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
      </div>
    </header>
  );
};

