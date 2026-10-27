export type PaymentMethod = 
  | 'نقدي' 
  | 'Vodafone Cash' 
  | 'InstaPay' 
  | 'Visa / POS' 
  | 'تحويل بنكي' 
  | 'آجل';

export interface Account {
  id: string;
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  description?: string;
  isSystem?: boolean;
}

export interface JournalLine {
  accountId: string;
  accountName: string;
  accountCode: string;
  debit: number;
  credit: number;
  notes?: string;
  costCenterId?: string;
  costCenterName?: string;
}

export interface JournalEntry {
  id: string;
  number: string;
  date: string;
  description: string;
  sourceType?: 'sale' | 'purchase' | 'receipt' | 'payment' | 'expense' | 'revenue' | 'return' | 'manual' | 'adjustment';
  sourceId?: string;
  lines: JournalLine[];
  createdAt: string;
}

export interface BranchProductData {
  currentQty: number; // رصيد الصنف في هذا الفرع
  buyPrice: number;   // سعر الشراء في هذا الفرع
  sellPrice: number;  // سعر البيع النقدي في هذا الفرع
  wholesalePrice: number; // سعر الجملة في هذا الفرع
  minStock?: number;  // حد الطلب الأدنى في هذا الفرع
  avgCost?: number;   // متوسط التكلفة في هذا الفرع
}

export interface Product {
  id: string;
  code: string;
  barcode: string;
  name: string;
  category?: string;
  unit: string;
  buyPrice: number;
  sellPrice: number;
  wholesalePrice: number;
  minStock: number;
  currentQty: number;
  avgCost: number;
  notes?: string;
  priceHistory?: { date: string; price: number; qty: number; invoiceId?: string; branchId?: string }[];
  // بيانات المخزون والتسعير المستقلة لكل فرع
  // الأصناف موحدة في كل الفروع لكن الكميات والأسعار تدخل حسب الفرع ولا تؤثر على أي فرع آخر
  branchesData?: Record<string, BranchProductData>;
}

export interface Warehouse {
  id: string;
  name: string;
  location: string;
  isDefault?: boolean;
}

export interface StockMovement {
  id: string;
  date: string;
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  qtyChange: number; // positive or negative
  balanceAfter: number;
  unitCost: number;
  type: 'purchase' | 'sale' | 'sale_return' | 'purchase_return' | 'transfer_in' | 'transfer_out' | 'adjustment' | 'opening';
  refNumber: string;
  sourceId?: string;
  branchId?: string;
  branchName?: string;
}

export interface Party {
  id: string;
  code?: string;
  type: 'customer' | 'supplier';
  name: string;
  company?: string;
  phone: string;
  address: string;
  openingBalance: number;
  balance?: number;
  creditLimit: number;
  taxNumber?: string;
  notes?: string;
}

export interface InvoiceItem {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  spec?: string;
  qty: number;
  unitPrice: number;
  costPrice: number;
  discount: number;
  taxRate: number;
  total: number;
  notes?: string;
}

export interface InvoicePaymentLine {
  method: PaymentMethod;
  amount: number;
}

export interface Invoice {
  id: string;
  number: string;
  type: 'sale' | 'purchase';
  invoiceKind?: 'sale' | 'wholesale' | 'purchase' | 'sale_return' | 'purchase_return' | 'quote';
  date: string;
  time?: string;
  jobSite?: string;
  priceType?: 'cash' | 'wholesale' | 'buy';
  partyId?: string;
  partyCode?: string;
  partyName: string;
  partyPhone?: string;
  warehouseId: string;
  paymentMethod: PaymentMethod;
  payments?: InvoicePaymentLine[];
  subtotal: number;
  discount: number;
  discountType?: 'val' | 'percent';
  tax: number;
  taxType?: 'val' | 'percent';
  extraIncomeName?: string;
  extraIncomeVal?: number;
  total: number;
  paid: number;
  remaining: number;
  status: 'مدفوع' | 'جزئي' | 'آجل';
  notes?: string;
  items: InvoiceItem[];
  journalEntryId?: string;
  costCenterId?: string;
  costCenterName?: string;
  currencyCode?: string;
  exchangeRate?: number;
  createdBy?: string;
  createdById?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedById?: string;
  updatedAt?: string;
  auditLog?: InvoiceAuditEntry[];
  branchId?: string;
  branchName?: string;
  deliveryFee?: number;
}

export interface InvoiceAuditEntry {
  id: string;
  action: 'create' | 'edit' | 'status_change' | 'payment' | 'other';
  actionTitle: string; // e.g. "إنشاء الفاتورة", "تعديل الفاتورة"
  userName: string;
  userId?: string;
  userRole?: string;
  timestamp: string; // ISO format
  formattedDate?: string;
  formattedTime?: string;
  summary?: string; // Summary of changes
  previousTotal?: number;
  newTotal?: number;
  itemsCount?: number;
}

export interface ReturnInvoice {
  id: string;
  number: string;
  type: 'sale' | 'purchase';
  date: string;
  originalInvoiceId?: string;
  originalInvoiceNumber?: string;
  partyId?: string;
  partyName: string;
  warehouseId: string;
  paymentMethod: PaymentMethod;
  productId: string;
  productName: string;
  qty: number;
  price: number;
  total: number;
  notes?: string;
  journalEntryId?: string;
  branchId?: string;
  branchName?: string;
}

export interface Quote {
  id: string;
  number: string;
  date: string;
  partyId?: string;
  partyName: string;
  items: InvoiceItem[];
  total: number;
  status: 'جديد' | 'مقبول' | 'مرفوض' | 'تم التحويل';
  notes?: string;
  branchId?: string;
  branchName?: string;
}

export interface Order {
  id: string;
  number: string;
  type: 'sale' | 'purchase';
  date: string;
  partyId?: string;
  partyName: string;
  items: InvoiceItem[];
  total: number;
  status: 'جديد' | 'قيد التنفيذ' | 'مكتمل' | 'ملغي';
  notes?: string;
  branchId?: string;
  branchName?: string;
}

export interface Voucher {
  id: string;
  number: string;
  type: 'receipt' | 'payment'; // receipt = قبض, payment = صرف
  date: string;
  partyId?: string;
  partyName: string;
  amount: number;
  paymentMethod: PaymentMethod;
  description: string;
  journalEntryId?: string;
  costCenterId?: string;
  costCenterName?: string;
  currencyCode?: string;
  exchangeRate?: number;
  branchId?: string;
  branchName?: string;
  referenceNumber?: string;
  invoiceId?: string;
  createdAt?: string;
  createdBy?: string;
  status?: 'معتمد' | 'مسودة' | 'ملغي';
}

export interface TreasuryEntry {
  id: string;
  date: string;
  direction: 'in' | 'out';
  amount: number;
  method: PaymentMethod;
  description: string;
  sourceType?: string;
  sourceId?: string;
  costCenterId?: string;
  costCenterName?: string;
  branchId?: string;
  branchName?: string;
}

export interface SimpleRecord {
  id: string;
  date: string;
  category: string;
  amount: number;
  method: PaymentMethod;
  description: string;
  journalEntryId?: string;
  costCenterId?: string;
  costCenterName?: string;
  currencyCode?: string;
  exchangeRate?: number;
  branchId?: string;
  branchName?: string;
}

export interface StockAdjustment {
  id: string;
  date: string;
  productId: string;
  productName: string;
  systemQty: number;
  actualQty: number;
  diffQty: number;
  unitCost: number;
  reason: string;
  branchId?: string;
  branchName?: string;
}

export interface StockTransfer {
  id: string;
  date: string;
  productId: string;
  productName: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  qty: number;
  notes?: string;
  fromBranchId?: string;
  fromBranchName?: string;
  toBranchId?: string;
  toBranchName?: string;
}

export interface FiscalPeriod {
  id: string;
  name: string;
  from: string;
  to: string;
  status: 'مفتوح' | 'مغلق';
  closedAt?: string;
  closingJournalId?: string;
  netIncome?: number;
  retainedEarningsAccountId?: string;
}

export interface DailyClosing {
  id: string;
  shiftNumber: string;
  date: string;
  time?: string;
  openedBy: string;
  closedBy: string;
  startingCash: number;
  cashIn: number;
  cashOut: number;
  salesTotal: number;
  returnsTotal: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
  profitMargin: number;
  actualCash: number;
  expectedCash: number;
  difference: number;
  status: 'مفتوح' | 'مغلق';
  notes?: string;
  createdAt: string;
  branchId?: string;
  branchName?: string;
}

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  type: 'مشروع' | 'فرع' | 'قسم' | 'سيارة/آلية' | 'عام';
  budget?: number;
  manager?: string;
  notes?: string;
  status: 'نشط' | 'مكتمل' | 'معلق';
}

export interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  rate: number; // rate to base currency
  isBase: boolean;
  lastUpdated: string;
}

export interface FixedAsset {
  id: string;
  code: string;
  name: string;
  category: 'مباني وعقارات' | 'آلات ومعدات' | 'سيارات ومركبات' | 'أجهزة حاسوب وتكنولوجيا' | 'أثاث ومفروشات' | 'أخرى';
  purchaseDate: string;
  purchaseCost: number;
  salvageValue: number;
  usefulLifeYears: number;
  depreciationMethod: 'straight_line';
  assetAccountId?: string;
  depreciationAccountId?: string;
  accumulatedDepAccountId?: string;
  accumulatedDepreciation: number;
  lastDepreciationDate?: string;
  notes?: string;
}

export interface BankReconciliation {
  id: string;
  statementDate: string;
  bankAccountId: string;
  bankAccountName: string;
  statementEndingBalance: number;
  bookBalance: number;
  difference: number;
  matchedTransactionIds: string[];
  bankCharges?: number;
  interestEarned?: number;
  status: 'مسودة' | 'مطابق ومغلق';
  notes?: string;
  createdAt: string;
}

export interface GoodsReceivedItem {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  orderedQty: number;
  receivedQty: number;
  acceptedQty: number;
  rejectedQty?: number;
  unitCost: number;
}

export interface GoodsReceivedNote {
  id: string;
  number: string;
  date: string;
  orderId?: string;
  orderNumber?: string;
  supplierId: string;
  supplierName: string;
  warehouseId: string;
  warehouseName: string;
  items: GoodsReceivedItem[];
  status: 'مسودة' | 'معتمد ومستلم' | 'مفوتر';
  receivedBy?: string;
  notes?: string;
  matchedInvoiceId?: string;
}

export interface AuditLog {
  id: string;
  at: string;
  user: string;
  action: string;
  detail: string;
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  isMain?: boolean;
  pin?: string; // الرقم السري للدخول إلى الفرع وحمايته من المقر الرئيسي (Branch Access PIN)
}

export interface User {
  id: string;
  name: string;
  username: string;
  password?: string;
  role: 'مدير' | 'محاسب' | 'مبيعات' | 'مخزن' | 'كاشير' | 'مخصص';
  active: boolean;
  branchId?: string;
  branchName?: string;
  permissions?: UserPermissions;
  lastLogin?: string;
}

export interface UserPermissions {
  // 1. المبيعات
  canViewSales?: boolean;
  canCreateSales?: boolean;
  canEditSales?: boolean;
  canDeleteSales?: boolean;
  canPrintSales?: boolean;
  canApplyDiscounts?: boolean;
  canManageQuotesOrders?: boolean;
  canManageSalesReturns?: boolean;

  // 2. المشتريات والتوريد
  canViewPurchases?: boolean;
  canCreatePurchases?: boolean;
  canEditPurchases?: boolean;
  canDeletePurchases?: boolean;
  canManageProcurement?: boolean;
  canManagePurchaseReturns?: boolean;

  // 3. العملاء والموردين
  canViewCustomers?: boolean;
  canManageCustomers?: boolean;
  canDeleteCustomers?: boolean;
  canViewSuppliers?: boolean;
  canManageSuppliers?: boolean;
  canDeleteSuppliers?: boolean;

  // 4. الخزينة والمالية
  canCreateReceipts?: boolean;
  canCreatePayments?: boolean;
  canManageTreasury?: boolean;
  canManageExpenses?: boolean;
  canDeleteExpenses?: boolean;
  canManageRevenues?: boolean;

  // 5. المخزون والأصناف
  canViewProducts?: boolean;
  canManageProducts?: boolean;
  canDeleteProducts?: boolean;
  canPrintBarcodes?: boolean;
  canManageStock?: boolean;
  canManageWarehouses?: boolean;

  // 6. الحسابات والتقارير
  canDailyClosing?: boolean;
  canViewProfits?: boolean;
  canViewReports?: boolean;
  canManageAccounting?: boolean;
  canManageCostCenters?: boolean;
  canBankReconciliation?: boolean;
  canClosePeriods?: boolean;

  // 7. إدارة النظام
  canManageBranches?: boolean;
  canManageUsers?: boolean;
  canViewAudit?: boolean;
  canManageBackup?: boolean;
  canManageSettings?: boolean;

  // للتوافق مع البيانات السابقة
  canViewInvoices?: boolean;
  canCreateInvoices?: boolean;
}

export interface AppSettings {
  company: string;
  companyCode?: string; // كود الشركة الفريد لتسجيل الدخول والمزامنة المتعددة (Tenant Code)
  companyPin?: string; // الرقم السري للدخول إلى الشركة (قابل للتعديل من قبل المدير)
  phone: string;
  address: string;
  currency: string;
  invoiceTitle: string;
  taxNumber?: string;
  low: number;
  cost: 'average' | 'last';
  tax: 'disabled' | 'enabled';
  taxRate: number;
  notes: string;
  logo?: string;
  nextSale: number;
  nextPurchase: number;
  nextReceipt: number;
  nextPayment: number;
  nextQuote: number;
  nextOrder: number;
  nextGRN?: number;
}

export interface AccountingDB {
  version: number;
  settings: AppSettings;
  users: User[];
  currentUser: User;
  products: Product[];
  warehouses: Warehouse[];
  customers: Party[];
  suppliers: Party[];
  invoices: Invoice[];
  returns: ReturnInvoice[];
  stockMovements: StockMovement[];
  treasury: TreasuryEntry[];
  vouchers: Voucher[];
  expenses: SimpleRecord[];
  revenues: SimpleRecord[];
  accounts: Account[];
  journals: JournalEntry[];
  quotes: Quote[];
  orders: Order[];
  transfers: StockTransfer[];
  adjustments: StockAdjustment[];
  periods: FiscalPeriod[];
  costCenters: CostCenter[];
  currencies: Currency[];
  fixedAssets: FixedAsset[];
  bankReconciliations: BankReconciliation[];
  goodsReceivedNotes: GoodsReceivedNote[];
  dailyClosings?: DailyClosing[];
  branches?: Branch[];
  audit: AuditLog[];
}
