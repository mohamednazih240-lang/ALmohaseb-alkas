import React, { useState, useEffect, useRef } from 'react';
import {
  loadDatabase,
  saveDatabase,
  calculateFinancialSummary
} from './services/accountingStorage';
import {
  AccountingDB,
  Invoice,
  Product
} from './types/accounting';
import { Header } from './components/Header';
import { Sidebar, PageId } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { SalesView } from './components/SalesView';
import { PurchasesView } from './components/PurchasesView';
import { QuotesOrdersView } from './components/QuotesOrdersView';
import { ReturnsView } from './components/ReturnsView';
import { PartiesView } from './components/PartiesView';
import { VouchersView } from './components/VouchersView';
import { InventoryView } from './components/InventoryView';
import { TreasuryFinanceView } from './components/TreasuryFinanceView';
import { ReportsView } from './components/ReportsView';
import { SystemViews } from './components/SystemViews';
import { InvoicePrintModal } from './components/InvoicePrintModal';
import { QuickSearchModal } from './components/QuickSearchModal';
import { ProductModal } from './components/ProductModal';
import { YearEndClosingView } from './components/YearEndClosingView';
import { BankReconciliationView } from './components/BankReconciliationView';
import { CostCentersView } from './components/CostCentersView';
import { CurrenciesView } from './components/CurrenciesView';
import { FixedAssetsView } from './components/FixedAssetsView';
import { ProcurementView } from './components/ProcurementView';
import { BarcodePrintingView } from './components/BarcodePrintingView';
import { LoginView } from './components/LoginView';
import { GoogleDriveBackupModal } from './components/GoogleDriveBackupModal';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { useModalBackHandler } from './hooks/useModalBackHandler';
import { getStoredAuthSession, logoutUser, AuthSession } from './services/firebaseAuth';
import { loadFromIndexedDB } from './services/accountingStorage';

export default function App() {
  const [db, setDb] = useState<AccountingDB>(() => loadDatabase());
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const pageHistoryRef = useRef<PageId[]>(['dashboard']);

  // Authentication & Google Drive states
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => getStoredAuthSession());
  const [showLoginView, setShowLoginView] = useState(false);
  const [showDriveBackupModal, setShowDriveBackupModal] = useState(false);

  // Modals
  const [showQuickSearch, setShowQuickSearch] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [productModalState, setProductModalState] = useState<{ isOpen: boolean; product?: Product | null }>({
    isOpen: false,
    product: null
  });

  // Mobile Back Button handlers for App-level overlays
  // When user hits phone back button while drawer or modal is open, it closes the modal without leaving the page!
  useModalBackHandler(sidebarOpen, () => setSidebarOpen(false), 'app_sidebar');
  useModalBackHandler(showQuickSearch, () => setShowQuickSearch(false), 'quick_search');
  useModalBackHandler(!!previewInvoice, () => setPreviewInvoice(null), 'invoice_preview');
  useModalBackHandler(productModalState.isOpen, () => setProductModalState({ isOpen: false, product: null }), 'product_modal');
  useModalBackHandler(showDriveBackupModal, () => setShowDriveBackupModal(false), 'drive_backup_modal');
  useModalBackHandler(showLoginView, () => setShowLoginView(false), 'login_view_modal');

  // Hydrate database from IndexedDB on startup (handles large databases up to gigabytes)
  useEffect(() => {
    loadFromIndexedDB().then(idbData => {
      if (idbData && idbData.invoices && idbData.settings) {
        setDb(idbData);
      }
    });
  }, []);

  // Save changes to IndexedDB and localStorage
  const handleUpdateDb = (updated: AccountingDB) => {
    setDb(updated);
    saveDatabase(updated);
  };

  const validPages: PageId[] = [
    'dashboard', 'sales', 'purchases', 'procurement', 'quotes', 'orders', 'returns',
    'customers', 'suppliers', 'receipts', 'payments', 'products', 'barcodes',
    'warehouses', 'stock', 'inventory', 'prices', 'treasury',
    'bank_reconciliation', 'cost_centers', 'currencies', 'fixed_assets',
    'expenses', 'revenues', 'accounts', 'journals', 'ledger',
    'reports', 'closing', 'users', 'audit', 'periods', 'backup', 'settings'
  ];

  // Sync with window.location.hash and mobile browser back button (popstate/hashchange)
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      // If back was pressed and state has a page, transition to it
      if (e.state && e.state.page && validPages.includes(e.state.page)) {
        setCurrentPage(e.state.page);
        // Remove from ref stack if popping back
        if (pageHistoryRef.current.length > 1) {
          pageHistoryRef.current.pop();
        }
        setCanGoBack(e.state.page !== 'dashboard' || pageHistoryRef.current.length > 1);
        return;
      }

      const hash = window.location.hash.replace('#', '').split('/')[0] as PageId;
      if (validPages.includes(hash)) {
        setCurrentPage(hash);
        setCanGoBack(hash !== 'dashboard' || pageHistoryRef.current.length > 1);
      } else {
        setCurrentPage('dashboard');
        setCanGoBack(false);
      }
    };

    const initialHash = window.location.hash.replace('#', '').split('/')[0] as PageId;
    if (validPages.includes(initialHash)) {
      setCurrentPage(initialHash);
      setCanGoBack(initialHash !== 'dashboard');
      window.history.replaceState({ page: initialHash }, '', `#${initialHash}`);
      pageHistoryRef.current = [initialHash];
    } else {
      window.location.hash = 'dashboard';
      window.history.replaceState({ page: 'dashboard' }, '', '#dashboard');
      pageHistoryRef.current = ['dashboard'];
    }

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const navigateToPage = (page: PageId) => {
    if (page === currentPage) return;
    
    // Push new entry to browser history
    window.history.pushState({ page, timestamp: Date.now() }, '', `#${page}`);
    pageHistoryRef.current.push(page);
    setCurrentPage(page);
    setCanGoBack(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGoBack = () => {
    // If modal is open, back closes it
    if (sidebarOpen) {
      setSidebarOpen(false);
      return;
    }
    if (showQuickSearch) {
      setShowQuickSearch(false);
      return;
    }
    if (previewInvoice) {
      setPreviewInvoice(null);
      return;
    }
    if (productModalState.isOpen) {
      setProductModalState({ isOpen: false, product: null });
      return;
    }

    // Otherwise navigate back in history
    if (window.history.length > 1 && canGoBack) {
      window.history.back();
    } else {
      navigateToPage('dashboard');
    }
  };

  // Global Keyboard Shortcuts (Ctrl+K for search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowQuickSearch(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const summary = calculateFinancialSummary(db);

  const getPageTitle = (page: PageId): string => {
    switch (page) {
      case 'dashboard': return 'لوحة التحكم والرقابة المالية';
      case 'sales': return 'فواتير المبيعات';
      case 'purchases': return 'فواتير المشتريات والتوريدات';
      case 'procurement': return 'دورة المشتريات والمطابقة الثلاثية (3-Way Matching)';
      case 'quotes': return 'عروض الأسعار';
      case 'orders': return 'أوامر البيع والشراء';
      case 'returns': return 'المرتجعات';
      case 'customers': return 'العملاء والذمم المدينة';
      case 'suppliers': return 'الموردون والذمم الدائنة';
      case 'receipts': return 'سندات القبض المالية';
      case 'payments': return 'سندات الصرف للموردين';
      case 'products': return 'دليل الأصناف والمستودعات';
      case 'barcodes': return 'استوديو طباعة باركود الأصناف والملصقات';
      case 'warehouses': return 'المخازن والتحويلات الداخلية';
      case 'stock': return 'كارت حركة المخزون الشامل';
      case 'inventory': return 'الجرد والتسويات المخزنية';
      case 'prices': return 'مقارنة أسعار الشراء';
      case 'treasury': return 'الخزائن وطرق الدفع';
      case 'bank_reconciliation': return 'تسوية الحسابات البنكية ومطابقة كشوف الحساب';
      case 'cost_centers': return 'مراكز التكلفة المتقدمة وتوزيع النفقات والمشاريع';
      case 'currencies': return 'تعدد العملات وأسعار الصرف وفروق العملة';
      case 'fixed_assets': return 'إدارة الأصول الثابتة وحساب الإهلاك التلقائي';
      case 'expenses': return 'المصروفات العمومية والتشغيلية';
      case 'revenues': return 'الإيرادات الأخرى والتشغيلية';
      case 'accounts': return 'دليل الحسابات (شجرة الحسابات)';
      case 'journals': return 'دفتر القيود اليومية المزدوجة';
      case 'ledger': return 'دفتر الأستاذ وميزان المراجعة';
      case 'reports': return 'التقارير المالية والأرباح';
      case 'closing': return 'إقفال الفترات والترحيل السنوي للأرصدة';
      case 'users': return 'المستخدمون والصلاحيات';
      case 'audit': return 'سجل النشاط وفحص السلامة';
      case 'periods': return 'الفترات المحاسبية';
      case 'backup': return 'النسخ الاحتياطي والبيانات';
      case 'settings': return 'إعدادات النظام والمنشأة';
      default: return 'النظام المحاسبي';
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans" dir="rtl">
      {/* PWA Mobile App Installation & Instant Auto-Update Banner */}
      <PWAInstallBanner />

      {/* Header */}
      <Header
        settings={db.settings}
        currentUser={authSession?.user || db.currentUser || db.users[0]}
        lowStockCount={summary.lowStockCount}
        onOpenQuickSearch={() => setShowQuickSearch(true)}
        onToggleSidebar={() => setSidebarOpen(prev => !prev)}
        onOpenDriveBackup={() => setShowDriveBackupModal(true)}
        onOpenLogin={() => setShowLoginView(true)}
        onLogout={() => {
          logoutUser();
          setAuthSession(null);
          setShowLoginView(true);
        }}
        onQuickAction={(action) => {
          if (action === 'new_sale') navigateToPage('sales');
          else if (action === 'new_purchase') navigateToPage('purchases');
          else if (action === 'new_receipt') navigateToPage('receipts');
          else if (action === 'new_payment') navigateToPage('payments');
          else if (action === 'new_product') setProductModalState({ isOpen: true, product: null });
          else if (action === 'new_customer') navigateToPage('customers');
          else if (action === 'view_low_stock') navigateToPage('products');
        }}
        activePageTitle={getPageTitle(currentPage)}
      />

      <div className="flex flex-1">
        {/* Responsive Sidebar */}
        <Sidebar
          currentPage={currentPage}
          onSelectPage={navigateToPage}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          companyName={db.settings.company}
        />

        {/* Main Workspace Content Area */}
        <main className="flex-1 lg:mr-64 p-4 sm:p-6 max-w-7xl mx-auto w-full transition-all">
          {currentPage === 'dashboard' && (
            <DashboardView
              db={db}
              onNavigate={navigateToPage}
              onOpenInvoiceModal={(type) => navigateToPage(type === 'sale' ? 'sales' : 'purchases')}
              onOpenVoucherModal={(type) => navigateToPage(type === 'receipt' ? 'receipts' : 'payments')}
              onOpenProductModal={(p) => setProductModalState({ isOpen: true, product: p })}
              onOpenPartyModal={(type) => navigateToPage(type === 'customer' ? 'customers' : 'suppliers')}
              onPreviewInvoice={(inv) => setPreviewInvoice(inv)}
              onOpenCashMoveModal={() => navigateToPage('treasury')}
            />
          )}

          {currentPage === 'sales' && (
            <SalesView
              db={db}
              onUpdateDb={handleUpdateDb}
              onPreviewInvoice={(inv) => setPreviewInvoice(inv)}
              onOpenPartyModal={() => navigateToPage('customers')}
            />
          )}

          {currentPage === 'purchases' && (
            <PurchasesView
              db={db}
              onUpdateDb={handleUpdateDb}
              onPreviewInvoice={(inv) => setPreviewInvoice(inv)}
              onOpenPartyModal={() => navigateToPage('suppliers')}
            />
          )}

          {currentPage === 'procurement' && (
            <ProcurementView
              db={db}
              onUpdateDb={handleUpdateDb}
              onPreviewInvoice={(inv) => setPreviewInvoice(inv)}
            />
          )}

          {currentPage === 'barcodes' && (
            <BarcodePrintingView
              db={db}
              onUpdateDb={handleUpdateDb}
            />
          )}

          {currentPage === 'bank_reconciliation' && (
            <BankReconciliationView
              db={db}
              onUpdateDb={handleUpdateDb}
            />
          )}

          {currentPage === 'cost_centers' && (
            <CostCentersView
              db={db}
              onUpdateDb={handleUpdateDb}
            />
          )}

          {currentPage === 'currencies' && (
            <CurrenciesView
              db={db}
              onUpdateDb={handleUpdateDb}
            />
          )}

          {currentPage === 'fixed_assets' && (
            <FixedAssetsView
              db={db}
              onUpdateDb={handleUpdateDb}
            />
          )}

          {currentPage === 'closing' && (
            <YearEndClosingView
              db={db}
              onUpdateDb={handleUpdateDb}
            />
          )}

          {currentPage === 'quotes' && (
            <QuotesOrdersView
              db={db}
              onUpdateDb={handleUpdateDb}
              initialTab="quotes"
              onPreviewInvoice={(inv) => setPreviewInvoice(inv)}
            />
          )}

          {currentPage === 'orders' && (
            <QuotesOrdersView
              db={db}
              onUpdateDb={handleUpdateDb}
              initialTab="orders"
              onPreviewInvoice={(inv) => setPreviewInvoice(inv)}
            />
          )}

          {currentPage === 'returns' && (
            <ReturnsView
              db={db}
              onUpdateDb={handleUpdateDb}
              onPreviewInvoice={(inv) => setPreviewInvoice(inv)}
            />
          )}

          {currentPage === 'customers' && (
            <PartiesView
              type="customer"
              db={db}
              onUpdateDb={handleUpdateDb}
              onOpenVoucherModal={() => navigateToPage('receipts')}
            />
          )}

          {currentPage === 'suppliers' && (
            <PartiesView
              type="supplier"
              db={db}
              onUpdateDb={handleUpdateDb}
              onOpenVoucherModal={() => navigateToPage('payments')}
            />
          )}

          {currentPage === 'receipts' && (
            <VouchersView
              type="receipt"
              db={db}
              onUpdateDb={handleUpdateDb}
            />
          )}

          {currentPage === 'payments' && (
            <VouchersView
              type="payment"
              db={db}
              onUpdateDb={handleUpdateDb}
            />
          )}

          {(currentPage === 'products' ||
            currentPage === 'warehouses' ||
            currentPage === 'stock' ||
            currentPage === 'inventory' ||
            currentPage === 'prices') && (
            <InventoryView
              subPage={currentPage as any}
              db={db}
              onUpdateDb={handleUpdateDb}
              onOpenProductModal={(p) => setProductModalState({ isOpen: true, product: p })}
            />
          )}

          {(currentPage === 'treasury' ||
            currentPage === 'expenses' ||
            currentPage === 'revenues' ||
            currentPage === 'accounts' ||
            currentPage === 'journals' ||
            currentPage === 'ledger') && (
            <TreasuryFinanceView
              subPage={currentPage as any}
              db={db}
              onUpdateDb={handleUpdateDb}
            />
          )}

          {currentPage === 'reports' && (
            <ReportsView db={db} />
          )}

          {(currentPage === 'users' ||
            currentPage === 'audit' ||
            currentPage === 'periods' ||
            currentPage === 'backup' ||
            currentPage === 'settings') && (
            <SystemViews
              subPage={currentPage as any}
              db={db}
              onUpdateDb={handleUpdateDb}
              onOpenGoogleDriveBackup={() => setShowDriveBackupModal(true)}
            />
          )}
        </main>
      </div>

      {/* Global Quick Search Modal */}
      <QuickSearchModal
        isOpen={showQuickSearch}
        onClose={() => setShowQuickSearch(false)}
        db={db}
        onSelectProduct={(pId) => {
          const prod = db.products.find(p => p.id === pId);
          setProductModalState({ isOpen: true, product: prod });
        }}
        onSelectCustomer={() => navigateToPage('customers')}
        onSelectSupplier={() => navigateToPage('suppliers')}
        onSelectInvoice={(inv) => setPreviewInvoice(inv)}
      />

      {/* Reusable Product Add/Edit Modal */}
      <ProductModal
        isOpen={productModalState.isOpen}
        onClose={() => setProductModalState({ isOpen: false, product: null })}
        product={productModalState.product}
        db={db}
        onUpdateDb={handleUpdateDb}
      />

      {/* Professional Invoice Preview & Print Modal */}
      <InvoicePrintModal
        invoice={previewInvoice}
        settings={db.settings}
        onClose={() => setPreviewInvoice(null)}
      />

      {/* Google Drive Cloud Backup & Restore Modal */}
      <GoogleDriveBackupModal
        isOpen={showDriveBackupModal}
        onClose={() => setShowDriveBackupModal(false)}
        db={db}
        onRestoreDb={(restored) => {
          handleUpdateDb(restored);
        }}
      />

      {/* Full-Screen / Modal Login Page (Manual & Google Sign-in) */}
      {showLoginView && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <LoginView
            settings={db.settings}
            users={db.users}
            canCancel={true}
            onCancel={() => setShowLoginView(false)}
            onLoginSuccess={(session) => {
              setAuthSession(session);
              setShowLoginView(false);
              const updated = { ...db, currentUser: session.user };
              handleUpdateDb(updated);
            }}
          />
        </div>
      )}
    </div>
  );
}
