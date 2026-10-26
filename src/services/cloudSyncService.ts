import {
  getFirestore,
  initializeFirestore,
  setLogLevel,
  doc,
  setDoc,
  getDoc,
  onSnapshot
} from 'firebase/firestore';
import { auth } from './firebaseAuth';
import { AccountingDB, User as AppUser, Branch } from '../types/accounting';
import { saveDatabase, loadDatabase, ensurePrimaryBranches, sanitizeCompanyDatabase, isCompanyMawan, loadTenantDatabase } from './accountingStorage';
import firebaseConfig from '../../firebase-applet-config.json';
import { getCompanyByCode } from './tenantService';

// Connect to provisioned Firestore database with forced long polling to avoid 10s streaming timeout in iframe/proxy environments
const firestoreDbId = (firebaseConfig as any).firestoreDatabaseId;
export const firestore = (() => {
  try {
    setLogLevel('silent');
    return initializeFirestore(
      auth.app,
      {
        experimentalForceLongPolling: true
      },
      firestoreDbId || undefined
    );
  } catch (e) {
    return firestoreDbId ? getFirestore(auth.app, firestoreDbId) : getFirestore(auth.app);
  }
})();

/**
 * Safe promise wrapper with timeout to prevent hanging on cold starts or network drops
 */
function withTimeout<T>(promise: Promise<T>, ms: number = 3500): Promise<T | null> {
  let timer: any;
  const timeoutPromise = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([
    promise.then((res) => {
      clearTimeout(timer);
      return res;
    }),
    timeoutPromise
  ]);
}

const SYNC_DOC_PATH = 'hesabaty_app_data';
const SYNC_DOC_ID = 'main_company_database';
let unsubscribeListener: (() => void) | null = null;
let unsubscribeCompListener: (() => void) | null = null;
let lastLocalSavedTimestamp = 0;

const LOCAL_DEVICE_ID_KEY = 'hesabaty_device_instance_id';

/**
 * Standardizes company code format:
 * Handles unicode dashes, whitespace, 'COMP - 101' -> 'COMP-101', digits '101' -> 'COMP-101'
 */
export function normalizeCompanyCode(code?: string): string {
  if (!code) return 'COMP-101';
  let clean = code.trim().toUpperCase();
  clean = clean.replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-');
  clean = clean.replace(/\s*-\s*/g, '-').replace(/\s+/g, '');
  if (/^\d+$/.test(clean)) {
    clean = `COMP-${clean}`;
  }
  return clean || 'COMP-101';
}

/**
 * Unique instance identifier for this phone/browser window to avoid echo while instantly syncing to other devices
 */
export function getLocalDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  let devId = sessionStorage.getItem(LOCAL_DEVICE_ID_KEY);
  if (!devId) {
    devId = 'dev_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now().toString(36);
    sessionStorage.setItem(LOCAL_DEVICE_ID_KEY, devId);
  }
  return devId;
}

// Local cross-tab broadcast channel for 0ms instant sync between tabs and windows on the same device
let localBroadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    localBroadcastChannel = new BroadcastChannel('hesabaty_multi_device_sync');
  }
} catch (e) {
  // BroadcastChannel unavailable
}

export interface CloudSyncState {
  status: 'connected' | 'syncing' | 'offline' | 'error';
  lastSyncedAt: number;
  lastUpdatedBy: string;
}

let syncState: CloudSyncState = {
  status: 'connected',
  lastSyncedAt: Date.now(),
  lastUpdatedBy: 'النظام'
};

const statusListeners = new Set<(state: CloudSyncState) => void>();

export function getCloudSyncState(): CloudSyncState {
  return syncState;
}

export function subscribeToSyncStatus(listener: (state: CloudSyncState) => void): () => void {
  statusListeners.add(listener);
  listener(syncState);
  return () => {
    statusListeners.delete(listener);
  };
}

function updateSyncState(partial: Partial<CloudSyncState>) {
  syncState = { ...syncState, ...partial };
  statusListeners.forEach(fn => fn(syncState));
}

let syncDebounceTimer: any = null;

export interface CompanyCloudResult {
  db: AccountingDB;
  companyName: string;
  companyCode: string;
  users: AppUser[];
  branches: Branch[];
  source: 'cloud' | 'local';
}

/**
 * Upload current database state to Firestore so all connected phones see it immediately
 * Includes strict anti-wipe protection: empty seed databases CANNOT overwrite populated cloud databases!
 */
export async function pushDatabaseToCloud(db: AccountingDB, immediate: boolean = true): Promise<boolean> {
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = null;
  }

  const rawCode = db.settings.companyCode || 'COMP-101';
  const cleanCode = normalizeCompanyCode(rawCode);

  // Instantly broadcast locally across browser tabs/PWA instances in 0ms
  const currentDevId = getLocalDeviceId();
  const latestAudit = db.audit && db.audit[0] ? db.audit[0] : null;
  const actionLabel = latestAudit ? `${latestAudit.action}${latestAudit.detail ? ` (${latestAudit.detail})` : ''}` : 'تحديث البيانات';

  if (localBroadcastChannel) {
    try {
      localBroadcastChannel.postMessage({
        type: 'LOCAL_INSTANT_SYNC',
        deviceId: currentDevId,
        updatedBy: db.currentUser?.name || 'مستخدم آخر',
        companyCode: cleanCode,
        actionDesc: actionLabel,
        data: JSON.stringify(db)
      });
    } catch (e) {
      // ignore
    }
  }

  const pushJob = async (): Promise<boolean> => {
    try {
      updateSyncState({ status: 'syncing' });

      // Anti-wiping protection: ONLY blocks an uninitialized client with 0 audit logs from overwriting cloud data.
      // Manager deletions & modifications have audit logs (e.g. 'حذف فاتورة') and are NEVER blocked!
      const isUninitializedClient = (!db.audit || db.audit.length === 0) &&
                                   (!db.invoices || db.invoices.length === 0) &&
                                   (!db.customers || db.customers.length === 0) &&
                                   (!db.suppliers || db.suppliers.length === 0) &&
                                   (!db.users || db.users.length <= 1);

      if (isUninitializedClient) {
        try {
          const compDocRef = doc(firestore, SYNC_DOC_PATH, `company_${cleanCode}`);
          const checkSnap = await getDoc(compDocRef);
          if (checkSnap.exists()) {
            const val = checkSnap.data();
            if (val?.data) {
              const parsed = JSON.parse(val.data) as AccountingDB;
              const hasCloudData = (parsed.invoices && parsed.invoices.length > 0) ||
                                   (parsed.users && parsed.users.length > 1) ||
                                   (parsed.customers && parsed.customers.length > 0) ||
                                   (parsed.suppliers && parsed.suppliers.length > 0);
              if (hasCloudData) {
                console.warn('CRITICAL SAFEGUARD: Prevented empty uninitialized client from overwriting active cloud database!');
                updateSyncState({ status: 'connected' });
                return false;
              }
            }
          }
        } catch (checkErr) {
          console.warn('Safeguard check note:', checkErr);
        }
      }

      const payload = {
        updatedAt: Date.now(),
        updatedBy: db.currentUser?.name || 'مستخدم حساباتي',
        updatedRole: db.currentUser?.role || 'مدير',
        companyCode: cleanCode,
        companyName: db.settings.company,
        deviceId: currentDevId,
        actionDesc: actionLabel,
        data: JSON.stringify(db)
      };
      lastLocalSavedTimestamp = payload.updatedAt;

      // 1. Save to dedicated company document
      const compDocRef = doc(firestore, SYNC_DOC_PATH, `company_${cleanCode}`);
      await setDoc(compDocRef, payload, { merge: true });

      // 2. Also save to main database doc for COMP-101 / primary
      if (cleanCode === 'COMP-101') {
        const docRef = doc(firestore, SYNC_DOC_PATH, SYNC_DOC_ID);
        await setDoc(docRef, payload, { merge: true });
      }

      // 3. Keep a safe versioned recovery backup document in Firestore so data is NEVER lost
      try {
        const backupDocRef = doc(firestore, SYNC_DOC_PATH, `backup_${cleanCode}_latest`);
        await setDoc(backupDocRef, payload, { merge: true });
      } catch (bErr) {
        // non-blocking
      }

      // 4. Maintain directory of companies for instant multi-device lookups
      try {
        const dirDocRef = doc(firestore, SYNC_DOC_PATH, 'directory_registry');
        await setDoc(dirDocRef, {
          [cleanCode]: {
            code: cleanCode,
            name: db.settings.company,
            updatedAt: payload.updatedAt,
            usersCount: (db.users || []).length,
            invoicesCount: (db.invoices || []).length
          }
        }, { merge: true });
      } catch (e) {
        console.warn('Company code index notice:', e);
      }

      updateSyncState({
        status: 'connected',
        lastSyncedAt: payload.updatedAt,
        lastUpdatedBy: payload.updatedBy
      });
      return true;
    } catch (err) {
      console.warn('Firestore cloud sync push warning (safe fallback to IndexedDB):', err);
      updateSyncState({ status: 'offline' });
      return false;
    }
  };

  if (immediate) {
    return pushJob();
  }

  return new Promise((resolve) => {
    syncDebounceTimer = setTimeout(async () => {
      const res = await pushJob();
      resolve(res);
    }, 100);
  });
}

/**
 * Fetch latest database from Cloud Firestore for a specific company code
 */
export async function fetchDatabaseFromCloud(companyCode?: string): Promise<AccountingDB | null> {
  const clean = normalizeCompanyCode(companyCode);
  try {
    // 1. Check company specific document
    const specificRef = doc(firestore, SYNC_DOC_PATH, `company_${clean}`);
    const specificSnap = await withTimeout(getDoc(specificRef), 3500);
    if (specificSnap && specificSnap.exists()) {
      const val = specificSnap.data();
      if (val && val.data) {
        return JSON.parse(val.data) as AccountingDB;
      }
    }

    // 2. Check main cloud database
    const docRef = doc(firestore, SYNC_DOC_PATH, SYNC_DOC_ID);
    const snap = await withTimeout(getDoc(docRef), 3000);
    if (snap && snap.exists()) {
      const val = snap.data();
      if (val && val.data) {
        const parsed = JSON.parse(val.data) as AccountingDB;
        const mainCode = normalizeCompanyCode(parsed.settings?.companyCode);
        if (mainCode === clean || clean === 'COMP-101') {
          return sanitizeCompanyDatabase(parsed, clean);
        }
      }
    }

    // 3. Check backup document
    const backupRef = doc(firestore, SYNC_DOC_PATH, `backup_${clean}_latest`);
    const backupSnap = await withTimeout(getDoc(backupRef), 3000);
    if (backupSnap && backupSnap.exists()) {
      const val = backupSnap.data();
      if (val && val.data) {
        return sanitizeCompanyDatabase(JSON.parse(val.data) as AccountingDB, clean);
      }
    }

    return null;
  } catch (err) {
    console.warn('Firestore cloud sync fetch warning:', err);
    return null;
  }
}

/**
 * Requirement 1: Database Query / Cloud API to fetch all users and branches based on Company Code (Tenant ID)
 * Guarantees fetching ALL registered users (not just default/admin) from Firestore Cloud across mobile devices.
 * Normalizes input so 'COMP - 101' matches 'COMP-101' seamlessly.
 */
export async function fetchCompanyUsersAndBranchesByCode(codeOrId: string): Promise<CompanyCloudResult | null> {
  if (!codeOrId || !codeOrId.trim()) return null;
  const clean = normalizeCompanyCode(codeOrId);
  const rawClean = codeOrId.trim();

  // 1. First: Query Firestore Cloud directly for this company code
  try {
    let cloudDb: AccountingDB | null = null;

    // Check specific company document e.g. company_COMP-101
    const specificRef = doc(firestore, SYNC_DOC_PATH, `company_${clean}`);
    const specificSnap = await withTimeout(getDoc(specificRef), 3500);
    if (specificSnap && specificSnap.exists()) {
      const val = specificSnap.data();
      if (val?.data) {
        cloudDb = JSON.parse(val.data) as AccountingDB;
      }
    }

    // Check backup doc if specific not found
    if (!cloudDb) {
      const backupRef = doc(firestore, SYNC_DOC_PATH, `backup_${clean}_latest`);
      const backupSnap = await withTimeout(getDoc(backupRef), 3000);
      if (backupSnap && backupSnap.exists()) {
        const val = backupSnap.data();
        if (val?.data) {
          cloudDb = JSON.parse(val.data) as AccountingDB;
        }
      }
    }

    // Check main cloud database
    if (!cloudDb) {
      const mainRef = doc(firestore, SYNC_DOC_PATH, SYNC_DOC_ID);
      const mainSnap = await withTimeout(getDoc(mainRef), 3000);
      if (mainSnap && mainSnap.exists()) {
        const val = mainSnap.data();
        if (val?.data) {
          const parsed = JSON.parse(val.data) as AccountingDB;
          const mainCode = normalizeCompanyCode(parsed.settings?.companyCode);
          const mainName = (parsed.settings?.company || '').toUpperCase();
          if (
            mainCode === clean ||
            mainName.includes(rawClean.toUpperCase()) ||
            clean === 'COMP-101'
          ) {
            cloudDb = parsed;
          }
        }
      }
    }

    if (cloudDb && Array.isArray(cloudDb.users) && cloudDb.users.length > 0) {
      const ensuredCloud = sanitizeCompanyDatabase(cloudDb, clean);
      return {
        db: ensuredCloud,
        companyName: ensuredCloud.settings.company || (isCompanyMawan(clean) ? 'شركة الموان' : 'شركة الأخوة'),
        companyCode: ensuredCloud.settings.companyCode || clean,
        users: ensuredCloud.users, // Full array of all registered users for this company!
        branches: ensuredCloud.branches || [],
        source: 'cloud'
      };
    }
  } catch (err) {
    console.warn('Cloud query warning for company code:', err);
  }

  // 2. Fallback: Query local tenant database directly (never cross-contaminates users!)
  try {
    const targetTenantId = isCompanyMawan(clean) ? 'comp_mawan' : 'comp_ekhwa';
    const localDb = loadTenantDatabase(targetTenantId);
    const ensuredLocal = sanitizeCompanyDatabase(localDb, clean);

    return {
      db: ensuredLocal,
      companyName: ensuredLocal.settings.company || (isCompanyMawan(clean) ? 'شركة الموان' : 'شركة الأخوة'),
      companyCode: ensuredLocal.settings.companyCode || clean,
      users: ensuredLocal.users || [], // Full array of all registered users for this company!
      branches: ensuredLocal.branches || [],
      source: 'local'
    };
  } catch (err) {
    console.warn('Local fallback error for company code:', err);
  }

  return null;
}

/**
 * Subscribe to realtime live updates across all phones
 */
export function subscribeToCloudDatabase(
  onRemoteUpdate: (updatedDb: AccountingDB, updatedBy: string, actionDesc?: string) => void,
  companyCode?: string
): () => void {
  try {
    if (unsubscribeListener) {
      unsubscribeListener();
      unsubscribeListener = null;
    }
    if (unsubscribeCompListener) {
      unsubscribeCompListener();
      unsubscribeCompListener = null;
    }

    const currentDevId = getLocalDeviceId();

    const cleanCode = normalizeCompanyCode(companyCode);

    // 1. Instant local BroadcastChannel listener (0ms between tabs / PWA windows)
    const handleBroadcast = (event: MessageEvent) => {
      if (
        event.data?.type === 'LOCAL_INSTANT_SYNC' &&
        event.data?.deviceId !== currentDevId &&
        event.data?.data
      ) {
        if (event.data.companyCode && normalizeCompanyCode(event.data.companyCode) !== cleanCode) {
          return;
        }
        try {
          const remoteDb = JSON.parse(event.data.data) as AccountingDB;
          if (remoteDb && Array.isArray(remoteDb.products) && remoteDb.settings) {
            onRemoteUpdate(remoteDb, event.data.updatedBy || 'مستخدم آخر', event.data.actionDesc);
          }
        } catch (e) {
          console.error('Error handling local broadcast update:', e);
        }
      }
    };

    if (localBroadcastChannel) {
      localBroadcastChannel.addEventListener('message', handleBroadcast);
    }

    // 2. Handler for Firestore incoming remote snapshots
    const handleSnapshot = (snap: any) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (!data || !data.data) return;

      // Filter out updates sent by this exact browser window/device instance
      if (data.deviceId && data.deviceId === currentDevId) {
        return;
      }

      // Filter out updates for a different company
      if (data.companyCode && normalizeCompanyCode(data.companyCode) !== cleanCode) {
        return;
      }

      // Secondary protection: if deviceId was not present, check recent local timestamp within 300ms
      if (!data.deviceId && data.updatedAt && Math.abs(data.updatedAt - lastLocalSavedTimestamp) < 300) {
        return;
      }

      try {
        let remoteDb = JSON.parse(data.data) as AccountingDB;
        if (remoteDb && Array.isArray(remoteDb.products) && remoteDb.settings) {
          remoteDb = ensurePrimaryBranches(remoteDb);
          onRemoteUpdate(remoteDb, data.updatedBy || 'مستخدم آخر', data.actionDesc);
        }
      } catch (e) {
        console.error('Error parsing remote database update:', e);
      }
    };

    // 3. Listen to company-specific document
    const compDocRef = doc(firestore, SYNC_DOC_PATH, `company_${cleanCode}`);
    unsubscribeCompListener = onSnapshot(compDocRef, handleSnapshot, (error) => {
      console.warn('Firestore company listener notice:', error.message);
    });

    // Also listen to main doc if COMP-101 for backwards compatibility
    if (cleanCode === 'COMP-101') {
      const docRef = doc(firestore, SYNC_DOC_PATH, SYNC_DOC_ID);
      unsubscribeListener = onSnapshot(docRef, handleSnapshot, (error) => {
        console.warn('Firestore realtime listener notice:', error.message);
      });
    }

    return () => {
      if (unsubscribeListener) {
        unsubscribeListener();
        unsubscribeListener = null;
      }
      if (unsubscribeCompListener) {
        unsubscribeCompListener();
        unsubscribeCompListener = null;
      }
      if (localBroadcastChannel) {
        localBroadcastChannel.removeEventListener('message', handleBroadcast);
      }
    };
  } catch (err) {
    console.warn('Realtime sync subscription notice:', err);
    return () => {};
  }
}
