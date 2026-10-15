import React, { useState, useEffect } from 'react';
import {
  Lock,
  User,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  LogIn,
  Store,
  KeyRound,
  Eye,
  EyeOff,
  Cloud,
  Building2,
  Search,
  Sparkles,
  Mail,
  UserPlus,
  Smartphone,
  Users
} from 'lucide-react';
import { User as AppUser, AppSettings, AccountingDB } from '../types/accounting';
import { AuthSession, auth, googleProvider } from '../services/firebaseAuth';
import { signInWithPopup } from 'firebase/auth';
import { loadDatabase, saveDatabase } from '../services/accountingStorage';
import { fetchDatabaseFromCloud, pushDatabaseToCloud } from '../services/cloudSyncService';
import { countActivePermissions, TOTAL_SYSTEM_PERMISSIONS_COUNT } from './SystemViews';

interface LoginViewProps {
  settings: AppSettings;
  users?: AppUser[];
  onLoginSuccess: (session: AuthSession, tenantDb?: AccountingDB) => void;
  onCancel?: () => void;
  canCancel?: boolean;
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
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  const [activeTab, setActiveTab] = useState<'google' | 'employees'>('google');
  
  // Google sign in states
  const [googleUser, setGoogleUser] = useState<{ email: string; displayName?: string; photoURL?: string } | null>(null);
  const [manualGmail, setManualGmail] = useState('');
  const [manualName, setManualName] = useState('');
  const [showManualGmailForm, setShowManualGmailForm] = useState(false);

  // Employee login states
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Determine available users from cloudDb first, then propUsers, then currentDb, then fallback
  const rawUsers: AppUser[] = (cloudDb?.users && cloudDb.users.length > 0)
    ? cloudDb.users
    : (propUsers && propUsers.length > 0)
    ? propUsers
    : (currentDb.users && currentDb.users.length > 0)
    ? currentDb.users
    : [
        {
          id: 'usr_admin',
          name: 'المدير العام (أدمن)',
          username: 'admin',
          role: 'مدير',
          active: true
        },
        {
          id: 'usr_cashier1',
          name: 'كاشير المحل',
          username: 'cashier',
          role: 'كاشير',
          active: true
        },
        {
          id: 'usr_sales1',
          name: 'مسؤول المبيعات',
          username: 'sales',
          role: 'مبيعات',
          active: true
        },
        {
          id: 'usr_stock1',
          name: 'أمين المخزن',
          username: 'stock',
          role: 'مخزن',
          active: true
        }
      ];

  const companyName = cloudDb?.settings.company || settings.company || currentDb.settings.company || 'حساباتي';

  useEffect(() => {
    if (!selectedUserId && rawUsers.length > 0) {
      setSelectedUserId(rawUsers[0].id);
    }
  }, [rawUsers, selectedUserId]);

  // Fetch latest cloud database from Firestore upon opening login screen
  useEffect(() => {
    let isMounted = true;
    setIsLoadingCloud(true);
    fetchDatabaseFromCloud().then(remoteDb => {
      if (!isMounted) return;
      setIsLoadingCloud(false);
      if (remoteDb && Array.isArray(remoteDb.users) && remoteDb.users.length > 0) {
        setCloudDb(remoteDb);
        if (!remoteDb.users.some(u => u.id === selectedUserId)) {
          setSelectedUserId(remoteDb.users[0].id);
        }
      }
    }).catch(err => {
      if (!isMounted) return;
      setIsLoadingCloud(false);
      console.warn('Initial cloud database fetch notice in LoginView:', err);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredUsers = rawUsers.filter(u => {
    if (!userSearchTerm.trim()) return true;
    const s = userSearchTerm.trim().toLowerCase();
    return (
      u.name.toLowerCase().includes(s) ||
      u.username.toLowerCase().includes(s) ||
      u.role.toLowerCase().includes(s) ||
      (u.branchName && u.branchName.toLowerCase().includes(s))
    );
  });

  const selectedUser = rawUsers.find(u => u.id === selectedUserId) || rawUsers[0];

  // Helper to complete login session and save database
  const completeLogin = (userToLogin: AppUser, activeDb: AccountingDB, googleInfo?: { email?: string; photo?: string }) => {
    const updatedUser: AppUser = {
      ...userToLogin,
      lastLogin: new Date().toISOString()
    };

    if (!activeDb.users) activeDb.users = [];
    const idx = activeDb.users.findIndex(u => u.id === userToLogin.id);
    if (idx >= 0) {
      activeDb.users[idx] = updatedUser;
    } else {
      activeDb.users.unshift(updatedUser);
    }
    activeDb.currentUser = updatedUser;

    saveDatabase(activeDb);
    // Push update to cloud asynchronously
    pushDatabaseToCloud(activeDb).catch(() => {});

    const session: AuthSession = {
      user: updatedUser,
      isGoogle: !!googleInfo?.email,
      googleEmail: googleInfo?.email,
      googlePhoto: googleInfo?.photo,
      companyName: activeDb.settings.company || 'حساباتي'
    };

    localStorage.setItem('hesabaty_active_user', JSON.stringify(session));

    setTimeout(() => {
      setIsLoading(false);
      onLoginSuccess(session, activeDb);
    }, 250);
  };

  // 1. One-click Sign-in / Account Creation via Google Popup
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessNotice(null);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = result.user.email || '';
      const displayName = result.user.displayName || email.split('@')[0] || 'مدير الحساب';

      setGoogleUser({
        email,
        displayName,
        photoURL: result.user.photoURL || undefined
      });

      // Load latest database
      const remoteDb = await fetchDatabaseFromCloud();
      const activeDb = remoteDb || currentDb;
      if (remoteDb) setCloudDb(remoteDb);

      // Check if user already exists
      let matched = activeDb.users?.find(u => 
        u.username.toLowerCase() === email.toLowerCase() ||
        u.name.toLowerCase() === displayName.toLowerCase() ||
        u.username.toLowerCase() === email.split('@')[0].toLowerCase()
      );

      if (!matched) {
        // Create new account as Manager with full permissions immediately!
        const newUserId = 'usr_' + Math.random().toString(36).slice(2, 9);
        matched = {
          id: newUserId,
          name: displayName,
          username: email,
          role: 'مدير',
          active: true,
          branchName: activeDb.branches?.[0]?.name || 'الفرع الرئيسي',
          branchId: activeDb.branches?.[0]?.id || 'br_main',
          lastLogin: new Date().toISOString()
        };
        activeDb.users.unshift(matched);
        setSuccessNotice(`✓ مرحباً بك! تم إنشاء حساب جديد كمدير للمنشأة بنجاح بالبريد ${email}`);
      } else {
        setSuccessNotice(`✓ تم التعرف على حسابك كـ (${matched.name} - ${matched.role})`);
      }

      completeLogin(matched, activeDb, { email, photo: result.user.photoURL || undefined });
    } catch (err: any) {
      setIsLoading(false);
      console.warn('Google sign in error notice:', err);
      if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/unauthorized-domain' || err?.code === 'auth/operation-not-allowed') {
        setShowManualGmailForm(true);
        setErrorMessage('تم حجب النافذة المنبثقة لـ Google أو النطاق غير مصرح. يمكنك كتابة بريدك الـ Gmail واسمك في الحقل أدناه للدخول أو إنشاء الحساب فوراً!');
      } else if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        setShowManualGmailForm(true);
        setErrorMessage('تعذر فتح نافذة Google تلقائياً. يمكنك إدخال بريدك الـ Gmail أدناه للدخول أو إنشاء الحساب فوراً.');
      }
    }
  };

  // 2. Direct Gmail Input Sign-in / Creation (100% reliable fallback for all devices & Vercel)
  const handleManualGmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessNotice(null);

    const emailTrimmed = manualGmail.trim().toLowerCase();
    if (!emailTrimmed || !emailTrimmed.includes('@')) {
      setErrorMessage('يرجى إدخال بريد إلكتروني صحيح (مثل: name@gmail.com)');
      return;
    }

    setIsLoading(true);

    try {
      const activeDb = cloudDb || currentDb;
      const effectiveUsers = activeDb.users || rawUsers;
      const displayName = manualName.trim() || emailTrimmed.split('@')[0] || 'مدير الحساب';

      // Check if user exists
      let matched = effectiveUsers.find(u => 
        u.username.toLowerCase() === emailTrimmed ||
        u.username.toLowerCase() === emailTrimmed.split('@')[0]
      );

      if (!matched) {
        // Create new account with full permissions
        const newUserId = 'usr_' + Math.random().toString(36).slice(2, 9);
        matched = {
          id: newUserId,
          name: displayName,
          username: emailTrimmed,
          role: 'مدير',
          active: true,
          branchName: activeDb.branches?.[0]?.name || 'الفرع الرئيسي',
          branchId: activeDb.branches?.[0]?.id || 'br_main',
          lastLogin: new Date().toISOString()
        };
        activeDb.users.unshift(matched);
        setSuccessNotice(`✓ تم إنشاء حساب مدير جديد بنجاح للبريد ${emailTrimmed}!`);
      } else {
        setSuccessNotice(`✓ مرحباً بعودتك! تم تسجيل الدخول بنجاح لحساب ${matched.name}.`);
      }

      completeLogin(matched, activeDb, { email: emailTrimmed });
    } catch (err: any) {
      console.error('Manual Gmail login error:', err);
      setIsLoading(false);
      setErrorMessage('حدث خطأ أثناء الدخول. يرجى إعادة المحاولة.');
    }
  };

  // 3. Employee local password login
  const handleEmployeeLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const activeDb = cloudDb || currentDb;
      const effectiveUsers = activeDb.users || rawUsers;
      const targetUser = effectiveUsers.find(u => u.id === selectedUserId) || effectiveUsers[0];

      if (!targetUser) {
        setErrorMessage('يرجى اختيار اسم المستخدم للدخول.');
        setIsLoading(false);
        return;
      }

      // If user has a set password, verify it
      if (targetUser.password && targetUser.password.trim() !== '') {
        if (password !== targetUser.password) {
          setErrorMessage('كلمة المرور غير صحيحة لهذا المستخدم. يرجى التأكد وإعادة المحاولة.');
          setIsLoading(false);
          return;
        }
      }

      completeLogin(targetUser, activeDb);
    } catch (err: any) {
      console.error('Login error:', err);
      setErrorMessage('حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة مرة أخرى.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900/85 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-6 text-right font-sans select-none relative overflow-y-auto">
      {/* Background Watermark */}
      <div 
        className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center opacity-5 select-none"
        aria-hidden="true"
      >
        <img src="/icon.svg" alt="" className="w-[500px] h-[500px] object-contain" />
      </div>

      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden relative z-10 my-4 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-5 sm:p-6 text-center border-b border-slate-800 relative">
          {canCancel && onCancel && (
            <button
              onClick={onCancel}
              className="absolute left-4 top-4 text-xs font-bold text-slate-400 hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
            >
              إلغاء
            </button>
          )}

          <div className="w-12 h-12 bg-white rounded-2xl mx-auto flex items-center justify-center shadow-lg border border-slate-200 p-1 mb-2">
            <img src="/icon.svg" alt="شعار حساباتي" className="w-full h-full object-contain" />
          </div>

          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center justify-center gap-1.5">
            <span>برنامج حساباتي</span>
          </h1>
          <p className="text-xs text-slate-300 font-medium mt-0.5">
            نظام إدارة الحسابات السحابي متعدد الأجهزة والفروع
          </p>

          <div className="mt-2.5 flex items-center justify-center gap-2 flex-wrap">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <Store className="w-3.5 h-3.5" />
              <span>المنشأة: {companyName}</span>
            </div>

            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
              <Cloud className="w-3 h-3 text-blue-400" />
              <span>مزامنة سحابية مباشرة ⚡</span>
            </div>
          </div>

          {/* Mode Switch Tabs */}
          <div className="mt-4 flex bg-slate-800/80 p-1 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setActiveTab('google');
                setErrorMessage(null);
              }}
              className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'google'
                  ? 'bg-blue-600 text-white shadow-xs font-black'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>دخول / إنشاء حساب بـ Google & Gmail</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('employees');
                setErrorMessage(null);
              }}
              className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'employees'
                  ? 'bg-white text-slate-900 shadow-xs font-black'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>مستخدمي المنشأة (كلمة السر)</span>
            </button>
          </div>
        </div>

        {/* Login Body */}
        <div className="p-4 sm:p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          {successNotice && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-start gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span className="leading-relaxed">{successNotice}</span>
            </div>
          )}

          {/* TAB 1: GOOGLE & GMAIL SIGN-IN / ACCOUNT CREATION */}
          {activeTab === 'google' && (
            <div className="space-y-3.5">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50/50 p-3.5 rounded-2xl border border-blue-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-blue-600" />
                    <span>تسجيل الدخول أو إنشاء حساب فوري:</span>
                  </span>
                  <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold">
                    مدير المنشأة
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                  اضغط أدناه لاختيار أي حساب Gmail مسجل على هاتفك، سيتعرف النظام عليه فورياً وينشئ حسابك بكامل الصلاحيات:
                </p>

                {/* Main 1-Click Google Popup Button */}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isLoading}
                  className="w-full py-3 px-4 bg-white hover:bg-slate-50 text-slate-900 border-2 border-slate-300 hover:border-blue-500 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2.5 shadow-xs cursor-pointer"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  ) : (
                    <img
                      src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                      alt="Google"
                      className="w-5 h-5 shrink-0"
                    />
                  )}
                  <span>دخول / إنشاء حساب فوري بـ Google (ضغطة واحدة)</span>
                </button>
              </div>

              {/* Toggle manual Gmail form if needed or on mobile */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowManualGmailForm(prev => !prev)}
                  className="w-full py-2 text-center text-xs font-bold text-blue-700 hover:text-blue-900 hover:underline flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>{showManualGmailForm ? 'إخفاء كتابة Gmail اليدوية' : 'كتابة بريد Gmail مباشرة (بدون نافذة منبثقة)'}</span>
                </button>

                {showManualGmailForm && (
                  <form onSubmit={handleManualGmailSubmit} className="mt-2 bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-3 animate-in fade-in slide-in-from-top-2">
                    <div className="text-[11px] font-bold text-slate-700">
                      أدخل بريدك الإلكتروني لـ Gmail للدخول أو إنشاء حسابك فورياً:
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">
                        بريد Gmail الخاص بك:
                      </label>
                      <input
                        type="email"
                        required
                        dir="ltr"
                        value={manualGmail}
                        onChange={e => setManualGmail(e.target.value)}
                        placeholder="yourname@gmail.com"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono outline-none focus:border-blue-600"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">
                        اسمك أو اسم المنشأة (اختياري):
                      </label>
                      <input
                        type="text"
                        value={manualName}
                        onChange={e => setManualName(e.target.value)}
                        placeholder="مثال: المدير العام"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs outline-none focus:border-blue-600"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                      ) : (
                        <UserPlus className="w-4 h-4" />
                      )}
                      <span>✓ إنشاء الحساب والدخول بـ Gmail فوراً</span>
                    </button>
                  </form>
                )}
              </div>

              {/* Instructions banner */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-[11px] text-slate-600 space-y-1">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>مميزات حساب Google & Gmail:</span>
                </div>
                <p className="leading-relaxed text-[10px] text-slate-500">
                  • يتم منحك تلقائياً دور «المدير» مع كافة الصلاحيات الـ 44 في النظام.<br />
                  • يتعرف النظام على هاتفك ويربطه تلقائياً بالسحابة لمزامنة فواتيرك وحركاتك فورياً مع كافة الهواتف الأخرى.<br />
                  • لا تفقد بياناتك عند تغيير الهاتف أو مسح المتصفح.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: COMPANY EMPLOYEES & PASSWORD */}
          {activeTab === 'employees' && (
            <form onSubmit={handleEmployeeLogin} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-blue-600" />
                    <span>اختر الموظف للدخول بصلاحياته:</span>
                  </label>
                  {isLoadingCloud && (
                    <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin text-emerald-600" />
                      <span>تحديث القائمة...</span>
                    </span>
                  )}
                </div>

                {/* Quick Search if more than 3 users */}
                {rawUsers.length > 3 && (
                  <div className="relative mb-2">
                    <input
                      type="text"
                      value={userSearchTerm}
                      onChange={e => setUserSearchTerm(e.target.value)}
                      placeholder="ابحث بالاسم أو الدور أو الفرع..."
                      className="w-full px-3 py-1.5 pr-8 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-black"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
                  </div>
                )}

                {/* Users Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-0.5">
                  {filteredUsers.map(u => {
                    const isSelected = selectedUserId === u.id;
                    const activePermsCount = countActivePermissions(u);

                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setSelectedUserId(u.id);
                          setErrorMessage(null);
                        }}
                        className={`p-3 rounded-2xl border text-right transition-all flex flex-col gap-1 cursor-pointer select-none ${
                          isSelected
                            ? 'border-emerald-600 bg-emerald-50/80 ring-2 ring-emerald-500/20 shadow-xs'
                            : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-black truncate ${isSelected ? 'text-emerald-950' : 'text-slate-900'}`}>
                            {u.name}
                          </span>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-600 font-bold mt-0.5">
                          <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                            {u.role}
                          </span>
                          <span className="text-emerald-700 font-mono text-[9px]">
                            {activePermsCount === TOTAL_SYSTEM_PERMISSIONS_COUNT ? 'كامل الصلاحيات' : `${activePermsCount} صلاحية`}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[9px] text-slate-500 font-medium pt-0.5">
                          <span className="flex items-center gap-1 text-blue-700 font-bold truncate max-w-[120px]">
                            <Building2 className="w-2.5 h-2.5" />
                            {u.branchName || 'الفرع الرئيسي'}
                          </span>
                          <span>{u.password ? '• محمي بكلمة سر' : '• دخول مباشر'}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Password Field */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-800">
                    كلمة المرور:
                  </label>
                  <span className="text-[10px] text-slate-400">
                    {selectedUser?.password ? 'مطلوبة لهذا الحساب' : 'فارغ إذا لم يتم تعيينها من المدير'}
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2.5 pr-9 pl-9 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-black outline-none transition-all font-mono"
                  />
                  <KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-3 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-slate-950 hover:bg-slate-800 text-white rounded-xl font-black text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-1"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <LogIn className="w-4 h-4 text-emerald-400" />
                )}
                <span>دخول إلى صفحتي بصلاحياتي ({selectedUser?.name || 'المستخدم'})</span>
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-center text-[10px] text-slate-400 font-bold">
          حساباتي • برنامج إدارة الحسابات السحابي المتزامن © 2026
        </div>
      </div>
    </div>
  );
};
