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
  Sparkles
} from 'lucide-react';
import { User as AppUser, AppSettings, AccountingDB } from '../types/accounting';
import { AuthSession, auth, googleProvider } from '../services/firebaseAuth';
import { signInWithPopup } from 'firebase/auth';
import { loadDatabase, saveDatabase } from '../services/accountingStorage';
import { fetchDatabaseFromCloud } from '../services/cloudSyncService';
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
  const [googleUser, setGoogleUser] = useState<{ email: string; displayName?: string; photoURL?: string } | null>(null);
  const [userSearchTerm, setUserSearchTerm] = useState('');

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

  const [selectedUserId, setSelectedUserId] = useState<string>(rawUsers[0]?.id || '');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch latest cloud database from Firestore upon opening login screen
  useEffect(() => {
    let isMounted = true;
    setIsLoadingCloud(true);
    fetchDatabaseFromCloud().then(remoteDb => {
      if (!isMounted) return;
      setIsLoadingCloud(false);
      if (remoteDb && Array.isArray(remoteDb.users) && remoteDb.users.length > 0) {
        setCloudDb(remoteDb);
        // If current selection is not valid in remoteDb, pick first
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

  // Sign in with Google / Gmail to recognize company and identify employee's device
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = result.user.email || '';
      const displayName = result.user.displayName || email.split('@')[0];
      setGoogleUser({
        email,
        displayName,
        photoURL: result.user.photoURL || undefined
      });

      // Fetch latest cloud database to connect this phone
      const remoteDb = await fetchDatabaseFromCloud();
      const effectiveDb = remoteDb || currentDb;
      if (remoteDb) {
        setCloudDb(remoteDb);
      }

      // Check if user already exists with this email or username
      const matched = effectiveDb.users?.find(u => 
        u.username.toLowerCase() === email.toLowerCase() ||
        (u.name.toLowerCase() === displayName.toLowerCase()) ||
        u.username.toLowerCase() === email.split('@')[0].toLowerCase()
      );

      if (matched) {
        setSelectedUserId(matched.id);
      } else if (effectiveDb.users && effectiveDb.users.length > 0) {
        setSelectedUserId(effectiveDb.users[0].id);
      }

      setIsLoading(false);
    } catch (err: any) {
      setIsLoading(false);
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        console.warn('Google sign in notice:', err);
        setErrorMessage('تعذر الاتصال بـ Google. يمكنك اختيار اسمك وكتابة كلمة المرور للدخول مباشرة.');
      }
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const activeDb = cloudDb || currentDb;
      const effectiveUsers = (cloudDb?.users && cloudDb.users.length > 0) ? cloudDb.users : rawUsers;
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

      // Update user last login
      const updatedUser: AppUser = {
        ...targetUser,
        lastLogin: new Date().toISOString()
      };

      const userIdx = activeDb.users.findIndex(u => u.id === targetUser.id);
      if (userIdx >= 0) {
        activeDb.users[userIdx] = updatedUser;
      } else {
        activeDb.users.push(updatedUser);
      }
      activeDb.currentUser = updatedUser;
      saveDatabase(activeDb);

      const session: AuthSession = {
        user: updatedUser,
        isGoogle: !!googleUser,
        googleEmail: googleUser?.email,
        googlePhoto: googleUser?.photoURL,
        companyName: activeDb.settings.company || 'حساباتي'
      };

      localStorage.setItem('hesabaty_active_user', JSON.stringify(session));

      setTimeout(() => {
        setIsLoading(false);
        onLoginSuccess(session, activeDb);
      }, 300);
    } catch (err: any) {
      console.error('Login error:', err);
      setErrorMessage('حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة مرة أخرى.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 text-right font-sans select-none relative overflow-hidden">
      {/* Background Watermark */}
      <div 
        className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center opacity-[0.06] select-none"
        aria-hidden="true"
      >
        <img src="/icon.svg" alt="" className="w-[600px] h-[600px] object-contain invert brightness-200" />
      </div>

      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200 relative z-10">
        
        {/* Header with Hesabaty Logo and Branding */}
        <div className="bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white p-6 text-center relative border-b border-slate-800">
          {canCancel && onCancel && (
            <button
              onClick={onCancel}
              className="absolute top-4 left-4 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl text-xs transition-colors cursor-pointer"
              title="إغلاق والعودة"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          )}

          {/* Official Hesabaty Logo Icon */}
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white shadow-xl mb-3 border-2 border-emerald-500/30 overflow-hidden p-1">
            <img
              src="/icon.svg"
              alt="لوجو حساباتي"
              className="w-full h-full object-contain"
            />
          </div>

          <h1 className="text-2xl font-black tracking-tight text-white flex items-center justify-center gap-1.5">
            <span>برنامج حساباتي</span>
          </h1>
          <p className="text-xs text-slate-300 font-medium mt-1">
            نظام إدارة الحسابات السحابي متعدد الأجهزة والفروع
          </p>

          <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <Store className="w-3.5 h-3.5" />
              <span>المنشأة: {companyName}</span>
            </div>

            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
              <Cloud className="w-3 h-3 text-blue-400" />
              <span>مزامنة سحابية مباشرة ⚡</span>
            </div>
          </div>
        </div>

        {/* Login Body */}
        <div className="p-5 sm:p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          {/* Google / Gmail Sync Button for Personal Phones */}
          {!googleUser ? (
            <div className="bg-gradient-to-r from-slate-50 to-blue-50/50 p-3.5 rounded-2xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>دخول هاتف الموظف بحساب Google:</span>
                </span>
                <span className="text-[10px] text-slate-500 font-bold">اختياري للتعرف السريع</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                سجّل بجيميل هاتفك الشخصي ليتعرف النظام على الشركة ويربط جهازك بقاعدة البيانات السحابية فورياً:
              </p>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2.5 shadow-2xs cursor-pointer hover:border-blue-400"
              >
                <img
                  src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                  alt="Google"
                  className="w-4 h-4"
                />
                <span>تسجيل الدخول والتعرف على الشركة عبر Google / Gmail</span>
              </button>
            </div>
          ) : (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs font-bold text-emerald-900">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <div className="font-black">متصل بـ Google: {googleUser.email}</div>
                  <div className="text-[10px] text-emerald-700 font-medium">
                    تم التعرف على منشأة «{companyName}». اختر اسمك من القائمة أدناه للدخول.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGoogleUser(null)}
                className="text-[10px] text-slate-500 hover:text-slate-800 underline cursor-pointer"
              >
                تغيير
              </button>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* 1. Pick User from Fast Cards or Select */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-blue-600" />
                  <span>اختر اسم المستخدم من موظفي المنشأة:</span>
                </label>
                {isLoadingCloud && (
                  <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin text-emerald-600" />
                    <span>تحديث القائمة سحابياً...</span>
                  </span>
                )}
              </div>

              {/* Quick Search if more than 4 users */}
              {rawUsers.length > 4 && (
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

            {/* 2. Password Field */}
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

          {/* Realtime Sync & Permissions Guidance Banner */}
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-[11px] text-slate-600 space-y-1.5">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>مزامنة فورية متعددة الهواتف وحماية البيانات:</span>
            </div>
            <p className="leading-relaxed text-[10px] text-slate-500">
              • كل هاتف محمول يدخل باسم الموظف وصلاحياته المحددة (كاشير، مبيعات، مخزن، محاسب، أو مدير).<br />
              • أي حركة أو فاتورة تحفظ تظهر تلقائياً لجميع المستخدمين الآخرين حسب صلاحياتهم.<br />
              • لا تمسح أي حركة تلقائياً نهائياً، والحذف أو التعديل مقتصر على صلاحيات المدير فقط.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-center text-[10px] text-slate-400 font-bold">
          حساباتي • برنامج إدارة الحسابات السحابي المتزامن © 2026
        </div>
      </div>
    </div>
  );
};
