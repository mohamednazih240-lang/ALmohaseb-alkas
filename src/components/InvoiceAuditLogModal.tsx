import React from 'react';
import {
  ShieldCheck,
  Clock,
  User,
  History,
  CheckCircle2,
  AlertCircle,
  Edit,
  PlusCircle,
  FileText,
  Printer,
  X,
  Calendar,
  Layers,
  ArrowRight
} from 'lucide-react';
import { Invoice, InvoiceAuditEntry, AppSettings } from '../types/accounting';
import { formatMoney } from '../services/accountingStorage';

interface InvoiceAuditLogModalProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
  currency?: string;
}

export const formatAuditDateTime = (timestamp?: string, fallbackDate?: string, fallbackTime?: string): { date: string; time: string } => {
  if (timestamp) {
    try {
      const d = new Date(timestamp);
      if (!isNaN(d.getTime())) {
        const date = d.toLocaleDateString('ar-EG', {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
        const time = d.toLocaleTimeString('ar-EG', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
        return { date, time };
      }
    } catch {
      // fallback
    }
  }

  return {
    date: fallbackDate || '—',
    time: fallbackTime || '—'
  };
};

export const InvoiceAuditLogModal: React.FC<InvoiceAuditLogModalProps> = ({
  invoice,
  isOpen,
  onClose,
  currency = 'ر.س'
}) => {
  if (!isOpen || !invoice) return null;

  // Build full log array, guaranteeing at least the initial creation entry
  const logs: InvoiceAuditEntry[] = (invoice.auditLog && invoice.auditLog.length > 0)
    ? invoice.auditLog
    : [
        {
          id: 'aud_initial',
          action: 'create',
          actionTitle: 'إنشاء الفاتورة',
          userName: invoice.createdBy || 'مدير النظام',
          userId: invoice.createdById || 'usr_admin',
          userRole: 'مدير',
          timestamp: invoice.createdAt || `${invoice.date}T12:00:00Z`,
          formattedDate: invoice.date,
          formattedTime: invoice.time || '12:00',
          summary: `تم إنشاء الفاتورة لأول مرة بقيمة ${invoice.total.toLocaleString()} ${currency} (${invoice.items.length} أصناف)`,
          newTotal: invoice.total,
          itemsCount: invoice.items.length
        }
      ];

  const creationEntry = logs.find(l => l.action === 'create') || logs[logs.length - 1];
  const lastEditEntry = logs.find(l => l.action === 'edit');
  const totalEditsCount = logs.filter(l => l.action === 'edit').length;

  const creationTimeFormatted = formatAuditDateTime(
    creationEntry?.timestamp || invoice.createdAt,
    creationEntry?.formattedDate || invoice.date,
    creationEntry?.formattedTime || invoice.time
  );

  const editTimeFormatted = lastEditEntry
    ? formatAuditDateTime(
        lastEditEntry.timestamp || invoice.updatedAt,
        lastEditEntry.formattedDate,
        lastEditEntry.formattedTime
      )
    : null;

  const handlePrintAudit = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 text-right overflow-hidden">
        {/* Header */}
        <div className="no-print bg-slate-900 text-white p-3.5 sm:p-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-black">
                  سجل الرقابة المالية والتدقيق (Audit Log)
                </h2>
                <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2 py-0.5 rounded-full font-bold">
                  موثق ومحمي
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                فاتورة {invoice.type === 'sale' ? 'مبيعات' : 'مشتريات'} رقم: <span className="font-mono font-bold text-white">{invoice.number}</span> • الطرف: {invoice.partyName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrintAudit}
              className="p-1.5 text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors cursor-pointer text-xs flex items-center gap-1"
              title="طباعة سجل التدقيق"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">طباعة</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-3.5 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Top Verification Summary Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Creator Card */}
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 left-0 w-16 h-16 bg-emerald-500/5 rounded-full -translate-x-6 -translate-y-6" />
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                    إنشاء الفاتورة الأصلي
                  </span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <User className="w-4 h-4 text-emerald-700" />
                    <span className="font-black text-slate-900 text-sm">
                      {creationEntry.userName || invoice.createdBy || 'مدير النظام'}
                    </span>
                    {(creationEntry.userRole || 'مدير') && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold">
                        {creationEntry.userRole || 'مدير'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <PlusCircle className="w-4 h-4" />
                </div>
              </div>

              <div className="mt-2.5 pt-2 border-t border-emerald-200/60 flex items-center justify-between text-[11px] text-emerald-900">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-emerald-600" />
                  <span>{creationTimeFormatted.date}</span>
                </span>
                <span className="font-mono font-bold text-emerald-950 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-emerald-600" />
                  <span>{creationTimeFormatted.time}</span>
                </span>
              </div>
            </div>

            {/* Last Edit Card */}
            <div className={`border rounded-xl p-3 flex flex-col justify-between relative overflow-hidden ${
              lastEditEntry
                ? 'bg-amber-50/70 border-amber-200'
                : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-start justify-between">
                <div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider block ${
                    lastEditEntry ? 'text-amber-800' : 'text-slate-500'
                  }`}>
                    آخر تعديل مسجل
                  </span>
                  {lastEditEntry ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      <User className="w-4 h-4 text-amber-700" />
                      <span className="font-black text-slate-900 text-sm">
                        {lastEditEntry.userName || invoice.updatedBy}
                      </span>
                      {lastEditEntry.userRole && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold">
                          {lastEditEntry.userRole}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 mt-1 text-slate-500 text-xs font-medium">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>لم يطرأ أي تعديل (الفاتورة بحالتها الأصلية)</span>
                    </div>
                  )}
                </div>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                  lastEditEntry ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-500'
                }`}>
                  <Edit className="w-4 h-4" />
                </div>
              </div>

              <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                {lastEditEntry && editTimeFormatted ? (
                  <>
                    <span className="text-amber-900 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-amber-600" />
                      <span>{editTimeFormatted.date}</span>
                    </span>
                    <span className="font-mono font-bold text-amber-950 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-600" />
                      <span>{editTimeFormatted.time}</span>
                    </span>
                  </>
                ) : (
                  <span className="text-[10px] text-slate-500 font-medium">
                    إجمالي التعديلات: 0 عمليات
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Current Financial Status Snapshot */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">القيمة الإجمالية:</span>
              <span className="font-mono font-black text-slate-900 text-sm">
                {formatMoney(invoice.total, currency)}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                invoice.status === 'مدفوع' ? 'bg-emerald-100 text-emerald-800' :
                invoice.status === 'جزئي' ? 'bg-amber-100 text-amber-800' :
                'bg-rose-100 text-rose-800'
              }`}>
                {invoice.status}
              </span>
            </div>

            <div className="flex items-center gap-3 text-slate-600">
              <span>الأصناف: <strong className="text-slate-900">{invoice.items.length}</strong></span>
              <span>الفرع: <strong className="text-slate-900">{invoice.branchName || 'الرئيسي'}</strong></span>
              <span>حركات الرقابة: <strong className="text-blue-700 font-mono">{logs.length}</strong></span>
            </div>
          </div>

          {/* Timeline Section */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <History className="w-4 h-4 text-blue-600" />
                <span>التسلسل الزمني لكافة العمليات والتعديلات ({logs.length})</span>
              </h3>
              <span className="text-[10px] text-slate-400">مرتب من الأحدث للأقدم</span>
            </div>

            <div className="relative pr-6 border-r-2 border-slate-200 space-y-4 my-2">
              {logs.map((log, index) => {
                const isCreation = log.action === 'create';
                const timeData = formatAuditDateTime(log.timestamp, log.formattedDate, log.formattedTime);

                return (
                  <div key={log.id || index} className="relative group">
                    {/* Circle icon on line */}
                    <div className={`absolute -right-[31px] top-1 w-5 h-5 rounded-full flex items-center justify-center border-2 bg-white ${
                      isCreation
                        ? 'border-emerald-600 text-emerald-600'
                        : 'border-blue-600 text-blue-600'
                    }`}>
                      {isCreation ? (
                        <div className="w-2 h-2 rounded-full bg-emerald-600" />
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-blue-600" />
                      )}
                    </div>

                    {/* Timeline Event Card */}
                    <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs hover:border-slate-300 transition-all">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                            isCreation
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}>
                            {log.actionTitle || (isCreation ? 'إنشاء الفاتورة' : 'تعديل الفاتورة')}
                          </span>
                          <span className="text-xs font-bold text-slate-900">
                            بواسطة: {log.userName}
                          </span>
                          {log.userRole && (
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded font-medium">
                              ({log.userRole})
                            </span>
                          )}
                        </div>

                        <div className="text-left font-mono text-[11px] text-slate-500 whitespace-nowrap flex items-center gap-1.5">
                          <span>{timeData.date}</span>
                          <span className="text-slate-300">•</span>
                          <span className="font-bold text-slate-700">{timeData.time}</span>
                        </div>
                      </div>

                      {log.summary && (
                        <div className="mt-2 text-xs text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-100 leading-relaxed font-sans">
                          {log.summary}
                        </div>
                      )}

                      {/* Detail metrics if present */}
                      {(log.previousTotal !== undefined || log.newTotal !== undefined) && (
                        <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500 pt-1.5 border-t border-slate-100">
                          {log.previousTotal !== undefined && (
                            <span>الإجمالي السابق: <strong className="font-mono text-slate-700">{formatMoney(log.previousTotal, currency)}</strong></span>
                          )}
                          {log.previousTotal !== undefined && log.newTotal !== undefined && (
                            <ArrowRight className="w-3 h-3 text-slate-400 rotate-180" />
                          )}
                          {log.newTotal !== undefined && (
                            <span>الإجمالي بعد الإجراء: <strong className="font-mono text-emerald-700">{formatMoney(log.newTotal, currency)}</strong></span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Anti-fraud / Compliance Notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-[11px] text-blue-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0" />
            <span>
              نظام الرقابة المالية يسجل بصمة الوقت والاسم تلقائياً لكل عملية حفظ أو تعديل ولا يمكن حذف سجلات التدقيق لضمان الشفافية ومكافحة التلاعب المالي.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="no-print p-3 sm:p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-[11px] text-slate-500">
            رقم السجل: <span className="font-mono font-bold">{invoice.id}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
