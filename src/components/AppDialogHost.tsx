import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Trash2, X, XCircle } from 'lucide-react';
import { PendingAppDialog, resolveAppDialog, subscribeAppDialogs } from '../services/appDialog';

export const AppDialogHost: React.FC = () => {
  const [dialogs, setDialogs] = useState<PendingAppDialog[]>([]);

  useEffect(() => {
    return subscribeAppDialogs(setDialogs);
  }, []);

  const current = dialogs[0] || null;

  useEffect(() => {
    if (!current) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        resolveAppDialog(current.id, current.kind === 'alert');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        resolveAppDialog(current.id, true);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [current]);

  if (!current) return null;

  const palette = (() => {
    switch (current.variant) {
      case 'danger':
        return {
          headerBg: 'bg-rose-600 text-white',
          iconWrap: 'bg-rose-100 text-rose-600 border-rose-200',
          confirmBtn: 'bg-rose-600 hover:bg-rose-700 text-white',
          Icon: Trash2
        };
      case 'error':
        return {
          headerBg: 'bg-rose-600 text-white',
          iconWrap: 'bg-rose-100 text-rose-600 border-rose-200',
          confirmBtn: 'bg-rose-600 hover:bg-rose-700 text-white',
          Icon: XCircle
        };
      case 'warning':
        return {
          headerBg: 'bg-amber-600 text-white',
          iconWrap: 'bg-amber-100 text-amber-700 border-amber-200',
          confirmBtn: 'bg-amber-600 hover:bg-amber-700 text-white',
          Icon: AlertTriangle
        };
      case 'success':
        return {
          headerBg: 'bg-emerald-600 text-white',
          iconWrap: 'bg-emerald-100 text-emerald-700 border-emerald-200',
          confirmBtn: 'bg-emerald-600 hover:bg-emerald-700 text-white',
          Icon: CheckCircle2
        };
      default:
        return {
          headerBg: 'bg-slate-800 text-white',
          iconWrap: 'bg-blue-100 text-blue-700 border-blue-200',
          confirmBtn: 'bg-blue-600 hover:bg-blue-700 text-white',
          Icon: Info
        };
    }
  })();

  const IconComp = palette.Icon;

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999] bg-slate-950/65 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-4"
      onClick={() => resolveAppDialog(current.id, false)}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <div className={`px-4 py-3 flex items-center justify-between ${palette.headerBg}`}>
          <div className="flex items-center gap-2 font-black text-sm">
            <IconComp className="w-4 h-4 shrink-0" />
            <span>{current.title}</span>
          </div>
          <button
            type="button"
            onClick={() => resolveAppDialog(current.id, false)}
            className="p-1 rounded-lg hover:bg-white/20 transition-colors cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${palette.iconWrap}`}>
            <IconComp className="w-5 h-5" />
          </div>
          <p className="text-xs sm:text-sm font-bold text-slate-800 leading-relaxed whitespace-pre-line flex-1 pt-0.5">
            {current.message}
          </p>
        </div>

        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          {current.kind === 'confirm' && (
            <button
              type="button"
              onClick={() => resolveAppDialog(current.id, false)}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs sm:text-sm min-h-[38px] cursor-pointer transition-colors"
            >
              {current.cancelText || 'إلغاء'}
            </button>
          )}
          <button
            type="button"
            autoFocus
            onClick={() => resolveAppDialog(current.id, true)}
            className={`px-5 py-2 rounded-xl font-black text-xs sm:text-sm min-h-[38px] shadow-sm cursor-pointer transition-colors ${palette.confirmBtn}`}
          >
            {current.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
