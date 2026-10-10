import React, { useState } from 'react';
import {
  UserCheck,
  ShieldCheck,
  Lock,
  Database,
  Settings,
  Plus,
  Trash2,
  Download,
  Upload,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  X,
  Cloud
} from 'lucide-react';
import {
  AccountingDB,
  User,
  FiscalPeriod,
  AppSettings
} from '../types/accounting';
import {
  generateId,
  getTodayDate,
  createSeedData,
  cleanAllDemoTransactions,
  defaultSettings,
  logAudit
} from '../services/accountingStorage';
import { updateCompany, getActiveTenantId } from '../services/tenantService';

interface SystemViewsProps {
  subPage: 'users' | 'audit' | 'periods' | 'backup' | 'settings';
  db: AccountingDB;
  onUpdateDb: (updated: AccountingDB) => void;
  onOpenGoogleDriveBackup?: () => void;
}

export const SystemViews: React.FC<SystemViewsProps> = ({
  subPage,
  db,
  onUpdateDb,
  onOpenGoogleDriveBackup
}) => {
  // User form modal
  const [showUserModal, setShowUserModal] = useState(false);
  const [userName, setUserName] = useState('');
  const [userUsername, setUserUsername] = useState('');
  const [userRole, setUserRole] = useState<'مدير' | 'محاسب' | 'مبيعات' | 'مخزن' | 'كاشير'>('محاسب');

  // Period form modal
  const [showPeriodModal, setShowPeriodModal] = useState(false);
  const [periodName, setPeriodName] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');

  // Settings form states
  const [settingsForm, setSettingsForm] = useState<AppSettings>({ ...db.settings });

  // Audit integrity check results
  const [auditErrors, setAuditErrors] = useState<string[] | null>(null);

  // Run Integrity Check
  const runIntegrityCheck = () => {
    const errors: string[] = [];

    // 1. Check Invoice totals match sum of items
    db.invoices.forEach(inv => {
      const computedSubtotal = inv.items.reduce((s, it) => s + it.total, 0);
      const computedTotal = Math.max(0, computedSubtotal - (inv.discount || 0));
      if (Math.abs(computedTotal - inv.total) > 0.05) {
        errors.push(`الفاتورة رقم ${inv.number}: إجمالي الفاتورة (${inv.total}) لا يطابق مجموع البنود بعد الخصم (${computedTotal}).`);
      }
      // Check items reference valid products
      inv.items.forEach(it => {
        if (!db.products.some(p => p.id === it.productId)) {
          errors.push(`الفاتورة رقم ${inv.number}: تحتوي على صنف غير موجود برقم كود ${it.productCode}.`);
        }
      });
    });

    // 2. Check Journal entries are balanced
    db.journals.forEach(j => {
      const debitSum = j.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
      const creditSum = j.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
      if (Math.abs(debitSum - creditSum) > 0.05) {
        errors.push(`قيد اليومية ${j.number} (${j.description}): غير متوازن! المدين = ${debitSum} والدائن = ${creditSum}.`);
      }
    });

    // 3. Check stock movements consistency
    db.stockMovements.forEach(sm => {
      if (!db.products.some(p => p.id === sm.productId)) {
        errors.push(`حركة مخزون بتاريخ ${sm.date} مرتبطة بصنف محذوف.`);
      }
    });

    setAuditErrors(errors);
  };

  // Add User
  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim() || !userUsername.trim()) return alert('أكمل بيانات المستخدم');

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const newUser: User = {
      id: generateId('usr'),
      name: userName.trim(),
      username: userUsername.trim().toLowerCase(),
      role: userRole,
      active: true
    };
    updated.users.push(newUser);
    logAudit(updated, 'إضافة مستخدم جديد', `${newUser.name} (${newUser.role})`);
    onUpdateDb(updated);
    setShowUserModal(false);
    setUserName('');
    setUserUsername('');
  };

  // Add Period
  const handleSavePeriod = (e: React.FormEvent) => {
    e.preventDefault();
    if (!periodName.trim() || !periodFrom || !periodTo) return alert('أكمل تواريخ الفترة');

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const newPeriod: FiscalPeriod = {
      id: generateId('per'),
      name: periodName.trim(),
      from: periodFrom,
      to: periodTo,
      status: 'مفتوح'
    };
    updated.periods.push(newPeriod);
    logAudit(updated, 'إنشاء فترة مالية جديدة', newPeriod.name);
    onUpdateDb(updated);
    setShowPeriodModal(false);
  };

  const handleClosePeriod = (pId: string) => {
    if (!confirm('هل ترغب في إقفال هذه الفترة المحاسبية؟')) return;
    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const p = updated.periods.find(item => item.id === pId);
    if (p) p.status = 'مغلق';
    logAudit(updated, 'إقفال فترة مالية', p?.name || '');
    onUpdateDb(updated);
  };

  // Export JSON Backup
  const handleExportBackup = () => {
    const dataStr = JSON.stringify(db, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hesabaty_backup_${getTodayDate()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Import JSON Backup
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed || !Array.isArray(parsed.products) || !Array.isArray(parsed.accounts)) {
          alert('ملف النسخ الاحتياطي غير صالح أو تالف.');
          return;
        }
        if (!confirm('تحذير: سيتم استبدال جميع البيانات الحالية بالبيانات المستوردة. هل تود المتابعة؟')) {
          return;
        }
        onUpdateDb(parsed);
        alert('تم استيراد قاعدة البيانات بنجاح واستعادة جميع الفواتير والحسابات.');
      } catch (err) {
        alert('حدث خطأ أثناء قراءة الملف.');
      }
    };
    reader.readAsText(file);
  };

  // Clean all transactions, invoices, products, customers, and suppliers while preserving company info and chart of accounts
  const handleCleanAllTransactions = () => {
    if (!confirm('تأكيد هام: هل ترغب في تنظيف وتصفير النظام بالكامل من كافة الفواتير، الحركات، الأصناف، العملاء، الموردين، سندات القبض والصرف، وقيود اليومية والتقارير التجريبية؟\n\nسيتم الإبقاء على دليل الحسابات القياسي وبيانات المنشأة جاهزة للعمل الفعلي.')) return;
    const cleaned = cleanAllDemoTransactions(db);
    onUpdateDb(cleaned);
    alert('تم تفريغ وتنظيف النظام بالكامل بنجاح من كافة الأصناف والعملاء والموردين والحركات والفواتير! أصبح النظام نظيفاً 100% وجاهزاً للبدء الفعلي.');
  };

  // Reset data to factory clean state
  const handleResetData = () => {
    if (!confirm('تحذير: سيتم إعادة تعيين البرنامج بالكامل إلى الحالة الأولية الفارغة النظيفة (بدون أي بيانات تجريبية). هل أنت متأكد؟')) return;
    const fresh = createSeedData();
    onUpdateDb(fresh);
    alert('تمت إعادة ضبط النظام بنجاح إلى الحالة الفارغة النظيفة الجاهزة للعمل.');
  };

  // Save Settings
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    updated.settings = { ...settingsForm };
    logAudit(updated, 'تحديث إعدادات المنشأة', updated.settings.company);

    // Sync active tenant name and currency in company registry
    const activeId = getActiveTenantId();
    if (activeId) {
      updateCompany(activeId, {
        name: updated.settings.company,
        currency: updated.settings.currency,
        phone: updated.settings.phone,
        address: updated.settings.address
      });
    }

    onUpdateDb(updated);
    alert('تم حفظ إعدادات النظام بنجاح.');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. USERS */}
      {subPage === 'users' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <UserCheck className="w-6 h-6" />
                <span>المستخدمون وصلاحيات النظام</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                إدارة حسابات المدراء، المحاسبين، وموظفي المبيعات ونقاط البيع
              </p>
            </div>
            <button
              onClick={() => setShowUserModal(true)}
              className="px-4 py-2 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة مستخدم جديد</span>
            </button>
          </div>

          {/* Responsive Users Cards System */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
            {db.users.map(u => (
              <div key={u.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:shadow-xs transition-all space-y-2.5">
                <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">{u.name}</h3>
                    <span className="font-mono text-xs text-slate-500">@{u.username}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    نشط
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-slate-500">الدور والصلاحية:</span>
                  <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 border border-slate-200 text-slate-800">
                    {u.role}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 2. AUDIT TRAIL & INTEGRITY DOCTOR */}
      {subPage === 'audit' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <ShieldCheck className="w-6 h-6" />
                <span>سجل النشاط وفحص سلامة وتناسق القيود</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                مراقبة تحركات العمليات والتدقيق الآلي لتوازن القيود وصحة الأرصدة
              </p>
            </div>
            <button
              onClick={runIntegrityCheck}
              className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
            >
              <RefreshCw className="w-4 h-4" />
              <span>فحص سلامة وتناسق البيانات الآن</span>
            </button>
          </div>

          {/* Audit Results Panel */}
          {auditErrors !== null && (
            <div className={`p-4 rounded-xl border ${
              auditErrors.length === 0
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}>
              <div className="flex items-center gap-2 font-black text-sm mb-1">
                {auditErrors.length === 0 ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>فحص السلامة المحاسبية سليم 100%!</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                    <span>تم العثور على ملاحظات تدقيقية ({auditErrors.length}):</span>
                  </>
                )}
              </div>
              {auditErrors.length === 0 ? (
                <p className="text-xs text-emerald-700">
                  جميع القيود اليومية متوازنة (المدين = الدائن)، وتطابق كامل بين فواتير المبيعات وبنود المخزون.
                </p>
              ) : (
                <ul className="list-disc list-inside text-xs space-y-1 mt-2 text-rose-800 font-medium">
                  {auditErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Responsive Audit Activity Cards (No Horizontal Scroll) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-800 flex items-center justify-between">
              <span>سجل النشاط والتدقيق الأخير (Audit Activity Log)</span>
              <span className="text-[11px] font-mono text-slate-500">{db.audit.length} عملية مسجلة</span>
            </div>
            
            <div className="p-3 space-y-2.5 max-h-[550px] overflow-y-auto">
              {db.audit.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">لا توجد سجلات نشاط</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {db.audit.map(log => (
                    <div key={log.id} className="p-3 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white border border-slate-200 text-slate-800">
                          {log.action}
                        </span>
                        <span className="font-mono text-slate-500 text-[10px]">
                          {new Date(log.at).toLocaleString('ar-EG')}
                        </span>
                      </div>
                      <div className="text-xs">
                        <span className="font-bold text-slate-900 block">{log.user}</span>
                        <p className="text-slate-600 text-[11px] mt-0.5">{log.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* 3. FISCAL PERIODS (Responsive Cards System) */}
      {subPage === 'periods' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <Lock className="w-6 h-6" />
                <span>الفترات المحاسبية والإقفال المالي</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                تحديد الفترات الربع سنوية والسنوية وإقفال الحسابات لمنع التعديل في الفترات المغلقة
              </p>
            </div>
            <button
              onClick={() => setShowPeriodModal(true)}
              className="px-4 py-2 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة فترة جديدة</span>
            </button>
          </div>

          {/* Responsive Periods Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
            {db.periods.map(p => (
              <div key={p.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:shadow-xs transition-all space-y-3">
                <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                  <h3 className="font-bold text-sm text-slate-900">{p.name}</h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    p.status === 'مفتوح' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {p.status}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                  <div className="flex items-center justify-between">
                    <span>من تاريخ:</span>
                    <span className="font-mono font-bold text-slate-900">{p.from}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>إلى تاريخ:</span>
                    <span className="font-mono font-bold text-slate-900">{p.to}</span>
                  </div>
                </div>

                {p.status === 'مفتوح' && (
                  <div className="pt-1">
                    <button
                      onClick={() => handleClosePeriod(p.id)}
                      className="w-full py-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    >
                      إقفال الفترة المحاسبية
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* 4. BACKUP & RESTORE */}
      {subPage === 'backup' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <Database className="w-6 h-6" />
                <span>النسخ الاحتياطي واستعادة البيانات</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                تصدير نسخة كاملة من النظام بصيغة JSON، استيراد بيانات سابقة، أو إعادة التهيئة
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Backup & Data Protection Center Card */}
            <div className="md:col-span-3 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white p-6 rounded-3xl shadow-lg border border-emerald-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-600 rounded-xl">
                    <ShieldCheck className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-base font-black text-white">
                    مركز النسخ الاحتياطي وحماية البيانات المتقدم
                  </h3>
                  <span className="bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    حماية تامة 100%
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                  تخزين واسترجاع قواعد البيانات ونقاط الاسترجاع بنقرة واحدة، وتنزيل نسخ مشفرة كاملة لأي هاتف أو جهاز كمبيوتر لحماية كافة معاملاتك المحاسبية.
                </p>
              </div>

              {onOpenGoogleDriveBackup && (
                <button
                  type="button"
                  onClick={onOpenGoogleDriveBackup}
                  className="px-5 py-3 bg-white hover:bg-slate-100 text-slate-950 font-bold text-xs rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>فتح مركز النسخ الاحتياطي</span>
                </button>
              )}
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
                <Download className="w-5 h-5 text-slate-700" />
                <span>تصدير نسخة احتياطية</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                تحميل ملف يحتوي على جميع الفواتير، الأصناف، العملاء، القيود اليومية، وأرصدة الخزينة.
              </p>
              <button
                onClick={handleExportBackup}
                className="w-full py-2 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
              >
                تنزيل ملف النسخة الاحتياطية (JSON)
              </button>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
                <Upload className="w-5 h-5 text-slate-700" />
                <span>استيراد نسخة سابقة</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                استرجاع البيانات المحفوظة مسبقاً من ملف JSON واستبدال البيانات الحالية.
              </p>
              <label className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 rounded-lg text-xs font-bold transition-all text-center block cursor-pointer">
                اختيار ملف لاستيراده
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportBackup}
                  className="hidden"
                />
              </label>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-2xs space-y-3 bg-amber-50/20">
              <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
                <Trash2 className="w-5 h-5 text-amber-600" />
                <span>تفريغ وتنظيف النظام من البيانات التجريبية</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                حذف وتصفير جميع الأصناف والعملاء والموردين والفواتير والحركات وسندات الصرف والقبض وقيود اليومية والتقارير لتفريغ النظام للعمل الفعلي، مع الحفاظ على دليل الحسابات القياسي وبيانات المنشأة.
              </p>
              <button
                onClick={handleCleanAllTransactions}
                className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
              >
                تفريغ النظام من أي بيانات تجريبية الآن
              </button>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
                <RefreshCw className="w-5 h-5 text-rose-600" />
                <span>إعادة ضبط المصنع الشامل</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                إعادة ضبط قاعدة البيانات بالكامل إلى الحالة الأولية النظيفة مع تهيئة دليل الحسابات القياسي.
              </p>
              <button
                onClick={handleResetData}
                className="w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-all"
              >
                إعادة ضبط قاعدة البيانات
              </button>
            </div>
          </div>
        </>
      )}

      {/* 5. SETTINGS */}
      {subPage === 'settings' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <Settings className="w-6 h-6" />
                <span>إعدادات النظام والمنشأة التجارية</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                تخصيص اسم الشركة، الترويسة، العملة الافتراضية، طريقة حساب التكلفة، ونسب الضرائب
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveSettings} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs max-w-3xl space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم المنشأة / الشركة</label>
                <input
                  type="text"
                  required
                  value={settingsForm.company}
                  onChange={e => setSettingsForm({ ...settingsForm, company: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف للتواصل</label>
                <input
                  type="text"
                  value={settingsForm.phone}
                  onChange={e => setSettingsForm({ ...settingsForm, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">العنوان والمقر الرئيسي</label>
                <input
                  type="text"
                  value={settingsForm.address}
                  onChange={e => setSettingsForm({ ...settingsForm, address: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">العملة الافتراضية</label>
                <input
                  type="text"
                  value={settingsForm.currency}
                  onChange={e => setSettingsForm({ ...settingsForm, currency: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">عنوان ترويسة الفاتورة</label>
                <input
                  type="text"
                  value={settingsForm.invoiceTitle}
                  onChange={e => setSettingsForm({ ...settingsForm, invoiceTitle: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">حد التنبيه لنواقص المخزون</label>
                <input
                  type="number"
                  value={settingsForm.low}
                  onChange={e => setSettingsForm({ ...settingsForm, low: parseInt(e.target.value) || 5 })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">طريقة تقييم تكلفة المخزون</label>
                <select
                  value={settingsForm.cost}
                  onChange={e => setSettingsForm({ ...settingsForm, cost: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                >
                  <option value="average">المتوسط المرجح للتكلفة (Weighted Average Costing)</option>
                  <option value="last">آخر سعر شراء (Last Purchase Price)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">تفعيل ضريبة القيمة المضافة (VAT)</label>
                <select
                  value={settingsForm.tax}
                  onChange={e => setSettingsForm({ ...settingsForm, tax: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                >
                  <option value="disabled">غير مفعلة (Disabled)</option>
                  <option value="enabled">مفعلة (Enabled 14%)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">شروط وسياسة الاستبدال الافتراضية بالفواتير</label>
              <textarea
                rows={2}
                value={settingsForm.notes}
                onChange={e => setSettingsForm({ ...settingsForm, notes: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                className="px-6 py-2 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
              >
                حفظ الإعدادات
              </button>
            </div>
          </form>
        </>
      )}

      {/* User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl w-full max-w-sm p-4 space-y-3">
            <h2 className="text-sm font-black text-slate-900">إضافة مستخدم جديد للنظام</h2>
            <form onSubmit={handleSaveUser} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">الاسم الكامل</label>
                <input
                  type="text"
                  required
                  value={userName}
                  onChange={e => setUserName(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">اسم الدخول (Username)</label>
                <input
                  type="text"
                  required
                  value={userUsername}
                  onChange={e => setUserUsername(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">الدور والصلاحية</label>
                <select
                  value={userRole}
                  onChange={e => setUserRole(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                >
                  <option value="مدير">مدير نظام كامل الصلاحيات</option>
                  <option value="محاسب">محاسب مالي</option>
                  <option value="مبيعات">موظف مبيعات</option>
                  <option value="كاشير">كاشير ونقاط بيع</option>
                  <option value="مخزن">أمين مخزن</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowUserModal(false)} className="px-3 py-1.5 bg-slate-100 rounded text-xs font-bold">إلغاء</button>
                <button type="submit" className="px-4 py-1.5 bg-black text-white rounded text-xs font-bold">حفظ المستخدم</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Period Modal */}
      {showPeriodModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl w-full max-w-sm p-4 space-y-3">
            <h2 className="text-sm font-black text-slate-900">إنشاء فترة محاسبية جديدة</h2>
            <form onSubmit={handleSavePeriod} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">اسم الفترة (مثال: الربع الأول 2027)</label>
                <input
                  type="text"
                  required
                  value={periodName}
                  onChange={e => setPeriodName(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">من تاريخ</label>
                <input
                  type="date"
                  required
                  value={periodFrom}
                  onChange={e => setPeriodFrom(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">إلى تاريخ</label>
                <input
                  type="date"
                  required
                  value={periodTo}
                  onChange={e => setPeriodTo(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowPeriodModal(false)} className="px-3 py-1.5 bg-slate-100 rounded text-xs font-bold">إلغاء</button>
                <button type="submit" className="px-4 py-1.5 bg-black text-white rounded text-xs font-bold">إنشاء الفترة</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
