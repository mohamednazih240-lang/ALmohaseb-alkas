import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  loadDatabase,
  saveDatabase,
  loadTenantDatabase,
  calculateFinancialSummary,
  loadFromIndexedDB
} from './services/accountingStorage';
import {
  AccountingDB,
  Invoice,
  Product
} from './types/accounting';
import { Header } from './components/Header';
import { Sidebar, PageId, canUserAccessPage } from './components/Sidebar';
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
import { DailyClosingView } from './components/DailyClosingView';
import { ProfitsView } from './components/ProfitsView';
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
import { getActiveTenantId } from './services/tenantService';
import { mergeCatalogIntoDb } from './data/defaultCatalog1001';
import {
  subscribeToCloudDatabase,
  pushDatabaseToCloud,
  fetchDatabaseFromCloud,
  subscribeToSyncStatus,
  CloudSyncState
} from './services/cloudSyncService';

export default function App() {
  const [db, setDb] = useState<AccountingDB>(() => {
    const loaded = loadDatabase();
    if (!loaded.products || loaded.products.length < 1000) {
      const merged = mergeCatalogIntoDb(loaded);
      saveDatabase(merged.db);
      return merged.db;
    }
    return loaded;
  });
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const pageHistoryRef = useRef<PageId[]>(['dashboard']);

  // Branch Selection State
  const [activeBranchId, setActiveBranchId] = useState<string>(() => {
    return db.branches?.[0]?.id || 'br_main';
  });

  // Cloud Sync state
  const [syncState, setSyncState] = useState<CloudSyncState>({
    status: 'connected',
    lastSyncedAt: Date.now(),
    lastUpdatedBy: 'النظام'
  });

  // Authentication & Google Drive states:
  // When opening the link for the first time or logged out, login is strictly required
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => getStoredAuthSession());
  const [showLoginView, setShowLoginView] = useState(() => !getStoredAuthSession());
  const [showDriveBackupModal, setShowDriveBackupModal] = useState(false);

  // Realtime Live Movement Sync Notification
  const [liveSyncNotification, setLiveSyncNotification] = useState<{ message: string; author: string } | null>(null);

  // Modals
  const [showQuickSearch, setShowQuickSearch] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [editingInvoiceState, setEditingInvoiceState] = useState<Invoice | null>(null);
  const [productModalState, setProductModalState] = useState<{ isOpen: boolean; product?: Product | null }>({
    isOpen: false,
    product: null
  });

  const handleEditInvoice = (inv: Invoice) => {
    setEditingInvoiceState(inv);
    if (inv.type === 'purchase' || inv.invoiceKind === 'purchase') {
      navigateToPage('purchases');
    } else {
      navigateToPage('sales');
    }
  };

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
    // 1. Hydrate from IndexedDB on startup
    loadFromIndexedDB().then(idbData => {
      if (idbData && idbData.invoices && idbData.settings) {
        if (!idbData.products || idbData.products.length < 1000) {
          const merged = mergeCatalogIntoDb(idbData);
          setDb(merged.db);
          saveDatabase(merged.db);
        } else {
          setDb(idbData);
        }
      }
    });

    // 2. Fetch fresh cloud database on startup
    // 2. Fetch fresh cloud database on startup
    fetchDatabaseFromCloud().then(cloudDb => {
      if (cloudDb && Array.isArray(cloudDb.products) && cloudDb.settings) {
        setDb(prevDb => {
          const storedSession = getStoredAuthSession();
          const currentLocalUser = storedSession?.user || prevDb.currentUser;
          const matchedUser = currentLocalUser ? cloudDb.users?.find(u => u.id === currentLocalUser.id || u.username === currentLocalUser.username) : null;
          const effectiveUser = matchedUser ? { ...matchedUser, lastLogin: currentLocalUser?.lastLogin } : currentLocalUser;
          const merged: AccountingDB = {
            ...cloudDb,
            currentUser: effectiveUser || cloudDb.currentUser || cloudDb.users[0]
          };
          saveDatabase(merged);
          return merged;
        });
      }
    });

    // 3. Subscribe to sync status
    const unsubStatus = subscribeToSyncStatus(state => {
      setSyncState(state);
    });

    return () => {
      unsubStatus();
    };
  }, []);

  // 4. Subscribe to live Firestore updates across all phones (reacts to company code changes)
  useEffect(() => {
    const currentCompanyCode = (db.settings.companyCode || 'COMP-101').trim().toUpperCase();

    const unsubCloud = subscribeToCloudDatabase((remoteDb, updatedBy) => {
      // Visual feedback when an invoice, voucher, or report is synced from another device
      if (updatedBy) {
        setLiveSyncNotification({
          message: `تم تسجيل حركة جديدة وتحديثها فورياً من جهاز «${updatedBy}»`,
          author: updatedBy
        });
        setTimeout(() => setLiveSyncNotification(null), 4500);
      }

      setDb(prevDb => {
        const storedSession = getStoredAuthSession();
        const currentLocalUser = storedSession?.user || prevDb.currentUser;
        const matchedUser = currentLocalUser
          ? remoteDb.users?.find(u => u.id === currentLocalUser.id || u.username === currentLocalUser.username)
          : null;

        // Apply updated role & permissions while keeping local login session
        const effectiveUser = matchedUser
          ? { ...matchedUser, lastLogin: currentLocalUser?.lastLogin }
          : currentLocalUser;

        if (storedSession && effectiveUser) {
          const updatedSession: AuthSession = {
            ...storedSession,
            user: effectiveUser
          };
          localStorage.setItem('hesabaty_active_user', JSON.stringify(updatedSession));
          setAuthSession(updatedSession);
        }

        // Restrict branch view if user has assigned branch and cannot manage branches
        if (effectiveUser?.branchId && !effectiveUser.permissions?.canManageBranches && effectiveUser.role !== 'مدير') {
          setActiveBranchId(effectiveUser.branchId);
        }

        const merged: AccountingDB = {
          ...remoteDb,
          currentUser: effectiveUser || remoteDb.currentUser || remoteDb.users[0]
        };
        saveDatabase(merged);
        return merged;
      });
    }, currentCompanyCode);

    return () => {
      unsubCloud();
    };
  }, [db.settings.companyCode, authSession?.user?.id]);

  // Save changes to IndexedDB, localStorage, and Firestore Cloud Realtime
  const handleUpdateDb = useCallback((updated: AccountingDB) => {
    setDb(updated);
    saveDatabase(updated);
    pushDatabaseToCloud(updated, true); // Sync immediately to Firestore for all other phones!
  }, []);

  const validPages: PageId[] = [
    'dashboard', 'sales', 'purchases', 'procurement', 'quotes', 'orders', 'returns',
    'customers', 'suppliers', 'receipts', 'payments', 'products', 'barcodes',
    'warehouses', 'stock', 'inventory', 'prices', 'treasury',
    'bank_reconciliation', 'cost_centers', 'currencies', 'fixed_assets',
    'expenses', 'revenues', 'accounts', 'journals', 'ledger',
    'daily_closing', 'profits',
    'reports', 'closing', 'branches', 'users', 'audit', 'periods', 'backup', 'settings'
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

  const summary = useMemo(() => calculateFinancialSummary(db), [db]);

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
      case 'daily_closing': return 'تقفيل اليومية والورديات وحساب أرباح الشفت';
      case 'profits': return 'تحليل أرباح الفواتير والأصناف';
      case 'reports': return 'التقارير المالية والأرباح';
      case 'closing': return 'إقفال الفترات والترحيل السنوي للأرصدة';
      case 'branches': return 'فروع ومنافذ المحل';
      case 'users': return 'المستخدمون والصلاحيات';
      case 'audit': return 'سجل النشاط وفحص السلامة';
      case 'periods': return 'الفترات المحاسبية';
      case 'backup': return 'النسخ الاحتياطي والبيانات';
      case 'settings': return 'إعدادات النظام والمنشأة';
      default: return 'النظام المحاسبي';
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans relative w-full max-w-full overflow-x-hidden" dir="rtl">
      {/* Hesabaty Subtle Background Watermark */}
      <div 
        className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center opacity-[0.035] select-none"
        aria-hidden="true"
      >
        <img src="/logo.png" alt="" className="w-[520px] h-[520px] object-contain" />
      </div>

      {/* PWA Mobile App Installation & Instant Auto-Update Banner */}
      <PWAInstallBanner />

      {/* Header with Hesabaty Logo, Realtime Sync & Branch Switcher */}
      <Header
        settings={db.settings}
        currentUser={authSession?.user || db.currentUser || db.users[0]}
        branches={db.branches || [{ id: 'br_main', name: 'الفرع الرئيسي', code: 'BR-01', isMain: true }]}
        activeBranchId={activeBranchId}
        onSelectBranch={(bId) => setActiveBranchId(bId)}
        onOpenCreateBranch={() => navigateToPage('branches')}
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
        onManualSync={async () => {
          const cloudDb = await fetchDatabaseFromCloud();
          if (cloudDb) {
            setDb(cloudDb);
            saveDatabase(cloudDb);
          } else {
            await pushDatabaseToCloud(db, true);
          }
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

      <div className="flex flex-1 relative z-10 w-full max-w-full overflow-x-hidden min-w-0">
        {/* Responsive Sidebar with User Role & Permissions */}
        <Sidebar
          currentPage={currentPage}
          onSelectPage={navigateToPage}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          companyName={db.settings.company}
          currentUser={authSession?.user || db.currentUser || db.users[0]}
        />

        {/* Main Workspace Content Area */}
        <main className="flex-1 min-w-0 lg:mr-64 p-2.5 sm:p-6 max-w-7xl mx-auto w-full max-w-full overflow-x-hidden transition-all">
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
              activeBranchId={activeBranchId}
              onSelectBranch={(bId) => setActiveBranchId(bId)}
            />
          )}

          {currentPage === 'sales' && (
            <SalesView
              db={db}
              onUpdateDb={handleUpdateDb}
              onPreviewInvoice={(inv) => setPreviewInvoice(inv)}
              onOpenPartyModal={() => navigateToPage('customers')}
              activeBranchId={activeBranchId}
              initialEditingInvoice={editingInvoiceState}
            />
          )}

          {currentPage === 'purchases' && (
            <PurchasesView
              db={db}
              onUpdateDb={handleUpdateDb}
              onPreviewInvoice={(inv) => setPreviewInvoice(inv)}
              onOpenPartyModal={() => navigateToPage('suppliers')}
              activeBranchId={activeBranchId}
              initialEditingInvoice={editingInvoiceState}
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

          {currentPage === 'daily_closing' && (
            <DailyClosingView
              db={db}
              onUpdateDb={handleUpdateDb}
              activeBranchId={activeBranchId}
            />
          )}

          {currentPage === 'profits' && (
            <ProfitsView
              db={db}
              onUpdateDb={handleUpdateDb}
              onPreviewInvoice={setPreviewInvoice}
              onEditInvoice={handleEditInvoice}
              activeBranchId={activeBranchId}
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
              activeBranchId={activeBranchId}
            />
          )}

          {currentPage === 'orders' && (
            <QuotesOrdersView
              db={db}
              onUpdateDb={handleUpdateDb}
              initialTab="orders"
              onPreviewInvoice={(inv) => setPreviewInvoice(inv)}
              activeBranchId={activeBranchId}
            />
          )}

          {currentPage === 'returns' && (
            <ReturnsView
              db={db}
              onUpdateDb={handleUpdateDb}
              onPreviewInvoice={(inv) => setPreviewInvoice(inv)}
              activeBranchId={activeBranchId}
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
              activeBranchId={activeBranchId}
            />
          )}

          {currentPage === 'payments' && (
            <VouchersView
              type="payment"
              db={db}
              onUpdateDb={handleUpdateDb}
              activeBranchId={activeBranchId}
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
              activeBranchId={activeBranchId}
              onPreviewInvoice={(inv) => setPreviewInvoice(inv)}
              onEditInvoice={handleEditInvoice}
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
              activeBranchId={activeBranchId}
            />
          )}

          {currentPage === 'reports' && (
            <ReportsView
              db={db}
              activeBranchId={activeBranchId}
            />
          )}

          {(currentPage === 'users' ||
            currentPage === 'branches' ||
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
        activeBranchId={activeBranchId}
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
            canCancel={!!authSession}
            onCancel={() => {
              if (authSession) setShowLoginView(false);
            }}
            onLoginSuccess={(session, tenantDb) => {
              setAuthSession(session);
              setShowLoginView(false);

              const baseDb = tenantDb || (session.tenantId ? loadTenantDatabase(session.tenantId) : loadDatabase());
              const targetDb = { ...baseDb, currentUser: session.user };
              setDb(targetDb);
              saveDatabase(targetDb);
              pushDatabaseToCloud(targetDb, true);

              if (session.user.branchId) {
                setActiveBranchId(session.user.branchId);
              }
              if (!canUserAccessPage(session.user, currentPage)) {
                setCurrentPage('dashboard');
              }
            }}
          />
        </div>
      )}

      {/* Realtime Instant Live Movement Sync Toast Notification */}
      {liveSyncNotification && (
        <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2.5 bg-slate-900/95 backdrop-blur-xs text-white px-4 py-3 rounded-2xl shadow-2xl border border-slate-700/80 text-xs font-bold animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-none">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-emerald-400">مزامنة فورية حية</span>
            <span className="text-[11px] text-slate-200">{liveSyncNotification.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
