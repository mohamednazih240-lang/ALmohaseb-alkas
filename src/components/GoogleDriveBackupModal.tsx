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
  FileSpreadsheet,
  HardDrive,
  Sparkles,
  Smartphone
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
  signInWithGoogle
} from '../services/firebaseAuth';
import { signInWithGoogleIdentity } from '../services/gisAuth';
import { useModalBackHandler } from '../hooks/useModalBackHandler';

interface GoogleDriveBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  db: AccountingDB;
  onRestoreDb: (restored: AccountingDB) => void;
}

export const GoogleDriveBackupModal: React.FC<GoogleDriveBackupModalProps> = ({
  isOpen,
  onClose,
  db,
  onRestoreDb
}) => {
  const [backups, setBackups] = useState<DriveBackupFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [customBackupTitle, setCustomBackupTitle] = useState('');

  useModalBackHandler(isOpen, onClose, 'google_drive_modal');

  const session = getStoredAuthSession();
  const hasGoogleToken = !!getGoogleAccessToken();

  // Load backups when modal opens
  const fetchBackups = async () => {
    if (!hasGoogleToken) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const list = await listGoogleDriveBackups();
      setBackups(list);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'تعذر جلب النسخ من Google Drive');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && hasGoogleToken) {
      fetchBackups();
    }
  }, [isOpen, hasGoogleToken]);

  // Connect Google Account if not yet connected
  const handleConnectGoogle = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      try {
        await signInWithGoogleIdentity();
      } catch (gisErr: any) {
        if (
          gisErr?.message === 'popup_closed' ||
          gisErr?.message?.includes('closed')
        ) {
          setErrorMessage('تم إغلاق نافذة تسجيل الدخول بجوجل.');
          return;
        }
        // Fallback to Firebase
        await signInWithGoogle();
      }
      await fetchBackups();
    } catch (err: any) {
      if (
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request' ||
        err?.message === 'popup_closed' ||
        err?.message?.includes('closed')
      ) {
        setErrorMessage('تم إغلاق نافذة تسجيل الدخول بجوجل.');
      } else {
        setErrorMessage('تعذر ربط حساب Google حالياً. يرجى التأكد من السماح بالنوافذ المنبثقة.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Create new backup on Google Drive
  const handleCreateBackup = async () => {
    setIsUploading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const companySlug = (db.settings.company || 'منشأة').replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_');
      const fileName = customBackupTitle.trim()
        ? `hesabaty_backup_${customBackupTitle.trim().replace(/\s+/g, '_')}_${Date.now()}.json`
        : `hesabaty_backup_${companySlug}_${Date.now()}.json`;

      const created = await uploadBackupToGoogleDrive(db, fileName);
      setSuccessMessage('تم إنشاء وحفظ النسخة الاحتياطية بنجاح على حساب Google Drive الخاص بك!');
      setCustomBackupTitle('');
      await fetchBackups();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'فشل حفظ النسخة على Google Drive');
    } finally {
      setIsUploading(false);
    }
  };

  // Restore backup from Google Drive
  const handleRestore = async (backup: DriveBackupFile) => {
    if (!confirm(`هل أنت متأكد من استرجاع النسخة "${backup.name}"؟ سيتم استبدال البيانات الحالية بالبيانات المحفوظة في هذه النسخة.`)) {
      return;
    }

    setRestoringId(backup.id);
    setErrorMessage(null);
    try {
      const restoredDb = await downloadAndRestoreBackupFromDrive(backup.id);
      onRestoreDb(restoredDb);
      setSuccessMessage('تم استرجاع جميع البيانات بنجاح من Google Drive!');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'حدث خطأ أثناء استرجاع النسخة.');
    } finally {
      setRestoringId(null);
    }
  };

  // Delete backup from Google Drive
  const handleDelete = async (backupId: string) => {
    if (!confirm('هل تريد حذف هذه النسخة الاحتياطية من Google Drive نهائياً؟')) return;
    try {
      await deleteBackupFromDrive(backupId);
      setBackups(prev => prev.filter(b => b.id !== backupId));
    } catch {
      alert('تعذر حذف النسخة.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden text-right font-sans">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 rounded-xl shadow-xs">
              <Cloud className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight">
                النسخ الاحتياطي السحابي عبر Google Drive
              </h2>
              <p className="text-xs text-slate-400">
                حفظ واسترجاع البيانات عبر الجيميل على أي هاتف أو كمبيوتر
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

        {/* Body Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {/* Messages */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Account Status Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-2xs flex items-center justify-center font-bold text-slate-700">
                {session?.googlePhoto ? (
                  <img src={session.googlePhoto} alt="Google" className="w-full h-full rounded-xl object-cover" />
                ) : (
                  <Cloud className="w-5 h-5 text-blue-600" />
                )}
              </div>
              <div>
                <div className="font-black text-xs text-slate-900">
                  {session?.googleEmail ? session.googleEmail : 'حساب Google غير مرتبط حالياً'}
                </div>
                <div className="text-[11px] text-slate-500">
                  {hasGoogleToken
                    ? 'متصل بنجاح مع Google Drive (جاهز للنسخ والاسترجاع)'
                    : 'سجل دخولك بالجيميل لحفظ النسخ السحابية التلقائية'}
                </div>
              </div>
            </div>

            {!hasGoogleToken && (
              <button
                type="button"
                onClick={handleConnectGoogle}
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
                <span>ربط حساب Google (Gmail)</span>
              </button>
            )}
          </div>

          {/* Create Backup Action Box */}
          {hasGoogleToken && (
            <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <Upload className="w-4 h-4 text-emerald-600" />
                  <span>إنشاء نسخة احتياطية سحابية جديدة الآن</span>
                </span>
                <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-md border border-emerald-200">
                  {db.invoices.length} فاتورة • {db.vouchers.length} سند
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="وصف اختياري للنسخة (مثال: نسخة نهاية الأسبوع)..."
                  value={customBackupTitle}
                  onChange={e => setCustomBackupTitle(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
                <button
                  type="button"
                  onClick={handleCreateBackup}
                  disabled={isUploading}
                  className="px-5 py-2 bg-black hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  <span>رفع وحفظ على Drive</span>
                </button>
              </div>
            </div>
          )}

          {/* Mobile Cross-Device Notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5 text-[11px] text-blue-900 flex items-start gap-2.5">
            <Smartphone className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold block">ميزة المزامنة والاسترجاع على أي هاتف آخر:</span>
              <p className="text-blue-800 leading-relaxed">
                إذا قمت بفتح هذا البرنامج من أي هاتف أو جهاز كمبيوتر آخر وسجلت الدخول بنفس حساب الجيميل، سيتعرف النظام عليك مباشرة ويعرض جميع هذه النسخ المحفوظة لتسترجع كافة الفواتير والحسابات بضغطة زر واحدة!
              </p>
            </div>
          </div>

          {/* Backups List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-slate-600" />
                <span>النسخ المحفوظة على حساب Google Drive ({backups.length})</span>
              </h3>
              {hasGoogleToken && (
                <button
                  type="button"
                  onClick={fetchBackups}
                  disabled={isLoading}
                  className="text-xs text-slate-500 hover:text-black flex items-center gap-1 cursor-pointer font-bold"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>تحديث القائمة</span>
                </button>
              )}
            </div>

            {isLoading && backups.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-slate-600" />
                <span>جاري البحث عن النسخ الاحتياطية في Google Drive...</span>
              </div>
            ) : backups.length === 0 ? (
              <div className="py-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-500 text-xs space-y-1">
                <Cloud className="w-8 h-8 mx-auto text-slate-400 mb-1" />
                <div className="font-bold">لا توجد نسخ احتياطية مسجلة بعد على Drive</div>
                <div className="text-[11px] text-slate-400">
                  اضغط على زر "رفع وحفظ على Drive" بالأعلى لإنشاء أول نسخة سحابية آمنة.
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {backups.map(b => (
                  <div
                    key={b.id}
                    className="p-3.5 bg-white border border-slate-200 hover:border-slate-300 rounded-2xl shadow-2xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="font-bold text-xs text-slate-900 flex items-center gap-2">
                        <span>{b.name}</span>
                        {b.size && (
                          <span className="text-[10px] bg-slate-100 font-mono text-slate-600 px-1.5 py-0.5 rounded">
                            {b.size}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{new Date(b.createdTime).toLocaleString('ar-EG')}</span>
                      </div>
                      {b.description && (
                        <div className="text-[11px] text-emerald-700 font-medium">
                          {b.description}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleRestore(b)}
                        disabled={restoringId === b.id}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        title="استرجاع كافة البيانات من هذه النسخة"
                      >
                        {restoringId === b.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        <span>استرجاع النسخة بالكامل</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(b.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                        title="حذف النسخة من Drive"
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
      </div>
    </div>
  );
};
