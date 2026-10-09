import { AccountingDB } from '../types/accounting';
import { getGoogleAccessToken } from './firebaseAuth';

export interface DriveBackupFile {
  id: string;
  name: string;
  createdTime: string;
  modifiedTime: string;
  size?: string;
  description?: string;
  recordCount?: {
    invoices: number;
    products: number;
    customers: number;
    vouchers: number;
  };
}

const BACKUP_PREFIX = 'hesabaty_backup_';

/**
 * Uploads full ERP accounting database to user's Google Drive
 */
export async function uploadBackupToGoogleDrive(
  db: AccountingDB,
  customName?: string
): Promise<DriveBackupFile> {
  const token = getGoogleAccessToken();
  if (!token) {
    throw new Error('يرجى تسجيل الدخول بحساب Google أولاً لربط وتفعيل النسخ السحابي على Google Drive.');
  }

  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-');
  const fileName = customName || `${BACKUP_PREFIX}${dateStr}.json`;

  const payload = {
    appName: 'حساباتي المحاسبي المتكامل - Hesabaty ERP',
    exportedAt: now.toISOString(),
    version: '4.0',
    company: db.settings.company,
    recordsSummary: {
      invoices: db.invoices.length,
      products: db.products.length,
      customers: db.customers.length,
      suppliers: db.suppliers.length,
      vouchers: db.vouchers.length,
      journals: db.journals.length,
      accounts: db.accounts.length
    },
    data: db
  };

  const fileContent = JSON.stringify(payload, null, 2);

  // Metadata for Drive file
  const metadata = {
    name: fileName,
    mimeType: 'application/json',
    description: `نسخة احتياطية محاسبية شاملة (${db.invoices.length} فاتورة، ${db.vouchers.length} سند، ${db.products.length} صنف) - ${db.settings.company}`
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    fileContent +
    closeDelimiter;

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartRequestBody
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `فشل رفع النسخة إلى Google Drive: ${response.statusText}`);
  }

  const result = await response.json();
  return {
    id: result.id,
    name: result.name,
    createdTime: now.toISOString(),
    modifiedTime: now.toISOString(),
    description: metadata.description
  };
}

/**
 * Lists all Hesabaty ERP backup files saved in the user's Google Drive
 */
export async function listGoogleDriveBackups(): Promise<DriveBackupFile[]> {
  const token = getGoogleAccessToken();
  if (!token) {
    return [];
  }

  const query = encodeURIComponent(`name contains '${BACKUP_PREFIX}' and trashed = false`);
  const fields = encodeURIComponent('files(id, name, createdTime, modifiedTime, size, description)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=createdTime desc&pageSize=50`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('انتهت صلاحية جلسة Google، يرجى إعادة تسجيل الدخول بالجيميل.');
    }
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || 'تعذر جلب النسخ الاحتياطية من Google Drive');
  }

  const data = await response.json();
  return (data.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    createdTime: f.createdTime,
    modifiedTime: f.modifiedTime,
    size: f.size ? `${(parseInt(f.size, 10) / 1024).toFixed(1)} KB` : undefined,
    description: f.description
  }));
}

/**
 * Downloads a backup file from Google Drive and returns the parsed AccountingDB
 */
export async function downloadAndRestoreBackupFromDrive(fileId: string): Promise<AccountingDB> {
  const token = getGoogleAccessToken();
  if (!token) {
    throw new Error('يرجى تسجيل الدخول بحساب Google أولاً لاسترجاع النسخة.');
  }

  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`فشل تنزيل ملف النسخة من Google Drive (${response.status})`);
  }

  const rawJson = await response.json();

  // Validate format (either direct db object or wrapped payload { data: db })
  const targetDb: AccountingDB = rawJson.data ? rawJson.data : rawJson;

  if (!targetDb.products || !targetDb.invoices || !targetDb.settings) {
    throw new Error('ملف النسخة المسترجع غير صالح أو لا يحتوي على بنية البيانات المحاسبية الصحيحة.');
  }

  return targetDb;
}

/**
 * Deletes a backup file from Google Drive
 */
export async function deleteBackupFromDrive(fileId: string): Promise<boolean> {
  const token = getGoogleAccessToken();
  if (!token) return false;

  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  return response.ok;
}
