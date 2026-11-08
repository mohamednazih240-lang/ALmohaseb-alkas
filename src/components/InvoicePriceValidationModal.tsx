import React from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ShieldAlert
} from 'lucide-react';
import { formatMoney } from '../services/accountingStorage';

export interface BelowCostItem {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  verifiedPurchasePrice: number;
  currentSellingPrice: number;
  lossPerUnit: number;
  qty: number;
  totalLoss: number;
  lossPercentage: number;
  previousInvoiceNumber?: string;
  previousInvoiceDate?: string;
  hasVerifiedPurchase: boolean;
}

export interface PurchasePriceChangeItem {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  previousPurchasePrice: number;
  newPurchasePrice: number;
  differencePerUnit: number;
  isIncrease: boolean;
  percentageChange: number;
  purchasedQty: number;
  totalDifference: number;
  previousInvoiceNumber?: string;
  previousInvoiceDate?: string;
}

interface InvoicePriceValidationModalProps {
  isOpen: boolean;
  type: 'below_cost' | 'purchase_price_change';
  currency: string;
  belowCostItems?: BelowCostItem[];
  purchasePriceChangeItems?: PurchasePriceChangeItem[];
  onApproveAndContinue: () => void;
  onCancelAndModify: () => void;
}

export const InvoicePriceValidationModal: React.FC<InvoicePriceValidationModalProps> = ({
  isOpen,
  type,
  currency = 'ج.م',
  belowCostItems = [],
  purchasePriceChangeItems = [],
  onApproveAndContinue,
  onCancelAndModify
}) => {
  if (!isOpen) return null;

  const isBelowCost = type === 'below_cost';

  // Calculate overall aggregates
  const totalExpectedLoss = belowCostItems
    .filter(i => i.hasVerifiedPurchase)
    .reduce((sum, i) => sum + i.totalLoss, 0);

  const totalPurchaseNetDiff = purchasePriceChangeItems
    .reduce((sum, i) => sum + (i.isIncrease ? i.totalDifference : -i.totalDifference), 0);

  const modalContent = (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-[99999] animate-in fade-in duration-150 select-none"
      dir="rtl"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col border border-slate-300 overflow-hidden">
        
        {/* Header */}
        <div
          className={`px-5 py-4 border-b flex items-start justify-between gap-3 ${
            isBelowCost
              ? 'bg-gradient-to-r from-rose-900 to-rose-800 text-white'
              : 'bg-gradient-to-r from-amber-900 to-amber-800 text-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${isBelowCost ? 'bg-rose-700/60 ring-2 ring-rose-400/50' : 'bg-amber-700/60 ring-2 ring-amber-400/50'}`}>
              {isBelowCost ? (
                <ShieldAlert className="w-6 h-6 text-rose-200" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-amber-200" />
              )}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black leading-tight">
                {isBelowCost
                  ? '⚠️ تحذير: البيع بأقل من سعر الشراء (تكلفة الشراء الموثقة)'
                  : 'ℹ️ تنبيه: رصد تغير في أسعار الشراء عن آخر فواتير معتمدة'}
              </h2>
              <p className="text-xs text-white/85 mt-1 font-medium">
                {isBelowCost
                  ? 'تم رصد أصناف يتم بيعها بسعر يقل عن آخر سعر شراء مسجل لها، مما قد يسبب خسارة تجارية.'
                  : 'تم رصد اختلاف بين أسعار الشراء المدخلة بالفاتورة الحالية وآخر أسعار شراء موثقة ومرحلة.'}
              </p>
            </div>
          </div>
        </div>

        {/* Aggregate KPI Banner */}
        <div className={`px-5 py-3 border-b text-xs flex flex-wrap items-center justify-between gap-3 ${
          isBelowCost ? 'bg-rose-50/80 border-rose-200 text-rose-950' : 'bg-amber-50/80 border-amber-200 text-amber-950'
        }`}>
          <div className="flex items-center gap-4 flex-wrap font-bold">
            <span>
              عدد الأصناف المتأثرة: <strong className="text-sm font-black font-mono">{isBelowCost ? belowCostItems.length : purchasePriceChangeItems.length}</strong> صنف
            </span>
            {isBelowCost ? (
              <span>
                إجمالي الخسارة المتوقعة: <strong className="text-sm font-black font-mono text-rose-700">{formatMoney(totalExpectedLoss, currency)}</strong>
              </span>
            ) : (
              <span>
                صافي الفارق المالي الإجمالي: <strong className={`text-sm font-black font-mono ${totalPurchaseNetDiff > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {totalPurchaseNetDiff > 0 ? '+' : ''}{formatMoney(totalPurchaseNetDiff, currency)}
                </strong>
              </span>
            )}
          </div>
          <span className="text-[11px] font-semibold text-slate-600 bg-white px-2.5 py-1 rounded-md border border-slate-200">
            يتطلب قرارك للمتابعة أو التعديل
          </span>
        </div>

        {/* Items Table List */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3 bg-slate-50">
          {isBelowCost ? (
            <div className="space-y-2.5">
              {belowCostItems.map((item, idx) => {
                if (!item.hasVerifiedPurchase) {
                  return (
                    <div
                      key={item.productId || idx}
                      className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <HelpCircle className="w-4 h-4 text-slate-400 shrink-0" />
                        <div>
                          <span className="font-black text-slate-900">{item.productName}</span>
                          <span className="text-[11px] text-slate-500 font-mono mr-2">كود: {item.productCode}</span>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        تكلفة الشراء غير محددة (صنف جديد لم يتم شراؤه بعد)
                      </span>
                    </div>
                  );
                }

                return (
                  <div
                    key={item.productId || idx}
                    className="bg-white border border-rose-200 hover:border-rose-300 rounded-xl p-3.5 shadow-2xs space-y-2 transition-all"
                  >
                    {/* Item Title and Badges */}
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                      <div>
                        <h4 className="font-black text-sm text-slate-900">{item.productName}</h4>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-2 flex-wrap">
                          <span>كود: {item.productCode}</span>
                          {item.previousInvoiceNumber && (
                            <span>• آخر فاتورة شراء: #{item.previousInvoiceNumber} {item.previousInvoiceDate ? `(${item.previousInvoiceDate})` : ''}</span>
                          )}
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1 shrink-0">
                        <TrendingDown className="w-3.5 h-3.5" />
                        <span>خسارة {item.lossPercentage.toFixed(1)}%</span>
                      </span>
                    </div>

                    {/* Breakdown Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs pt-1">
                      <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <span className="text-[10px] text-slate-500 block">آخر سعر شراء</span>
                        <span className="font-bold font-mono text-slate-900">{formatMoney(item.verifiedPurchasePrice, currency)}</span>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <span className="text-[10px] text-slate-500 block">سعر البيع الحالي</span>
                        <span className="font-bold font-mono text-rose-700">{formatMoney(item.currentSellingPrice, currency)}</span>
                      </div>
                      <div className="bg-rose-50/70 p-2 rounded-lg border border-rose-200">
                        <span className="text-[10px] text-rose-700 block">الخسارة بالوحدة</span>
                        <span className="font-black font-mono text-rose-700">-{formatMoney(item.lossPerUnit, currency)}</span>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <span className="text-[10px] text-slate-500 block">الكمية المباعة</span>
                        <span className="font-bold font-mono text-slate-900">{item.qty} {item.unit}</span>
                      </div>
                      <div className="bg-rose-100/70 p-2 rounded-lg border border-rose-300 col-span-2 sm:col-span-1">
                        <span className="text-[10px] text-rose-800 block">إجمالي الخسارة</span>
                        <span className="font-black font-mono text-rose-800 text-sm">-{formatMoney(item.totalLoss, currency)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2.5">
              {purchasePriceChangeItems.map((item, idx) => {
                return (
                  <div
                    key={item.productId || idx}
                    className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-3.5 shadow-2xs space-y-2 transition-all"
                  >
                    {/* Item Title and Badges */}
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                      <div>
                        <h4 className="font-black text-sm text-slate-900">{item.productName}</h4>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-2 flex-wrap">
                          <span>كود: {item.productCode}</span>
                          {item.previousInvoiceNumber && (
                            <span>• شراء سابق بفاتورة: #{item.previousInvoiceNumber} {item.previousInvoiceDate ? `(${item.previousInvoiceDate})` : ''}</span>
                          )}
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-black border flex items-center gap-1 shrink-0 ${
                        item.isIncrease
                          ? 'bg-amber-100 text-amber-900 border-amber-300'
                          : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                      }`}>
                        {item.isIncrease ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                        <span>{item.isIncrease ? 'زيادة' : 'انخفاض'} {item.percentageChange.toFixed(1)}%</span>
                      </span>
                    </div>

                    {/* Breakdown Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs pt-1">
                      <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <span className="text-[10px] text-slate-500 block">السعر السابق</span>
                        <span className="font-bold font-mono text-slate-900">{formatMoney(item.previousPurchasePrice, currency)}</span>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <span className="text-[10px] text-slate-500 block">السعر الجديد</span>
                        <span className="font-bold font-mono text-blue-900">{formatMoney(item.newPurchasePrice, currency)}</span>
                      </div>
                      <div className={`p-2 rounded-lg border ${item.isIncrease ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
                        <span className="text-[10px] block">الفارق بالوحدة</span>
                        <span className="font-black font-mono">
                          {item.isIncrease ? '+' : '-'}{formatMoney(item.differencePerUnit, currency)}
                        </span>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <span className="text-[10px] text-slate-500 block">الكمية المشتراة</span>
                        <span className="font-bold font-mono text-slate-900">{item.purchasedQty} {item.unit}</span>
                      </div>
                      <div className={`p-2 rounded-lg border col-span-2 sm:col-span-1 ${item.isIncrease ? 'bg-amber-100 border-amber-300 text-amber-950' : 'bg-emerald-100 border-emerald-300 text-emerald-950'}`}>
                        <span className="text-[10px] block">إجمالي الفارق</span>
                        <span className="font-black font-mono text-sm">
                          {item.isIncrease ? '+' : '-'}{formatMoney(item.totalDifference, currency)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 bg-white flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="text-[11px] text-slate-500">
            * سيتم تسجيل قرار الموافقة واسم المستخدم وتاريخ ووقت العملية في سجل التدقيق المحاسبي (Audit Log).
          </div>
          
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onCancelAndModify}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-300"
            >
              <XCircle className="w-4 h-4 text-slate-600" />
              <span>إلغاء والعودة لتعديل الأسعار</span>
            </button>

            <button
              type="button"
              onClick={onApproveAndContinue}
              className={`px-5 py-2 text-white rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-md ${
                isBelowCost
                  ? 'bg-rose-700 hover:bg-rose-800 focus:ring-4 focus:ring-rose-200'
                  : 'bg-emerald-700 hover:bg-emerald-800 focus:ring-4 focus:ring-emerald-200'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isBelowCost ? 'موافقة ومتابعة ترحيل البيع' : 'موافقة ومتابعة ترحيل الشراء'}
              </span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : null;
};
