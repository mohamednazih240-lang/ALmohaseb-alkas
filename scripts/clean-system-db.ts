import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, terminate } from 'firebase/firestore';
import cfg from '../firebase-applet-config.json';
import { defaultAccounts, defaultCurrencies, defaultSettings, defaultBranches } from '../src/services/accountingStorage';
import { AccountingDB, User } from '../src/types/accounting';

const app = initializeApp(cfg);
const db = getFirestore(app, cfg.firestoreDatabaseId);

const cleanUsers: User[] = [
  {
    id: 'usr_mvnj47xi',
    name: 'Mohamed Nazih',
    username: 'mohamed nazih',
    password: '1272',
    role: 'مدير',
    branchId: 'br_mawan',
    branchName: 'الفرع الرئيسي - شركة الموان',
    active: true
  },
  {
    id: 'usr_mvnj6i7d_vhlqh',
    name: 'Ahmed Nazih',
    username: 'ahmed nazih',
    password: '1234',
    role: 'مدير',
    branchId: 'br_mawan',
    branchName: 'الفرع الرئيسي - شركة الموان',
    active: true
  }
];

const cleanDb: AccountingDB = {
  version: 6,
  settings: {
    ...defaultSettings(),
    company: 'شركة الموان',
    companyCode: 'COMP-102',
    companyPin: '2919',
    invoiceTitle: 'بيان',
    nextSale: 1,
    nextPurchase: 1,
    nextReceipt: 1,
    nextPayment: 1,
    nextQuote: 1,
    nextOrder: 1,
    nextGRN: 1
  },
  users: cleanUsers,
  currentUser: cleanUsers[0],
  products: [],
  warehouses: [
    {
      id: 'wh_mawan',
      name: 'مخزن شركة الموان الرئيسي',
      location: 'المقر الرئيسي',
      isDefault: true
    }
  ],
  customers: [],
  suppliers: [],
  invoices: [],
  returns: [],
  stockMovements: [],
  treasury: [],
  vouchers: [],
  expenses: [],
  revenues: [],
  accounts: defaultAccounts(),
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
  branches: defaultBranches(),
  cleanGeneration: 2,
  audit: [
    {
      id: `au_${Date.now()}`,
      at: new Date().toISOString(),
      user: 'Mohamed Nazih',
      action: 'تهيئة وتنظيف النظام الشامل',
      detail: 'تم تنظيف النظام بالكامل من كافة الفواتير والأصناف السابقة وتصفير السندات والحركات لبدء تسجيل الأصناف والفواتير من جديد برقم 1'
    }
  ]
};

async function executeClean() {
  console.log('Starting full clean of Firestore database for شركة الموان (COMP-102)...');
  const payload = {
    updatedAt: Date.now(),
    updatedBy: 'Mohamed Nazih',
    updatedRole: 'مدير',
    companyCode: 'COMP-102',
    companyName: 'شركة الموان',
    deviceId: 'admin_cleanup_script',
    actionDesc: 'تهيئة وتصفير النظام الشامل لبدء تسجيل الأصناف والفواتير من رقم 1',
    data: JSON.stringify(cleanDb)
  };

  // 1. Update company_COMP-102
  console.log('Writing clean state to company_COMP-102...');
  await setDoc(doc(db, 'hesabaty_app_data', 'company_COMP-102'), payload);

  // 2. Update main_company_database
  console.log('Writing clean state to main_company_database...');
  await setDoc(doc(db, 'hesabaty_app_data', 'main_company_database'), payload);

  // 3. Update backup_COMP-102_latest
  console.log('Writing clean state to backup_COMP-102_latest...');
  await setDoc(doc(db, 'hesabaty_app_data', 'backup_COMP-102_latest'), payload);

  console.log('SUCCESS: Firestore database cleaned completely!');
  console.log('Products:', cleanDb.products.length);
  console.log('Invoices:', cleanDb.invoices.length);
  console.log('Vouchers:', cleanDb.vouchers.length);
  console.log('Next Purchase:', cleanDb.settings.nextPurchase);
  console.log('Next Sale:', cleanDb.settings.nextSale);
  console.log('Next Payment:', cleanDb.settings.nextPayment);
  console.log('Next Receipt:', cleanDb.settings.nextReceipt);

  await terminate(db);
  process.exit(0);
}

executeClean().catch(err => {
  console.error('Clean failed:', err);
  process.exit(1);
});
