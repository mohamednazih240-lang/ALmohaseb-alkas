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
  Trash2
} from 'lucide-react';
import { User as AppUser, AppSettings, AccountingDB } from '../types/accounting';
import { AuthSession, auth, googleProvider } from '../services/firebaseAuth';
import { signInWithPopup } from 'firebase/auth';
import { loadDatabase, saveDatabase } from '../services/accountingStorage';
import { fetchDatabaseFromCloud, pushDatabaseToCloud } from '../services/cloudSyncService';
import { getCompaniesList, registerCompany } from '../services/tenantService';
import { countActivePermissions } from './SystemViews';

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
  const [cloudDb, setCloudDb] = useState<AccountingDB | null>(null);
  const [isLoadingCloud, setIsLoadingCloud] = useState<boolean>(false);

  // Flow Step: 'stepSelectAccount' | 'stepUserList' | 'stepRegisterOwner'
  const [currentStep, setCurrentStep] = useState<'stepSelectAccount' | 'stepUserList' | 'stepRegisterOwner'>('stepSelectAccount');

  // Input for entering Gmail directly
  const [manualEmail, setManualEmail] = useState<string>('');
  const [selectedEmail, setSelectedEmail] = useState<string>('');

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

  // 1. Purge any previous fake/dummy accounts from localStorage
  useEffect(() => {
    try {
      const savedAccs = localStorage.getItem('hesabaty_saved_google_accounts');
      if (savedAccs && (savedAccs.includes('owner.company@gmail.com') || savedAccs.includes('accountant.store@gmail.com'))) {
        localStorage.removeItem('hesabaty_saved_google_accounts');
      }
      const savedComps = localStorage.getItem('hesabaty_companies');
      if (savedComps && savedComps.includes('owner.company@gmail.com')) {
        localStorage.removeItem('hesabaty_companies');
      }
    } catch (e) {
      console.warn('Purge notice:', e);
    }
  }, []);

  // 2. Real accounts saved on this device
  const [savedAccounts, setSavedAccounts] = useState<SavedAccountItem[]>(() => {
    try {
      const raw = localStorage.getItem('hesabaty_real_accounts');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Filter out any mock addresses
          return parsed.filter(a => a.email && !a.email.includes('owner.company@gmail.com') && !a.email.includes('accountant.store@gmail.com'));
        }
      }
    } catch {}

    // Check if there is an active session with real email
    const active = localStorage.getItem('hesabaty_active_user');
    if (active) {
      try {
        const p = JSON.parse(active);
        if (p.googleEmail && !p.googleEmail.includes('owner.company@gmail.com')) {
          return [{
            name: p.user?.name || p.googleEmail.split('@')[0],
            email: p.googleEmail,
            companyName: p.companyName || currentDb.settings.company
          }];
        }
      } catch {}
    }
    return [];
  });

  // Load Companies Map from LocalStorage
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
    return {};
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

  // Process Real Email Selection
  const handleProcessEmail = (email: string, userName?: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      showToast('يرجى إدخال بريد إلكتروني صحيح', 'error');
      return;
    }

    setSelectedEmail(cleanEmail);

    // Save this real account to saved accounts list on this device
    setSavedAccounts(prev => {
      const filtered = prev.filter(a => a.email.toLowerCase() !== cleanEmail);
      const updated = [{
        name: userName || cleanEmail.split('@')[0],
        email: cleanEmail,
        companyName: currentCompany?.companyName || currentDb.settings.company
      }, ...filtered];
      localStorage.setItem('hesabaty_real_accounts', JSON.stringify(updated));
      return updated;
    });

    // 1. Check if this Google email has a registered company in local map
    const map = getCompaniesMap();
    let existingComp = map[cleanEmail];

    // 2. Check if tenant registry has this company
    if (!existingComp) {
      const tenants = getCompaniesList();
      const matchedTenant = tenants.find(t => t.googleEmail?.toLowerCase() === cleanEmail);
      if (matchedTenant) {
        existingComp = {
          companyName: matchedTenant.name,
          users: currentDb.users || [],
          ownerEmail: cleanEmail
        };
        map[cleanEmail] = existingComp;
        localStorage.setItem('hesabaty_companies', JSON.stringify(map));
      }
    }

    // 3. Check if current database or cloud database belongs to this company
    if (!existingComp && (cloudDb || currentDb.settings.company)) {
      const targetDb = cloudDb || currentDb;
      // If user is already registered in DB users with this email
      const matchedUser = targetDb.users?.find(u => u.username?.toLowerCase() === cleanEmail || u.username?.toLowerCase() === cleanEmail.split('@')[0]);
      if (matchedUser) {
        existingComp = {
          companyName: targetDb.settings.company || 'منشأتي',
          users: targetDb.users || [],
          ownerEmail: cleanEmail
        };
        map[cleanEmail] = existingComp;
        localStorage.setItem('hesabaty_companies', JSON.stringify(map));
      }
    }

    if (existingComp) {
      setCurrentCompany(existingComp);
      setSelectedUser(existingComp.users[0] || null);
      setUserPassword('');
      setCurrentStep('stepUserList');
      showToast(`تم التعرف على منشأة: «${existingComp.companyName}»`, 'success');
    } else {
      // New account -> prompt to create/setup company
      showToast('هذا البريد غير مربوط بمنشأة سابقة. يمكنك تأسيس منشأتك الآن فوراً.', 'error');
      setRegCompanyName(currentDb.settings.company || '');
      setRegOwnerName(userName || cleanEmail.split('@')[0]);
      setRegOwnerPassword('');
      setCurrentStep('stepRegisterOwner');
    }
  };

  // Remove a saved account from this device
  const handleRemoveSavedAccount = (emailToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSavedAccounts(prev => {
      const updated = prev.filter(a => a.email.toLowerCase() !== emailToRemove.toLowerCase());
      localStorage.setItem('hesabaty_real_accounts', JSON.stringify(updated));
      return updated;
    });
    showToast('تمت إزالة الحساب من قائمة هذا الهاتف', 'success');
  };

  // Primary Action: Real Google Sign-In with official Google dialog
  const handleRealGoogleSignIn = async () => {
    setIsLoading(true);

    try {
      const res = await signInWithPopup(auth, googleProvider);
      const email = res.user.email || '';
      const displayName = res.user.displayName || email.split('@')[0] || 'المدير العام';

      setIsLoading(false);
      handleProcessEmail(email, displayName);
    } catch (err: any) {
      setIsLoading(false);
      console.warn('Google sign-in popup note:', err);
      // If popup is blocked or unauthorized domain on mobile, focus the manual Gmail input
      showToast('يرجى كتابة بريدك الـ Gmail في الحقل أدناه للدخول إلى منشأتك فوراً', 'error');
      const inputEl = document.getElementById('manualGmailInput');
      if (inputEl) inputEl.focus();
    }
  };

  // Manual Gmail Form Submission
  const handleManualEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleProcessEmail(manualEmail);
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
    }, 500);
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

      // 2. Build default users for this real company
      const ownerUser: AppUser = {
        id: 'usr_' + Date.now().toString(36),
        name: ownerNameTrimmed,
        username: selectedEmail || 'admin',
        password: ownerPassTrimmed,
        role: 'مدير',
        active: true,
        lastLogin: new Date().toISOString()
      };

      const companyData: CompanyAccountData = {
        companyName: companyTrimmed,
        users: [ownerUser],
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
      }, 600);
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
        <div className="text-center mb-5">
          <div className="inline-block p-1.5 bg-white rounded-3xl shadow-2xl shadow-blue-500/20 border border-white/20 mb-2.5">
            <img
              src="/logo.png"
              alt="شعار حساباتي"
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-contain drop-shadow-sm"
            />
          </div>
          <p className="text-slate-300 text-xs sm:text-sm font-bold">
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
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="text-center">
                <h2 className="text-xl font-bold text-slate-100 flex items-center justify-center gap-2">
                  <Building2 className="w-5 h-5 text-amber-400" />
                  <span>تسجيل الدخول للمنشأة</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  سجل بحساب Google للتعرف على منشأتك والمستخدمين
                </p>
              </div>

              {/* Real Google Sign-In Primary Button */}
              <button
                type="button"
                onClick={handleRealGoogleSignIn}
                disabled={isLoading}
                className="w-full py-3.5 px-4 bg-white hover:bg-slate-100 text-slate-900 rounded-xl font-bold text-sm flex items-center justify-center gap-3 transition-all shadow-lg active:scale-98 cursor-pointer border border-slate-200"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                ) : (
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                )}
                <span>تسجيل الدخول الرسمي بحساب Google</span>
              </button>

              {/* Direct Gmail Input Option (100% Reliable & No Fake Accounts) */}
              <form onSubmit={handleManualEmailSubmit} className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs text-slate-300 font-bold">
                  <span className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-amber-400" />
                    <span>أو أدخل بريدك الإلكتروني لـ Gmail:</span>
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    id="manualGmailInput"
                    type="email"
                    required
                    value={manualEmail}
                    onChange={e => setManualEmail(e.target.value)}
                    placeholder="name@gmail.com"
                    className="flex-1 px-3.5 py-2.5 bg-slate-900/90 border border-slate-700 rounded-xl text-xs text-white dir-ltr text-right font-mono focus:border-amber-400 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-xl text-xs transition cursor-pointer shrink-0 shadow-md flex items-center gap-1"
                  >
                    <span>دخول</span>
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>

              {/* Only show real accounts previously used on this device (if any exist) */}
              {savedAccounts.length > 0 && (
                <div className="pt-2 border-t border-slate-700/60 space-y-2">
                  <span className="text-[11px] text-slate-400 font-bold block">
                    حساباتك المسجلة سابقاً على هذا الهاتف:
                  </span>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {savedAccounts.map(acc => (
                      <div
                        key={acc.email}
                        onClick={() => handleProcessEmail(acc.email, acc.name)}
                        className="p-2.5 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 rounded-xl flex items-center justify-between cursor-pointer transition select-none group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 font-black flex items-center justify-center text-xs shrink-0 border border-amber-500/30">
                            {acc.name ? acc.name.charAt(0).toUpperCase() : 'G'}
                          </div>
                          <div className="truncate">
                            <p className="text-xs font-bold text-white group-hover:text-amber-300 transition truncate">{acc.name}</p>
                            <p className="text-[10px] text-slate-400 dir-ltr text-right truncate">{acc.email}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => handleRemoveSavedAccount(acc.email, e)}
                          className="p-1 text-slate-500 hover:text-rose-400 transition cursor-pointer"
                          title="إزالة الحساب من هذا الهاتف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="relative flex items-center justify-center my-2">
                <div className="border-t border-slate-700/80 w-full"></div>
                <span className="bg-slate-800 px-3 text-xs text-slate-400 font-bold absolute rounded-full">أو</span>
              </div>

              {/* Create New Company Option for Owner */}
              <button
                type="button"
                onClick={() => {
                  setRegCompanyName('');
                  setRegOwnerName(manualEmail ? manualEmail.split('@')[0] : '');
                  setRegOwnerPassword('');
                  setSelectedEmail(manualEmail || '');
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
                    onChange={e => setSelectedEmail(e.target.value)}
                    required
                    placeholder="yourname@gmail.com"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-700 text-slate-200 font-mono text-xs dir-ltr text-right focus:border-amber-400 outline-none"
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
                    placeholder="مثال: مؤسسة النور للتجارة"
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
                    placeholder="اسمك كمدير للمنشأة"
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
    </div>
  );
};
