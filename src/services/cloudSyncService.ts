import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot
} from 'firebase/firestore';
import { auth } from './firebaseAuth';
import { AccountingDB } from '../types/accounting';
import { saveDatabase, loadDatabase } from './accountingStorage';

// Firestore instance
export const firestore = getFirestore(auth.app);

const SYNC_DOC_PATH = 'hesabaty_app_data';
const SYNC_DOC_ID = 'main_company_database';
let unsubscribeListener: (() => void) | null = null;
let lastLocalSavedTimestamp = 0;
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

/**
 * Upload current database state to Firestore so all connected phones see it immediately
 */
export async function pushDatabaseToCloud(db: AccountingDB): Promise<boolean> {
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
  }

  return new Promise((resolve) => {
    syncDebounceTimer = setTimeout(async () => {
      try {
        updateSyncState({ status: 'syncing' });
        const docRef = doc(firestore, SYNC_DOC_PATH, SYNC_DOC_ID);
        const payload = {
          updatedAt: Date.now(),
          updatedBy: db.currentUser?.name || 'مستخدم حساباتي',
          updatedRole: db.currentUser?.role || 'مدير',
          data: JSON.stringify(db)
        };
        lastLocalSavedTimestamp = payload.updatedAt;
        await setDoc(docRef, payload, { merge: true });
        updateSyncState({
          status: 'connected',
          lastSyncedAt: payload.updatedAt,
          lastUpdatedBy: payload.updatedBy
        });
        resolve(true);
      } catch (err) {
        console.warn('Firestore cloud sync push warning (safe fallback to IndexedDB):', err);
        updateSyncState({ status: 'offline' });
        resolve(false);
      }
    }, 400);
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
 * Subscribe to realtime live updates across all phones
 */
export function subscribeToCloudDatabase(
  onRemoteUpdate: (updatedDb: AccountingDB, updatedBy: string) => void
): () => void {
  try {
    if (unsubscribeListener) {
      unsubscribeListener();
      unsubscribeListener = null;
    }

    const docRef = doc(firestore, SYNC_DOC_PATH, SYNC_DOC_ID);
    unsubscribeListener = onSnapshot(docRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (!data || !data.data) return;

      // Ignore our own immediate push echo
      if (data.updatedAt && Math.abs(data.updatedAt - lastLocalSavedTimestamp) < 1500) {
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
    }, (error) => {
      console.warn('Firestore realtime listener notice:', error.message);
    });

    return () => {
      if (unsubscribeListener) {
        unsubscribeListener();
        unsubscribeListener = null;
      }
    };
  } catch (err) {
    console.warn('Realtime sync subscription notice:', err);
    return () => {};
  }
}
