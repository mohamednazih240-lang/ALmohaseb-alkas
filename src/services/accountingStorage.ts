import {
  AccountingDB,
  Account,
  Product,
  Warehouse,
  Party,
  Invoice,
  ReturnInvoice,
  StockMovement,
  TreasuryEntry,
  Voucher,
  SimpleRecord,
  JournalEntry,
  JournalLine,
  Quote,
  Order,
  StockAdjustment,
  StockTransfer,
  FiscalPeriod,
  CostCenter,
  Currency,
  FixedAsset,
  BankReconciliation,
  GoodsReceivedNote,
  AuditLog,
  AppSettings,
  PaymentMethod,
  User,
  Branch,
  BranchProductData
} from '../types/accounting';
import {
  getTenantStorageKey,
  getTenantIdbKey,
  getActiveTenantId,
  setActiveTenantId,
  getCompanyTenant,
  getCompaniesList,
  registerCompany,
  CompanyTenant
} from './tenantService';
import { DEFAULT_CATALOG_1001, mergeCatalogIntoDb } from '../data/defaultCatalog1001';

const STORAGE_KEY = 'hesabaty_pro_db_v6';
const IDB_NAME = 'hesabaty_accounting_db';
const IDB_STORE = 'erp_storage';
const IDB_KEY = 'main_database_state';

// Whitelist / Blacklist protection: Strictly purge all invoices and records belonging to Ekhwa
export const PURGED_EKHWA_INVOICE_IDS = new Set<string>([
  'inv_mvt8tz8g_bdbs8',
  'inv_mvt8m7y6_b60qr',
  'inv_mvt7x4uk_0llcd',
  'inv_mvobnimq_4pxcf',
  'inv_mvob1d3h_4g7xe',
  'inv_mvnuoaar_6fiye',
  'inv_mvnsulgb_3d4sv',
  'inv_mvcqzqlx_yq274',
  'inv_mvcrfi1p_z3y8d',
  'inv_mvcqlpcp_or9qr'
]);

function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported in this environment'));
    }
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const idb = request.result;
      if (!idb.objectStoreNames.contains(IDB_STORE)) {
        idb.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Saves entire accounting database into IndexedDB (supports millions of records and gigabytes of storage)
 */
export async function saveToIndexedDB(db: AccountingDB, customKey?: string): Promise<void> {
  try {
    const idb = await openIndexedDB();
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    const key = customKey || (getActiveTenantId() ? getTenantIdbKey(getActiveTenantId()!) : IDB_KEY);
    store.put(db, key);
  } catch (e) {
    console.warn('IndexedDB write notice:', e);
  }
}

/**
 * Asynchronously loads accounting database from IndexedDB
 */
export async function loadFromIndexedDB(customKey?: string): Promise<AccountingDB | null> {
  try {
    const idb = await openIndexedDB();
    return new Promise((resolve) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const key = customKey || (getActiveTenantId() ? getTenantIdbKey(getActiveTenantId()!) : IDB_KEY);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  'نقدي',
  'Vodafone Cash',
  'InstaPay',
  'Visa / POS',
  'تحويل بنكي',
  'آجل'
];

export function getMethodAccountId(method: PaymentMethod): string {
  switch (method) {
    case 'نقدي': return 'acc_cash';
    case 'Vodafone Cash': return 'acc_vodafone';
    case 'InstaPay': return 'acc_instapay';
    case 'Visa / POS': return 'acc_visa';
    case 'تحويل بنكي': return 'acc_bank';
    case 'آجل': return 'acc_ar';
    default: return 'acc_cash';
  }
}

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
}

export function getTodayDate(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatMoney(amount: number, currency: string = 'ج.م'): string {
  const num = Number.isFinite(amount) ? amount : 0;
  return `${num.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function defaultAccounts(): Account[] {
  return [
    { id: 'acc_cash', code: '1101', name: 'الخزينة النقدية الرئيسية', type: 'asset', isSystem: true },
    { id: 'acc_vodafone', code: '1102', name: 'محفظة فودافون كاش', type: 'asset', isSystem: true },
    { id: 'acc_instapay', code: '1103', name: 'إنستاباي / التحويل الفوري', type: 'asset', isSystem: true },
    { id: 'acc_visa', code: '1104', name: 'نقاط البيع والفيزا (Visa/POS)', type: 'asset', isSystem: true },
    { id: 'acc_bank', code: '1105', name: 'الحساب البنكي الجاري', type: 'asset', isSystem: true },
    { id: 'acc_ar', code: '1201', name: 'العملاء (ذمم مدينة)', type: 'asset', isSystem: true },
    { id: 'acc_inv', code: '1301', name: 'مخزون البضاعة بالمستودعات', type: 'asset', isSystem: true },
    { id: 'acc_fixed_assets', code: '1401', name: 'الأصول الثابتة الإجمالية', type: 'asset', isSystem: true },
    { id: 'acc_accum_dep', code: '1402', name: 'مجمع إهلاك الأصول الثابتة (أصل مقابل)', type: 'asset', isSystem: true },
    { id: 'acc_ap', code: '2101', name: 'الموردون (ذمم دائنة)', type: 'liability', isSystem: true },
    { id: 'acc_vat', code: '2201', name: 'ضريبة القيمة المضافة المستحقة', type: 'liability', isSystem: true },
    { id: 'acc_equity', code: '3101', name: 'رأس المال وحقوق الملكية', type: 'equity', isSystem: true },
    { id: 'acc_retained_earnings', code: '3201', name: 'الأرباح والخسائر المرحلة (السنوات السابقة)', type: 'equity', isSystem: true },
    { id: 'acc_sales', code: '4101', name: 'إيراد المبيعات', type: 'revenue', isSystem: true },
    { id: 'acc_other_rev', code: '4201', name: 'إيرادات تشغيلية وأخرى', type: 'revenue', isSystem: true },
    { id: 'acc_cogs', code: '5101', name: 'تكلفة البضاعة المباعة (COGS)', type: 'expense', isSystem: true },
    { id: 'acc_exp', code: '5201', name: 'المصروفات العمومية والتشغيلية', type: 'expense', isSystem: true },
    { id: 'acc_bank_charges', code: '5202', name: 'المصروفات والعمولات البنكية', type: 'expense', isSystem: true },
    { id: 'acc_adj', code: '5301', name: 'فروق وعجز تسويات الجرد', type: 'expense', isSystem: true },
    { id: 'acc_dep_exp', code: '5401', name: 'مصروف إهلاك الأصول الثابتة', type: 'expense', isSystem: true },
    { id: 'acc_forex_gain_loss', code: '5501', name: 'أرباح وخسائر فروق أسعار العملات', type: 'expense', isSystem: true }
  ];
}

export function defaultCurrencies(baseCurrencySymbol: string = 'ج.م'): Currency[] {
  return [
    { id: 'curr_egp', code: 'EGP', name: 'الجنيه المصري', symbol: 'ج.م', rate: 1, isBase: baseCurrencySymbol === 'ج.م', lastUpdated: getTodayDate() },
    { id: 'curr_usd', code: 'USD', name: 'الدولار الأمريكي', symbol: '$', rate: 48.5, isBase: baseCurrencySymbol === '$', lastUpdated: getTodayDate() },
    { id: 'curr_sar', code: 'SAR', name: 'الريال السعودي', symbol: 'ر.س', rate: 12.9, isBase: baseCurrencySymbol === 'ر.س', lastUpdated: getTodayDate() },
    { id: 'curr_eur', code: 'EUR', name: 'اليورو الأوروبي', symbol: '€', rate: 52.8, isBase: baseCurrencySymbol === '€', lastUpdated: getTodayDate() },
    { id: 'curr_aed', code: 'AED', name: 'الدرهم الإماراتي', symbol: 'د.إ', rate: 13.2, isBase: baseCurrencySymbol === 'د.إ', lastUpdated: getTodayDate() },
    { id: 'curr_kwd', code: 'KWD', name: 'الدينار الكويتي', symbol: 'د.ك', rate: 158.0, isBase: baseCurrencySymbol === 'د.ك', lastUpdated: getTodayDate() }
  ];
}

export function defaultSettings(): AppSettings {
  return {
    company: 'شركة الموان',
    companyCode: 'COMP-102',
    companyPin: '2919',
    phone: '',
    address: 'المقر الرئيسي',
    currency: 'ج.م',
    invoiceTitle: 'بيان',
    low: 5,
    cost: 'average',
    tax: 'disabled',
    taxRate: 14,
    notes: 'البضاعة المباعة ترد وتستبدل خلال 14 يوماً وفقاً لحالتها الأصلية',
    nextSale: 1,
    nextPurchase: 1,
    nextReceipt: 1,
    nextPayment: 1,
    nextQuote: 1,
    nextOrder: 1
  };
}

export function defaultBranches(): Branch[] {
  return [
    { id: 'br_mawan', name: 'الفرع الرئيسي - شركة الموان', code: 'BR-01', isMain: true, pin: '2919' }
  ];
}

export function isBranchMawan(b: Branch | null | undefined): boolean {
  return true;
}

export function isBranchEkhwa(b: Branch | null | undefined): boolean {
  return false;
}

export function getBranchExpectedPin(b: Branch | null | undefined): string {
  if (!b) return '';
  if (isBranchMawan(b)) {
    if (b.pin && b.pin.trim() !== '' && b.pin.trim() !== '1234' && b.pin.trim() !== '1272000') {
      return b.pin.trim();
    }
    return '2919';
  }
  return (b.pin || '1234').trim();
}

/**
 * Helper to determine if an identifier belongs to شركة الموان
 */
export function isCompanyMawan(identifier?: string | null): boolean {
  if (!identifier) return false;
  const clean = identifier.trim().toLowerCase();
  return clean === 'comp_mawan' ||
         clean === 'comp-102' ||
         clean === '102' ||
         clean.includes('mawan') ||
         clean.includes('الموان');
}

/**
 * Sanitizes and enforces 100% strict isolation for a company database:
 * - شركة الأخوة: contains ONLY الأخوة users, warehouse, and branches. Never shows Mawan users!
 * - شركة الموان: contains ONLY الموان users, warehouse, and branches. Never shows الأخوة users!
 * - Manager can edit company PIN in settings (defaults: 1234 for الأخوة, 2919 for الموان).
 */
export function sanitizeCompanyDatabase(db: AccountingDB, _identifier?: string): AccountingDB {
  if (!db) return db;

  // ==========================================
  // 🏢 شركة الموان (COMP-102) - النظام مخصص حصرياً لشركة الموان
  // ==========================================
  db.settings.company = 'شركة الموان';
  db.settings.companyCode = 'COMP-102';
  db.settings.invoiceTitle = db.settings.invoiceTitle || 'بيان';
  if (!db.settings.companyPin || db.settings.companyPin === '1234' || db.settings.companyPin === '1272000') {
    db.settings.companyPin = '2919';
  }

  // Enforce Generation 2 clean state (system fully purged of all past sample/merged items and invoices)
  if (db.cleanGeneration !== 2) {
    db.products = [];
    db.invoices = [];
    db.vouchers = [];
    db.stockMovements = [];
    db.returns = [];
    db.adjustments = [];
    db.transfers = [];
    db.treasury = [];
    db.journals = [];
    db.quotes = [];
    db.orders = [];
    db.customers = [];
    db.suppliers = [];
    db.settings.nextPurchase = 1;
    db.settings.nextSale = 1;
    db.settings.nextPayment = 1;
    db.settings.nextReceipt = 1;
    db.settings.nextQuote = 1;
    db.settings.nextOrder = 1;
    db.cleanGeneration = 2;
  }

  if (!db.users) db.users = [];

  // Filter out any stale dummy placeholders
  db.users = db.users.filter(u => u.username !== 'mawan' && u.username !== 'mawan_admin' && u.username !== 'admin');

  // Clean up and ensure actual managers of شركة الموان
  for (const u of db.users) {
    if (u.username === 'mohamed nazih' || u.username === 'mohamednazih' || u.name?.includes('محمد')) {
      u.name = 'Mohamed Nazih';
      u.role = 'مدير';
      u.branchId = 'br_mawan';
      u.branchName = 'الفرع الرئيسي - شركة الموان';
    } else if (u.username === 'ahmed nazih' || u.username === 'ahmednazih' || u.name?.includes('أحمد')) {
      u.name = 'Ahmed Nazih';
      u.role = 'مدير';
      u.branchId = 'br_mawan';
      u.branchName = 'الفرع الرئيسي - شركة الموان';
    }
  }

  const seenUsers = new Set<string>();
  const cleanUsers: User[] = [];
  for (const u of db.users) {
    const key = (u.username || u.name || u.id).toLowerCase();
    if (!seenUsers.has(key)) {
      seenUsers.add(key);
      cleanUsers.push(u);
    }
  }

  // Ensure both Ahmed Nazih and Mohamed Nazih exist
  if (!cleanUsers.some(u => u.name === 'Mohamed Nazih' || u.username === 'mohamed nazih')) {
    cleanUsers.push({
      id: 'usr_mvnj47xi',
      name: 'Mohamed Nazih',
      username: 'mohamed nazih',
      password: '1272',
      role: 'مدير',
      branchId: 'br_mawan',
      branchName: 'الفرع الرئيسي - شركة الموان',
      active: true
    });
  }
  if (!cleanUsers.some(u => u.name === 'Ahmed Nazih' || u.username === 'ahmed nazih')) {
    cleanUsers.push({
      id: 'usr_mvnj6i7d_vhlqh',
      name: 'Ahmed Nazih',
      username: 'ahmed nazih',
      password: '1234',
      role: 'مدير',
      branchId: 'br_mawan',
      branchName: 'الفرع الرئيسي - شركة الموان',
      active: true
    });
  }

  db.users = cleanUsers;

  // Single unified branch: الفرع الرئيسي - شركة الموان
  db.branches = [
    {
      id: 'br_mawan',
      name: 'الفرع الرئيسي - شركة الموان',
      code: 'BR-01',
      isMain: true,
      pin: db.settings.companyPin || '2919'
    }
  ];

  // Warehouses for شركة الموان
  if (!db.warehouses || db.warehouses.length === 0 || !db.warehouses.some(w => w.id === 'wh_mawan')) {
    db.warehouses = [
      {
        id: 'wh_mawan',
        name: 'مخزن شركة الموان الرئيسي',
        location: 'المقر الرئيسي',
        isDefault: true
      }
    ];
  }

  // Default currentUser
  if (!db.currentUser || !db.users.some(u => u.id === db.currentUser.id)) {
    db.currentUser = db.users[0];
  }

  // Strictly purge all Ekhwa invoices and their vouchers/movements from local state
  if (db.invoices) {
    db.invoices = db.invoices.filter(i => {
      if (!i) return false;
      if (PURGED_EKHWA_INVOICE_IDS.has(i.id)) return false;
      if (i.partyName === 'شركة السلاب' || i.partyName === 'محل الفتح عنابة' || i.partyName === 'شركة عطاالله للإستيراد' || i.partyName === 'محل المهندس التجمع الأول' || i.partyName === 'محل تيجر عنابة' || i.partyName === 'شركة Zak' || i.partyName === 'شركة الرحمة للحدايد والبويات') return false;
      return true;
    });
  }

  if (db.vouchers) {
    db.vouchers = db.vouchers.filter(v => {
      if (!v) return false;
      if (v.invoiceId && PURGED_EKHWA_INVOICE_IDS.has(v.invoiceId)) return false;
      if (v.partyName === 'شركة السلاب' || v.partyName === 'محل الفتح عنابة' || v.partyName === 'شركة عطاالله للإستيراد' || v.partyName === 'محل المهندس التجمع الأول' || v.partyName === 'محل تيجر عنابة' || v.partyName === 'شركة Zak' || v.partyName === 'شركة الرحمة للحدايد والبويات') return false;
      return true;
    });
  }

  if (db.stockMovements) {
    db.stockMovements = db.stockMovements.filter(sm => !sm.sourceId || !PURGED_EKHWA_INVOICE_IDS.has(sm.sourceId));
  }
  if (db.treasury) {
    db.treasury = db.treasury.filter(tr => !tr.sourceId || !PURGED_EKHWA_INVOICE_IDS.has(tr.sourceId));
  }
  if (db.journals) {
    db.journals = db.journals.filter(j => !j.sourceId || !PURGED_EKHWA_INVOICE_IDS.has(j.sourceId));
  }

  // Retroactively ensure all invoices with payments match their linked vouchers down to the millimeter
  if (db.invoices && db.invoices.length > 0) {
    db = syncAllExistingInvoiceVouchers(db).db;
  }

  return db;
}

/**
 * Ensures strict company sanitization across the applet
 */
export function ensurePrimaryBranches(db: AccountingDB): AccountingDB {
  return sanitizeCompanyDatabase(db);
}

/**
 * Cleans the system completely from any test/demo movements, invoices, reports, products, customers, and suppliers
 */
export function cleanAllDemoTransactions(db: AccountingDB): AccountingDB {
  return {
    ...db,
    version: 6,
    products: [],
    customers: [],
    suppliers: [],
    invoices: [],
    returns: [],
    stockMovements: [],
    treasury: [],
    vouchers: [],
    expenses: [],
    revenues: [],
    journals: [],
    quotes: [],
    orders: [],
    transfers: [],
    adjustments: [],
    periods: [
      { id: 'per_current', name: 'السنة المالية الحالية', from: `${new Date().getFullYear()}-01-01`, to: `${new Date().getFullYear()}-12-31`, status: 'مفتوح' }
    ],
    costCenters: db.costCenters || [],
    currencies: db.currencies && db.currencies.length > 0 ? db.currencies : defaultCurrencies(),
    fixedAssets: db.fixedAssets || [],
    bankReconciliations: db.bankReconciliations || [],
    goodsReceivedNotes: db.goodsReceivedNotes || [],
    settings: {
      ...db.settings,
      nextSale: 1001,
      nextPurchase: 2001,
      nextReceipt: 3001,
      nextPayment: 4001,
      nextQuote: 5001,
      nextOrder: 6001,
      nextGRN: 7001
    },
    audit: [
      {
        id: generateId('au'),
        at: new Date().toISOString(),
        user: db.currentUser?.name || 'مدير النظام',
        action: 'تفريغ وتصفير النظام الشامل',
        detail: 'تم تصفير وتنظيف النظام بالكامل من كافة الأصناف والعملاء والموردين والحركات والفواتير والتقارير التجريبية وتجهيزه للعمل الفعلي'
      }
    ]
  };
}

export function createSeedData(
  companyName?: string,
  currency: string = 'ج.م',
  adminUser?: { name: string; username: string }
): AccountingDB {
  const settings = defaultSettings();
  if (companyName) {
    settings.company = companyName;
    settings.invoiceTitle = companyName;
  }
  if (currency) {
    settings.currency = currency;
  }

  const accounts = defaultAccounts();
  const whId = 'wh_main';
  const warehouses: Warehouse[] = [
    { id: whId, name: 'المخزن الرئيسي', location: 'المقر الرئيسي', isDefault: true },
    { id: 'wh_branch', name: 'مخزن الفرع', location: 'الفرع الإضافي', isDefault: false }
  ];

  const products: Product[] = JSON.parse(JSON.stringify(DEFAULT_CATALOG_1001));
  const customers: Party[] = [];
  const suppliers: Party[] = [];

  const adminName = adminUser?.name || 'مدير المنشأة';
  const adminUsername = adminUser?.username || 'admin';

  const audit: AuditLog[] = [
    {
      id: 'au_init',
      at: new Date().toISOString(),
      user: adminName,
      action: 'تهيئة مساحة العمل المستقلة',
      detail: `تم تأسيس قاعدة بيانات نظيفة ومعزولة بالكامل لمنشأة "${settings.company}" وتثبيت دليل الحسابات القياسي للعمل الفعلي مباشرة`
    }
  ];

  const users: User[] = [
    { id: `usr_${Date.now().toString(36)}`, name: adminName, username: adminUsername, role: 'مدير' as const, active: true }
  ];

  return ensurePrimaryBranches({
    version: 6,
    settings,
    users,
    currentUser: users[0],
    products,
    warehouses,
    customers,
    suppliers,
    invoices: [],
    returns: [],
    stockMovements: [],
    treasury: [],
    vouchers: [],
    expenses: [],
    revenues: [],
    accounts,
    journals: [],
    quotes: [],
    orders: [],
    transfers: [],
    adjustments: [],
    periods: [
      { id: 'per_current', name: 'السنة المالية الحالية', from: `${new Date().getFullYear()}-01-01`, to: `${new Date().getFullYear()}-12-31`, status: 'مفتوح' }
    ],
    costCenters: [],
    currencies: defaultCurrencies(currency),
    fixedAssets: [],
    bankReconciliations: [],
    goodsReceivedNotes: [],
    dailyClosings: [],
    branches: defaultBranches(),
    audit
  });
}

/**
 * Loads accounting database for a specific tenant / company (100% data isolation)
 */
export function loadTenantDatabase(tenantId: string): AccountingDB {
  const isMawan = isCompanyMawan(tenantId);
  const normalizedTenantId = isMawan ? 'comp_mawan' : (tenantId === 'comp_primary' ? 'comp_ekhwa' : tenantId);
  const tenant = getCompanyTenant(normalizedTenantId);
  const storageKey = getTenantStorageKey(normalizedTenantId);

  try {
    let raw = localStorage.getItem(storageKey);

    // If loading comp_ekhwa and not found in its key, check legacy keys to preserve all existing work!
    if (!raw && !isMawan) {
      const legacyRaw = localStorage.getItem('hesabaty_tenant_db_comp_primary') || localStorage.getItem(STORAGE_KEY);
      if (legacyRaw) {
        raw = legacyRaw;
      }
    }

    if (!raw) {
      // Initialize fresh, isolated seed data for this specific company
      const companyName = isMawan ? 'شركة الموان' : (tenant?.name || 'شركة الأخوة');
      const adminName = isMawan ? 'مدير شركة الموان' : 'مدير شركة الأخوة';
      const adminUsername = isMawan ? 'mawan_admin' : 'admin';

      let initial = createSeedData(
        companyName,
        tenant?.currency || 'ج.م',
        { name: adminName, username: adminUsername }
      );
      initial = sanitizeCompanyDatabase(initial, normalizedTenantId);
      saveTenantDatabase(normalizedTenantId, initial);
      return initial;
    }

    let parsed = JSON.parse(raw);
    if (!parsed || parsed.version < 6 || !Array.isArray(parsed.products) || !Array.isArray(parsed.accounts)) {
      const companyName = isMawan ? 'شركة الموان' : (tenant?.name || 'شركة الأخوة');
      const adminName = isMawan ? 'مدير شركة الموان' : 'مدير شركة الأخوة';
      const adminUsername = isMawan ? 'mawan_admin' : 'admin';

      let initial = createSeedData(companyName, tenant?.currency, { name: adminName, username: adminUsername });
      initial = sanitizeCompanyDatabase(initial, normalizedTenantId);
      saveTenantDatabase(normalizedTenantId, initial);
      return initial;
    }

    // Ensure modern arrays and structure
    if (!parsed.costCenters) parsed.costCenters = [];
    if (!parsed.currencies || parsed.currencies.length === 0) parsed.currencies = defaultCurrencies(parsed.settings?.currency || 'ج.م');
    if (!parsed.fixedAssets) parsed.fixedAssets = [];
    if (!parsed.bankReconciliations) parsed.bankReconciliations = [];
    if (!parsed.goodsReceivedNotes) parsed.goodsReceivedNotes = [];
    if (!parsed.dailyClosings) parsed.dailyClosings = [];

    // Strictly sanitize by company: users, PINs, branches, and warehouses
    parsed = sanitizeCompanyDatabase(parsed, normalizedTenantId);
    if (!parsed.settings.nextGRN) parsed.settings.nextGRN = 7001;

    // Guarantee default accounts exist
    const currentAccountIds = new Set(parsed.accounts.map((a: Account) => a.id));
    defaultAccounts().forEach(defAcc => {
      if (!currentAccountIds.has(defAcc.id)) {
        parsed.accounts.push(defAcc);
      }
    });

    // Ensure catalog of 1001 products is populated
    if (parsed.products.length < 1000) {
      const merged = mergeCatalogIntoDb(parsed);
      const readyDb = sanitizeCompanyDatabase(merged.db, normalizedTenantId);
      saveTenantDatabase(normalizedTenantId, readyDb);
      return readyDb;
    }

    // Save back sanitized database
    saveTenantDatabase(normalizedTenantId, parsed);
    return parsed;
  } catch (err) {
    console.error(`Failed to load tenant database for ${tenantId}:`, err);
    const initial = sanitizeCompanyDatabase(createSeedData(tenant?.name, tenant?.currency), normalizedTenantId);
    saveTenantDatabase(normalizedTenantId, initial);
    return initial;
  }
}

/**
 * Saves accounting database for a specific tenant / company (100% data isolation)
 */
export function saveTenantDatabase(tenantId: string, db: AccountingDB): void {
  const storageKey = getTenantStorageKey(tenantId);
  const idbKey = getTenantIdbKey(tenantId);

  // Asynchronously store in IndexedDB
  saveToIndexedDB(db, idbKey);

  try {
    localStorage.setItem(storageKey, JSON.stringify(db));
  } catch (err) {
    console.warn(`localStorage size limit reached for tenant ${tenantId}, data safely in IndexedDB:`, err);
  }
}

export function loadDatabase(): AccountingDB {
  const activeTenantId = getActiveTenantId();
  if (activeTenantId) {
    const tenantDb = loadTenantDatabase(activeTenantId);
    if (tenantDb) return tenantDb;
  }

  // If no active tenant, check if we have any registered companies
  const companies = getCompaniesList();
  if (companies.length > 0) {
    // Look for any tenant that already has saved data
    for (const comp of companies) {
      try {
        const raw = localStorage.getItem(getTenantStorageKey(comp.id));
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.accounts) && (parsed.invoices?.length > 0 || parsed.products?.length > 0)) {
            setActiveTenantId(comp.id);
            return loadTenantDatabase(comp.id);
          }
        }
      } catch (e) {}
    }
    const firstCompany = companies[0];
    setActiveTenantId(firstCompany.id);
    return loadTenantDatabase(firstCompany.id);
  }

  // Check if primary database exists
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.accounts)) {
        if (parsed.products && parsed.products.length < 1000) {
          const merged = mergeCatalogIntoDb(parsed);
          parsed.products = merged.db.products;
        }
        const companyName = parsed.settings?.company || 'المنشأة الرئيسية';
        const primaryTenant = registerCompany({
          name: companyName,
          adminName: parsed.currentUser?.name || 'مدير المنشأة',
          adminUsername: parsed.currentUser?.username || 'admin',
          currency: parsed.settings?.currency || 'ج.م'
        });
        setActiveTenantId(primaryTenant.id);
        saveTenantDatabase(primaryTenant.id, parsed);
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Primary database load note:', e);
  }

  // Default: Return pristine initial seed data
  const initial = createSeedData();
  saveDatabase(initial);
  return initial;
}

export function saveDatabase(db: AccountingDB): void {
  const activeTenantId = getActiveTenantId();
  if (activeTenantId) {
    saveTenantDatabase(activeTenantId, db);
  }

  // Always save a primary fallback copy to ensure no data is ever lost between sessions
  saveToIndexedDB(db, IDB_KEY);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (err) {
    console.warn('localStorage limit notice:', err);
  }
}

export function logAudit(db: AccountingDB, action: string, detail: string = ''): void {
  db.audit.unshift({
    id: generateId('au'),
    at: new Date().toISOString(),
    user: db.currentUser?.name || 'مدير النظام',
    action,
    detail
  });
  if (db.audit.length > 2000) {
    db.audit = db.audit.slice(0, 2000);
  }
}

/**
 * Recalculate customer balance:
 * Opening balance + sum of unpaid sales (total - paid) - receipts - sale returns
 * Optionally filtered for a specific branch
 */
export function calculateCustomerBalance(db: AccountingDB, customerId: string, branchId?: string): number {
  const cust = db.customers.find(c => c.id === customerId);
  if (!cust) return 0;
  let balance = branchId ? 0 : (Number(cust.openingBalance) || 0);

  // Add unpaid sale invoice portions
  db.invoices.forEach(inv => {
    if (inv.type === 'sale' && inv.partyId === customerId) {
      if (!branchId || (inv.branchId === branchId || (!inv.branchId && branchId === 'br_main'))) {
        balance += (Number(inv.total) - Number(inv.paid));
      }
    }
  });

  // Subtract receipts (only standalone vouchers, as invoice remaining already deducts invoice.paid)
  db.vouchers.forEach(v => {
    if (v.type === 'receipt' && v.partyId === customerId) {
      const isInvoiceLinked = Boolean(v.invoiceId || (v.referenceNumber && db.invoices.some(i => i.number === v.referenceNumber)));
      if (!isInvoiceLinked) {
        if (!branchId || (v.branchId === branchId || (!v.branchId && branchId === 'br_main'))) {
          balance -= Number(v.amount);
        }
      }
    }
  });

  // Subtract sale returns
  db.returns.forEach(r => {
    if (r.type === 'sale' && r.partyId === customerId) {
      if (r.paymentMethod === 'آجل') {
        if (!branchId || (r.branchId === branchId || (!r.branchId && branchId === 'br_main'))) {
          balance -= Number(r.total);
        }
      }
    }
  });

  return balance;
}

/**
 * Recalculate supplier balance:
 * Opening balance + sum of unpaid purchases (total - paid) - payments - purchase returns
 * Optionally filtered for a specific branch
 */
export function calculateSupplierBalance(db: AccountingDB, supplierId: string, branchId?: string): number {
  const supp = db.suppliers.find(s => s.id === supplierId);
  if (!supp) return 0;
  let balance = branchId ? 0 : (Number(supp.openingBalance) || 0);

  // Add unpaid purchase invoice portions
  db.invoices.forEach(inv => {
    if (inv.type === 'purchase' && inv.partyId === supplierId) {
      if (!branchId || (inv.branchId === branchId || (!inv.branchId && branchId === 'br_main'))) {
        balance += (Number(inv.total) - Number(inv.paid));
      }
    }
  });

  // Subtract payments (only standalone vouchers, as invoice remaining already deducts invoice.paid)
  db.vouchers.forEach(v => {
    if (v.type === 'payment' && v.partyId === supplierId) {
      const isInvoiceLinked = Boolean(v.invoiceId || (v.referenceNumber && db.invoices.some(i => i.number === v.referenceNumber)));
      if (!isInvoiceLinked) {
        if (!branchId || (v.branchId === branchId || (!v.branchId && branchId === 'br_main'))) {
          balance -= Number(v.amount);
        }
      }
    }
  });

  // Subtract purchase returns
  db.returns.forEach(r => {
    if (r.type === 'purchase' && r.partyId === supplierId) {
      if (r.paymentMethod === 'آجل') {
        if (!branchId || (r.branchId === branchId || (!r.branchId && branchId === 'br_main'))) {
          balance -= Number(r.total);
        }
      }
    }
  });

  return balance;
}

/**
 * Calculate total treasury balance for a specific payment method or all methods, optionally filtered by branch
 */
export function calculateTreasuryBalance(db: AccountingDB, method?: PaymentMethod, branchId?: string): number {
  return db.treasury
    .filter(entry => !method || entry.method === method)
    .filter(entry => !branchId || (entry.branchId === branchId || (!entry.branchId && branchId === 'br_main')))
    .reduce((sum, entry) => {
      const amt = Number(entry.amount) || 0;
      return sum + (entry.direction === 'in' ? amt : -amt);
    }, 0);
}

/**
 * Calculate total inventory valuation, optionally for a specific branch
 */
export function calculateInventoryValuation(db: AccountingDB, branchId?: string): number {
  return db.products.reduce((acc, p) => {
    const bp = branchId ? getProductForBranch(p, branchId) : p;
    const cost = db.settings.cost === 'last' ? bp.buyPrice : (bp.avgCost || bp.buyPrice);
    return acc + (bp.currentQty * cost);
  }, 0);
}

/**
 * Calculate Net Profit & Financial summary:
 * Sales Revenue - Cost of Goods Sold + Other Revenues - Expenses
 * Optionally filtered strictly for a branch:
 * "اريد كل فرع يكون مختص بذاته كليان بكل حركه وتقرير واموال ومخزون وكل شي"
 */
export function calculateFinancialSummary(db: AccountingDB, branchId?: string) {
  const today = getTodayDate();

  const isTargetBranch = (bId?: string) => {
    if (!branchId || branchId === 'all') return true;
    return bId === branchId || (!bId && branchId === 'br_main');
  };

  const branchInvoices = db.invoices.filter(i => isTargetBranch(i.branchId));
  const branchExpenses = db.expenses.filter(e => isTargetBranch(e.branchId));
  const branchRevenues = db.revenues.filter(r => isTargetBranch(r.branchId));

  const totalSalesAll = branchInvoices
    .filter(i => i.type === 'sale')
    .reduce((acc, i) => acc + i.total, 0);

  const salesToday = branchInvoices
    .filter(i => i.type === 'sale' && i.date === today)
    .reduce((acc, i) => acc + i.total, 0);

  const totalPurchasesAll = branchInvoices
    .filter(i => i.type === 'purchase')
    .reduce((acc, i) => acc + i.total, 0);

  const purchasesToday = branchInvoices
    .filter(i => i.type === 'purchase' && i.date === today)
    .reduce((acc, i) => acc + i.total, 0);

  const totalCOGS = branchInvoices
    .filter(i => i.type === 'sale')
    .reduce((acc, i) => {
      const invoiceCogs = i.items.reduce((s, it) => {
        const prod = db.products.find(p => p.id === it.productId || p.code === it.productCode);
        const bp = prod ? getProductForBranch(prod, i.branchId || 'br_mawan') : null;
        const unitCost = (it.costPrice && it.costPrice > 0)
          ? it.costPrice
          : (bp?.avgCost && bp.avgCost > 0 ? bp.avgCost : (bp?.buyPrice && bp.buyPrice > 0 ? bp.buyPrice : (prod?.buyPrice || 0)));
        return s + (it.qty * unitCost);
      }, 0);
      return acc + invoiceCogs;
    }, 0);

  const totalExpenses = branchExpenses.reduce((acc, e) => acc + e.amount, 0);
  const totalOtherRevenues = branchRevenues.reduce((acc, r) => acc + r.amount, 0);

  const grossProfit = totalSalesAll - totalCOGS;
  const netProfit = grossProfit + totalOtherRevenues - totalExpenses;

  const totalCustomerReceivables = db.customers.reduce((acc, c) => acc + Math.max(0, calculateCustomerBalance(db, c.id, branchId)), 0);
  const totalSupplierPayables = db.suppliers.reduce((acc, s) => acc + Math.max(0, calculateSupplierBalance(db, s.id, branchId)), 0);

  const totalTreasury = calculateTreasuryBalance(db, undefined, branchId);
  const totalStockValue = calculateInventoryValuation(db, branchId);
  
  const lowStockCount = db.products.filter(p => {
    const bp = branchId ? getProductForBranch(p, branchId) : p;
    return bp.minStock > 0 && bp.currentQty <= bp.minStock;
  }).length;

  return {
    salesToday,
    totalSalesAll,
    purchasesToday,
    totalPurchasesAll,
    totalCOGS,
    grossProfit,
    netProfit,
    totalExpenses,
    totalOtherRevenues,
    totalCustomerReceivables,
    totalSupplierPayables,
    totalTreasury,
    totalStockValue,
    lowStockCount,
    totalInvoicesCount: branchInvoices.length,
    totalProductsCount: db.products.length
  };
}

/**
 * Creates automated double-entry journal entry for an invoice
 */
export function createInvoiceJournal(db: AccountingDB, invoice: Invoice): JournalEntry {
  const isSale = invoice.type === 'sale';
  const isReturn = invoice.invoiceKind === 'sale_return' || invoice.invoiceKind === 'purchase_return';
  const lines: JournalLine[] = [];
  const jNum = `J-${Date.now().toString().slice(-6)}`;

  if (isSale && !isReturn) {
    // 1. Debit Cash/Bank accounts or AR for payments
    if (invoice.payments && invoice.payments.length > 0) {
      invoice.payments.forEach(p => {
        if (p.amount > 0) {
          const methodAccId = getMethodAccountId(p.method);
          const methodAcc = db.accounts.find(a => a.id === methodAccId) || db.accounts.find(a => a.id === 'acc_cash')!;
          lines.push({
            accountId: methodAcc.id,
            accountCode: methodAcc.code,
            accountName: methodAcc.name,
            debit: p.amount,
            credit: 0,
            notes: `تحصيل عبر: ${p.method}`
          });
        }
      });
      if (invoice.remaining > 0) {
        const arAcc = db.accounts.find(a => a.id === 'acc_ar')!;
        lines.push({
          accountId: arAcc.id,
          accountCode: arAcc.code,
          accountName: arAcc.name,
          debit: invoice.remaining,
          credit: 0,
          notes: `المتبقي آجل على العميل: ${invoice.partyName}`
        });
      }
    } else if (invoice.paymentMethod === 'آجل') {
      const arAcc = db.accounts.find(a => a.id === 'acc_ar')!;
      lines.push({
        accountId: arAcc.id,
        accountCode: arAcc.code,
        accountName: arAcc.name,
        debit: invoice.total,
        credit: 0,
        notes: `استحقاق على العميل: ${invoice.partyName}`
      });
    } else {
      const methodAccId = getMethodAccountId(invoice.paymentMethod);
      const methodAcc = db.accounts.find(a => a.id === methodAccId) || db.accounts.find(a => a.id === 'acc_cash')!;
      if (invoice.paid > 0) {
        lines.push({
          accountId: methodAcc.id,
          accountCode: methodAcc.code,
          accountName: methodAcc.name,
          debit: invoice.paid,
          credit: 0,
          notes: `تحصيل نقدي/إلكتروني: ${invoice.paymentMethod}`
        });
      }
      if (invoice.remaining > 0) {
        const arAcc = db.accounts.find(a => a.id === 'acc_ar')!;
        lines.push({
          accountId: arAcc.id,
          accountCode: arAcc.code,
          accountName: arAcc.name,
          debit: invoice.remaining,
          credit: 0,
          notes: `المتبقي آجل على العميل: ${invoice.partyName}`
        });
      }
    }

    // 2. Credit Sales Revenue & Extra Revenue
    const extra = Number(invoice.extraIncomeVal) || 0;
    const baseSalesCredit = Math.max(0, invoice.total - extra);
    const salesAcc = db.accounts.find(a => a.id === 'acc_sales')!;
    lines.push({
      accountId: salesAcc.id,
      accountCode: salesAcc.code,
      accountName: salesAcc.name,
      debit: 0,
      credit: baseSalesCredit,
      notes: `إيراد مبيعات فاتورة ${invoice.number}`
    });

    if (extra > 0) {
      const revAcc = db.accounts.find(a => a.id === 'acc_other_rev')!;
      lines.push({
        accountId: revAcc.id,
        accountCode: revAcc.code,
        accountName: revAcc.name,
        debit: 0,
        credit: extra,
        notes: `إيراد إضافي: ${invoice.extraIncomeName || 'خدمات/نقل'}`
      });
    }

    // 3. COGS & Inventory entry
    const cogsAmount = invoice.items.reduce((s, it) => s + (it.qty * (it.costPrice || 0)), 0);
    if (cogsAmount > 0) {
      const cogsAcc = db.accounts.find(a => a.id === 'acc_cogs')!;
      const invAcc = db.accounts.find(a => a.id === 'acc_inv')!;
      lines.push({
        accountId: cogsAcc.id,
        accountCode: cogsAcc.code,
        accountName: cogsAcc.name,
        debit: cogsAmount,
        credit: 0,
        notes: `تكلفة البضاعة المباعة لفاتورة ${invoice.number}`
      });
      lines.push({
        accountId: invAcc.id,
        accountCode: invAcc.code,
        accountName: invAcc.name,
        debit: 0,
        credit: cogsAmount,
        notes: `خروج بضاعة من المخزون`
      });
    }
  } else if (!isSale && !isReturn) {
    // PURCHASE INVOICE
    const invAcc = db.accounts.find(a => a.id === 'acc_inv')!;
    lines.push({
      accountId: invAcc.id,
      accountCode: invAcc.code,
      accountName: invAcc.name,
      debit: invoice.total,
      credit: 0,
      notes: `شراء بضاعة وإضافتها للمخزون - فاتورة ${invoice.number}`
    });

    if (invoice.payments && invoice.payments.length > 0) {
      invoice.payments.forEach(p => {
        if (p.amount > 0) {
          const methodAccId = getMethodAccountId(p.method);
          const methodAcc = db.accounts.find(a => a.id === methodAccId) || db.accounts.find(a => a.id === 'acc_cash')!;
          lines.push({
            accountId: methodAcc.id,
            accountCode: methodAcc.code,
            accountName: methodAcc.name,
            debit: 0,
            credit: p.amount,
            notes: `سداد للمورد عبر: ${p.method}`
          });
        }
      });
      if (invoice.remaining > 0) {
        const apAcc = db.accounts.find(a => a.id === 'acc_ap')!;
        lines.push({
          accountId: apAcc.id,
          accountCode: apAcc.code,
          accountName: apAcc.name,
          debit: 0,
          credit: invoice.remaining,
          notes: `المتبقي آجل للمورد: ${invoice.partyName}`
        });
      }
    } else if (invoice.paymentMethod === 'آجل') {
      const apAcc = db.accounts.find(a => a.id === 'acc_ap')!;
      lines.push({
        accountId: apAcc.id,
        accountCode: apAcc.code,
        accountName: apAcc.name,
        debit: 0,
        credit: invoice.total,
        notes: `استحقاق للمورد: ${invoice.partyName}`
      });
    } else {
      const methodAccId = getMethodAccountId(invoice.paymentMethod);
      const methodAcc = db.accounts.find(a => a.id === methodAccId) || db.accounts.find(a => a.id === 'acc_cash')!;
      if (invoice.paid > 0) {
        lines.push({
          accountId: methodAcc.id,
          accountCode: methodAcc.code,
          accountName: methodAcc.name,
          debit: 0,
          credit: invoice.paid,
          notes: `سداد للمورد بطريقة: ${invoice.paymentMethod}`
        });
      }
      if (invoice.remaining > 0) {
        const apAcc = db.accounts.find(a => a.id === 'acc_ap')!;
        lines.push({
          accountId: apAcc.id,
          accountCode: apAcc.code,
          accountName: apAcc.name,
          debit: 0,
          credit: invoice.remaining,
          notes: `المتبقي آجل للمورد: ${invoice.partyName}`
        });
      }
    }
  } else if (invoice.invoiceKind === 'sale_return') {
    // SALE RETURN
    const salesAcc = db.accounts.find(a => a.id === 'acc_sales')!;
    lines.push({
      accountId: salesAcc.id,
      accountCode: salesAcc.code,
      accountName: salesAcc.name,
      debit: invoice.total,
      credit: 0,
      notes: `مردودات مبيعات مرتجع ${invoice.number}`
    });
    const methodAccId = getMethodAccountId(invoice.paymentMethod);
    const creditAcc = invoice.paymentMethod === 'آجل'
      ? db.accounts.find(a => a.id === 'acc_ar')!
      : db.accounts.find(a => a.id === methodAccId) || db.accounts.find(a => a.id === 'acc_cash')!;
    lines.push({
      accountId: creditAcc.id,
      accountCode: creditAcc.code,
      accountName: creditAcc.name,
      debit: 0,
      credit: invoice.total,
      notes: `تسوية حساب العميل مرتجع ${invoice.number}`
    });

    const cogsAmount = invoice.items.reduce((s, it) => s + (it.qty * (it.costPrice || 0)), 0);
    if (cogsAmount > 0) {
      const invAcc = db.accounts.find(a => a.id === 'acc_inv')!;
      const cogsAcc = db.accounts.find(a => a.id === 'acc_cogs')!;
      lines.push({
        accountId: invAcc.id,
        accountCode: invAcc.code,
        accountName: invAcc.name,
        debit: cogsAmount,
        credit: 0,
        notes: `إرجاع بضاعة للمستودع`
      });
      lines.push({
        accountId: cogsAcc.id,
        accountCode: cogsAcc.code,
        accountName: cogsAcc.name,
        debit: 0,
        credit: cogsAmount,
        notes: `تخفيض تكلفة المبيعات`
      });
    }
  } else if (invoice.invoiceKind === 'purchase_return') {
    // PURCHASE RETURN
    const methodAccId = getMethodAccountId(invoice.paymentMethod);
    const debitAcc = invoice.paymentMethod === 'آجل'
      ? db.accounts.find(a => a.id === 'acc_ap')!
      : db.accounts.find(a => a.id === methodAccId) || db.accounts.find(a => a.id === 'acc_cash')!;
    lines.push({
      accountId: debitAcc.id,
      accountCode: debitAcc.code,
      accountName: debitAcc.name,
      debit: invoice.total,
      credit: 0,
      notes: `استرداد من المورد مرتجع ${invoice.number}`
    });
    const invAcc = db.accounts.find(a => a.id === 'acc_inv')!;
    lines.push({
      accountId: invAcc.id,
      accountCode: invAcc.code,
      accountName: invAcc.name,
      debit: 0,
      credit: invoice.total,
      notes: `خروج بضاعة مرتجعة للمورد`
    });
  }

  return {
    id: generateId('j'),
    number: jNum,
    date: invoice.date,
    description: isSale ? `فاتورة بيع رقم ${invoice.number} - ${invoice.partyName}` : `فاتورة شراء رقم ${invoice.number} - ${invoice.partyName}`,
    sourceType: invoice.type,
    sourceId: invoice.id,
    lines,
    createdAt: new Date().toISOString()
  };
}

/**
 * Creates double-entry journal for a Voucher (سند قبض أو صرف)
 */
export function createVoucherJournal(db: AccountingDB, voucher: Voucher): JournalEntry {
  const isReceipt = voucher.type === 'receipt';
  const jNum = `J-${Date.now().toString().slice(-6)}`;
  const lines: JournalLine[] = [];

  const methodAccId = getMethodAccountId(voucher.paymentMethod);
  const methodAcc = db.accounts.find(a => a.id === methodAccId) || db.accounts.find(a => a.id === 'acc_cash')!;

  if (isReceipt) {
    // سند قبض: من حـ/ الخزينة أو البنك (مدين) إلى حـ/ العملاء (دائن)
    const arAcc = db.accounts.find(a => a.id === 'acc_ar')!;
    lines.push({
      accountId: methodAcc.id,
      accountCode: methodAcc.code,
      accountName: methodAcc.name,
      debit: voucher.amount,
      credit: 0,
      notes: `قبض من العميل: ${voucher.partyName}`
    });
    lines.push({
      accountId: arAcc.id,
      accountCode: arAcc.code,
      accountName: arAcc.name,
      debit: 0,
      credit: voucher.amount,
      notes: `سداد حساب العميل: ${voucher.partyName}`
    });
  } else {
    // سند صرف: من حـ/ الموردين (مدين) إلى حـ/ الخزينة أو البنك (دائن)
    const apAcc = db.accounts.find(a => a.id === 'acc_ap')!;
    lines.push({
      accountId: apAcc.id,
      accountCode: apAcc.code,
      accountName: apAcc.name,
      debit: voucher.amount,
      credit: 0,
      notes: `صرف للمورد: ${voucher.partyName}`
    });
    lines.push({
      accountId: methodAcc.id,
      accountCode: methodAcc.code,
      accountName: methodAcc.name,
      debit: 0,
      credit: voucher.amount,
      notes: `سداد من الخزينة/البنك للمورد: ${voucher.partyName}`
    });
  }

  return {
    id: generateId('j'),
    number: jNum,
    date: voucher.date,
    description: isReceipt ? `سند قبض رقم ${voucher.number} من ${voucher.partyName}` : `سند صرف رقم ${voucher.number} إلى ${voucher.partyName}`,
    sourceType: voucher.type,
    sourceId: voucher.id,
    lines,
    createdAt: new Date().toISOString()
  };
}

/**
 * Retrieves the product data specialized for a specific branch.
 * Requirement:
 * "الاصناف تكون ايضا موجودة في كل الفروع لكن بدون اعداد واسعار ويتم ادخالهم حسب الفرع ولا يؤثرو علي اي فروع اخره، يبقي كل فرع لحاله"
 */
export function getProductForBranch(product: Product, branchId?: string): Product & { branchQty: number } {
  if (!product) return product;
  const targetBranch = branchId || 'br_main';

  // Check if branch-specific data is already defined
  if (product.branchesData && product.branchesData[targetBranch]) {
    const bData = product.branchesData[targetBranch];
    return {
      ...product,
      currentQty: bData.currentQty ?? 0,
      buyPrice: bData.buyPrice !== undefined && bData.buyPrice > 0 ? bData.buyPrice : (product.buyPrice || 0),
      sellPrice: bData.sellPrice !== undefined && bData.sellPrice > 0 ? bData.sellPrice : (product.sellPrice || 0),
      wholesalePrice: bData.wholesalePrice !== undefined && bData.wholesalePrice > 0 ? bData.wholesalePrice : (product.wholesalePrice || 0),
      minStock: bData.minStock ?? (product.minStock || 5),
      avgCost: bData.avgCost ?? (bData.buyPrice || product.avgCost || product.buyPrice || 0),
      branchQty: bData.currentQty ?? 0,
    };
  }

  // If this is a primary branch (br_main or br_mawan) and product hasn't migrated to branchesData yet:
  const isPrimaryBranch = targetBranch === 'br_main' || targetBranch === 'br_mawan' || !product.branchesData || Object.keys(product.branchesData).length === 0;
  if (isPrimaryBranch) {
    return {
      ...product,
      branchQty: product.currentQty ?? 0,
    };
  }

  // For any other branch without custom entered data yet:
  return {
    ...product,
    currentQty: 0,
    buyPrice: product.buyPrice || 0,
    sellPrice: product.sellPrice || 0,
    wholesalePrice: product.wholesalePrice || 0,
    minStock: product.minStock || 5,
    avgCost: product.avgCost || product.buyPrice || 0,
    branchQty: 0,
  };
}

/**
 * Updates a product's price and stock for a specific branch without affecting any other branch.
 */
export function updateProductBranchData(
  product: Product,
  branchId: string,
  updates: Partial<BranchProductData>
): Product {
  const targetBranch = branchId || 'br_main';
  const existingBranchesData = { ...(product.branchesData || {}) };
  const isPrimaryBranch = targetBranch === 'br_main' || targetBranch === 'br_mawan' || !product.branchesData || Object.keys(product.branchesData).length <= 1;

  // Current branch numbers (or initial product values for primary branches)
  const currentBranchData: BranchProductData = existingBranchesData[targetBranch] || {
    branchId: targetBranch,
    currentQty: isPrimaryBranch ? (product.currentQty || 0) : 0,
    buyPrice: isPrimaryBranch ? (product.buyPrice || 0) : 0,
    sellPrice: isPrimaryBranch ? (product.sellPrice || 0) : 0,
    wholesalePrice: isPrimaryBranch ? (product.wholesalePrice || 0) : 0,
    minStock: isPrimaryBranch ? (product.minStock || 5) : 5,
    avgCost: isPrimaryBranch ? (product.avgCost || product.buyPrice || 0) : 0,
  };

  const updatedBranchData: BranchProductData = {
    ...currentBranchData,
    ...updates,
  };

  existingBranchesData[targetBranch] = updatedBranchData;

  const updatedProduct: Product = {
    ...product,
    branchesData: existingBranchesData,
  };

  // If updating the primary branch, keep top-level fields mirrored for backwards compatibility
  if (isPrimaryBranch) {
    if (updatedBranchData.currentQty !== undefined) updatedProduct.currentQty = updatedBranchData.currentQty;
    if (updatedBranchData.buyPrice !== undefined) updatedProduct.buyPrice = updatedBranchData.buyPrice;
    if (updatedBranchData.sellPrice !== undefined) updatedProduct.sellPrice = updatedBranchData.sellPrice;
    if (updatedBranchData.wholesalePrice !== undefined) updatedProduct.wholesalePrice = updatedBranchData.wholesalePrice;
    if (updatedBranchData.minStock !== undefined) updatedProduct.minStock = updatedBranchData.minStock;
    if (updatedBranchData.avgCost !== undefined) updatedProduct.avgCost = updatedBranchData.avgCost;
  }

  return updatedProduct;
}

/**
 * Union & merge invoices safely by ID to prevent any loss across phones and concurrent updates
 */
export function isPurgedEkhwaInvoice(inv: Invoice | null | undefined): boolean {
  if (!inv || !inv.id) return true;
  if (PURGED_EKHWA_INVOICE_IDS.has(inv.id)) return true;
  const p = inv.partyName || '';
  if (
    p === 'شركة السلاب' ||
    p === 'محل الفتح عنابة' ||
    p === 'شركة عطاالله للإستيراد' ||
    p === 'محل المهندس التجمع الأول' ||
    p === 'محل تيجر عنابة' ||
    p === 'شركة Zak' ||
    p === 'شركة الرحمة للحدايد والبويات'
  ) {
    return true;
  }
  return false;
}

export function mergeInvoices(existingList: Invoice[] = [], incomingList: Invoice[] = []): Invoice[] {
  const map = new Map<string, Invoice>();
  (existingList || []).forEach(inv => {
    if (inv && inv.id && !isPurgedEkhwaInvoice(inv)) {
      map.set(inv.id, inv);
    }
  });
  (incomingList || []).forEach(inv => {
    if (inv && inv.id && !isPurgedEkhwaInvoice(inv)) {
      const existing = map.get(inv.id);
      if (!existing) {
        map.set(inv.id, inv);
      } else {
        const existingTime = new Date(existing.updatedAt || existing.createdAt || existing.date || 0).getTime();
        const incomingTime = new Date(inv.updatedAt || inv.createdAt || inv.date || 0).getTime();
        if (incomingTime >= existingTime) {
          map.set(inv.id, inv);
        }
      }
    }
  });
  return Array.from(map.values()).sort((a, b) => (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || ''));
}

/**
 * Union & merge vouchers safely by ID to prevent loss across phones
 */
export function mergeVouchers(existingList: Voucher[] = [], incomingList: Voucher[] = []): Voucher[] {
  const map = new Map<string, Voucher>();
  const isPurgedVoucher = (v: Voucher) => {
    if (!v || !v.id) return true;
    if (v.invoiceId && PURGED_EKHWA_INVOICE_IDS.has(v.invoiceId)) return true;
    const p = v.partyName || '';
    if (
      p === 'شركة السلاب' ||
      p === 'محل الفتح عنابة' ||
      p === 'شركة عطاالله للإستيراد' ||
      p === 'محل المهندس التجمع الأول' ||
      p === 'محل تيجر عنابة' ||
      p === 'شركة Zak' ||
      p === 'شركة الرحمة للحدايد والبويات'
    ) {
      return true;
    }
    return false;
  };

  (existingList || []).forEach(v => {
    if (v && v.id && !isPurgedVoucher(v)) {
      map.set(v.id, v);
    }
  });
  (incomingList || []).forEach(v => {
    if (v && v.id && !isPurgedVoucher(v)) {
      map.set(v.id, v);
    }
  });
  return Array.from(map.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

/**
 * Compute independent financial and inventory statistics for a specific branch.
 */
export function getBranchFinancialSummary(db: AccountingDB, branchId: string) {
  const targetBranch = branchId || 'br_main';

  // 1. Sales for this branch
  const branchSales = db.invoices.filter(inv => inv.type === 'sale' && (inv.branchId === targetBranch || (!inv.branchId && targetBranch === 'br_main')));
  const totalSales = branchSales.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
  const paidSales = branchSales.reduce((sum, inv) => sum + (Number(inv.paid) || 0), 0);
  const unpaidSales = branchSales.reduce((sum, inv) => sum + (Number(inv.remaining) || 0), 0);

  // 2. Purchases for this branch
  const branchPurchases = db.invoices.filter(inv => inv.type === 'purchase' && (inv.branchId === targetBranch || (!inv.branchId && targetBranch === 'br_main')));
  const totalPurchases = branchPurchases.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
  const paidPurchases = branchPurchases.reduce((sum, inv) => sum + (Number(inv.paid) || 0), 0);

  // 3. Vouchers for this branch
  const branchVouchers = db.vouchers.filter(v => v.branchId === targetBranch || (!v.branchId && targetBranch === 'br_main'));
  const receiptsTotal = branchVouchers.filter(v => v.type === 'receipt').reduce((sum, v) => sum + (Number(v.amount) || 0), 0);
  const paymentsTotal = branchVouchers.filter(v => v.type === 'payment').reduce((sum, v) => sum + (Number(v.amount) || 0), 0);

  // 4. Expenses & Revenues for this branch
  const branchExpenses = db.expenses.filter(e => e.branchId === targetBranch || (!e.branchId && targetBranch === 'br_main'));
  const totalExpenses = branchExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const branchRevenues = db.revenues.filter(r => r.branchId === targetBranch || (!r.branchId && targetBranch === 'br_main'));
  const totalRevenues = branchRevenues.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  // 5. Cash balance in this branch:
  // (Paid cash sales + receipts + revenues) - (Paid cash purchases + payments + expenses)
  const cashSalesPaid = branchSales.filter(inv => inv.paymentMethod === 'نقدي').reduce((sum, inv) => sum + (Number(inv.paid) || 0), 0);
  const cashPurchasesPaid = branchPurchases.filter(inv => inv.paymentMethod === 'نقدي').reduce((sum, inv) => sum + (Number(inv.paid) || 0), 0);
  const cashReceipts = branchVouchers.filter(v => v.type === 'receipt' && v.paymentMethod === 'نقدي').reduce((sum, v) => sum + (Number(v.amount) || 0), 0);
  const cashPayments = branchVouchers.filter(v => v.type === 'payment' && v.paymentMethod === 'نقدي').reduce((sum, v) => sum + (Number(v.amount) || 0), 0);
  const cashExpenses = branchExpenses.filter(e => e.method === 'نقدي').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const cashRevenues = branchRevenues.filter(r => r.method === 'نقدي').reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const cashBalance = (cashSalesPaid + cashReceipts + cashRevenues) - (cashPurchasesPaid + cashPayments + cashExpenses);

  // 6. Branch Inventory
  let inStockCount = 0;
  let zeroStockCount = 0;
  let lowStockCount = 0;
  let totalStockValue = 0;

  db.products.forEach(p => {
    const bp = getProductForBranch(p, targetBranch);
    if (bp.currentQty > 0) {
      inStockCount++;
      if (bp.currentQty <= bp.minStock) lowStockCount++;
      totalStockValue += bp.currentQty * (bp.avgCost || bp.buyPrice || 0);
    } else {
      zeroStockCount++;
    }
  });

  return {
    totalSales,
    paidSales,
    unpaidSales,
    totalPurchases,
    paidPurchases,
    receiptsTotal,
    paymentsTotal,
    totalExpenses,
    totalRevenues,
    cashBalance,
    inStockCount,
    zeroStockCount,
    lowStockCount,
    totalStockValue,
    invoicesCount: branchSales.length + branchPurchases.length,
  };
}

/**
 * Deletes an invoice and fully reverts all its inventory, accounting, treasury, and balance effects:
 * - Returns stock to products in the exact invoice branch
 * - Removes stock movements
 * - Removes treasury movements
 * - Removes double-entry journal entries
 * - Removes return items (if return invoice)
 * - Updates party (customer/supplier) balance
 * - Logs comprehensive audit trail
 */
export function deleteInvoiceAndRevert(db: AccountingDB, invoice: Invoice): AccountingDB {
  const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
  const targetBranch = invoice.branchId || 'br_main';

  // 1. Revert stock for each item in the invoice's branch
  invoice.items.forEach(oldItem => {
    const prod = updated.products.find(p => p.id === oldItem.productId || p.code === oldItem.productCode);
    if (prod) {
      const bp = getProductForBranch(prod, targetBranch);
      let revertedQty = bp.currentQty;

      if (invoice.type === 'sale' || invoice.invoiceKind === 'sale' || invoice.invoiceKind === 'wholesale') {
        // Sale had subtracted items -> add them back to inventory
        revertedQty += oldItem.qty;
      } else if (invoice.type === 'purchase' || invoice.invoiceKind === 'purchase') {
        // Purchase had added items -> subtract them from inventory
        revertedQty -= oldItem.qty;
      } else if (invoice.invoiceKind === 'sale_return') {
        // Sale return had added items -> subtract them from inventory
        revertedQty -= oldItem.qty;
      } else if (invoice.invoiceKind === 'purchase_return') {
        // Purchase return had returned items -> add them back to inventory
        revertedQty += oldItem.qty;
      }

      const updatedProd = updateProductBranchData(prod, targetBranch, { currentQty: revertedQty });
      const pIdx = updated.products.findIndex(p => p.id === prod.id);
      if (pIdx > -1) {
        updated.products[pIdx] = updatedProd;
      }
    }
  });

  // 2. Remove related stock movements
  updated.stockMovements = updated.stockMovements.filter(
    sm => sm.sourceId !== invoice.id && sm.refNumber !== invoice.number
  );

  // 3. Remove treasury entries
  updated.treasury = updated.treasury.filter(tr => tr.sourceId !== invoice.id);

  // 4. Remove journal entry
  updated.journals = updated.journals.filter(
    j => j.sourceId !== invoice.id && j.id !== invoice.journalEntryId
  );

  // 5. Remove any return entries
  if (updated.returns) {
    updated.returns = updated.returns.filter(
      r => r.originalInvoiceId !== invoice.id && r.number !== invoice.number
    );
  }

  // 5.5. Remove any linked payment/receipt vouchers created for this invoice and their journals
  const linkedVoucherIds = new Set<string>();
  if (updated.vouchers) {
    updated.vouchers = updated.vouchers.filter(v => {
      const isLinked = (v as any).sourceId === invoice.id ||
                       (v as any).referenceNumber === invoice.number ||
                       (v as any).invoiceId === invoice.id ||
                       (v.description && v.description.includes(invoice.number));
      if (isLinked) {
        linkedVoucherIds.add(v.id);
        return false;
      }
      return true;
    });

    if (linkedVoucherIds.size > 0) {
      // Remove journal entries belonging to the deleted vouchers
      updated.journals = updated.journals.filter(
        j => !linkedVoucherIds.has(j.sourceId || '') && !linkedVoucherIds.has(j.id)
      );
      // Remove treasury records belonging to the deleted vouchers
      updated.treasury = updated.treasury.filter(
        tr => !linkedVoucherIds.has(tr.sourceId || '') && !linkedVoucherIds.has(tr.id)
      );
    }
  }

  // 6. Remove the invoice itself
  updated.invoices = updated.invoices.filter(i => i.id !== invoice.id);

  // 7. Update party balance if party exists
  if (invoice.partyId) {
    const cust = updated.customers.find(c => c.id === invoice.partyId);
    if (cust) {
      cust.balance = calculateCustomerBalance(updated, cust.id);
    }
    const supp = updated.suppliers.find(s => s.id === invoice.partyId);
    if (supp) {
      supp.balance = calculateSupplierBalance(updated, supp.id);
    }
  }

  // 8. Log audit trail
  const invTypeName = invoice.type === 'purchase' ? 'فاتورة شراء' : 'فاتورة بيع';
  logAudit(
    updated,
    `حذف ${invTypeName} وعكس التأثير بالكامل`,
    `تم حذف الفاتورة ${invoice.number} وعكس المخزون (${invoice.items.length} أصناف) والخزينة والقيود المحاسبية والأرصدة بالكامل`
  );

  return updated;
}

/**
 * Strict Duplicate Prevention Helpers
 * Ensures no duplicate invoice numbers, vouchers, customers, suppliers, products, or codes across the entire ERP.
 */
export function isDuplicateInvoiceNumber(db: AccountingDB, number: string, excludeId?: string, mode?: string): boolean {
  if (!number || !number.trim()) return false;
  const target = number.trim();
  const isPurchaseMode = mode === 'purchase' || mode === 'purchase_return';
  return (db.invoices || []).some(inv => {
    if (excludeId && inv.id === excludeId) return false;
    const isInvPurchase = inv.type === 'purchase' || inv.invoiceKind === 'purchase' || inv.invoiceKind === 'purchase_return';
    if (mode && isPurchaseMode !== isInvPurchase) return false;
    return String(inv.number).trim() === target;
  });
}

export function getNextUniqueInvoiceNumber(db: AccountingDB, mode?: string): { number: string; nextSeq: number } {
  // Pure integer numbering starting from 1 with NO letter prefixes, independent per section
  const isPurchaseMode = mode === 'purchase' || mode === 'purchase_return';
  const sectionInvoices = (db.invoices || []).filter(inv => {
    const isInvPurchase = inv.type === 'purchase' || inv.invoiceKind === 'purchase' || inv.invoiceKind === 'purchase_return';
    return isPurchaseMode ? isInvPurchase : !isInvPurchase;
  });

  let maxSeq = 0;
  sectionInvoices.forEach(inv => {
    const raw = String(inv.number || '').trim();
    const digits = raw.replace(/\D/g, '');
    if (digits) {
      const n = parseInt(digits, 10);
      if (!isNaN(n) && n > maxSeq) {
        maxSeq = n;
      }
    }
  });

  let seq = Math.max(1, maxSeq + 1);
  let candidate = String(seq);
  while (sectionInvoices.some(inv => String(inv.number).trim() === candidate)) {
    seq += 1;
    candidate = String(seq);
  }

  return { number: candidate, nextSeq: seq };
}

export function isDuplicateParty(
  db: AccountingDB,
  type: 'customer' | 'supplier',
  name: string,
  phone?: string,
  excludeId?: string
): { isDuplicate: boolean; reason?: string; existing?: Party } {
  const list = type === 'customer' ? (db.customers || []) : (db.suppliers || []);
  const cleanName = (name || '').trim().toLowerCase();

  // "نقدي" or generic cash is allowed as a recurring customer
  if (cleanName === 'نقدي' || cleanName === 'عميل نقدي' || cleanName === 'مورد نقدي' || cleanName === 'مورد عام') {
    return { isDuplicate: false };
  }

  // 1. Check duplicate name
  const existingByName = list.find(
    p => (!excludeId || p.id !== excludeId) && p.name.trim().toLowerCase() === cleanName
  );
  if (existingByName) {
    return {
      isDuplicate: true,
      reason: `الاسم "${name.trim()}" مسجل مسبقاً في قائمة ${type === 'customer' ? 'العملاء' : 'الموردين'} (كود: ${existingByName.code || 'بدون'}) ولا يمكن تكراره.`,
      existing: existingByName
    };
  }

  // 2. Check duplicate phone if provided
  const cleanPhone = (phone || '').trim();
  if (cleanPhone && cleanPhone.length >= 6) {
    const existingByPhone = list.find(
      p => (!excludeId || p.id !== excludeId) && p.phone && p.phone.trim() === cleanPhone
    );
    if (existingByPhone) {
      return {
        isDuplicate: true,
        reason: `رقم الهاتف (${cleanPhone}) مسجل مسبقاً للطرف "${existingByPhone.name}" (كود: ${existingByPhone.code || 'بدون'}) ولا يمكن تكرار أرقام الهواتف.`,
        existing: existingByPhone
      };
    }
  }

  return { isDuplicate: false };
}

export function getNextUniquePartyCode(db: AccountingDB, type: 'customer' | 'supplier'): string {
  const list = type === 'customer' ? (db.customers || []) : (db.suppliers || []);
  const prefix = type === 'customer' ? 'C-' : 'S-';
  let counter = list.length + 1;
  let code = `${prefix}${String(counter).padStart(3, '0')}`;
  while (list.some(p => p.code && p.code.trim().toUpperCase() === code.toUpperCase())) {
    counter += 1;
    code = `${prefix}${String(counter).padStart(3, '0')}`;
  }
  return code;
}

export function isDuplicateVoucherNumber(db: AccountingDB, number: string, type?: 'receipt' | 'payment', excludeId?: string): boolean {
  if (!number || !number.trim()) return false;
  const target = number.trim();
  return (db.vouchers || []).some(
    v => (!excludeId || v.id !== excludeId) && (!type || v.type === type) && String(v.number).trim() === target
  );
}

export function getNextUniqueVoucherNumber(
  db: AccountingDB,
  type: 'receipt' | 'payment'
): { number: string; nextSeq: number } {
  // Independent pure numeric sequence for each voucher type starting from 1
  const sectionVouchers = (db.vouchers || []).filter(v => v.type === type);
  let maxSeq = 0;
  sectionVouchers.forEach(v => {
    const raw = String(v.number || '').trim();
    const digits = raw.replace(/\D/g, '');
    if (digits) {
      const n = parseInt(digits, 10);
      if (!isNaN(n) && n > maxSeq) {
        maxSeq = n;
      }
    }
  });

  let seq = Math.max(1, maxSeq + 1);
  let candidate = String(seq);
  while (sectionVouchers.some(v => String(v.number).trim() === candidate)) {
    seq += 1;
    candidate = String(seq);
  }
  return { number: candidate, nextSeq: seq };
}

export function isDuplicateProduct(
  db: AccountingDB,
  code: string,
  barcode?: string,
  excludeId?: string
): { isDuplicate: boolean; reason?: string } {
  const cleanCode = (code || '').trim().toLowerCase();
  if (cleanCode) {
    const existingCode = (db.products || []).find(
      p => (!excludeId || p.id !== excludeId) && p.code.trim().toLowerCase() === cleanCode
    );
    if (existingCode) {
      return {
        isDuplicate: true,
        reason: `كود الصنف (${code.trim()}) مستخدم مسبقاً للصنف "${existingCode.name}" ولا يمكن تكراره.`
      };
    }
  }

  const cleanBarcode = (barcode || '').trim();
  if (cleanBarcode) {
    const existingBarcode = (db.products || []).find(
      p => (!excludeId || p.id !== excludeId) && p.barcode && p.barcode.trim() === cleanBarcode
    );
    if (existingBarcode) {
      return {
        isDuplicate: true,
        reason: `الباركود (${cleanBarcode}) مستخدم مسبقاً للصنف "${existingBarcode.name}" ولا يمكن تكراره.`
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Normalizes Arabic-Indic numerals (٠-٩) to Western standard numerals (0-9).
 */
export function toWesternNumerals(str: any): string {
  if (str === null || str === undefined) return '';
  return str.toString().replace(/[٠-٩]/g, (d: string) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString());
}

/**
 * Parses numeric inputs safely with Arabic-Indic numeral support.
 */
export function parseNum(val: any): number {
  if (!val) return 0;
  const cleaned = toWesternNumerals(val).replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned) || 0;
}

/**
 * Synchronizes linked Receipt (سند قبض) or Payment (سند صرف) vouchers for an invoice.
 * Follows ERP cascading relational integrity (Odoo / Pro Accountant 2000 style):
 * - Sales / Wholesale Invoices with paid amount generate linked Receipt Vouchers
 * - Purchase Invoices with paid amount generate linked Payment Vouchers
 * - When an invoice is edited, its linked voucher is automatically updated
 * - When an invoice is deleted, its linked voucher is purged
 */
export function syncInvoiceVouchers(
  db: AccountingDB,
  invoice: Invoice,
  currentUserName: string = 'مدير النظام'
): AccountingDB {
  const updated = db;
  if (!updated.vouchers) updated.vouchers = [];

  const invoiceId = invoice.id;
  const invoiceNumber = invoice.number;
  const finalPaid = Number(invoice.paid) || 0;

  const isSale = invoice.type === 'sale' || invoice.invoiceKind === 'sale' || invoice.invoiceKind === 'wholesale';
  const isPurchaseReturn = invoice.invoiceKind === 'purchase_return';

  // Money incoming -> 'receipt': Sales, Wholesale, Purchase Return
  // Money outgoing -> 'payment': Purchase, Sale Return
  const voucherType: 'receipt' | 'payment' = (isSale || isPurchaseReturn) ? 'receipt' : 'payment';

  // If paid is 0 or less, remove any previously linked voucher
  if (finalPaid <= 0) {
    updated.vouchers = updated.vouchers.filter(v => {
      const isLinked = (v as any).invoiceId === invoiceId ||
                       (v as any).sourceId === invoiceId ||
                       ((v as any).referenceNumber === invoiceNumber && v.type === voucherType) ||
                       (v.description && v.description.includes(invoiceNumber) && v.type === voucherType);
      return !isLinked;
    });
    return updated;
  }

  const paymentMethod = invoice.paymentMethod || 'نقدي';
  const desc = voucherType === 'receipt'
    ? `سند قبض مقابل فاتورة ${isSale ? 'مبيعات' : 'مرتجع'} رقم ${invoice.number} (${invoice.partyName}) عبر ${paymentMethod}`
    : `سند صرف مقابل فاتورة ${!isSale ? 'مشتريات' : 'مرتجع'} رقم ${invoice.number} (${invoice.partyName}) عبر ${paymentMethod}`;

  // Find existing linked voucher to UPDATE IN PLACE (preventing number changes or duplicates)
  const existingVoucher = updated.vouchers.find(v => {
    return (v as any).invoiceId === invoiceId ||
           (v as any).sourceId === invoiceId ||
           ((v as any).referenceNumber === invoiceNumber && v.type === voucherType) ||
           (v.description && v.description.includes(invoiceNumber) && v.type === voucherType);
  });

  if (existingVoucher) {
    // 1. Update in place down to the exact millimeter
    existingVoucher.type = voucherType;
    existingVoucher.amount = finalPaid;
    existingVoucher.date = invoice.date;
    existingVoucher.partyId = invoice.partyId;
    existingVoucher.partyName = invoice.partyName || (voucherType === 'receipt' ? 'عميل نقدي' : 'مورد عام');
    existingVoucher.paymentMethod = paymentMethod;
    existingVoucher.description = desc;
    existingVoucher.branchId = invoice.branchId || 'br_mawan';
    existingVoucher.branchName = invoice.branchName || 'الفرع الرئيسي - شركة الموان';
    existingVoucher.invoiceId = invoice.id;
    existingVoucher.referenceNumber = invoice.number;
    existingVoucher.updatedAt = new Date().toISOString();
    existingVoucher.updatedBy = currentUserName;

    // 2. Filter out any secondary duplicate vouchers for this same invoice
    updated.vouchers = updated.vouchers.filter(v => {
      if (v.id === existingVoucher.id) return true;
      const isDuplicate = (v as any).invoiceId === invoiceId ||
                          (v as any).sourceId === invoiceId ||
                          ((v as any).referenceNumber === invoiceNumber && v.type === voucherType) ||
                          (v.description && v.description.includes(invoiceNumber) && v.type === voucherType);
      return !isDuplicate;
    });
  } else {
    // Create new linked voucher with guaranteed unique sequential number
    const { number: vNum, nextSeq } = getNextUniqueVoucherNumber(updated, voucherType);
    const settingKey = voucherType === 'receipt' ? 'nextReceipt' : 'nextPayment';
    updated.settings[settingKey] = Math.max(updated.settings[settingKey] || 1, nextSeq + 1);

    const newVoucher: Voucher = {
      id: generateId(voucherType === 'receipt' ? 'rec' : 'pay'),
      number: vNum,
      type: voucherType,
      date: invoice.date,
      partyId: invoice.partyId,
      partyName: invoice.partyName || (voucherType === 'receipt' ? 'عميل نقدي' : 'مورد عام'),
      amount: finalPaid,
      paymentMethod,
      description: desc,
      referenceNumber: invoice.number,
      invoiceId: invoice.id,
      branchId: invoice.branchId || 'br_mawan',
      branchName: invoice.branchName || 'الفرع الرئيسي - شركة الموان',
      journalEntryId: invoice.journalEntryId,
      createdAt: invoice.createdAt || new Date().toISOString(),
      createdBy: invoice.createdBy || currentUserName,
    };

    updated.vouchers.unshift(newVoucher);
  }

  return updated;
}

/**
 * Retroactively synchronizes linked financial vouchers (سندات قبض وسندات صرف)
 * for all previously entered invoices. Ensures:
 * 1. Every paid invoice (paid > 0) has an exact voucher matching down to the millimeter
 * 2. If voucher already existed, its amount matches paid exactly
 * 3. Any duplicate vouchers for the same invoice are deduplicated
 */
export function syncAllExistingInvoiceVouchers(db: AccountingDB): { db: AccountingDB; createdCount: number } {
  if (!db.vouchers) db.vouchers = [];
  if (!db.invoices || db.invoices.length === 0) return { db, createdCount: 0 };

  let createdCount = 0;
  const currentUserName = db.currentUser?.name || 'مدير النظام';

  // Sort invoices chronologically
  const sortedInvoices = [...db.invoices].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  sortedInvoices.forEach(inv => {
    const paid = Number(inv.paid) || 0;
    const isSale = inv.type === 'sale';
    const expectedType: 'receipt' | 'payment' = isSale ? 'receipt' : 'payment';

    if (paid <= 0) {
      // Remove any lingering linked voucher
      db.vouchers = db.vouchers.filter(v => (v as any).invoiceId !== inv.id && (v as any).referenceNumber !== inv.number);
      return;
    }

    // Find linked voucher
    const linkedVouchers = db.vouchers.filter(v => {
      return (v as any).invoiceId === inv.id ||
             (v as any).sourceId === inv.id ||
             ((v as any).referenceNumber === inv.number && v.type === expectedType) ||
             (v.description && v.description.includes(inv.number) && v.type === expectedType);
    });

    if (linkedVouchers.length === 0) {
      // Create missing voucher
      syncInvoiceVouchers(db, inv, inv.createdBy || currentUserName);
      createdCount++;
    } else {
      // Pick first, update amount to match invoice paid exactly
      const primaryVoucher = linkedVouchers[0];
      if (primaryVoucher.amount !== paid || !primaryVoucher.invoiceId) {
        primaryVoucher.amount = paid;
        primaryVoucher.invoiceId = inv.id;
        primaryVoucher.referenceNumber = inv.number;
        primaryVoucher.date = inv.date;
        primaryVoucher.partyName = inv.partyName || (isSale ? 'عميل نقدي' : 'مورد عام');
        primaryVoucher.paymentMethod = inv.paymentMethod || 'نقدي';
      }

      // If duplicate vouchers existed for this invoice, delete duplicates
      if (linkedVouchers.length > 1) {
        const extraIds = new Set(linkedVouchers.slice(1).map(v => v.id));
        db.vouchers = db.vouchers.filter(v => !extraIds.has(v.id));
      }
    }
  });

  return { db, createdCount };
}



