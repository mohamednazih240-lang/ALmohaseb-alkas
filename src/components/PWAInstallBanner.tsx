import React, { useState } from 'react';
import {
  Download,
  Smartphone,
  Share,
  PlusSquare,
  X,
  RefreshCw,
  Sparkles,
  WifiOff,
  CheckCircle2,
  ShieldCheck
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, needRefresh, install, updateApp } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdate = () => {
    setIsUpdating(true);
    updateApp();
  };

  return (
    <>
      {/* 1. Instant Auto-Update Floating Toast (when new commit is deployed to Vercel) */}
      {needRefresh && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-11/12 max-w-lg bg-slate-900/95 backdrop-blur-md text-white px-4 py-3 rounded-2xl shadow-2xl border border-emerald-500/50 flex items-center justify-between gap-3 animate-bounce">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 animate-spin" />
            </div>
            <div>
              <p className="text-xs font-black text-white">
                يتوفر إصدار جديد تم نشره الآن!
              </p>
              <p className="text-[10px] text-slate-300">
                تحديثات تلقائية من Vercel - اضغط لتطبيق التحديث فوراً
              </p>
            </div>
          </div>

          <button
            onClick={handleUpdate}
            disabled={isUpdating}
            className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-slate-950 text-xs font-black rounded-xl transition flex items-center gap-1.5 shrink-0 shadow-md cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
            <span>{isUpdating ? 'جاري التحديث...' : 'تحديث الآن'}</span>
          </button>
        </div>
      )}

      {/* 2. In-App Mobile Install Banner (if not installed yet and not dismissed) */}
      {!isInstalled && !dismissed && (isInstallable || isIOS) && (
        <div className="bg-linear-to-r from-slate-900 via-slate-850 to-slate-900 text-white border-b border-slate-700 px-3 sm:px-4 py-2 sm:py-2.5 shadow-md">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0 font-black shadow-xs">
                <Smartphone className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-white truncate">
                    ثبّت التطبيق على هاتفك المحمول
                  </span>
                  <span className="hidden sm:inline-block bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                    تطبيق PWA أصلي
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 hidden xs:block truncate">
                  يعمل بشاشة كاملة وبدون متصفح، وسريع جداً مع تحديث فوري عند كل رفع على Vercel
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isInstallable && (
                <button
                  onClick={install}
                  className="px-3 py-1.5 bg-white text-slate-900 hover:bg-slate-100 active:scale-95 rounded-lg text-xs font-black transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تثبيت التطبيق</span>
                </button>
              )}

              {isIOS && !isInstallable && (
                <button
                  onClick={() => setShowIOSModal(true)}
                  className="px-3 py-1.5 bg-white text-slate-900 hover:bg-slate-100 active:scale-95 rounded-lg text-xs font-black transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>طريقة التثبيت على الآيفون</span>
                </button>
              )}

              <button
                onClick={() => setDismissed(true)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition"
                title="إغلاق التنبيه"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. iOS Safari Instructions Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl text-slate-900 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                  <Smartphone className="w-4.5 h-4.5" />
                </div>
                <h3 className="text-sm font-black text-slate-900">
                  تثبيت التطبيق على iPhone / iPad
                </h3>
              </div>
              <button
                onClick={() => setShowIOSModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3.5 text-xs text-slate-600">
              <div className="flex items-start gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-[11px] font-black shrink-0">
                  1
                </div>
                <div>
                  <p className="font-bold text-slate-900 flex items-center gap-1.5">
                    <span>اضغط زر المشاركة</span>
                    <Share className="w-3.5 h-3.5 text-blue-600 inline" />
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    في شريط متصفح Safari بالأسفل (أو بالأعلى على الآيباد).
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-[11px] font-black shrink-0">
                  2
                </div>
                <div>
                  <p className="font-bold text-slate-900 flex items-center gap-1.5">
                    <span>اختر "إضافة إلى الشاشة الرئيسية"</span>
                    <PlusSquare className="w-3.5 h-3.5 text-slate-700 inline" />
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    (Add to Home Screen) من القائمة المنبثقة.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 text-emerald-900">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-[11px] font-semibold">
                  سيظهر التطبيق فوراً بأيقونته الاحترافية على شاشة هاتفك ويعمل كتطبيق أصلي سريع مع دعم كامل للتحديثات الفورية!
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowIOSModal(false)}
              className="mt-5 w-full rounded-xl bg-slate-900 hover:bg-black py-2.5 text-xs font-black text-white transition cursor-pointer"
            >
              تم، فهمت الخطوات
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const PWAInstallButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 text-xs font-bold transition border border-emerald-500/30 cursor-pointer ${className}`}
        title="تثبيت التطبيق على الهاتف"
      >
        <Download className="w-3.5 h-3.5 text-emerald-600" />
        <span>تثبيت كـ تطبيق</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSModal(true)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition border border-slate-300 cursor-pointer ${className}`}
          title="تثبيت على الآيفون"
        >
          <Smartphone className="w-3.5 h-3.5 text-slate-700" />
          <span>تثبيت (iOS)</span>
        </button>

        {showIOSModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl text-slate-900 border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-black text-slate-900">تثبيت التطبيق على iPhone</h3>
                <button onClick={() => setShowIOSModal(false)} className="text-slate-400 p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="mt-3 text-xs text-slate-600">
                1. اضغط على أيقونة المشاركة <Share className="w-3 h-3 inline text-blue-600" /> في سفاري.<br />
                2. اختر <strong>"إضافة إلى الشاشة الرئيسية"</strong> (Add to Home Screen).
              </p>
              <button
                onClick={() => setShowIOSModal(false)}
                className="mt-4 w-full rounded-xl bg-slate-900 py-2 text-xs font-bold text-white"
              >
                إغلاق
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
