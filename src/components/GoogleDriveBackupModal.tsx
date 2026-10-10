import React, { useState, useEffect } from 'react';
import {
  Cloud,
  Download,
  Upload,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2,
  Calendar,
  HardDrive,
  Sparkles,
  ShieldCheck,
  FileCheck,
  Clock,
  ExternalLink,
  ChevronRight,
  Database
} from 'lucide-react';
import { AccountingDB } from '../types/accounting';
import {
  uploadBackupToGoogleDrive,
  listGoogleDriveBackups,
  downloadAndRestoreBackupFromDrive,
  deleteBackupFromDrive,
  DriveBackupFile
} from '../services/googleDriveService';
import {
  getGoogleAccessToken,
  getStoredAuthSession,
  linkGoogleDriveAccount
} from '../services/firebaseAuth';
import { getActiveTenantId } from '../services/tenantService';
import { useModalBackHandler } from '../hooks/useModalBackHandler';

interface GoogleDriveBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  db: AccountingDB;
  onRestoreDb: (restored: AccountingDB) => void;
}

interface LocalSnapshot {
  id: string;
  name: string;
  date: string;
  time: string;
  invoiceCount: number;
  productCount: number;
  data: AccountingDB;
}

export const GoogleDriveBackupModal: React.FC<GoogleDriveBackupModalProps> = ({
  isOpen,
  onClose,
  db,
  onRestoreDb
}) => {
  const [driveBackups, setDriveBackups] = useState<DriveBackupFile[]>([]);
  const [localSnapshots, setLocalSnapshots] = useState<LocalSnapshot[]>([]);
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);
  const [restoringDriveId, setRestoringDriveId] = useState<string | null>(null);
  const [deletingDriveId, setDeletingDriveId] = useState<string | null>(null);
  
  const [isSavingLocal, setIsSavingLocal] = useState(false);
  const [restoringLocalId, setRestoringLocalId] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [customBackupTitle, setCustomBackupTitle] = useState('');

  const [activeTab, setActiveTab] = useState<'drive' | 'local'>('drive');

  useModalBackHandler(isOpen, onClose, 'google_drive_modal');

  const [hasGoogleToken, setHasGoogleToken] = useState(() => !!getGoogleAccessToken());
  const [connectedEmail, setConnectedEmail] = useState<string | null>(() => {
    const s = getStoredAuthSession();
    return s?.googleEmail || null;
  });

  const activeTenantId = getActiveTenantId() || 'comp_main';
  const snapshotsStorageKey = `hesabaty_snapshots_${activeTenantId}`;

  // Load local snapshots
  const loadLocalSnapshots = () => {
    try {
      const raw = localStorage.getItem(snapshotsStorageKey);
      if (raw) {
        setLocalSnapshots(JSON.parse(raw));
      } else {
        setLocalSnapshots([]);
      }
    } catch {
      setLocalSnapshots([]);
    }
  };

  // Load Drive backups
  const fetchDriveBackups = async () => {
    const token = getGoogleAccessToken();
    if (!token) {
      setHasGoogleToken(false);
      return;
    }
    setHasGoogleToken(true);
    setIsLoadingDrive(true);
    try {
      const list = await listGoogleDriveBackups();
      setDriveBackups(list);
    } catch (err: any) {
      console.warn('Google Drive fetch error:', err);
      if (err?.message?.includes('401') || err?.message?.includes('صلاحية')) {
        setErrorMessage('انتهت صلاحية جلسة Google، يرجى إعادة ربط الحساب.');
        setHasGoogleToken(false);
      }
    } finally {
      setIsLoadingDrive(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const token = getGoogleAccessToken();
      const s = getStoredAuthSession();
      setHasGoogleToken(!!token);
      setConnectedEmail(s?.googleEmail || null);

      loadLocalSnapshots();
      if (token) {
        fetchDriveBackups();
      }
    }
  }, [isOpen]);

  // Handle Linking Google Account / Selecting account from phone
  const handleConnectGoogle = async () => {
    setIsLinkingGoogle(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { email } = await linkGoogleDriveAccount();
      setHasGoogleToken(true);
      setConnectedEmail(email);
      setSuccessMessage(`تم ربط حساب Google بنجاح (${email})! جاري جلب النسخ من Drive...`);
      await fetchDriveBackups();
    } catch (err: any) {
      if (
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request'
      ) {
        setErrorMessage('تم إلغاء نافذة اختيار حساب Google.');
      } else {
        setErrorMessage(err?.message || 'تعذر ربط حساب Google Drive.');
      }
    } finally {
      setIsLinkingGoogle(false);
    }
  };

  // Upload database to Google Drive
  const handleUploadToDrive = async () => {
    if (!getGoogleAccessToken()) {
      await handleConnectGoogle();
      if (!getGoogleAccessToken()) return;
    }

    setIsUploadingToDrive(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const companyName = db.settings.company || 'منشأة';
      const now = new Date();
      const dateStr = now.toLocaleDateString('ar-EG');
      const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
      const customPrefix = customBackupTitle.trim() ? `${customBackupTitle.trim()} - ` : '';
      const fileName = `hesabaty_backup_${companyName}_${Date.now()}.json`;

      await uploadBackupToGoogleDrive(db, fileName);
      setSuccessMessage(`تم رفع وحفظ النسخة الاحتياطية بنجاح على Google Drive (${dateStr} - ${timeStr})!`);
      setCustomBackupTitle('');
      await fetchDriveBackups();
    } catch (err: any) {
      setErrorMessage(err?.message || 'فشل رفع النسخة الاحتياطية إلى Google Drive.');
    } finally {
      setIsUploadingToDrive(false);
    }
  };

  // Restore database from Google Drive file
  const handleRestoreFromDrive = async (file: DriveBackupFile) => {
    const isConfirmed = window.confirm(
      `هل أنت متأكد من استرجاع النسخة الاحتياطية "${file.name}" من Google Drive؟\n\nتنبيه: سيتم استبدال البيانات الحالية بالبيانات المسترجعة من هذه النسخة.`
    );
    if (!isConfirmed) return;

    setRestoringDriveId(file.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const restoredDb = await downloadAndRestoreBackupFromDrive(file.id);
      onRestoreDb(restoredDb);
      setSuccessMessage(`تم استرجاع كافة البيانات بنجاح من Google Drive!`);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err?.message || 'تعذر استرجاع النسخة من Google Drive.');
    } finally {
      setRestoringDriveId(null);
    }
  };

  // Delete backup from Google Drive
  const handleDeleteFromDrive = async (file: DriveBackupFile) => {
    const isConfirmed = window.confirm(
      `هل أنت متأكد من حذف النسخة "${file.name}" نهائياً من Google Drive؟\n\nلا يمكن التراجع عن هذا الإجراء.`
    );
    if (!isConfirmed) return;

    setDeletingDriveId(file.id);
    setErrorMessage(null);
    try {
      await deleteBackupFromDrive(file.id);
      setSuccessMessage('تم حذف النسخة من Google Drive بنجاح.');
      setDriveBackups(prev => prev.filter(f => f.id !== file.id));
    } catch (err: any) {
      setErrorMessage(err?.message || 'فشل حذف الملف من Google Drive.');
    } finally {
      setDeletingDriveId(null);
    }
  };

  // Create Local Snapshot
  const handleCreateSnapshot = () => {
    setIsSavingLocal(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const now = new Date();
      const dateStr = now.toLocaleDateString('ar-EG');
      const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
      const title = customBackupTitle.trim() || `نسخة محلية (${dateStr} - ${timeStr})`;

      const newSnapshot: LocalSnapshot = {
        id: `snap_${Date.now()}`,
        name: title,
        date: dateStr,
        time: timeStr,
        invoiceCount: db.invoices.length,
        productCount: db.products.length,
        data: JSON.parse(JSON.stringify(db))
      };

      const updatedSnapshots = [newSnapshot, ...localSnapshots.slice(0, 9)];
      localStorage.setItem(snapshotsStorageKey, JSON.stringify(updatedSnapshots));
      setLocalSnapshots(updatedSnapshots);
      setSuccessMessage('تم حفظ نقطة الاسترجاع المحلية بنجاح!');
      setCustomBackupTitle('');
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ أثناء حفظ النسخة.');
    } finally {
      setIsSavingLocal(false);
    }
  };

  // Restore Local Snapshot
  const handleRestoreLocalSnapshot = (snap: LocalSnapshot) => {
    const isConfirmed = window.confirm(
      `هل أنت متأكد من استرجاع النسخة "${snap.name}"؟ سيتم استبدال البيانات الحالية.`
    );
    if (!isConfirmed) return;

    setRestoringLocalId(snap.id);
    try {
      onRestoreDb(snap.data);
      setSuccessMessage('تم استرجاع كافة البيانات بنجاح!');
      setTimeout(() => onClose(), 1200);
    } catch {
      setErrorMessage('تعذر استرجاع النسخة المحلية.');
    } finally {
      setRestoringLocalId(null);
    }
  };

  // Delete Local Snapshot
  const handleDeleteLocalSnapshot = (snapId: string) => {
    if (!window.confirm('هل تريد حذف هذه النسخة المحلية؟')) return;
    const updated = localSnapshots.filter(s => s.id !== snapId);
    localStorage.setItem(snapshotsStorageKey, JSON.stringify(updated));
    setLocalSnapshots(updated);
    setSuccessMessage('تم حذف النسخة المحلية بنجاح.');
  };

  // Export JSON file
  const handleExportLocalFile = () => {
    try {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(db, null, 2));
      const downloadAnchor = document.createElement('a');
      const companySlug = (db.settings.company || 'منشأة').replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_');
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `hesabaty_backup_${companySlug}_${dateStr}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      setSuccessMessage('تم تنزيل ملف النسخة الاحتياطية بنجاح على جهازك!');
    } catch {
      setErrorMessage('تعذر تصدير ملف النسخة الاحتياطية.');
    }
  };

  // Import JSON file
  const handleImportLocalFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        const targetDb = parsed.data || parsed;
        if (!targetDb.invoices || !targetDb.settings) {
          throw new Error('ملف النسخة الاحتياطية غير صالح.');
        }
        if (!window.confirm(`هل أنت متأكد من استرجاع البيانات من الملف "${file.name}"؟ سيتم استبدال البيانات الحالية.`)) {
          return;
        }
        onRestoreDb(targetDb);
        setSuccessMessage('تم استرجاع كافة البيانات بنجاح من الملف!');
        setTimeout(() => onClose(), 1200);
      } catch (err: any) {
        setErrorMessage(err.message || 'حدث خطأ أثناء قراءة ملف النسخة.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden text-right font-sans">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-950 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 rounded-xl shadow-xs">
              <Cloud className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight">
                مركز النسخ الاحتياطي • Google Drive
              </h2>
              <p className="text-xs text-slate-400">
                حفظ واسترجاع كافة الفواتير والبيانات سحابياً على درايف ومحلياً
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="bg-slate-100 p-2 flex gap-1.5 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('drive')}
            className={`flex-1 py-2 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'drive'
                ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Cloud className="w-4 h-4 text-blue-600" />
            <span>نسخ Google Drive السحابي</span>
            {hasGoogleToken && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('local')}
            className={`flex-1 py-2 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'local'
                ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <HardDrive className="w-4 h-4 text-emerald-600" />
            <span>النسخ المحلي وملفات JSON</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {/* Status Messages */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Current Enterprise Badge */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-2xs flex items-center justify-center font-bold text-slate-700">
                <FileCheck className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="font-black text-xs text-slate-900">
                  {db.settings.company || 'المنشأة الحالية'}
                </div>
                <div className="text-[11px] text-slate-500">
                  {db.invoices.length} فاتورة • {db.products.length} صنف • {db.customers.length} عميل
                </div>
              </div>
            </div>

            <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2.5 py-1 rounded-full inline-flex items-center gap-1 self-start sm:self-auto">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              بيانات معزولة ومحمية
            </span>
          </div>

          {/* TAB 1: GOOGLE DRIVE CLOUD */}
          {activeTab === 'drive' && (
            <div className="space-y-4">
              {/* Google Account Connection Status Card */}
              <div className="bg-gradient-to-r from-blue-50 via-indigo-50/40 to-slate-50 border border-blue-200/80 rounded-2xl p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-white rounded-xl shadow-xs border border-blue-100 flex items-center justify-center shrink-0">
                      <svg className="w-6 h-6" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                        <span>حساب Google (Gmail):</span>
                        {hasGoogleToken ? (
                          <span className="text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full text-[10px] inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            متصل وموثق
                          </span>
                        ) : (
                          <span className="text-amber-800 font-bold bg-amber-100 px-2 py-0.5 rounded-full text-[10px]">
                            غير متصل
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5 font-mono">
                        {connectedEmail ? connectedEmail : 'لم يتم ربط حساب Gmail بعد'}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleConnectGoogle}
                    disabled={isLinkingGoogle}
                    className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 self-start sm:self-auto shrink-0"
                  >
                    {isLinkingGoogle ? (
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                    )}
                    <span>{hasGoogleToken ? 'تغيير أو إعادة ربط Gmail' : 'ربط واختيار Gmail من هاتفك'}</span>
                  </button>
                </div>
              </div>

              {/* Upload to Google Drive Box */}
              <div className="bg-white border-2 border-dashed border-blue-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <Cloud className="w-4 h-4 text-blue-600" />
                    <span>رفع وحفظ نسخة احتياطية على Google Drive</span>
                  </span>
                  <span className="text-[10px] bg-blue-50 text-blue-800 font-bold px-2 py-0.5 rounded-md">
                    مساحة تخزين خاصة بك
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="ملاحظة أو عنوان للنسخة (اختياري)..."
                    value={customBackupTitle}
                    onChange={e => setCustomBackupTitle(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-600"
                  />
                  <button
                    type="button"
                    onClick={handleUploadToDrive}
                    disabled={isUploadingToDrive || isLinkingGoogle}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {isUploadingToDrive ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Cloud className="w-4 h-4" />
                    )}
                    <span>حفظ نسخة في Google Drive الآن</span>
                  </button>
                </div>
              </div>

              {/* Google Drive Backups List */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <span>النسخ المحفوظة على Google Drive ({driveBackups.length})</span>
                  </h3>

                  {hasGoogleToken && (
                    <button
                      type="button"
                      onClick={fetchDriveBackups}
                      disabled={isLoadingDrive}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${isLoadingDrive ? 'animate-spin' : ''}`} />
                      <span>تحديث القائمة</span>
                    </button>
                  )}
                </div>

                {!hasGoogleToken ? (
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-3">
                    <Cloud className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="text-xs text-slate-600 font-medium">
                      اربط حساب Google (Gmail) الخاص بك للوصول لنسخك الاحتياطية على Google Drive في أي وقت ومن أي جهاز.
                    </p>
                    <button
                      type="button"
                      onClick={handleConnectGoogle}
                      disabled={isLinkingGoogle}
                      className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors inline-flex items-center gap-2 cursor-pointer"
                    >
                      {isLinkingGoogle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
                      <span>ربط حساب Google (Gmail) الآن</span>
                    </button>
                  </div>
                ) : isLoadingDrive ? (
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center flex flex-col items-center justify-center gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                    <span className="text-xs text-slate-600 font-medium">جاري فحص وجلب النسخ من Google Drive...</span>
                  </div>
                ) : driveBackups.length === 0 ? (
                  <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl text-center text-xs text-slate-500">
                    لا توجد نسخ احتياطية على حساب Google Drive الخاص بك حتى الآن. اضغط على «حفظ نسخة في Google Drive الآن» أعلاه.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {driveBackups.map(file => (
                      <div
                        key={file.id}
                        className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 hover:border-blue-300 transition-all shadow-2xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-xs text-slate-900 truncate flex items-center gap-1.5">
                            <Cloud className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span className="truncate">{file.name}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {new Date(file.createdTime).toLocaleDateString('ar-EG')} - {new Date(file.createdTime).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })} {file.size ? `• حجم: ${file.size}` : ''}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleRestoreFromDrive(file)}
                            disabled={restoringDriveId === file.id}
                            className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                            title="استرجاع البيانات من Google Drive"
                          >
                            {restoringDriveId === file.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              'استرجاع'
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteFromDrive(file)}
                            disabled={deletingDriveId === file.id}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
                            title="حذف من درايف"
                          >
                            {deletingDriveId === file.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-600" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: LOCAL BACKUP & JSON */}
          {activeTab === 'local' && (
            <div className="space-y-4">
              {/* Direct JSON Export & Import */}
              <div className="bg-gradient-to-r from-slate-50 to-emerald-50/40 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-emerald-700" />
                    <span className="text-xs font-black text-slate-900">
                      تنزيل / استرجاع ملف النسخة المباشر (.json)
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-700 font-bold bg-white px-2 py-0.5 rounded border border-emerald-200 shadow-2xs">
                    يعمل بدون إنترنت
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  تنزيل ملف نسخة كاملة على هاتفك أو جهازك ونقله بحرية أو استرجاعه في أي وقت:
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={handleExportLocalFile}
                    className="flex-1 min-w-[160px] px-3.5 py-2.5 bg-white hover:bg-slate-100 text-slate-900 border border-slate-300 rounded-xl text-xs font-black transition-all shadow-2xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-emerald-600" />
                    <span>تنزيل ملف النسخة الآن</span>
                  </button>

                  <label className="flex-1 min-w-[160px] px-3.5 py-2.5 bg-white hover:bg-slate-100 text-slate-900 border border-slate-300 rounded-xl text-xs font-black transition-all shadow-2xs flex items-center justify-center gap-2 cursor-pointer">
                    <Upload className="w-4 h-4 text-blue-600" />
                    <span>استعادة من ملف (.json)</span>
                    <input
                      type="file"
                      accept=".json,application/json"
                      onChange={handleImportLocalFile}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Local Snapshot Creation */}
              <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>إنشاء نقطة استرجاع محلية سريعة</span>
                  </span>
                  <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-md">
                    حفظ داخلي
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="وصف للنسخة..."
                    value={customBackupTitle}
                    onChange={e => setCustomBackupTitle(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-black"
                  />
                  <button
                    type="button"
                    onClick={handleCreateSnapshot}
                    disabled={isSavingLocal}
                    className="px-5 py-2 bg-black hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {isSavingLocal ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    )}
                    <span>حفظ محلي</span>
                  </button>
                </div>
              </div>

              {/* Local Snapshots List */}
              <div className="space-y-2">
                <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-slate-600" />
                  <span>نقاط الاسترجاع المحلية ({localSnapshots.length})</span>
                </h3>

                {localSnapshots.length === 0 ? (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center text-xs text-slate-500">
                    لا توجد نقاط استرجاع محلية محفوظة.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {localSnapshots.map(snap => (
                      <div
                        key={snap.id}
                        className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 hover:border-slate-300 transition-all shadow-2xs"
                      >
                        <div>
                          <div className="font-bold text-xs text-slate-900">{snap.name}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {snap.date} - {snap.time} • ({snap.invoiceCount} فاتورة)
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleRestoreLocalSnapshot(snap)}
                            disabled={restoringLocalId === snap.id}
                            className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                          >
                            {restoringLocalId === snap.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'استرجاع'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteLocalSnapshot(snap.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 px-5">
          <span>نظام حماية ونسخ الحسابات • Hesabaty Cloud ERP</span>
          <span className="font-mono text-[10px]">Google Drive v3 API</span>
        </div>
      </div>
    </div>
  );
};
