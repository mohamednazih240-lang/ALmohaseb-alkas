import React, { useState } from 'react';
import { Lock, ShieldAlert, KeyRound, Eye, EyeOff, CheckCircle2, X, Building2 } from 'lucide-react';
import { Branch } from '../types/accounting';

interface BranchPinModalProps {
  isOpen: boolean;
  targetBranch: Branch | null;
  onConfirm: () => void;
  onClose: () => void;
}

export const BranchPinModal: React.FC<BranchPinModalProps> = ({
  isOpen,
  targetBranch,
  onConfirm,
  onClose
}) => {
  const [pinInput, setPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen || !targetBranch) return null;

  const expectedPin = (targetBranch.pin || '1234').trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (pinInput.trim() === expectedPin) {
      setPinInput('');
      setErrorMessage('');
      onConfirm();
    } else {
      setErrorMessage('الرقم السري غير صحيح! تم منع الدخول لحماية وعزل بيانات هذا الفرع.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4 text-slate-100 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-1.5">
                <span>عزل الفروع: الدخول محمي برقم سري</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                المقر الرئيسي معزول تماماً عن الفروع
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Branch Info Badge */}
        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-400" />
            <div>
              <span className="text-xs font-bold text-white block">{targetBranch.name}</span>
              <span className="text-[10px] text-slate-400 font-mono">كود الفرع: {targetBranch.code}</span>
            </div>
          </div>
          <span className="text-[10px] bg-amber-500/15 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
            بيانات معزولة
          </span>
        </div>

        {/* Description Warning */}
        <div className="flex items-start gap-2 bg-amber-950/20 p-2.5 rounded-xl border border-amber-500/30 text-xs text-amber-200/90 leading-relaxed">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            لا يمكن لمدير المقر الرئيسي أو أي مستخدم الدخول إلى هذا الفرع واستعراض فواتيره أو مخزونه إلا بإدخال الرقم السري المعتمد للفرع.
          </span>
        </div>

        {/* PIN Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                <span>الرقم السري الخاص بالفرع (PIN):</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">الافتراضي: 1234</span>
            </label>
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                autoFocus
                required
                value={pinInput}
                onChange={e => {
                  setPinInput(e.target.value);
                  setErrorMessage('');
                }}
                placeholder="أدخل الرقم السري للفرع..."
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm font-mono tracking-widest focus:border-amber-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {errorMessage && (
            <div className="p-2.5 bg-rose-950/40 border border-rose-500/40 rounded-xl text-xs text-rose-300 font-bold animate-in fade-in flex items-center gap-2">
              <X className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              إلغاء والعودة للمقر الرئيسي
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-amber-500/10"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>تأكيد الدخول للفرع</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
