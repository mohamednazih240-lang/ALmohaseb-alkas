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
  Cloud,
  Edit,
  KeyRound,
  Eye,
  EyeOff,
  Building2,
  Store,
  Check,
  Search,
  CheckSquare,
  Square,
  SlidersHorizontal
} from 'lucide-react';
import {
  AccountingDB,
  User,
  UserPermissions,
  FiscalPeriod,
  AppSettings,
  Branch
} from '../types/accounting';
import { normalizeCompanyCode } from '../services/cloudSyncService';

export interface PermissionItem {
  key: keyof UserPermissions;
  label: string;
  description: string;
}

export interface PermissionCategory {
  category: string;
  badge: string;
  color: string;
  items: PermissionItem[];
}

export const ALL_SYSTEM_PERMISSIONS: PermissionCategory[] = [
  {
    category: '1. فواتير المبيعات وعمليات البيع ونقاط POS',
    badge: 'مبيعات',
    color: 'emerald',
    items: [
      { key: 'canViewSales', label: 'عرض واستعراض فواتير المبيعات', description: 'تصفح والاطلاع على سجلات فواتير البيع وأرشيفها' },
      { key: 'canCreateSales', label: 'إصدار وإنشاء فواتير بيع جديدة', description: 'إضافة فواتير نقدية، إلكترونية، وآجلة للعملاء' },
      { key: 'canEditSales', label: 'تعديل فواتير المبيعات الصادرة', description: 'تعديل البنود والكميات والأسعار بعد الحفظ' },
      { key: 'canDeleteSales', label: 'حذف فواتير المبيعات', description: 'إلغاء وحذف الفاتورة وعكس قيودها ومخزونها' },
      { key: 'canPrintSales', label: 'طباعة وتصدير فواتير المبيعات', description: 'طباعة إيصالات الكاشير الحرارية والفواتير الضريبية A4 وتصدير CSV' },
      { key: 'canApplyDiscounts', label: 'تطبيق الخصومات وتعديل أسعار البيع', description: 'إمكانية إعطاء خصم للعميل أو تغيير سعر البيع الافتراضي بالفاتورة' },
      { key: 'canManageQuotesOrders', label: 'عروض الأسعار وأوامر البيع والشراء', description: 'إصدار عروض الأسعار وتحويلها لفواتير مبيعات' },
      { key: 'canManageSalesReturns', label: 'مرتجعات المبيعات واسترداد السلع', description: 'إرجاع السلع للعملاء وعكس الذمم المالية وإيداعها بالمخزن' }
    ]
  },
  {
    category: '2. فواتير المشتريات والتوريدات',
    badge: 'مشتريات',
    color: 'blue',
    items: [
      { key: 'canViewPurchases', label: 'عرض فواتير المشتريات', description: 'الاطلاع على فواتير الشراء وأرشيف التوريد' },
      { key: 'canCreatePurchases', label: 'إدخال فواتير مشتريات جديدة', description: 'تسجيل بضائع ومشتريات جديدة للمحل وتحديث التكلفة' },
      { key: 'canEditPurchases', label: 'تعديل فواتير المشتريات', description: 'تحديث أسعار وتكاليف التوريد والكميات' },
      { key: 'canDeletePurchases', label: 'حذف فواتير المشتريات', description: 'حذف فاتورة شراء وعكس رصيد المخزن والمورد' },
      { key: 'canManageProcurement', label: 'دورة المشتريات والمطابقة (GRN)', description: 'أذونات الاستلام المخزني والمطابقة الثلاثية' },
      { key: 'canManagePurchaseReturns', label: 'مرتجعات المشتريات للموردين', description: 'رد البضاعة التالفة أو غير المطابقة للموردين' }
    ]
  },
  {
    category: '3. العملاء والموردين والجهات',
    badge: 'جهات',
    color: 'indigo',
    items: [
      { key: 'canViewCustomers', label: 'استعراض دليل وقوائم العملاء', description: 'تصفح بيانات العملاء وأرقام هواتفهم' },
      { key: 'canManageCustomers', label: 'إضافة وتعديل العملاء وسقف الائتمان', description: 'إضافة عملاء جدد وتحديد سقف المديونية وطباعة كشوف الحساب' },
      { key: 'canDeleteCustomers', label: 'حذف العملاء من النظام', description: 'حذف سجلات العملاء من قاعدة البيانات' },
      { key: 'canViewSuppliers', label: 'استعراض دليل وقوائم الموردين', description: 'تصفح بيانات الموردين والشركات الموردة' },
      { key: 'canManageSuppliers', label: 'إدارة الموردين والذمم الدائنة', description: 'تسجيل موردين ومتابعة كشوف حساباتهم ومديونياتهم' },
      { key: 'canDeleteSuppliers', label: 'حذف الموردين من النظام', description: 'حذف سجلات الموردين من قاعدة البيانات' }
    ]
  },
  {
    category: '4. الخزينة والمالية والمصروفات',
    badge: 'خزينة',
    color: 'amber',
    items: [
      { key: 'canCreateReceipts', label: 'إصدار سندات القبض المالية', description: 'تحصيل نقدية وشيكات وحوالات من العملاء' },
      { key: 'canCreatePayments', label: 'إصدار سندات الصرف للموردين', description: 'صرف وسداد المستحقات والموردين' },
      { key: 'canManageTreasury', label: 'حركة الخزائن وطرق الدفع والتحويلات', description: 'التحويل بين الخزينة والبنوك والمحافظ النقدية' },
      { key: 'canManageExpenses', label: 'تسجيل وتعديل المصروفات التشغيلية', description: 'فواتير الإيجار، الكهرباء، المرتبات، والنثريات' },
      { key: 'canDeleteExpenses', label: 'حذف المصروفات المسجلة', description: 'إلغاء وحذف قيود المصروفات غير الصحيحة' },
      { key: 'canManageRevenues', label: 'تسجيل وتعديل الإيرادات الإضافية', description: 'إيرادات إضافية وعوائد خارج النشاط الأساسي' }
    ]
  },
  {
    category: '5. المخزون والأصناف والمستودعات',
    badge: 'مخزون',
    color: 'purple',
    items: [
      { key: 'canViewProducts', label: 'عرض دليل الأصناف والأسعار والكميات', description: 'تصفح قائمة السلع ومقارنة الأسعار والمخزون' },
      { key: 'canManageProducts', label: 'إضافة وتعديل الأصناف والأسعار', description: 'إدخال أصناف جديدة وتعديل أسعار البيع والتكلفة' },
      { key: 'canDeleteProducts', label: 'حذف الأصناف من دليل المنتجات', description: 'حذف كروت الأصناف نهائياً من قاعدة البيانات' },
      { key: 'canPrintBarcodes', label: 'استوديو وطباعة ملصقات الباركود', description: 'توليد وطباعة استيكرات الباركود والأسعار' },
      { key: 'canManageStock', label: 'الجرد والتسويات المخزنية وكارت الحركة', description: 'تسوية فروقات الجرد وعجز وزيادة المخزن' },
      { key: 'canManageWarehouses', label: 'إدارة المخازن والتحويلات الداخلية', description: 'التحويل بين مستودعات ومنافذ البيع' }
    ]
  },
  {
    category: '6. التقارير المالية والأرباح والحسابات',
    badge: 'أرباح',
    color: 'rose',
    items: [
      { key: 'canDailyClosing', label: 'تقفيل اليومية والورديات (Z-Report)', description: 'مطابقة درج النقدية وحساب أرباح الشفت اليومي' },
      { key: 'canViewProfits', label: 'تقرير أرباح الفواتير والأصناف', description: 'تحليل هامش الربح وصافي أرباح المبيعات' },
      { key: 'canViewReports', label: 'التقارير المالية والمحاسبية الشاملة', description: 'قوائم الدخل والمبيعات والمشتريات وميزان المراجعة' },
      { key: 'canManageAccounting', label: 'دليل وشجرة الحسابات والقيود اليومية', description: 'القيود المزدوجة ودفتر الأستاذ العام' },
      { key: 'canManageCostCenters', label: 'مراكز التكلفة والعملات والأصول الثابتة', description: 'توزيع النفقات وفروق الصرف وحساب الإهلاك' },
      { key: 'canBankReconciliation', label: 'التسوية البنكية ومطابقة كشوف الحساب', description: 'مطابقة حركة البنك مع السجلات الدفترية' },
      { key: 'canClosePeriods', label: 'إقفال الفترات المحاسبية والترحيل السنوي', description: 'إقفال الفترات وترحيل الأرصدة الختامية' }
    ]
  },
  {
    category: '7. إدارة النظام والمنشأة والفروع',
    badge: 'إدارة',
    color: 'slate',
    items: [
      { key: 'canManageBranches', label: 'إدارة فروع ومنافذ المحل', description: 'إضافة وتعديل فروع ونقاط البيع التابعة' },
      { key: 'canManageUsers', label: 'إدارة المستخدمين والتحكم بكافة الصلاحيات', description: 'إضافة موظفين وتخصيص صلاحيات كل مستخدم' },
      { key: 'canViewAudit', label: 'سجل النشاط وفحص السلامة والتدقيق', description: 'متابعة سجلات حركة كل مستخدم وفحص توازن القيود' },
      { key: 'canManageBackup', label: 'النسخ الاحتياطي واستعادة البيانات', description: 'تصدير واستيراد قواعد البيانات سحابياً ومحلياً' },
      { key: 'canManageSettings', label: 'إعدادات النظام والضريبة والشروط', description: 'بيانات المحل وتفعيل ضريبة VAT وتخصيص الفواتير' }
    ]
  }
];

export const TOTAL_SYSTEM_PERMISSIONS_COUNT = ALL_SYSTEM_PERMISSIONS.reduce((sum, c) => sum + c.items.length, 0);

export function getAllPermissionsPreset(val: boolean): UserPermissions {
  const p: any = {};
  ALL_SYSTEM_PERMISSIONS.forEach(cat => {
    cat.items.forEach(it => {
      p[it.key] = val;
    });
  });
  p.canViewInvoices = val;
  p.canCreateInvoices = val;
  return p as UserPermissions;
}

export function getRolePreset(role: 'مدير' | 'محاسب' | 'مبيعات' | 'مخزن' | 'كاشير' | 'مخصص'): UserPermissions {
  if (role === 'مدير') {
    return getAllPermissionsPreset(true);
  }
  if (role === 'كاشير') {
    return {
      ...getAllPermissionsPreset(false),
      canViewSales: true,
      canCreateSales: true,
      canEditSales: false,
      canDeleteSales: false,
      canPrintSales: true,
      canApplyDiscounts: false,
      canManageQuotesOrders: false,
      canManageSalesReturns: true,
      canViewCustomers: true,
      canManageCustomers: true,
      canCreateReceipts: true,
      canViewProducts: true,
      canPrintBarcodes: true,
      canDailyClosing: true,
      canViewInvoices: true,
      canCreateInvoices: true
    };
  }
  if (role === 'مبيعات') {
    return {
      ...getAllPermissionsPreset(false),
      canViewSales: true,
      canCreateSales: true,
      canEditSales: true,
      canDeleteSales: false,
      canPrintSales: true,
      canApplyDiscounts: true,
      canManageQuotesOrders: true,
      canManageSalesReturns: true,
      canViewCustomers: true,
      canManageCustomers: true,
      canCreateReceipts: true,
      canViewProducts: true,
      canPrintBarcodes: true,
      canDailyClosing: true,
      canViewInvoices: true,
      canCreateInvoices: true
    };
  }
  if (role === 'مخزن') {
    return {
      ...getAllPermissionsPreset(false),
      canViewProducts: true,
      canManageProducts: true,
      canDeleteProducts: false,
      canPrintBarcodes: true,
      canManageStock: true,
      canManageWarehouses: true,
      canManageProcurement: true,
      canViewPurchases: true,
      canViewInvoices: false,
      canCreateInvoices: false
    };
  }
  if (role === 'محاسب') {
    return {
      ...getAllPermissionsPreset(true),
      canDeleteSales: false,
      canDeletePurchases: false,
      canDeleteProducts: false,
      canDeleteCustomers: false,
      canDeleteSuppliers: false,
      canManageUsers: false,
      canManageBranches: false,
      canManageSettings: false
    };
  }
  if (role === 'مخصص') {
    return {
      ...getAllPermissionsPreset(false),
      canViewSales: true,
      canCreateSales: true,
      canPrintSales: true,
      canViewProducts: true,
      canViewCustomers: true,
      canCreateReceipts: true,
      canDailyClosing: true,
      canViewReports: true,
      canViewInvoices: true,
      canCreateInvoices: true
    };
  }
  return getAllPermissionsPreset(true);
}

export function countActivePermissions(u: User): number {
  if (u.role === 'مدير' && (!u.permissions || Object.values(u.permissions).every(v => v === true))) {
    return TOTAL_SYSTEM_PERMISSIONS_COUNT;
  }
  if (!u.permissions) return Math.min(10, TOTAL_SYSTEM_PERMISSIONS_COUNT);
  let count = 0;
  ALL_SYSTEM_PERMISSIONS.forEach(cat => {
    cat.items.forEach(it => {
      if ((u.permissions as any)?.[it.key] === true) count++;
    });
  });
  return count;
}
import {
  generateId,
  getTodayDate,
  createSeedData,
  cleanAllDemoTransactions,
  defaultSettings,
  logAudit,
  formatMoney
} from '../services/accountingStorage';
import { updateCompany, getActiveTenantId } from '../services/tenantService';

interface SystemViewsProps {
  subPage: 'users' | 'branches' | 'audit' | 'periods' | 'backup' | 'settings';
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
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userName, setUserName] = useState('');
  const [userUsername, setUserUsername] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [showUserPassword, setShowUserPassword] = useState(false);
  const [userRole, setUserRole] = useState<'مدير' | 'محاسب' | 'مبيعات' | 'مخزن' | 'كاشير' | 'مخصص'>('كاشير');
  const [userBranchId, setUserBranchId] = useState('');
  const [userPermissions, setUserPermissions] = useState<UserPermissions>(() => getRolePreset('كاشير'));
  const [permissionSearchTerm, setPermissionSearchTerm] = useState('');
  const [usersViewTab, setUsersViewTab] = useState<'cards' | 'matrix'>('cards');

  // Branch form modal
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchName, setBranchName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchPhone, setBranchPhone] = useState('');
  const [branchIsMain, setBranchIsMain] = useState(false);
  const [branchPin, setBranchPin] = useState('1234');

  // Period form modal
  const [showPeriodModal, setShowPeriodModal] = useState(false);
  const [periodName, setPeriodName] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');

  // Settings form states
  const [settingsForm, setSettingsForm] = useState<AppSettings>({ ...db.settings });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 2 ميجابايت.');
      return;
    }

    const reader = new FileReader();
    reader.onload = ev => {
      const base64 = ev.target?.result as string;
      if (base64) {
        setSettingsForm(prev => ({ ...prev, logo: base64 }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setSettingsForm(prev => ({ ...prev, logo: '' }));
  };

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

  // Open User Modals
  const handleOpenAddUser = () => {
    setEditingUser(null);
    setUserName('');
    setUserUsername('');
    setUserPassword('');
    setShowUserPassword(false);
    setUserRole('كاشير');
    setUserBranchId(db.branches?.[0]?.id || 'br_main');
    setUserPermissions(getRolePreset('كاشير'));
    setPermissionSearchTerm('');
    setShowUserModal(true);
  };

  const handleOpenEditUser = (u: User) => {
    setEditingUser(u);
    setUserName(u.name);
    setUserUsername(u.username);
    setUserPassword(u.password || '');
    setShowUserPassword(false);
    setUserRole(u.role);
    setUserBranchId(u.branchId || db.branches?.[0]?.id || 'br_main');
    setUserPermissions(u.permissions ? { ...u.permissions } : getRolePreset(u.role));
    setPermissionSearchTerm('');
    setShowUserModal(true);
  };

  const handleTogglePermission = (key: keyof UserPermissions) => {
    setUserPermissions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleToggleCategory = (cat: PermissionCategory) => {
    const allEnabled = cat.items.every(it => userPermissions[it.key] === true);
    setUserPermissions(prev => {
      const updated = { ...prev };
      cat.items.forEach(it => {
        (updated as any)[it.key] = !allEnabled;
      });
      return updated;
    });
  };

  const handleRoleChange = (newRole: 'مدير' | 'محاسب' | 'مبيعات' | 'مخزن' | 'كاشير' | 'مخصص') => {
    setUserRole(newRole);
    if (newRole !== 'مخصص') {
      setUserPermissions(getRolePreset(newRole));
    }
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim() || !userUsername.trim()) return alert('أكمل بيانات المستخدم');

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const branch = (updated.branches || []).find(b => b.id === userBranchId);

    const targetPermissions: UserPermissions = { ...userPermissions };
    targetPermissions.canViewInvoices = targetPermissions.canViewSales !== false;
    targetPermissions.canCreateInvoices = targetPermissions.canCreateSales !== false;

    if (editingUser) {
      const idx = updated.users.findIndex(u => u.id === editingUser.id);
      if (idx !== -1) {
        updated.users[idx] = {
          ...updated.users[idx],
          name: userName.trim(),
          username: userUsername.trim().toLowerCase(),
          password: userPassword.trim(),
          role: userRole,
          branchId: userBranchId || undefined,
          branchName: branch?.name || undefined,
          permissions: targetPermissions
        };
        logAudit(updated, 'تعديل بيانات مستخدم وصلاحياته', `${userName} (${userRole})`);
      }
    } else {
      const newUser: User = {
        id: generateId('usr'),
        name: userName.trim(),
        username: userUsername.trim().toLowerCase(),
        password: userPassword.trim(),
        role: userRole,
        active: true,
        branchId: userBranchId || undefined,
        branchName: branch?.name || undefined,
        permissions: targetPermissions
      };
      updated.users.push(newUser);
      logAudit(updated, 'إضافة مستخدم جديد وتحديد الصلاحيات', `${newUser.name} (${newUser.role})`);
    }

    onUpdateDb(updated);
    setShowUserModal(false);
  };

  const handleDeleteUser = (u: User) => {
    if (u.role === 'مدير' && db.users.filter(x => x.role === 'مدير').length <= 1) {
      alert('لا يمكن حذف المدير العام الوحيد للنظام.');
      return;
    }
    if (!confirm(`هل أنت متأكد من حذف المستخدم "${u.name}"؟`)) return;
    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    updated.users = updated.users.filter(x => x.id !== u.id);
    logAudit(updated, 'حذف مستخدم', u.name);
    onUpdateDb(updated);
  };

  // Branch Handlers
  const handleOpenAddBranch = () => {
    setEditingBranch(null);
    setBranchName('');
    setBranchCode(`BR-0${(db.branches?.length || 0) + 1}`);
    setBranchAddress('');
    setBranchPhone('');
    setBranchIsMain(false);
    setBranchPin('1234');
    setShowBranchModal(true);
  };

  const handleOpenEditBranch = (b: Branch) => {
    setEditingBranch(b);
    setBranchName(b.name);
    setBranchCode(b.code);
    setBranchAddress(b.address || '');
    setBranchPhone(b.phone || '');
    setBranchIsMain(!!b.isMain);
    setBranchPin(b.pin || '1234');
    setShowBranchModal(true);
  };

  const handleSaveBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim()) return alert('يرجى إدخال اسم الفرع');

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    if (!updated.branches) updated.branches = [];

    if (branchIsMain) {
      updated.branches.forEach(b => { b.isMain = false; });
    }

    const cleanPin = branchPin.trim() || '1234';

    if (editingBranch) {
      const idx = updated.branches.findIndex(b => b.id === editingBranch.id);
      if (idx !== -1) {
        updated.branches[idx] = {
          ...updated.branches[idx],
          name: branchName.trim(),
          code: branchCode.trim() || `BR-${Date.now().toString().slice(-3)}`,
          address: branchAddress.trim(),
          phone: branchPhone.trim(),
          isMain: branchIsMain,
          pin: cleanPin
        };
        logAudit(updated, 'تعديل فرع ورقم سري', branchName);
      }
    } else {
      const newBranch: Branch = {
        id: generateId('br'),
        name: branchName.trim(),
        code: branchCode.trim() || `BR-${(updated.branches.length + 1).toString().padStart(2, '0')}`,
        address: branchAddress.trim(),
        phone: branchPhone.trim(),
        isMain: branchIsMain || updated.branches.length === 0,
        pin: cleanPin
      };
      updated.branches.push(newBranch);
      logAudit(updated, 'إضافة فرع جديد مع رقم سري للحماية', newBranch.name);
    }

    onUpdateDb(updated);
    setShowBranchModal(false);
  };

  const handleDeleteBranch = (b: Branch) => {
    if (b.isMain) {
      alert('لا يمكن حذف الفرع الرئيسي للمحل.');
      return;
    }
    const hasInvoices = (db.invoices || []).some(inv => inv.branchId === b.id);
    if (hasInvoices) {
      alert('لا يمكن حذف هذا الفرع لوجود فواتير مسجلة مرتبطة به.');
      return;
    }
    if (!confirm(`هل ترغب في حذف فرع "${b.name}"؟`)) return;
    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    updated.branches = (updated.branches || []).filter(x => x.id !== b.id);
    logAudit(updated, 'حذف فرع', b.name);
    onUpdateDb(updated);
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
          {/* Users Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <UserCheck className="w-6 h-6 text-emerald-600" />
                  <span>المستخدمون وصلاحيات النظام الشاملة</span>
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                  {TOTAL_SYSTEM_PERMISSIONS_COUNT} صلاحية متاحة
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1">
                التحكم الكامل وتخصيص كافة الصلاحيات المتاحة في النظام لكل مستخدم (إضافة وتعديل وحذف أي صلاحية)
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* View Switcher */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setUsersViewTab('cards')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    usersViewTab === 'cards'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  كروت المستخدمين
                </button>
                <button
                  type="button"
                  onClick={() => setUsersViewTab('matrix')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    usersViewTab === 'matrix'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  جدول مصفوفة الصلاحيات
                </button>
              </div>

              <button
                type="button"
                onClick={handleOpenAddUser}
                className="px-4 py-2 bg-slate-950 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4 text-emerald-400" />
                <span>إضافة مستخدم جديد</span>
              </button>
            </div>
          </div>

          {/* Informational Guidance Banner */}
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border border-emerald-200/80 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="p-2 bg-emerald-600 text-white rounded-xl shrink-0 mt-0.5">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900">
                  جميع صلاحيات النظام ({TOTAL_SYSTEM_PERMISSIONS_COUNT} صلاحية) متاحة وتحت تصرفك بالكامل
                </h4>
                <p className="text-[11px] text-slate-600 font-medium leading-relaxed mt-0.5">
                  يمكنك تفعيل أو إلغاء أي صلاحية بنقرة زر (المبيعات، المشتريات، الخزينة، الفواتير، التقارير، المخزون، الحذف، التعديل). استخدم القوالب الجاهزة أو قم بتعيين دور «مخصص» لتحديد ما تريده بالضبط.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-bold text-slate-700 bg-white/80 px-2.5 py-1 rounded-lg border border-slate-200">
                إجمالي المستخدمين: <span className="font-mono font-black text-emerald-700">{db.users.length}</span>
              </span>
            </div>
          </div>

          {/* Tab 1: Responsive Users Cards System */}
          {usersViewTab === 'cards' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              {db.users.map(u => {
                const activeCount = countActivePermissions(u);
                const percent = Math.round((activeCount / TOTAL_SYSTEM_PERMISSIONS_COUNT) * 100);

                return (
                  <div key={u.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-xs transition-all space-y-3">
                    <div className="flex items-start justify-between border-b border-slate-100 pb-2.5">
                      <div>
                        <h3 className="font-black text-sm text-slate-900 flex items-center gap-1.5">
                          <span>{u.name}</span>
                          {u.role === 'مدير' && (
                            <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-black border border-amber-300">
                              مدير النظام
                            </span>
                          )}
                        </h3>
                        <span className="font-mono text-xs text-slate-500">@{u.username}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        نشط
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">الدور والوظيفة:</span>
                        <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-slate-100 border border-slate-200 text-slate-800">
                          {u.role === 'مخصص' ? 'مخصص (صلاحيات يدوية)' : u.role}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">فرع العمل:</span>
                        <span className="font-bold text-slate-800 flex items-center gap-1 text-[11px]">
                          <Building2 className="w-3 h-3 text-blue-600" />
                          {u.branchName || db.branches?.find(b => b.id === u.branchId)?.name || 'الفرع الرئيسي'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">حماية الدخول:</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${
                          u.password ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-slate-50 text-slate-500'
                        }`}>
                          {u.password ? 'محمي بكلمة مرور' : 'دخول مباشر بدون باسورد'}
                        </span>
                      </div>

                      {/* Active Permissions Meter */}
                      <div className="pt-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-700">مستوى الصلاحيات:</span>
                          <span className="text-[11px] font-black font-mono text-emerald-700">
                            {activeCount} / {TOTAL_SYSTEM_PERMISSIONS_COUNT} ({percent}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all rounded-full ${
                              percent === 100 ? 'bg-emerald-600' : percent > 50 ? 'bg-blue-600' : 'bg-amber-500'
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEditUser(u)}
                        className="flex-1 py-1.5 px-3 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
                        <span>تعديل الصلاحيات</span>
                      </button>

                      {u.role !== 'مدير' && (
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u)}
                          className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-xl text-xs font-bold transition-all cursor-pointer border border-rose-200"
                          title="حذف المستخدم"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab 2: Interactive Permissions Matrix Table */}
          {usersViewTab === 'matrix' && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
              <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-black text-slate-800">
                  مصفوفة الصلاحيات المتاحة والمفعلة لجميع المستخدمين
                </span>
                <span className="text-[11px] text-slate-500">
                  انقر على أي مستخدم لتخصيص أو إضافة الصلاحيات له
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 text-[11px] font-black text-slate-700 border-b border-slate-200">
                      <th className="p-3">المستخدم</th>
                      <th className="p-3">الدور</th>
                      <th className="p-3">الفرع</th>
                      <th className="p-3 text-center">الإجمالي ({TOTAL_SYSTEM_PERMISSIONS_COUNT})</th>
                      {ALL_SYSTEM_PERMISSIONS.map((cat, idx) => (
                        <th key={idx} className="p-2.5 text-center whitespace-nowrap">
                          {cat.badge} ({cat.items.length})
                        </th>
                      ))}
                      <th className="p-3 text-center">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {db.users.map(u => {
                      const activeCount = countActivePermissions(u);
                      const percent = Math.round((activeCount / TOTAL_SYSTEM_PERMISSIONS_COUNT) * 100);

                      return (
                        <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3">
                            <div className="font-bold text-slate-900">{u.name}</div>
                            <div className="font-mono text-[10px] text-slate-500">@{u.username}</div>
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 border border-slate-200 text-slate-800">
                              {u.role}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="text-[11px] font-bold text-slate-700">
                              {u.branchName || db.branches?.find(b => b.id === u.branchId)?.name || 'الفرع الرئيسي'}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <div className="font-mono font-black text-xs text-emerald-700">
                              {activeCount} / {TOTAL_SYSTEM_PERMISSIONS_COUNT}
                            </div>
                            <div className="text-[10px] text-slate-400 font-bold">{percent}%</div>
                          </td>
                          {ALL_SYSTEM_PERMISSIONS.map((cat, catIdx) => {
                            const enabledInCat = cat.items.filter(it => (u.permissions as any)?.[it.key] === true).length;
                            const isAllInCat = enabledInCat === cat.items.length;
                            const isNone = enabledInCat === 0;

                            return (
                              <td key={catIdx} className="p-2.5 text-center">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                                    isAllInCat
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                      : !isNone
                                      ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                      : 'bg-slate-100 text-slate-400'
                                  }`}
                                >
                                  {enabledInCat} / {cat.items.length}
                                </span>
                              </td>
                            );
                          })}
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleOpenEditUser(u)}
                              className="px-2.5 py-1 bg-slate-900 hover:bg-black text-white rounded-lg text-[11px] font-bold cursor-pointer transition-all inline-flex items-center gap-1 shadow-2xs"
                            >
                              <SlidersHorizontal className="w-3 h-3 text-emerald-400" />
                              <span>تخصيص الصلاحيات</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* 2. BRANCHES MANAGEMENT */}
      {subPage === 'branches' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <Building2 className="w-6 h-6 text-blue-600" />
                <span>فروع ومنافذ المحل</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                إدارة الفروع ومنافذ البيع التابعة للمحل ومتابعة فواتير ومبيعات كل فرع بصورة مستقلة
              </p>
            </div>
            <button
              onClick={handleOpenAddBranch}
              className="px-4 py-2 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة فرع جديد للمحل</span>
            </button>
          </div>

          {/* Branches Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
            {(db.branches || [
              { id: 'br_main', name: 'الفرع الرئيسي', code: 'BR-01', isMain: true }
            ]).map(b => {
              const branchInvoices = (db.invoices || []).filter(inv => inv.branchId === b.id);
              const branchSales = branchInvoices
                .filter(inv => inv.type === 'sale')
                .reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);

              return (
                <div key={b.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:shadow-xs transition-all space-y-3">
                  <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-bold text-sm text-slate-900">{b.name}</h3>
                        {b.isMain && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                            الرئيسي
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-xs text-slate-500">{b.code}</span>
                    </div>
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                      <Store className="w-4 h-4" />
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    {b.address && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">العنوان:</span>
                        <span className="font-bold text-slate-800 truncate max-w-[150px]">{b.address}</span>
                      </div>
                    )}
                    {b.phone && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">الهاتف:</span>
                        <span className="font-mono font-bold text-slate-800">{b.phone}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">عدد الفواتير:</span>
                      <span className="font-bold text-slate-900">{branchInvoices.length} فاتورة</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">إجمالي المبيعات:</span>
                      <span className="font-bold text-emerald-700 font-mono">{formatMoney(branchSales, db.settings.currency)}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                      <span className="text-slate-600 font-bold flex items-center gap-1 text-[11px]">
                        <Lock className="w-3 h-3 text-amber-600" />
                        <span>رقم سري العزل (PIN):</span>
                      </span>
                      <span className="font-mono font-black text-amber-900 bg-amber-100/80 px-2 py-0.5 rounded border border-amber-300/80 text-[11px] tracking-wider">
                        {b.pin || '1234'}
                      </span>
                    </div>
                  </div>

                  <div className="pt-1 flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenEditBranch(b)}
                      className="px-2.5 py-1 text-slate-700 hover:text-black hover:bg-slate-100 rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>تعديل</span>
                    </button>
                    {!b.isMain && (
                      <button
                        type="button"
                        onClick={() => handleDeleteBranch(b)}
                        className="px-2 py-1 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-md text-xs font-bold transition-all cursor-pointer"
                        title="حذف الفرع"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
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

          <form onSubmit={handleSaveSettings} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs max-w-3xl space-y-5">
            {/* 1. رفع وتعديل لوجو المحل / المنشأة */}
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <Store className="w-4 h-4 text-amber-600" />
                    <span>لوجو المحل والمنشأة (يظهر في منتصف ترويسة الفواتير والتقارير)</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    يتم وضعه تلقائياً في منتصف الترويسة بين اسم الشركة وأرقام الهاتف بدقة بالغة وبدون أي تشوه
                  </p>
                </div>
                {settingsForm.logo && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="px-2.5 py-1 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف الشعار</span>
                  </button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4 pt-1">
                {/* Logo Preview Box */}
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl border-2 border-dashed border-slate-300 bg-white flex items-center justify-center p-2 overflow-hidden shadow-2xs shrink-0">
                  {settingsForm.logo ? (
                    <img
                      src={settingsForm.logo}
                      alt="شعار المنشأة"
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <div className="text-center p-2 text-slate-400">
                      <Store className="w-7 h-7 mx-auto mb-1 opacity-40" />
                      <span className="text-[10px] font-bold block">لا يوجد شعار</span>
                    </div>
                  )}
                </div>

                {/* Upload Control */}
                <div className="flex-1 space-y-2 text-right w-full">
                  <label className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer transition-all shadow-xs">
                    <Upload className="w-4 h-4 text-amber-400" />
                    <span>{settingsForm.logo ? 'تغيير صورة الشعار' : 'رفع لوجو المحل من جهازك'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                  </label>
                  <p className="text-[10.5px] text-slate-500 leading-relaxed">
                    الصيغ المدعومة: PNG, JPG, WebP, SVG. يُفضل استخدام صورة واضحة بخلفية شفافة أو بيضاء.
                  </p>
                </div>
              </div>
            </div>

            {/* 2. بيانات الترويسة والمنشأة */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم المنشأة / الشركة (يمين الترويسة)</label>
                <input
                  type="text"
                  required
                  value={settingsForm.company}
                  onChange={e => setSettingsForm({ ...settingsForm, company: e.target.value })}
                  placeholder="مثال: مؤسسة النور للتجارة"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white focus:border-black outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>كود المنشأة السحابي (Company Code):</span>
                  <span className="text-[10px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">كود الدخول المتعدد</span>
                </label>
                <input
                  type="text"
                  required
                  value={settingsForm.companyCode || 'COMP-101'}
                  onChange={e => setSettingsForm({ ...settingsForm, companyCode: e.target.value.toUpperCase() })}
                  onBlur={e => setSettingsForm({ ...settingsForm, companyCode: normalizeCompanyCode(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono uppercase tracking-wider text-blue-900 focus:bg-white focus:border-black outline-none"
                  placeholder="COMP-101"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  أرقام هواتف التواصل (يسار الترويسة - يمكن فصل عدة أرقام بفاصلة /)
                </label>
                <input
                  type="text"
                  value={settingsForm.phone}
                  onChange={e => setSettingsForm({ ...settingsForm, phone: e.target.value })}
                  placeholder="مثال: 01012345678 / 01198765432"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:border-black outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">العنوان والمقر الرئيسي (يمين الترويسة)</label>
                <input
                  type="text"
                  value={settingsForm.address}
                  onChange={e => setSettingsForm({ ...settingsForm, address: e.target.value })}
                  placeholder="مثال: شارع الجمهورية، القاهرة"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-black outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">عنوان ترويسة الفاتورة (الافتراضي: بيان)</label>
                <input
                  type="text"
                  value={settingsForm.invoiceTitle || 'بيان'}
                  onChange={e => setSettingsForm({ ...settingsForm, invoiceTitle: e.target.value })}
                  placeholder="بيان"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white focus:border-black outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">العملة الافتراضية</label>
                <input
                  type="text"
                  value={settingsForm.currency}
                  onChange={e => setSettingsForm({ ...settingsForm, currency: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono focus:bg-white focus:border-black outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">حد التنبيه لنواقص المخزون</label>
                <input
                  type="number"
                  value={settingsForm.low}
                  onChange={e => setSettingsForm({ ...settingsForm, low: parseInt(e.target.value) || 5 })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:bg-white focus:border-black outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">طريقة تقييم تكلفة المخزون</label>
                <select
                  value={settingsForm.cost}
                  onChange={e => setSettingsForm({ ...settingsForm, cost: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white focus:border-black outline-none cursor-pointer"
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
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white focus:border-black outline-none cursor-pointer"
                >
                  <option value="disabled">غير مفعلة (Disabled)</option>
                  <option value="enabled">مفعلة (Enabled 14%)</option>
                </select>
              </div>
            </div>

            {/* 3. تذييل الفاتورة وسطر البضاعة المباعة ترد وتستبدل */}
            <div className="bg-amber-50/50 border border-amber-200 p-4 rounded-2xl space-y-2">
              <label className="block text-xs font-black text-amber-950 flex items-center justify-between">
                <span>سطر البضاعة المباعة ترد وتستبدل وملاحظات تذييل الفاتورة:</span>
                <span className="text-[10px] text-amber-800 bg-amber-100 px-2 py-0.5 rounded font-bold">تذييل الفاتورة المطبوعة</span>
              </label>
              <textarea
                rows={3}
                value={settingsForm.notes}
                onChange={e => setSettingsForm({ ...settingsForm, notes: e.target.value })}
                placeholder="اكتب هنا سطر البضاعة المباعة ترد وتستبدل والشروط التي ترغب في طباعتها في أسفل الفاتورة، مثال: البضاعة المباعة ترد وتستبدل خلال 14 يوماً وفقاً لأصل الفاتورة والحالة الأصلية..."
                className="w-full p-3 bg-white border border-amber-300 rounded-xl text-xs text-slate-900 focus:border-amber-600 outline-none leading-relaxed"
              />
              <p className="text-[10.5px] text-amber-900">
                هذا النص هو الذي يُطبع بدقة في أسفل كل فاتورة مبيعات ومعاينة الفاتورة بدون أي تدخل أو تعديل خارجي.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                className="px-6 py-2.5 bg-black hover:bg-slate-800 text-white rounded-xl text-xs font-black transition-all shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4 text-emerald-400" />
                <span>حفظ كافة إعدادات المنشأة والشعار والترويسة</span>
              </button>
            </div>
          </form>
        </>
      )}

      {/* User Modal with Complete Granular Permissions System */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-3xl p-4 sm:p-6 space-y-4 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 my-6 max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900 leading-tight">
                    {editingUser ? `تعديل المستخدم وتحديد صلاحياته: ${userName || editingUser.name}` : 'إضافة مستخدم جديد وتخصيص الصلاحيات'}
                  </h2>
                  <p className="text-[11px] text-slate-500 font-medium">
                    يمكنك منح المستخدم أي صلاحيات دقيقة تختارها من بين 36 صلاحية شاملة
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowUserModal(false)}
                className="p-1.5 text-slate-400 hover:text-black hover:bg-slate-100 rounded-xl cursor-pointer transition-colors"
                title="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4 overflow-y-auto flex-1 pr-1 pl-1">
              {/* User Basic Info Section */}
              <div className="bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">الاسم الكامل للمستخدم</label>
                    <input
                      type="text"
                      required
                      value={userName}
                      onChange={e => setUserName(e.target.value)}
                      placeholder="مثال: أحمد محمد (كاشير)"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:border-black outline-none font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">اسم الدخول (Username)</label>
                    <input
                      type="text"
                      required
                      value={userUsername}
                      onChange={e => setUserUsername(e.target.value)}
                      placeholder="ahmed"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:border-black outline-none font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">المسمى الوظيفي (الدور)</label>
                    <select
                      value={userRole}
                      onChange={e => handleRoleChange(e.target.value as any)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none cursor-pointer"
                    >
                      <option value="كاشير">كاشير ونقاط بيع</option>
                      <option value="مبيعات">موظف مبيعات وعروض</option>
                      <option value="مخزن">أمين مخزن ومستودعات</option>
                      <option value="محاسب">محاسب مالي</option>
                      <option value="مدير">مدير النظام (أدمن)</option>
                      <option value="مخصص">مخصص (صلاحيات يدوية حرة بدون قيود)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">فرع العمل المخصص</label>
                    <select
                      value={userBranchId}
                      onChange={e => setUserBranchId(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none cursor-pointer"
                    >
                      {(db.branches || [
                        { id: 'br_main', name: 'الفرع الرئيسي', code: 'BR-01', isMain: true }
                      ]).map(b => (
                        <option key={b.id} value={b.id}>
                          {b.name} {b.isMain ? '(الرئيسي)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Password with Eye toggle */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700">كلمة المرور</label>
                      <span className="text-[10px] text-slate-400">فارغ = بدون كلمة سر</span>
                    </div>
                    <div className="relative">
                      <input
                        type={showUserPassword ? 'text' : 'password'}
                        value={userPassword}
                        onChange={e => setUserPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 pr-8 pl-8 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:border-black outline-none"
                      />
                      <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
                      <button
                        type="button"
                        onClick={() => setShowUserPassword(!showUserPassword)}
                        className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                      >
                        {showUserPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Complete Granular Permissions Matrix */}
              <div className="space-y-3 pt-1">
                {/* Permissions Toolbar */}
                <div className="bg-slate-900 text-white p-3 sm:p-4 rounded-2xl space-y-2.5 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg">
                        <SlidersHorizontal className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-black text-white flex items-center gap-2">
                          <span>جدول الصلاحيات المتاحة</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/30 text-emerald-200 border border-emerald-400/30">
                            {countActivePermissions({ ...editingUser, permissions: userPermissions } as any)} من {TOTAL_SYSTEM_PERMISSIONS_COUNT} صلاحية مفعلة
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-300">
                          حدد أو أزل ما ترغب في إتاحته لهذا المستخدم بدقة وسهولة
                        </p>
                      </div>
                    </div>

                    {/* Fast Presets */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setUserPermissions(getAllPermissionsPreset(true))}
                        className="px-2.5 py-1 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg cursor-pointer transition-colors"
                      >
                        ✓ تحديد الكل ({TOTAL_SYSTEM_PERMISSIONS_COUNT})
                      </button>
                      <button
                        type="button"
                        onClick={() => setUserPermissions(getAllPermissionsPreset(false))}
                        className="px-2.5 py-1 text-[11px] font-bold bg-rose-600/80 hover:bg-rose-600 text-white rounded-lg cursor-pointer transition-colors"
                      >
                        ✕ إلغاء الكل
                      </button>
                      <button
                        type="button"
                        onClick={() => setUserPermissions(getRolePreset('كاشير'))}
                        className="px-2 py-1 text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg cursor-pointer transition-colors"
                      >
                        قالب كاشير
                      </button>
                      <button
                        type="button"
                        onClick={() => setUserPermissions(getRolePreset('مبيعات'))}
                        className="px-2 py-1 text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg cursor-pointer transition-colors"
                      >
                        قالب مبيعات
                      </button>
                      <button
                        type="button"
                        onClick={() => setUserPermissions(getRolePreset('مخزن'))}
                        className="px-2 py-1 text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg cursor-pointer transition-colors"
                      >
                        قالب مخزن
                      </button>
                      <button
                        type="button"
                        onClick={() => setUserPermissions(getRolePreset('محاسب'))}
                        className="px-2 py-1 text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg cursor-pointer transition-colors"
                      >
                        قالب محاسب
                      </button>
                      <button
                        type="button"
                        onClick={() => setUserPermissions(getRolePreset('مخصص'))}
                        className="px-2 py-1 text-[11px] font-bold bg-indigo-900/80 hover:bg-indigo-800 text-indigo-200 border border-indigo-700/60 rounded-lg cursor-pointer transition-colors"
                      >
                        قالب مخصص
                      </button>
                      <button
                        type="button"
                        onClick={() => setUserPermissions(getRolePreset('مدير'))}
                        className="px-2 py-1 text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg cursor-pointer transition-colors"
                      >
                        قالب مدير
                      </button>
                    </div>
                  </div>

                  {/* Filter / Search within permissions */}
                  <div className="relative">
                    <input
                      type="text"
                      value={permissionSearchTerm}
                      onChange={e => setPermissionSearchTerm(e.target.value)}
                      placeholder="ابحث في الصلاحيات (مثال: حذف، مرتجع، خزينة، ربح، موردين، جرد، فواتير)..."
                      className="w-full px-3 py-1.5 pr-8 pl-8 bg-slate-800/90 border border-slate-700 rounded-xl text-xs text-white placeholder:text-slate-400 outline-none focus:border-emerald-500"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
                    {permissionSearchTerm && (
                      <button
                        type="button"
                        onClick={() => setPermissionSearchTerm('')}
                        className="absolute left-2.5 top-1.5 text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Categorized Permissions Grid */}
                <div className="space-y-3">
                  {ALL_SYSTEM_PERMISSIONS.map((cat, catIdx) => {
                    const filteredItems = cat.items.filter(it => 
                      !permissionSearchTerm.trim() || 
                      it.label.includes(permissionSearchTerm.trim()) || 
                      it.description.includes(permissionSearchTerm.trim()) ||
                      cat.category.includes(permissionSearchTerm.trim())
                    );

                    if (filteredItems.length === 0) return null;

                    const allInCatEnabled = cat.items.every(it => userPermissions[it.key] === true);
                    const countEnabledInCat = cat.items.filter(it => userPermissions[it.key] === true).length;

                    return (
                      <div key={catIdx} className="bg-slate-50/90 rounded-2xl border border-slate-200 p-3 sm:p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900">{cat.category}</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700 font-mono">
                              {countEnabledInCat} من {cat.items.length} مفعلة
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleToggleCategory(cat)}
                            className="text-[11px] font-bold text-blue-700 hover:text-blue-900 cursor-pointer transition-colors"
                          >
                            {allInCatEnabled ? 'إلغاء تحديد هذا القسم' : 'تحديد كل صلاحيات هذا القسم'}
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {filteredItems.map(it => {
                            const isChecked = userPermissions[it.key] === true;
                            return (
                              <label
                                key={it.key}
                                className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                                  isChecked
                                    ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/10 shadow-xs'
                                    : 'bg-white/60 border-slate-200 hover:bg-white hover:border-slate-300'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleTogglePermission(it.key)}
                                  className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className={`text-xs font-bold leading-snug ${isChecked ? 'text-slate-950 font-black' : 'text-slate-700'}`}>
                                    {it.label}
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-medium leading-tight mt-0.5">
                                    {it.description}
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Modal Footer Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-200 shrink-0">
                <span className="text-xs text-slate-500 font-bold">
                  سيتم تطبيق الصلاحيات وحفظها في قاعدة البيانات والمزامنة فورياً
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowUserModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-slate-950 hover:bg-slate-800 text-white rounded-xl text-xs font-black transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>{editingUser ? 'حفظ الصلاحيات والمستخدم' : 'إنشاء المستخدم بالصلاحيات'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Branch Modal */}
      {showBranchModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600" />
                <span>{editingBranch ? 'تعديل بيانات الفرع' : 'إضافة فرع جديد للمحل'}</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowBranchModal(false)}
                className="p-1 text-slate-400 hover:text-black rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBranch} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم الفرع</label>
                <input
                  type="text"
                  required
                  value={branchName}
                  onChange={e => setBranchName(e.target.value)}
                  placeholder="مثال: فرع وسط البلد"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-black outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">كود الفرع</label>
                <input
                  type="text"
                  value={branchCode}
                  onChange={e => setBranchCode(e.target.value)}
                  placeholder="BR-02"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:border-black outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف (اختياري)</label>
                <input
                  type="text"
                  value={branchPhone}
                  onChange={e => setBranchPhone(e.target.value)}
                  placeholder="01012345678"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:border-black outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">العنوان (اختياري)</label>
                <input
                  type="text"
                  value={branchAddress}
                  onChange={e => setBranchAddress(e.target.value)}
                  placeholder="شارع التحرير، القاهرة"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-black outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-600" />
                    <span>الرقم السري للفرع (PIN):</span>
                  </span>
                  <span className="text-[10px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded font-bold border border-amber-200">عزل المقر الرئيسي</span>
                </label>
                <input
                  type="text"
                  required
                  value={branchPin}
                  onChange={e => setBranchPin(e.target.value)}
                  placeholder="مثال: 1234 أو كود سري"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold tracking-widest focus:bg-white focus:border-amber-500 outline-none text-slate-900"
                />
                <span className="text-[10.5px] text-slate-500 block mt-1">
                  مطلوب لعزل الفرع: لا يمكن لمدير المقر الرئيسي أو أي مستخدم الدخول إلى هذا الفرع إلا بعد إدخال هذا الرقم السري.
                </span>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
                  <input
                    type="checkbox"
                    checked={branchIsMain}
                    onChange={e => setBranchIsMain(e.target.checked)}
                    className="rounded text-blue-600 w-4 h-4"
                  />
                  <span>تعيين هذا الفرع كفرع رئيسي للمحل</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowBranchModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  {editingBranch ? 'حفظ التعديل' : 'حفظ الفرع'}
                </button>
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
