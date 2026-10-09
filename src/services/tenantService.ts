import { User as AppUser, AccountingDB } from '../types/accounting';

export interface CompanyTenant {
  id: string; // e.g. "comp_xxxx" or "comp_g_xxxx"
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

const TENANTS_REGISTRY_KEY = 'hesabaty_companies_registry';
const ACTIVE_TENANT_KEY = 'hesabaty_active_tenant_id';

/**
 * Returns list of all company tenants registered on this device/browser
 */
export function getCompaniesList(): CompanyTenant[] {
  try {
    const raw = localStorage.getItem(TENANTS_REGISTRY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error loading companies registry:', err);
    return [];
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
 * Retrieves a company tenant by ID
 */
export function getCompanyTenant(id: string): CompanyTenant | null {
  const list = getCompaniesList();
  return list.find(c => c.id === id) || null;
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
    ? `comp_g_${data.googleEmail.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20)}`
    : `comp_${cleanName}_${Date.now().toString(36)}_${randomSuffix}`;

  // Check if already exists (especially for Google logins)
  const existing = list.find(c => c.id === id);
  if (existing) {
    // Update name or details if provided
    existing.name = data.name.trim() || existing.name;
    existing.adminName = data.adminName.trim() || existing.adminName;
    saveCompaniesList(list);
    return existing;
  }

  const newTenant: CompanyTenant = {
    id,
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
