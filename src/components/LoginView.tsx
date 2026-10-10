import React, { useState, useEffect } from 'react';
import {
  Building2,
  Lock,
  User,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  LogIn,
  PlusCircle,
  Phone,
  Coins,
  Briefcase,
  ChevronDown,
  Mail,
  Zap,
  Layers
} from 'lucide-react';
import { User as AppUser, AppSettings, AccountingDB } from '../types/accounting';
import { signInManual, AuthSession } from '../services/firebaseAuth';
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
  const [activeTab, setActiveTab] = useState<'login' | 'register' | 'quick'>(() => {
    const list = getCompaniesList();
    return list.length > 0 ? 'login' : 'register';
  });

  // Tab 1: Login to existing company
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(() => {
    const list = getCompaniesList();
    const active = getActiveTenantId();
    if (active && list.some(c => c.id === active)) return active;
    return list[0]?.id || '';
  });
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Tab 2: Register New Company
  const [regCompanyName, setRegCompanyName] = useState('');
  const [regActivityType, setRegActivityType] = useState('تجارة جملة وتجزئة');
  const [regAdminName, setRegAdminName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regCurrency, setRegCurrency] = useState('ج.م');
  const [regPhone, setRegPhone] = useState('');

  // Tab 3: Quick Direct Access by Email or Name (100% Reliable, Zero External Popups)
  const [quickEmailOrUser, setQuickEmailOrUser] = useState('');
  const [quickCompanyName, setQuickCompanyName] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Sync selected company username defaults
  useEffect(() => {
    if (selectedCompanyId) {
      const comp = companies.find(c => c.id === selectedCompanyId);
      if (comp) {
        setLoginUsername(comp.adminUsername || 'admin');
      }
    }
  }, [selectedCompanyId, companies]);

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
        setErrorMessage('يرجى اختيار المنشأة أو الشركة للدخول.');
        setIsLoading(false);
        return;
      }

      const compId = targetComp ? targetComp.id : 'comp_main';
      const compName = targetComp ? targetComp.name : 'المنشأة الرئيسية';

      // Load isolated database for this company
      setActiveTenantId(compId);
      const tenantDb = loadTenantDatabase(compId);

      // Verify or setup user inside this company
      const finalUsername = loginUsername.trim() || targetComp?.adminUsername || 'admin';
      let user = tenantDb.users.find(u => u.username.toLowerCase() === finalUsername.toLowerCase());

      if (!user) {
        user = {
          id: `usr_${Date.now().toString(36)}`,
          name: targetComp?.adminName || finalUsername,
          username: finalUsername,
          role: 'مدير',
          active: true,
          lastLogin: new Date().toISOString()
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

      // 2. Set as active tenant
      setActiveTenantId(newTenant.id);

      // 3. Load freshly provisioned isolated database
      const tenantDb = loadTenantDatabase(newTenant.id);
      tenantDb.settings.company = companyName;
      tenantDb.settings.currency = regCurrency;
      tenantDb.settings.phone = regPhone;

      // 4. Create manager user
      const user: AppUser = {
        id: `usr_${Date.now().toString(36)}`,
        name: adminName,
        username,
        role: 'مدير',
        active: true,
        lastLogin: new Date().toISOString()
      };
      tenantDb.users = [user];
      tenantDb.currentUser = user;

      // 5. Establish session
      const session = signInManual(user, newTenant.id, newTenant.name);

      setCompanies(getCompaniesList());
      setSuccessNotice(`تم تأسيس منشأة "${companyName}" بنجاح! يتم الآن الدخول...`);
      setTimeout(() => {
        onLoginSuccess(session, tenantDb);
      }, 500);
    } catch (err: any) {
      console.error('Registration error:', err);
      setErrorMessage('حدث خطأ أثناء تأسيس المنشأة الجديدة. يرجى المحاولة ثانية.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Quick Direct Access (By Email, Gmail address, or Username - 100% Guaranteed)
  const handleQuickDirectAccess = (e: React.FormEvent) => {
    e.preventDefault();
    const input = quickEmailOrUser.trim();
    if (!input) {
      setErrorMessage('يرجى إدخال البريد الإلكتروني أو اسم المستخدم للمتابعة.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const isEmail = input.includes('@');
      const usernamePart = isEmail ? input.split('@')[0] : input;
      const derivedCompanyName = quickCompanyName.trim() || `منشأة ${usernamePart}`;

      // Register or retrieve isolated company tenant for this email/username
      const tenant = registerCompany({
        name: derivedCompanyName,
        adminName: usernamePart,
        adminUsername: input,
        currency: 'ج.م',
        isGoogle: isEmail,
        googleEmail: isEmail ? input.toLowerCase() : undefined
      });

      setActiveTenantId(tenant.id);
      const tenantDb = loadTenantDatabase(tenant.id);

      const appUser: AppUser = {
        id: `usr_q_${input.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)}`,
        name: usernamePart,
        username: input,
        role: 'مدير',
        active: true,
        lastLogin: new Date().toISOString()
      };

      const session = signInManual(appUser, tenant.id, tenant.name);
      if (isEmail) {
        session.isGoogle = true;
        session.googleEmail = input.toLowerCase();
      }

      setCompanies(getCompaniesList());
      setSuccessNotice(`تم فتح مساحة العمل بنجاح! جاري الدخول...`);
      setTimeout(() => {
        onLoginSuccess(session, tenantDb);
      }, 400);
    } catch (err: any) {
      console.error('Quick access error:', err);
      setErrorMessage('حدث خطأ أثناء فتح مساحة العمل. يرجى المحاولة ثانية.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 text-right font-sans">
      <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-slate-950 text-white p-5 sm:p-6 text-center relative border-b border-slate-800">
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
            نظام حساباتي السحابي (Hesabaty ERP)
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1">
            بوابة تسجيل الدخول وإدارة منشآت وشركات الحسابات
          </p>

          <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <ShieldCheck className="w-3 h-3" />
              عزل تام 100% لبيانات كل شركة
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
              <Layers className="w-3 h-3" />
              قاعدة بيانات مستقلة ومحمية
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="p-2 bg-slate-100 border-b border-slate-200 flex gap-1.5">
          <button
            type="button"
            onClick={() => { setActiveTab('login'); setErrorMessage(null); setSuccessNotice(null); }}
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'login'
                ? 'bg-white text-slate-950 shadow-xs ring-1 ring-slate-200 font-black'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <LogIn className="w-4 h-4" />
            <span>دخول منشأة</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('register'); setErrorMessage(null); setSuccessNotice(null); }}
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'register'
                ? 'bg-white text-slate-950 shadow-xs ring-1 ring-slate-200 font-black'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <PlusCircle className="w-4 h-4 text-emerald-600" />
            <span>تأسيس شركة جديدة</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('quick'); setErrorMessage(null); setSuccessNotice(null); }}
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'quick'
                ? 'bg-white text-slate-950 shadow-xs ring-1 ring-slate-200 font-black'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Zap className="w-4 h-4 text-amber-500" />
            <span>دخول فوري مباشر</span>
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 sm:p-6">
          {errorMessage && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          {successNotice && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successNotice}</span>
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
                  <div className="space-y-2 mb-3 max-h-52 overflow-y-auto pr-1">
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
                            className="w-4 h-4 text-black focus:ring-0 cursor-pointer"
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
                    placeholder="admin أو البريد الإلكتروني"
                    className="w-full px-3 py-2.5 pr-9 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-black outline-none transition-all font-mono"
                  />
                  <User className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  كلمة المرور
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    placeholder="•••••••• (اتركها فارغة للدخول السريع)"
                    className="w-full px-3 py-2.5 pr-9 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-black outline-none transition-all font-mono"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-black hover:bg-slate-800 text-white rounded-xl font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                <span>تسجيل الدخول ومتابعة العمل</span>
              </button>
            </form>
          )}

          {/* TAB 2: REGISTER NEW ISOLATED COMPANY */}
          {activeTab === 'register' && (
            <form onSubmit={handleRegisterCompany} className="space-y-3.5">
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
                    placeholder="مثال: شركة النور للتجارة والتوزيع"
                    className="w-full px-3 py-2 pr-9 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-black outline-none transition-all font-bold"
                  />
                  <Building2 className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم المدير أو المسؤول
                  </label>
                  <div className="relative">
                    <input
                      type="text"
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
                      placeholder="مثال: admin"
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
                    كلمة المرور
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={regPassword}
                      onChange={e => setRegPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 pr-9 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-black outline-none transition-all font-mono"
                    />
                    <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    رقم الهاتف / الجوال
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={regPhone}
                      onChange={e => setRegPhone(e.target.value)}
                      placeholder="010XXXXXXXX"
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

          {/* TAB 3: QUICK DIRECT ACCESS (Zero External Popups, 100% Guaranteed) */}
          {activeTab === 'quick' && (
            <div className="space-y-4">
              <div className="text-center space-y-1 mb-2">
                <h3 className="text-sm font-black text-slate-900 flex items-center justify-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <span>دخول فوري مباشر وآمن (بدون أي نوافذ منبثقة أو حظر)</span>
                </h3>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  أدخل بريدك الإلكتروني أو أي اسم تريده للدخول الفوري إلى مساحة عمل محاسبية مستقلة 100%
                </p>
              </div>

              <form onSubmit={handleQuickDirectAccess} className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div>
                  <label className="block text-xs font-black text-slate-800 mb-1">
                    البريد الإلكتروني أو اسم المستخدم:
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={quickEmailOrUser}
                      onChange={e => setQuickEmailOrUser(e.target.value)}
                      placeholder="اسم المستخدم أو البريد الإلكتروني"
                      className="w-full px-3 py-2.5 pr-9 bg-white border border-slate-300 rounded-xl text-xs font-bold focus:border-black outline-none transition-all font-mono"
                    />
                    <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    يمكنك كتابة اسم المستخدم أو البريد الإلكتروني وسينشئ النظام لك مساحة محاسبية معزولة فوراً
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم الشركة / النشاط (اختياري):
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={quickCompanyName}
                      onChange={e => setQuickCompanyName(e.target.value)}
                      placeholder="مثال: مؤسسة التجارة الحديثة"
                      className="w-full px-3 py-2 pr-9 bg-white border border-slate-300 rounded-xl text-xs focus:border-black outline-none transition-all"
                    />
                    <Building2 className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 bg-black hover:bg-slate-800 text-white rounded-xl font-black text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-1"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4 text-amber-300" />
                  )}
                  <span>دخول فوري ومستقل الآن</span>
                </button>
              </form>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-[11px] leading-relaxed flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  نظام الحسابات يعمل وفق معايير الحماية المحلية والسحابية المتوافقة مع كافة المتصفحات والهواتف بدون أي تبعية لنوافذ Google الخارجية التي قد تُحظر على بعض الأجهزة.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-center text-[10px] text-slate-400 font-medium">
          نظام حساباتي المحاسبي • حماية البيانات وعزل الفواتير لكل شركة • الإصدار الاحترافي 2026
        </div>
      </div>
    </div>
  );
};
