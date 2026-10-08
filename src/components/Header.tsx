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
  ArrowRight
} from 'lucide-react';
import { AppSettings, User as UserType } from '../types/accounting';

interface HeaderProps {
  settings: AppSettings;
  currentUser: UserType;
  lowStockCount: number;
  onOpenQuickSearch: () => void;
  onToggleSidebar: () => void;
  onQuickAction: (action: string) => void;
  activePageTitle: string;
  canGoBack?: boolean;
  onGoBack?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  currentUser,
  lowStockCount,
  onOpenQuickSearch,
  onToggleSidebar,
  onQuickAction,
  activePageTitle,
  canGoBack = false,
  onGoBack
}) => {
  const [showQuickDropdown, setShowQuickDropdown] = useState(false);

  const todayArabic = new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs select-none">
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 h-16">
        {/* Right side (RTL start): Toggle, Back Button, Brand, Current view */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={onToggleSidebar}
            className="p-2 text-slate-800 hover:text-black hover:bg-slate-100 rounded-lg transition-colors focus:outline-hidden cursor-pointer"
            title="تبديل القائمة الجانبية"
          >
            <Menu className="w-5 h-5" />
          </button>

          {canGoBack && onGoBack && (
            <button
              onClick={onGoBack}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-lg text-xs font-bold transition-all flex items-center gap-1 border border-slate-300 shadow-2xs cursor-pointer active:scale-95"
              title="الرجوع للصفحة السابقة"
            >
              <ArrowRight className="w-4 h-4 text-slate-700" />
              <span className="hidden sm:inline">رجوع</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-black text-white flex items-center justify-center font-black text-base shadow-xs">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="font-extrabold text-slate-900 text-sm leading-tight flex items-center gap-1.5">
                <span>{settings.company || 'حساباتي'}</span>
                <span className="text-[10px] bg-slate-100 text-slate-800 font-bold px-1.5 py-0.5 rounded-sm border border-slate-200">
                  ERP v4.0
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
            className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-900 rounded-lg border border-slate-200 text-xs transition-all shadow-2xs group"
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

        {/* Left side (RTL end): Actions, alerts, user */}
        <div className="flex items-center gap-2">
          {/* Quick search button for small screens */}
          <button
            onClick={onOpenQuickSearch}
            className="md:hidden p-2 text-slate-700 hover:text-black hover:bg-slate-100 rounded-lg"
            title="بحث"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* Quick Add Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowQuickDropdown(!showQuickDropdown)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-black hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-colors shadow-xs"
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
                  className="w-full px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 hover:text-black flex items-center justify-between text-right"
                >
                  <span>فاتورة بيع جديدة</span>
                  <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">F2</span>
                </button>
                <button
                  onClick={() => onQuickAction('new_purchase')}
                  className="w-full px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 hover:text-black flex items-center justify-between text-right"
                >
                  <span>فاتورة شراء جديدة</span>
                  <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">F3</span>
                </button>
                <button
                  onClick={() => onQuickAction('new_receipt')}
                  className="w-full px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 hover:text-black flex items-center justify-between text-right"
                >
                  <span>سند قبض من عميل</span>
                  <span className="text-[10px] text-emerald-600 font-mono">+قبض</span>
                </button>
                <button
                  onClick={() => onQuickAction('new_payment')}
                  className="w-full px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 hover:text-black flex items-center justify-between text-right"
                >
                  <span>سند صرف لمورد</span>
                  <span className="text-[10px] text-rose-600 font-mono">-صرف</span>
                </button>
                <div className="my-1 border-t border-slate-100"></div>
                <button
                  onClick={() => onQuickAction('new_product')}
                  className="w-full px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-black text-right"
                >
                  إضافة صنف للمخزون
                </button>
                <button
                  onClick={() => onQuickAction('new_customer')}
                  className="w-full px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-black text-right"
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
              className="relative p-2 text-slate-700 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors border border-amber-200"
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

          {/* User badge */}
          <div className="flex items-center gap-2 pl-1 pr-2 py-1 bg-slate-100 rounded-lg border border-slate-200 text-xs">
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
          </div>
        </div>
      </div>
    </header>
  );
};
