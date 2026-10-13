import React, { useState } from 'react';
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
  EyeOff
} from 'lucide-react';
import { User as AppUser, AppSettings, AccountingDB } from '../types/accounting';
import { signInManual, AuthSession } from '../services/firebaseAuth';
import { loadDatabase, saveDatabase } from '../services/accountingStorage';

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
  // Load current users from DB or fallback
  const currentDb = loadDatabase();
  const availableUsers: AppUser[] = (propUsers && propUsers.length > 0)
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

  const [selectedUserId, setSelectedUserId] = useState<string>(availableUsers[0]?.id || '');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedUser = availableUsers.find(u => u.id === selectedUserId) || availableUsers[0];

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (!selectedUser) {
        setErrorMessage('يرجى اختيار المستخدم للدخول.');
        setIsLoading(false);
        return;
      }

      // If user has a set password, verify it (if not set or empty, allow direct login)
      if (selectedUser.password && selectedUser.password.trim() !== '') {
        if (password !== selectedUser.password) {
          setErrorMessage('كلمة المرور غير صحيحة لهذا المستخدم. يرجى التأكد وإعادة المحاولة.');
          setIsLoading(false);
          return;
        }
      }

      // Update user last login
      const updatedUser: AppUser = {
        ...selectedUser,
        lastLogin: new Date().toISOString()
      };

      const userIdx = currentDb.users.findIndex(u => u.id === selectedUser.id);
      if (userIdx >= 0) {
        currentDb.users[userIdx] = updatedUser;
      } else {
        currentDb.users.push(updatedUser);
      }
      currentDb.currentUser = updatedUser;
      saveDatabase(currentDb);

      const session: AuthSession = {
        user: updatedUser,
        isGoogle: false,
        companyName: currentDb.settings.company || 'حساباتي'
      };

      setTimeout(() => {
        setIsLoading(false);
        onLoginSuccess(session, currentDb);
      }, 350);
    } catch (err: any) {
      console.error('Login error:', err);
      setErrorMessage('حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة مرة أخرى.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 text-right font-sans select-none relative overflow-hidden">
      {/* Background Hesabaty Watermark */}
      <div 
        className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center opacity-[0.06] select-none"
        aria-hidden="true"
      >
        <img src="/icon.svg" alt="" className="w-[600px] h-[600px] object-contain invert brightness-200" />
      </div>

      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200 relative z-10">
        
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
            تسجيل دخول المستخدمين • نظام حسابات المحل والفروع
          </p>

          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <Store className="w-3.5 h-3.5" />
            <span>{settings.company || 'حساباتي الشخصي'}</span>
          </div>
        </div>

        {/* Login Form */}
        <div className="p-6">
          {errorMessage && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* 1. Pick User from Fast Cards or Select */}
            <div>
              <label className="block text-xs font-black text-slate-900 mb-2">
                اختر اسم المستخدم:
              </label>

              <div className="grid grid-cols-2 gap-2 mb-2">
                {availableUsers.map(u => {
                  const isSelected = selectedUserId === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setSelectedUserId(u.id);
                        setErrorMessage(null);
                      }}
                      className={`p-2.5 rounded-xl border text-right transition-all flex flex-col gap-0.5 cursor-pointer ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/20 shadow-xs'
                          : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-black truncate ${isSelected ? 'text-emerald-950' : 'text-slate-900'}`}>
                          {u.name}
                        </span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold mt-0.5">
                        <span>{u.role}</span>
                        {u.branchName && (
                          <span className="text-blue-600 text-[9px] truncate max-w-[80px]">
                            {u.branchName}
                          </span>
                        )}
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
                  {selectedUser?.password ? 'مطلوبة لهذا الحساب' : 'اتركها فارغة إذا لم يتم تعيينها'}
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
              className="w-full py-3 bg-slate-950 hover:bg-slate-800 text-white rounded-xl font-black text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              <span>دخول إلى حساباتي بصفة ({selectedUser?.name || 'المستخدم'})</span>
            </button>
          </form>

          {/* User Role & Permission Guidance */}
          <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600 space-y-1">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>الصلاحيات والخصوصية:</span>
            </div>
            <p className="leading-relaxed">
              يدخل كل مستخدم من هاتفه الشخصي بصلاحياته المحددة (فواتير، مبيعات، كاشير، تقارير، أو إدارة كاملة للمدير)، وتسجل كل فاتورة باسم من أنشأها تلقائياً.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-center text-[10px] text-slate-400 font-bold">
          حساباتي • برنامج إدارة الحسابات الشخصي والفروع © 2026
        </div>
      </div>
    </div>
  );
};
