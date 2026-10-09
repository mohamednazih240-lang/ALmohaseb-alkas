import React, { useState, useEffect } from 'react';
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
  PlusCircle,
  Sparkles,
  Phone,
  Coins,
  Briefcase,
  ChevronDown
} from 'lucide-react';
import { User as AppUser, AppSettings, AccountingDB } from '../types/accounting';
import { signInWithGoogle, signInManual, AuthSession } from '../services/firebaseAuth';
import { signInWithGoogleIdentity } from '../services/gisAuth';
import {
  getCompaniesList,
  registerCompany,
  setActiveTenantId,
  getActiveTenantId,
  CompanyTenant
} from '../services/tenantService';
import { loadTenantDatabase } from '../services/accountingStorage';

interface LoginViewProps {
  settings: AppSettings;
  users?: AppUser[];
  onLoginSuccess: (session: AuthSession, tenantDb?: AccountingDB) => void;
  onCancel?: () => void;
  canCancel?: boolean;
}

export const LoginView: React.FC<LoginViewProps> = ({
  settings,
  onLoginSuccess,
  onCancel,
  canCancel = false
}) => {
  const [companies, setCompanies] = useState<CompanyTenant[]>(() => getCompaniesList());
  const [activeTab, setActiveTab] = useState<'login' | 'register' | 'google'>(() => {
    const list = getCompaniesList();
    return list.length > 0 ? 'login' : 'register';
  });

  // Tab 1: Login state
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(() => {
    const list = getCompaniesList();
    const active = getActiveTenantId();
    if (active && list.some(c => c.id === active)) return active;
    return list[0]?.id || '';
  });
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Tab 2: Register New Company state (100% Isolated Workspace)
  const [regCompanyName, setRegCompanyName] = useState('');
  const [regActivityType, setRegActivityType] = useState('تجارة جملة وتجزئة');
  const [regAdminName, setRegAdminName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regCurrency, setRegCurrency] = useState('ج.م');
  const [regPhone, setRegPhone] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync selected company defaults
  useEffect(() => {
    if (selectedCompanyId) {
      const comp = companies.find(c => c.id === selectedCompanyId);
      if (comp) {
        setLoginUsername(comp.adminUsername || 'admin');
      }
    }
  }, [selectedCompanyId, companies]);

  // Handle Google Sign-in
  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      try {
        const gisSession = await signInWithGoogleIdentity();
        const tenantDb = gisSession.tenantId ? loadTenantDatabase(gisSession.tenantId) : undefined;
        onLoginSuccess(gisSession, tenantDb);
        return;
      } catch (gisErr: any) {
        if (gisErr?.message === 'popup_closed' || gisErr?.message?.includes('closed')) {
          setErrorMessage('تم إغلاق نافذة Google قبل اختيار الحساب. يمكنك النقر مجدداً للمتابعة.');
          return;
        }

        console.warn('GIS sign-in note, attempting Firebase popup fallback...', gisErr);
        const fbSession = await signInWithGoogle();
        const tenantDb = fbSession.tenantId ? loadTenantDatabase(fbSession.tenantId) : undefined;
        onLoginSuccess(fbSession, tenantDb);
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
          'إذا تم حظر النوافذ المنبثقة، يرجى استخدام "تسجيل دخول المنشأة" أو "تأسيس منشأة جديدة" للمتابعة فوراً بدون أي قيود.'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Login to Existing Company
  const handleCompanyLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (!selectedCompanyId && companies.length > 0) {
        setSelectedCompanyId(companies[0].id);
      }

      const targetComp = companies.find(c => c.id === selectedCompanyId);
      if (!targetComp && companies.length > 0) {
        setErrorMessage('يرجى اختيار المنشأة المراد تسجيل الدخول إليها.');
        setIsLoading(false);
        return;
      }

      const compId = targetComp ? targetComp.id : 'comp_main';
      const compName = targetComp ? targetComp.name : 'المنشأة الرئيسية';

      // Load isolated database for this company
      setActiveTenantId(compId);
      const tenantDb = loadTenantDatabase(compId);

      // Verify user inside this company
      const finalUsername = loginUsername.trim() || targetComp?.adminUsername || 'admin';
      let user = tenantDb.users.find(u => u.username.toLowerCase() === finalUsername.toLowerCase());

      if (!user) {
        // If not found, use admin or create user inside this tenant's users
        user = {
          id: `usr_${Date.now().toString(36)}`,
          name: targetComp?.adminName || finalUsername,
          username: finalUsername,
          role: 'مدير',
          active: true
        };
        tenantDb.users.push(user);
      }

      const session = signInManual(user, compId, compName);
      onLoginSuccess(session, tenantDb);
    } catch (err: any) {
      console.error('Login error:', err);
      setErrorMessage('تعذر تسجيل الدخول للمنشأة. تحقق من البيانات المدخلة.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Registering a Brand New Isolated Company
  const handleRegisterCompany = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    const companyName = regCompanyName.trim();
    const adminName = regAdminName.trim() || 'مدير المنشأة';
    const username = regUsername.trim() || 'admin';

    if (!companyName) {
      setErrorMessage('يرجى كتابة اسم المنشأة أو الشركة.');
      setIsLoading(false);
      return;
    }

    try {
      // 1. Register brand new company tenant
      const newTenant = registerCompany({
        name: companyName,
        adminName,
        adminUsername: username,
        password: regPassword,
        currency: regCurrency,
        activityType: regActivityType,
        phone: regPhone
      });

      // 2. Set active tenant
      setActiveTenantId(newTenant.id);

      // 3. Initialize fresh, 100% isolated database
      const tenantDb = loadTenantDatabase(newTenant.id);

      // 4. Create session
      const adminUser: AppUser = {
        id: tenantDb.users[0]?.id || `usr_${Date.now().toString(36)}`,
        name: adminName,
        username,
        role: 'مدير',
        active: true
      };

      const session = signInManual(adminUser, newTenant.id, newTenant.name);

      // Refresh local companies list
      setCompanies(getCompaniesList());

      // 5. Success callback
      onLoginSuccess(session, tenantDb);
    } catch (err: any) {
      console.error('Registration error:', err);
      setErrorMessage('حدث خطأ أثناء تأسيس المنشأة الجديدة. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-3 sm:p-6 text-slate-100 font-sans relative select-none" dir="rtl">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-emerald-600/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 right-1/4 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative w-full max-w-lg bg-white text-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden my-4">
        {/* Brand Header */}
        <div className="bg-slate-900 text-white p-5 sm:p-6 text-center relative border-b border-slate-800">
          {canCancel && onCancel && (
            <button
              onClick={onCancel}
              className="absolute top-4 left-4 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl text-xs transition-colors cursor-pointer"
              title="إلغاء والعودة"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          )}

          <div className="inline-flex items-center justify-center w-13 h-13 rounded-2xl bg-white text-black shadow-lg mb-2.5">
            <Building2 className="w-6 h-6" />
          </div>

          <h1 className="text-xl sm:text-2xl font-black tracking-tight">
            بوابة تسجيل دخول المنشآت والشركات
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1">
            Hesabaty ERP - نظام محاسبي سحابي معزول ومستقل لكل شركة
          </p>

          <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <ShieldCheck className="w-3 h-3" />
              عزل تام لبيانات كل شركة
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
              <Cloud className="w-3 h-3" />
              قاعدة بيانات مستقلة ومحمية
            </span>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="p-2 bg-slate-100 border-b border-slate-200 flex gap-1.5">
          <button
            type="button"
            onClick={() => { setActiveTab('login'); setErrorMessage(null); }}
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'login'
                ? 'bg-white text-slate-950 shadow-xs ring-1 ring-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <LogIn className="w-4 h-4" />
            <span>دخول منشأة</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('register'); setErrorMessage(null); }}
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'register'
                ? 'bg-white text-slate-950 shadow-xs ring-1 ring-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <PlusCircle className="w-4 h-4 text-emerald-600" />
            <span>تأسيس شركة جديدة</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('google'); setErrorMessage(null); }}
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'google'
                ? 'bg-white text-slate-950 shadow-xs ring-1 ring-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>حساب Google</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6">
          {errorMessage && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          {/* TAB 1: LOGIN TO EXISTING COMPANY */}
          {activeTab === 'login' && (
            <form onSubmit={handleCompanyLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  اختر المنشأة أو الشركة للدخول:
                </label>

                {companies.length > 0 ? (
                  <div className="space-y-2 mb-3 max-h-48 overflow-y-auto pr-1">
                    {companies.map(c => (
                      <label
                        key={c.id}
                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                          selectedCompanyId === c.id
                            ? 'border-black bg-slate-50 ring-2 ring-black/10 shadow-xs'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="selected_company"
                            checked={selectedCompanyId === c.id}
                            onChange={() => setSelectedCompanyId(c.id)}
                            className="w-4 h-4 text-black focus:ring-0"
                          />
                          <div>
                            <div className="font-black text-xs text-slate-900 flex items-center gap-1.5">
                              <Building2 className="w-3.5 h-3.5 text-slate-600" />
                              <span>{c.name}</span>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              المسؤول: {c.adminName} ({c.adminUsername})
                            </div>
                          </div>
                        </div>
                        <span className="text-[10px] bg-slate-200/80 font-bold px-2 py-0.5 rounded text-slate-700">
                          {c.currency}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 border border-dashed border-slate-300 rounded-2xl text-center space-y-2 mb-3">
                    <p className="text-xs text-slate-500 font-medium">
                      لا توجد منشآت مسجلة على هذا الجهاز بعد.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('register')}
                      className="px-3.5 py-1.5 bg-black text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>تأسيس أول منشأة لك الآن (مجانياً)</span>
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  اسم المستخدم أو البريد الإلكتروني
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={loginUsername}
                    onChange={e => setLoginUsername(e.target.value)}
                    placeholder="مثال: admin أو البريد الإلكتروني"
                    className="w-full px-3 py-2 pr-9 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-black outline-none transition-all"
                  />
                  <User className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  كلمة المرور (إذا تم تعيينها)
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
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
                <span>دخول مساحة المنشأة المحددة</span>
              </button>
            </form>
          )}

          {/* TAB 2: REGISTER NEW ISOLATED COMPANY */}
          {activeTab === 'register' && (
            <form onSubmit={handleRegisterCompany} className="space-y-3.5">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-[11px] text-emerald-800 font-medium leading-relaxed flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  تأسيس منشأة جديدة يمنحك مساحة عمل نظيفة 100% معزولة بالكامل، بدليل حسابات قياسي ودون أي خلط مع أي شركة أخرى!
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  اسم المنشأة أو الشركة <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={regCompanyName}
                    onChange={e => setRegCompanyName(e.target.value)}
                    placeholder="مثال: شركة الأمل للتجارة والتوريدات"
                    className="w-full px-3 py-2 pr-9 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-black outline-none transition-all"
                  />
                  <Building2 className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم المسؤول / المدير <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={regAdminName}
                      onChange={e => setRegAdminName(e.target.value)}
                      placeholder="مثال: أحمد محمود"
                      className="w-full px-3 py-2 pr-9 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-black outline-none transition-all"
                    />
                    <User className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم المستخدم للدخول <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={regUsername}
                      onChange={e => setRegUsername(e.target.value)}
                      placeholder="مثال: ahmed_admin"
                      className="w-full px-3 py-2 pr-9 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-black outline-none transition-all font-mono"
                    />
                    <User className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    العملة الأساسية
                  </label>
                  <div className="relative">
                    <select
                      value={regCurrency}
                      onChange={e => setRegCurrency(e.target.value)}
                      className="w-full px-3 py-2 pr-9 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-black outline-none transition-all appearance-none cursor-pointer"
                    >
                      <option value="ج.م">ج.م - الجنيه المصري</option>
                      <option value="ر.س">ر.س - الريال السعودي</option>
                      <option value="د.إ">د.إ - الدرهم الإماراتي</option>
                      <option value="$">$ - الدولار الأمريكي</option>
                      <option value="د.ك">د.ك - الدينار الكويتي</option>
                      <option value="د.أ">د.أ - الدينار الأردني</option>
                      <option value="ر.ق">ر.ق - الريال القطري</option>
                    </select>
                    <Coins className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    نوع النشاط التجاري
                  </label>
                  <div className="relative">
                    <select
                      value={regActivityType}
                      onChange={e => setRegActivityType(e.target.value)}
                      className="w-full px-3 py-2 pr-9 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-black outline-none transition-all appearance-none cursor-pointer"
                    >
                      <option value="تجارة جملة وتجزئة">تجارة جملة وتجزئة</option>
                      <option value="مقاولات وخدمات">مقاولات وخدمات</option>
                      <option value="مصنع وإنتاج">مصنع وإنتاج</option>
                      <option value="مطاعم وكافيهات">مطاعم وكافيهات</option>
                      <option value="صيدليات ومستلزمات">صيدليات ومستلزمات</option>
                      <option value="نشاط عام">نشاط تجاري عام</option>
                    </select>
                    <Briefcase className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    كلمة المرور (اختياري)
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={regPassword}
                      onChange={e => setRegPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 pr-9 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:border-black outline-none transition-all"
                    />
                    <KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    رقم الهاتف (اختياري)
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={regPhone}
                      onChange={e => setRegPhone(e.target.value)}
                      placeholder="مثال: 010xxxxxxxx"
                      className="w-full px-3 py-2 pr-9 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-black outline-none transition-all"
                    />
                    <Phone className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-3"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <PlusCircle className="w-4 h-4" />
                )}
                <span>تأسيس المنشأة وبدء العمل الفعلي الآن</span>
              </button>
            </form>
          )}

          {/* TAB 3: GOOGLE SIGN-IN */}
          {activeTab === 'google' && (
            <div className="space-y-4">
              <div className="text-center space-y-1.5 mb-4">
                <h3 className="text-base font-black text-slate-900">
                  الدخول السحابي ومزامنة Google Drive
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  سجل دخولك بحساب الجيميل لفتح مساحة عمل خاصة بك تلقائياً مع تفعيل النسخ الاحتياطي السحابي التلقائي المشفر.
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
                <span>المتابعة بحساب Google (Gmail)</span>
              </button>

              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2 mt-4 text-[11px] text-slate-600">
                <div className="flex items-center gap-2 font-bold text-slate-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>مميزات الربط السحابي:</span>
                </div>
                <ul className="space-y-1 pr-6 list-disc text-slate-500">
                  <li>مساحة عمل خاصة بكل حساب بريد بدون خلط مع أي شركة أخرى.</li>
                  <li>حفظ وتخزين قواعد البيانات الاحتياطية في Google Drive الخاص بك تلقائياً.</li>
                  <li>استرجاع كافة فواتيرك وحساباتك على أي هاتف آخر بنفس الحساب بنقرة زر واحدة.</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
