import React, { useState } from 'react';
import {
  Building2,
  Lock,
  User,
  ShieldCheck,
  Cloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  KeyRound,
  LogIn,
  Check
} from 'lucide-react';
import { User as AppUser, AppSettings } from '../types/accounting';
import { signInWithGoogle, signInManual, AuthSession } from '../services/firebaseAuth';
import { signInWithGoogleIdentity } from '../services/gisAuth';

interface LoginViewProps {
  settings: AppSettings;
  users: AppUser[];
  onLoginSuccess: (session: AuthSession) => void;
  onCancel?: () => void;
  canCancel?: boolean;
}

export const LoginView: React.FC<LoginViewProps> = ({
  settings,
  users,
  onLoginSuccess,
  onCancel,
  canCancel = false
}) => {
  const [activeTab, setActiveTab] = useState<'google' | 'manual'>('google');
  const [selectedUserId, setSelectedUserId] = useState<string>(users[0]?.id || '');
  const [customUsername, setCustomUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Handle Google Sign-in using Google Identity Services (Universal & Works on all mobile browsers/Vercel/Previews)
  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      // Direct GIS token client: works on every domain, mobile Chrome/Safari, PWA, Vercel
      // without needing domain whitelisting or triggering aggressive popup blockers
      try {
        const gisSession = await signInWithGoogleIdentity();
        onLoginSuccess(gisSession);
        return;
      } catch (gisErr: any) {
        if (
          gisErr?.message === 'popup_closed' ||
          gisErr?.message?.includes('closed')
        ) {
          setErrorMessage('تم إغلاق نافذة Google قبل اختيار الحساب. يمكنك النقر مجدداً للمتابعة.');
          return;
        }

        console.warn('GIS sign-in note, attempting Firebase popup fallback...', gisErr);
        // Fallback to Firebase popup
        const fbSession = await signInWithGoogle();
        onLoginSuccess(fbSession);
        return;
      }
    } catch (err: any) {
      if (
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request' ||
        err?.message === 'popup_closed' ||
        err?.message?.includes('closed')
      ) {
        setErrorMessage('تم إغلاق نافذة Google قبل إتمام العملية. يمكنك النقر مرة أخرى.');
      } else {
        console.warn('Google sign-in info:', err?.message || err);
        setErrorMessage(
          'إذا تم حظر النوافذ المنبثقة في متصفح هاتفك، يرجى السماح بها من إعدادات المتصفح، أو استخدم "تسجيل الدخول اليدوي" بالأسفل للمتابعة فوراً بدون أي قيود.'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Manual Login
  const handleManualLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      let targetUser = users.find(u => u.id === selectedUserId);
      if (!targetUser) {
        const finalName = customUsername.trim() || 'مدير النظام';
        targetUser = {
          id: `usr_${Date.now().toString(36)}`,
          name: finalName,
          username: customUsername.trim() || 'admin',
          role: 'مدير',
          active: true
        };
      }

      const session = signInManual(targetUser);
      onLoginSuccess(session);
    } catch (err: any) {
      setErrorMessage('تعذر تسجيل الدخول بالبيانات المدخلة.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 text-slate-100 font-sans relative select-none" dir="rtl">
      {/* Background glow styling */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-emerald-600/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 right-1/4 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative w-full max-w-md bg-white text-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden">
        {/* Brand Header */}
        <div className="bg-slate-900 text-white p-6 sm:p-7 text-center relative border-b border-slate-800">
          {canCancel && onCancel && (
            <button
              onClick={onCancel}
              className="absolute top-4 left-4 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl text-xs transition-colors cursor-pointer"
              title="إلغاء والعودة"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          )}

          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white text-black shadow-lg mb-3">
            <Building2 className="w-7 h-7" />
          </div>

          <h1 className="text-xl sm:text-2xl font-black tracking-tight">
            {settings.company || 'حساباتي المحاسبي المتكامل'}
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1">
            Hesabaty ERP - البوابة المحاسبية السحابية الآمنة
          </p>

          <div className="mt-4 flex items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <ShieldCheck className="w-3 h-3" />
              نظام مشفر ومحمي
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
              <Cloud className="w-3 h-3" />
              سحابي ومحلي
            </span>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="p-2.5 bg-slate-100 border-b border-slate-200 flex gap-2">
          <button
            type="button"
            onClick={() => { setActiveTab('google'); setErrorMessage(null); }}
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'google'
                ? 'bg-white text-slate-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>حساب Google (Gmail)</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('manual'); setErrorMessage(null); }}
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'manual'
                ? 'bg-white text-slate-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <User className="w-4 h-4" />
            <span>تسجيل دخول يدوي</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6">
          {errorMessage && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          {activeTab === 'google' ? (
            /* TAB 1: GOOGLE SIGN-IN */
            <div className="space-y-4">
              <div className="text-center space-y-1.5 mb-5">
                <h3 className="text-base font-black text-slate-900">
                  الدخول السحابي ومزامنة Google Drive
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  سجل دخولك بحساب الجيميل لتفعيل النسخ الاحتياطي السحابي التلقائي. عند فتح البرنامج على أي هاتف آخر بنفس الحساب، سيتعرف عليك النظام ويظهر جميع نسخك المحفوظة لاسترجاعها بنقرة واحدة!
                </p>
              </div>

              {/* Google Button */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="w-full py-3.5 px-4 bg-white hover:bg-slate-50 border-2 border-slate-300 hover:border-slate-400 text-slate-800 rounded-2xl font-bold text-sm flex items-center justify-center gap-3 transition-all shadow-xs hover:shadow-md cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-slate-600" />
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                )}
                <span>المتابعة باستخدام حساب Google (Gmail)</span>
              </button>

              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2 mt-4 text-[11px] text-slate-600">
                <div className="flex items-center gap-2 font-bold text-slate-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>مميزات ربط الجيميل:</span>
                </div>
                <ul className="space-y-1 pr-6 list-disc text-slate-500">
                  <li>حفظ وتخزين قواعد البيانات الاحتياطية في مجلد Google Drive الخاص بك بأمان.</li>
                  <li>إمكانية سحب النسخة على أي هاتف أو جهاز لوحي آخر بنفس الجيميل فوراً.</li>
                  <li>حماية تامة من ضياع البيانات أو استبدال الجهاز.</li>
                </ul>
              </div>
            </div>
          ) : (
            /* TAB 2: MANUAL LOGIN (Clean - No Demo Accounts) */
            <form onSubmit={handleManualLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  اسم المستخدم أو الحساب المسجل
                </label>
                {users && users.length > 0 ? (
                  <div className="space-y-2 mb-3">
                    {users.map(u => (
                      <label
                        key={u.id}
                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                          selectedUserId === u.id
                            ? 'border-black bg-slate-50 ring-1 ring-black'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="radio"
                            name="selected_user"
                            checked={selectedUserId === u.id}
                            onChange={() => {
                              setSelectedUserId(u.id);
                              setCustomUsername('');
                            }}
                            className="w-4 h-4 text-black focus:ring-0"
                          />
                          <div>
                            <div className="font-black text-xs text-slate-900">{u.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono">@{u.username}</div>
                          </div>
                        </div>
                        <span className="text-[10px] bg-slate-200/80 font-bold px-2 py-0.5 rounded text-slate-700">
                          {u.role}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : null}

                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    أو الدخول باسم مستخدم جديد:
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={customUsername}
                      onChange={e => {
                        setCustomUsername(e.target.value);
                        setSelectedUserId('');
                      }}
                      placeholder="اكتب اسم المستخدم أو اسمك..."
                      className="w-full px-3 py-2 pr-9 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-black outline-none transition-all"
                    />
                    <User className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  كلمة المرور / الرمز السري (اختياري)
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 pr-9 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:border-black outline-none transition-all"
                  />
                  <KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-black hover:bg-slate-800 text-white rounded-xl font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                <span>دخول النظام المحاسبي</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
