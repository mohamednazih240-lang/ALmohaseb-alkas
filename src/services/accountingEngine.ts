import {
  AccountingDB,
  Invoice,
  Voucher,
  TreasuryEntry,
  JournalEntry,
  StockMovement,
  Product,
  SimpleRecord,
  ReturnInvoice,
  PaymentMethod
} from '../types/accounting';
import {
  formatMoney,
  roundMoney,
  roundQty,
  toCents,
  fromCents,
  isFiniteNonNegative,
  isFinitePositive,
  assertJournalBalanced,
  logAudit,
  calculateCustomerBalance,
  calculateSupplierBalance,
  getProductForBranch,
  updateProductBranchData,
  createInvoiceJournal,
  createVoucherJournal,
  getNextUniqueVoucherNumber,
  buildProductFifoLedger,
  matchProductStrictly,
  generateUniqueProductCode,
  getTodayDate,
  RAHMA_INVOICE_17_ITEMS
} from './accountingStorage';

/**
 * ----------------------------------------------------------------------
 * CENTRAL ACCOUNTING ENGINE & IDEMPOTENCY SYSTEM (RAKEEZA ERP CORE)
 * ----------------------------------------------------------------------
 * Guarantees mathematical integrity, zero phantom duplicates, and atomic
 * consistency across all financial, inventory, and journal transactions.
 */

/**
 * Clean string for deterministic ID composition
 */
function cleanIdPart(val?: string | number): string {
  if (val === undefined || val === null) return '0';
  return String(val).trim().replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Deterministic Voucher ID Generator
 * Example: vch_inv_17_p0_payment
 */
export function getDeterministicVoucherId(
  invoiceId: string,
  paymentIndex: number = 0,
  type: 'receipt' | 'payment'
): string {
  return `vch_${cleanIdPart(invoiceId)}_p${paymentIndex}_${type}`;
}

/**
 * Deterministic Treasury Entry ID Generator
 * Example: tr_purchase_inv_17_p0_out
 */
export function getDeterministicTreasuryId(
  sourceType: string,
  sourceId: string,
  paymentIndex: number = 0,
  direction: 'in' | 'out'
): string {
  return `tr_${cleanIdPart(sourceType)}_${cleanIdPart(sourceId)}_p${paymentIndex}_${direction}`;
}

/**
 * Deterministic Journal Entry ID Generator
 * Example: jrn_purchase_inv_17
 */
export function getDeterministicJournalId(
  sourceType: string,
  sourceId: string
): string {
  return `jrn_${cleanIdPart(sourceType)}_${cleanIdPart(sourceId)}`;
}

/**
 * Deterministic Stock Movement ID Generator
 * Example: sm_inv_17_prd_101_wh_mawan
 */
export function getDeterministicStockMovementId(
  sourceId: string,
  productId: string,
  _warehouseId?: string
): string {
  return `sm_${cleanIdPart(sourceId)}_${cleanIdPart(productId)}`;
}

/**
 * Atomic Execution Result
 */
export interface AccountingEngineResult {
  success: boolean;
  db: AccountingDB;
  message: string;
  transactionId?: string;
}

/**
 * Post-mutation pre-commit invariant verification.
 * Ensures every affected journal balances strictly (debit === credit in cents),
 * invoice totals satisfy total === paid + remaining, and no NaN/Infinity values exist.
 */
export function validateDbTransactionIntegrity(
  nextDb: AccountingDB,
  impactedJournalIds: string[] = [],
  impactedInvoiceIds: string[] = [],
  impactedVoucherIds: string[] = []
): { ok: boolean; error?: string } {
  if (!nextDb) {
    return { ok: false, error: 'بيانات قاعدة البيانات غير صالحة.' };
  }

  for (const jId of impactedJournalIds) {
    const j = (nextDb.journals || []).find(entry => entry.id === jId);
    if (!j) {
      return { ok: false, error: `القيد المحاسبي (${jId}) مفقود بعد الترحيل.` };
    }
    const bal = assertJournalBalanced(j);
    if (!bal.balanced) {
      return { ok: false, error: bal.reason || 'القيد المحاسبي غير متوازن.' };
    }
  }

  for (const invId of impactedInvoiceIds) {
    const inv = (nextDb.invoices || []).find(i => i.id === invId);
    if (!inv) {
      return { ok: false, error: `الفاتورة (${invId}) مفقودة بعد الترحيل.` };
    }
    if (
      !isFiniteNonNegative(inv.total) ||
      !isFiniteNonNegative(inv.paid) ||
      !isFiniteNonNegative(inv.remaining)
    ) {
      return { ok: false, error: `قيم مالية غير صالحة في الفاتورة #${inv.number}.` };
    }
    if (inv.invoiceKind !== 'quote') {
      const diffCents = Math.abs(toCents(inv.total) - (toCents(inv.paid) + toCents(inv.remaining)));
      if (diffCents > 1) {
        return {
          ok: false,
          error: `خلل في تطابق إجمالي الفاتورة #${inv.number} (الإجمالي ${inv.total} != المدفوع ${inv.paid} + المتبقي ${inv.remaining}).`
        };
      }
    }
    for (const item of inv.items || []) {
      if (!isFinitePositive(item.qty) || !isFiniteNonNegative(item.unitPrice) || !isFiniteNonNegative(item.total)) {
        return { ok: false, error: `كمية أو سعر غير صالح للصنف "${item.productName}" في الفاتورة #${inv.number}.` };
      }
    }
  }

  for (const vId of impactedVoucherIds) {
    const v = (nextDb.vouchers || []).find(item => item.id === vId);
    if (!v) {
      return { ok: false, error: `السند (${vId}) مفقود بعد الترحيل.` };
    }
    if (!isFinitePositive(v.amount)) {
      return { ok: false, error: `مبلغ السند #${v.number} غير صالح.` };
    }
  }

  return { ok: true };
}

/**
 * 1. Process & Post Invoice (Sales or Purchases) Atomically
 * - Posts/updates invoice
 * - Deterministic stock movements (increases for purchases, decreases for sales)
 * - Updates product catalog currentQty and branch avgCost
 * - Posts single deterministic treasury entry per payment row (out for purchase, in for sale)
 * - Posts single deterministic linked voucher (payment voucher for purchase, receipt voucher for sale)
 * - Posts balanced double-entry journal entry
 * - Recalculates party (customer/supplier) balance
 * - Logs audit trail
 */
export function postInvoiceTransaction(
  db: AccountingDB,
  invoice: Invoice,
  operatorName: string = 'مدير النظام'
): AccountingEngineResult {
  if (!invoice || !invoice.id || !invoice.number) {
    return { success: false, db, message: '⚠️ بيانات الفاتورة الأساسية (الرقم أو المعرف) غير مكتملة.' };
  }

  // Deep-clone invoice so caller's state object is NEVER mutated if validation fails
  const workingInvoice = JSON.parse(JSON.stringify(invoice)) as Invoice;

  if (!workingInvoice.items || workingInvoice.items.length === 0) {
    return { success: false, db, message: '⚠️ لا يمكن ترحيل فاتورة بدون أصناف.' };
  }

  // Validate numeric fields & normalize decimal precision on items & header BEFORE mutating DB
  for (const it of workingInvoice.items) {
    const rawQty = Number(it.qty);
    const rawPrice = Number(it.unitPrice);
    const rawDisc = Number(it.discount ?? 0);
    if (!isFinitePositive(rawQty)) {
      return { success: false, db, message: `⚠️ الكمية غير صالحة للصنف "${it.productName || 'غير معروف'}". يجب أن تكون أكبر من صفر.` };
    }
    if (!isFiniteNonNegative(rawPrice)) {
      return { success: false, db, message: `⚠️ السعر غير صالح للصنف "${it.productName || 'غير معروف'}".` };
    }
    if (!isFiniteNonNegative(rawDisc)) {
      return { success: false, db, message: `⚠️ الخصم غير صالح للصنف "${it.productName || 'غير معروف'}".` };
    }
    it.qty = roundQty(rawQty);
    it.unitPrice = roundMoney(rawPrice);
    it.discount = roundMoney(rawDisc);
    const lineGross = roundMoney(it.qty * it.unitPrice);
    if (toCents(it.discount) > toCents(lineGross)) {
      return { success: false, db, message: `⚠️ خصم الصنف "${it.productName}" يتجاوز إجمالي السطر.` };
    }
    it.total = roundMoney(lineGross - it.discount);
  }

  workingInvoice.subtotal = roundMoney(Number(workingInvoice.subtotal ?? workingInvoice.items.reduce((s, x) => s + x.total, 0)));
  workingInvoice.discount = roundMoney(Number(workingInvoice.discount ?? 0));
  workingInvoice.tax = roundMoney(Number(workingInvoice.tax ?? 0));
  workingInvoice.extraIncomeVal = roundMoney(Number(workingInvoice.extraIncomeVal ?? 0));
  workingInvoice.total = roundMoney(Number(workingInvoice.total ?? 0));

  if (
    !isFiniteNonNegative(workingInvoice.subtotal) ||
    !isFiniteNonNegative(workingInvoice.discount) ||
    !isFiniteNonNegative(workingInvoice.tax) ||
    !isFiniteNonNegative(workingInvoice.extraIncomeVal) ||
    !isFiniteNonNegative(workingInvoice.total)
  ) {
    return { success: false, db, message: '⚠️ توجد قيم مالية غير صالحة أو سالبة في إجماليات الفاتورة.' };
  }

  if (toCents(workingInvoice.discount) > toCents(workingInvoice.subtotal)) {
    return { success: false, db, message: '⚠️ قيمة الخصم العام لا يمكن أن تتجاوز المجموع الفرعي للأصناف.' };
  }

  if (workingInvoice.paymentMethod === 'آجل') {
    workingInvoice.paid = 0;
    workingInvoice.remaining = workingInvoice.total;
    workingInvoice.payments = [];
  } else {
    const rawPaid = Number(workingInvoice.paid ?? 0);
    if (!isFiniteNonNegative(rawPaid)) {
      return { success: false, db, message: '⚠️ المبلغ المدفوع غير صالح.' };
    }
    if (toCents(rawPaid) > toCents(workingInvoice.total) + 1) {
      return {
        success: false,
        db,
        message: `⚠️ المبلغ المدفوع (${rawPaid.toFixed(2)}) يتجاوز إجمالي الفاتورة (${workingInvoice.total.toFixed(2)}).`
      };
    }
    workingInvoice.paid = roundMoney(Math.min(workingInvoice.total, rawPaid));
    workingInvoice.remaining = roundMoney(Math.max(0, workingInvoice.total - workingInvoice.paid));
    if (Array.isArray(workingInvoice.payments)) {
      workingInvoice.payments = workingInvoice.payments
        .filter(p => p && p.method !== 'آجل' && isFinitePositive(Number(p.amount)))
        .map(p => ({ ...p, amount: roundMoney(Number(p.amount)) }));
    }
  }
  workingInvoice.status = workingInvoice.paid <= 0 ? 'آجل' : workingInvoice.remaining <= 0 ? 'مدفوع' : 'جزئي';

  const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
  if (!updated.invoices) updated.invoices = [];
  if (!updated.vouchers) updated.vouchers = [];
  if (!updated.treasury) updated.treasury = [];
  if (!updated.stockMovements) updated.stockMovements = [];
  if (!updated.journals) updated.journals = [];
  if (!updated.products) updated.products = [];

  const invoiceId = workingInvoice.id;
  const invoiceNumber = workingInvoice.number;
  const isSaleReturn = workingInvoice.invoiceKind === 'sale_return' || (workingInvoice.type as string) === 'sale_return';
  const isPurchaseReturn = workingInvoice.invoiceKind === 'purchase_return' || (workingInvoice.type as string) === 'purchase_return';
  const isPurchase = !isSaleReturn && !isPurchaseReturn && (workingInvoice.type === 'purchase' || workingInvoice.invoiceKind === 'purchase');
  const isSale = !isSaleReturn && !isPurchaseReturn && (workingInvoice.type === 'sale' || workingInvoice.invoiceKind === 'sale' || workingInvoice.invoiceKind === 'wholesale');
  const branchId = workingInvoice.branchId || 'br_mawan';
  const warehouseId = workingInvoice.warehouseId || updated.warehouses[0]?.id || 'wh_mawan';

  const expectedSmType = isSaleReturn
    ? 'sale_return'
    : isPurchaseReturn
      ? 'purchase_return'
      : isPurchase
        ? 'purchase'
        : 'sale';
  const expectedTrPrefix = isPurchase
    ? `فاتورة مشتريات رقم ${invoiceNumber}`
    : isSaleReturn
      ? `مرتجع مبيعات رقم ${invoiceNumber}`
      : isPurchaseReturn
        ? `مرتجع مشتريات رقم ${invoiceNumber}`
        : `فاتورة مبيعات رقم ${invoiceNumber}`;

  // Guarantee strictly monotonic createdAt on same-date operations so FIFO preserves exact event order
  if (!workingInvoice.createdAt) {
    const maxExistingMs = updated.invoices.reduce((mx, i) => {
      const t = i.createdAt ? Date.parse(i.createdAt) : 0;
      return Number.isFinite(t) && t > mx ? t : mx;
    }, 0);
    const nextMs = Math.max(Date.now(), maxExistingMs + 1);
    workingInvoice.createdAt = new Date(nextMs).toISOString();
  }

  // 1. Remove previous linked items if updating an existing invoice to prevent stale orphaned records
  const previousInvIdx = (() => {
    const byId = updated.invoices.findIndex(i => i.id === invoiceId);
    return byId > -1 ? byId : updated.invoices.findIndex(i => i.number === invoiceNumber && i.type === workingInvoice.type);
  })();
  if (previousInvIdx > -1) {
    const prev = updated.invoices[previousInvIdx];
    (prev.items || []).forEach(oldItem => {
      const prod = updated.products.find(p => p.id === oldItem.productId || p.code === oldItem.productCode);
      if (prod) {
        const bp = getProductForBranch(prod, prev.branchId || branchId);
        let revertedQty = bp.currentQty;
        if (isSale) revertedQty = roundQty(revertedQty + oldItem.qty);
        else if (isPurchase) revertedQty = roundQty(revertedQty - oldItem.qty);
        else if (isSaleReturn) revertedQty = roundQty(revertedQty - oldItem.qty);
        else if (isPurchaseReturn) revertedQty = roundQty(revertedQty + oldItem.qty);

        const updatedProd = updateProductBranchData(prod, prev.branchId || branchId, { currentQty: revertedQty });
        const pIdx = updated.products.findIndex(p => p.id === prod.id);
        if (pIdx > -1) updated.products[pIdx] = updatedProd;
      }
    });

    updated.stockMovements = updated.stockMovements.filter(
      sm => sm.sourceId !== invoiceId && !(!sm.sourceId && sm.refNumber === invoiceNumber && sm.type === expectedSmType)
    );

    updated.treasury = updated.treasury.filter(tr => {
      if (tr.sourceId === invoiceId || (tr as any).invoiceId === invoiceId) return false;
      if (tr.id.startsWith(`tr_purchase_${invoiceId}`) || tr.id.startsWith(`tr_sale_${invoiceId}`)) return false;
      if (invoiceNumber && tr.description && tr.sourceType === expectedSmType && tr.description.includes(expectedTrPrefix)) return false;
      return true;
    });

    updated.journals = updated.journals.filter(j => j.sourceId !== invoiceId && j.id !== prev.journalEntryId);
    updated.invoices[previousInvIdx] = workingInvoice;
  } else {
    updated.invoices.unshift(workingInvoice);
  }

  // Pre-build FIFO ledger EXCLUDING this invoice so sales pull exact FIFO batch layers chronologically
  const priorFifoLedger = isSale ? buildProductFifoLedger(updated, branchId, invoiceId) : null;

  // 2. Validate & process stock movements + catalog updates
  const wh = updated.warehouses.find(w => w.id === warehouseId) || updated.warehouses[0];
  for (const item of workingInvoice.items || []) {
    const matchRes = matchProductStrictly(updated, {
      id: item.productId,
      code: item.productCode,
      name: item.productName,
      unit: item.unit
    });
    let prod = matchRes.exactMatch;

    // Rule: Sales & Sale Returns MUST use existing catalog items — block phantom creation
    if (!prod && (isSale || isSaleReturn || workingInvoice.invoiceKind === 'quote')) {
      return {
        success: false,
        db,
        message: `⚠️ لا يمكن ترحيل فاتورة البيع: الصنف "${item.productName || item.productCode || 'غير معروف'}" غير مسجل في دليل الأصناف. يرجى اختياره من الكتالوج المعتمد.`
      };
    }

    // Purchases: create new catalog item ONLY when strictly new (no auto-generated selling markups)
    if (!prod && item.productName && item.productName.trim()) {
      const candidateCode = item.productCode?.trim() || '';
      const newCode = (candidateCode && !updated.products.some(p => (p.code || '').trim().toLowerCase() === candidateCode.toLowerCase()))
        ? candidateCode
        : generateUniqueProductCode(updated);
      const unitBuy = isPurchase ? roundMoney(Number(item.unitPrice) || 0) : 0;
      prod = {
        id: (item.productId && item.productId.startsWith('prod_')) ? item.productId : `prod_${cleanIdPart(item.productName)}_${Date.now().toString(36)}`,
        name: item.productName.trim(),
        code: newCode,
        barcode: '',
        category: 'عامة',
        unit: item.unit || 'قطعة',
        buyPrice: unitBuy,
        sellPrice: 0,
        wholesalePrice: 0,
        minStock: 1,
        currentQty: 0,
        avgCost: unitBuy,
        branchesData: {
          [branchId]: {
            currentQty: 0,
            buyPrice: unitBuy,
            sellPrice: 0,
            wholesalePrice: 0,
            minStock: 1,
            avgCost: unitBuy
          }
        }
      };
      updated.products.push(prod);
      item.productId = prod.id;
      item.productCode = prod.code;
    } else if (prod) {
      item.productId = prod.id;
      item.productCode = prod.code;
    }

    if (prod) {
      const bp = getProductForBranch(prod, branchId);
      let qtyChange = 0;
      let newQty = bp.currentQty;
      let newBuyPrice = bp.buyPrice || 0;

      if (isSale) {
        qtyChange = -item.qty;
        newQty = roundQty(newQty - item.qty);
        const sim = priorFifoLedger!.simulateSaleFifoCost(prod.id, prod.name, item.qty);
        if (sim.hasVerifiedCost && sim.effectiveUnitCost !== undefined) {
          item.costPrice = Number(sim.effectiveUnitCost.toFixed(4));
          item.hasVerifiedCost = sim.hasFullVerifiedCost;
          item.uncoveredQty = sim.uncoveredQty;
        } else {
          item.costPrice = 0;
          item.hasVerifiedCost = false;
          item.uncoveredQty = Math.abs(Number(item.qty) || 0);
        }
      } else if (isPurchase) {
        qtyChange = item.qty;
        newBuyPrice = roundMoney(Number(item.unitPrice) || 0);
        newQty = roundQty(newQty + item.qty);
        item.costPrice = newBuyPrice;
        item.hasVerifiedCost = newBuyPrice > 0;
        item.uncoveredQty = 0;
      } else if (isSaleReturn) {
        qtyChange = item.qty;
        newQty = roundQty(newQty + item.qty);
      } else if (isPurchaseReturn) {
        qtyChange = -item.qty;
        newQty = roundQty(newQty - item.qty);
      }

      const updatedProd = updateProductBranchData(prod, branchId, {
        currentQty: newQty,
        buyPrice: newBuyPrice
      });
      const pIdx = updated.products.findIndex(p => p.id === prod!.id);
      if (pIdx > -1) updated.products[pIdx] = updatedProd;

      // Deterministic Stock Movement (normalized ID without warehouse suffix to prevent duplicates)
      const deterministicSmId = getDeterministicStockMovementId(invoiceId, prod.id);
      const smPayload: StockMovement = {
        id: deterministicSmId,
        date: workingInvoice.date,
        productId: prod.id,
        productName: prod.name,
        warehouseId,
        warehouseName: wh ? wh.name : 'المخزن الرئيسي',
        qtyChange,
        balanceAfter: newQty,
        unitCost: isSale ? (item.hasVerifiedCost ? item.costPrice : 0) : (item.costPrice || item.unitPrice),
        type: (isSale ? 'sale' : isPurchase ? 'purchase' : isSaleReturn ? 'sale_return' : 'purchase_return') as any,
        refNumber: workingInvoice.number,
        sourceId: invoiceId,
        branchId,
        branchName: workingInvoice.branchName || 'الفرع الرئيسي'
      };

      const existingSmIdx = updated.stockMovements.findIndex(sm => sm.id === deterministicSmId);
      if (existingSmIdx > -1) {
        updated.stockMovements[existingSmIdx] = smPayload;
      } else {
        updated.stockMovements.unshift(smPayload);
      }
    }
  }

  // 3. Process Treasury Entries & Linked Vouchers (IDEMPOTENT & DETERMINISTIC)
  const finalPaid = roundMoney(Number(workingInvoice.paid) || 0);
  const voucherType: 'receipt' | 'payment' = (isSale || isPurchaseReturn) ? 'receipt' : 'payment';
  const trDirection: 'in' | 'out' = (isPurchase || isSaleReturn) ? 'out' : 'in';

  if (finalPaid > 0) {
    const paymentRows = (workingInvoice.payments && workingInvoice.payments.length > 0)
      ? workingInvoice.payments
      : [{ method: workingInvoice.paymentMethod || 'نقدي', amount: finalPaid }];

    paymentRows.forEach((pLine, idx) => {
      const lineAmt = roundMoney(Number(pLine.amount) || 0);
      if (lineAmt > 0 && pLine.method !== 'آجل') {
        // 3.1 Single deterministic treasury entry
        const deterministicTrId = getDeterministicTreasuryId(
          expectedSmType,
          invoiceId,
          idx,
          trDirection
        );

        const trDescription = isPurchase
          ? `سداد فاتورة مشتريات رقم ${invoiceNumber} (${workingInvoice.partyName}) عبر ${pLine.method}`
          : isSaleReturn
            ? `صرف استرداد مرتجع مبيعات رقم ${invoiceNumber} (${workingInvoice.partyName}) عبر ${pLine.method}`
            : isPurchaseReturn
              ? `استرداد مرتجع مشتريات رقم ${invoiceNumber} (${workingInvoice.partyName}) عبر ${pLine.method}`
              : `تحصيل فاتورة مبيعات رقم ${invoiceNumber} (${workingInvoice.partyName}) عبر ${pLine.method}`;

        const trEntry: TreasuryEntry = {
          id: deterministicTrId,
          date: workingInvoice.date,
          direction: trDirection,
          amount: lineAmt,
          method: pLine.method,
          description: trDescription,
          sourceType: expectedSmType,
          sourceId: invoiceId,
          branchId,
          branchName: workingInvoice.branchName || 'الفرع الرئيسي'
        };

        const existingTrIdx = updated.treasury.findIndex(t => t.id === deterministicTrId);
        if (existingTrIdx > -1) {
          updated.treasury[existingTrIdx] = trEntry;
        } else {
          updated.treasury.unshift(trEntry);
        }
      }
    });

    // 3.2 Single deterministic AUTO voucher (NEVER delete manual installment vouchers)
    const isAutoV = (v: Voucher) => !v.isManualInstallment && (v.isAutoFromInvoice || v.id.startsWith('vch_'));
    const manualInstallmentsPaid = updated.vouchers
      .filter(v => v.invoiceId === invoiceId && !isAutoV(v))
      .reduce((s, v) => s + (Number(v.amount) || 0), 0);
    const autoPaidPortion = roundMoney(Math.max(0, finalPaid - manualInstallmentsPaid));

    const deterministicVoucherId = getDeterministicVoucherId(invoiceId, 0, voucherType);
    if (autoPaidPortion > 0) {
      let linkedVoucher = updated.vouchers.find(v =>
        isAutoV(v) && (
          v.id === deterministicVoucherId ||
          (v as any).invoiceId === invoiceId ||
          ((v as any).referenceNumber === invoiceNumber && v.type === voucherType)
        )
      );

      const voucherDesc = isSale
        ? `سند قبض مقابل فاتورة مبيعات رقم ${invoiceNumber} (${workingInvoice.partyName})`
        : isPurchaseReturn
          ? `سند قبض استرداد مرتجع مشتريات رقم ${invoiceNumber} (${workingInvoice.partyName})`
          : isSaleReturn
            ? `سند صرف استرداد مرتجع مبيعات رقم ${invoiceNumber} (${workingInvoice.partyName})`
            : `سند صرف مقابل فاتورة مشتريات رقم ${invoiceNumber} (${workingInvoice.partyName})`;

      if (linkedVoucher) {
        linkedVoucher.id = deterministicVoucherId;
        linkedVoucher.type = voucherType;
        linkedVoucher.amount = autoPaidPortion;
        linkedVoucher.date = workingInvoice.date;
        linkedVoucher.partyId = workingInvoice.partyId;
        linkedVoucher.partyName = workingInvoice.partyName || (voucherType === 'receipt' ? 'عميل نقدي' : 'مورد عام');
        linkedVoucher.paymentMethod = workingInvoice.paymentMethod || 'نقدي';
        linkedVoucher.description = voucherDesc;
        linkedVoucher.branchId = branchId;
        linkedVoucher.branchName = workingInvoice.branchName || 'الفرع الرئيسي';
        linkedVoucher.invoiceId = invoiceId;
        linkedVoucher.referenceNumber = invoiceNumber;
        linkedVoucher.isAutoFromInvoice = true;
        linkedVoucher.updatedAt = new Date().toISOString();
        linkedVoucher.updatedBy = operatorName;
      } else {
        const { number: vNum, nextSeq } = getNextUniqueVoucherNumber(updated, voucherType);
        const settingKey = voucherType === 'receipt' ? 'nextReceipt' : 'nextPayment';
        updated.settings[settingKey] = Math.max(updated.settings[settingKey] || 1, nextSeq + 1);

        linkedVoucher = {
          id: deterministicVoucherId,
          number: vNum,
          type: voucherType,
          date: workingInvoice.date,
          partyId: workingInvoice.partyId,
          partyName: workingInvoice.partyName || (voucherType === 'receipt' ? 'عميل نقدي' : 'مورد عام'),
          amount: autoPaidPortion,
          paymentMethod: workingInvoice.paymentMethod || 'نقدي',
          description: voucherDesc,
          referenceNumber: invoiceNumber,
          invoiceId,
          isAutoFromInvoice: true,
          branchId,
          branchName: workingInvoice.branchName || 'الفرع الرئيسي',
          createdAt: workingInvoice.createdAt || new Date().toISOString(),
          createdBy: workingInvoice.createdBy || operatorName
        };
        updated.vouchers.unshift(linkedVoucher);
      }

      updated.vouchers = updated.vouchers.filter(v => {
        if (v.id === deterministicVoucherId || !isAutoV(v)) return true;
        const isDuplicate = (v as any).invoiceId === invoiceId ||
                            ((v as any).referenceNumber === invoiceNumber && v.type === voucherType);
        return !isDuplicate;
      });
    } else {
      updated.vouchers = updated.vouchers.filter(v => !isAutoV(v) || ((v as any).invoiceId !== invoiceId && (v as any).referenceNumber !== invoiceNumber));
    }
  } else {
    updated.vouchers = updated.vouchers.filter(v => v.isManualInstallment || ((v as any).invoiceId !== invoiceId && (v as any).referenceNumber !== invoiceNumber));
    updated.treasury = updated.treasury.filter(tr => tr.sourceId !== invoiceId && !tr.id.startsWith(`tr_${isPurchase ? 'purchase' : 'sale'}_${invoiceId}`));
  }

  // 4. Create/update balanced double-entry journal entry
  const deterministicJournalId = getDeterministicJournalId(isPurchase ? 'purchase' : 'sale', invoiceId);
  const freshJournal = createInvoiceJournal(updated, workingInvoice);
  freshJournal.id = deterministicJournalId;
  freshJournal.sourceId = invoiceId;
  workingInvoice.journalEntryId = deterministicJournalId;

  const existingJournalIdx = updated.journals.findIndex(j => j.id === deterministicJournalId || j.sourceId === invoiceId);
  if (existingJournalIdx > -1) {
    updated.journals[existingJournalIdx] = freshJournal;
  } else {
    updated.journals.unshift(freshJournal);
  }

  // Keep synced copy of workingInvoice in updated.invoices
  const targetInvIdx = updated.invoices.findIndex(i => i.id === invoiceId);
  if (targetInvIdx > -1) updated.invoices[targetInvIdx] = workingInvoice;

  // 5. Update party balance
  if (workingInvoice.partyId) {
    if (isSale) {
      const cust = updated.customers.find(c => c.id === workingInvoice.partyId);
      if (cust) cust.balance = calculateCustomerBalance(updated, cust.id);
    } else {
      const supp = updated.suppliers.find(s => s.id === workingInvoice.partyId);
      if (supp) supp.balance = calculateSupplierBalance(updated, supp.id);
    }
  }

  // 6. Atomic Pre-Commit Verification & Rollback Guard
  const integrity = validateDbTransactionIntegrity(updated, [deterministicJournalId], [invoiceId]);
  if (!integrity.ok) {
    return {
      success: false,
      db,
      message: `⚠️ تم إلغاء الترحيل تلقائياً (Rollback) لحماية توازن الحسابات: ${integrity.error}`
    };
  }

  logAudit(
    updated,
    previousInvIdx > -1 ? 'تعديل وترحيل فاتورة' : 'إنشاء وترحيل فاتورة',
    `فاتورة ${isPurchase ? 'مشتريات' : 'مبيعات'} رقم ${invoiceNumber} بمبلغ ${formatMoney(workingInvoice.total, updated.settings.currency)} (مدفوع: ${finalPaid})`
  );

  return {
    success: true,
    db: updated,
    message: `تم ترحيل الفاتورة رقم ${invoiceNumber} وحركاتها المالية والمخزنية بنجاح بدون تكرار!`,
    transactionId: invoiceId
  };
}

/**
 * 2. Process & Post Manual Voucher Atomically
 */
export function postManualVoucherTransaction(
  db: AccountingDB,
  voucher: Voucher,
  operatorName: string = 'مدير النظام'
): AccountingEngineResult {
  if (!voucher || !voucher.id || !voucher.number) {
    return { success: false, db, message: '⚠️ بيانات السند الأساسية غير مكتملة.' };
  }
  const cleanAmount = roundMoney(Number(voucher.amount));
  if (!isFinitePositive(cleanAmount)) {
    return { success: false, db, message: '⚠️ مبلغ السند يجب أن يكون رقماً موجباً أكبر من صفر.' };
  }
  if (!voucher.partyId && !voucher.partyName?.trim()) {
    return { success: false, db, message: '⚠️ يرجى تحديد العميل أو المورد المرتبط بالسند.' };
  }
  if (voucher.paymentMethod === 'آجل') {
    return { success: false, db, message: '⚠️ سندات القبض والصرف النقدي/البنكي تتطلب وسيلة دفع فعلية (نقدي/تحويل/محفظة).' };
  }

  const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
  if (!updated.vouchers) updated.vouchers = [];
  if (!updated.treasury) updated.treasury = [];
  if (!updated.journals) updated.journals = [];

  const voucherId = voucher.id;
  const isReceipt = voucher.type === 'receipt';
  const trDirection: 'in' | 'out' = isReceipt ? 'in' : 'out';
  const branchId = voucher.branchId || 'br_mawan';

  const existingVIdx = updated.vouchers.findIndex(v => v.id === voucherId);
  const prevVoucher = existingVIdx > -1 ? { ...updated.vouchers[existingVIdx] } : null;

  const voucherToSave: Voucher = {
    ...(JSON.parse(JSON.stringify(voucher)) as Voucher),
    amount: cleanAmount,
    isManualInstallment: voucher.isAutoFromInvoice ? false : true,
    updatedAt: new Date().toISOString(),
    updatedBy: voucher.updatedBy || operatorName
  };

  // Validate overpayment against target linked invoice before mutating balances
  if (voucherToSave.invoiceId || (voucherToSave as any).referenceNumber) {
    const expectedInvType = voucherToSave.type === 'receipt' ? 'sale' : 'purchase';
    const targetInv =
      (voucherToSave.invoiceId ? updated.invoices.find(i => i.id === voucherToSave.invoiceId) : undefined) ||
      ((voucherToSave as any).referenceNumber
        ? updated.invoices.find(i => i.number === (voucherToSave as any).referenceNumber && i.type === expectedInvType)
        : undefined);
    if (targetInv) {
      voucherToSave.invoiceId = targetInv.id;
      voucherToSave.referenceNumber = targetInv.number;
      const otherPaid = roundMoney(
        updated.vouchers
          .filter(v =>
            v.id !== voucherId &&
            (v.invoiceId === targetInv.id || ((v as any).referenceNumber === targetInv.number && v.type === (targetInv.type === 'sale' ? 'receipt' : 'payment')))
          )
          .reduce((s, v) => s + (Number(v.amount) || 0), 0)
      );
      const maxAllowable = roundMoney(Math.max(0, targetInv.total - otherPaid));
      if (toCents(voucherToSave.amount) > toCents(maxAllowable) + 1) {
        return {
          success: false,
          db,
          message: `⚠️ مبلغ السند (${voucherToSave.amount}) يتجاوز المتبقي المستحق على الفاتورة #${targetInv.number} (${maxAllowable}).`
        };
      }
    }
  }

  // 1. Insert or replace voucher
  if (existingVIdx > -1) {
    updated.vouchers[existingVIdx] = voucherToSave;
  } else {
    updated.vouchers.unshift(voucherToSave);
  }

  // 2. Clean any old treasury entries (including direction changes) & insert fresh deterministic treasury entry
  updated.treasury = updated.treasury.filter(
    t => t.sourceId !== voucherId && !t.id.startsWith(`tr_voucher_${cleanIdPart(voucherId)}_`)
  );
  const deterministicTrId = `tr_voucher_${cleanIdPart(voucherId)}_${trDirection}`;
  const trEntry: TreasuryEntry = {
    id: deterministicTrId,
    date: voucherToSave.date,
    direction: trDirection,
    amount: voucherToSave.amount,
    method: voucherToSave.paymentMethod,
    description: `${isReceipt ? 'سند قبض' : 'سند صرف'} ${voucherToSave.number} - ${voucherToSave.partyName}: ${voucherToSave.description || ''}`,
    sourceType: voucherToSave.type,
    sourceId: voucherId,
    branchId,
    branchName: voucherToSave.branchName || 'الفرع الرئيسي'
  };
  updated.treasury.unshift(trEntry);

  // 3. Balanced journal entry
  const deterministicJournalId = `jrn_voucher_${cleanIdPart(voucherId)}`;
  const journal = createVoucherJournal(updated, voucherToSave);
  journal.id = deterministicJournalId;
  journal.sourceId = voucherId;
  voucherToSave.journalEntryId = deterministicJournalId;

  const existingJIdx = updated.journals.findIndex(j => j.id === deterministicJournalId || j.sourceId === voucherId);
  if (existingJIdx > -1) {
    updated.journals[existingJIdx] = journal;
  } else {
    updated.journals.unshift(journal);
  }

  // Helper to recompute an invoice's paid/remaining/status cleanly from all active vouchers
  const recomputeInvoicePayments = (invId?: string, refNum?: string, vType?: 'receipt' | 'payment') => {
    if (!invId && !refNum) return;
    const expectedInvType = vType === 'receipt' ? 'sale' : 'purchase';
    const inv =
      (invId ? updated.invoices.find(i => i.id === invId) : undefined) ||
      (refNum ? updated.invoices.find(i => i.number === refNum && i.type === expectedInvType) : undefined);
    if (!inv) return;
    const allVouchersForInv = updated.vouchers.filter(v =>
      (v as any).invoiceId === inv.id ||
      ((v as any).referenceNumber === inv.number && v.type === (inv.type === 'sale' ? 'receipt' : 'payment'))
    );
    const totalPaidOnVouchers = roundMoney(allVouchersForInv.reduce((s, v) => s + (Number(v.amount) || 0), 0));
    inv.paid = Math.min(roundMoney(inv.total), totalPaidOnVouchers);
    inv.remaining = roundMoney(Math.max(0, inv.total - inv.paid));
    inv.status = inv.paid <= 0 ? 'آجل' : inv.remaining <= 0 ? 'مدفوع' : 'جزئي';
  };

  // 4. Recalculate previous linked invoice (if edited/unlinked) AND current linked invoice
  if (prevVoucher && (prevVoucher.invoiceId !== voucherToSave.invoiceId || prevVoucher.type !== voucherToSave.type)) {
    recomputeInvoicePayments(prevVoucher.invoiceId, (prevVoucher as any).referenceNumber, prevVoucher.type);
  }
  recomputeInvoicePayments(voucherToSave.invoiceId, (voucherToSave as any).referenceNumber, voucherToSave.type);

  // 5. Recalculate old party (if party changed) AND current party balance
  const recomputePartyBalance = (pId?: string, receiptFlag?: boolean) => {
    if (!pId) return;
    if (receiptFlag) {
      const cust = updated.customers.find(c => c.id === pId);
      if (cust) cust.balance = calculateCustomerBalance(updated, cust.id);
    } else {
      const supp = updated.suppliers.find(s => s.id === pId);
      if (supp) supp.balance = calculateSupplierBalance(updated, supp.id);
    }
  };
  if (prevVoucher && (prevVoucher.partyId !== voucherToSave.partyId || prevVoucher.type !== voucherToSave.type)) {
    recomputePartyBalance(prevVoucher.partyId, prevVoucher.type === 'receipt');
  }
  recomputePartyBalance(voucherToSave.partyId, isReceipt);

  // 6. Atomic Pre-Commit Verification & Rollback Guard
  const integrity = validateDbTransactionIntegrity(updated, [deterministicJournalId], [], [voucherId]);
  if (!integrity.ok) {
    return {
      success: false,
      db,
      message: `⚠️ تم إلغاء حفظ السند (Rollback): ${integrity.error}`
    };
  }

  logAudit(
    updated,
    existingVIdx > -1 ? (isReceipt ? 'تعديل سند قبض' : 'تعديل سند صرف') : (isReceipt ? 'تسجيل سند قبض' : 'تسجيل سند صرف'),
    `سند رقم ${voucherToSave.number} بمبلغ ${formatMoney(voucherToSave.amount, updated.settings.currency)} للطرف ${voucherToSave.partyName} بواسطة [${operatorName}]`
  );

  return {
    success: true,
    db: updated,
    message: `تم حفظ ${isReceipt ? 'سند القبض' : 'سند الصرف'} رقم ${voucherToSave.number} وترحيل أثره المالي بنجاح!`,
    transactionId: voucherId
  };
}

/**
 * 3. Atomic Cancellation / Deletion of an Invoice
 * Completely and cleanly reverses:
 * - Stock movements & restores catalog quantities
 * - Treasury entries (restoring treasury cash balance)
 * - Linked vouchers & their treasury entries
 * - Journals
 * - Returns
 * - Party balances
 */
export function cancelOrDeleteInvoiceTransaction(
  db: AccountingDB,
  invoiceId: string,
  operatorName: string = 'مدير النظام',
  reason: string = 'إلغاء وحذف الفاتورة'
): AccountingEngineResult {
  const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
  const targetInv = (updated.invoices || []).find(i => i.id === invoiceId);
  if (!targetInv) {
    return { success: false, db, message: 'الفاتورة غير موجودة للنظام.' };
  }

  const isSale = targetInv.type === 'sale' || targetInv.invoiceKind === 'sale' || targetInv.invoiceKind === 'wholesale';
  const isPurchase = targetInv.type === 'purchase' || targetInv.invoiceKind === 'purchase';
  const isSaleReturn = targetInv.invoiceKind === 'sale_return';
  const isPurchaseReturn = targetInv.invoiceKind === 'purchase_return';
  const targetBranch = targetInv.branchId || 'br_mawan';

  // 1. Revert stock in catalog
  (targetInv.items || []).forEach(oldItem => {
    const prod = updated.products.find(p => p.id === oldItem.productId || p.code === oldItem.productCode);
    if (prod) {
      const bp = getProductForBranch(prod, targetBranch);
      let revertedQty = bp.currentQty;
      if (isSale) revertedQty += oldItem.qty;
      else if (isPurchase) revertedQty -= oldItem.qty;
      else if (isSaleReturn) revertedQty -= oldItem.qty;
      else if (isPurchaseReturn) revertedQty += oldItem.qty;

      const updatedProd = updateProductBranchData(prod, targetBranch, { currentQty: revertedQty });
      const pIdx = updated.products.findIndex(p => p.id === prod.id);
      if (pIdx > -1) updated.products[pIdx] = updatedProd;
    }
  });

  const expectedCancelSmType = isSaleReturn
    ? 'sale_return'
    : isPurchaseReturn
      ? 'purchase_return'
      : isPurchase
        ? 'purchase'
        : 'sale';
  const expectedCancelVoucherType: 'receipt' | 'payment' = (isSale || isPurchaseReturn) ? 'receipt' : 'payment';
  const expectedCancelTrPrefix = isPurchase
    ? `فاتورة مشتريات رقم ${targetInv.number}`
    : `فاتورة مبيعات رقم ${targetInv.number}`;

  // 2. Remove stock movements strictly for this invoice
  updated.stockMovements = (updated.stockMovements || []).filter(
    sm => sm.sourceId !== targetInv.id && !(!sm.sourceId && sm.refNumber === targetInv.number && sm.type === expectedCancelSmType)
  );

  // 3. Remove treasury entries strictly for this invoice
  updated.treasury = (updated.treasury || []).filter(tr => {
    if (tr.sourceId === targetInv.id || (tr as any).invoiceId === targetInv.id) return false;
    if (tr.id.startsWith(`tr_purchase_${targetInv.id}`) || tr.id.startsWith(`tr_sale_${targetInv.id}`)) return false;
    if (targetInv.number && tr.description && tr.sourceType === expectedCancelSmType && tr.description.includes(expectedCancelTrPrefix)) return false;
    return true;
  });

  // 4. Remove linked vouchers & their treasury entries
  const linkedVoucherIds = new Set<string>();
  if (updated.vouchers) {
    updated.vouchers = updated.vouchers.filter(v => {
      const isLinked = (v as any).sourceId === targetInv.id ||
                       (v as any).invoiceId === targetInv.id ||
                       ((v as any).referenceNumber === targetInv.number && v.type === expectedCancelVoucherType) ||
                       (v.type === expectedCancelVoucherType && v.description && v.description.includes(expectedCancelTrPrefix));
      if (isLinked) {
        linkedVoucherIds.add(v.id);
        return false;
      }
      return true;
    });

    if (linkedVoucherIds.size > 0) {
      updated.treasury = updated.treasury.filter(
        tr => !linkedVoucherIds.has(tr.sourceId || '') && !linkedVoucherIds.has(tr.id)
      );
    }
  }

  // 5. Remove journals
  updated.journals = (updated.journals || []).filter(
    j => j.sourceId !== targetInv.id && j.id !== targetInv.journalEntryId && !linkedVoucherIds.has(j.sourceId || '')
  );

  // 6. Remove returns if any
  if (updated.returns) {
    updated.returns = updated.returns.filter(
      r => r.originalInvoiceId !== targetInv.id && !(r.number === targetInv.number && r.type === targetInv.type)
    );
  }

  // 7. Remove the invoice itself & permanently tombstone its ID
  updated.invoices = updated.invoices.filter(i => i.id !== targetInv.id);
  updated.deletedInvoiceIds = Array.from(new Set([...(updated.deletedInvoiceIds || []), targetInv.id]));

  // 8. Update party balance
  if (targetInv.partyId) {
    if (isSale) {
      const cust = updated.customers.find(c => c.id === targetInv.partyId);
      if (cust) cust.balance = calculateCustomerBalance(updated, cust.id);
    } else {
      const supp = updated.suppliers.find(s => s.id === targetInv.partyId);
      if (supp) supp.balance = calculateSupplierBalance(updated, supp.id);
    }
  }

  logAudit(
    updated,
    'حذف وإلغاء فاتورة وعكس الأرصدة',
    `تم إلغاء فاتورة رقم ${targetInv.number} (${targetInv.partyName}) بمبلغ ${formatMoney(targetInv.total, updated.settings.currency)} بواسطة [${operatorName}] - السبب: ${reason}`
  );

  return {
    success: true,
    db: updated,
    message: `تم إلغاء الفاتورة رقم ${targetInv.number} وعكس جميع حركاتها المحاسبية والمخزنية وعودة الأرصدة لمكانها الصحيح بنجاح!`,
    transactionId: targetInv.id
  };
}

/**
 * 4. Atomic Cancellation / Deletion of a Voucher
 * Completely and cleanly reverses:
 * - Treasury entry (restoring treasury balance)
 * - Journal entry
 * - Reverts invoice paid and remaining amount
 * - Party balance
 */
export function cancelOrDeleteVoucherTransaction(
  db: AccountingDB,
  voucherId: string,
  operatorName: string = 'مدير النظام',
  reason: string = 'إلغاء وحذف السند'
): AccountingEngineResult {
  const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
  const targetVoucher = (updated.vouchers || []).find(v => v.id === voucherId);
  if (!targetVoucher) {
    return { success: false, db, message: 'السند غير موجود بالنظام.' };
  }

  const isReceipt = targetVoucher.type === 'receipt';

  // 1. Remove treasury entry
  updated.treasury = (updated.treasury || []).filter(
    tr => tr.sourceId !== targetVoucher.id && tr.id !== targetVoucher.id && !tr.id.includes(targetVoucher.id)
  );

  // 2. Remove journal entry
  updated.journals = (updated.journals || []).filter(
    j => j.sourceId !== targetVoucher.id && j.id !== targetVoucher.journalEntryId
  );

  // 3. Remove voucher
  updated.vouchers = updated.vouchers.filter(v => v.id !== targetVoucher.id);

  // 4. If linked to an invoice, re-sum remaining vouchers for this invoice accurately
  if (targetVoucher.invoiceId || (targetVoucher as any).referenceNumber) {
    const expectedInvType = isReceipt ? 'sale' : 'purchase';
    const linkedInv =
      (targetVoucher.invoiceId ? updated.invoices.find(i => i.id === targetVoucher.invoiceId) : undefined) ||
      ((targetVoucher as any).referenceNumber
        ? updated.invoices.find(i => i.number === (targetVoucher as any).referenceNumber && i.type === expectedInvType)
        : undefined);
    if (linkedInv) {
      const expectedVoucherType = isReceipt ? 'receipt' : 'payment';
      const remainingVouchersPaid = updated.vouchers
        .filter(v =>
          v.invoiceId === linkedInv.id ||
          ((v as any).referenceNumber === linkedInv.number && v.type === expectedVoucherType)
        )
        .reduce((s, v) => s + (Number(v.amount) || 0), 0);
      linkedInv.paid = roundMoney(remainingVouchersPaid);
      linkedInv.remaining = roundMoney(Math.max(0, linkedInv.total - linkedInv.paid));
      linkedInv.status = linkedInv.paid <= 0 ? 'آجل' : linkedInv.remaining <= 0 ? 'مدفوع' : 'جزئي';
    }
  }

  // 5. Update party balance
  if (targetVoucher.partyId) {
    if (isReceipt) {
      const cust = updated.customers.find(c => c.id === targetVoucher.partyId);
      if (cust) cust.balance = calculateCustomerBalance(updated, cust.id);
    } else {
      const supp = updated.suppliers.find(s => s.id === targetVoucher.partyId);
      if (supp) supp.balance = calculateSupplierBalance(updated, supp.id);
    }
  }

  logAudit(
    updated,
    isReceipt ? 'حذف سند قبض وعكس الخزينة' : 'حذف سند صرف وعكس الخزينة',
    `تم إلغاء سند رقم ${targetVoucher.number} بقيمة ${formatMoney(targetVoucher.amount, updated.settings.currency)} بواسطة [${operatorName}] - السبب: ${reason}`
  );

  return {
    success: true,
    db: updated,
    message: `تم إلغاء ${isReceipt ? 'سند القبض' : 'سند الصرف'} رقم ${targetVoucher.number} وعكس أثره على الخزينة والحساب بنجاح!`,
    transactionId: targetVoucher.id
  };
}

/**
 * ----------------------------------------------------------------------
 * 5. COMPREHENSIVE RETROACTIVE AUDIT & DEDUPLICATION ENGINE
 * ----------------------------------------------------------------------
 * Scans all historical invoices, vouchers, and treasury entries:
 * 1. Detects duplicate payment vouchers for purchase invoices (e.g. Invoice 17)
 * 2. Detects duplicate treasury deductions for purchase invoices
 * 3. Removes phantom treasury deductions so treasury balance returns to exact truth
 * 4. Assigns deterministic IDs to prevent re-duplication
 */
export function reconcileAndDeduplicateAllFinancialRecords(db: AccountingDB): {
  db: AccountingDB;
  duplicateVouchersRemoved: number;
  duplicateTreasuryRemoved: number;
  fixedInvoicesCount: number;
  fixedDiscrepanciesCount: number;
  vouchersReconciledCount: number;
} {
  if (!db) {
    return {
      db,
      duplicateVouchersRemoved: 0,
      duplicateTreasuryRemoved: 0,
      fixedInvoicesCount: 0,
      fixedDiscrepanciesCount: 0,
      vouchersReconciledCount: 0
    };
  }
  const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
  if (!updated.invoices) updated.invoices = [];
  if (!updated.vouchers) updated.vouchers = [];
  if (!updated.treasury) updated.treasury = [];
  if (!updated.expenses) updated.expenses = [];
  if (!updated.revenues) updated.revenues = [];
  if (!updated.products) updated.products = [];
  if (!updated.stockMovements) updated.stockMovements = [];
  if (!updated.customers) updated.customers = [];
  if (!updated.suppliers) updated.suppliers = [];

  let duplicateVouchersRemoved = 0;
  let duplicateTreasuryRemoved = 0;
  let fixedInvoicesCount = 0;
  let fixedDiscrepanciesCount = 0;
  let vouchersReconciledCount = 0;

  const defaultBranchId = updated.branches?.[0]?.id || 'br_mawan';
  const defaultBranchName = updated.branches?.[0]?.name || 'الفرع الرئيسي - شركة الموان';

  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matchesInvNumberText = (text: string | undefined, invNum: string): boolean => {
    if (!text || !invNum) return false;
    const cleanNum = String(invNum).trim();
    if (!cleanNum) return false;
    const re = new RegExp(`(?:رقم|#)\\s*${escapeRegex(cleanNum)}(?![0-9A-Za-z])`);
    return re.test(text);
  };

  const isAutoV = (v: Voucher): boolean => !v.isManualInstallment && (Boolean(v.isAutoFromInvoice) || v.id.startsWith('vch_'));

  // 1. Audit & reconcile every posted invoice against its Vouchers (receipt/payment) and Treasury entries (in/out)
  updated.invoices.forEach(inv => {
    if (!inv) return;
    const kind = (inv.invoiceKind || inv.type) as string;
    const rawType = inv.type as string;
    if (kind === 'quote' || kind === 'order' || rawType === 'quote' || rawType === 'order') return;

    const isSaleReturn = kind === 'sale_return';
    const isPurchaseReturn = kind === 'purchase_return';
    const isPurchase = !isSaleReturn && !isPurchaseReturn && (inv.type === 'purchase' || kind === 'purchase');
    const isSale = !isSaleReturn && !isPurchaseReturn && (inv.type === 'sale' || kind === 'sale' || kind === 'wholesale');
    if (!isPurchase && !isSale && !isSaleReturn && !isPurchaseReturn) return;

    // Receipt ('receipt' / 'in') for Sales, Wholesale, and Purchase Returns
    // Payment ('payment' / 'out') for Purchases and Sale Returns
    const expectedVoucherType: 'receipt' | 'payment' = (isSale || isPurchaseReturn) ? 'receipt' : 'payment';
    const expectedTrDirection: 'in' | 'out' = (isPurchase || isSaleReturn) ? 'out' : 'in';
    const expectedSourceType = isSaleReturn
      ? 'sale_return'
      : isPurchaseReturn
        ? 'purchase_return'
        : isPurchase
          ? 'purchase'
          : (inv.invoiceKind === 'wholesale' ? 'wholesale' : 'sale');

    const branchId = inv.branchId || defaultBranchId;
    const branchName = inv.branchName || updated.branches?.find(b => b.id === branchId)?.name || defaultBranchName;
    const invDate = inv.date || getTodayDate();
    const partyDefaultName = (expectedVoucherType === 'receipt')
      ? (isPurchaseReturn ? 'مورد عام' : 'عميل نقدي')
      : (isSaleReturn ? 'عميل نقدي' : 'مورد عام');
    const partyName = inv.partyName || partyDefaultName;

    const nonCreditSplits = (inv.payments || []).filter(p => p && p.method && p.method !== 'آجل' && Number(p.amount) > 0);
    const resolvedMethod: PaymentMethod = (nonCreditSplits[0]?.method as PaymentMethod)
      || (inv.paymentMethod && inv.paymentMethod !== 'آجل' ? inv.paymentMethod : 'نقدي');

    const rawPaid = Number(inv.paid) || 0;
    const total = Number(inv.total) || 0;
    const effectivePaid = rawPaid > 0
      ? Math.min(total > 0 ? total : rawPaid, rawPaid)
      : (inv.status === 'مدفوع' && inv.paymentMethod && inv.paymentMethod !== 'آجل' && total > 0 ? total : 0);

    // Ensure manual installment vouchers linked to this invoice have the right type & invoice binding
    const manualInstallments = updated.vouchers.filter(v =>
      !isAutoV(v) && (
        v.invoiceId === inv.id ||
        ((v as any).referenceNumber && String((v as any).referenceNumber).trim() === String(inv.number).trim() && v.type === expectedVoucherType)
      )
    );
    manualInstallments.forEach(mv => {
      if (mv.invoiceId === inv.id && mv.type !== expectedVoucherType) {
        mv.type = expectedVoucherType;
        vouchersReconciledCount++;
        fixedDiscrepanciesCount++;
      }
      if (!mv.invoiceId) mv.invoiceId = inv.id;
      if (!mv.referenceNumber) mv.referenceNumber = inv.number;
      if (!mv.branchId) {
        mv.branchId = branchId;
        mv.branchName = branchName;
      }
    });

    const manualInstallmentsPaid = manualInstallments.reduce((s, v) => s + (Number(v.amount) || 0), 0);
    const autoExpectedPaid = roundMoney(Math.max(0, effectivePaid - manualInstallmentsPaid));

    // 1.1 Find ALL auto vouchers linked to this invoice (even if previously misclassified with wrong v.type!)
    const matchesInvoiceDescForVoucher = (v: Voucher): boolean => {
      if (!v.description || !inv.number) return false;
      if (!matchesInvNumberText(v.description, inv.number)) return false;
      if (isSale && (v.description.includes('مبيعات') || v.description.includes('بيع'))) return !v.description.includes('مرتجع');
      if (isPurchase && (v.description.includes('مشتريات') || v.description.includes('شراء'))) return !v.description.includes('مرتجع');
      if (isSaleReturn && v.description.includes('مرتجع') && v.description.includes('مبيع')) return true;
      if (isPurchaseReturn && v.description.includes('مرتجع') && v.description.includes('مشتر')) return true;
      return false;
    };

    const autoLinkedVouchers = updated.vouchers.filter(v =>
      isAutoV(v) && (
        v.invoiceId === inv.id ||
        (v as any).sourceId === inv.id ||
        ((v as any).referenceNumber && String((v as any).referenceNumber).trim() === String(inv.number).trim() && (v.type === expectedVoucherType || matchesInvoiceDescForVoucher(v))) ||
        matchesInvoiceDescForVoucher(v)
      )
    );

    const expectedVoucherDesc = isSale
      ? `سند قبض مقابل فاتورة مبيعات رقم ${inv.number} (${partyName}) عبر ${resolvedMethod}`
      : isPurchaseReturn
        ? `سند قبض استرداد مرتجع مشتريات رقم ${inv.number} (${partyName}) عبر ${resolvedMethod}`
        : isSaleReturn
          ? `سند صرف استرداد مرتجع مبيعات رقم ${inv.number} (${partyName}) عبر ${resolvedMethod}`
          : `سند صرف مقابل فاتورة مشتريات رقم ${inv.number} (${partyName}) عبر ${resolvedMethod}`;

    const detVoucherId = getDeterministicVoucherId(inv.id, 0, expectedVoucherType);

    if (autoExpectedPaid <= 0) {
      if (autoLinkedVouchers.length > 0) {
        duplicateVouchersRemoved += autoLinkedVouchers.length;
        vouchersReconciledCount += autoLinkedVouchers.length;
        const removeIds = new Set(autoLinkedVouchers.map(v => v.id));
        updated.vouchers = updated.vouchers.filter(v => !removeIds.has(v.id));
      }
    } else {
      if (autoLinkedVouchers.length === 0) {
        const { number: vNum, nextSeq } = getNextUniqueVoucherNumber(updated, expectedVoucherType);
        const settingKey = expectedVoucherType === 'receipt' ? 'nextReceipt' : 'nextPayment';
        updated.settings[settingKey] = Math.max(updated.settings[settingKey] || 1, nextSeq + 1);

        updated.vouchers.unshift({
          id: detVoucherId,
          number: vNum,
          type: expectedVoucherType,
          date: invDate,
          partyId: inv.partyId,
          partyName,
          amount: autoExpectedPaid,
          paymentMethod: resolvedMethod,
          description: expectedVoucherDesc,
          referenceNumber: inv.number,
          invoiceId: inv.id,
          isAutoFromInvoice: true,
          branchId,
          branchName,
          journalEntryId: inv.journalEntryId,
          createdAt: inv.createdAt || new Date().toISOString(),
          createdBy: inv.createdBy || updated.currentUser?.name || 'مدير النظام'
        });
        vouchersReconciledCount++;
        fixedInvoicesCount++;
      } else {
        const primary = autoLinkedVouchers[0];
        const needsUpdate =
          primary.id !== detVoucherId ||
          primary.type !== expectedVoucherType ||
          Math.abs((Number(primary.amount) || 0) - autoExpectedPaid) > 0.01 ||
          primary.invoiceId !== inv.id ||
          primary.referenceNumber !== inv.number ||
          primary.paymentMethod !== resolvedMethod ||
          primary.date !== invDate ||
          primary.partyName !== partyName ||
          !primary.isAutoFromInvoice;

        if (needsUpdate) {
          primary.id = detVoucherId;
          primary.type = expectedVoucherType;
          primary.amount = autoExpectedPaid;
          primary.date = invDate;
          primary.partyId = inv.partyId;
          primary.partyName = partyName;
          primary.paymentMethod = resolvedMethod;
          primary.description = expectedVoucherDesc;
          primary.invoiceId = inv.id;
          primary.referenceNumber = inv.number;
          primary.isAutoFromInvoice = true;
          primary.branchId = branchId;
          primary.branchName = branchName;
          vouchersReconciledCount++;
          fixedDiscrepanciesCount++;
        }

        if (autoLinkedVouchers.length > 1) {
          const dupIds = new Set(autoLinkedVouchers.slice(1).map(d => d.id));
          updated.vouchers = updated.vouchers.filter(v => !dupIds.has(v.id));
          duplicateVouchersRemoved += dupIds.size;
          vouchersReconciledCount += dupIds.size;
          fixedInvoicesCount++;
        }
      }
    }

    // 1.2 Find ALL treasury entries linked to this invoice (by sourceId, deterministic ID, or exact description match)
    const matchesTreasuryDescForInv = (tr: TreasuryEntry): boolean => {
      if (!tr.description || !inv.number) return false;
      if (!matchesInvNumberText(tr.description, inv.number)) return false;
      if (isSale && (tr.description.includes('فاتورة مبيعات') || tr.description.includes('تحصيل فاتورة مبيعات'))) return !tr.description.includes('مرتجع');
      if (isPurchase && (tr.description.includes('فاتورة مشتريات') || tr.description.includes('سداد فاتورة مشتريات'))) return !tr.description.includes('مرتجع');
      if (isSaleReturn && tr.description.includes('مرتجع مبيعات')) return true;
      if (isPurchaseReturn && tr.description.includes('مرتجع مشتريات')) return true;
      return false;
    };

    const linkedTreasury = updated.treasury.filter(tr =>
      tr.sourceId === inv.id ||
      (tr as any).invoiceId === inv.id ||
      tr.id.startsWith(`tr_purchase_${inv.id}`) ||
      tr.id.startsWith(`tr_sale_${inv.id}`) ||
      tr.id.startsWith(`tr_wholesale_${inv.id}`) ||
      tr.id.startsWith(`tr_sale_return_${inv.id}`) ||
      tr.id.startsWith(`tr_purchase_return_${inv.id}`) ||
      matchesTreasuryDescForInv(tr)
    );

    const buildExpectedTrDesc = (methodLabel: PaymentMethod): string => {
      if (isPurchase) return `سداد فاتورة مشتريات رقم ${inv.number} (${branchName}) - ${partyName} عبر ${methodLabel}`;
      if (isSaleReturn) return `صرف استرداد مرتجع مبيعات رقم ${inv.number} (${branchName}) - ${partyName} عبر ${methodLabel}`;
      if (isPurchaseReturn) return `استرداد مرتجع مشتريات رقم ${inv.number} (${branchName}) - ${partyName} عبر ${methodLabel}`;
      return `تحصيل فاتورة مبيعات رقم ${inv.number} (${branchName}) - ${partyName} عبر ${methodLabel}`;
    };

    if (autoExpectedPaid <= 0) {
      if (linkedTreasury.length > 0) {
        duplicateTreasuryRemoved += linkedTreasury.length;
        fixedDiscrepanciesCount += linkedTreasury.length;
        const removeIds = new Set(linkedTreasury.map(t => t.id));
        updated.treasury = updated.treasury.filter(t => !removeIds.has(t.id));
      }
    } else {
      const splitInvSumCents = nonCreditSplits.reduce((s, p) => s + toCents(p.amount), 0);
      const hasValidInvoiceSplits = nonCreditSplits.length > 1 && Math.abs(splitInvSumCents - toCents(autoExpectedPaid)) <= 2;

      const hasSplitIndices = linkedTreasury.length > 1 && linkedTreasury.every(t => /_p\d+/.test(t.id));
      const uniqueSplitIds = hasSplitIndices && new Set(linkedTreasury.map(t => t.id)).size === linkedTreasury.length;
      const splitSumCents = linkedTreasury.reduce((s, t) => s + toCents(t.amount), 0);
      const isLegitimateSplit =
        hasSplitIndices &&
        uniqueSplitIds &&
        Math.abs(splitSumCents - toCents(autoExpectedPaid)) <= 2;

      if (hasValidInvoiceSplits) {
        const expectedIds = new Set(nonCreditSplits.map((_, pIdx) => getDeterministicTreasuryId(expectedSourceType, inv.id, pIdx, expectedTrDirection)));
        const alreadyExact =
          linkedTreasury.length === nonCreditSplits.length &&
          linkedTreasury.every(t =>
            expectedIds.has(t.id) &&
            t.direction === expectedTrDirection &&
            t.sourceType === expectedSourceType &&
            t.sourceId === inv.id
          );
        if (!alreadyExact) {
          const rmIds = new Set(linkedTreasury.map(t => t.id));
          updated.treasury = updated.treasury.filter(t => !rmIds.has(t.id));
          nonCreditSplits.forEach((pLine, pIdx) => {
            updated.treasury.unshift({
              id: getDeterministicTreasuryId(expectedSourceType, inv.id, pIdx, expectedTrDirection),
              date: invDate,
              direction: expectedTrDirection,
              amount: roundMoney(Number(pLine.amount)),
              method: pLine.method,
              description: buildExpectedTrDesc(pLine.method),
              sourceType: expectedSourceType,
              sourceId: inv.id,
              branchId,
              branchName
            });
          });
          fixedDiscrepanciesCount++;
        }
      } else if (isLegitimateSplit) {
        linkedTreasury.forEach((t, idx) => {
          const targetId = getDeterministicTreasuryId(expectedSourceType, inv.id, idx, expectedTrDirection);
          if (
            t.direction !== expectedTrDirection ||
            t.sourceType !== expectedSourceType ||
            t.sourceId !== inv.id ||
            t.id !== targetId ||
            !t.branchId
          ) {
            t.id = targetId;
            t.direction = expectedTrDirection;
            t.sourceType = expectedSourceType;
            t.sourceId = inv.id;
            t.date = invDate;
            t.branchId = branchId;
            t.branchName = branchName;
            fixedDiscrepanciesCount++;
          }
        });
      } else if (linkedTreasury.length >= 1) {
        const primaryTr = linkedTreasury[0];
        const targetTrId = getDeterministicTreasuryId(expectedSourceType, inv.id, 0, expectedTrDirection);
        const trDesc = buildExpectedTrDesc(resolvedMethod);

        const changed =
          primaryTr.id !== targetTrId ||
          primaryTr.direction !== expectedTrDirection ||
          primaryTr.sourceType !== expectedSourceType ||
          primaryTr.sourceId !== inv.id ||
          Math.abs((Number(primaryTr.amount) || 0) - autoExpectedPaid) > 0.01 ||
          primaryTr.method !== resolvedMethod ||
          primaryTr.date !== invDate ||
          !primaryTr.branchId;

        if (changed) {
          primaryTr.id = targetTrId;
          primaryTr.direction = expectedTrDirection;
          primaryTr.sourceType = expectedSourceType;
          primaryTr.sourceId = inv.id;
          primaryTr.amount = autoExpectedPaid;
          primaryTr.method = resolvedMethod;
          primaryTr.date = invDate;
          primaryTr.branchId = branchId;
          primaryTr.branchName = branchName;
          primaryTr.description = trDesc;
          fixedDiscrepanciesCount++;
        }

        if (linkedTreasury.length > 1) {
          const dupIds = new Set(linkedTreasury.slice(1).map(d => d.id));
          updated.treasury = updated.treasury.filter(t => !dupIds.has(t.id));
          duplicateTreasuryRemoved += dupIds.size;
          fixedDiscrepanciesCount += dupIds.size;
          fixedInvoicesCount++;
        }
      } else {
        // Missing treasury entry for a paid invoice -> restore it cleanly
        updated.treasury.unshift({
          id: getDeterministicTreasuryId(expectedSourceType, inv.id, 0, expectedTrDirection),
          date: invDate,
          direction: expectedTrDirection,
          amount: autoExpectedPaid,
          method: resolvedMethod,
          description: buildExpectedTrDesc(resolvedMethod),
          sourceType: expectedSourceType,
          sourceId: inv.id,
          branchId,
          branchName
        });
        fixedDiscrepanciesCount++;
        fixedInvoicesCount++;
      }
    }
  });

  // 2. Reconcile ALL Vouchers (manual/installment vs auto-from-invoice) against Treasury entries
  const autoVoucherIds = new Set<string>(
    updated.vouchers.filter(v => isAutoV(v)).map(v => v.id)
  );

  // Remove any accidental tr_voucher_* duplicate belonging to an auto-from-invoice voucher (prevents treasury double-counting)
  const beforeAutoTrFilter = updated.treasury.length;
  updated.treasury = updated.treasury.filter(tr => {
    if (tr.sourceId && autoVoucherIds.has(tr.sourceId)) return false;
    return true;
  });
  if (updated.treasury.length !== beforeAutoTrFilter) {
    const removed = beforeAutoTrFilter - updated.treasury.length;
    duplicateTreasuryRemoved += removed;
    fixedDiscrepanciesCount += removed;
  }

  // Ensure every manual / standalone voucher has exactly ONE matching Treasury entry with exact direction
  updated.vouchers.forEach(v => {
    if (!v || isAutoV(v)) return;
    if (v.status === 'ملغي') return;
    const amt = roundMoney(Number(v.amount) || 0);
    if (amt <= 0) return;

    const expectedDir: 'in' | 'out' = v.type === 'receipt' ? 'in' : 'out';
    const expectedSrcType = v.type === 'receipt' ? 'receipt' : 'payment';
    const branchId = v.branchId || defaultBranchId;
    const branchName = v.branchName || updated.branches?.find(b => b.id === branchId)?.name || defaultBranchName;
    const cleanVId = cleanIdPart(v.id);
    const detTrId = `tr_voucher_${cleanVId}_${expectedDir}`;

    const matchedEntries = updated.treasury.filter(tr =>
      tr.sourceId === v.id ||
      tr.id === detTrId ||
      tr.id.startsWith(`tr_voucher_${cleanVId}_`)
    );

    const expectedDesc = `${v.type === 'receipt' ? 'سند قبض' : 'سند صرف'} ${v.number} - ${v.partyName}${v.description ? ': ' + v.description : ''}`;

    if (matchedEntries.length === 0) {
      updated.treasury.unshift({
        id: detTrId,
        date: v.date || getTodayDate(),
        direction: expectedDir,
        amount: amt,
        method: (v.paymentMethod && v.paymentMethod !== 'آجل' ? v.paymentMethod : 'نقدي') as PaymentMethod,
        description: expectedDesc,
        sourceType: expectedSrcType,
        sourceId: v.id,
        branchId,
        branchName
      });
      fixedDiscrepanciesCount++;
    } else {
      const primary = matchedEntries[0];
      const safeMethod = (v.paymentMethod && v.paymentMethod !== 'آجل' ? v.paymentMethod : primary.method || 'نقدي') as PaymentMethod;
      const changed =
        primary.direction !== expectedDir ||
        Math.abs((Number(primary.amount) || 0) - amt) > 0.01 ||
        primary.method !== safeMethod ||
        primary.date !== v.date ||
        primary.sourceType !== expectedSrcType;

      if (changed) {
        if (!primary.id.startsWith('tr_fee')) {
          primary.id = detTrId;
        }
        primary.direction = expectedDir;
        primary.amount = amt;
        primary.method = safeMethod;
        primary.date = v.date || primary.date;
        primary.sourceType = expectedSrcType;
        primary.sourceId = v.id;
        primary.branchId = branchId;
        primary.branchName = branchName;
        fixedDiscrepanciesCount++;
      }

      if (matchedEntries.length > 1) {
        const dupIds = new Set(matchedEntries.slice(1).map(d => d.id));
        updated.treasury = updated.treasury.filter(t => !dupIds.has(t.id));
        duplicateTreasuryRemoved += dupIds.size;
        fixedDiscrepanciesCount += dupIds.size;
      }
    }
  });

  // 3. Reconcile Expenses ('out'), Revenues ('in'), and any remaining Treasury entries by sourceType / description
  const expenseIds = new Set((updated.expenses || []).map(e => e.id));
  const revenueIds = new Set((updated.revenues || []).map(r => r.id));

  (updated.treasury || []).forEach(tr => {
    if (!tr) return;
    let targetDir: 'in' | 'out' | null = null;
    if (tr.sourceType === 'expense' || (tr.sourceId && expenseIds.has(tr.sourceId))) {
      targetDir = 'out';
      tr.sourceType = 'expense';
    } else if (tr.sourceType === 'revenue' || (tr.sourceId && revenueIds.has(tr.sourceId))) {
      targetDir = 'in';
      tr.sourceType = 'revenue';
    } else if (
      tr.sourceType === 'sale' ||
      tr.sourceType === 'wholesale' ||
      tr.sourceType === 'purchase_return' ||
      tr.sourceType === 'receipt'
    ) {
      targetDir = 'in';
    } else if (
      tr.sourceType === 'purchase' ||
      tr.sourceType === 'sale_return' ||
      tr.sourceType === 'payment'
    ) {
      targetDir = 'out';
    } else if (tr.description) {
      if (
        tr.description.includes('تحصيل فاتورة مبيعات') ||
        tr.description.includes('استرداد مرتجع مشتريات') ||
        tr.description.includes('تحويل وارد') ||
        tr.description.startsWith('سند قبض')
      ) {
        targetDir = 'in';
      } else if (
        tr.description.includes('سداد فاتورة مشتريات') ||
        tr.description.includes('صرف استرداد مرتجع مبيعات') ||
        tr.description.includes('تحويل صادر') ||
        tr.description.startsWith('سند صرف') ||
        tr.description.includes('عمولة بنكية')
      ) {
        targetDir = 'out';
      }
    }

    if (targetDir && tr.direction !== targetDir) {
      tr.direction = targetDir;
      fixedDiscrepanciesCount++;
    }
  });

  // 4. Global deduplication of treasury entries (preserving transfers' in+out pair and _pN split payments)
  const seenTreasuryKeys = new Set<string>();
  const cleanTreasury: TreasuryEntry[] = [];
  (updated.treasury || []).forEach(tr => {
    let key = tr.id;
    const splitMatch = tr.id.match(/_p(\d+)_/);
    if (tr.sourceId && tr.sourceType === 'transfer') {
      key = `transfer_${tr.sourceId}_${tr.direction}_${tr.method || 'cash'}`;
    } else if (tr.sourceId && tr.sourceType && splitMatch) {
      key = `${tr.sourceType}_${tr.sourceId}_p${splitMatch[1]}_${tr.method || 'cash'}`;
    } else if (tr.sourceId && tr.sourceType && tr.sourceType !== 'manual' && tr.sourceType !== 'adjustment') {
      key = `${tr.sourceType}_${tr.sourceId}_${tr.method || 'cash'}`;
    }
    if (!seenTreasuryKeys.has(key)) {
      seenTreasuryKeys.add(key);
      cleanTreasury.push(tr);
    } else {
      duplicateTreasuryRemoved++;
      fixedDiscrepanciesCount++;
    }
  });
  updated.treasury = cleanTreasury;

  // 5. Global deduplication of vouchers (preserving distinct manual installment vouchers on same invoice)
  const seenVoucherKeys = new Set<string>();
  const cleanVouchers: Voucher[] = [];
  (updated.vouchers || []).forEach(v => {
    let key = v.id;
    if (v.invoiceId && isAutoV(v)) {
      key = `vch_auto_inv_${v.invoiceId}_${v.type}`;
    }
    if (!seenVoucherKeys.has(key)) {
      seenVoucherKeys.add(key);
      cleanVouchers.push(v);
    } else {
      duplicateVouchersRemoved++;
      vouchersReconciledCount++;
    }
  });
  updated.vouchers = cleanVouchers;

  // 6. Recompute Customer & Supplier cached balances cleanly
  updated.customers.forEach(c => {
    c.balance = calculateCustomerBalance(updated, c.id);
  });
  updated.suppliers.forEach(s => {
    s.balance = calculateSupplierBalance(updated, s.id);
  });

  return {
    db: updated,
    duplicateVouchersRemoved,
    duplicateTreasuryRemoved,
    fixedInvoicesCount,
    fixedDiscrepanciesCount,
    vouchersReconciledCount
  };
}
