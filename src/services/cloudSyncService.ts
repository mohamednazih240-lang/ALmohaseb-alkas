import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot
} from 'firebase/firestore';
import { auth } from './firebaseAuth';
import { AccountingDB, User as AppUser, Branch } from '../types/accounting';
import { saveDatabase, loadDatabase } from './accountingStorage';
import { getCompanyByCode } from './tenantService';

// Firestore instance
export const firestore = getFirestore(auth.app);

const SYNC_DOC_PATH = 'hesabaty_app_data';
const SYNC_DOC_ID = 'main_company_database';
let unsubscribeListener: (() => void) | null = null;
let unsubscribeCompListener: (() => void) | null = null;
let lastLocalSavedTimestamp = 0;

const LOCAL_DEVICE_ID_KEY = 'hesabaty_device_instance_id';

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
 */
export async function pushDatabaseToCloud(db: AccountingDB, immediate: boolean = true): Promise<boolean> {
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = null;
  }

  // Instantly broadcast locally across browser tabs/PWA instances in 0ms
  const currentDevId = getLocalDeviceId();
  if (localBroadcastChannel) {
    try {
      localBroadcastChannel.postMessage({
        type: 'LOCAL_INSTANT_SYNC',
        deviceId: currentDevId,
        updatedBy: db.currentUser?.name || 'مستخدم آخر',
        companyCode: (db.settings.companyCode || 'COMP-101').toUpperCase(),
        data: JSON.stringify(db)
      });
    } catch (e) {
      // ignore
    }
  }

  const pushJob = async (): Promise<boolean> => {
    try {
      updateSyncState({ status: 'syncing' });
      const docRef = doc(firestore, SYNC_DOC_PATH, SYNC_DOC_ID);
      const rawCode = db.settings.companyCode || 'COMP-101';
      const cleanCode = rawCode.trim().toUpperCase();

      const payload = {
        updatedAt: Date.now(),
        updatedBy: db.currentUser?.name || 'مستخدم حساباتي',
        updatedRole: db.currentUser?.role || 'مدير',
        companyCode: cleanCode,
        companyName: db.settings.company,
        deviceId: currentDevId,
        data: JSON.stringify(db)
      };
      lastLocalSavedTimestamp = payload.updatedAt;

      // 1. Save to main database doc
      await setDoc(docRef, payload, { merge: true });

      // 2. Also save to company code doc so other phones querying by code get fresh data instantly
      try {
        const compDocRef = doc(firestore, SYNC_DOC_PATH, `company_${cleanCode}`);
        await setDoc(compDocRef, payload, { merge: true });

        // 3. Maintain directory of companies for fast lookups
        const dirDocRef = doc(firestore, SYNC_DOC_PATH, 'directory_registry');
        await setDoc(dirDocRef, {
          [cleanCode]: {
            code: cleanCode,
            name: db.settings.company,
            updatedAt: payload.updatedAt,
            usersCount: (db.users || []).length
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
 * Fetch latest database from Cloud Firestore
 */
export async function fetchDatabaseFromCloud(): Promise<AccountingDB | null> {
  try {
    const docRef = doc(firestore, SYNC_DOC_PATH, SYNC_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const val = snap.data();
      if (val && val.data) {
        const parsed = JSON.parse(val.data) as AccountingDB;
        return parsed;
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
 */
export async function fetchCompanyUsersAndBranchesByCode(codeOrId: string): Promise<CompanyCloudResult | null> {
  const clean = codeOrId.trim().toUpperCase();
  if (!clean) return null;

  // 1. First: Query Firestore Cloud directly for this company code
  try {
    let cloudDb: AccountingDB | null = null;

    // Check specific company document
    const specificRef = doc(firestore, SYNC_DOC_PATH, `company_${clean}`);
    const specificSnap = await getDoc(specificRef);
    if (specificSnap.exists()) {
      const val = specificSnap.data();
      if (val?.data) {
        cloudDb = JSON.parse(val.data) as AccountingDB;
      }
    }

    // Check main cloud database
    if (!cloudDb) {
      const mainRef = doc(firestore, SYNC_DOC_PATH, SYNC_DOC_ID);
      const mainSnap = await getDoc(mainRef);
      if (mainSnap.exists()) {
        const val = mainSnap.data();
        if (val?.data) {
          const parsed = JSON.parse(val.data) as AccountingDB;
          const mainCode = (parsed.settings.companyCode || 'COMP-101').toUpperCase();
          const mainName = (parsed.settings.company || '').toUpperCase();
          if (
            mainCode === clean ||
            mainName.includes(clean) ||
            clean === 'COMP-101' ||
            clean === 'MAIN' ||
            clean === 'DEFAULT'
          ) {
            cloudDb = parsed;
          }
        }
      }
    }

    if (cloudDb && Array.isArray(cloudDb.users) && cloudDb.users.length > 0) {
      const branches = (cloudDb.branches && cloudDb.branches.length > 0)
        ? cloudDb.branches
        : [{ id: 'br_main', name: 'الفرع الرئيسي', code: 'BR-01', isMain: true }];

      return {
        db: cloudDb,
        companyName: cloudDb.settings.company || 'المنشأة',
        companyCode: cloudDb.settings.companyCode || clean,
        users: cloudDb.users, // Full array of all registered users!
        branches,
        source: 'cloud'
      };
    }
  } catch (err) {
    console.warn('Cloud query warning for company code:', err);
  }

  // 2. Fallback: Query local database and tenant registry (ensures offline reliability)
  try {
    const localDb = loadDatabase();
    const localCode = (localDb.settings.companyCode || 'COMP-101').toUpperCase();
    const localName = (localDb.settings.company || '').toUpperCase();

    if (
      localCode === clean ||
      localName.includes(clean) ||
      clean === 'COMP-101' ||
      clean === 'MAIN' ||
      clean === 'DEFAULT'
    ) {
      const branches = (localDb.branches && localDb.branches.length > 0)
        ? localDb.branches
        : [{ id: 'br_main', name: 'الفرع الرئيسي', code: 'BR-01', isMain: true }];

      return {
        db: localDb,
        companyName: localDb.settings.company || 'المنشأة',
        companyCode: localDb.settings.companyCode || 'COMP-101',
        users: localDb.users || [], // Full array of all registered users!
        branches,
        source: 'local'
      };
    }

    const tenant = getCompanyByCode(codeOrId);
    if (tenant) {
      return {
        db: localDb,
        companyName: tenant.name,
        companyCode: tenant.code || clean,
        users: localDb.users || [],
        branches: localDb.branches || [{ id: 'br_main', name: 'الفرع الرئيسي', code: 'BR-01', isMain: true }],
        source: 'local'
      };
    }
  } catch (err) {
    console.warn('Local fallback error for company code:', err);
  }

  return null;
}

/**
 * Subscribe to realtime live updates across all phones
 */
export function subscribeToCloudDatabase(
  onRemoteUpdate: (updatedDb: AccountingDB, updatedBy: string) => void,
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

    // 1. Instant local BroadcastChannel listener (0ms between tabs / PWA windows)
    const handleBroadcast = (event: MessageEvent) => {
      if (
        event.data?.type === 'LOCAL_INSTANT_SYNC' &&
        event.data?.deviceId !== currentDevId &&
        event.data?.data
      ) {
        try {
          const remoteDb = JSON.parse(event.data.data) as AccountingDB;
          if (remoteDb && Array.isArray(remoteDb.products) && remoteDb.settings) {
            onRemoteUpdate(remoteDb, event.data.updatedBy || 'مستخدم آخر');
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

      // Secondary protection: if deviceId was not present, check recent local timestamp within 300ms
      if (!data.deviceId && data.updatedAt && Math.abs(data.updatedAt - lastLocalSavedTimestamp) < 300) {
        return;
      }

      try {
        const remoteDb = JSON.parse(data.data) as AccountingDB;
        if (remoteDb && Array.isArray(remoteDb.products) && remoteDb.settings) {
          onRemoteUpdate(remoteDb, data.updatedBy || 'مستخدم آخر');
        }
      } catch (e) {
        console.error('Error parsing remote database update:', e);
      }
    };

    // 3. Listen to company-specific document if companyCode exists
    const cleanCode = (companyCode || '').trim().toUpperCase();
    if (cleanCode && cleanCode !== 'COMP-101') {
      const compDocRef = doc(firestore, SYNC_DOC_PATH, `company_${cleanCode}`);
      unsubscribeCompListener = onSnapshot(compDocRef, handleSnapshot, (error) => {
        console.warn('Firestore company listener notice:', error.message);
      });
    }

    // 4. Always also listen to the main company database document
    const docRef = doc(firestore, SYNC_DOC_PATH, SYNC_DOC_ID);
    unsubscribeListener = onSnapshot(docRef, handleSnapshot, (error) => {
      console.warn('Firestore realtime listener notice:', error.message);
    });

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
