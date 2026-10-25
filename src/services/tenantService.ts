import { User as AppUser, AccountingDB } from '../types/accounting';

export interface CompanyTenant {
  id: string; // e.g. "comp_xxxx" or "comp_g_xxxx"
  code: string; // e.g. "COMP-101" (كود الشركة لتسجيل الدخول السريع)
  name: string; // Company / Organization Name (اسم المنشأة / الشركة)
  activityType?: string; // Type of activity
  adminName: string; // Admin's full name
  adminUsername: string; // Admin username or email
  password?: string; // Password for company access
  currency: string; // Primary currency
  phone?: string;
  address?: string;
  taxNumber?: string;
  createdAt: string;
  isGoogle?: boolean;
  googleEmail?: string;
}

export const EKHWA_TENANT_ID = 'comp_ekhwa';
export const EKHWA_CODE = 'COMP-101';
export const EKHWA_DEFAULT_PIN = '1234';

export const MAWAN_TENANT_ID = 'comp_mawan';
export const MAWAN_CODE = 'COMP-102';
export const MAWAN_DEFAULT_PIN = '2919';

const TENANTS_REGISTRY_KEY = 'hesabaty_companies_registry';
const ACTIVE_TENANT_KEY = 'hesabaty_active_tenant_id';

/**
 * Ensures the two primary independent companies (الأخوة and الموان) exist in the registry with their secret PINs
 */
export function ensurePrimaryCompanies(existingList: CompanyTenant[]): CompanyTenant[] {
  // Purge any stale dummy test companies like "الشركة التجارية للتوزيع" or legacy IDs
  const filteredList = (existingList || []).filter(c => {
    const name = c.name || '';
    const code = c.code || '';
    const id = c.id || '';
    if (
      name.includes('الشركة التجارية للتوزيع') ||
      code.includes('MV6L2JBE') ||
      id.includes('MV6L2JBE') ||
      name.includes('الشركة_التجارية')
    ) {
      return false;
    }
    return true;
  });

  // 1. شركة الأخوة (COMP-101) - Secret PIN: 1234
  let ekhwa = filteredList.find(c => c.id === EKHWA_TENANT_ID || c.code === EKHWA_CODE || c.name.includes('الأخوة') || c.id === 'comp_primary');
  if (ekhwa) {
    ekhwa.id = EKHWA_TENANT_ID;
    ekhwa.code = EKHWA_CODE;
    ekhwa.name = 'شركة الأخوة';
    if (!ekhwa.password) ekhwa.password = EKHWA_DEFAULT_PIN;
  } else {
    ekhwa = {
      id: EKHWA_TENANT_ID,
      code: EKHWA_CODE,
      name: 'شركة الأخوة',
      activityType: 'تجارة وتوزيع عام',
      adminName: 'مدير شركة الأخوة',
      adminUsername: 'admin',
      password: EKHWA_DEFAULT_PIN,
      currency: 'ج.م',
      phone: '',
      address: 'المقر الرئيسي',
      createdAt: new Date().toISOString()
    };
  }

  // 2. شركة الموان (COMP-102) - Secret PIN: 2919
  let mawan = filteredList.find(c => c.id === MAWAN_TENANT_ID || c.code === MAWAN_CODE || c.name.includes('الموان'));
  if (mawan) {
    mawan.id = MAWAN_TENANT_ID;
    mawan.code = MAWAN_CODE;
    mawan.name = 'شركة الموان';
    // If PIN was previously default 1234 or 1272000, set to user-mandated 2919
    if (!mawan.password || mawan.password === '1272000' || mawan.password === '1234') {
      mawan.password = MAWAN_DEFAULT_PIN;
    }
  } else {
    mawan = {
      id: MAWAN_TENANT_ID,
      code: MAWAN_CODE,
      name: 'شركة الموان',
      activityType: 'تجارة ومواد بناء وتوريدات',
      adminName: 'مدير شركة الموان',
      adminUsername: 'mawan_admin',
      password: MAWAN_DEFAULT_PIN,
      currency: 'ج.م',
      phone: '',
      address: 'المقر الرئيسي',
      createdAt: new Date().toISOString()
    };
  }

  // Strict order: ALWAYS ekhwa at index 0, mawan at index 1
  const cleanList: CompanyTenant[] = [ekhwa, mawan];

  // Any other company that isn't ekhwa or mawan
  for (const c of filteredList) {
    if (
      c.id !== EKHWA_TENANT_ID &&
      c.code !== EKHWA_CODE &&
      c.id !== MAWAN_TENANT_ID &&
      c.code !== MAWAN_CODE &&
      !c.name.includes('الأخوة') &&
      !c.name.includes('الموان')
    ) {
      cleanList.push(c);
    }
  }

  return cleanList;
}

/**
 * Returns list of all company tenants registered on this device/browser
 */
export function getCompaniesList(): CompanyTenant[] {
  try {
    const raw = localStorage.getItem(TENANTS_REGISTRY_KEY);
    let list: CompanyTenant[] = [];
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    }
    const ensured = ensurePrimaryCompanies(list);
    if (ensured.length !== list.length || JSON.stringify(ensured) !== raw) {
      saveCompaniesList(ensured);
    }
    return ensured;
  } catch (err) {
    console.error('Error loading companies registry:', err);
    return ensurePrimaryCompanies([]);
  }
}

/**
 * Saves companies registry list
 */
export function saveCompaniesList(list: CompanyTenant[]): void {
  try {
    localStorage.setItem(TENANTS_REGISTRY_KEY, JSON.stringify(list));
  } catch (err) {
    console.error('Error saving companies registry:', err);
  }
}

/**
 * Returns current active tenant ID
 */
export function getActiveTenantId(): string | null {
  return localStorage.getItem(ACTIVE_TENANT_KEY);
}

/**
 * Sets current active tenant ID
 */
export function setActiveTenantId(id: string | null): void {
  if (id) {
    localStorage.setItem(ACTIVE_TENANT_KEY, id);
  } else {
    localStorage.removeItem(ACTIVE_TENANT_KEY);
  }
}

/**
 * Returns current active company tenant
 */
export function getActiveCompany(): CompanyTenant | null {
  const activeId = getActiveTenantId();
  if (!activeId) return null;
  const list = getCompaniesList();
  return list.find(c => c.id === activeId) || null;
}

/**
 * Retrieves a company tenant by ID or by Company Code (كود الشركة)
 */
export function getCompanyTenant(id: string): CompanyTenant | null {
  const list = getCompaniesList();
  return list.find(c => c.id === id || (c.code && c.code.toLowerCase() === id.toLowerCase())) || null;
}

/**
 * Retrieves a company tenant by Company Code / Tenant ID / Name / Email
 */
export function getCompanyByCode(codeOrIdOrName: string): CompanyTenant | null {
  const clean = codeOrIdOrName.trim().toLowerCase();
  if (!clean) return null;
  const list = getCompaniesList();
  return list.find(c => 
    (c.code && c.code.toLowerCase() === clean) ||
    c.id.toLowerCase() === clean || 
    c.name.toLowerCase() === clean ||
    (c.googleEmail && c.googleEmail.toLowerCase() === clean)
  ) || null;
}

/**
 * Helper to generate storage keys per tenant to ensure 100% data isolation
 */
export function getTenantStorageKey(tenantId: string): string {
  return `hesabaty_tenant_db_${tenantId}`;
}

export function getTenantIdbKey(tenantId: string): string {
  return `tenant_db_${tenantId}`;
}

/**
 * Registers a new company tenant with isolated space
 */
export function registerCompany(data: {
  name: string;
  adminName: string;
  adminUsername: string;
  code?: string;
  password?: string;
  currency?: string;
  activityType?: string;
  phone?: string;
  address?: string;
  isGoogle?: boolean;
  googleEmail?: string;
}): CompanyTenant {
  const list = getCompaniesList();

  // Create unique tenant ID
  const cleanName = data.name.trim().toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, '_').slice(0, 15);
  const randomSuffix = Math.random().toString(36).substring(2, 7);
  const id = data.isGoogle && data.googleEmail
    ? `comp_g_${data.googleEmail.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 60)}`
    : `comp_${cleanName}_${Date.now().toString(36)}_${randomSuffix}`;

  // Generate clean, memorable company code e.g. COMP-101, COMP-102
  const code = data.code?.trim().toUpperCase() || `COMP-${100 + list.length + 1}`;

  // Check if already exists (especially for Google logins)
  const existing = list.find(c => c.id === id || (c.code && c.code.toLowerCase() === code.toLowerCase()));
  if (existing) {
    // Update name or details if provided
    existing.name = data.name.trim() || existing.name;
    existing.adminName = data.adminName.trim() || existing.adminName;
    if (!existing.code) existing.code = code;
    saveCompaniesList(list);
    return existing;
  }

  const newTenant: CompanyTenant = {
    id,
    code,
    name: data.name.trim() || 'منشأة جديدة',
    activityType: data.activityType?.trim() || 'نشاط تجاري عام',
    adminName: data.adminName.trim() || 'مدير المنشأة',
    adminUsername: data.adminUsername.trim() || 'admin',
    password: data.password || '',
    currency: data.currency?.trim() || 'ج.م',
    phone: data.phone?.trim() || '',
    address: data.address?.trim() || '',
    createdAt: new Date().toISOString(),
    isGoogle: !!data.isGoogle,
    googleEmail: data.googleEmail
  };

  list.push(newTenant);
  saveCompaniesList(list);
  return newTenant;
}

/**
 * Updates details of an existing company tenant
 */
export function updateCompany(id: string, updates: Partial<CompanyTenant>): void {
  const list = getCompaniesList();
  const idx = list.findIndex(c => c.id === id);
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...updates };
    saveCompaniesList(list);
  }
}

/**
 * Deletes a company and its isolated data
 */
export function deleteCompany(id: string): void {
  const list = getCompaniesList().filter(c => c.id !== id);
  saveCompaniesList(list);

  try {
    localStorage.removeItem(getTenantStorageKey(id));
  } catch (e) {}

  if (getActiveTenantId() === id) {
    setActiveTenantId(null);
  }
}
