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
import {
  getDeterministicVoucherId,
  getDeterministicTreasuryId,
  reconcileAndDeduplicateAllFinancialRecords
} from './accountingEngine';

export {
  getDeterministicVoucherId,
  getDeterministicTreasuryId,
  reconcileAndDeduplicateAllFinancialRecords
};

const STORAGE_KEY = 'hesabaty_pro_db_v6';
const IDB_NAME = 'hesabaty_accounting_db';
const IDB_STORE = 'erp_storage';
const IDB_KEY = 'main_database_state';

export const PURGED_COMP101_INVOICE_IDS = new Set<string>([
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

export const PURGED_COMP101_PRODUCT_IDS = new Set<string>([
  'prod_mw90wanc_6izgx', 'prod_mw90wand_an42q', 'prod_mw90wand_c0ziy', 'prod_mw90wane_ohkll',
  'prod_mw90wane_2kuzh', 'prod_mw90wanf_jquk5', 'prod_mw90wanf_xlngl', 'prod_mw90wanf_obefl',
  'prod_mw90wang_skvwl', 'prod_mw90wang_40mxx', 'prod_mw90wanh_mozaf', 'prod_mw90wanh_0zogi',
  'prod_mw90wanh_8rkcq', 'prod_mw90wanh_w73hv', 'prod_mw90wani_ihfj8', 'prod_mw90wani_kf92f',
  'prod_mw90wanj_9mjiy', 'prod_mw90wanj_4ioh9', 'prod_mw90wank_u54so', 'prod_mw90wanl_98dhq',
  'prod_mw90wanl_dpmzr', 'prod_mw90wanm_iye24'
]);

export const PURGED_EKHWA_INVOICE_IDS = PURGED_COMP101_INVOICE_IDS;

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
    taxRate: 0,
    notes: 'البضاعة المباعة ترد وتستبدل خلال 14 يوماً وفقاً لحالتها الأصلية',
    nextSale: 1,
    nextPurchase: 1,
    nextSaleReturn: 1,
    nextPurchaseReturn: 1,
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

export interface VerifiedPurchaseInfo {
  hasVerifiedPurchase: boolean;
  price?: number;
  avgCost?: number;
  latestBuyPrice?: number;
  date?: string;
  invoiceNumber?: string;
  supplierName?: string;
}

export interface ProductCostFromPurchases {
  hasPurchases: boolean;
  /** متوسط التكلفة الفعلي المحسوب حصرياً من فواتير الشراء المسجلة (المتوسط المرجح = إجمالي القيمة / إجمالي الكمية) */
  avgCost: number;
  /** آخر سعر شراء فعلي موثق في أحدث فاتورة شراء */
  latestBuyPrice: number;
  /** إجمالي الكميات المشتراة فعلياً في فواتير الشراء */
  totalPurchasedQty: number;
  /** إجمالي قيمة المشتريات المسجلة لهذا الصنف */
  totalPurchasedAmount: number;
  /** عدد فواتير الشراء التي ورد فيها الصنف */
  purchasesCount: number;
  /** تاريخ آخر فاتورة شراء */
  lastPurchaseDate?: string;
  /** رقم آخر فاتورة شراء */
  lastInvoiceNumber?: string;
  /** اسم مورد آخر فاتورة شراء */
  lastSupplierName?: string;
}

/**
 * دالة حساب متوسط سعر التكلفة المرجح وآخر سعر شراء حصرياً من فواتير الشراء المسجلة فعلياً
 * تطبق المعايير المحاسبية الدقيقة:
 * متوسط التكلفة = (مجموع الكمية × سعر الشراء لكل فاتورة) / إجمالي الكميات المشتراة
 * لا تعتمد على أي معادلات تقديرية أو نسب افتراضية نهائياً.
 */
export function calculateProductAverageCost(
  db: AccountingDB,
  productId?: string,
  productName?: string,
  excludeInvoiceId?: string
): ProductCostFromPurchases {
  if (!db || !db.invoices || (!productId && !productName)) {
    return {
      hasPurchases: false,
      avgCost: 0,
      latestBuyPrice: 0,
      totalPurchasedQty: 0,
      totalPurchasedAmount: 0,
      purchasesCount: 0
    };
  }

  const normTargetName = productName ? normalizeArabicText(productName) : '';

  // فلترة كافة فواتير المشتريات المعتمدة والمسجلة فعلياً فقط (استبعاد الفواتير الملغاة)
  const purchaseInvoices = (db.invoices || []).filter(inv =>
    (inv.type === 'purchase' || inv.invoiceKind === 'purchase') &&
    (inv.status as string) !== 'ملغي' &&
    (!excludeInvoiceId || inv.id !== excludeInvoiceId)
  );

  let totalPurchasedQty = 0;
  let totalPurchasedAmount = 0;
  let purchasesCount = 0;
  let latestBuyPrice = 0;
  let lastPurchaseDate: string | undefined;
  let lastInvoiceNumber: string | undefined;
  let lastSupplierName: string | undefined;
  let latestSortKey = '';

  for (const inv of purchaseInvoices) {
    if (!inv.items || !Array.isArray(inv.items)) continue;
    for (const it of inv.items) {
      const matchId = Boolean(productId && it.productId && it.productId === productId);
      const matchName = Boolean(normTargetName && it.productName && normalizeArabicText(it.productName) === normTargetName);

      if (matchId || matchName) {
        const qty = Number(it.qty) || 0;
        const price = Number(it.unitPrice || it.costPrice || (it as any).price || (qty > 0 && it.total > 0 ? it.total / qty : 0)) || 0;
        if (qty > 0 && price > 0) {
          totalPurchasedQty += qty;
          totalPurchasedAmount += (qty * price);
          purchasesCount++;

          const invSortKey = `${inv.date || ''}_${inv.createdAt || ''}_${inv.number || ''}_${inv.id || ''}`;
          if (invSortKey > latestSortKey) {
            latestSortKey = invSortKey;
            latestBuyPrice = price;
            lastPurchaseDate = inv.date;
            lastInvoiceNumber = inv.number;
            lastSupplierName = inv.partyName;
          }
        }
      }
    }
  }

  if (purchasesCount > 0 && totalPurchasedQty > 0) {
    const rawAvg = totalPurchasedAmount / totalPurchasedQty;
    return {
      hasPurchases: true,
      avgCost: Number(rawAvg.toFixed(2)),
      latestBuyPrice: Number(latestBuyPrice.toFixed(2)),
      totalPurchasedQty,
      totalPurchasedAmount: Number(totalPurchasedAmount.toFixed(2)),
      purchasesCount,
      lastPurchaseDate,
      lastInvoiceNumber,
      lastSupplierName
    };
  }

  // إذا لم يُعثر على فواتير شراء مسجلة:
  // نتحقق من بطاقة الصنف الأصلية فقط إذا كان بها سعر شراء مسجل ومحدد مسبقاً
  const prod = db.products?.find(p =>
    (productId && p.id === productId) ||
    (normTargetName && normalizeArabicText(p.name) === normTargetName)
  );

  if (prod && Number(prod.buyPrice) > 0) {
    const recordedPrice = Number(prod.buyPrice);
    return {
      hasPurchases: true,
      avgCost: recordedPrice,
      latestBuyPrice: recordedPrice,
      totalPurchasedQty: prod.currentQty > 0 ? prod.currentQty : 0,
      totalPurchasedAmount: (prod.currentQty > 0 ? prod.currentQty : 0) * recordedPrice,
      purchasesCount: 1
    };
  }

  // لا توجد فواتير شراء ولا سعر شراء مسجل: صفر دون أي معادلات تقديرية
  return {
    hasPurchases: false,
    avgCost: 0,
    latestBuyPrice: 0,
    totalPurchasedQty: 0,
    totalPurchasedAmount: 0,
    purchasesCount: 0
  };
}

export interface FastPurchaseCostIndex {
  getCost: (productId?: string, productName?: string) => ProductCostFromPurchases;
}

/**
 * تبني فهرس تكلفة المشتريات الفعلي في دورة خطية واحدة O(N) لكافة الأصناف
 * بدل مسح جميع فواتير المشتريات لكل صنف على حدة — مثالية لآلاف وملايين الفواتير
 */
export function buildPurchaseCostMap(db: AccountingDB): FastPurchaseCostIndex {
  const byId = new Map<string, {
    totalQty: number;
    totalAmt: number;
    count: number;
    latestPrice: number;
    latestKey: string;
    lastDate?: string;
    lastNumber?: string;
    lastSupplier?: string;
  }>();
  const byName = new Map<string, {
    totalQty: number;
    totalAmt: number;
    count: number;
    latestPrice: number;
    latestKey: string;
    lastDate?: string;
    lastNumber?: string;
    lastSupplier?: string;
  }>();

  const accum = (
    map: Map<string, any>,
    key: string,
    qty: number,
    price: number,
    invSortKey: string,
    invDate?: string,
    invNumber?: string,
    supplierName?: string
  ) => {
    let rec = map.get(key);
    if (!rec) {
      rec = {
        totalQty: 0,
        totalAmt: 0,
        count: 0,
        latestPrice: 0,
        latestKey: '',
        lastDate: invDate,
        lastNumber: invNumber,
        lastSupplier: supplierName
      };
      map.set(key, rec);
    }
    rec.totalQty += qty;
    rec.totalAmt += qty * price;
    rec.count += 1;
    if (invSortKey > rec.latestKey) {
      rec.latestKey = invSortKey;
      rec.latestPrice = price;
      rec.lastDate = invDate;
      rec.lastNumber = invNumber;
      rec.lastSupplier = supplierName;
    }
  };

  for (const inv of db?.invoices || []) {
    if (!((inv.type === 'purchase' || inv.invoiceKind === 'purchase') && (inv.status as string) !== 'ملغي')) {
      continue;
    }
    if (!Array.isArray(inv.items)) continue;
    const invSortKey = `${inv.date || ''}_${inv.createdAt || ''}_${inv.number || ''}_${inv.id || ''}`;
    for (const it of inv.items) {
      const qty = Number(it.qty) || 0;
      const price = Number(it.unitPrice || it.costPrice || (it as any).price || (qty > 0 && it.total > 0 ? it.total / qty : 0)) || 0;
      if (qty > 0 && price > 0) {
        if (it.productId) {
          accum(byId, it.productId, qty, price, invSortKey, inv.date, inv.number, inv.partyName);
        }
        if (it.productName) {
          const norm = normalizeArabicText(it.productName);
          if (norm) accum(byName, norm, qty, price, invSortKey, inv.date, inv.number, inv.partyName);
        }
      }
    }
  }

  const prodById = new Map<string, Product>();
  const prodByName = new Map<string, Product>();
  for (const p of db?.products || []) {
    if (p.id) prodById.set(p.id, p);
    if (p.name) prodByName.set(normalizeArabicText(p.name), p);
  }

  return {
    getCost: (productId?: string, productName?: string): ProductCostFromPurchases => {
      const rec = (productId ? byId.get(productId) : undefined) ||
                  (productName ? byName.get(normalizeArabicText(productName)) : undefined);
      if (rec && rec.count > 0 && rec.totalQty > 0) {
        return {
          hasPurchases: true,
          avgCost: Number((rec.totalAmt / rec.totalQty).toFixed(2)),
          latestBuyPrice: Number(rec.latestPrice.toFixed(2)),
          totalPurchasedQty: rec.totalQty,
          totalPurchasedAmount: Number(rec.totalAmt.toFixed(2)),
          purchasesCount: rec.count,
          lastPurchaseDate: rec.lastDate,
          lastInvoiceNumber: rec.lastNumber,
          lastSupplierName: rec.lastSupplier
        };
      }
      const prod = (productId ? prodById.get(productId) : undefined) ||
                   (productName ? prodByName.get(normalizeArabicText(productName)) : undefined);
      if (prod && Number(prod.buyPrice) > 0) {
        const recordedPrice = Number(prod.buyPrice);
        return {
          hasPurchases: true,
          avgCost: recordedPrice,
          latestBuyPrice: recordedPrice,
          totalPurchasedQty: prod.currentQty > 0 ? prod.currentQty : 0,
          totalPurchasedAmount: (prod.currentQty > 0 ? prod.currentQty : 0) * recordedPrice,
          purchasesCount: 1
        };
      }
      return {
        hasPurchases: false,
        avgCost: 0,
        latestBuyPrice: 0,
        totalPurchasedQty: 0,
        totalPurchasedAmount: 0,
        purchasesCount: 0
      };
    }
  };
}

/**
 * Retrieves verified purchase pricing details for a product directly from purchase invoices.
 * Strictly adheres to ERP integrity: never estimates or invents costs.
 * Uses only posted purchase invoices (status !== 'ملغي').
 */
export function getLatestVerifiedPurchaseInfo(
  db: AccountingDB,
  productId?: string,
  productName?: string,
  excludeInvoiceId?: string
): VerifiedPurchaseInfo {
  const costInfo = calculateProductAverageCost(db, productId, productName, excludeInvoiceId);
  if (costInfo.hasPurchases) {
    const activePrice = (db.settings?.cost === 'average')
      ? (costInfo.avgCost || costInfo.latestBuyPrice)
      : (costInfo.latestBuyPrice || costInfo.avgCost);

    return {
      hasVerifiedPurchase: true,
      price: activePrice,
      avgCost: costInfo.avgCost,
      latestBuyPrice: costInfo.latestBuyPrice,
      date: costInfo.lastPurchaseDate,
      invoiceNumber: costInfo.lastInvoiceNumber,
      supplierName: costInfo.lastSupplierName
    };
  }

  return { hasVerifiedPurchase: false };
}

/**
 * 15 Verified Items for Invoice #17 (شركة الرحمة للحدايد والبويات)
 * Guarantees zero loss and exact mathematical parity with user invoices
 */
export const RAHMA_INVOICE_17_ITEMS = [
  { productId: 'prd_mfs_5', productCode: 'PRD-101', productName: 'مفصلة دولاب 5سم', qty: 12, unitPrice: 6.44, total: 77.24, unit: 'قطعة', costPrice: 6.44 },
  { productId: 'prd_mfs_6', productCode: 'PRD-102', productName: 'مفصلة دولاب 6سم', qty: 12, unitPrice: 7.91, total: 94.89, unit: 'قطعة', costPrice: 7.91 },
  { productId: 'prd_mfs_7', productCode: 'PRD-103', productName: 'مفصلة دولاب 7سم', qty: 12, unitPrice: 8.83, total: 105.92, unit: 'سم', costPrice: 8.83 },
  { productId: 'prd_hml_mgz', productCode: 'PRD-104', productName: 'حامل ستارة مجوز', qty: 22, unitPrice: 25.34, total: 557.37, unit: 'قطعة', costPrice: 25.34 },
  { productId: 'prd_hml_mfrd', productCode: 'PRD-105', productName: 'حامل ستارة مفرد', qty: 28, unitPrice: 13.77, total: 385.56, unit: 'قطعة', costPrice: 13.77 },
  { productId: 'prd_hml_sqf', productCode: 'PRD-106', productName: 'حامل ستارة سقف مجوز', qty: 18, unitPrice: 26, total: 468, unit: 'قطعة', costPrice: 26 },
  { productId: 'prd_mfk_rozeta', productCode: 'PRD-107', productName: 'طقم مفك روزته صغير', qty: 2, unitPrice: 34, total: 68, unit: 'قطعة', costPrice: 34 },
  { productId: 'prd_khrshof_sgh', productCode: 'PRD-108', productName: 'طقم خرشوفة صغير', qty: 2, unitPrice: 60.64, total: 121.28, unit: 'قطعة', costPrice: 60.64 },
  { productId: 'prd_khrshof_kbr', productCode: 'PRD-109', productName: 'طقم خرشوفة كبير', qty: 2, unitPrice: 110.25, total: 220.5, unit: 'قطعة', costPrice: 110.25 },
  { productId: 'prd_epoxy_hnd', productCode: 'PRD-110', productName: 'كارت ايبوكسي هندي', qty: 12, unitPrice: 32.5, total: 390, unit: 'قطعة', costPrice: 32.5 },
  { productId: 'prd_shm3a_nikl', productCode: 'PRD-111', productName: 'شماعة نيكل', qty: 10, unitPrice: 51.11, total: 511.1, unit: 'قطعة', costPrice: 51.11 },
  { productId: 'prd_frtasa_madda', productCode: 'PRD-112', productName: 'فرطاسة مادة وجايه', qty: 3, unitPrice: 19.49, total: 58.48, unit: 'قطعة', costPrice: 19.49 },
  { productId: 'prd_fyshr_frsha', productCode: 'PRD-113', productName: 'فيشر فراشة', qty: 200, unitPrice: 0.5, total: 100.8, unit: 'قطعة', costPrice: 0.5 },
  { productId: 'prd_astk_mtwskl', productCode: 'PRD-114', productName: 'استك متوسكل', qty: 10, unitPrice: 36, total: 360, unit: 'قطعة', costPrice: 36 },
  { productId: 'prd_katel_stnlss', productCode: 'PRD-115', productName: 'كاتل استانلس', qty: 4, unitPrice: 200, total: 800, unit: 'قطعة', costPrice: 200 }
];

/**
 * Normalizes Arabic text for 100% resilient search, matching, and deduplication.
 * Removes tashkeel, standardizes alef/hamza forms, taa marbuta/haa, and yaa/alef maqsura.
 */
export function normalizeArabicText(text?: string | null): string {
  if (!text) return '';
  let s = text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // remove diacritics
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ـ+/g, '') // remove kashida
    .replace(/[×xX\*]/g, '×') // unify dimension symbols: 2×2, 2*2, 2x2
    .replace(/["'”’]/g, '') // remove quotation marks
    .replace(/\s+/g, ' ');
  // Specific Egyptian hardware synonyms (whitespace-safe regex for Arabic characters)
  s = s.replace(/(^|\s)سيلك(?=\s|$)/g, '$1سلك');
  s = s.replace(/(^|\s)سليكون(?=\s|$)/g, '$1سيلكون');
  s = s.replace(/(^|\s)فايبر(?=\s|$)/g, '$1فيبر');
  // Handle known catalog aliases where invoices appended brand
  if (s === 'اسطوانه بسكوته 9') {
    s = 'اسطوانه بسكوته 9 apt';
  }
  return s.trim();
}

/**
 * Deterministic, idempotent stock movement ID generation
 * Follows exact canonical pattern: sm_${invoiceId}_${productId}
 * Ensures identical ID regardless of branch or warehouse parameter
 */
export function getDeterministicStockMovementId(invoiceId: string, productId: string, _warehouseId?: string): string {
  const cleanInv = (invoiceId || 'inv').toString().trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanProd = (productId || 'prod').toString().trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  return `sm_${cleanInv}_${cleanProd}`;
}

export interface StockMovementVerificationReport {
  totalPurchaseInvoices: number;
  invoicesWithMissingMovements: number;
  missingMovementsAdded: number;
  correctedProductsCount: number;
  treasuryDiscrepanciesFixed: number;
  totalCatalogProducts: number;
  totalStockUnitsInWarehouse: number;
  details: string[];
}

/**
 * دالة مركزية تفحص كافة الفواتير المسجلة (شراء وبيوع ومرتجع)، وتطابق أصنافها مع حركات المخزون،
 * وتدمج أي حركات مكررة نتجت سابقاً لمنع تضاعف الأرصدة، وتدرج الحركات المفقودة بمعرف فريد وحتمي،
 * وتحدث الأثر المالي في الخزينة وتسمع الأصناف غير المشتراة بالسالب حتى يتم شراؤها.
 */
export function verifyAndCorrectStockMovements(db: AccountingDB): { db: AccountingDB; report: StockMovementVerificationReport } {
  if (!db) {
    return {
      db,
      report: {
        totalPurchaseInvoices: 0,
        invoicesWithMissingMovements: 0,
        missingMovementsAdded: 0,
        correctedProductsCount: 0,
        treasuryDiscrepanciesFixed: 0,
        totalCatalogProducts: 0,
        totalStockUnitsInWarehouse: 0,
        details: []
      }
    };
  }

  if (!db.products) db.products = [];
  if (!db.stockMovements) db.stockMovements = [];
  if (!db.invoices) db.invoices = [];
  if (!db.treasury) db.treasury = [];
  if (!db.warehouses || db.warehouses.length === 0) {
    db.warehouses = [
      { id: 'wh_mawan', name: 'مخزن شركة الموان الرئيسي', location: 'المقر الرئيسي', isDefault: true }
    ];
  }
  const defaultWh = db.warehouses[0];
  const defaultBranchId = db.branches?.[0]?.id || 'br_mawan';
  const defaultBranchName = db.branches?.[0]?.name || defaultWh.name;

  let invoicesWithMissingMovements = 0;
  let missingMovementsAdded = 0;
  let treasuryDiscrepanciesFixed = 0;
  const details: string[] = [];

  // 1. تسوية وتوحيد دليل الأصناف (Catalog Realignment & Unique Codes)
  // لمنع تداخل الأكواد (مثل تشارك شريط لحام ولفة خرطوم في كود واحد) ودمج المسميات المترادفة (مثل سلك مقابل سيلك)
  let maxCodeNum = 1300;
  db.products.forEach(p => {
    const m = p.code?.match(/\d+/);
    if (m) {
      const num = parseInt(m[0], 10);
      if (num > maxCodeNum) maxCodeNum = num;
    }
  });

  const prodByNorm = new Map<string, Product>();
  const uniqueProducts: Product[] = [];
  const mergedIdMap = new Map<string, string>();
  const seenCodes = new Set<string>();

  db.products.forEach(p => {
    const norm = normalizeArabicText(p.name);
    if (!prodByNorm.has(norm)) {
      // التأكد من أن كود الصنف فريد تماماً ولا يتكرر لصنف آخر
      if (!p.code || p.code.trim() === '' || seenCodes.has(p.code.trim())) {
        maxCodeNum++;
        p.code = `P-${maxCodeNum}`;
      }
      seenCodes.add(p.code.trim());
      prodByNorm.set(norm, p);
      uniqueProducts.push(p);
    } else {
      // صنف مكرر بنمط كتابة بديل (مثال: سيلك مقابل سلك)
      const canonical = prodByNorm.get(norm)!;
      mergedIdMap.set(p.id, canonical.id);
      if ((canonical.currentQty === 0 || !canonical.currentQty) && (p.currentQty || 0) > 0) {
        canonical.currentQty = p.currentQty;
      }
      if ((!canonical.buyPrice || canonical.buyPrice === 0) && (p.buyPrice || 0) > 0) {
        canonical.buyPrice = p.buyPrice;
      }
      if (p.name.includes('APT') && !canonical.name.includes('APT')) {
        canonical.name = p.name;
      }
      if (p.name.includes('سلك') && canonical.name.includes('سيلك')) {
        canonical.name = p.name;
      }
    }
  });
  db.products = uniqueProducts;

  // تحديث معرفات الأصناف المدمجة داخل حركات المخزون وبنود الفواتير
  if (mergedIdMap.size > 0) {
    db.stockMovements.forEach(sm => {
      if (mergedIdMap.has(sm.productId)) {
        const canonicalId = mergedIdMap.get(sm.productId)!;
        const canonical = db.products.find(p => p.id === canonicalId);
        sm.productId = canonicalId;
        if (canonical) sm.productName = canonical.name;
      }
    });
    db.invoices.forEach(inv => {
      inv.items?.forEach(it => {
        if (it.productId && mergedIdMap.has(it.productId)) {
          const canonicalId = mergedIdMap.get(it.productId)!;
          const canonical = db.products.find(p => p.id === canonicalId);
          it.productId = canonicalId;
          if (canonical) {
            it.productCode = canonical.code;
          }
        }
      });
    });
  }

  // 2. الحفاظ الصارم على فاتورة رقم 17 لشركة الرحمة للحدايد (المنشئ Ahmed Nazih والمعدل Mohamed Nazih)
  const inv17 = db.invoices.find(
    i => (i.number === '17' && (i.type === 'purchase' || i.invoiceKind === 'purchase')) ||
         (i.partyName && i.partyName.includes('الرحمة'))
  );
  if (inv17) {
    if (!inv17.items || inv17.items.length < 15) {
      inv17.items = JSON.parse(JSON.stringify(RAHMA_INVOICE_17_ITEMS));
      inv17.total = 4319.14;
      inv17.subtotal = 4319.14;
      inv17.paid = 4319.14;
      inv17.remaining = 0;
      inv17.status = 'مدفوع';
      inv17.paymentMethod = 'نقدي';
      inv17.branchId = inv17.branchId || 'br_mawan';
      inv17.branchName = inv17.branchName || 'الفرع الرئيسي - شركة الموان';
    }
    if (!inv17.createdBy || inv17.createdBy === 'مدير النظام') {
      inv17.createdBy = 'Ahmed Nazih';
    }
    if (!inv17.updatedBy || inv17.updatedBy === inv17.createdBy) {
      inv17.updatedBy = 'Mohamed Nazih';
    }
  }

  // 3. فحص كافة الفواتير المسجلة وربط بنودها بأصنافها الحقيقية بالاسم أولاً
  (db.invoices || []).forEach(inv => {
    if (!Array.isArray(inv.items) || inv.items.length === 0) return;

    const isPurchase = inv.type === 'purchase' || inv.invoiceKind === 'purchase';
    const isSale = inv.type === 'sale' || inv.invoiceKind === 'sale' || inv.invoiceKind === 'wholesale';
    const isSaleReturn = inv.invoiceKind === 'sale_return';
    const isPurchaseReturn = inv.invoiceKind === 'purchase_return';

    const targetBranch = inv.branchId || defaultBranchId;
    const branchName = inv.branchName || db.branches?.find(b => b.id === targetBranch)?.name || defaultBranchName;
    let invHadMissing = false;

    // إعادة احتساب صافي إجمالي الفاتورة مع الحفاظ الصارم على طرح الخصم وإضافة الضريبة والإيرادات الإضافية
    const calculatedItemsTotal = Number(
      inv.items.reduce((s, it) => s + (Number(it.total) || ((Number(it.qty) || 0) * (Number(it.unitPrice || it.costPrice || (it as any).price) || 0))), 0).toFixed(2)
    );
    const invDiscAmt = Number(inv.discount) || 0;
    const invTaxAmt = Number(inv.tax) || 0;
    const invExtraAmt = Number(inv.extraIncomeVal) || 0;
    const expectedNetTotal = Math.max(0, Number((calculatedItemsTotal - invDiscAmt + invTaxAmt + invExtraAmt).toFixed(2)));

    if (calculatedItemsTotal > 0) {
      inv.subtotal = calculatedItemsTotal;
      if (Math.abs((Number(inv.total) || 0) - expectedNetTotal) > 0.05) {
        inv.total = expectedNetTotal;
        if (inv.status === 'مدفوع' || (inv.paymentMethod && inv.paymentMethod !== 'آجل')) {
          inv.paid = expectedNetTotal;
          inv.remaining = 0;
        } else {
          inv.paid = Math.min(expectedNetTotal, Number(inv.paid) || 0);
          inv.remaining = Math.max(0, Number((expectedNetTotal - inv.paid).toFixed(2)));
        }
      }
    }

    inv.items.forEach(item => {
      if (!item || !item.productName) return;
      const normItemName = normalizeArabicText(item.productName);

      // المطابقة الصارمة: بالاسم المطابق لغوياً أولاً وأبداً لمنع اختطاف الأصناف بسبب تشابه الكود
      let prod = prodByNorm.get(normItemName);

      // ثانياً: إذا كان معرف الصنف مسجلاً ومطابقاً
      if (!prod && item.productId) {
        const canonicalId = mergedIdMap.get(item.productId) || item.productId;
        const candidate = db.products.find(p => p.id === canonicalId);
        if (candidate && normalizeArabicText(candidate.name) === normItemName) {
          prod = candidate;
        }
      }

      // ثالثاً: إدراج الصنف في الكتالوج فوراً إذا لم يكن موجوداً
      if (!prod && item.productName.trim()) {
        maxCodeNum++;
        const newCode = `P-${maxCodeNum}`;
        const unitBuy = isPurchase
          ? (Number(item.unitPrice || item.costPrice || (item as any).price) || 0)
          : (Number(item.costPrice) || 0);
        const unitSell = isSale ? (Number(item.unitPrice) || 0) : 0;
        const newProdId = generateId('prod');

        prod = {
          id: newProdId,
          name: item.productName.trim(),
          code: newCode,
          barcode: '',
          category: 'عامة',
          unit: item.unit || 'قطعة',
          buyPrice: unitBuy,
          sellPrice: unitSell,
          wholesalePrice: unitSell * 0.9,
          minStock: 5,
          currentQty: 0,
          avgCost: unitBuy,
          branchesData: {}
        };
        db.products.push(prod);
        prodByNorm.set(normItemName, prod);
        seenCodes.add(newCode);
      }

      if (!prod) return;

      // تصحيح وتثبيت ارتباط بند الفاتورة بالصنف الحقيقي
      item.productId = prod.id;
      item.productCode = prod.code;

      // معرف حركة المخزون الحتمي والفريد: sm_${invId}_${productId}
      const deterministicSmId = getDeterministicStockMovementId(inv.id, prod.id);

      const qty = Number(item.qty) || 0;
      const unitCost = Number(item.costPrice || item.unitPrice || (item as any).price) || 0;
      // المشتريات ومرتجع المبيعات تزيد المخزون (+qty)
      // المبيعات ومرتجع المشتريات تخصم من المخزون (-qty بالسالب للأصناف غير المشتراة بعد)
      const qtyChange = (isPurchase || isSaleReturn) ? Math.abs(qty) : -Math.abs(qty);
      const movementType = isPurchase ? 'purchase' : (isSale ? 'sale' : (isSaleReturn ? 'sale_return' : 'purchase_return'));

      // فحص وجود الحركة المخزنية المطابقة للصنف الحقيقي
      const existingSmIdx = db.stockMovements.findIndex(sm =>
        sm.id === deterministicSmId ||
        (sm.sourceId === inv.id && (sm.productId === prod.id || normalizeArabicText(sm.productName) === normItemName))
      );

      if (existingSmIdx === -1) {
        db.stockMovements.unshift({
          id: deterministicSmId,
          date: inv.date || getTodayDate(),
          productId: prod.id,
          productName: prod.name,
          warehouseId: defaultWh.id,
          warehouseName: defaultWh.name,
          qtyChange,
          balanceAfter: 0,
          unitCost,
          type: movementType,
          refNumber: inv.number,
          sourceId: inv.id,
          branchId: targetBranch,
          branchName: branchName
        });
        missingMovementsAdded++;
        invHadMissing = true;
      } else {
        const sm = db.stockMovements[existingSmIdx];
        sm.id = deterministicSmId;
        sm.productId = prod.id;
        sm.productName = prod.name;
        sm.qtyChange = qtyChange;
        sm.unitCost = unitCost;
        sm.type = movementType;
        sm.branchId = targetBranch;
        sm.branchName = branchName;
        sm.sourceId = inv.id;
        sm.refNumber = inv.number;
      }
    });

    // إزالة أي حركات مخزنية يتيمة للفاتورة لا تنتمي لأصنافها الفعلية
    const validInvProdIds = new Set(inv.items.map(it => it.productId));
    db.stockMovements = db.stockMovements.filter(sm => sm.sourceId !== inv.id || validInvProdIds.has(sm.productId));

    if (invHadMissing) {
      invoicesWithMissingMovements++;
      details.push(`فاتورة #${inv.number} (${inv.partyName || 'طرف'}): تم فحص وإدراج أصنافها في حركات المخزون.`);
    }

    // التأكد من التأثير المالي التام للفاتورة على الخزينة في حال السداد أو الكاش
    const paidAmount = Number(inv.paid) > 0 ? Number(inv.paid) : (inv.paymentMethod && inv.paymentMethod !== 'آجل' ? Number(inv.total) : 0);
    if (paidAmount > 0) {
      const isOutflow = isPurchase || isSaleReturn;
      const direction: 'in' | 'out' = isOutflow ? 'out' : 'in';
      const sourceType = isPurchase ? 'purchase' : (isSale ? 'sale' : (isSaleReturn ? 'sale_return' : 'purchase_return'));
      const deterministicTrId = getDeterministicTreasuryId(sourceType, inv.id, 0, direction);

      const existingTr = db.treasury.find(tr =>
        tr.id === deterministicTrId ||
        tr.sourceId === inv.id ||
        ((tr as any).invoiceId === inv.id) ||
        (tr.sourceType === sourceType && (tr as any).refNumber && String((tr as any).refNumber).trim() === String(inv.number).trim() && tr.direction === direction)
      );

      const desc = isPurchase
        ? `سداد فاتورة مشتريات رقم ${inv.number} (${branchName}) - ${inv.partyName || 'مورد'}`
        : `تحصيل فاتورة مبيعات رقم ${inv.number} (${branchName}) - ${inv.partyName || 'عميل'}`;

      if (!existingTr) {
        db.treasury.unshift({
          id: deterministicTrId,
          date: inv.date || getTodayDate(),
          direction,
          amount: paidAmount,
          method: inv.paymentMethod || 'نقدي',
          description: desc,
          sourceType,
          sourceId: inv.id,
          branchId: targetBranch,
          branchName: branchName
        });
        treasuryDiscrepanciesFixed++;
      } else {
        existingTr.id = deterministicTrId;
        if (Math.abs(existingTr.amount - paidAmount) > 0.01) {
          existingTr.amount = paidAmount;
          existingTr.method = inv.paymentMethod || existingTr.method || 'نقدي';
          existingTr.description = desc;
          treasuryDiscrepanciesFixed++;
        }
      }
    }
  });

  // 4. إزالة أي حركات مكررة متبقية لضمان وجود حركة واحدة فقط لكل بند
  // وإلغاء أي حركات افتتاحية مكررة لأصناف لها فواتير مشتريات موثقة لضمان أن رصيد المخزن يطابق فواتير المشتريات دون زيادة أو تكرار
  const productsWithPurchases = new Set<string>();
  db.stockMovements.forEach(sm => {
    if (sm.type === 'purchase' && sm.productId) {
      productsWithPurchases.add(sm.productId);
    }
  });

  const seenSmKeys = new Set<string>();
  const deduplicatedMovements: StockMovement[] = [];
  const validInvoiceIds = new Set((db.invoices || []).map(i => i.id));

  for (const sm of db.stockMovements) {
    // إزالة الحركات الشبحية أو اليتيمة التي ليس لها فاتورة فعلية مسجلة (مع الحفاظ على أذون الاستلام GRN)
    if (sm.type === 'purchase' || sm.type === 'sale' || sm.type === 'purchase_return' || sm.type === 'sale_return') {
      if (!sm.sourceId || (!validInvoiceIds.has(sm.sourceId) && !sm.sourceId.startsWith('grn_'))) {
        continue;
      }
    }
    // إذا كان للصنف فاتورة شراء، فإن فواتير المشتريات هي مصدر رصيده المعتمد، ولا يُحتسب له رصيد افتتاحي مكرر
    if (sm.type === 'opening' && productsWithPurchases.has(sm.productId)) {
      continue;
    }
    const key = sm.sourceId ? `${sm.sourceId}::${sm.productId}` : sm.id;
    if (!seenSmKeys.has(key)) {
      seenSmKeys.add(key);
      if (sm.sourceId && sm.productId) {
        sm.id = getDeterministicStockMovementId(sm.sourceId, sm.productId);
      }
      deduplicatedMovements.push(sm);
    }
  }
  db.stockMovements = deduplicatedMovements;

  // 5. إعادة احتساب أرصدة الأصناف بدقة تامة في تمريرة واحدة O(N) من سجل حركات المخزون وفواتير المشتريات الفعلية
  const costIndex = buildPurchaseCostMap(db);
  const qtyByProdId = new Map<string, number>();
  const qtyByNormName = new Map<string, number>();
  const prodIdsSet = new Set(db.products.map(p => p.id));
  for (const sm of db.stockMovements) {
    const chg = Number(sm.qtyChange) || 0;
    if (sm.productId && prodIdsSet.has(sm.productId)) {
      qtyByProdId.set(sm.productId, (qtyByProdId.get(sm.productId) || 0) + chg);
    } else if (sm.productName) {
      const nName = normalizeArabicText(sm.productName);
      if (nName) {
        qtyByNormName.set(nName, (qtyByNormName.get(nName) || 0) + chg);
      }
    }
  }

  let correctedProductsCount = 0;
  db.products.forEach(p => {
    const normPName = normalizeArabicText(p.name);
    const totalQty = Number(((qtyByProdId.get(p.id) || 0) + (qtyByNormName.get(normPName) || 0)).toFixed(4));

    // احتساب متوسط التكلفة وآخر سعر شراء حصرياً من فواتير الشراء المسجلة فعلياً لكل صنف
    const costInfo = costIndex.getCost(p.id, p.name);
    let latestBuy = p.buyPrice || 0;
    let avgCost = p.avgCost || p.buyPrice || 0;

    if (costInfo.hasPurchases) {
      latestBuy = costInfo.latestBuyPrice;
      avgCost = costInfo.avgCost;
    }

    if (p.currentQty !== totalQty || p.buyPrice !== latestBuy || p.avgCost !== avgCost) {
      p.currentQty = totalQty;
      p.buyPrice = latestBuy;
      p.avgCost = avgCost;
      correctedProductsCount++;
    }

    const bData = p.branchesData || {};
    p.branchesData = bData;
    const branchInfo: BranchProductData = {
      currentQty: totalQty,
      buyPrice: latestBuy,
      sellPrice: p.sellPrice,
      wholesalePrice: p.wholesalePrice,
      minStock: p.minStock || 5,
      avgCost
    };
    bData['br_mawan'] = { ...branchInfo };
    bData['br_main'] = { ...branchInfo };
    if (db.branches) {
      db.branches.forEach(b => {
        bData[b.id] = { ...branchInfo };
      });
    }
  });

  // 6. مطابقة تكلفة بضاعة المبيعات حصرياً مع فواتير الشراء المسجلة وإزالة أي معادلات تقديرية قديمة
  (db.invoices || []).forEach(inv => {
    if (inv.type === 'sale' || inv.invoiceKind === 'sale' || inv.invoiceKind === 'wholesale') {
      inv.items?.forEach(it => {
        const itemCost = costIndex.getCost(it.productId, it.productName);
        if (itemCost.hasPurchases) {
          const verifiedCost = (db.settings?.cost === 'average')
            ? (itemCost.avgCost || itemCost.latestBuyPrice)
            : (itemCost.latestBuyPrice || itemCost.avgCost);
          it.costPrice = verifiedCost;
        }
      });
    }
  });

  // تحديث تكلفة الوحدة في حركات مبيعات المخزون وفقاً للتكلفة الحقيقية
  db.stockMovements.forEach(sm => {
    if (sm.type === 'sale') {
      const itemCost = costIndex.getCost(sm.productId, sm.productName);
      if (itemCost.hasPurchases) {
        sm.unitCost = (db.settings?.cost === 'average')
          ? (itemCost.avgCost || itemCost.latestBuyPrice)
          : (itemCost.latestBuyPrice || itemCost.avgCost);
      }
    }
  });

  const totalPurchaseInvoices = db.invoices.filter(i => i.type === 'purchase' || i.invoiceKind === 'purchase').length;
  const totalStockUnitsInWarehouse = db.products.reduce((sum, p) => sum + (p.currentQty || 0), 0);

  return {
    db,
    report: {
      totalPurchaseInvoices,
      invoicesWithMissingMovements,
      missingMovementsAdded,
      correctedProductsCount,
      treasuryDiscrepanciesFixed,
      totalCatalogProducts: db.products.length,
      totalStockUnitsInWarehouse,
      details
    }
  };
}

/**
 * Reconciles and guarantees 100% atomic posting of all invoice items into stock movements and catalog balances.
 * Delegates directly to verifyAndCorrectStockMovements for 100% unified, deduplicated consistency.
 */
export function reconcileAndEnsureAllInvoiceStock(db: AccountingDB): { db: AccountingDB; reconciledCount: number; fixedMovementsCount: number } {
  const result = verifyAndCorrectStockMovements(db);
  return {
    db: result.db,
    reconciledCount: result.report.invoicesWithMissingMovements + result.report.correctedProductsCount,
    fixedMovementsCount: result.report.missingMovementsAdded
  };
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
  // 🏢 إعدادات المنشأة - الحفاظ التام على ما يحدده المستخدم وعدم استبداله
  // ==========================================
  if (!db.settings.company || !db.settings.company.trim()) {
    db.settings.company = 'شركة الموان';
  }
  if (!db.settings.companyCode || !db.settings.companyCode.trim()) {
    db.settings.companyCode = 'COMP-102';
  }
  db.settings.invoiceTitle = db.settings.invoiceTitle || 'بيان';
  if (!db.settings.companyPin) {
    db.settings.companyPin = '2919';
  }

  // Ensure modern clean state without ever wiping user-entered products, invoices, or parties
  if (!db.cleanGeneration) db.cleanGeneration = 5;
  if (!db.products) db.products = [];
  if (!db.customers) db.customers = [];
  if (!db.suppliers) db.suppliers = [];
  if (!db.invoices) db.invoices = [];
  if (!db.vouchers) db.vouchers = [];
  if (!db.stockMovements) db.stockMovements = [];
  if (!db.returns) db.returns = [];
  if (!db.adjustments) db.adjustments = [];
  if (!db.transfers) db.transfers = [];
  if (!db.treasury) db.treasury = [];
  if (!db.expenses) db.expenses = [];
  if (!db.revenues) db.revenues = [];
  if (!db.journals) db.journals = [];
  if (!db.quotes) db.quotes = [];
  if (!db.orders) db.orders = [];
  if (!db.deletedInvoiceIds) db.deletedInvoiceIds = [];

  // إزالة نهائية ودائمة لفواتير COMP-101 المدمجة الـ 10 (Muhammed Raşad) وأي فواتير محذوفة مسجلة في سجل الحذف
  const blockedIds = new Set<string>([
    ...PURGED_COMP101_INVOICE_IDS,
    ...(db.deletedInvoiceIds || [])
  ]);
  const removedInvNumbers = new Set<string>();
  const removedInvIds = new Set<string>(blockedIds);

  db.invoices = db.invoices.filter(inv => {
    if (!inv) return false;
    if (isPurgedEkhwaInvoice(inv) || blockedIds.has(inv.id)) {
      if (inv.id) removedInvIds.add(inv.id);
      if (inv.number) removedInvNumbers.add(String(inv.number));
      return false;
    }
    return true;
  });

  if (removedInvIds.size > 0) {
    db.stockMovements = db.stockMovements.filter(sm => !sm.sourceId || !removedInvIds.has(sm.sourceId));
    db.vouchers = db.vouchers.filter(v => !((v as any).invoiceId && removedInvIds.has((v as any).invoiceId)) && !((v as any).sourceId && removedInvIds.has((v as any).sourceId)));
    db.treasury = db.treasury.filter(tr => !tr.sourceId || !removedInvIds.has(tr.sourceId));
    db.journals = db.journals.filter(j => !j.sourceId || !removedInvIds.has(j.sourceId));
  }

  // إزالة الأصناف الـ 22 الدخيلة الخاصة بفواتير COMP-101 المدمجة فقط إذا لم تعد مستخدمة في أي فاتورة حقيقية
  const activeProductIds = new Set<string>();
  db.invoices.forEach(inv => inv.items?.forEach(it => { if (it.productId) activeProductIds.add(it.productId); }));
  db.products = db.products.filter(p => !(PURGED_COMP101_PRODUCT_IDS.has(p.id) && !activeProductIds.has(p.id)));

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

  // Single unified branch: synchronized with user-defined company name
  const compName = db.settings.company?.trim() || 'شركة الموان';
  if (!db.branches || db.branches.length === 0) {
    db.branches = [
      {
        id: 'br_mawan',
        name: `الفرع الرئيسي - ${compName}`,
        code: 'BR-01',
        isMain: true,
        pin: db.settings.companyPin || '2919'
      }
    ];
  } else {
    db.branches[0].pin = db.settings.companyPin || db.branches[0].pin || '2919';
    if (db.branches[0].name.startsWith('الفرع الرئيسي')) {
      db.branches[0].name = `الفرع الرئيسي - ${compName}`;
    }
  }

  // Warehouses: synchronized with user-defined company name
  if (!db.warehouses || db.warehouses.length === 0) {
    db.warehouses = [
      {
        id: 'wh_mawan',
        name: `مخزن ${compName} الرئيسي`,
        location: 'المقر الرئيسي',
        isDefault: true
      }
    ];
  } else if (db.warehouses[0].name.includes('الرئيسي')) {
    db.warehouses[0].name = `مخزن ${compName} الرئيسي`;
  }

  // Default currentUser
  if (!db.currentUser || !db.users.some(u => u.id === db.currentUser.id)) {
    db.currentUser = db.users[0];
  }

  // Ensure "شركة الرحمة للحدايد والبويات" supplier is registered and never lost
  const rahmaSupplierName = 'شركة الرحمة للحدايد والبويات';
  let rahmaSupplier = db.suppliers.find(s => s.name?.includes('الرحمة') || s.name === rahmaSupplierName);
  if (!rahmaSupplier) {
    rahmaSupplier = {
      id: 'supp_rahma_iron',
      code: 'S-001',
      name: rahmaSupplierName,
      company: rahmaSupplierName,
      phone: '',
      address: 'المقر الرئيسي',
      type: 'supplier',
      balance: 0,
      openingBalance: 0,
      creditLimit: 0,
      notes: 'مورد معتمد - توريدات حدايد وبويات'
    };
    db.suppliers.unshift(rahmaSupplier);
  }

  // Ensure Invoice #17 preserves Ahmed Nazih as creator and Mohamed Nazih as modifier, with all 15 items untouched
  const inv17 = db.invoices?.find(
    i => (i.number === '17' && (i.type === 'purchase' || i.invoiceKind === 'purchase')) ||
         (i.partyName && i.partyName.includes('الرحمة'))
  );
  if (inv17) {
    if (!inv17.createdBy || inv17.createdBy === 'مدير النظام') {
      inv17.createdBy = 'Ahmed Nazih';
    }
    // If modified, ensure editor is Mohamed Nazih as intended
    if (!inv17.updatedBy || inv17.updatedBy === inv17.createdBy) {
      inv17.updatedBy = 'Mohamed Nazih';
    }
    if (!inv17.items || inv17.items.length < 15) {
      inv17.items = JSON.parse(JSON.stringify(RAHMA_INVOICE_17_ITEMS));
      inv17.total = 4319.14;
      inv17.subtotal = 4319.14;
      inv17.paid = 4319.14;
      inv17.remaining = 0;
      inv17.status = 'مدفوع';
      inv17.branchId = 'br_mawan';
      inv17.branchName = 'الفرع الرئيسي - شركة الموان';
      inv17.paymentMethod = 'نقدي';
    }
  }

  // Retroactively verify and correct all purchase invoice items, stock movements, and treasury impacts (single O(N) pass)
  db = verifyAndCorrectStockMovements(db).db;

  // Retroactively audit and deduplicate all vouchers, treasury entries, and phantom deductions
  db = reconcileAndDeduplicateAllFinancialRecords(db).db;

  // Retroactively ensure all invoices with payments match their linked vouchers down to the millimeter
  if (db.invoices && db.invoices.length > 0) {
    db = syncAllExistingInvoiceVouchers(db).db;
  }

  return db;
}

/**
 * Strictly wipes all invoices from the system, resets sequential invoice numbers, and purges linked vouchers
 */
export function wipeAllInvoicesFromSystem(db: AccountingDB): AccountingDB {
  const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
  updated.invoices = [];
  // Keep non-invoice vouchers (manual receipts/payments) but remove invoice vouchers
  updated.vouchers = (updated.vouchers || []).filter(v => !v.invoiceId);
  // Keep only opening stock movements if any, remove all invoice stock movements
  updated.stockMovements = (updated.stockMovements || []).filter(sm => sm.type === 'opening');
  // Clean treasury entries linked to invoices
  updated.treasury = (updated.treasury || []).filter(tr => tr.sourceType !== 'purchase' && tr.sourceType !== 'sale');
  // Clean journals linked to invoices
  updated.journals = (updated.journals || []).filter(j => j.sourceType !== 'purchase' && j.sourceType !== 'sale');
  
  // Reset counters to 1
  updated.settings.nextPurchase = 1;
  updated.settings.nextSale = 1;
  updated.settings.nextReceipt = 1;
  updated.settings.nextPayment = 1;
  updated.settings.nextQuote = 1;
  updated.settings.nextOrder = 1;
  
  // Recalculate customer and supplier balances
  (updated.customers || []).forEach(c => {
    c.balance = 0;
  });
  (updated.suppliers || []).forEach(s => {
    s.balance = 0;
  });

  logAudit(updated, 'تصفير شامل للفواتير', 'تم حذف وتصفير كافة فواتير المبيعات والمشتريات من النظام بالكامل');
  return sanitizeCompanyDatabase(updated);
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
      nextSale: 1,
      nextPurchase: 1,
      nextSaleReturn: 1,
      nextPurchaseReturn: 1,
      nextReceipt: 1,
      nextPayment: 1,
      nextQuote: 1,
      nextOrder: 1,
      nextGRN: 1
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

/**
 * Completely purges all transactional data, customers, suppliers, inventory, products, invoices,
 * returns, vouchers, treasury, and resets all sequences to 1 to allow starting 100% fresh
 */
export function wipeEntireSystemToCleanSlate(db: AccountingDB): AccountingDB {
  const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
  updated.products = [];
  updated.customers = [];
  updated.suppliers = [];
  updated.invoices = [];
  updated.returns = [];
  updated.stockMovements = [];
  updated.adjustments = [];
  updated.transfers = [];
  updated.treasury = [];
  updated.vouchers = [];
  updated.expenses = [];
  updated.revenues = [];
  updated.journals = [];
  updated.quotes = [];
  updated.orders = [];
  updated.settings.nextPurchase = 1;
  updated.settings.nextSale = 1;
  updated.settings.nextSaleReturn = 1;
  updated.settings.nextPurchaseReturn = 1;
  updated.settings.nextPayment = 1;
  updated.settings.nextReceipt = 1;
  updated.settings.nextQuote = 1;
  updated.settings.nextOrder = 1;
  updated.cleanGeneration = 5;

  logAudit(
    updated,
    'تصفير شامل وتنظيف النظام بالكامل للبدء على بياض',
    'تم مسح وتصفير كافة الأصناف والعملاء والموردين وفواتير البيع والشراء والمرتجعات وحركات الخزينة والمخزون بنجاح لتأسيس بيانات نظيفة جديدة'
  );
  return sanitizeCompanyDatabase(updated);
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

  const products: Product[] = [];
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

  // Asynchronously store full database in IndexedDB (supports millions of records & gigabytes)
  saveToIndexedDB(db, idbKey);

  try {
    // Only cache in localStorage when compact enough (< 3.5MB) to prevent quota lockups & UI lag at high scale
    if ((db.invoices?.length || 0) <= 1200) {
      const json = JSON.stringify(db);
      if (json.length < 3_500_000) {
        localStorage.setItem(storageKey, json);
      }
    }
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

  // Always save full database to IndexedDB (scalable to millions of invoices)
  saveToIndexedDB(db, IDB_KEY);
  try {
    if ((db.invoices?.length || 0) <= 1200) {
      const json = JSON.stringify(db);
      if (json.length < 3_500_000) {
        localStorage.setItem(STORAGE_KEY, json);
      }
    }
  } catch (err) {
    console.warn('localStorage limit notice (safely persisted in IndexedDB):', err);
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

export function isBranchMatch(itemBranchId?: string, targetBranchId?: string): boolean {
  if (!targetBranchId || targetBranchId === 'all') return true;
  if (itemBranchId === targetBranchId) return true;
  const isTargetPrimary = targetBranchId === 'br_main' || targetBranchId === 'br_mawan';
  const isItemPrimary = !itemBranchId || itemBranchId === 'br_main' || itemBranchId === 'br_mawan';
  return isTargetPrimary && isItemPrimary;
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
      if (isBranchMatch(inv.branchId, branchId)) {
        balance += (Number(inv.total) - Number(inv.paid));
      }
    }
  });

  // Subtract receipts (only standalone vouchers, as invoice remaining already deducts invoice.paid)
  db.vouchers.forEach(v => {
    if (v.type === 'receipt' && v.partyId === customerId) {
      const isInvoiceLinked = Boolean(v.invoiceId || (v.referenceNumber && db.invoices.some(i => i.number === v.referenceNumber)));
      if (!isInvoiceLinked) {
        if (isBranchMatch(v.branchId, branchId)) {
          balance -= Number(v.amount);
        }
      }
    }
  });

  // Subtract sale returns
  db.returns.forEach(r => {
    if (r.type === 'sale' && r.partyId === customerId) {
      if (r.paymentMethod === 'آجل') {
        if (isBranchMatch(r.branchId, branchId)) {
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
      if (isBranchMatch(inv.branchId, branchId)) {
        balance += (Number(inv.total) - Number(inv.paid));
      }
    }
  });

  // Subtract payments (only standalone vouchers, as invoice remaining already deducts invoice.paid)
  db.vouchers.forEach(v => {
    if (v.type === 'payment' && v.partyId === supplierId) {
      const isInvoiceLinked = Boolean(v.invoiceId || (v.referenceNumber && db.invoices.some(i => i.number === v.referenceNumber)));
      if (!isInvoiceLinked) {
        if (isBranchMatch(v.branchId, branchId)) {
          balance -= Number(v.amount);
        }
      }
    }
  });

  // Subtract purchase returns
  db.returns.forEach(r => {
    if (r.type === 'purchase' && r.partyId === supplierId) {
      if (r.paymentMethod === 'آجل') {
        if (isBranchMatch(r.branchId, branchId)) {
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
    .filter(entry => isBranchMatch(entry.branchId, branchId))
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

  const isTargetBranch = (bId?: string) => isBranchMatch(bId, branchId);

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
  const targetBranch = branchId || 'br_mawan';
  const isPrimary = targetBranch === 'br_main' || targetBranch === 'br_mawan';

  // Check if branch-specific data is already defined
  const branchKey = isPrimary
    ? (product.branchesData?.['br_mawan'] ? 'br_mawan' : 'br_main')
    : targetBranch;

  const bData = product.branchesData?.[branchKey] || (isPrimary ? (product.branchesData?.['br_mawan'] || product.branchesData?.['br_main']) : undefined);

  if (bData) {
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
  if (isPrimary || !product.branchesData || Object.keys(product.branchesData).length === 0) {
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
  const targetBranch = branchId || 'br_mawan';
  const existingBranchesData = { ...(product.branchesData || {}) };
  const isPrimaryBranch = targetBranch === 'br_main' || targetBranch === 'br_mawan' || !product.branchesData || Object.keys(product.branchesData).length <= 1;

  // Current branch numbers (or initial product values for primary branches)
  const currentBranchData: BranchProductData = existingBranchesData[targetBranch] ||
    (isPrimaryBranch ? (existingBranchesData['br_mawan'] || existingBranchesData['br_main']) : undefined) || {
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

  // Keep br_mawan and br_main in lockstep for primary branch
  if (isPrimaryBranch) {
    existingBranchesData['br_mawan'] = { ...updatedBranchData };
    existingBranchesData['br_main'] = { ...updatedBranchData };
  }

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
  if (!inv) return true;
  if (inv.id && PURGED_COMP101_INVOICE_IDS.has(inv.id)) return true;
  const creator = (inv.createdBy || '').trim();
  if (creator === 'Muhammed Raşad') return true;
  return false;
}

export function mergeInvoices(
  existingList: Invoice[] = [],
  incomingList: Invoice[] = [],
  deletedIds?: Set<string>
): Invoice[] {
  const map = new Map<string, Invoice>();

  const mergeTwoInvoices = (a: Invoice, b: Invoice): Invoice => {
    const timeA = new Date(a.updatedAt || a.createdAt || a.date || 0).getTime();
    const timeB = new Date(b.updatedAt || b.createdAt || b.date || 0).getTime();
    const itemsA = a.items?.length || 0;
    const itemsB = b.items?.length || 0;

    // Prefer the richer one if items count differs; otherwise newer timestamp
    const primary = itemsA !== itemsB ? (itemsA > itemsB ? a : b) : (timeB >= timeA ? b : a);
    const secondary = primary === b ? a : b;

    // Original creator is preserved
    const effectiveCreatedBy = a.createdBy || b.createdBy;
    const effectiveCreatedById = a.createdById || b.createdById;
    const effectiveCreatedAt = a.createdAt || b.createdAt;

    // Editor is captured
    let effectiveUpdatedBy = b.updatedBy || a.updatedBy;
    if (!effectiveUpdatedBy && b.createdBy && a.createdBy && b.createdBy !== a.createdBy) {
      effectiveUpdatedBy = timeB > timeA ? b.createdBy : a.createdBy;
    }
    const effectiveUpdatedById = b.updatedById || a.updatedById;
    const effectiveUpdatedAt = b.updatedAt || a.updatedAt || (effectiveUpdatedBy ? new Date().toISOString() : undefined);

    // Merge audit log
    const seenAudits = new Set<string>();
    const mergedAudit = [...(a.auditLog || []), ...(b.auditLog || [])].filter(aud => {
      if (!aud.id || seenAudits.has(aud.id)) return false;
      seenAudits.add(aud.id);
      return true;
    }).sort((x, y) => new Date(y.timestamp).getTime() - new Date(x.timestamp).getTime());

    return {
      ...primary,
      items: primary.items && primary.items.length > 0 ? primary.items : (secondary.items || []),
      createdBy: effectiveCreatedBy,
      createdById: effectiveCreatedById,
      createdAt: effectiveCreatedAt,
      updatedBy: effectiveUpdatedBy,
      updatedById: effectiveUpdatedById,
      updatedAt: effectiveUpdatedAt,
      auditLog: mergedAudit
    };
  };

  (existingList || []).forEach(inv => {
    if (!inv || isPurgedEkhwaInvoice(inv) || (inv.id && deletedIds?.has(inv.id))) return;
    if (inv.id || inv.number) {
      if (inv.id) map.set(inv.id, inv);
      if (inv.number) map.set(`${inv.type || inv.invoiceKind}_${inv.number}`, inv);
    }
  });

  (incomingList || []).forEach(inv => {
    if (!inv || isPurgedEkhwaInvoice(inv) || (inv.id && deletedIds?.has(inv.id))) return;
    if (inv.id || inv.number) {
      const byId = inv.id ? map.get(inv.id) : undefined;
      const byNum = inv.number ? map.get(`${inv.type || inv.invoiceKind}_${inv.number}`) : undefined;
      const existing = byId || byNum;

      if (!existing) {
        if (inv.id) map.set(inv.id, inv);
        if (inv.number) map.set(`${inv.type || inv.invoiceKind}_${inv.number}`, inv);
      } else {
        const merged = mergeTwoInvoices(existing, inv);
        if (merged.id) map.set(merged.id, merged);
        if (merged.number) map.set(`${merged.type || merged.invoiceKind}_${merged.number}`, merged);
      }
    }
  });

  const unique = new Map<string, Invoice>();
  Array.from(map.values()).forEach(inv => {
    const key = inv.id || `${inv.type || inv.invoiceKind}_${inv.number}`;
    unique.set(key, inv);
  });

  return Array.from(unique.values()).sort((a, b) => (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || ''));
}

/**
 * Union & merge vouchers safely by deterministic ID or composite key to prevent loss and duplicate vouchers across phones
 */
export function mergeVouchers(existingList: Voucher[] = [], incomingList: Voucher[] = []): Voucher[] {
  const map = new Map<string, Voucher>();
  const getKey = (v: Voucher) => {
    if (v.invoiceId) {
      return `vch_inv_${v.invoiceId}_${v.type}`;
    }
    if ((v as any).referenceNumber && v.type) {
      return `vch_ref_${(v as any).referenceNumber}_${v.type}`;
    }
    return v.id;
  };

  (existingList || []).forEach(v => {
    if (v && v.id) map.set(getKey(v), v);
  });
  (incomingList || []).forEach(v => {
    if (v && v.id) {
      const key = getKey(v);
      const existing = map.get(key);
      map.set(key, existing ? { ...existing, ...v } : v);
    }
  });
  return Array.from(map.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export function mergeTreasury(existingList: TreasuryEntry[] = [], incomingList: TreasuryEntry[] = []): TreasuryEntry[] {
  const map = new Map<string, TreasuryEntry>();
  const getKey = (tr: TreasuryEntry) => {
    if (tr.sourceId && tr.sourceType) {
      return `tr_${tr.sourceType}_${tr.sourceId}_${tr.direction}`;
    }
    return tr.id;
  };

  (existingList || []).forEach(tr => {
    if (tr && tr.id) map.set(getKey(tr), tr);
  });
  (incomingList || []).forEach(tr => {
    if (tr && tr.id) {
      const key = getKey(tr);
      const existing = map.get(key);
      map.set(key, existing ? { ...existing, ...tr } : tr);
    }
  });
  return Array.from(map.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export function mergeStockMovements(existingList: StockMovement[] = [], incomingList: StockMovement[] = []): StockMovement[] {
  const map = new Map<string, StockMovement>();
  const getKey = (sm: StockMovement) => {
    if (sm.sourceId && sm.productId) {
      return `sm_${sm.sourceId}_${sm.productId}`;
    }
    return sm.id;
  };
  (existingList || []).forEach(sm => {
    if (sm && (sm.id || (sm.sourceId && sm.productId))) {
      const key = getKey(sm);
      const normalizedSm = (sm.sourceId && sm.productId)
        ? { ...sm, id: `sm_${sm.sourceId}_${sm.productId}` }
        : sm;
      map.set(key, normalizedSm);
    }
  });
  (incomingList || []).forEach(sm => {
    if (sm && (sm.id || (sm.sourceId && sm.productId))) {
      const key = getKey(sm);
      const existing = map.get(key);
      const merged = existing ? { ...existing, ...sm } : sm;
      if (merged.sourceId && merged.productId) {
        merged.id = `sm_${merged.sourceId}_${merged.productId}`;
      }
      map.set(key, merged);
    }
  });
  return Array.from(map.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

/**
 * Union & merge product catalogs across devices by normalized Arabic name or ID,
 * preserving newly created products and updated pricing before stock verification recalculates balances/costs.
 */
export function mergeProducts(existingList: Product[] = [], incomingList: Product[] = []): Product[] {
  const byKey = new Map<string, Product>();
  const idToKey = new Map<string, string>();

  const registerProduct = (p: Product, isIncoming: boolean) => {
    if (!p || !p.name) return;
    const norm = normalizeArabicText(p.name);
    const key = (p.id && idToKey.get(p.id)) || (norm ? `name:${norm}` : `id:${p.id}`);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, p);
      if (p.id) idToKey.set(p.id, key);
    } else {
      const merged = isIncoming
        ? {
            ...existing,
            ...p,
            barcode: (p.barcode && p.barcode.trim()) ? p.barcode : existing.barcode,
            notes: (p.notes && p.notes.trim()) ? p.notes : existing.notes,
            sellPrice: (Number(p.sellPrice) > 0) ? p.sellPrice : existing.sellPrice,
            wholesalePrice: (Number(p.wholesalePrice) > 0) ? p.wholesalePrice : existing.wholesalePrice,
            buyPrice: (Number(p.buyPrice) > 0) ? p.buyPrice : existing.buyPrice,
            avgCost: (Number(p.avgCost) > 0) ? p.avgCost : existing.avgCost,
          }
        : existing;
      byKey.set(key, merged);
      if (p.id) idToKey.set(p.id, key);
    }
  };

  (existingList || []).forEach(p => registerProduct(p, false));
  (incomingList || []).forEach(p => registerProduct(p, true));

  return Array.from(byKey.values());
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

  const invKindStr = invoice.invoiceKind || invoice.type;
  const expectedSmType = invKindStr === 'sale_return'
    ? 'sale_return'
    : invKindStr === 'purchase_return'
      ? 'purchase_return'
      : invoice.type === 'purchase'
        ? 'purchase'
        : 'sale';
  const expectedTrSourceType = expectedSmType;
  const expectedVoucherType: 'receipt' | 'payment' =
    (invoice.type === 'sale' || invKindStr === 'purchase_return') ? 'receipt' : 'payment';
  const expectedTrPrefix = invoice.type === 'purchase'
    ? `فاتورة مشتريات رقم ${invoice.number}`
    : `فاتورة مبيعات رقم ${invoice.number}`;

  // 2. Remove related stock movements (strictly scoped by sourceId OR matching movement type + refNumber)
  updated.stockMovements = updated.stockMovements.filter(
    sm => sm.sourceId !== invoice.id && !(!sm.sourceId && sm.refNumber === invoice.number && sm.type === expectedSmType)
  );

  // 3. Remove all treasury entries related to this invoice (strictly by id OR matching sourceType + invoice number)
  updated.treasury = updated.treasury.filter(tr => {
    if (tr.sourceId === invoice.id || (tr as any).invoiceId === invoice.id || (tr.id && invoice.id && tr.id.includes(invoice.id))) return false;
    if ((tr as any).refNumber && String((tr as any).refNumber).trim() === String(invoice.number).trim() && tr.sourceType === expectedTrSourceType) return false;
    if (invoice.number && tr.description && tr.sourceType === expectedTrSourceType && (
      tr.description.includes(expectedTrPrefix) ||
      tr.description.includes(`مرتجع رقم ${invoice.number}`)
    )) {
      return false;
    }
    return true;
  });

  // 4. Remove journal entry
  updated.journals = updated.journals.filter(
    j => j.sourceId !== invoice.id && j.id !== invoice.journalEntryId && (!j.id.includes(invoice.id))
  );

  // 5. Remove any return entries
  if (updated.returns) {
    updated.returns = updated.returns.filter(
      r => r.originalInvoiceId !== invoice.id && !(r.number === invoice.number && r.type === invoice.type)
    );
  }

  // 5.5. Remove any linked payment/receipt vouchers created for this invoice and their journals
  const linkedVoucherIds = new Set<string>();
  if (updated.vouchers) {
    updated.vouchers = updated.vouchers.filter(v => {
      const isLinked = (v.id && invoice.id && v.id.includes(invoice.id)) ||
                       (v as any).sourceId === invoice.id ||
                       (v as any).invoiceId === invoice.id ||
                       ((v as any).referenceNumber === invoice.number && v.type === expectedVoucherType) ||
                       (v.type === expectedVoucherType && v.description && v.description.includes(expectedTrPrefix));
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

  // 6. Remove the invoice itself & record permanent deletion tombstone so it never resurrects across devices
  updated.invoices = updated.invoices.filter(i => i.id !== invoice.id);
  updated.deletedInvoiceIds = Array.from(new Set([...(updated.deletedInvoiceIds || []), invoice.id]));

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
 * Deletes any voucher (receipt or payment) and cleanly reverts:
 * - Treasury entry and balance
 * - General journal double-entry
 * - Party (customer/supplier) balance
 * - Audit trail
 */
export function deleteVoucherAndRevert(db: AccountingDB, voucher: Voucher): AccountingDB {
  const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;

  // 1. Remove treasury entry
  updated.treasury = updated.treasury.filter(tr => tr.sourceId !== voucher.id && tr.id !== voucher.id && !tr.id.includes(voucher.id));

  // 2. Remove journal entry
  updated.journals = updated.journals.filter(j => j.sourceId !== voucher.id && j.id !== voucher.journalEntryId);

  // 3. Remove voucher
  updated.vouchers = updated.vouchers.filter(item => item.id !== voucher.id);

  // 3.5. If voucher was linked to an invoice, revert invoice paid and remaining amount
  if (voucher.invoiceId || (voucher as any).referenceNumber) {
    const expectedInvType = voucher.type === 'receipt' ? 'sale' : 'purchase';
    const linkedInv =
      (voucher.invoiceId ? updated.invoices.find(i => i.id === voucher.invoiceId) : undefined) ||
      ((voucher as any).referenceNumber
        ? updated.invoices.find(i => i.number === (voucher as any).referenceNumber && i.type === expectedInvType)
        : undefined);
    if (linkedInv) {
      linkedInv.paid = Math.max(0, (linkedInv.paid || 0) - voucher.amount);
      linkedInv.remaining = Math.max(0, (linkedInv.total || 0) - linkedInv.paid);
      linkedInv.status = linkedInv.paid <= 0 ? 'آجل' : linkedInv.remaining <= 0 ? 'مدفوع' : 'جزئي';
    }
  }

  // 4. Update party balance
  if (voucher.partyId) {
    const cust = updated.customers.find(c => c.id === voucher.partyId);
    if (cust) {
      cust.balance = calculateCustomerBalance(updated, cust.id);
    }
    const supp = updated.suppliers.find(s => s.id === voucher.partyId);
    if (supp) {
      supp.balance = calculateSupplierBalance(updated, supp.id);
    }
  }

  logAudit(
    updated,
    `حذف ${voucher.type === 'receipt' ? 'سند قبض' : 'سند صرف'} وعكس الأرصدة`,
    `تم حذف السند ${voucher.number} بقيمة ${voucher.amount} وعكس الخزينة وحساب الطرف بالكامل`
  );

  return updated;
}

/**
 * Deletes any stock adjustment and cleanly reverts:
 * - Branch product stock quantity back to what it was before the adjustment
 * - Stock movements log
 * - Inventory journals
 * - Audit trail
 */
export function deleteAdjustmentAndRevert(db: AccountingDB, adjustmentId: string): AccountingDB {
  const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
  const adj = (updated.adjustments || []).find(a => a.id === adjustmentId);
  if (!adj) return updated;

  // Revert product stock: adjustment applied diffQty = actualQty - systemQty
  // To revert, subtract diffQty from currentQty
  const prod = updated.products.find(p => p.id === adj.productId);
  if (prod) {
    const bId = adj.branchId || 'br_main';
    const bp = getProductForBranch(prod, bId);
    const revertedQty = bp.currentQty - adj.diffQty;
    const prodUpdated = updateProductBranchData(prod, bId, { currentQty: revertedQty });
    const pIdx = updated.products.findIndex(p => p.id === prod.id);
    if (pIdx > -1) updated.products[pIdx] = prodUpdated;
  }

  // Remove stock movements
  updated.stockMovements = (updated.stockMovements || []).filter(sm => sm.sourceId !== adj.id);
  // Remove journals
  updated.journals = (updated.journals || []).filter(j => j.sourceId !== adj.id);
  // Remove adjustment
  updated.adjustments = (updated.adjustments || []).filter(a => a.id !== adj.id);

  logAudit(updated, 'حذف تسوية جردية وعكس الرصيد', `تم حذف التسوية وعكس كمية المخزون بالكامل`);
  return updated;
}

/**
 * Deletes any manual treasury entry, expense, or revenue and cleanly reverts:
 * - Treasury balance
 * - Expenses / Revenues lists
 * - Journals
 * - Audit trail
 */
export function deleteTreasuryEntryAndRevert(db: AccountingDB, entryId: string): AccountingDB {
  const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
  const tr = updated.treasury.find(t => t.id === entryId);
  if (!tr) return updated;

  const targetSourceId = tr.sourceId || tr.id;

  // 1. If this was an expense or revenue, remove from expenses/revenues
  if (tr.sourceType === 'expense') {
    updated.expenses = (updated.expenses || []).filter(e => e.id !== targetSourceId && e.id !== entryId);
  } else if (tr.sourceType === 'revenue') {
    updated.revenues = (updated.revenues || []).filter(r => r.id !== targetSourceId && r.id !== entryId);
  }

  // 2. If this was linked to a voucher, remove the voucher and recalculate party balance
  if (tr.sourceType === 'voucher' || (updated.vouchers && updated.vouchers.some(v => v.id === targetSourceId))) {
    const voucher = (updated.vouchers || []).find(v => v.id === targetSourceId);
    if (voucher) {
      updated.vouchers = updated.vouchers.filter(v => v.id !== voucher.id);
      if (voucher.partyId) {
        const cust = updated.customers.find(c => c.id === voucher.partyId);
        if (cust) cust.balance = calculateCustomerBalance(updated, cust.id);
        const supp = updated.suppliers.find(s => s.id === voucher.partyId);
        if (supp) supp.balance = calculateSupplierBalance(updated, supp.id);
      }
    }
  }

  // 3. If this was linked to an invoice (purchase, sale, return), revert invoice paid/remaining and party balance
  const invoiceNumMatch = tr.description ? tr.description.match(/رقم\s*([A-Za-z0-9_-]+)/) : null;
  const invNumberExtracted = invoiceNumMatch ? invoiceNumMatch[1] : null;
  const expectedInvType = (tr.sourceType === 'purchase' || tr.sourceType === 'purchase_return')
    ? 'purchase'
    : (tr.sourceType === 'sale' || tr.sourceType === 'sale_return')
      ? 'sale'
      : undefined;
  const linkedInvoice =
    (updated.invoices || []).find(i => i.id === targetSourceId) ||
    (updated.invoices || []).find(i =>
      (!expectedInvType || i.type === expectedInvType) && (
        (invNumberExtracted && String(i.number).trim() === invNumberExtracted.trim()) ||
        ((tr as any).refNumber && String(i.number).trim() === String((tr as any).refNumber).trim())
      )
    );

  if (linkedInvoice) {
    linkedInvoice.paid = Math.max(0, (linkedInvoice.paid || 0) - tr.amount);
    linkedInvoice.remaining = Math.max(0, (linkedInvoice.total || 0) - linkedInvoice.paid);
    linkedInvoice.status = linkedInvoice.paid <= 0 ? 'آجل' : linkedInvoice.remaining <= 0 ? 'مدفوع' : 'جزئي';

    if (linkedInvoice.partyId) {
      const cust = updated.customers.find(c => c.id === linkedInvoice.partyId);
      if (cust) cust.balance = calculateCustomerBalance(updated, cust.id);
      const supp = updated.suppliers.find(s => s.id === linkedInvoice.partyId);
      if (supp) supp.balance = calculateSupplierBalance(updated, supp.id);
    }
  }

  // 4. Remove treasury entry
  updated.treasury = updated.treasury.filter(t => t.id !== entryId);

  // 5. Remove journals
  updated.journals = (updated.journals || []).filter(j => 
    j.sourceId !== targetSourceId && 
    j.id !== targetSourceId && 
    j.sourceId !== entryId && 
    j.id !== entryId
  );

  logAudit(
    updated,
    'حذف حركة خزينة وعكس الرصيد',
    `تم حذف حركة ${tr.direction === 'in' ? 'وارد' : 'صادر'} بقيمة ${tr.amount} وعكس رصيد الخزينة والفاتورة والأرصدة والقيود`
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

  return (db.invoices || []).some(inv => {
    if (excludeId && inv.id === excludeId) return false;
    if (mode) {
      if (mode === 'sale' || mode === 'wholesale') {
        const isThisSale = (inv.type === 'sale' || inv.invoiceKind === 'sale' || inv.invoiceKind === 'wholesale') && inv.invoiceKind !== 'sale_return';
        if (!isThisSale) return false;
      } else if (mode === 'purchase') {
        const isThisPurchase = (inv.type === 'purchase' || inv.invoiceKind === 'purchase') && inv.invoiceKind !== 'purchase_return';
        if (!isThisPurchase) return false;
      } else if (mode === 'sale_return') {
        const isThisSaleReturn = inv.invoiceKind === 'sale_return';
        if (!isThisSaleReturn) return false;
      } else if (mode === 'purchase_return') {
        const isThisPurchaseReturn = inv.invoiceKind === 'purchase_return';
        if (!isThisPurchaseReturn) return false;
      }
    }
    return String(inv.number).trim() === target;
  });
}

export function getNextUniqueInvoiceNumber(db: AccountingDB, mode?: string): { number: string; nextSeq: number } {
  // Pure integer numbering starting from 1 with NO letter prefixes, independent per section
  const sectionInvoices = (db.invoices || []).filter(inv => {
    if (mode === 'sale' || mode === 'wholesale') {
      return (inv.type === 'sale' || inv.invoiceKind === 'sale' || inv.invoiceKind === 'wholesale') && inv.invoiceKind !== 'sale_return';
    }
    if (mode === 'purchase') {
      return (inv.type === 'purchase' || inv.invoiceKind === 'purchase') && inv.invoiceKind !== 'purchase_return';
    }
    if (mode === 'sale_return') {
      return inv.invoiceKind === 'sale_return';
    }
    if (mode === 'purchase_return') {
      return inv.invoiceKind === 'purchase_return';
    }
    return true;
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
      id: getDeterministicVoucherId(invoice.id, 0, voucherType),
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
      // Remove any lingering linked voucher strictly matching THIS invoice's ID or type+number
      db.vouchers = db.vouchers.filter(v =>
        (v as any).invoiceId !== inv.id &&
        (v as any).sourceId !== inv.id &&
        !((v as any).referenceNumber === inv.number && v.type === expectedType)
      );
      return;
    }

    // Find linked voucher (match invoiceId / sourceId first, then exact type + number)
    const linkedVouchers = db.vouchers.filter(v => {
      return (v as any).invoiceId === inv.id ||
             (v as any).sourceId === inv.id ||
             ((v as any).referenceNumber === inv.number && v.type === expectedType) ||
             (v.description && v.description.includes(`رقم ${inv.number}`) && v.type === expectedType);
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



