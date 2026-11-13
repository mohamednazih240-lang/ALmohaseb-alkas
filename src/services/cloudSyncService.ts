import {
  getFirestore,
  initializeFirestore,
  setLogLevel,
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  onSnapshot
} from 'firebase/firestore';
import { auth } from './firebaseAuth';
import { AccountingDB, User as AppUser, Branch } from '../types/accounting';
import {
  saveDatabase,
  ensurePrimaryBranches,
  sanitizeCompanyDatabase,
  isCompanyMawan,
  loadTenantDatabase,
  mergeInvoices,
  mergeVouchers,
  mergeTreasury,
  mergeStockMovements,
  mergeProducts,
  verifyAndCorrectStockMovements,
  PURGED_COMP101_INVOICE_IDS,
  isPurgedEkhwaInvoice,
  cacheCompanyLogoLocally,
  getCachedCompanyLogoLocally
} from './accountingStorage';
import firebaseConfig from '../../firebase-applet-config.json';

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
function withTimeout<T>(promise: Promise<T>, ms: number = 4000): Promise<T | null> {
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

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function isPermissionDeniedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  const code = (err as any)?.code;
  return code === 'permission-denied' || /insufficient permissions|permission[- ]denied/i.test(msg);
}

/**
 * Validates initial Firestore server connectivity on startup
 */
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(firestore, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration (client is offline).');
      return false;
    }
    if (isPermissionDeniedError(error)) {
      handleFirestoreError(error, OperationType.GET, 'test/connection');
    }
    return false;
  }
}

const SYNC_DOC_PATH = 'hesabaty_app_data';
const SYNC_DOC_ID = 'main_company_database';
const SHARD_COLLECTIONS = [
  'invoices',
  'stockMovements',
  'vouchers',
  'treasury',
  'journals',
  'products',
  'audit'
] as const;
type ShardCollectionKey = typeof SHARD_COLLECTIONS[number];
const SHARD_PAGE_SIZE = 250; // Keeps each Firestore doc well under ~200 KB (<20% of 1 MiB limit), scaling cleanly to >10M invoices

let unsubscribeListener: (() => void) | null = null;
let unsubscribeCompListener: (() => void) | null = null;
let lastLocalSavedTimestamp = 0;

// Incremental shard hash cache: only modified shards are uploaded on incremental saves (O(1) network writes at 10M+ scale)
const uploadedShardHashCache = new Map<string, string>();
let uploadedLogoHashCache = new Map<string, string>();
let activePushChain: Promise<boolean> = Promise.resolve(true);

const LOCAL_DEVICE_ID_KEY = 'hesabaty_device_instance_id';

/**
 * Fast non-cryptographic FNV-1a hash to skip redundant shard writes
 */
function quickHash(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${str.length}:${(h >>> 0).toString(36)}`;
}

/**
 * Standardizes company code format:
 * Handles unicode dashes, whitespace, 'COMP - 102' -> 'COMP-102'
 */
export function normalizeCompanyCode(code?: string): string {
  if (!code || code === 'COMP-101') return 'COMP-102';
  let clean = code.trim().toUpperCase();
  clean = clean.replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-');
  clean = clean.replace(/\s*-\s*/g, '-').replace(/\s+/g, '');
  if (/^\d+$/.test(clean)) {
    clean = `COMP-${clean}`;
  }
  if (clean === 'COMP-101') return 'COMP-102';
  return clean || 'COMP-102';
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
 * Reassembles a full AccountingDB from either a legacy monolithic doc or a scalable sharded manifest doc
 */
async function reassembleFromManifestDoc(docVal: any, fallbackCode: string): Promise<AccountingDB | null> {
  if (!docVal || !docVal.data) return null;

  const baseDb = JSON.parse(docVal.data) as AccountingDB;

  if (!docVal.sharded) {
    return baseDb;
  }

  const prefix = normalizeCompanyCode(docVal.shardPrefix || docVal.companyCode || fallbackCode);
  const shardCounts: Record<string, number> = docVal.shardCounts || {};

  // Fetch separate logo asset whenever logo wasn't explicitly deleted (even if an older/stale manifest didn't set hasSeparateLogo)
  const isLogoExplicitlyRemoved = Boolean(baseDb.settings?.logoRemovedAt);
  const shouldCheckSeparateLogo = !isLogoExplicitlyRemoved && (docVal.hasSeparateLogo !== false || !baseDb.settings?.logo);
  const logoPromise = shouldCheckSeparateLogo
    ? withTimeout(getDoc(doc(firestore, SYNC_DOC_PATH, `asset_${prefix}_logo`)), 9000)
        .then(snap => {
          if (!snap || !snap.exists()) return { exists: false, logo: '', updatedAt: 0 };
          const d = snap.data();
          return {
            exists: true,
            logo: typeof d?.logo === 'string' ? d.logo : '',
            updatedAt: Number(d?.updatedAt) || 0
          };
        })
        .catch(() => null)
    : Promise.resolve({ exists: false, logo: '', updatedAt: 0 });

  // Build shard descriptors to fetch in parallel chunks
  const shardTasks: Array<{ col: ShardCollectionKey; idx: number; docId: string }> = [];
  for (const col of SHARD_COLLECTIONS) {
    const count = Number(shardCounts[col]) || 0;
    for (let idx = 0; idx < count; idx++) {
      shardTasks.push({
        col,
        idx,
        docId: `shard_${prefix}_${col}_${idx}`
      });
    }
  }

  const reassembled: Record<ShardCollectionKey, any[][]> = {
    invoices: [],
    stockMovements: [],
    vouchers: [],
    treasury: [],
    journals: [],
    products: [],
    audit: []
  };

  // Run shard reads in parallel groups of 24 so even large datasets stream fast without browser connection exhaustion
  const BATCH = 24;
  for (let i = 0; i < shardTasks.length; i += BATCH) {
    const slice = shardTasks.slice(i, i + BATCH);
    const results = await Promise.all(
      slice.map(task =>
        withTimeout(getDoc(doc(firestore, SYNC_DOC_PATH, task.docId)), 4500)
          .then(snap => {
            if (!snap || !snap.exists()) return [];
            const d = snap.data();
            if (d?.itemsJson) {
              return JSON.parse(d.itemsJson) as any[];
            }
            if (Array.isArray(d?.items)) {
              return d.items;
            }
            return [];
          })
          .catch(() => [])
      )
    );
    slice.forEach((task, j) => {
      reassembled[task.col][task.idx] = results[j] || [];
    });
  }

  const logoResult = await logoPromise;
  if (baseDb.settings) {
    if (logoResult && logoResult.exists) {
      if (logoResult.logo) {
        baseDb.settings.logo = logoResult.logo;
        baseDb.settings.logoUpdatedAt = logoResult.updatedAt || baseDb.settings.logoUpdatedAt;
        delete baseDb.settings.logoRemovedAt;
        cacheCompanyLogoLocally(prefix, logoResult.logo);
      } else if (logoResult.updatedAt > (baseDb.settings.logoUpdatedAt || 0)) {
        // Explicit cloud deletion newer than any local upload
        baseDb.settings.logo = '';
        baseDb.settings.logoRemovedAt = logoResult.updatedAt;
      }
    } else if (!baseDb.settings.logo && !baseDb.settings.logoRemovedAt) {
      // Network timeout or doc fetch missed — restore cached logo if present on device
      const cached = getCachedCompanyLogoLocally(prefix);
      if (cached.logo && (!cached.removedAt || (cached.updatedAt || 0) >= cached.removedAt)) {
        baseDb.settings.logo = cached.logo;
      }
    }
  }

  for (const col of SHARD_COLLECTIONS) {
    if ((Number(shardCounts[col]) || 0) > 0) {
      const mergedArr: any[] = [];
      for (const page of reassembled[col]) {
        if (Array.isArray(page)) {
          for (const item of page) mergedArr.push(item);
        }
      }
      (baseDb as any)[col] = mergedArr;
    } else if (!Array.isArray((baseDb as any)[col])) {
      (baseDb as any)[col] = [];
    }
  }

  return baseDb;
}

/**
 * Checks lightweight manifest timestamp in Firestore to avoid redundant full downloads during background polling
 */
export async function getCloudLatestTimestamp(companyCode?: string): Promise<number> {
  const clean = normalizeCompanyCode(companyCode);
  try {
    const snap = await withTimeout(getDoc(doc(firestore, SYNC_DOC_PATH, `company_${clean}`)), 2500);
    if (snap && snap.exists()) {
      return Number(snap.data()?.updatedAt) || 0;
    }
  } catch {
    // ignore
  }
  return 0;
}

/**
 * Upload current database state to Firestore using Sharded Architecture (>10M invoices/year scalable, <200KB per doc)
 */
export async function pushDatabaseToCloud(db: AccountingDB, immediate: boolean = true): Promise<boolean> {
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = null;
  }

  const rawCode = db.settings.companyCode || 'COMP-102';
  const cleanCode = normalizeCompanyCode(rawCode);
  const currentDevId = getLocalDeviceId();
  const latestAudit = db.audit && db.audit[0] ? db.audit[0] : null;
  const actionLabel = latestAudit ? `${latestAudit.action}${latestAudit.detail ? ` (${latestAudit.detail})` : ''}` : 'تحديث البيانات';

  // Ensure purged foreign invoices never get pushed from any device
  const deletedSet = new Set<string>([
    ...PURGED_COMP101_INVOICE_IDS,
    ...(db.deletedInvoiceIds || [])
  ]);
  const cleanDb: AccountingDB = {
    ...db,
    deletedInvoiceIds: Array.from(new Set(db.deletedInvoiceIds || [])),
    invoices: (db.invoices || []).filter(inv => !isPurgedEkhwaInvoice(inv) && !deletedSet.has(inv.id))
  };

  // Broadcast locally across browser tabs in 0ms
  if (localBroadcastChannel) {
    try {
      if ((cleanDb.invoices?.length || 0) <= 2000) {
        localBroadcastChannel.postMessage({
          type: 'LOCAL_INSTANT_SYNC',
          deviceId: currentDevId,
          updatedBy: cleanDb.currentUser?.name || 'مستخدم آخر',
          companyCode: cleanCode,
          actionDesc: actionLabel,
          data: JSON.stringify(cleanDb)
        });
      }
    } catch {
      // ignore if oversized for channel
    }
  }

  const pushJob = async (): Promise<boolean> => {
    try {
      updateSyncState({ status: 'syncing' });

      // Anti-wipe protection against empty uninitialized client
      const isUninitializedClient = (!cleanDb.audit || cleanDb.audit.length === 0) &&
                                   (!cleanDb.invoices || cleanDb.invoices.length === 0) &&
                                   (!cleanDb.customers || cleanDb.customers.length === 0) &&
                                   (!cleanDb.suppliers || cleanDb.suppliers.length === 0) &&
                                   (!cleanDb.users || cleanDb.users.length <= 1);

      try {
        const compDocRef = doc(firestore, SYNC_DOC_PATH, `company_${cleanCode}`);
        const checkSnap = await withTimeout(getDoc(compDocRef), 1800);
        if (checkSnap && checkSnap.exists()) {
          const val = checkSnap.data();
          if (isUninitializedClient && val) {
            const hasShardedData = val.sharded && ((val.shardCounts?.invoices || 0) > 0 || (val.shardCounts?.products || 0) > 0);
            let hasLegacyData = false;
            if (!val.sharded && val.data) {
              const parsed = JSON.parse(val.data) as AccountingDB;
              hasLegacyData = (parsed.invoices && parsed.invoices.length > 0) ||
                              (parsed.users && parsed.users.length > 1) ||
                              (parsed.customers && parsed.customers.length > 0) ||
                              (parsed.suppliers && parsed.suppliers.length > 0);
            }
            if (hasShardedData || hasLegacyData) {
              console.warn('CRITICAL SAFEGUARD: Prevented empty uninitialized client from overwriting active cloud database!');
              updateSyncState({ status: 'connected' });
              return false;
            }
          }
        }
      } catch (checkErr) {
        console.warn('Safeguard check note:', checkErr);
      }

      const now = Date.now();
      const logoString = cleanDb.settings?.logo || '';
      const isExplicitlyRemoved = Boolean(!logoString && cleanDb.settings?.logoRemovedAt);
      const hasSeparateLogo = Boolean(logoString && logoString.length > 0);

      // 1. Upload or explicitly clear company logo asset (serialized via activePushChain so concurrent writes never race)
      if (hasSeparateLogo && logoString.length <= 940000) {
        const logoHash = quickHash(logoString);
        if (uploadedLogoHashCache.get(cleanCode) !== logoHash) {
          await setDoc(doc(firestore, SYNC_DOC_PATH, `asset_${cleanCode}_logo`), {
            companyCode: cleanCode,
            logo: logoString,
            updatedAt: now
          });
          uploadedLogoHashCache.set(cleanCode, logoHash);
        }
      } else if (isExplicitlyRemoved) {
        if (uploadedLogoHashCache.get(cleanCode) !== 'REMOVED') {
          await setDoc(doc(firestore, SYNC_DOC_PATH, `asset_${cleanCode}_logo`), {
            companyCode: cleanCode,
            logo: '',
            updatedAt: cleanDb.settings?.logoRemovedAt || now
          });
          uploadedLogoHashCache.set(cleanCode, 'REMOVED');
        }
      }

      // 2. Shard large collections & write ONLY changed shards (O(changed shards) instead of full rewrite!)
      const shardCounts: Record<string, number> = {};
      const shardWritePromises: Promise<void>[] = [];

      for (const col of SHARD_COLLECTIONS) {
        const arr: any[] = Array.isArray((cleanDb as any)[col]) ? (cleanDb as any)[col] : [];
        const numShards = Math.ceil(arr.length / SHARD_PAGE_SIZE);
        shardCounts[col] = numShards;

        for (let idx = 0; idx < numShards; idx++) {
          const slice = arr.slice(idx * SHARD_PAGE_SIZE, (idx + 1) * SHARD_PAGE_SIZE);
          const itemsJson = JSON.stringify(slice);
          const cacheKey = `${cleanCode}::${col}::${idx}`;
          const h = quickHash(itemsJson);

          if (uploadedShardHashCache.get(cacheKey) !== h) {
            const shardRef = doc(firestore, SYNC_DOC_PATH, `shard_${cleanCode}_${col}_${idx}`);
            shardWritePromises.push(
              setDoc(shardRef, {
                companyCode: cleanCode,
                collection: col,
                shardIndex: idx,
                count: slice.length,
                updatedAt: now,
                itemsJson
              }).then(() => {
                uploadedShardHashCache.set(cacheKey, h);
              })
            );
          }
        }
      }

      // Execute shard writes in batches of 15 before publishing updated manifest
      for (let i = 0; i < shardWritePromises.length; i += 15) {
        await Promise.all(shardWritePromises.slice(i, i + 15));
      }

      // 3. Build ultra-lightweight core payload (~15-35 KB max!) without inline logo or heavy arrays
      const lightCoreDb: AccountingDB = {
        ...cleanDb,
        settings: {
          ...cleanDb.settings,
          logo: ''
        },
        invoices: [],
        stockMovements: [],
        vouchers: [],
        treasury: [],
        journals: [],
        products: [],
        audit: []
      };

      const manifestPayload = {
        updatedAt: now,
        updatedBy: (cleanDb.currentUser?.name || 'مستخدم حساباتي').slice(0, 110),
        updatedRole: (cleanDb.currentUser?.role || 'مدير').slice(0, 50),
        companyCode: cleanCode.slice(0, 40),
        companyName: (cleanDb.settings.company || '').slice(0, 190),
        deviceId: currentDevId.slice(0, 110),
        actionDesc: actionLabel.slice(0, 480),
        sharded: true,
        shardPrefix: cleanCode.slice(0, 40),
        shardCounts,
        hasSeparateLogo,
        invoicesCount: (cleanDb.invoices || []).length,
        productsCount: (cleanDb.products || []).length,
        data: JSON.stringify(lightCoreDb)
      };

      lastLocalSavedTimestamp = now;

      // 4. Write lightweight manifests (~20 KB each, far below 1MB Firestore cap even with 10M+ invoices)
      const compDocRef = doc(firestore, SYNC_DOC_PATH, `company_${cleanCode}`);
      await setDoc(compDocRef, manifestPayload);

      if (cleanCode === 'COMP-102') {
        await setDoc(doc(firestore, SYNC_DOC_PATH, SYNC_DOC_ID), manifestPayload);
      }

      try {
        await setDoc(doc(firestore, SYNC_DOC_PATH, `backup_${cleanCode}_latest`), manifestPayload);
      } catch {
        // non-blocking
      }

      try {
        await setDoc(doc(firestore, SYNC_DOC_PATH, 'directory_registry'), {
          [cleanCode]: {
            code: cleanCode,
            name: cleanDb.settings.company,
            updatedAt: now,
            usersCount: (cleanDb.users || []).length,
            invoicesCount: (cleanDb.invoices || []).length
          }
        }, { merge: true });
      } catch (e) {
        console.warn('Company code index notice:', e);
      }

      updateSyncState({
        status: 'connected',
        lastSyncedAt: now,
        lastUpdatedBy: manifestPayload.updatedBy
      });
      return true;
    } catch (err) {
      if (isPermissionDeniedError(err)) {
        updateSyncState({ status: 'error' });
        handleFirestoreError(err, OperationType.WRITE, `${SYNC_DOC_PATH}/company_${cleanCode}`);
      }
      console.warn('Firestore cloud sync push warning (safe fallback to IndexedDB):', err);
      updateSyncState({ status: 'offline' });
      return false;
    }
  };

  const enqueuePush = (): Promise<boolean> => {
    const next = activePushChain.catch(() => false).then(() => pushJob());
    activePushChain = next;
    return next;
  };

  if (immediate) {
    return enqueuePush();
  }

  return new Promise((resolve) => {
    syncDebounceTimer = setTimeout(async () => {
      const res = await enqueuePush();
      resolve(res);
    }, 100);
  });
}

/**
 * Fetch latest database from Cloud Firestore for a specific company code (transparently supports sharded & legacy docs)
 */
export async function fetchDatabaseFromCloud(companyCode?: string): Promise<AccountingDB | null> {
  const clean = normalizeCompanyCode(companyCode);
  try {
    let specificDb: AccountingDB | null = null;
    let mainDb: AccountingDB | null = null;

    try {
      const specificRef = doc(firestore, SYNC_DOC_PATH, `company_${clean}`);
      const specificSnap = await withTimeout(getDoc(specificRef), 4000);
      if (specificSnap && specificSnap.exists()) {
        specificDb = await reassembleFromManifestDoc(specificSnap.data(), clean);
      }
    } catch (e) {
      console.warn('Specific cloud read note:', e);
    }

    if (clean === 'COMP-102' && !specificDb) {
      try {
        const docRef = doc(firestore, SYNC_DOC_PATH, SYNC_DOC_ID);
        const snap = await withTimeout(getDoc(docRef), 3500);
        if (snap && snap.exists()) {
          mainDb = await reassembleFromManifestDoc(snap.data(), clean);
        }
      } catch (e) {}
    }

    const candidates = [specificDb, mainDb].filter(Boolean) as AccountingDB[];
    if (candidates.length === 0) return null;

    let unified = candidates[0];
    for (let i = 1; i < candidates.length; i++) {
      const other = candidates[i];
      const deletedSet = new Set<string>([
        ...PURGED_COMP101_INVOICE_IDS,
        ...(unified.deletedInvoiceIds || []),
        ...(other.deletedInvoiceIds || [])
      ]);
      const preservedLogo =
        (unified.settings?.logo && unified.settings.logo.trim())
          ? unified.settings.logo
          : (other.settings?.logo && other.settings.logo.trim() ? other.settings.logo : '');

      unified = {
        ...unified,
        settings: {
          ...unified.settings,
          logo: preservedLogo
        },
        deletedInvoiceIds: Array.from(deletedSet),
        invoices: mergeInvoices(unified.invoices || [], other.invoices || [], deletedSet),
        vouchers: mergeVouchers(unified.vouchers || [], other.vouchers || []),
        treasury: mergeTreasury(unified.treasury || [], other.treasury || []),
        stockMovements: mergeStockMovements(unified.stockMovements || [], other.stockMovements || []),
        products: mergeProducts(unified.products || [], other.products || []),
        users: Array.from(new Map<string, AppUser>([
          ...(unified.users || []).map((u): [string, AppUser] => [u.id || u.username, u]),
          ...(other.users || []).map((u): [string, AppUser] => [u.id || u.username, u])
        ]).values()),
        customers: Array.from(new Map<string, any>([
          ...(unified.customers || []).map((c): [string, any] => [c.id || c.name, c]),
          ...(other.customers || []).map((c): [string, any] => [c.id || c.name, c])
        ]).values()),
        suppliers: Array.from(new Map<string, any>([
          ...(unified.suppliers || []).map((s): [string, any] => [s.id || s.name, s]),
          ...(other.suppliers || []).map((s): [string, any] => [s.id || s.name, s])
        ]).values()),
      };
    }
    return verifyAndCorrectStockMovements(sanitizeCompanyDatabase(unified, clean)).db;
  } catch (err) {
    console.warn('Firestore cloud sync fetch warning:', err);
    return null;
  }
}

/**
 * Fetch all users and branches based on Company Code (Tenant ID) from Firestore or Local
 */
export async function fetchCompanyUsersAndBranchesByCode(codeOrId: string): Promise<CompanyCloudResult | null> {
  if (!codeOrId || !codeOrId.trim()) return null;
  const clean = normalizeCompanyCode(codeOrId);
  const rawClean = codeOrId.trim();

  try {
    let cloudDb: AccountingDB | null = null;

    const specificRef = doc(firestore, SYNC_DOC_PATH, `company_${clean}`);
    const specificSnap = await withTimeout(getDoc(specificRef), 4000);
    if (specificSnap && specificSnap.exists()) {
      cloudDb = await reassembleFromManifestDoc(specificSnap.data(), clean);
    }

    if (!cloudDb) {
      const backupRef = doc(firestore, SYNC_DOC_PATH, `backup_${clean}_latest`);
      const backupSnap = await withTimeout(getDoc(backupRef), 3500);
      if (backupSnap && backupSnap.exists()) {
        cloudDb = await reassembleFromManifestDoc(backupSnap.data(), clean);
      }
    }

    if (!cloudDb) {
      const mainRef = doc(firestore, SYNC_DOC_PATH, SYNC_DOC_ID);
      const mainSnap = await withTimeout(getDoc(mainRef), 3500);
      if (mainSnap && mainSnap.exists()) {
        const val = mainSnap.data();
        const mainCode = normalizeCompanyCode(val?.companyCode);
        const mainName = (val?.companyName || '').toUpperCase();
        if (mainCode === clean || mainName.includes(rawClean.toUpperCase())) {
          cloudDb = await reassembleFromManifestDoc(val, clean);
        }
      }
    }

    if (cloudDb && Array.isArray(cloudDb.users) && cloudDb.users.length > 0) {
      const ensuredCloud = sanitizeCompanyDatabase(cloudDb, clean);
      return {
        db: ensuredCloud,
        companyName: ensuredCloud.settings.company || 'شركة الموان',
        companyCode: ensuredCloud.settings.companyCode || clean,
        users: ensuredCloud.users,
        branches: ensuredCloud.branches || [],
        source: 'cloud'
      };
    }
  } catch (err) {
    console.warn('Cloud query warning for company code:', err);
  }

  try {
    const targetTenantId = isCompanyMawan(clean) ? 'comp_mawan' : 'comp_ekhwa';
    const localDb = loadTenantDatabase(targetTenantId);
    const ensuredLocal = sanitizeCompanyDatabase(localDb, clean);

    return {
      db: ensuredLocal,
      companyName: ensuredLocal.settings.company || 'شركة الموان',
      companyCode: ensuredLocal.settings.companyCode || clean,
      users: ensuredLocal.users || [],
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

    // 2. Handler for Firestore incoming remote snapshots (handles both sharded and monolithic docs)
    const isMawan = cleanCode === 'COMP-102' || cleanCode === 'COMP-101';
    let lastHandledRemoteTimestamp = 0;

    const handleSnapshot = async (snap: any) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (!data || !data.data) return;

      if (data.deviceId && data.deviceId === currentDevId) {
        return;
      }

      if (data.companyCode) {
        const dataCode = normalizeCompanyCode(data.companyCode);
        if (!isMawan && dataCode !== cleanCode) {
          return;
        }
      }

      if (data.updatedAt && data.updatedAt <= lastHandledRemoteTimestamp) {
        return;
      }

      if (!data.deviceId && data.updatedAt && Math.abs(data.updatedAt - lastLocalSavedTimestamp) < 300) {
        return;
      }

      try {
        lastHandledRemoteTimestamp = data.updatedAt || Date.now();
        let remoteDb = await reassembleFromManifestDoc(data, cleanCode);
        if (remoteDb && Array.isArray(remoteDb.products) && remoteDb.settings) {
          remoteDb = ensurePrimaryBranches(remoteDb);
          onRemoteUpdate(remoteDb, data.updatedBy || 'مستخدم آخر', data.actionDesc);
        }
      } catch (e) {
        console.error('Error parsing remote database update:', e);
      }
    };

    // 3. Listen to company-specific document (the main shared doc triggers immediately for all devices)
    const compDocRef = doc(firestore, SYNC_DOC_PATH, `company_${cleanCode}`);
    unsubscribeCompListener = onSnapshot(compDocRef, (snap) => { void handleSnapshot(snap); }, (error) => {
      if (isPermissionDeniedError(error)) {
        try {
          handleFirestoreError(error, OperationType.GET, `${SYNC_DOC_PATH}/company_${cleanCode}`);
        } catch {
          updateSyncState({ status: 'error' });
        }
        return;
      }
      console.warn('Firestore company listener notice:', error.message);
    });

    if (isMawan) {
      const docRef = doc(firestore, SYNC_DOC_PATH, SYNC_DOC_ID);
      unsubscribeListener = onSnapshot(docRef, (snap) => { void handleSnapshot(snap); }, (error) => {
        if (isPermissionDeniedError(error)) {
          try {
            handleFirestoreError(error, OperationType.GET, `${SYNC_DOC_PATH}/${SYNC_DOC_ID}`);
          } catch {
            updateSyncState({ status: 'error' });
          }
          return;
        }
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
