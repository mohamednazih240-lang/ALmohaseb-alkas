import React, { useState, useEffect } from 'react';
import {
  Calculator,
  Lock,
  User,
  ShieldCheck,
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
  Sparkles,
  Mail,
  UserPlus,
  PlusCircle,
  X,
  Check,
  LogOut,
  Users,
  Briefcase,
  Receipt,
  Boxes,
  TrendingUp,
  Sliders
} from 'lucide-react';
import { User as AppUser, AppSettings, AccountingDB } from '../types/accounting';
import { AuthSession, auth, googleProvider } from '../services/firebaseAuth';
import { signInWithPopup } from 'firebase/auth';
import { loadDatabase, saveDatabase } from '../services/accountingStorage';
import { fetchDatabaseFromCloud, pushDatabaseToCloud } from '../services/cloudSyncService';
import { getCompaniesList, registerCompany } from '../services/tenantService';
import { countActivePermissions, TOTAL_SYSTEM_PERMISSIONS_COUNT } from './SystemViews';

interface LoginViewProps {
  settings: AppSettings;
  users?: AppUser[];
  onLoginSuccess: (session: AuthSession, tenantDb?: AccountingDB) => void;
  onCancel?: () => void;
  canCancel?: boolean;
}

export interface CompanyAccountData {
  companyName: string;
  users: AppUser[];
  ownerEmail?: string;
}

export interface GoogleAccountItem {
  name: string;
  email: string;
  avatar: string;
}

export const LoginView: React.FC<LoginViewProps> = ({
  settings,
  users: propUsers,
  onLoginSuccess,
  onCancel,
  canCancel = false
}) => {
  const currentDb = loadDatabase();
  const [cloudDb, setCloudDb] = useState<AccountingDB | null>(null);
  const [isLoadingCloud, setIsLoadingCloud] = useState<boolean>(false);

  // Flow Step: 'stepSelectAccount' | 'stepUserList' | 'stepRegisterOwner'
  const [currentStep, setCurrentStep] = useState<'stepSelectAccount' | 'stepUserList' | 'stepRegisterOwner'>('stepSelectAccount');
  
  // Google Picker Modal
  const [showGooglePickerModal, setShowGooglePickerModal] = useState<boolean>(false);
  const [manualCustomEmailInput, setManualCustomEmailInput] = useState<string>('');
  const [showAddCustomEmailInput, setShowAddCustomEmailInput] = useState<boolean>(false);

  // Selected Google account
  const [selectedEmail, setSelectedEmail] = useState<string>('');
  const [selectedEmailAvatar, setSelectedEmailAvatar] = useState<string>('G');

  // Currently loaded company for Step 2
  const [currentCompany, setCurrentCompany] = useState<CompanyAccountData | null>(null);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [userPassword, setUserPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // New Company Registration Form (Step 3)
  const [regCompanyName, setRegCompanyName] = useState<string>('');
  const [regOwnerName, setRegOwnerName] = useState<string>('');
  const [regOwnerPassword, setRegOwnerPassword] = useState<string>('');

  // Toast alert
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Helper for Toast Alert
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Google Accounts available on phone / stored locally
  const [googleAccounts, setGoogleAccounts] = useState<GoogleAccountItem[]>(() => {
    try {
      const saved = localStorage.getItem('hesabaty_saved_google_accounts');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}

    // Default accounts detected from device / initial defaults
    const previousSession = localStorage.getItem('hesabaty_active_user');
    let emailFound = 'owner.company@gmail.com';
    let nameFound = 'أحمد المالك (مالك المنشأة)';
    if (previousSession) {
      try {
        const p = JSON.parse(previousSession);
        if (p.googleEmail) {
          emailFound = p.googleEmail;
          nameFound = p.user?.name || emailFound.split('@')[0];
        }
      } catch {}
    }

    return [
      { name: nameFound, email: emailFound, avatar: nameFound.charAt(0) || 'A' },
      { name: 'محمود المحاسب', email: 'accountant.store@gmail.com', avatar: 'M' },
      { name: 'مهند السعيد (كاشير الفرع)', email: 'cashier.branch@gmail.com', avatar: 'C' }
    ];
  });

  // Load Companies Map from LocalStorage or initialize with currentDb
  const getCompaniesMap = (): Record<string, CompanyAccountData> => {
    try {
      const raw = localStorage.getItem('hesabaty_companies');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (e) {
      console.warn('Error reading hesabaty_companies:', e);
    }

    // Default mapping linked to current DB
    const activeCompName = currentDb.settings.company || settings.company || 'شركة الفرسان للتجارة والتوريدات';
    const activeUsers: AppUser[] = (currentDb.users && currentDb.users.length > 0)
      ? currentDb.users
      : [
          { id: 'usr_owner', name: 'المالك (المدير العام)', username: 'admin', role: 'مدير', active: true, password: '1234' },
          { id: 'usr_acc', name: 'محمد المحاسب', username: 'accountant', role: 'محاسب', active: true, password: '1111' },
          { id: 'usr_cashier', name: 'علي الكاشير', username: 'cashier', role: 'كاشير', active: true, password: '2222' },
          { id: 'usr_sales', name: 'حسن مسؤول المبيعات', username: 'sales', role: 'مبيعات', active: true, password: '3333' }
        ];

    const initialMap: Record<string, CompanyAccountData> = {
      'owner.company@gmail.com': {
        companyName: activeCompName,
        users: activeUsers,
        ownerEmail: 'owner.company@gmail.com'
      }
    };

    localStorage.setItem('hesabaty_companies', JSON.stringify(initialMap));
    return initialMap;
  };

  // Sync with Firestore Cloud on mount to fetch the latest company and users
  useEffect(() => {
    let isMounted = true;
    setIsLoadingCloud(true);

    fetchDatabaseFromCloud().then(remoteDb => {
      if (!isMounted) return;
      setIsLoadingCloud(false);
      if (remoteDb && Array.isArray(remoteDb.users) && remoteDb.users.length > 0) {
        setCloudDb(remoteDb);

        // Update local companies map with latest cloud users
        const map = getCompaniesMap();
        const activeEmailKey = selectedEmail || Object.keys(map)[0] || 'owner.company@gmail.com';
        if (map[activeEmailKey]) {
          map[activeEmailKey].users = remoteDb.users;
          map[activeEmailKey].companyName = remoteDb.settings.company || map[activeEmailKey].companyName;
          localStorage.setItem('hesabaty_companies', JSON.stringify(map));
        }
      }
    }).catch(err => {
      if (!isMounted) return;
      setIsLoadingCloud(false);
      console.warn('Cloud sync load notice:', err);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  // Set default initial email from previous session or default account
  useEffect(() => {
    if (!selectedEmail) {
      const map = getCompaniesMap();
      const firstEmail = Object.keys(map)[0] || (googleAccounts[0] ? googleAccounts[0].email : 'owner.company@gmail.com');
      setSelectedEmail(firstEmail);
      const acc = googleAccounts.find(a => a.email.toLowerCase() === firstEmail.toLowerCase());
      if (acc) {
        setSelectedEmailAvatar(acc.avatar);
      }
    }
  }, []);

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

  // Select account handler
  const handleSelectGoogleAccount = (email: string, avatarLetter?: string) => {
    setSelectedEmail(email);
    setSelectedEmailAvatar(avatarLetter || email.charAt(0).toUpperCase());
    setShowGooglePickerModal(false);

    // Save this email into saved accounts if not present
    setGoogleAccounts(prev => {
      if (!prev.some(a => a.email.toLowerCase() === email.toLowerCase())) {
        const updated = [{ name: email.split('@')[0], email, avatar: email.charAt(0).toUpperCase() }, ...prev];
        localStorage.setItem('hesabaty_saved_google_accounts', JSON.stringify(updated));
        return updated;
      }
      return prev;
    });

    // Check if this Google email has a registered company
    const map = getCompaniesMap();
    const existingComp = map[email.toLowerCase()] || map[email];

    if (existingComp) {
      setCurrentCompany(existingComp);
      setSelectedUser(existingComp.users[0] || null);
      setUserPassword('');
      setCurrentStep('stepUserList');
      showToast(`تم التعرف على منشأة: «${existingComp.companyName}»`, 'success');
    } else {
      // Check if tenant service has this company
      const tenants = getCompaniesList();
      const matchedTenant = tenants.find(t => t.googleEmail?.toLowerCase() === email.toLowerCase());
      if (matchedTenant) {
        const compData: CompanyAccountData = {
          companyName: matchedTenant.name,
          users: currentDb.users || [],
          ownerEmail: email
        };
        map[email.toLowerCase()] = compData;
        localStorage.setItem('hesabaty_companies', JSON.stringify(map));
        setCurrentCompany(compData);
        setSelectedUser(compData.users[0] || null);
        setUserPassword('');
        setCurrentStep('stepUserList');
        showToast(`تم التعرف على منشأة: «${matchedTenant.name}»`, 'success');
      } else {
        // Not registered -> go to Step 3 (Register New Company)
        showToast('هذا البريد غير مرتبط بمنشأة سابقة. يمكنك تسجيل المنشأة الآن فوراً.', 'error');
        setRegCompanyName('');
        setRegOwnerName(email.split('@')[0] || '');
        setRegOwnerPassword('');
        setCurrentStep('stepRegisterOwner');
      }
    }
  };

  // Trigger Google Official Popup Sign-in
  const handleOfficialGooglePopup = async () => {
    setIsLoading(true);
    setShowGooglePickerModal(false);

    try {
      const res = await signInWithPopup(auth, googleProvider);
      const email = res.user.email || '';
      const displayName = res.user.displayName || email.split('@')[0] || 'المدير العام';

      setIsLoading(false);
      handleSelectGoogleAccount(email, displayName.charAt(0).toUpperCase());
    } catch (err: any) {
      setIsLoading(false);
      console.warn('Google popup error:', err);
      showToast('تعذر فتح نافذة Google المنبثقة. يمكنك اختيار أو كتابة بريدك الـ Gmail مباشرة أدناه.', 'error');
      setShowGooglePickerModal(true);
      setShowAddCustomEmailInput(true);
    }
  };

  // Step 2: Handle user card click
  const handleUserCardClick = (userItem: AppUser) => {
    setSelectedUser(userItem);
    setUserPassword('');
  };

  // Step 2: Verify and Login
  const handleVerifyAndLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!selectedUser) {
      showToast('يرجى اختيار اسم المستخدم أولاً من القائمة', 'error');
      return;
    }

    // Verify Password if set on user
    if (selectedUser.password && selectedUser.password.trim() !== '') {
      if (userPassword !== selectedUser.password) {
        showToast('كلمة المرور / الرمز السري غير صحيح!', 'error');
        return;
      }
    }

    // Success! Prepare session and database
    showToast('تم التحقق بنجاح! جاري الدخول إلى حساباتي...', 'success');
    setIsLoading(true);

    setTimeout(() => {
      const activeDb = cloudDb || currentDb;
      const updatedUser: AppUser = {
        ...selectedUser,
        lastLogin: new Date().toISOString()
      };

      if (!activeDb.users) activeDb.users = [];
      const idx = activeDb.users.findIndex(u => u.id === selectedUser.id);
      if (idx >= 0) {
        activeDb.users[idx] = updatedUser;
      } else {
        activeDb.users.unshift(updatedUser);
      }
      activeDb.currentUser = updatedUser;

      // Update company name if loaded
      if (currentCompany?.companyName) {
        activeDb.settings.company = currentCompany.companyName;
      }

      saveDatabase(activeDb);
      pushDatabaseToCloud(activeDb).catch(() => {});

      const session: AuthSession = {
        user: updatedUser,
        isGoogle: true,
        googleEmail: selectedEmail,
        companyName: currentCompany?.companyName || activeDb.settings.company || 'حساباتي'
      };

      localStorage.setItem('hesabaty_active_user', JSON.stringify(session));
      setIsLoading(false);
      onLoginSuccess(session, activeDb);
    }, 600);
  };

  // Step 3: Save and Register New Company
  const handleSaveNewCompany = (e: React.FormEvent) => {
    e.preventDefault();

    const companyTrimmed = regCompanyName.trim();
    const ownerNameTrimmed = regOwnerName.trim();
    const ownerPassTrimmed = regOwnerPassword.trim();

    if (!companyTrimmed || !ownerNameTrimmed || !ownerPassTrimmed) {
      showToast('يرجى ملء جميع الحقول المطلوبة لتأسيس المنشأة', 'error');
      return;
    }

    setIsLoading(true);

    try {
      // 1. Create company in tenant registry
      registerCompany({
        name: companyTrimmed,
        adminName: ownerNameTrimmed,
        adminUsername: selectedEmail || 'admin',
        password: ownerPassTrimmed,
        isGoogle: true,
        googleEmail: selectedEmail
      });

      // 2. Build default users for this new company
      const ownerUser: AppUser = {
        id: 'usr_' + Date.now().toString(36),
        name: ownerNameTrimmed,
        username: selectedEmail || 'admin',
        password: ownerPassTrimmed,
        role: 'مدير',
        active: true,
        lastLogin: new Date().toISOString()
      };

      const accountantUser: AppUser = {
        id: 'usr_acc_' + Date.now().toString(36),
        name: 'محاسب المنشأة',
        username: 'accountant',
        password: '123',
        role: 'محاسب',
        active: true
      };

      const cashierUser: AppUser = {
        id: 'usr_cash_' + Date.now().toString(36),
        name: 'كاشير المبيعات',
        username: 'cashier',
        password: '123',
        role: 'كاشير',
        active: true
      };

      const companyData: CompanyAccountData = {
        companyName: companyTrimmed,
        users: [ownerUser, accountantUser, cashierUser],
        ownerEmail: selectedEmail
      };

      // 3. Save to local map
      const map = getCompaniesMap();
      map[selectedEmail.toLowerCase()] = companyData;
      localStorage.setItem('hesabaty_companies', JSON.stringify(map));

      // 4. Update active database
      const activeDb = currentDb;
      activeDb.settings.company = companyTrimmed;
      activeDb.users = companyData.users;
      activeDb.currentUser = ownerUser;
      saveDatabase(activeDb);
      pushDatabaseToCloud(activeDb).catch(() => {});

      setCurrentCompany(companyData);
      setSelectedUser(ownerUser);

      showToast(`تم تأسيس منشأة «${companyTrimmed}» بنجاح!`, 'success');

      setTimeout(() => {
        setIsLoading(false);
        const session: AuthSession = {
          user: ownerUser,
          isGoogle: true,
          googleEmail: selectedEmail,
          companyName: companyTrimmed
        };
        localStorage.setItem('hesabaty_active_user', JSON.stringify(session));
        onLoginSuccess(session, activeDb);
      }, 700);
    } catch (err) {
      console.error('Error saving company:', err);
      setIsLoading(false);
      showToast('حدث خطأ أثناء حفظ المنشأة. يرجى المحاولة ثانية.', 'error');
    }
  };

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
      <div className="w-full max-w-md my-auto relative z-10">

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
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-700 via-blue-600 to-amber-500 text-white text-3xl shadow-xl shadow-amber-500/15 mb-3 border border-amber-400/20">
            <Calculator className="w-8 h-8 text-white drop-shadow-sm" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center justify-center gap-2">
            <span>حساباتي</span>
            <span className="text-amber-400 text-lg font-bold bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-400/20">ERP</span>
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1 font-medium">
            المنظومة المحاسبية الذكية للمنشآت والشركات
          </p>

          {isLoadingCloud && (
            <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-0.5 rounded-full text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 font-bold animate-pulse">
              <Cloud className="w-3 h-3 text-emerald-400" />
              <span>متصل بالسحابة اللحظية • مزامنة تلقائية</span>
            </div>
          )}
        </div>

        {/* Dynamic Content Card (Glass Panel) */}
        <div className="glass-panel rounded-3xl p-5 sm:p-6 shadow-2xl relative overflow-hidden text-right">

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

          {/* ========================================================
              STEP 1: Select Google Email / Mode (stepSelectAccount)
              ======================================================== */}
          {currentStep === 'stepSelectAccount' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="text-center">
                <h2 className="text-xl font-bold text-slate-100 flex items-center justify-center gap-2">
                  <Building2 className="w-5 h-5 text-amber-400" />
                  <span>تسجيل الدخول للمنشأة</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  حدد بريد Google للتعرف على المنشأة والمستخدمين
                </p>
              </div>

              {/* Google Sign-In Primary Button */}
              <button
                type="button"
                onClick={() => setShowGooglePickerModal(true)}
                className="w-full py-3.5 px-4 bg-white hover:bg-slate-100 text-slate-900 rounded-xl font-bold text-sm flex items-center justify-center gap-3 transition-all shadow-lg active:scale-98 cursor-pointer border border-slate-200"
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>اختيار بريد Google من الهاتف</span>
              </button>

              {/* Currently Selected Email Indicator */}
              {selectedEmail && (
                <div className="p-3 bg-slate-800/90 rounded-xl border border-slate-700/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold flex items-center justify-center shrink-0">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <p className="text-slate-400 text-[10px]">الإيميل المختار:</p>
                      <p className="font-bold text-slate-200 truncate dir-ltr text-right">{selectedEmail}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowGooglePickerModal(true)}
                    className="text-amber-400 hover:text-amber-300 hover:underline font-bold shrink-0 text-xs cursor-pointer px-2 py-1"
                  >
                    تغيير
                  </button>
                </div>
              )}

              {/* Fast Direct Enter with current active company */}
              {selectedEmail && (
                <button
                  type="button"
                  onClick={() => handleSelectGoogleAccount(selectedEmail)}
                  className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold rounded-xl text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>عرض مستخدمي منشأة هذا الإيميل والدخول</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}

              <div className="relative flex items-center justify-center my-3">
                <div className="border-t border-slate-700/80 w-full"></div>
                <span className="bg-slate-800 px-3 text-xs text-slate-400 font-bold absolute rounded-full">أو</span>
              </div>

              {/* Create New Company Option for Owner */}
              <button
                type="button"
                onClick={() => {
                  setRegCompanyName('');
                  setRegOwnerName(selectedEmail ? selectedEmail.split('@')[0] : '');
                  setRegOwnerPassword('');
                  setCurrentStep('stepRegisterOwner');
                }}
                className="w-full py-3 px-4 bg-slate-800/90 hover:bg-slate-700/90 text-amber-400 border border-amber-500/40 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
              >
                <PlusCircle className="w-4 h-4 text-amber-400" />
                <span>تسجيل منشأة جديدة أول مرة (خاص بالمالك)</span>
              </button>
            </div>
          )}


          {/* ========================================================
              STEP 2: Select User & Enter Password (stepUserList)
              ======================================================== */}
          {currentStep === 'stepUserList' && currentCompany && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Company Header Bar */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-700/70">
                <div className="min-w-0">
                  <span className="text-[11px] text-amber-400 font-bold block">اسم المنشأة:</span>
                  <h2 className="text-base sm:text-lg font-black text-white truncate flex items-center gap-1.5">
                    <Store className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="truncate">{currentCompany.companyName}</span>
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentStep('stepSelectAccount')}
                  className="text-xs text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 px-2.5 py-1.5 rounded-lg border border-slate-700 transition flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>تغيير الإيميل</span>
                </button>
              </div>

              <div>
                <p className="text-xs text-slate-300 font-bold mb-2.5 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-blue-400" />
                  <span>اختر اسم المستخدم التابع للمنشأة لتسجيل الدخول:</span>
                </p>

                {/* Users Cards Grid */}
                <div className="grid grid-cols-2 gap-2.5 max-h-52 overflow-y-auto pl-1">
                  {currentCompany.users.map(u => {
                    const isSelected = selectedUser?.id === u.id;
                    const activePermsCount = countActivePermissions(u);

                    return (
                      <div
                        key={u.id}
                        onClick={() => handleUserCardClick(u)}
                        className={`user-card p-3 rounded-2xl cursor-pointer text-center transition-all space-y-1.5 select-none ${
                          isSelected
                            ? 'bg-slate-700/90 border-2 border-amber-400 shadow-md ring-2 ring-amber-400/20'
                            : 'bg-slate-800/80 border border-slate-700/80 hover:border-slate-500'
                        }`}
                      >
                        <div className="w-10 h-10 mx-auto rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center">
                          {getUserRoleIcon(u.role)}
                        </div>
                        <p className={`font-black text-xs truncate ${isSelected ? 'text-amber-300' : 'text-slate-100'}`}>
                          {u.name}
                        </p>
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-[10px] text-slate-300 bg-slate-900/80 px-2 py-0.5 rounded-full font-bold">
                            {u.role}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Password Input Form for Selected User */}
              {selectedUser && (
                <form onSubmit={handleVerifyAndLogin} className="space-y-3 pt-3 border-t border-slate-700/70 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between text-xs bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-300">
                      الدخول باسم: <strong className="text-amber-400">{selectedUser.name}</strong>
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                      {selectedUser.role}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-slate-300 font-bold flex items-center gap-1">
                        <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                        <span>كلمة المرور / الرمز السرّي:</span>
                      </label>
                      <span className="text-[10px] text-slate-400">
                        {selectedUser.password ? 'مطلوبة لهذا المستخدم' : 'فارغ إذا لم يتم تعيينها'}
                      </span>
                    </div>

                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={userPassword}
                        onChange={e => setUserPassword(e.target.value)}
                        placeholder="••••••••"
                        autoFocus
                        className="w-full px-3.5 py-2.5 pl-10 rounded-xl bg-slate-900/90 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400 transition font-mono tracking-wider"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute left-3 top-3 text-slate-400 hover:text-white cursor-pointer"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-xl text-sm transition-all shadow-lg shadow-amber-500/20 active:scale-98 cursor-pointer flex items-center justify-center gap-2 mt-1"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                    ) : (
                      <Check className="w-4 h-4 stroke-[3]" />
                    )}
                    <span>تسجيل الدخول إلى "حساباتي"</span>
                  </button>
                </form>
              )}
            </div>
          )}


          {/* ========================================================
              STEP 3: Register New Company (stepRegisterOwner)
              ======================================================== */}
          {currentStep === 'stepRegisterOwner' && (
            <form onSubmit={handleSaveNewCompany} className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-slate-700/70 pb-2.5">
                <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-amber-400" />
                  <span>تأسيس منشأة جديدة</span>
                </h2>
                <button
                  type="button"
                  onClick={() => setCurrentStep('stepSelectAccount')}
                  className="text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  إلغاء
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-bold">
                    حساب Google المالك:
                  </label>
                  <input
                    type="email"
                    value={selectedEmail}
                    readOnly
                    className="w-full px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-700 text-slate-300 font-mono cursor-not-allowed text-xs dir-ltr text-right"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-bold">
                    اسم الشركة / المحل / المنشأة <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={regCompanyName}
                    onChange={e => setRegCompanyName(e.target.value)}
                    placeholder="مثال: شركة البركة للتجارة والتوريدات"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:border-amber-400 outline-none text-xs"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-bold">
                    اسم المالك / المدير العام <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={regOwnerName}
                    onChange={e => setRegOwnerName(e.target.value)}
                    placeholder="مثال: أ/ أحمد محمود"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:border-amber-400 outline-none text-xs"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-bold">
                    كلمة مرور المالك <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    value={regOwnerPassword}
                    onChange={e => setRegOwnerPassword(e.target.value)}
                    placeholder="كلمة المرور الخاصة بك للدخول"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:border-amber-400 outline-none text-xs font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-xl text-sm transition-all shadow-lg shadow-amber-500/20 active:scale-98 cursor-pointer flex items-center justify-center gap-2 mt-2"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                ) : (
                  <Building2 className="w-4 h-4" />
                )}
                <span>إنشاء المنشأة والبدء فوراً</span>
              </button>
            </form>
          )}

        </div>

        {/* Global Footer */}
        <p className="text-center text-xs text-slate-500 mt-4 font-medium">
          جميع الحقوق محفوظة &copy; 2026 نظام حساباتي المحاسبي
        </p>
      </div>


      {/* ========================================================
          GOOGLE ACCOUNTS PICKER MODAL (From user prototype)
          ======================================================== */}
      {showGooglePickerModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div 
            className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-2xl p-5 space-y-4 shadow-2xl text-right animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <h3 className="text-sm font-bold text-white">حسابات Google المتاحة بالهاتف</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGooglePickerModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Official 1-Click Google Popup */}
            <button
              type="button"
              onClick={handleOfficialGooglePopup}
              className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>تسجيل الدخول بنافذة Google الرسمية (One-Tap)</span>
            </button>

            <p className="text-xs text-slate-400">أو اختر من البريد المسجل على هذا الجهاز:</p>

            {/* List of Accounts */}
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {googleAccounts.map(acc => (
                <div
                  key={acc.email}
                  onClick={() => handleSelectGoogleAccount(acc.email, acc.avatar)}
                  className="p-3 bg-slate-800 hover:bg-slate-700/80 rounded-xl cursor-pointer flex items-center gap-3 transition border border-slate-700/50 select-none group"
                >
                  <div className="w-9 h-9 rounded-full bg-amber-500 text-slate-950 font-black flex items-center justify-center text-sm shrink-0">
                    {acc.avatar}
                  </div>
                  <div className="overflow-hidden min-w-0">
                    <p className="text-xs font-bold text-white truncate group-hover:text-amber-300 transition">
                      {acc.name}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate dir-ltr text-right">
                      {acc.email}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Custom Email Input Toggle */}
            <div className="pt-1">
              {!showAddCustomEmailInput ? (
                <button
                  type="button"
                  onClick={() => setShowAddCustomEmailInput(true)}
                  className="text-xs text-amber-400 hover:underline font-bold w-full text-center cursor-pointer py-1"
                >
                  + استخدام بريد إلكتروني آخر...
                </button>
              ) : (
                <div className="space-y-2 bg-slate-800/80 p-2.5 rounded-xl border border-slate-700 animate-in fade-in">
                  <label className="text-[11px] text-slate-300 font-bold block">
                    اكتب أي حساب Gmail:
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="email"
                      value={manualCustomEmailInput}
                      onChange={e => setManualCustomEmailInput(e.target.value)}
                      placeholder="name@gmail.com"
                      className="flex-1 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono outline-none focus:border-amber-400 text-white dir-ltr text-right"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const em = manualCustomEmailInput.trim().toLowerCase();
                        if (em && em.includes('@')) {
                          handleSelectGoogleAccount(em, em.charAt(0).toUpperCase());
                        } else {
                          showToast('يرجى كتابة بريد إلكتروني صحيح', 'error');
                        }
                      }}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg cursor-pointer"
                    >
                      تأكيد
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowGooglePickerModal(false)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-bold rounded-lg transition cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
