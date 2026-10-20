import React from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  ShoppingBag,
  FileText,
  ClipboardList,
  RotateCcw,
  Users,
  Building,
  Receipt,
  CreditCard,
  Package,
  Warehouse,
  ArrowLeftRight,
  Calculator,
  TrendingDown,
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  BookOpen,
  FileSpreadsheet,
  BookMarked,
  BarChart3,
  TrendingUp,
  UserCheck,
  ShieldCheck,
  Lock,
  Database,
  Settings,
  X,
  FileCheck2,
  Building2,
  FolderTree,
  Coins,
  Boxes,
  Barcode,
  LockKeyhole
} from 'lucide-react';
import { User } from '../types/accounting';
import { PWAInstallButton } from './PWAInstallBanner';

export type PageId =
  | 'dashboard'
  | 'sales'
  | 'purchases'
  | 'procurement'
  | 'quotes'
  | 'orders'
  | 'returns'
  | 'customers'
  | 'suppliers'
  | 'receipts'
  | 'payments'
  | 'products'
  | 'barcodes'
  | 'warehouses'
  | 'stock'
  | 'inventory'
  | 'prices'
  | 'treasury'
  | 'bank_reconciliation'
  | 'cost_centers'
  | 'currencies'
  | 'fixed_assets'
  | 'expenses'
  | 'revenues'
  | 'accounts'
  | 'journals'
  | 'ledger'
  | 'reports'
  | 'daily_closing'
  | 'profits'
  | 'closing'
  | 'users'
  | 'branches'
  | 'audit'
  | 'periods'
  | 'backup'
  | 'settings';

interface SidebarProps {
  currentPage: PageId;
  onSelectPage: (page: PageId) => void;
  isOpen: boolean;
  onClose: () => void;
  companyName: string;
  currentUser?: User;
}

export function canUserAccessPage(user?: User, pageId?: PageId): boolean {
  if (!user) return true;
  const p = user.permissions;
  const isManager = user.role === 'مدير';

  switch (pageId) {
    case 'dashboard':
      return true;
    case 'sales':
      return p ? (p.canViewSales !== false && p.canViewInvoices !== false) : true;
    case 'purchases':
      return p ? p.canViewPurchases !== false : true;
    case 'procurement':
      return p ? p.canManageProcurement !== false : true;
    case 'quotes':
    case 'orders':
      return p ? p.canManageQuotesOrders !== false : true;
    case 'returns':
      return p ? (p.canManageSalesReturns !== false || p.canManagePurchaseReturns !== false) : true;
    case 'customers':
      return p ? (p.canViewCustomers !== false || p.canManageCustomers !== false) : true;
    case 'suppliers':
      return p ? (p.canViewSuppliers !== false || p.canManageSuppliers !== false) : true;
    case 'receipts':
      return p ? p.canCreateReceipts !== false : true;
    case 'payments':
      return p ? p.canCreatePayments !== false : true;
    case 'products':
    case 'prices':
      return p ? p.canViewProducts !== false : true;
    case 'barcodes':
      return p ? p.canPrintBarcodes !== false : true;
    case 'warehouses':
      return p ? p.canManageWarehouses !== false : true;
    case 'stock':
    case 'inventory':
      return p ? p.canManageStock !== false : true;
    case 'treasury':
      return p ? p.canManageTreasury !== false : true;
    case 'expenses':
      return p ? p.canManageExpenses !== false : true;
    case 'revenues':
      return p ? p.canManageRevenues !== false : true;
    case 'bank_reconciliation':
      return p ? p.canBankReconciliation === true : isManager;
    case 'cost_centers':
    case 'currencies':
    case 'fixed_assets':
      return p ? p.canManageCostCenters === true : isManager;
    case 'accounts':
    case 'journals':
    case 'ledger':
      return p ? p.canManageAccounting === true : isManager;
    case 'daily_closing':
      return p ? p.canDailyClosing !== false : true;
    case 'profits':
      return p ? p.canViewProfits === true : isManager;
    case 'reports':
      return p ? p.canViewReports !== false : true;
    case 'closing':
    case 'periods':
      return p ? p.canClosePeriods === true : isManager;
    case 'branches':
      return p ? p.canManageBranches === true : isManager;
    case 'users':
      return p ? p.canManageUsers === true : isManager;
    case 'audit':
      return p ? p.canViewAudit === true : isManager;
    case 'backup':
      return p ? p.canManageBackup === true : isManager;
    case 'settings':
      return p ? p.canManageSettings === true : isManager;
    default:
      return true;
  }
}

interface NavSection {
  title: string;
  items: {
    id: PageId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
  }[];
}

const navSections: NavSection[] = [
  {
    title: 'الرئيسية',
    items: [
      { id: 'dashboard', label: 'لوحة التحكم والمؤشرات', icon: LayoutDashboard }
    ]
  },
  {
    title: 'البيع والشراء والمشتريات',
    items: [
      { id: 'sales', label: 'فواتير المبيعات', icon: ShoppingCart },
      { id: 'purchases', label: 'فواتير المشتريات', icon: ShoppingBag },
      { id: 'procurement', label: 'دورة المشتريات والمطابقة الثلاثية', icon: FileCheck2 },
      { id: 'quotes', label: 'عروض الأسعار', icon: FileText },
      { id: 'orders', label: 'أوامر البيع والشراء', icon: ClipboardList },
      { id: 'returns', label: 'المرتجعات', icon: RotateCcw }
    ]
  },
  {
    title: 'الجهات والعملاء',
    items: [
      { id: 'customers', label: 'العملاء (ذمم مدينة)', icon: Users },
      { id: 'suppliers', label: 'الموردون (ذمم دائنة)', icon: Building },
      { id: 'receipts', label: 'سندات القبض', icon: Receipt },
      { id: 'payments', label: 'سندات الصرف', icon: CreditCard }
    ]
  },
  {
    title: 'المستودعات والباركود',
    items: [
      { id: 'products', label: 'دليل الأصناف', icon: Package },
      { id: 'barcodes', label: 'طباعة ملصقات الباركود', icon: Barcode },
      { id: 'warehouses', label: 'المخازن والتحويلات', icon: Warehouse },
      { id: 'stock', label: 'كارت حركة المخزون', icon: ArrowLeftRight },
      { id: 'inventory', label: 'الجرد والتسويات', icon: Calculator },
      { id: 'prices', label: 'مقارنة أسعار الشراء', icon: TrendingDown }
    ]
  },
  {
    title: 'الخزينة والحسابات المتقدمة',
    items: [
      { id: 'treasury', label: 'الخزائن وطرق الدفع', icon: Wallet },
      { id: 'bank_reconciliation', label: 'التسوية البنكية ومطابقة الحسابات', icon: Building2 },
      { id: 'cost_centers', label: 'مراكز التكلفة والمشاريع', icon: FolderTree },
      { id: 'currencies', label: 'العملات وأسعار الصرف', icon: Coins },
      { id: 'fixed_assets', label: 'الأصول الثابتة والإهلاك', icon: Boxes },
      { id: 'expenses', label: 'المصروفات التشغيلية', icon: ArrowDownCircle },
      { id: 'revenues', label: 'الإيرادات الأخرى', icon: ArrowUpCircle },
      { id: 'accounts', label: 'دليل الحسابات (شجرة الحسابات)', icon: BookOpen },
      { id: 'journals', label: 'القيود اليومية المزدوجة', icon: FileSpreadsheet },
      { id: 'ledger', label: 'دفتر الأستاذ وميزان المراجعة', icon: BookMarked }
    ]
  },
  {
    title: 'التقارير والإدارة المالية',
    items: [
      { id: 'daily_closing', label: 'تقفيل اليومية والورديات', icon: ShieldCheck, badge: 'جديد' },
      { id: 'profits', label: 'تحليل أرباح الفواتير والأصناف', icon: TrendingUp },
      { id: 'reports', label: 'التقارير المالية والمحاسبية', icon: BarChart3 },
      { id: 'closing', label: 'إقفال الفترات والترحيل السنوي', icon: LockKeyhole },
      { id: 'branches', label: 'فروع المحل والنشاط', icon: Building2 },
      { id: 'users', label: 'المستخدمون والصلاحيات', icon: UserCheck },
      { id: 'audit', label: 'سجل النشاط والتدقيق', icon: ShieldCheck },
      { id: 'periods', label: 'الفترات المحاسبية', icon: Lock },
      { id: 'backup', label: 'النسخ الاحتياطي والبيانات', icon: Database },
      { id: 'settings', label: 'إعدادات النظام والمنشأة', icon: Settings }
    ]
  }
];

const SidebarComponent: React.FC<SidebarProps> = ({
  currentPage,
  onSelectPage,
  isOpen,
  onClose,
  companyName,
  currentUser
}) => {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40 lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 lg:top-16 right-0 bottom-0 w-64 bg-white border-l border-slate-200 z-50 flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* App Quick Banner */}
        <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="شعار حساباتي"
              className="w-8 h-8 rounded-lg object-contain shadow-2xs border border-slate-200 bg-white p-0.5"
            />
            <div>
              <div className="font-extrabold text-xs text-slate-900 leading-tight">
                حساباتي
              </div>
              <div className="text-[10px] text-emerald-700 font-bold truncate max-w-[130px]">
                {currentUser ? `${currentUser.name} (${currentUser.role})` : 'برنامج الحسابات والفروع'}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 text-slate-500 hover:text-black rounded-md hover:bg-slate-200 transition-colors cursor-pointer"
            title="إغلاق القائمة"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation list filtered by role & permissions */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
          {navSections.map((section, idx) => {
            const accessibleItems = section.items.filter(item => canUserAccessPage(currentUser, item.id));
            if (accessibleItems.length === 0) return null;

            return (
              <div key={idx} className="space-y-0.5">
                <div className="px-2 py-1 text-[10px] font-black text-slate-400 tracking-wider">
                  {section.title}
                </div>
                <div className="space-y-0.5">
                  {accessibleItems.map(item => {
                    const Icon = item.icon;
                    const isActive = currentPage === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          onSelectPage(item.id);
                          if (window.innerWidth < 1024) onClose();
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                          isActive
                            ? 'bg-slate-950 text-white shadow-xs'
                            : 'text-slate-800 hover:text-black hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-600'}`} />
                          <span>{item.label}</span>
                        </div>
                        {item.badge && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-800 font-mono">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer info & Install */}
        <div className="p-2.5 border-t border-slate-100 bg-slate-50/50 flex flex-col items-center gap-2">
          <PWAInstallButton className="w-full justify-center" />
          <div className="text-[10px] text-slate-500 font-medium">
            نظام القيد المزدوج المتوازن © 2026
          </div>
        </div>
      </aside>
    </>
  );
};

export const Sidebar = React.memo(SidebarComponent);
