import React, { useMemo, useState } from 'react';
import {
  Tag,
  Search,
  Save,
  History,
  AlertTriangle,
  CheckCircle2,
  Printer,
  Plus,
  X,
  UserCheck,
  Clock,
  ShieldAlert,
  CopyCheck
} from 'lucide-react';
import { AccountingDB, Product, SellingPriceHistoryEntry } from '../types/accounting';
import {
  buildProductFifoLedger,
  findDuplicateProductCandidates,
  formatMoney,
  generateId,
  getProductForBranch,
  getTodayDate,
  logAudit,
  normalizeArabicText,
  parseNum,
  updateProductBranchData,
  roundMoney,
  isFiniteNonNegative
} from '../services/accountingStorage';
import { UniversalPrintModal, MovementPrintBlock } from './UniversalPrintModal';
import { useModalBackHandler } from '../hooks/useModalBackHandler';
import { useSubmitLock } from '../hooks/useSubmitLock';

interface SellingPricesViewProps {
  db: AccountingDB;
  onUpdateDb: (updated: AccountingDB) => void;
  activeBranchId?: string;
  onSelectBranch?: (branchId: string) => void;
}

type FilterMode = 'all' | 'priced' | 'unpriced' | 'below_cost' | 'duplicates';

interface PendingSaveConfirmation {
  product: Product;
  newSellPrice: number;
  newWholesalePrice: number;
  verifiedCost?: number;
  hasVerifiedCost: boolean;
  note: string;
}

export const SellingPricesView: React.FC<SellingPricesViewProps> = ({
  db,
  onUpdateDb,
  activeBranchId = 'br_mawan'
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [draftPrices, setDraftPrices] = useState<Record<string, { sell: string; wholesale: string }>>({});
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingSaveConfirmation | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [modalSelectedId, setModalSelectedId] = useState<string>('');
  const [modalSellPrice, setModalSellPrice] = useState('');
  const [modalWholesalePrice, setModalWholesalePrice] = useState('');
  const [modalNote, setModalNote] = useState('');
  const [showPrintModal, setShowPrintModal] = useState(false);
  const { isSubmitting, runWithLock } = useSubmitLock();

  useModalBackHandler(!!pendingConfirm, () => setPendingConfirm(null), 'sp_confirm');
  useModalBackHandler(!!historyProduct, () => setHistoryProduct(null), 'sp_history');
  useModalBackHandler(showAddModal, () => setShowAddModal(false), 'sp_add_modal');
  useModalBackHandler(showPrintModal, () => setShowPrintModal(false), 'sp_print_modal');

  const currency = db.settings.currency || 'ج.م';
  const currentUser = db.currentUser || db.users?.[0];
  const currentUserName = currentUser?.name || 'المدير';

  const fifoLedger = useMemo(() => buildProductFifoLedger(db, activeBranchId), [db, activeBranchId]);

  const duplicateGroups = useMemo(() => findDuplicateProductCandidates(db), [db]);
  const duplicateProductIds = useMemo(() => {
    const ids = new Set<string>();
    for (const g of duplicateGroups) {
      for (const p of g.products) {
        ids.add(p.id);
      }
    }
    return ids;
  }, [duplicateGroups]);

  const enrichedProducts = useMemo(() => {
    return (db.products || []).map(p => {
      const bp = getProductForBranch(p, activeBranchId);
      const fifo = fifoLedger.getProductSummary(p.id, p.name);
      const verifiedCost = fifo.hasVerifiedPurchase && fifo.latestBuyPrice > 0 ? fifo.latestBuyPrice : undefined;
      const sellPrice = Number(bp.sellPrice || 0);
      const wholesalePrice = Number(bp.wholesalePrice || 0);
      const isBelowCost = verifiedCost !== undefined && sellPrice > 0 && sellPrice < verifiedCost;
      const isDuplicateCandidate = duplicateProductIds.has(p.id);
      const bData = p.branchesData?.[activeBranchId];
      const updatedAt = bData?.sellingPriceUpdatedAt || p.sellingPriceUpdatedAt;
      const updatedBy = bData?.sellingPriceUpdatedBy || p.sellingPriceUpdatedBy;

      return {
        raw: p,
        bp,
        fifo,
        verifiedCost,
        hasVerifiedCost: verifiedCost !== undefined,
        sellPrice,
        wholesalePrice,
        isBelowCost,
        isDuplicateCandidate,
        updatedAt,
        updatedBy
      };
    });
  }, [db.products, activeBranchId, fifoLedger, duplicateProductIds]);

  const filteredProducts = useMemo(() => {
    const q = normalizeArabicText(searchQuery);
    return enrichedProducts.filter(item => {
      if (filterMode === 'priced' && item.sellPrice <= 0) return false;
      if (filterMode === 'unpriced' && item.sellPrice > 0) return false;
      if (filterMode === 'below_cost' && !item.isBelowCost) return false;
      if (filterMode === 'duplicates' && !item.isDuplicateCandidate) return false;

      if (!q) return true;
      const nName = normalizeArabicText(item.raw.name);
      const nCode = (item.raw.code || '').toLowerCase();
      const nBarcode = (item.raw.barcode || '').toLowerCase();
      return nName.includes(q) || nCode.includes(q) || nBarcode.includes(q);
    });
  }, [enrichedProducts, filterMode, searchQuery]);

  const modalFilteredOptions = useMemo(() => {
    const q = normalizeArabicText(modalSearch);
    return (db.products || [])
      .filter(p => {
        if (!q) return true;
        return (
          normalizeArabicText(p.name).includes(q) ||
          (p.code || '').toLowerCase().includes(q) ||
          (p.barcode || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 60);
  }, [db.products, modalSearch]);

  const stats = useMemo(() => {
    let priced = 0;
    let unpriced = 0;
    let belowCost = 0;
    for (const item of enrichedProducts) {
      if (item.sellPrice > 0) priced++;
      else unpriced++;
      if (item.isBelowCost) belowCost++;
    }
    return {
      total: enrichedProducts.length,
      priced,
      unpriced,
      belowCost,
      duplicatesCount: duplicateGroups.length
    };
  }, [enrichedProducts, duplicateGroups.length]);

  const getDraft = (product: Product, bpSell: number, bpWholesale: number) => {
    const d = draftPrices[product.id];
    return {
      sell: d ? d.sell : (bpSell > 0 ? String(bpSell) : ''),
      wholesale: d ? d.wholesale : (bpWholesale > 0 ? String(bpWholesale) : '')
    };
  };

  const commitSellingPriceUpdate = (
    product: Product,
    newSellPrice: number,
    newWholesalePrice: number,
    note: string = '',
    approvedLossOverride: boolean = false
  ) => {
    runWithLock(() => {
      const cleanSell = roundMoney(newSellPrice);
      const cleanWholesale = roundMoney(newWholesalePrice);
      const bp = getProductForBranch(product, activeBranchId);
      const oldSellPrice = roundMoney(Number(bp.sellPrice || 0));
      const oldWholesalePrice = roundMoney(Number(bp.wholesalePrice || 0));
      const nowIso = new Date().toISOString();

      const historyEntry: SellingPriceHistoryEntry = {
        id: generateId('sph'),
        date: nowIso,
        oldSellPrice,
        newSellPrice: cleanSell,
        oldWholesalePrice,
        newWholesalePrice: cleanWholesale,
        updatedBy: currentUserName,
        branchId: activeBranchId,
        note: approvedLossOverride
          ? `${note ? note + ' - ' : ''}تم اعتماد سعر البيع رغم انخفاضه عن التكلفة أو عدم توفر تكلفة شراء موثقة`
          : note || undefined
      };

      const existingHistory = Array.isArray(product.sellingPriceHistory) ? product.sellingPriceHistory : [];
      const nextHistory = [historyEntry, ...existingHistory].slice(0, 100);

      const updatedProductBranch = updateProductBranchData(product, activeBranchId, {
        sellPrice: cleanSell,
        wholesalePrice: cleanWholesale,
        sellingPriceUpdatedAt: nowIso,
        sellingPriceUpdatedBy: currentUserName
      });

      const finalProduct: Product = {
        ...updatedProductBranch,
        sellPrice:
          activeBranchId === 'br_mawan' || activeBranchId === 'br_main' || !product.branchesData
            ? cleanSell
            : product.sellPrice,
        wholesalePrice:
          activeBranchId === 'br_mawan' || activeBranchId === 'br_main' || !product.branchesData
            ? cleanWholesale
            : product.wholesalePrice,
        sellingPriceUpdatedAt: nowIso,
        sellingPriceUpdatedBy: currentUserName,
        sellingPriceHistory: nextHistory
      };

      const updatedProducts = (db.products || []).map(p => (p.id === product.id ? finalProduct : p));
      const nextDb: AccountingDB = {
        ...db,
        products: updatedProducts,
        audit: [...(db.audit || [])]
      };

      logAudit(
        nextDb,
        'تحديث سعر البيع',
        `الصنف: ${product.name} | قطاعي: ${oldSellPrice} -> ${cleanSell} | جملة: ${oldWholesalePrice} -> ${cleanWholesale} | بواسطة: ${currentUserName}`
      );

      onUpdateDb(nextDb);
      setDraftPrices(prev => {
        const copy = { ...prev };
        delete copy[product.id];
        return copy;
      });
      setStatusBanner({
        type: 'success',
        text: `تم حفظ سعر بيع «${product.name}» بنجاح (${formatMoney(cleanSell, currency)}) — يسري على فواتير البيع الجديدة فقط دون تعديل أي فواتير تاريخية.`
      });
      setTimeout(() => setStatusBanner(null), 5000);
    });
  };

  const requestSaveRow = (
    product: Product,
    sellRaw: string,
    wholesaleRaw: string,
    verifiedCost?: number,
    hasVerifiedCost?: boolean,
    note: string = ''
  ) => {
    const rawSell = parseNum(sellRaw);
    const rawWholesale = wholesaleRaw.trim() === '' ? 0 : parseNum(wholesaleRaw);
    if (!isFiniteNonNegative(rawSell) || !isFiniteNonNegative(rawWholesale)) {
      setStatusBanner({
        type: 'error',
        text: `يرجى إدخال أسعار صالحة غير سالبة للصنف «${product.name}»`
      });
      return;
    }

    const newSellPrice = roundMoney(rawSell);
    const newWholesalePrice = roundMoney(rawWholesale);

    if (newSellPrice <= 0) {
      setStatusBanner({
        type: 'error',
        text: `يرجى إدخال سعر بيع قطاعي صحيح أكبر من صفر للصنف «${product.name}»`
      });
      return;
    }

    const isBelowVerifiedCost = hasVerifiedCost && verifiedCost !== undefined && newSellPrice < verifiedCost;
    const hasNoVerifiedCost = !hasVerifiedCost || verifiedCost === undefined;

    if (isBelowVerifiedCost || hasNoVerifiedCost) {
      setPendingConfirm({
        product,
        newSellPrice,
        newWholesalePrice,
        verifiedCost,
        hasVerifiedCost: !!hasVerifiedCost,
        note
      });
      return;
    }

    commitSellingPriceUpdate(product, newSellPrice, newWholesalePrice, note, false);
  };

  const formatTimestampAr = (iso?: string) => {
    if (!iso) return 'لم يحدّث بعد';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' }) +
      ' ' +
      d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  };

  const printDocuments = useMemo((): MovementPrintBlock[] => {
    const activeBranchName =
      (db.branches || []).find(b => b.id === activeBranchId)?.name || 'الفرع الرئيسي';
    return [
      {
        title: 'قائمة أسعار البيع المعتمدة',
        serialNo: `#SP-${getTodayDate()}`,
        date: getTodayDate(),
        partyLabel: 'نطاق التسعير',
        partyName: activeBranchName,
        badge: `${filteredProducts.length} صنف`,
        statement: 'الأسعار أدناه معتمدة يدويًا لفواتير البيع المستقبلية، وتكلفة الشراء مستخرجة حصريًا من فواتير المشتريات الموثقة.',
        tableHeaders: [
          { label: 'الكود', width: '14%', align: 'center' },
          { label: 'الصنف', width: '32%', align: 'right' },
          { label: 'الوحدة', width: '10%', align: 'center' },
          { label: 'آخر تكلفة موثقة', width: '16%', align: 'center' },
          { label: 'سعر البيع', width: '14%', align: 'center' },
          { label: 'سعر الجملة', width: '14%', align: 'center' }
        ],
        tableRows: filteredProducts.map(item => ({
          cols: [
            item.raw.code || '-',
            item.raw.name,
            item.raw.unit || 'قطعة',
            item.hasVerifiedCost && item.verifiedCost !== undefined
              ? `${item.verifiedCost.toFixed(2)}`
              : 'غير محدد',
            item.sellPrice > 0 ? item.sellPrice.toFixed(2) : 'غير مسعر',
            item.wholesalePrice > 0 ? item.wholesalePrice.toFixed(2) : '-'
          ]
        })),
        summaryLines: [
          { label: 'إجمالي الأصناف المعروضة', value: `${filteredProducts.length} صنف`, isTotal: true },
          { label: 'أصناف مسعرة', value: `${stats.priced} صنف` },
          { label: 'أصناف بدون سعر بيع', value: `${stats.unpriced} صنف` }
        ],
        createdBy: currentUserName
      }
    ];
  }, [filteredProducts, activeBranchId, db.branches, stats, currentUserName]);

  return (
    <div className="space-y-4 pb-12 w-full max-w-full overflow-x-hidden">
      {/* Header Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200 shrink-0">
                <Tag className="w-5 h-5" />
              </div>
              <h1 className="text-lg sm:text-xl font-black text-slate-900">
                إدارة أسعار البيع (Selling Prices)
              </h1>
            </div>
            <p className="text-xs text-slate-600 font-medium mt-1">
              اعتماد وحفظ أسعار البيع يدوياً لكل صنف — تسري الأسعار المحفوظة على الفواتير الجديدة فقط ولا تعدّل الفواتير التاريخية.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              type="button"
              onClick={() => {
                setModalSearch('');
                setModalSelectedId('');
                setModalSellPrice('');
                setModalWholesalePrice('');
                setModalNote('');
                setShowAddModal(true);
              }}
              className="px-3.5 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة / تحديث سعر بيع</span>
            </button>
            <button
              type="button"
              onClick={() => setShowPrintModal(true)}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span>معاينة وطباعة الأسعار</span>
            </button>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
            <div className="text-[11px] font-bold text-slate-500">إجمالي الأصناف</div>
            <div className="text-base font-black text-slate-900 mt-0.5">{stats.total}</div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">
            <div className="text-[11px] font-bold text-emerald-700">أصناف مسعّرة</div>
            <div className="text-base font-black text-emerald-900 mt-0.5">{stats.priced}</div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5">
            <div className="text-[11px] font-bold text-amber-700">بدون سعر بيع</div>
            <div className="text-base font-black text-amber-900 mt-0.5">{stats.unpriced}</div>
          </div>
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-2.5">
            <div className="text-[11px] font-bold text-rose-700">أقل من آخر شراء</div>
            <div className="text-base font-black text-rose-900 mt-0.5">{stats.belowCost}</div>
          </div>
        </div>
      </div>

      {/* Status Notification */}
      {statusBanner && (
        <div
          className={`rounded-xl p-3 border text-xs font-bold flex items-center justify-between gap-2 ${
            statusBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {statusBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="break-words">{statusBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="p-1 hover:bg-black/5 rounded-lg shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Non-destructive Duplicate Alert */}
      {duplicateGroups.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <CopyCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="font-black">تنبيه فحص التكرار غير التدميري: </span>
              <span>
                تم رصد {duplicateGroups.length} مجموعة أصناف قد تحتوي على تشابه أو تكرار في الاسم/الكود/الباركود (دون حذف أي بيانات تلقائياً).
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFilterMode(filterMode === 'duplicates' ? 'all' : 'duplicates')}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold shrink-0 cursor-pointer"
          >
            {filterMode === 'duplicates' ? 'عرض كل الأصناف' : 'مراجعة المكررات المحتملة'}
          </button>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-xs space-y-3">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث باسم الصنف أو الكود أو الباركود..."
            className="w-full pr-9 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-slate-900 focus:bg-white transition-colors"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {(
            [
              { id: 'all', label: `الكل (${stats.total})` },
              { id: 'priced', label: `مسعر (${stats.priced})` },
              { id: 'unpriced', label: `غير مسعر (${stats.unpriced})` },
              { id: 'below_cost', label: `أقل من التكلفة (${stats.belowCost})` },
              ...(duplicateGroups.length > 0
                ? [{ id: 'duplicates', label: `مرشحات تكرار (${duplicateGroups.length})` }]
                : [])
            ] as { id: FilterMode; label: string }[]
          ).map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterMode(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                filterMode === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile Cards Layout (< lg) - Zero Horizontal Scroll at 360px+ */}
      <div className="lg:hidden space-y-3">
        {filteredProducts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs font-bold text-slate-500">
            لا توجد أصناف مطابقة لبحثك الحالي
          </div>
        ) : (
          filteredProducts.map(item => {
            const draft = getDraft(item.raw, item.sellPrice, item.wholesalePrice);
            const numericDraftSell = parseNum(draft.sell);
            const draftBelowCost =
              item.hasVerifiedCost &&
              item.verifiedCost !== undefined &&
              numericDraftSell > 0 &&
              numericDraftSell < item.verifiedCost;

            return (
              <div
                key={item.raw.id}
                className={`bg-white rounded-2xl border p-3.5 shadow-xs space-y-3 ${
                  item.isBelowCost || draftBelowCost
                    ? 'border-rose-300 bg-rose-50/30'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-black text-sm text-slate-900 break-words">{item.raw.name}</div>
                    <div className="flex items-center gap-2 flex-wrap mt-1 text-[11px] text-slate-500 font-bold">
                      <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                        {item.raw.code || 'بدون كود'}
                      </span>
                      <span>الوحدة: {item.raw.unit || 'قطعة'}</span>
                      <span>الرصيد: {item.bp.currentQty}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHistoryProduct(item.raw)}
                    className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg shrink-0 cursor-pointer"
                    title="سجل تعديلات سعر البيع"
                  >
                    <History className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-2">
                    <div className="text-[10px] font-bold text-slate-500">تكلفة الشراء الموثقة</div>
                    {item.hasVerifiedCost && item.verifiedCost !== undefined ? (
                      <div className="font-black text-slate-900 mt-0.5">
                        {formatMoney(item.verifiedCost, currency)}
                      </div>
                    ) : (
                      <div className="font-black text-amber-700 mt-0.5">غير محدد</div>
                    )}
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-2">
                    <div className="text-[10px] font-bold text-slate-500">آخر تحديث</div>
                    <div className="font-bold text-slate-700 text-[11px] mt-0.5 truncate">
                      {item.updatedBy || 'غير مسجل'}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {formatTimestampAr(item.updatedAt)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="min-w-0">
                    <label className="block text-[10px] font-black text-slate-600 mb-1">
                      سعر البيع قطاعي
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={draft.sell}
                      onChange={(e) =>
                        setDraftPrices(prev => ({
                          ...prev,
                          [item.raw.id]: { ...draft, sell: e.target.value }
                        }))
                      }
                      placeholder="أدخل السعر"
                      className="w-full min-w-0 px-2.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-black text-slate-900 outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-[10px] font-black text-slate-600 mb-1">
                      سعر الجملة
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={draft.wholesale}
                      onChange={(e) =>
                        setDraftPrices(prev => ({
                          ...prev,
                          [item.raw.id]: { ...draft, wholesale: e.target.value }
                        }))
                      }
                      placeholder="اختياري"
                      className="w-full min-w-0 px-2.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>

                {draftBelowCost && item.verifiedCost !== undefined && (
                  <div className="text-[11px] font-bold text-rose-700 bg-rose-100/80 border border-rose-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      أقل من تكلفة الشراء الموثقة بفارق {(item.verifiedCost - numericDraftSell).toFixed(2)} {currency}
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() =>
                    requestSaveRow(
                      item.raw,
                      draft.sell,
                      draft.wholesale,
                      item.verifiedCost,
                      item.hasVerifiedCost
                    )
                  }
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>حفظ سعر البيع</span>
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Table Layout (>= lg) */}
      <div className="hidden lg:block bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-xs font-black">
                <th className="p-3">الكود</th>
                <th className="p-3">اسم الصنف</th>
                <th className="p-3 text-center">الوحدة</th>
                <th className="p-3 text-center">تكلفة الشراء الموثقة</th>
                <th className="p-3 text-center">سعر البيع قطاعي</th>
                <th className="p-3 text-center">سعر الجملة</th>
                <th className="p-3">آخر تحديث</th>
                <th className="p-3 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500 font-bold">
                    لا توجد أصناف مطابقة لبحثك الحالي
                  </td>
                </tr>
              ) : (
                filteredProducts.map(item => {
                  const draft = getDraft(item.raw, item.sellPrice, item.wholesalePrice);
                  const numericDraftSell = parseNum(draft.sell);
                  const draftBelowCost =
                    item.hasVerifiedCost &&
                    item.verifiedCost !== undefined &&
                    numericDraftSell > 0 &&
                    numericDraftSell < item.verifiedCost;

                  return (
                    <tr
                      key={item.raw.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        item.isBelowCost || draftBelowCost ? 'bg-rose-50/40' : ''
                      }`}
                    >
                      <td className="p-3 font-mono font-bold text-slate-600">{item.raw.code || '-'}</td>
                      <td className="p-3">
                        <div className="font-black text-slate-900">{item.raw.name}</div>
                        <div className="text-[11px] text-slate-500">
                          الرصيد: {item.bp.currentQty}
                          {item.isDuplicateCandidate && (
                            <span className="mr-2 text-amber-700 font-bold">• مرشح تشابه</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-center font-bold text-slate-700">{item.raw.unit || 'قطعة'}</td>
                      <td className="p-3 text-center">
                        {item.hasVerifiedCost && item.verifiedCost !== undefined ? (
                          <div>
                            <div className="font-black text-slate-900">
                              {formatMoney(item.verifiedCost, currency)}
                            </div>
                            {item.fifo.lastPurchaseDate && (
                              <div className="text-[10px] text-slate-500">{item.fifo.lastPurchaseDate}</div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 font-black">
                            غير محدد
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={draft.sell}
                          onChange={(e) =>
                            setDraftPrices(prev => ({
                              ...prev,
                              [item.raw.id]: { ...draft, sell: e.target.value }
                            }))
                          }
                          placeholder="غير مسعر"
                          className={`w-28 px-2.5 py-1.5 border rounded-lg text-center font-black outline-none ${
                            draftBelowCost
                              ? 'border-rose-400 bg-rose-50 text-rose-900'
                              : 'border-slate-300 bg-white text-slate-900 focus:border-emerald-600'
                          }`}
                        />
                      </td>
                      <td className="p-3 text-center">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={draft.wholesale}
                          onChange={(e) =>
                            setDraftPrices(prev => ({
                              ...prev,
                              [item.raw.id]: { ...draft, wholesale: e.target.value }
                            }))
                          }
                          placeholder="-"
                          className="w-24 px-2.5 py-1.5 border border-slate-300 bg-white rounded-lg text-center font-bold text-slate-800 outline-none focus:border-emerald-600"
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700">
                          <UserCheck className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{item.updatedBy || '-'}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-0.5">
                          <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{formatTimestampAr(item.updatedAt)}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() =>
                              requestSaveRow(
                                item.raw,
                                draft.sell,
                                draft.wholesale,
                                item.verifiedCost,
                                item.hasVerifiedCost
                              )
                            }
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-black text-[11px] flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>حفظ</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setHistoryProduct(item.raw)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer"
                            title="سجل الأسعار"
                          >
                            <History className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Update Selling Price Modal (Catalog Products Only - Zero Duplication) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-base text-slate-900">تحديث سعر بيع صنف من الدليل</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1.5 text-slate-500 hover:text-black rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-black text-slate-700">
                اختر الصنف الموجود في الدليل (يمنع إنشاء أصناف مكررة)
              </label>
              <input
                type="text"
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                placeholder="اكتب اسم الصنف أو كوده للتصفية..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-slate-900"
              />
              <select
                value={modalSelectedId}
                onChange={(e) => {
                  const id = e.target.value;
                  setModalSelectedId(id);
                  const found = (db.products || []).find(p => p.id === id);
                  if (found) {
                    const bp = getProductForBranch(found, activeBranchId);
                    setModalSellPrice(bp.sellPrice > 0 ? String(bp.sellPrice) : '');
                    setModalWholesalePrice(bp.wholesalePrice > 0 ? String(bp.wholesalePrice) : '');
                  }
                }}
                className="w-full min-w-0 px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-slate-900"
              >
                <option value="">-- اختر الصنف --</option>
                {modalFilteredOptions.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code || 'بدون كود'} - {p.unit || 'قطعة'})
                  </option>
                ))}
              </select>
            </div>

            {modalSelectedId && (() => {
              const sel = (db.products || []).find(p => p.id === modalSelectedId);
              if (!sel) return null;
              const fifo = fifoLedger.getProductSummary(sel.id, sel.name);
              const verifiedCost = fifo.hasVerifiedPurchase && fifo.latestBuyPrice > 0 ? fifo.latestBuyPrice : undefined;
              return (
                <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="text-xs font-bold flex items-center justify-between flex-wrap gap-2">
                    <span className="text-slate-600">تكلفة الشراء الموثقة:</span>
                    <span className="font-black text-slate-900">
                      {verifiedCost !== undefined ? formatMoney(verifiedCost, currency) : 'غير محدد'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-black text-slate-700 mb-1">
                        سعر البيع قطاعي *
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={modalSellPrice}
                        onChange={(e) => setModalSellPrice(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-black outline-none focus:border-emerald-600"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-black text-slate-700 mb-1">
                        سعر الجملة
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={modalWholesalePrice}
                        onChange={(e) => setModalWholesalePrice(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold outline-none focus:border-emerald-600"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">ملاحظة التحديث</label>
                    <input
                      type="text"
                      value={modalNote}
                      onChange={(e) => setModalNote(e.target.value)}
                      placeholder="سبب تعديل السعر (اختياري)"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs outline-none"
                    />
                  </div>
                </div>
              );
            })()}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={!modalSelectedId || isSubmitting}
                onClick={() => {
                  const sel = (db.products || []).find(p => p.id === modalSelectedId);
                  if (!sel) return;
                  const fifo = fifoLedger.getProductSummary(sel.id, sel.name);
                  const verifiedCost =
                    fifo.hasVerifiedPurchase && fifo.latestBuyPrice > 0 ? fifo.latestBuyPrice : undefined;
                  setShowAddModal(false);
                  requestSaveRow(
                    sel,
                    modalSellPrice,
                    modalWholesalePrice,
                    verifiedCost,
                    verifiedCost !== undefined,
                    modalNote
                  );
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-black cursor-pointer"
              >
                حفظ واعتماد السعر
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explicit Confirmation Modal for Selling Below Verified Cost or Unverified Purchase Cost */}
      {pendingConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl border-2 border-rose-300 shadow-2xl w-full max-w-md p-4 sm:p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-rose-100 text-rose-700 rounded-xl shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-black text-sm text-rose-950">
                  {pendingConfirm.hasVerifiedCost
                    ? 'تنبيه: سعر البيع أقل من تكلفة الشراء الموثقة'
                    : 'تنبيه: تكلفة الشراء غير محددة (لا توجد فاتورة شراء موثقة)'}
                </h3>
                <p className="text-xs text-slate-600 font-medium mt-1">
                  يرجى مراجعة التفاصيل قبل اعتماد سعر البيع الجديد:
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500 font-bold">الصنف:</span>
                <span className="font-black text-slate-900">{pendingConfirm.product.name}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500 font-bold">آخر تكلفة شراء موثقة:</span>
                <span className="font-black text-slate-900">
                  {pendingConfirm.hasVerifiedCost && pendingConfirm.verifiedCost !== undefined
                    ? formatMoney(pendingConfirm.verifiedCost, currency)
                    : 'تكلفة الشراء غير محددة'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500 font-bold">سعر البيع المراد حفظه:</span>
                <span className="font-black text-rose-700">
                  {formatMoney(pendingConfirm.newSellPrice, currency)}
                </span>
              </div>
              {pendingConfirm.hasVerifiedCost &&
                pendingConfirm.verifiedCost !== undefined &&
                pendingConfirm.verifiedCost > 0 && (
                  <div className="flex justify-between gap-2 border-t border-slate-200 pt-2">
                    <span className="text-rose-700 font-bold">الخسارة المتوقعة للوحدة:</span>
                    <span className="font-black text-rose-800">
                      {(pendingConfirm.verifiedCost - pendingConfirm.newSellPrice).toFixed(2)} {currency} (
                      {(
                        ((pendingConfirm.verifiedCost - pendingConfirm.newSellPrice) /
                          pendingConfirm.verifiedCost) *
                        100
                      ).toFixed(1)}
                      %)
                    </span>
                  </div>
                )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingConfirm(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold cursor-pointer"
              >
                إلغاء وتعديل السعر
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  const target = pendingConfirm;
                  setPendingConfirm(null);
                  commitSellingPriceUpdate(
                    target.product,
                    target.newSellPrice,
                    target.newWholesalePrice,
                    target.note,
                    true
                  );
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black cursor-pointer disabled:opacity-50"
              >
                اعتماد وحفظ السعر
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selling Price Audit History Modal */}
      {historyProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-sm text-slate-900">سجل تعديلات أسعار البيع</h3>
                <p className="text-xs text-slate-500 font-bold">{historyProduct.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryProduct(null)}
                className="p-1.5 text-slate-500 hover:text-black rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!historyProduct.sellingPriceHistory || historyProduct.sellingPriceHistory.length === 0 ? (
              <div className="text-center py-8 text-xs font-bold text-slate-500">
                لا توجد تعديلات مسجلة في سجل أسعار البيع لهذا الصنف حتى الآن.
              </div>
            ) : (
              <div className="space-y-2">
                {historyProduct.sellingPriceHistory.map(entry => (
                  <div
                    key={entry.id}
                    className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-black text-slate-900">
                        قطاعي: {entry.oldSellPrice ?? 0} ← {entry.newSellPrice} {currency}
                      </span>
                      <span className="text-[11px] text-slate-500 font-bold">{entry.updatedBy}</span>
                    </div>
                    {(entry.oldWholesalePrice || entry.newWholesalePrice) ? (
                      <div className="text-[11px] text-slate-600 font-bold">
                        جملة: {entry.oldWholesalePrice ?? 0} ← {entry.newWholesalePrice ?? 0} {currency}
                      </div>
                    ) : null}
                    <div className="text-[10px] text-slate-500">{formatTimestampAr(entry.date)}</div>
                    {entry.note && (
                      <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                        {entry.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Printable Price Catalog Modal */}
      {showPrintModal && (
        <UniversalPrintModal
          isOpen={showPrintModal}
          onClose={() => setShowPrintModal(false)}
          documentTitle="قائمة أسعار البيع"
          documents={printDocuments}
          settings={db.settings}
          defaultPaperSize="A4"
        />
      )}
    </div>
  );
};
