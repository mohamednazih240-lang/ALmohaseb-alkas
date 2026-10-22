import React, { useState, useEffect } from 'react';
import {
  Calculator,
  User,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Store,
  KeyRound,
  Eye,
  EyeOff,
  Cloud,
  Building2,
  Mail,
  PlusCircle,
  X,
  Check,
  Users,
  Briefcase,
  Receipt,
  Boxes,
  TrendingUp,
  Trash2,
  RefreshCw,
  Smartphone,
  ShieldCheck,
  Lock
} from 'lucide-react';
import { User as AppUser, AppSettings, AccountingDB, Branch } from '../types/accounting';
import { AuthSession, auth, googleProvider } from '../services/firebaseAuth';
import { signInWithPopup } from 'firebase/auth';
import { loadDatabase, saveDatabase } from '../services/accountingStorage';
import {
  fetchDatabaseFromCloud,
  pushDatabaseToCloud,
  fetchCompanyUsersAndBranchesByCode,
  normalizeCompanyCode,
  CompanyCloudResult
} from '../services/cloudSyncService';
import { getCompaniesList, registerCompany, getCompanyByCode, setActiveTenantId } from '../services/tenantService';

interface LoginViewProps {
  settings: AppSettings;
  users?: AppUser[];
  onLoginSuccess: (session: AuthSession, tenantDb?: AccountingDB) => void;
  onCancel?: () => void;
  canCancel?: boolean;
}

export interface CompanyAccountData {
  companyName: string;
  companyCode: string;
  users: AppUser[];
  branches: Branch[];
  ownerEmail?: string;
  source?: 'cloud' | 'local';
  db?: AccountingDB;
}

export interface SavedAccountItem {
  name: string;
  email: string;
  companyName?: string;
}

export const LoginView: React.FC<LoginViewProps> = ({
  settings,
  users: propUsers,
  onLoginSuccess,
  onCancel,
  canCancel = false
}) => {
  const currentDb = loadDatabase();

  // Active Login Mode Tab: 'companyCode' (default for multi-device & employees) | 'google' | 'register'
  const [activeTab, setActiveTab] = useState<'companyCode' | 'google' | 'register'>('companyCode');

  // 1. Company Code / Multi-Device State
  const defaultCode = currentDb.settings.companyCode || 'COMP-101';
  const [companyCodeInput, setCompanyCodeInput] = useState<string>(defaultCode);
  const [loadedCompany, setLoadedCompany] = useState<CompanyAccountData | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [userPassword, setUserPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isRefreshingUsers, setIsRefreshingUsers] = useState<boolean>(false);
  const [lastRefreshedTime, setLastRefreshedTime] = useState<string>('');

  // Branch Selection & PIN Isolation states on Login Screen
  const [selectedBranchId, setSelectedBranchId] = useState<string>('br_main');
  const [unlockedBranchIds, setUnlockedBranchIds] = useState<string[]>(['br_main']);
  const [branchPinModalTarget, setBranchPinModalTarget] = useState<Branch | null>(null);
  const [branchPinInput, setBranchPinInput] = useState<string>('');
  const [branchPinError, setBranchPinError] = useState<string>('');
  const [showBranchPinEye, setShowBranchPinEye] = useState<boolean>(false);

  // 2. Google / Gmail Sign-In State
  const [manualEmail, setManualEmail] = useState<string>('');
  const [selectedEmail, setSelectedEmail] = useState<string>('');
  const [isLoadingGoogle, setIsLoadingGoogle] = useState<boolean>(false);

  // 3. New Company Registration State
  const [regCompanyName, setRegCompanyName] = useState<string>('');
  const [regCompanyCode, setRegCompanyCode] = useState<string>('COMP-102');
  const [regOwnerName, setRegOwnerName] = useState<string>('');
  const [regOwnerPassword, setRegOwnerPassword] = useState<string>('');

  // 4. UI Toast & Loading
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Helper for Toast Alert
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  // User icon generator based on role
  const getUserRoleIcon = (role: string) => {
    switch (role) {
      case 'مدير':
        return <Briefcase className="w-5 h-5 text-amber-400" />;
      case 'محاسب':
        return <Calculator className="w-5 h-5 text-blue-400" />;
      case 'كاشير':
        return <Receipt className="w-5 h-5 text-emerald-400" />;
      case 'مبيعات':
        return <TrendingUp className="w-5 h-5 text-purple-400" />;
      case 'مخزن':
        return <Boxes className="w-5 h-5 text-teal-400" />;
      default:
        return <User className="w-5 h-5 text-slate-300" />;
    }
  };

  // Saved Google accounts on this device
  const [savedAccounts, setSavedAccounts] = useState<SavedAccountItem[]>(() => {
    try {
      const raw = localStorage.getItem('hesabaty_real_accounts');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter(a => a.email && !a.email.includes('owner.company@gmail.com') && !a.email.includes('accountant.store@gmail.com'));
        }
      }
    } catch {}
    return [];
  });

  // =========================================================================
  // =========================================================================
  // Requirement 1 & 3: Database Query / Cloud API & Auto-Refresh Function
  // Fetches ALL registered users (not just default/admin) and branches from cloud
  // =========================================================================
  const fetchAndSyncCompanyUsers = async (codeToQuery?: string, silent: boolean = false) => {
    const rawCode = (codeToQuery || companyCodeInput || defaultCode);
    const code = normalizeCompanyCode(rawCode);
    if (!code) {
      if (!silent) showToast('يرجى كتابة كود الشركة للبحث والمزامنة', 'error');
      return;
    }

    setIsRefreshingUsers(true);

    try {
      const result: CompanyCloudResult | null = await fetchCompanyUsersAndBranchesByCode(code);

      if (result && Array.isArray(result.users) && result.users.length > 0) {
        const compData: CompanyAccountData = {
          companyName: result.companyName,
          companyCode: normalizeCompanyCode(result.companyCode),
          users: result.users, // Full array of all registered users
          branches: result.branches || [],
          source: result.source,
          db: result.db
        };

        setLoadedCompany(compData);

        // Keep previously selected user if still present, otherwise select first user
        setSelectedUserId(prevId => {
          const exists = compData.users.find(u => u.id === prevId);
          return exists ? prevId : compData.users[0]?.id || '';
        });

        const now = new Date();
        const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLastRefreshedTime(timeStr);

        if (!silent) {
          showToast(
            `✓ تم جلب بيانات المنشأة «${result.companyName}» وتحديث (${result.users.length}) مستخدمين بنجاح من ${result.source === 'cloud' ? 'السحابة اللحظية' : 'الذاكرة المحلية'}!`,
            'success'
          );
        }
      } else {
        // Fallback to local database if code matches
        const localDb = currentDb;
        const compData: CompanyAccountData = {
          companyName: localDb.settings.company || 'المنشأة',
          companyCode: normalizeCompanyCode(localDb.settings.companyCode),
          users: localDb.users || [],
          branches: localDb.branches || [{ id: 'br_main', name: 'الفرع الرئيسي', code: 'BR-01', isMain: true }],
          source: 'local',
          db: localDb
        };
        setLoadedCompany(compData);
        setSelectedUserId(compData.users[0]?.id || '');
        if (!silent) {
          showToast(`تم العثور على منشأة «${compData.companyName}» محلياً (${compData.users.length} مستخدمين)`, 'success');
        }
      }
    } catch (err) {
      console.warn('Error syncing company users:', err);
      if (!silent) showToast('تعذر الاتصال بالسحابة حالياً، تم استخدام النسخة المخزنة محلياً', 'error');
    } finally {
      setIsRefreshingUsers(false);
    }
  };

  // Initial load on mount: automatically fetch and sync users for default company code
  useEffect(() => {
    fetchAndSyncCompanyUsers(companyCodeInput, true);
  }, []);

  // When company code input changes, auto-query after brief debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (companyCodeInput.trim().length >= 3) {
        fetchAndSyncCompanyUsers(companyCodeInput, true);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [companyCodeInput]);

  // =========================================================================
  // Requirement 2: Authentication / Login Verification Function
  // Compares password against the freshest database record in Cloud / Local DB
  // =========================================================================
  const handleVerifyAndLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!selectedUserId) {
      showToast('يرجى اختيار اسم المستخدم أولاً للمتابعة', 'error');
      return;
    }

    setIsLoading(true);

    try {
      // 1. Fetch freshest database state from Cloud Firestore to ensure accurate password verification
      let targetDb: AccountingDB = loadedCompany?.db || currentDb;
      const codeToQuery = normalizeCompanyCode(loadedCompany?.companyCode || companyCodeInput || defaultCode);
      const freshCloud = await fetchCompanyUsersAndBranchesByCode(codeToQuery);

      if (freshCloud && freshCloud.db) {
        targetDb = freshCloud.db;
      } else if (loadedCompany?.db) {
        targetDb = loadedCompany.db;
      }

      // 2. Find the selected user by ID (or username) in the freshest database
      const userInDb = targetDb.users?.find(u => u.id === selectedUserId || u.username === selectedUserId);

      if (!userInDb) {
        setIsLoading(false);
        showToast('لم يتم العثور على هذا المستخدم في قاعدة البيانات السحابية. يرجى الضغط على زر "تحديث المستخدمين".', 'error');
        return;
      }

      // Check if user is active
      if (userInDb.active === false) {
        setIsLoading(false);
        showToast('عذراً، هذا الحساب معطل حالياً من قبل مدير النظام.', 'error');
        return;
      }

      // 3. Password Verification Logic
      const dbPassword = (userInDb.password || '').trim();
      const enteredPassword = userPassword.trim();

      if (dbPassword !== '') {
        if (enteredPassword !== dbPassword) {
          setIsLoading(false);
          showToast('كلمة المرور غير صحيحة لهذا المستخدم! يرجى التأكد وإعادة المحاولة.', 'error');
          return;
        }
      }

      // 4. Authentication Successful! Update lastLogin and persist
      const updatedUser: AppUser = {
        ...userInDb,
        lastLogin: new Date().toISOString()
      };

      const userIdx = targetDb.users.findIndex(u => u.id === userInDb.id);
      if (userIdx >= 0) {
        targetDb.users[userIdx] = updatedUser;
      }
      targetDb.currentUser = updatedUser;

      // Register or switch company tenant
      const activeCompCode = normalizeCompanyCode(targetDb.settings.companyCode || loadedCompany?.companyCode);
      const tenant = registerCompany({
        name: targetDb.settings.company || loadedCompany?.companyName || 'منشأة حساباتي',
        code: activeCompCode,
        adminName: updatedUser.name,
        adminUsername: updatedUser.username,
        currency: targetDb.settings.currency || 'ج.م'
      });
      setActiveTenantId(tenant.id);

      // Save locally and push to cloud
      saveDatabase(targetDb);
      pushDatabaseToCloud(targetDb, true).catch(() => {});

      const session: AuthSession = {
        user: { ...updatedUser, branchId: selectedBranchId },
        isGoogle: false,
        tenantId: tenant.id,
        companyName: loadedCompany?.companyName || targetDb.settings.company || 'حساباتي',
        branchId: selectedBranchId
      };

      localStorage.setItem('hesabaty_active_user', JSON.stringify(session));

      showToast(`مرحباً بك يا ${updatedUser.name}! تم التحقق وتسجيل الدخول بنجاح...`, 'success');

      setTimeout(() => {
        setIsLoading(false);
        onLoginSuccess(session, targetDb);
      }, 400);

    } catch (err) {
      console.error('Login verification error:', err);
      setIsLoading(false);
      showToast('حدث خطأ أثناء التحقق من كلمة المرور. يرجى المحاولة ثانية.', 'error');
    }
  };

  // Google Sign-In Handler
  const handleGoogleSignIn = async () => {
    setIsLoadingGoogle(true);
    try {
      const res = await signInWithPopup(auth, googleProvider);
      const email = res.user.email || '';
      const displayName = res.user.displayName || email.split('@')[0] || 'المدير العام';

      setIsLoadingGoogle(false);
      setSelectedEmail(email);

      // Save to real accounts list
      setSavedAccounts(prev => {
        const filtered = prev.filter(a => a.email.toLowerCase() !== email.toLowerCase());
        const updated = [{
          name: displayName,
          email,
          companyName: loadedCompany?.companyName || currentDb.settings.company
        }, ...filtered];
        localStorage.setItem('hesabaty_real_accounts', JSON.stringify(updated));
        return updated;
      });

      // Query company for this email
      await fetchAndSyncCompanyUsers(email, false);
      setActiveTab('companyCode');
    } catch (err: any) {
      setIsLoadingGoogle(false);
      console.warn('Google sign-in popup note:', err);
      showToast('يرجى إدخال كود الشركة أدناه أو كتابة البريد للدخول فوراً', 'error');
    }
  };

  // New Company Registration
  const handleRegisterNewCompany = (e: React.FormEvent) => {
    e.preventDefault();
    const cName = regCompanyName.trim();
    const cCode = regCompanyCode.trim().toUpperCase() || 'COMP-102';
    const oName = regOwnerName.trim();
    const oPass = regOwnerPassword.trim();

    if (!cName || !oName || !oPass) {
      showToast('يرجى تعبئة كافة الحقول المطلوبة لتأسيس المنشأة', 'error');
      return;
    }

    setIsLoading(true);

    try {
      const ownerUser: AppUser = {
        id: 'usr_' + Date.now().toString(36),
        name: oName,
        username: 'admin',
        password: oPass,
        role: 'مدير',
        active: true,
        lastLogin: new Date().toISOString()
      };

      registerCompany({
        name: cName,
        code: cCode,
        adminName: oName,
        adminUsername: 'admin',
        password: oPass
      });

      const updatedDb = currentDb;
      updatedDb.settings.company = cName;
      updatedDb.settings.companyCode = cCode;
      updatedDb.users = [ownerUser];
      updatedDb.currentUser = ownerUser;

      saveDatabase(updatedDb);
      pushDatabaseToCloud(updatedDb).catch(() => {});

      showToast(`تم تأسيس منشأة «${cName}» (كود: ${cCode}) بنجاح!`, 'success');

      setTimeout(() => {
        setIsLoading(false);
        const session: AuthSession = {
          user: ownerUser,
          isGoogle: false,
          companyName: cName
        };
        localStorage.setItem('hesabaty_active_user', JSON.stringify(session));
        onLoginSuccess(session, updatedDb);
      }, 500);
    } catch (err) {
      setIsLoading(false);
      showToast('حدث خطأ أثناء حفظ المنشأة. يرجى المحاولة ثانية.', 'error');
    }
  };

  const availableBranches: Branch[] = React.useMemo(() => {
    if (loadedCompany?.branches && loadedCompany.branches.length > 0) return loadedCompany.branches;
    if (loadedCompany?.db?.branches && loadedCompany.db.branches.length > 0) return loadedCompany.db.branches;
    if (currentDb.branches && currentDb.branches.length > 0) return currentDb.branches;
    return [{ id: 'br_main', name: 'المقر الرئيسي', code: 'BR-01', isMain: true, pin: '1234' }];
  }, [loadedCompany?.branches, loadedCompany?.db?.branches, currentDb.branches]);

  const branchUsers = React.useMemo(() => {
    const allUsers = loadedCompany?.users || [];
    return allUsers.filter(u => {
      if (u.branchId) {
        return u.branchId === selectedBranchId;
      }
      if (u.role === 'مدير') return true;
      return selectedBranchId === 'br_main';
    });
  }, [loadedCompany?.users, selectedBranchId]);

  // When selectedBranchId or branchUsers change, ensure selectedUserId points to a valid user in this branch
  useEffect(() => {
    if (branchUsers.length > 0) {
      if (!branchUsers.some(u => u.id === selectedUserId)) {
        setSelectedUserId(branchUsers[0].id);
        setUserPassword('');
      }
    } else {
      setSelectedUserId('');
      setUserPassword('');
    }
  }, [selectedBranchId, branchUsers]);

  const handleBranchClick = (b: Branch) => {
    if (b.id === selectedBranchId) return;

    // Main headquarters or already unlocked branch
    if (b.isMain || b.id === 'br_main' || unlockedBranchIds.includes(b.id)) {
      setSelectedBranchId(b.id);
      return;
    }

    // Subsidiary branch requires PIN
    setBranchPinModalTarget(b);
    setBranchPinInput('');
    setBranchPinError('');
    setShowBranchPinEye(false);
  };

  const handleBranchPinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchPinModalTarget) return;

    const expectedPin = (branchPinModalTarget.pin || '1234').trim();
    if (branchPinInput.trim() === expectedPin) {
      setUnlockedBranchIds(prev => [...prev, branchPinModalTarget.id]);
      setSelectedBranchId(branchPinModalTarget.id);
      setBranchPinModalTarget(null);
      setBranchPinInput('');
      setBranchPinError('');
      showToast(`تم فتح بيانات فرع «${branchPinModalTarget.name}» بنجاح`, 'success');
    } else {
      setBranchPinError('الرقم السري للفرع غير صحيح! تم منع الدخول لحماية بيانات الفرع.');
    }
  };

  const selectedUserObj = (loadedCompany?.users || []).find(u => u.id === selectedUserId);
  const registeredTenants = getCompaniesList();

  return (
    <div
      className="min-h-screen text-slate-100 flex items-center justify-center p-3 sm:p-5 select-none relative overflow-y-auto"
      style={{
        background: 'radial-gradient(circle at top right, #1e293b 0%, #0f172a 100%)',
        fontFamily: "'Tajawal', 'Cairo', system-ui, sans-serif"
      }}
      dir="rtl"
    >
      {/* Background Soft Glow */}
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-lg my-auto relative z-10">

        {/* Cancel Button if allowed */}
        {canCancel && onCancel && (
          <div className="flex justify-end mb-2">
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 px-3 py-1.5 rounded-xl border border-slate-700/80 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <X className="w-4 h-4" />
              <span>إغلاق والعودة للنظام</span>
            </button>
          </div>
        )}

        {/* Logo & Branding Header */}
        <div className="text-center mb-4">
          <div className="inline-block p-1.5 bg-white rounded-3xl shadow-2xl shadow-blue-500/20 border border-white/20 mb-2">
            <img
              src="/logo.png"
              alt="شعار حساباتي"
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-contain drop-shadow-sm"
            />
          </div>
          <h1 className="text-lg sm:text-xl font-black text-white flex items-center justify-center gap-1.5">
            <span>نظام حساباتي السحابي</span>
            <span className="text-[10px] bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full font-bold">
              Multi-Device ERP
            </span>
          </h1>
          <p className="text-slate-400 text-xs font-medium mt-0.5">
            تسجيل دخول آمن متعدد المستخدمين ومتزامن لحظياً عبر كافة الهواتف
          </p>
        </div>

        {/* Dynamic Glass Panel Card */}
        <div className="glass-panel rounded-3xl p-4 sm:p-6 shadow-2xl relative overflow-hidden text-right border border-slate-700/80">

          {/* Navigation Mode Tabs */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-900/90 rounded-2xl border border-slate-700/80 mb-4 text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('companyCode')}
              className={`py-2 px-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'companyCode'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>كود الشركة</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('google')}
              className={`py-2 px-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'google'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Google المالك</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('register')}
              className={`py-2 px-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'register'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>تأسيس منشأة</span>
            </button>
          </div>

          {/* Global Toast Alert */}
          {toast && (
            <div
              className={`mb-4 p-3 rounded-xl text-xs font-bold flex items-center gap-2.5 transition-all shadow-md animate-in fade-in slide-in-from-top-2 ${
                toast.type === 'success'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
              }`}
            >
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span className="leading-relaxed">{toast.message}</span>
            </div>
          )}

          {/* =========================================================================
              TAB 1: Multi-Device Login by Company Code (كود الشركة)
              Meets Requirements 1, 2, and 3
              ========================================================================= */}
          {activeTab === 'companyCode' && (
            <div className="space-y-4 animate-in fade-in duration-200">

              {/* Company Code Input & Quick Lookup */}
              <div className="space-y-1.5 bg-slate-900/60 p-3 rounded-2xl border border-slate-700/80">
                <div className="flex items-center justify-between text-xs font-bold">
                  <label className="text-slate-200 flex items-center gap-1.5">
                    <Store className="w-4 h-4 text-amber-400" />
                    <span>كود الشركة / المنشأة (Company Code):</span>
                  </label>
                  {loadedCompany && (
                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-bold flex items-center gap-1">
                      <Cloud className="w-3 h-3 text-emerald-400" />
                      <span>{loadedCompany.source === 'cloud' ? 'سحابي متزامن' : 'محلي'}</span>
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={companyCodeInput}
                    onChange={e => setCompanyCodeInput(e.target.value.toUpperCase())}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        fetchAndSyncCompanyUsers(companyCodeInput, false);
                      }
                    }}
                    placeholder="مثال: COMP-101"
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-mono font-bold focus:border-amber-400 outline-none uppercase tracking-wider"
                  />

                  <button
                    type="button"
                    onClick={() => fetchAndSyncCompanyUsers(companyCodeInput, false)}
                    disabled={isRefreshingUsers}
                    className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 shrink-0 shadow-xs"
                    title="بحث وجلب بيانات المنشأة من السحابة"
                  >
                    {isRefreshingUsers ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    <span>جلب</span>
                  </button>
                </div>

                {/* Company Registered Quick Chips - De-duplicated by normalized code */}
                {registeredTenants.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[10px] text-slate-400 font-medium">المنشآت المسجلة:</span>
                    {Array.from(new Map(registeredTenants.map(t => [normalizeCompanyCode(t.code || t.id), t])).values()).slice(0, 4).map(t => {
                      const normCode = normalizeCompanyCode(t.code || t.id);
                      const isSelected = normalizeCompanyCode(companyCodeInput) === normCode;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setCompanyCodeInput(normCode);
                            fetchAndSyncCompanyUsers(normCode, false);
                          }}
                          className={`text-[9.5px] px-2 py-0.5 rounded-lg border font-mono transition cursor-pointer ${
                            isSelected
                              ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                              : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                          }`}
                        >
                          {normCode} ({t.name})
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Requirement 3: Live Cloud Sync / Refresh Button */}
              {loadedCompany && (
                <div className="flex items-center justify-between gap-2 bg-blue-950/40 p-2.5 rounded-xl border border-blue-500/30 text-xs">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-black text-white text-xs truncate">{loadedCompany.companyName}</span>
                      <span className="font-mono text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.2 rounded border border-blue-400/20 font-bold">
                        {loadedCompany.companyCode}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {loadedCompany.users.length} مستخدمين مسجلين • آخر تحديث: {lastRefreshedTime || 'الآن'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => fetchAndSyncCompanyUsers(companyCodeInput, false)}
                    disabled={isRefreshingUsers}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0"
                    title="تحديث فوري لقائمة المستخدمين من السحابة"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingUsers ? 'animate-spin' : ''}`} />
                    <span>تحديث القائمة</span>
                  </button>
                </div>
              )}

              {/* Branch Selector: المقر الرئيسي والفروع */}
              {loadedCompany && availableBranches.length > 0 && (
                <div className="space-y-2 bg-slate-900/80 p-3 rounded-2xl border border-slate-700/80">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-200 flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-amber-400" />
                      <span>اختر المقر الرئيسي أو الفرع للدخول:</span>
                    </span>
                    <span className="text-[10px] text-slate-400">
                      ({availableBranches.length} فروع)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {availableBranches.map(b => {
                      const isSelected = selectedBranchId === b.id;
                      const isUnlocked = b.isMain || b.id === 'br_main' || unlockedBranchIds.includes(b.id);

                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => handleBranchClick(b)}
                          className={`p-2.5 rounded-xl border text-right transition-all flex flex-col justify-between cursor-pointer select-none relative ${
                            isSelected
                              ? 'bg-amber-500/20 border-amber-400 ring-2 ring-amber-400/30'
                              : 'bg-slate-800/80 border-slate-700 hover:border-slate-500'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold ${
                              isSelected ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-slate-400'
                            }`}>
                              {b.code || 'BR'}
                            </span>
                            {isUnlocked ? (
                              <span className="text-[9px] text-emerald-400 flex items-center gap-0.5 font-bold">
                                <Check className="w-3 h-3" />
                                <span>مفتوح</span>
                              </span>
                            ) : (
                              <span className="text-[9px] text-amber-300 flex items-center gap-0.5 font-bold bg-amber-500/15 px-1.5 py-0.2 rounded border border-amber-500/30">
                                <Lock className="w-2.5 h-2.5" />
                                <span>PIN سري</span>
                              </span>
                            )}
                          </div>

                          <div className="font-black text-xs text-white truncate">
                            {b.name}
                          </div>
                          <span className="text-[9px] text-slate-400 mt-0.5">
                            {b.isMain ? 'المقر الرئيسي' : 'فرع مستقل'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Requirement 1: User Selection (Filtered by Selected Branch) */}
              {loadedCompany && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-200 font-bold mb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-blue-400" />
                        <span>مستخدمو {availableBranches.find(b => b.id === selectedBranchId)?.name || 'الفرع'}:</span>
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        ({branchUsers.length} مستخدم متاح بهذا الفرع)
                      </span>
                    </label>

                    {branchUsers.length > 0 ? (
                      /* Standard Dropdown Select */
                      <select
                        value={selectedUserId}
                        onChange={e => {
                          setSelectedUserId(e.target.value);
                          setUserPassword('');
                        }}
                        className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-bold focus:border-amber-400 outline-none transition cursor-pointer"
                      >
                        <option value="" disabled>-- اضغط لاختيار المستخدم --</option>
                        {branchUsers.map(u => (
                          <option key={u.id} value={u.id}>
                            {u.name} — [{u.role}] ({u.branchName || (availableBranches.find(b => b.id === u.branchId)?.name) || 'المقر الرئيسي'}) {u.password ? '• محمي بكلمة مرور' : '• بدون كلمة مرور'}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 text-xs text-slate-400 text-center leading-relaxed">
                        لا يوجد مستخدمون مخصصون لهذا الفرع حتى الآن. يمكنك تسجيل الدخول بحساب مدير النظام وتعيين موظفين للفرع من إعدادات المستخدمين.
                      </div>
                    )}
                  </div>

                  {/* Interactive Visual Cards for Mobile Touch (Filtered by Branch) */}
                  {branchUsers.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pl-1">
                      {branchUsers.map(u => {
                        const isSelected = selectedUserId === u.id;
                        return (
                          <div
                            key={u.id}
                            onClick={() => {
                              setSelectedUserId(u.id);
                              setUserPassword('');
                            }}
                            className={`p-2.5 rounded-xl cursor-pointer text-center transition-all space-y-1 select-none border ${
                              isSelected
                                ? 'bg-slate-700/90 border-amber-400 ring-2 ring-amber-400/20 shadow-md'
                                : 'bg-slate-800/80 border-slate-700 hover:border-slate-500'
                            }`}
                          >
                            <div className="w-8 h-8 mx-auto rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center">
                              {getUserRoleIcon(u.role)}
                            </div>
                            <p className={`font-bold text-xs truncate ${isSelected ? 'text-amber-300' : 'text-white'}`}>
                              {u.name}
                            </p>
                            <div className="flex items-center justify-center gap-1 flex-wrap">
                              <span className="text-[9px] text-slate-300 bg-slate-900/80 px-1.5 py-0.2 rounded-full font-bold">
                                {u.role}
                              </span>
                              {(u.branchName || availableBranches.find(b => b.id === u.branchId)?.name) && (
                                <span className="text-[8px] text-slate-400 truncate max-w-[80px]">
                                  {u.branchName || availableBranches.find(b => b.id === u.branchId)?.name}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Password Verification & Submit Form */}
                  {selectedUserObj && (
                    <form onSubmit={handleVerifyAndLogin} className="space-y-3 pt-2 border-t border-slate-700/70 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between text-xs bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center">
                            {getUserRoleIcon(selectedUserObj.role)}
                          </div>
                          <div>
                            <span className="text-slate-300 block text-[11px]">المستخدم المحدد:</span>
                            <strong className="text-amber-400 font-bold">{selectedUserObj.name}</strong>
                          </div>
                        </div>
                        <div className="text-left">
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold block text-center">
                            {selectedUserObj.role}
                          </span>
                          <span className="text-[9px] text-slate-400 block mt-0.5">
                            {selectedUserObj.branchName || 'الفرع الرئيسي'}
                          </span>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-slate-200 font-bold flex items-center gap-1">
                            <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                            <span>كلمة المرور / الرمز السري:</span>
                          </label>
                          <span className="text-[10px] text-slate-400">
                            {selectedUserObj.password ? 'مطلوبة لهذا المستخدم' : 'فارغ إذا لم يتم تعيينها'}
                          </span>
                        </div>

                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={userPassword}
                            onChange={e => setUserPassword(e.target.value)}
                            placeholder="••••••••"
                            autoFocus
                            className="w-full px-3.5 py-2.5 pl-10 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400 transition font-mono tracking-wider"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute left-3 top-2.5 text-slate-400 hover:text-white cursor-pointer"
                            tabIndex={-1}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-xl text-sm transition-all shadow-lg shadow-amber-500/20 active:scale-98 cursor-pointer flex items-center justify-center gap-2"
                      >
                        {isLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                        ) : (
                          <Check className="w-4 h-4 stroke-[3]" />
                        )}
                        <span>تسجيل الدخول إلى حساباتي</span>
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              TAB 2: Official Google Sign-In for Owner
              ========================================================================= */}
          {activeTab === 'google' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="text-center">
                <h3 className="text-base font-bold text-white flex items-center justify-center gap-1.5">
                  <Mail className="w-4 h-4 text-blue-400" />
                  <span>دخول المالك بحساب Google</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  تسجيل الدخول الرسمي للربط التلقائي بالنسخ الاحتياطي السحابي
                </p>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoadingGoogle}
                className="w-full py-3 px-4 bg-white hover:bg-slate-100 text-slate-900 rounded-xl font-bold text-xs flex items-center justify-center gap-3 transition-all shadow-lg active:scale-98 cursor-pointer border border-slate-200"
              >
                {isLoadingGoogle ? (
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                ) : (
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                )}
                <span>تسجيل الدخول الفوري بحساب Google</span>
              </button>

              {/* Direct Gmail Input */}
              <form
                onSubmit={e => {
                  e.preventDefault();
                  if (manualEmail.trim()) {
                    fetchAndSyncCompanyUsers(manualEmail.trim(), false);
                    setActiveTab('companyCode');
                  }
                }}
                className="space-y-2 pt-2 border-t border-slate-700/60"
              >
                <label className="block text-[11px] text-slate-300 font-bold">
                  أو كتابة بريد Gmail مباشرة:
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={manualEmail}
                    onChange={e => setManualEmail(e.target.value)}
                    placeholder="name@gmail.com"
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white dir-ltr text-right font-mono focus:border-amber-400 outline-none"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold rounded-xl text-xs border border-amber-500/40 cursor-pointer"
                  >
                    متابعة
                  </button>
                </div>
              </form>

              {/* Saved Accounts */}
              {savedAccounts.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-700/60">
                  <span className="text-[10px] text-slate-400 font-bold block">
                    الحسابات المسجلة سابقاً على هذا الهاتف:
                  </span>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {savedAccounts.map(acc => (
                      <div
                        key={acc.email}
                        onClick={() => {
                          fetchAndSyncCompanyUsers(acc.email, false);
                          setActiveTab('companyCode');
                        }}
                        className="p-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 rounded-xl flex items-center justify-between cursor-pointer transition"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-black flex items-center justify-center text-[10px] shrink-0 border border-amber-500/30">
                            {acc.name ? acc.name.charAt(0).toUpperCase() : 'G'}
                          </div>
                          <div className="truncate">
                            <p className="text-xs font-bold text-white truncate">{acc.name}</p>
                            <p className="text-[9.5px] text-slate-400 dir-ltr text-right truncate">{acc.email}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              TAB 3: Register New Company (تأسيس منشأة جديدة)
              ========================================================================= */}
          {activeTab === 'register' && (
            <form onSubmit={handleRegisterNewCompany} className="space-y-3 animate-in fade-in duration-200">
              <div className="text-center pb-2 border-b border-slate-700/70">
                <h3 className="text-sm font-bold text-white flex items-center justify-center gap-1.5">
                  <Building2 className="w-4 h-4 text-emerald-400" />
                  <span>تأسيس منشأة جديدة ومساحة سحابية مستقلة</span>
                </h3>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 text-xs font-bold">
                  اسم الشركة / المنشأة <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={regCompanyName}
                  onChange={e => setRegCompanyName(e.target.value)}
                  placeholder="مثال: شركة الأمل للمقاولات والتوزيع"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:border-amber-400 outline-none text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 text-xs font-bold">
                  كود الشركة لتسجيل دخول الموظفين (Company Code) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={regCompanyCode}
                  onChange={e => setRegCompanyCode(e.target.value.toUpperCase())}
                  placeholder="COMP-102"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:border-amber-400 outline-none text-xs font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 text-xs font-bold">
                  اسم المدير العام / المالك <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={regOwnerName}
                  onChange={e => setRegOwnerName(e.target.value)}
                  placeholder="اسمك كمسؤول المنظومة"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:border-amber-400 outline-none text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 text-xs font-bold">
                  كلمة مرور المدير العام <span className="text-rose-400">*</span>
                </label>
                <input
                  type="password"
                  required
                  value={regOwnerPassword}
                  onChange={e => setRegOwnerPassword(e.target.value)}
                  placeholder="كلمة مرور الدخول"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:border-amber-400 outline-none text-xs font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-xl text-xs transition-all shadow-lg active:scale-98 cursor-pointer flex items-center justify-center gap-2 mt-2"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>إنشاء المنشأة والبدء فوراً</span>
              </button>
            </form>
          )}

        </div>

        {/* Modal: Branch Secret PIN Verification for Isolation */}
        {branchPinModalTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700/90 rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-4 text-slate-100 animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white">الرقم السري للفرع</h3>
                    <p className="text-[10.5px] text-slate-400">حماية وعزل بيانات الفرع</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setBranchPinModalTarget(null);
                    setBranchPinError('');
                  }}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Branch Badge */}
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-400" />
                  <div>
                    <span className="text-xs font-bold text-white block">{branchPinModalTarget.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">كود: {branchPinModalTarget.code}</span>
                  </div>
                </div>
                <span className="text-[10px] bg-amber-500/15 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                  فرع محمي
                </span>
              </div>

              <p className="text-[11px] text-amber-200/90 bg-amber-950/20 p-2 rounded-xl border border-amber-500/20 leading-relaxed">
                لا يمكن الدخول إلى هذا الفرع أو استعراض مستخدميه إلا بإدخال الرقم السري الخاص به.
              </p>

              {branchPinError && (
                <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{branchPinError}</span>
                </div>
              )}

              {/* PIN Input Form */}
              <form onSubmit={handleBranchPinSubmit} className="space-y-3">
                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-slate-300 mb-1">
                    <label>أدخل الرقم السري للفرع (PIN):</label>
                    <span className="text-[10px] text-slate-500 font-mono">الافتراضي: 1234</span>
                  </div>
                  <div className="relative">
                    <input
                      type={showBranchPinEye ? 'text' : 'password'}
                      autoFocus
                      required
                      value={branchPinInput}
                      onChange={e => {
                        setBranchPinInput(e.target.value);
                        setBranchPinError('');
                      }}
                      placeholder="••••"
                      className="w-full px-3.5 py-2.5 pl-10 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm font-mono font-bold tracking-widest focus:border-amber-400 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowBranchPinEye(!showBranchPinEye)}
                      className="absolute left-3 top-3 text-slate-400 hover:text-white cursor-pointer"
                    >
                      {showBranchPinEye ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setBranchPinModalTarget(null);
                      setBranchPinError('');
                    }}
                    className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black transition shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>تأكيد والدخول</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Global Footer */}
        <p className="text-center text-[11px] text-slate-400 mt-3 font-medium">
          نظام حساباتي السحابي • مزامنة متعددة الأجهزة (Multi-Tenant & Multi-Device)
        </p>
      </div>
    </div>
  );
};
