import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  loadDatabase,
  saveDatabase,
  loadTenantDatabase,
  calculateFinancialSummary,
  loadFromIndexedDB,
  isCompanyMawan,
  sanitizeCompanyDatabase,
  getAllDeletedRecordIds,
  mergeDatabasesSafely
} from './services/accountingStorage';
import {
  AccountingDB,
  Invoice,
  Product,
  Branch,
  AppSettings
} from './types/accounting';
import {
  getCompaniesList,
  setActiveTenantId,
  getCompanyTenant,
  getActiveTenantId,
  EKHWA_TENANT_ID,
  EKHWA_CODE,
  EKHWA_DEFAULT_PIN,
  MAWAN_TENANT_ID,
  MAWAN_CODE,
  MAWAN_DEFAULT_PIN
} from './services/tenantService';
import { Lock, Eye, EyeOff, AlertCircle, Building2, Check, X } from 'lucide-react';
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
import { SellingPricesView } from './components/SellingPricesView';
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
import { BranchPinModal } from './components/BranchPinModal';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { QuickMenuPage } from './components/QuickMenuPage';
import { useModalBackHandler } from './hooks/useModalBackHandler';
import { getStoredAuthSession, logoutUser, AuthSession } from './services/firebaseAuth';
import { mergeCatalogIntoDb } from './data/defaultCatalog1001';
import {
  subscribeToCloudDatabase,
  subscribeToCloudMergedPush,
  pushDatabaseToCloud,
  fetchDatabaseFromCloud,
  getCloudLatestTimestamp,
  subscribeToSyncStatus,
  normalizeCompanyCode,
  testFirestoreConnection,
  doesCloudNeedCleanupSync,
  CloudSyncState
} from './services/cloudSyncService';

export default function App() {
  const [db, setDb] = useState<AccountingDB>(() => {
    return loadDatabase();
  });
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const pageHistoryRef = useRef<PageId[]>(['dashboard']);

  // Branch Selection State
  const [activeBranchId, setActiveBranchId] = useState<string>(() => {
    return db.branches?.[0]?.id || 'br_mawan';
  });

  // Synchronize activeBranchId whenever db.branches changes (e.g. switching between الأخوة and الموان)
  useEffect(() => {
    if (db.branches && db.branches.length > 0) {
      if (!db.branches.some(b => b.id === activeBranchId)) {
        setActiveBranchId(db.branches[0].id);
      }
    }
  }, [db.branches, activeBranchId]);

  // Cloud Sync state
  const [syncState, setSyncState] = useState<CloudSyncState>({
    status: 'connected',
    lastSyncedAt: Date.now(),
    lastUpdatedBy: 'النظام'
  });
  const dbRef = useRef<AccountingDB>(db);
  dbRef.current = db;
  const hasPendingCloudPushRef = useRef<boolean>(false);
  const syncStatusRef = useRef<CloudSyncState['status']>('connected');
  syncStatusRef.current = syncState.status;

  // Authentication & Google Drive states:
  // When opening the link for the first time or logged out, login is strictly required
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => getStoredAuthSession());
  const [showLoginView, setShowLoginView] = useState(() => !getStoredAuthSession());
  const [showDriveBackupModal, setShowDriveBackupModal] = useState(false);

  // Realtime Live Movement Sync Notification
  const [liveSyncNotification, setLiveSyncNotification] = useState<{ message: string; author: string } | null>(null);
  const syncToastTimerRef = useRef<number | null>(null);

  const showLiveSyncToast = useCallback((message: string, author: string, durationMs = 2800) => {
    setLiveSyncNotification({ message, author });
    if (syncToastTimerRef.current) {
      window.clearTimeout(syncToastTimerRef.current);
    }
    syncToastTimerRef.current = window.setTimeout(() => {
      setLiveSyncNotification(null);
      syncToastTimerRef.current = null;
    }, durationMs);
  }, []);

  // Ensure focused inputs/textareas scroll cleanly into view above the mobile virtual keyboard
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      if (window.innerWidth > 768) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
        window.setTimeout(() => {
          try {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } catch {
            // ignore unsupported smooth option
          }
        }, 260);
      }
    };
    document.addEventListener('focusin', handleFocusIn, { passive: true });
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      if (syncToastTimerRef.current) {
        window.clearTimeout(syncToastTimerRef.current);
      }
    };
  }, []);

  // Modals
  const [showQuickSearch, setShowQuickSearch] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [previewAutoPrint, setPreviewAutoPrint] = useState(false);
  const [editingInvoiceState, setEditingInvoiceState] = useState<Invoice | null>(null);
  const [productModalState, setProductModalState] = useState<{ isOpen: boolean; product?: Product | null }>({
    isOpen: false,
    product: null
  });

  const handlePreviewInvoice = (inv: Invoice) => {
    setPreviewInvoice(inv);
    setPreviewAutoPrint(false);
  };

  const handlePrintInvoice = (inv: Invoice) => {
    setPreviewInvoice(inv);
    setPreviewAutoPrint(true);
  };

  // Branch PIN Security & Headquarters Isolation Modal
  const [branchPinTarget, setBranchPinTarget] = useState<Branch | null>(null);

  // Secure Branch Switch Handler: strictly enforces branch isolation with PIN verification
  const handleRequestBranchSwitch = useCallback((targetBranchId: string) => {
    if (targetBranchId === activeBranchId) return;

    // Look up target branch
    const targetBranch = (db.branches || []).find(b => b.id === targetBranchId);
    if (!targetBranch) return;

    // "وعزل تام بين الفروع ولا يمكن الدخول الي اي فرع الا بالرقم السري"
    // Prompt for PIN when entering any branch
    setBranchPinTarget(targetBranch);
  }, [activeBranchId, db.branches]);

  const handleEditInvoice = (inv: Invoice) => {
    setEditingInvoiceState(inv);
    if (inv.type === 'purchase' || inv.invoiceKind === 'purchase' || inv.invoiceKind === 'purchase_return') {
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
  useModalBackHandler(!!branchPinTarget, () => setBranchPinTarget(null), 'branch_pin_modal');

  const mergeSafeSettings = useCallback((prevSettings: AppSettings | undefined, cloudSettings: AppSettings | undefined): AppSettings => {
    const prevLogo = prevSettings?.logo?.trim() ? prevSettings.logo : '';
    const cloudLogo = cloudSettings?.logo?.trim() ? cloudSettings.logo : '';
    const prevLogoTs = Number(prevSettings?.logoUpdatedAt || 0);
    const cloudLogoTs = Number(cloudSettings?.logoUpdatedAt || 0);
    const cloudRemovedTs = Number(cloudSettings?.logoRemovedAt || 0);
    const prevRemovedTs = Number(prevSettings?.logoRemovedAt || 0);

    let resolvedLogo = '';
    let resolvedLogoUpdatedAt: number | undefined = prevSettings?.logoUpdatedAt;
    let resolvedLogoRemovedAt: number | undefined = prevSettings?.logoRemovedAt;

    if (cloudRemovedTs > prevLogoTs && cloudRemovedTs >= cloudLogoTs) {
      resolvedLogo = '';
      resolvedLogoRemovedAt = cloudRemovedTs;
      resolvedLogoUpdatedAt = undefined;
    } else if (prevRemovedTs > cloudLogoTs && !prevLogo) {
      resolvedLogo = '';
      resolvedLogoRemovedAt = prevRemovedTs;
      resolvedLogoUpdatedAt = undefined;
    } else if (prevLogo && (!cloudLogo || prevLogoTs > cloudLogoTs)) {
      resolvedLogo = prevLogo;
      resolvedLogoUpdatedAt = prevSettings?.logoUpdatedAt || cloudSettings?.logoUpdatedAt;
      resolvedLogoRemovedAt = undefined;
    } else if (cloudLogo) {
      resolvedLogo = cloudLogo;
      resolvedLogoUpdatedAt = cloudSettings?.logoUpdatedAt || prevSettings?.logoUpdatedAt;
      resolvedLogoRemovedAt = undefined;
    }

    const base: AppSettings = {
      ...(cloudSettings || {}),
      ...(prevSettings || {}),
      company: (cloudSettings?.company && cloudSettings.company.trim()) ? cloudSettings.company : (prevSettings?.company || 'شركة الموان'),
      companyCode: (cloudSettings?.companyCode && cloudSettings.companyCode.trim()) ? cloudSettings.companyCode : (prevSettings?.companyCode || 'COMP-102'),
      companyPin: (cloudSettings?.companyPin && cloudSettings.companyPin.trim()) ? cloudSettings.companyPin : (prevSettings?.companyPin || '2919'),
      logo: resolvedLogo,
      phone: (cloudSettings?.phone && cloudSettings.phone.trim()) ? cloudSettings.phone : (prevSettings?.phone || ''),
      address: (cloudSettings?.address && cloudSettings.address.trim()) ? cloudSettings.address : (prevSettings?.address || 'المقر الرئيسي'),
      invoiceTitle: (cloudSettings?.invoiceTitle && cloudSettings.invoiceTitle.trim()) ? cloudSettings.invoiceTitle : (prevSettings?.invoiceTitle || 'بيان'),
      notes: (cloudSettings?.notes && cloudSettings.notes.trim()) ? cloudSettings.notes : (prevSettings?.notes || 'البضاعة المباعة ترد وتستبدل خلال 14 يوماً وفقاً لحالتها الأصلية'),
      currency: (cloudSettings?.currency && cloudSettings.currency.trim()) ? cloudSettings.currency : (prevSettings?.currency || 'ج.م')
    } as AppSettings;

    if (resolvedLogoUpdatedAt) base.logoUpdatedAt = resolvedLogoUpdatedAt;
    else delete base.logoUpdatedAt;

    if (resolvedLogoRemovedAt && !resolvedLogo) base.logoRemovedAt = resolvedLogoRemovedAt;
    else delete base.logoRemovedAt;

    return base;
  }, []);

  const mergeLocalAndCloudDb = useCallback((prevDb: AccountingDB, remoteDb: AccountingDB, resolvedUser?: AccountingDB['currentUser']): AccountingDB => {
    const merged = mergeDatabasesSafely(prevDb, remoteDb, resolvedUser);
    const safeSettings = mergeSafeSettings(prevDb.settings, remoteDb.settings);
    return {
      ...merged,
      settings: {
        ...merged.settings,
        ...safeSettings,
        nextSale: merged.settings.nextSale,
        nextPurchase: merged.settings.nextPurchase,
        nextSaleReturn: merged.settings.nextSaleReturn,
        nextPurchaseReturn: merged.settings.nextPurchaseReturn,
        nextReceipt: merged.settings.nextReceipt,
        nextPayment: merged.settings.nextPayment
      }
    };
  }, [mergeSafeSettings]);

  // Hydrate database sequentially from IndexedDB first, then merge fresh cloud database cleanly
  useEffect(() => {
    let isMounted = true;

    const bootstrapDatabase = async () => {
      void testFirestoreConnection();

      // 1. Hydrate from IndexedDB first so local logo & rich records are in state before cloud merge runs
      let initialCompanyCode = normalizeCompanyCode(db.settings.companyCode);
      try {
        const idbData = await loadFromIndexedDB();
        if (isMounted && idbData && idbData.settings) {
          const readyDb = sanitizeCompanyDatabase(idbData);
          initialCompanyCode = normalizeCompanyCode(readyDb.settings.companyCode);
          setDb(prevDb => {
            const hydrated = mergeLocalAndCloudDb(prevDb, readyDb, prevDb.currentUser);
            const safeSettings = mergeSafeSettings(prevDb.settings, hydrated.settings);
            const finalHydrated: AccountingDB = { ...hydrated, settings: safeSettings };
            saveDatabase(finalHydrated);
            return finalHydrated;
          });
        }
      } catch (e) {
        console.warn('IndexedDB startup hydration notice:', e);
      }

      // 2. Fetch fresh cloud database on startup (never overwrites a saved local logo with empty string)
      try {
        const cloudDb = await fetchDatabaseFromCloud(initialCompanyCode);
        if (isMounted && cloudDb && Array.isArray(cloudDb.products) && cloudDb.settings) {
          setDb(prevDb => {
            const effectiveCloud = cloudDb;
            if (!effectiveCloud.cleanGeneration) {
              effectiveCloud.cleanGeneration = 5;
            }

            // If local has newly entered products and cloud does not have them yet, preserve and sync them to cloud
            if (prevDb.products && prevDb.products.length > 0 && (!effectiveCloud.products || effectiveCloud.products.length === 0)) {
              effectiveCloud.products = prevDb.products;
              pushDatabaseToCloud(effectiveCloud, true);
            }

            const storedSession = getStoredAuthSession();
            const currentLocalUser = storedSession?.user || prevDb.currentUser;
            const matchedUser = currentLocalUser ? cloudDb.users?.find(u => u.id === currentLocalUser.id || u.username === currentLocalUser.username) : null;
            const effectiveUser = matchedUser ? { ...matchedUser, lastLogin: currentLocalUser?.lastLogin } : currentLocalUser;
            const ensuredCloud = sanitizeCompanyDatabase(cloudDb);

            const merged = mergeLocalAndCloudDb(prevDb, effectiveCloud, effectiveUser);
            saveDatabase(merged);

            // If local had richer invoice data, local deletions missing from cloud, or a local logo missing from cloud, sync back immediately
            const hasRicherLocal = merged.invoices.some(inv => {
              const cloudInv = (ensuredCloud.invoices || []).find(ci => ci.id === inv.id);
              return !cloudInv || (inv.items?.length || 0) > (cloudInv.items?.length || 0);
            });
            const cloudDelSet = new Set<string>(ensuredCloud.deletedRecordIds || []);
            const hasUnsyncedDeletions = (merged.deletedRecordIds || []).some(id => !cloudDelSet.has(id));
            const hasLocalClosingsMissingFromCloud = (merged.dailyClosings || []).some(
              dc => !(ensuredCloud.dailyClosings || []).some(cc => cc.id === dc.id)
            );
            const needsCloudLogoRepair = Boolean(merged.settings.logo && !ensuredCloud.settings?.logo);
            const needsCloudPhantomCleanup = doesCloudNeedCleanupSync(initialCompanyCode, merged);
            if (hasRicherLocal || hasLocalClosingsMissingFromCloud || hasUnsyncedDeletions || needsCloudLogoRepair || needsCloudPhantomCleanup) {
              hasPendingCloudPushRef.current = true;
              void pushDatabaseToCloud(merged, true).then(ok => {
                if (ok) hasPendingCloudPushRef.current = false;
              });
            }

            return merged;
          });
        }
      } catch (e) {
        console.warn('Cloud startup hydration notice:', e);
      }
    };

    void bootstrapDatabase();

    // 3. Subscribe to sync status & pre-push cloud merge updates
    const unsubStatus = subscribeToSyncStatus(state => {
      syncStatusRef.current = state.status;
      setSyncState(state);
    });
    const unsubMergedPush = subscribeToCloudMergedPush((mergedFromCloud, companyCode) => {
      if (normalizeCompanyCode(dbRef.current.settings?.companyCode) !== companyCode) return;
      setDb(prevDb => {
        const storedSession = getStoredAuthSession();
        const currentLocalUser = storedSession?.user || prevDb.currentUser;
        const matchedUser = currentLocalUser
          ? mergedFromCloud.users?.find(u => u.id === currentLocalUser.id || u.username === currentLocalUser.username)
          : null;
        const effectiveUser = matchedUser
          ? { ...matchedUser, lastLogin: currentLocalUser?.lastLogin }
          : currentLocalUser;
        const nextDb = mergeLocalAndCloudDb(prevDb, mergedFromCloud, effectiveUser);
        saveDatabase(nextDb);
        return nextDb;
      });
    });

    return () => {
      isMounted = false;
      unsubStatus();
      unsubMergedPush();
    };
  }, []);

  // 4. Subscribe to live Firestore updates across all phones (strictly scoped to Mawan COMP-102)
  useEffect(() => {
    const currentCompanyCode = normalizeCompanyCode(db.settings.companyCode);
    if (!isCompanyMawan(currentCompanyCode)) {
      return;
    }

    const unsubCloud = subscribeToCloudDatabase((remoteDb, updatedBy, actionDesc) => {
      // Visual feedback when an invoice, voucher, or report is synced from another device
      if (updatedBy) {
        showLiveSyncToast(
          actionDesc
            ? `مزامنة فورية: ${actionDesc} من جهاز «${updatedBy}»`
            : `تم تسجيل حركة وتحديثها فورياً من جهاز «${updatedBy}»`,
          updatedBy,
          2800
        );
      }

      setDb(prevDb => {
        const storedSession = getStoredAuthSession();
        const currentLocalUser = storedSession?.user || prevDb.currentUser;
        const matchedUser = currentLocalUser
          ? remoteDb.users?.find(u => u.id === currentLocalUser.id || u.username === currentLocalUser.username)
          : null;

        // If this user was deleted by the manager from the system:
        if (storedSession && !matchedUser && currentLocalUser && currentLocalUser.role !== 'مدير') {
          localStorage.removeItem('hesabaty_active_user');
          setAuthSession(null);
          setShowLoginView(true);
          return {
            ...remoteDb,
            currentUser: remoteDb.users[0]
          };
        }

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

        const merged = mergeLocalAndCloudDb(prevDb, remoteDb, effectiveUser);
        saveDatabase(merged);
        return merged;
      });
    }, currentCompanyCode);

    return () => {
      unsubCloud();
    };
  }, [db.settings.companyCode, authSession?.user?.id, mergeLocalAndCloudDb]);

  // Lightweight periodic & on-focus sync fallback + automatic retry of pending local changes (strictly scoped to Mawan COMP-102)
  useEffect(() => {
    const currentCompanyCode = normalizeCompanyCode(db.settings.companyCode);
    if (!isCompanyMawan(currentCompanyCode)) {
      return;
    }
    let lastCheckedCloudTs = 0;

    const pullLatest = async (forceCheck: boolean = false) => {
      try {
        const needsRetryPush =
          hasPendingCloudPushRef.current ||
          syncStatusRef.current === 'offline' ||
          syncStatusRef.current === 'error';

        let remoteTimestampChanged = forceCheck || needsRetryPush;
        if (!forceCheck && !needsRetryPush) {
          const remoteTs = await getCloudLatestTimestamp(currentCompanyCode);
          if (remoteTs > 0 && remoteTs <= lastCheckedCloudTs) {
            return;
          }
          if (remoteTs > 0) {
            lastCheckedCloudTs = remoteTs;
            remoteTimestampChanged = true;
          }
        }
        const cloudDb = await fetchDatabaseFromCloud(currentCompanyCode);
        if (cloudDb && Array.isArray(cloudDb.products) && cloudDb.settings) {
          let mergedToPush: AccountingDB | null = null;
          setDb(prevDb => {
            const cloudAuditTime = cloudDb.audit?.[0]?.at ? new Date(cloudDb.audit[0].at).getTime() : 0;
            const prevAuditTime = prevDb.audit?.[0]?.at ? new Date(prevDb.audit[0].at).getTime() : 0;
            const deletedIdsSet = getAllDeletedRecordIds(prevDb, getAllDeletedRecordIds(cloudDb));

            const hasCountDiff =
              (cloudDb.invoices?.length || 0) !== (prevDb.invoices?.length || 0) ||
              (cloudDb.quotes?.length || 0) !== (prevDb.quotes?.length || 0) ||
              (cloudDb.orders?.length || 0) !== (prevDb.orders?.length || 0) ||
              (cloudDb.vouchers?.length || 0) !== (prevDb.vouchers?.length || 0) ||
              (cloudDb.treasury?.length || 0) !== (prevDb.treasury?.length || 0) ||
              (cloudDb.dailyClosings?.length || 0) !== (prevDb.dailyClosings?.length || 0) ||
              (cloudDb.expenses?.length || 0) !== (prevDb.expenses?.length || 0) ||
              (cloudDb.revenues?.length || 0) !== (prevDb.revenues?.length || 0) ||
              (cloudDb.returns?.length || 0) !== (prevDb.returns?.length || 0) ||
              (cloudDb.products?.length || 0) !== (prevDb.products?.length || 0) ||
              (cloudDb.deletedRecordIds?.length || 0) !== (prevDb.deletedRecordIds?.length || 0) ||
              (cloudDb.deletedInvoiceIds?.length || 0) !== (prevDb.deletedInvoiceIds?.length || 0);
            const hasMissingCloudInvoice = (cloudDb.invoices || []).some(
              ci => !deletedIdsSet.has(ci.id) && !(prevDb.invoices || []).some(pi => pi.id === ci.id)
            );
            const hasUnsyncedLocalInvoice = (prevDb.invoices || []).some(
              pi => !deletedIdsSet.has(pi.id) && !(cloudDb.invoices || []).some(ci => ci.id === pi.id)
            );
            const hasNewerAudit = cloudAuditTime > prevAuditTime || (cloudDb.audit?.length || 0) !== (prevDb.audit?.length || 0);

            if (remoteTimestampChanged || hasCountDiff || hasMissingCloudInvoice || hasUnsyncedLocalInvoice || hasNewerAudit) {
              const storedSession = getStoredAuthSession();
              const currentLocalUser = storedSession?.user || prevDb.currentUser;
              const matchedUser = currentLocalUser ? cloudDb.users?.find(u => u.id === currentLocalUser.id || u.username === currentLocalUser.username) : null;
              const effectiveUser = matchedUser ? { ...matchedUser, lastLogin: currentLocalUser?.lastLogin } : currentLocalUser;
              const merged = mergeLocalAndCloudDb(prevDb, cloudDb, effectiveUser);
              saveDatabase(merged);
              if (needsRetryPush || hasUnsyncedLocalInvoice) {
                mergedToPush = merged;
              }
              return merged;
            }
            return prevDb;
          });
          if (mergedToPush) {
            const ok = await pushDatabaseToCloud(mergedToPush, true);
            if (ok) hasPendingCloudPushRef.current = false;
          }
        } else if (needsRetryPush) {
          const ok = await pushDatabaseToCloud(dbRef.current, true);
          if (ok) hasPendingCloudPushRef.current = false;
        }
      } catch (e) {
        // silent
      }
    };

    const handleFocus = () => pullLatest(true);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('visibilitychange', handleFocus);
    window.addEventListener('online', handleFocus);
    window.addEventListener('resume', handleFocus);

    const intervalId = setInterval(() => pullLatest(false), 8000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('visibilitychange', handleFocus);
      window.removeEventListener('online', handleFocus);
      window.removeEventListener('resume', handleFocus);
      clearInterval(intervalId);
    };
  }, [db.settings.companyCode, mergeLocalAndCloudDb]);

  // Save changes to IndexedDB, localStorage, and Firestore Cloud Realtime (COMP-102 Mawan)
  const handleUpdateDb = useCallback((updated: AccountingDB, skipCloudPush?: boolean) => {
    dbRef.current = updated;
    setDb(updated);
    saveDatabase(updated);
    if (!skipCloudPush && isCompanyMawan(updated.settings?.companyCode)) {
      hasPendingCloudPushRef.current = true;
      void pushDatabaseToCloud(updated, true).then(ok => {
        if (ok) hasPendingCloudPushRef.current = false;
      });
    }
  }, []);

  const handleManualSync = useCallback(async () => {
    const currentDb = dbRef.current;
    const companyCode = normalizeCompanyCode(currentDb.settings.companyCode);
    if (!isCompanyMawan(companyCode)) {
      return;
    }
    try {
      const cloudDb = await fetchDatabaseFromCloud(companyCode);
      if (cloudDb) {
        const unified = mergeLocalAndCloudDb(currentDb, cloudDb);
        dbRef.current = unified;
        setDb(unified);
        saveDatabase(unified);
        const ok = await pushDatabaseToCloud(unified, true);
        if (ok) hasPendingCloudPushRef.current = false;
        showLiveSyncToast(
          ok
            ? `تمت المزامنة اللحظية بنجاح: تم توحيد ${unified.invoices.length} فاتورة بين كافة الأجهزة`
            : `تم تحديث البيانات من السحابة (${unified.invoices.length} فاتورة) — سيعاد الرفع فور استقرار الشبكة`,
          'النظام السحابي',
          3000
        );
      } else {
        const ok = await pushDatabaseToCloud(currentDb, true);
        if (ok) hasPendingCloudPushRef.current = false;
        showLiveSyncToast(
          ok
            ? 'تم إرسال ومزامنة كافة بيانات جهازك إلى السحابة بنجاح'
            : 'تعذر الوصول للسحابة الآن — البيانات محفوظة بأمان وستتزامن تلقائياً',
          'النظام السحابي',
          2800
        );
      }
    } catch (e) {
      console.error('Manual sync error:', e);
    }
  }, [mergeLocalAndCloudDb, showLiveSyncToast]);

  const validPages: PageId[] = [
    'dashboard', 'sales', 'purchases', 'procurement', 'quotes', 'orders', 'returns',
    'customers', 'suppliers', 'receipts', 'payments', 'products', 'barcodes',
    'warehouses', 'stock', 'inventory', 'prices', 'selling_prices', 'treasury',
    'bank_reconciliation', 'cost_centers', 'currencies', 'fixed_assets',
    'expenses', 'revenues', 'accounts', 'journals', 'ledger',
    'daily_closing', 'profits',
    'reports', 'closing', 'branches', 'users', 'audit', 'periods', 'backup', 'settings',
    'quick_menu'
  ];

  // Sync with window.location.hash and mobile browser back button (popstate/hashchange)
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      // Ignore submodal internal pops so invoice editor or current page is never interrupted
      if ((window as any).__hesabaty_suppress_popstate || (e.state && (e.state.subModal || e.state.modalId))) {
        return;
      }

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
      case 'selling_prices': return 'إدارة أسعار البيع';
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
      case 'quick_menu': return 'مركز العمليات والأدوات السريعة';
      default: return 'النظام المحاسبي';
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans relative w-full max-w-full overflow-x-clip" dir="rtl">
      {/* Hesabaty Subtle Background Watermark */}
      <div 
        className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center opacity-[0.035] select-none"
        aria-hidden="true"
      >
        <img src="/logo.png" alt="" className="w-[520px] h-[520px] object-contain" />
      </div>

      {/* Header with Hesabaty Logo, Realtime Sync & Branch Switcher - Sticky at top */}
      <Header
        settings={db.settings}
        currentUser={authSession?.user || db.currentUser || db.users[0]}
        branches={db.branches || [{ id: 'br_main', name: 'الفرع الرئيسي', code: 'BR-01', isMain: true }]}
        activeBranchId={activeBranchId}
        onSelectBranch={handleRequestBranchSwitch}
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
        onManualSync={handleManualSync}
        syncState={syncState}
        onQuickAction={(action) => {
          if (action === 'open_quick_menu') navigateToPage('quick_menu');
          else if (action === 'new_sale') navigateToPage('sales');
          else if (action === 'new_purchase') navigateToPage('purchases');
          else if (action === 'new_receipt') navigateToPage('receipts');
          else if (action === 'new_payment') navigateToPage('payments');
          else if (action === 'new_wholesale') navigateToPage('sales');
          else if (action === 'new_product') setProductModalState({ isOpen: true, product: null });
          else if (action === 'new_customer') navigateToPage('customers');
          else if (action === 'new_supplier') navigateToPage('suppliers');
          else if (action === 'view_reports') navigateToPage('reports');
          else if (action === 'view_low_stock') navigateToPage('products');
        }}
        activePageTitle={getPageTitle(currentPage)}
      />

      {/* PWA Mobile App Installation & Instant Auto-Update Banner */}
      <PWAInstallBanner />

      <div className="flex flex-1 relative w-full max-w-full overflow-x-clip min-w-0">
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
        <main
          className={`flex-1 min-w-0 lg:mr-64 max-w-7xl mx-auto w-full max-w-full overflow-x-clip transition-all ${
            currentPage === 'sales' ||
            currentPage === 'purchases' ||
            currentPage === 'returns' ||
            currentPage === 'quotes' ||
            currentPage === 'orders'
              ? 'p-1 sm:p-3 pb-2 sm:pb-3'
              : 'p-2.5 sm:p-6 pb-20 sm:pb-10'
          }`}
        >
          {currentPage === 'quick_menu' && (
            <QuickMenuPage
              db={db}
              onNavigate={navigateToPage}
              onQuickAction={(action) => {
                if (action === 'new_sale') navigateToPage('sales');
                else if (action === 'new_purchase') navigateToPage('purchases');
                else if (action === 'new_receipt') navigateToPage('receipts');
                else if (action === 'new_payment') navigateToPage('payments');
                else if (action === 'new_wholesale') navigateToPage('sales');
                else if (action === 'new_product') setProductModalState({ isOpen: true, product: null });
                else if (action === 'new_customer') navigateToPage('customers');
                else if (action === 'new_supplier') navigateToPage('suppliers');
                else if (action === 'view_reports') navigateToPage('reports');
                else if (action === 'view_low_stock') navigateToPage('products');
              }}
              onOpenProductModal={() => setProductModalState({ isOpen: true, product: null })}
              onOpenPartyModal={(type) => navigateToPage(type === 'customer' ? 'customers' : 'suppliers')}
              onOpenCreateBranch={() => navigateToPage('branches')}
              onSelectBranch={handleRequestBranchSwitch}
              activeBranchId={activeBranchId}
              onManualSync={handleManualSync}
              onOpenDriveBackup={() => setShowDriveBackupModal(true)}
              onOpenLogin={() => setShowLoginView(true)}
              onLogout={() => {
                logoutUser();
                setAuthSession(null);
                setShowLoginView(true);
              }}
              onBack={handleGoBack}
            />
          )}

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
              onSelectBranch={handleRequestBranchSwitch}
            />
          )}

          {currentPage === 'sales' && (
            <SalesView
              db={db}
              onUpdateDb={handleUpdateDb}
              onPreviewInvoice={handlePreviewInvoice}
              onPrintInvoice={handlePrintInvoice}
              onOpenPartyModal={() => navigateToPage('customers')}
              activeBranchId={activeBranchId}
              initialEditingInvoice={editingInvoiceState}
            />
          )}

          {currentPage === 'purchases' && (
            <PurchasesView
              db={db}
              onUpdateDb={handleUpdateDb}
              onPreviewInvoice={handlePreviewInvoice}
              onPrintInvoice={handlePrintInvoice}
              onOpenPartyModal={() => navigateToPage('suppliers')}
              activeBranchId={activeBranchId}
              initialEditingInvoice={editingInvoiceState}
            />
          )}

          {currentPage === 'procurement' && (
            <ProcurementView
              db={db}
              onUpdateDb={handleUpdateDb}
              onPreviewInvoice={handlePreviewInvoice}
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
              onSelectBranch={handleRequestBranchSwitch}
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

          {currentPage === 'selling_prices' && (
            <SellingPricesView
              db={db}
              onUpdateDb={handleUpdateDb}
              activeBranchId={activeBranchId}
              onSelectBranch={handleRequestBranchSwitch}
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
              onSelectBranch={handleRequestBranchSwitch}
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
              onSelectBranch={handleRequestBranchSwitch}
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
        branches={db.branches}
        parties={[...(db.customers || []), ...(db.suppliers || [])]}
        autoPrint={previewAutoPrint}
        onClose={() => {
          setPreviewInvoice(null);
          setPreviewAutoPrint(false);
        }}
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
              const sameCompany = normalizeCompanyCode(db.settings.companyCode) === normalizeCompanyCode(baseDb.settings?.companyCode);
              const targetDb = sameCompany
                ? mergeLocalAndCloudDb(db, baseDb, session.user)
                : { ...baseDb, currentUser: session.user };
              setDb(targetDb);
              saveDatabase(targetDb);
              if (isCompanyMawan(targetDb.settings?.companyCode)) {
                pushDatabaseToCloud(targetDb, true);
              }

              if (session.branchId) {
                setActiveBranchId(session.branchId);
              } else if (session.user.branchId) {
                setActiveBranchId(session.user.branchId);
              }
              if (!canUserAccessPage(session.user, currentPage)) {
                setCurrentPage('dashboard');
              }
            }}
          />
        </div>
      )}

      {/* Branch PIN Security & Headquarters Isolation Modal */}
      <BranchPinModal
        isOpen={!!branchPinTarget}
        targetBranch={branchPinTarget}
        onConfirm={() => {
          if (branchPinTarget) {
            setActiveBranchId(branchPinTarget.id);
            setBranchPinTarget(null);
          }
        }}
        onClose={() => setBranchPinTarget(null)}
      />

      {/* Realtime Instant Live Movement Sync Toast Notification (relocated to compact non-blocking top slot) */}
      {liveSyncNotification && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-[calc(env(safe-area-inset-top,0px)+3.5rem)] sm:top-4 left-1/2 -translate-x-1/2 z-[45] w-[calc(100vw-1.5rem)] max-w-sm flex items-center justify-between gap-2 bg-slate-900/92 backdrop-blur-sm text-white px-3 py-2 rounded-xl shadow-lg border border-emerald-500/40 text-[11px] font-bold animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-none"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <div className="flex flex-col min-w-0">
              <span className="text-[9.5px] font-black text-emerald-400 leading-tight">مزامنة فورية حية</span>
              <span className="text-[10.5px] text-slate-200 truncate">{liveSyncNotification.message}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLiveSyncNotification(null)}
            className="pointer-events-auto text-slate-400 hover:text-white p-0.5 rounded shrink-0 cursor-pointer"
            aria-label="إغلاق التنبيه"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
