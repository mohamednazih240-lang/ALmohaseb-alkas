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
  PaymentMethod
} from '../types/accounting';

const STORAGE_KEY = 'hesabaty_pro_db_v6';
const IDB_NAME = 'hesabaty_accounting_db';
const IDB_STORE = 'erp_storage';
const IDB_KEY = 'main_database_state';

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
export async function saveToIndexedDB(db: AccountingDB): Promise<void> {
  try {
    const idb = await openIndexedDB();
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.put(db, IDB_KEY);
  } catch (e) {
    console.warn('IndexedDB write notice:', e);
  }
}

/**
 * Asynchronously loads accounting database from IndexedDB
 */
export async function loadFromIndexedDB(): Promise<AccountingDB | null> {
  try {
    const idb = await openIndexedDB();
    return new Promise((resolve) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
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

export function defaultCurrencies(): Currency[] {
  return [
    { id: 'curr_egp', code: 'EGP', name: 'الجنيه المصري', symbol: 'ج.م', rate: 1, isBase: true, lastUpdated: getTodayDate() },
    { id: 'curr_usd', code: 'USD', name: 'الدولار الأمريكي', symbol: '$', rate: 48.5, isBase: false, lastUpdated: getTodayDate() },
    { id: 'curr_sar', code: 'SAR', name: 'الريال السعودي', symbol: 'ر.س', rate: 12.9, isBase: false, lastUpdated: getTodayDate() },
    { id: 'curr_eur', code: 'EUR', name: 'اليورو الأوروبي', symbol: '€', rate: 52.8, isBase: false, lastUpdated: getTodayDate() },
    { id: 'curr_aed', code: 'AED', name: 'الدرهم الإماراتي', symbol: 'د.إ', rate: 13.2, isBase: false, lastUpdated: getTodayDate() },
    { id: 'curr_kwd', code: 'KWD', name: 'الدينار الكويتي', symbol: 'د.ك', rate: 158.0, isBase: false, lastUpdated: getTodayDate() }
  ];
}

export function defaultSettings(): AppSettings {
  return {
    company: 'الشركة التجارية للتوزيع',
    phone: '',
    address: 'المقر الرئيسي',
    currency: 'ج.م',
    invoiceTitle: 'فاتورة ضريبية مبسطة',
    low: 5,
    cost: 'average',
    tax: 'disabled',
    taxRate: 14,
    notes: 'البضاعة المباعة ترد وتستبدل خلال 14 يوماً وفقاً لحالتها الأصلية',
    nextSale: 1001,
    nextPurchase: 2001,
    nextReceipt: 3001,
    nextPayment: 4001,
    nextQuote: 5001,
    nextOrder: 6001
  };
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

export function createSeedData(): AccountingDB {
  const settings = defaultSettings();
  const accounts = defaultAccounts();
  const whId = 'wh_main';
  const warehouses: Warehouse[] = [
    { id: whId, name: 'المخزن الرئيسي', location: 'المقر الرئيسي', isDefault: true },
    { id: 'wh_branch', name: 'مخزن الفرع', location: 'الفرع الإضافي', isDefault: false }
  ];

  const products: Product[] = [];
  const customers: Party[] = [];
  const suppliers: Party[] = [];

  const audit: AuditLog[] = [
    {
      id: 'au_init',
      at: new Date().toISOString(),
      user: 'مدير النظام',
      action: 'تهيئة النظام النظيف',
      detail: 'تم تهيئة النظام النظيف وتثبيت دليل الحسابات القياسي للعمل الفعلي مباشرة'
    }
  ];

  const users = [
    { id: 'usr_main', name: 'مدير النظام', username: 'admin', role: 'مدير' as const, active: true }
  ];

  return {
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
    currencies: defaultCurrencies(),
    fixedAssets: [],
    bankReconciliations: [],
    goodsReceivedNotes: [],
    audit
  };
}

export function loadDatabase(): AccountingDB {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Check if previous v5, v4 or older exists, migrate settings and users but wipe all demo data
      const oldRaw = localStorage.getItem('hesabaty_pro_db_v5') || 
                     localStorage.getItem('hesabaty_pro_db_v4') || 
                     localStorage.getItem('hesabaty_pro_db_v3');
      if (oldRaw) {
        try {
          const oldDb = JSON.parse(oldRaw);
          if (oldDb && Array.isArray(oldDb.accounts)) {
            const cleaned = cleanAllDemoTransactions(oldDb);
            saveDatabase(cleaned);
            try {
              localStorage.removeItem('hesabaty_pro_db_v5');
              localStorage.removeItem('hesabaty_pro_db_v4');
              localStorage.removeItem('hesabaty_pro_db_v3');
            } catch (e) {}
            return cleaned;
          }
        } catch (e) {
          // ignore
        }
      }

      const initial = createSeedData();
      saveDatabase(initial);
      return initial;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version < 6 || !Array.isArray(parsed.products) || !Array.isArray(parsed.accounts)) {
      const initial = createSeedData();
      saveDatabase(initial);
      return initial;
    }

    // Safety check: if parsed database contains any previous demo products, parties, or mock demo accounts, clean them
    const hasDemoData = parsed.invoices?.some((i: any) => i.id === 'inv_1001' || i.id === 'inv_2001' || i.number === 'INV-001001') ||
      parsed.stockMovements?.some((sm: any) => sm.id === 'sm_1') ||
      parsed.products?.some((p: any) => p.id === 'prod_1' || p.code === 'PRD-101') ||
      parsed.customers?.some((c: any) => c.id === 'cust_1') ||
      parsed.suppliers?.some((s: any) => s.id === 'supp_1') ||
      parsed.treasury?.some((tr: any) => tr.id === 'tr_1') ||
      parsed.users?.some((u: any) => u.id === 'usr_acc' || u.id === 'usr_cashier' || u.name === 'أحمد محمود' || u.name === 'سارة خالد' || u.name === 'محمد علي');

    if (hasDemoData) {
      const cleaned = cleanAllDemoTransactions(parsed);
      // Ensure users list is also cleaned of demo accounts
      cleaned.users = [
        { id: 'usr_main', name: 'مدير النظام', username: 'admin', role: 'مدير' as const, active: true }
      ];
      cleaned.currentUser = cleaned.users[0];
      saveDatabase(cleaned);
      return cleaned;
    }

    // Guarantee modern arrays are never undefined in runtime
    if (!parsed.costCenters) parsed.costCenters = [];
    if (!parsed.currencies || parsed.currencies.length === 0) parsed.currencies = defaultCurrencies();
    if (!parsed.fixedAssets) parsed.fixedAssets = [];
    if (!parsed.bankReconciliations) parsed.bankReconciliations = [];
    if (!parsed.goodsReceivedNotes) parsed.goodsReceivedNotes = [];
    if (!parsed.settings.nextGRN) parsed.settings.nextGRN = 7001;

    // Guarantee default accounts exist
    const currentAccountIds = new Set(parsed.accounts.map((a: Account) => a.id));
    defaultAccounts().forEach(defAcc => {
      if (!currentAccountIds.has(defAcc.id)) {
        parsed.accounts.push(defAcc);
      }
    });

    return parsed;
  } catch (err) {
    console.error('Failed to parse database from localStorage:', err);
    const initial = createSeedData();
    saveDatabase(initial);
    return initial;
  }
}

export function saveDatabase(db: AccountingDB): void {
  // Asynchronously store in IndexedDB (virtually unlimited browser storage capacity)
  saveToIndexedDB(db);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (err) {
    console.warn('localStorage size limit reached, data safely persisted in IndexedDB:', err);
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
 */
export function calculateCustomerBalance(db: AccountingDB, customerId: string): number {
  const cust = db.customers.find(c => c.id === customerId);
  if (!cust) return 0;
  let balance = Number(cust.openingBalance) || 0;

  // Add unpaid sale invoice portions
  db.invoices.forEach(inv => {
    if (inv.type === 'sale' && inv.partyId === customerId) {
      balance += (Number(inv.total) - Number(inv.paid));
    }
  });

  // Subtract receipts
  db.vouchers.forEach(v => {
    if (v.type === 'receipt' && v.partyId === customerId) {
      balance -= Number(v.amount);
    }
  });

  // Subtract sale returns
  db.returns.forEach(r => {
    if (r.type === 'sale' && r.partyId === customerId) {
      if (r.paymentMethod === 'آجل') {
        balance -= Number(r.total);
      }
    }
  });

  return balance;
}

/**
 * Recalculate supplier balance:
 * Opening balance + sum of unpaid purchases (total - paid) - payments - purchase returns
 */
export function calculateSupplierBalance(db: AccountingDB, supplierId: string): number {
  const supp = db.suppliers.find(s => s.id === supplierId);
  if (!supp) return 0;
  let balance = Number(supp.openingBalance) || 0;

  // Add unpaid purchase invoice portions
  db.invoices.forEach(inv => {
    if (inv.type === 'purchase' && inv.partyId === supplierId) {
      balance += (Number(inv.total) - Number(inv.paid));
    }
  });

  // Subtract payments
  db.vouchers.forEach(v => {
    if (v.type === 'payment' && v.partyId === supplierId) {
      balance -= Number(v.amount);
    }
  });

  // Subtract purchase returns
  db.returns.forEach(r => {
    if (r.type === 'purchase' && r.partyId === supplierId) {
      if (r.paymentMethod === 'آجل') {
        balance -= Number(r.total);
      }
    }
  });

  return balance;
}

/**
 * Calculate total treasury balance for a specific payment method or all methods
 */
export function calculateTreasuryBalance(db: AccountingDB, method?: PaymentMethod): number {
  return db.treasury
    .filter(entry => !method || entry.method === method)
    .reduce((sum, entry) => {
      const amt = Number(entry.amount) || 0;
      return sum + (entry.direction === 'in' ? amt : -amt);
    }, 0);
}

/**
 * Calculate total inventory valuation
 */
export function calculateInventoryValuation(db: AccountingDB): number {
  return db.products.reduce((acc, p) => {
    const cost = db.settings.cost === 'last' ? p.buyPrice : (p.avgCost || p.buyPrice);
    return acc + (p.currentQty * cost);
  }, 0);
}

/**
 * Calculate Net Profit:
 * Sales Revenue - Cost of Goods Sold + Other Revenues - Expenses
 */
export function calculateFinancialSummary(db: AccountingDB) {
  const today = getTodayDate();

  const totalSalesAll = db.invoices
    .filter(i => i.type === 'sale')
    .reduce((acc, i) => acc + i.total, 0);

  const salesToday = db.invoices
    .filter(i => i.type === 'sale' && i.date === today)
    .reduce((acc, i) => acc + i.total, 0);

  const totalPurchasesAll = db.invoices
    .filter(i => i.type === 'purchase')
    .reduce((acc, i) => acc + i.total, 0);

  const purchasesToday = db.invoices
    .filter(i => i.type === 'purchase' && i.date === today)
    .reduce((acc, i) => acc + i.total, 0);

  const totalCOGS = db.invoices
    .filter(i => i.type === 'sale')
    .reduce((acc, i) => {
      const invoiceCogs = i.items.reduce((s, it) => s + (it.qty * (it.costPrice || 0)), 0);
      return acc + invoiceCogs;
    }, 0);

  const totalExpenses = db.expenses.reduce((acc, e) => acc + e.amount, 0);
  const totalOtherRevenues = db.revenues.reduce((acc, r) => acc + r.amount, 0);

  const grossProfit = totalSalesAll - totalCOGS;
  const netProfit = grossProfit + totalOtherRevenues - totalExpenses;

  const totalCustomerReceivables = db.customers.reduce((acc, c) => acc + Math.max(0, calculateCustomerBalance(db, c.id)), 0);
  const totalSupplierPayables = db.suppliers.reduce((acc, s) => acc + Math.max(0, calculateSupplierBalance(db, s.id)), 0);

  const totalTreasury = calculateTreasuryBalance(db);
  const totalStockValue = calculateInventoryValuation(db);
  const lowStockCount = db.products.filter(p => p.minStock > 0 && p.currentQty <= p.minStock).length;

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
    totalInvoicesCount: db.invoices.length,
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
