import {
  AccountingDB,
  Invoice,
  Voucher,
  TreasuryEntry,
  JournalEntry,
  StockMovement,
  Product,
  SimpleRecord,
  ReturnInvoice
} from '../types/accounting';
import {
  formatMoney,
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
  const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
  if (!updated.invoices) updated.invoices = [];
  if (!updated.vouchers) updated.vouchers = [];
  if (!updated.treasury) updated.treasury = [];
  if (!updated.stockMovements) updated.stockMovements = [];
  if (!updated.journals) updated.journals = [];
  if (!updated.products) updated.products = [];

  const invoiceId = invoice.id;
  const invoiceNumber = invoice.number;
  const isPurchase = invoice.type === 'purchase' || invoice.invoiceKind === 'purchase';
  const isSale = invoice.type === 'sale' || invoice.invoiceKind === 'sale' || invoice.invoiceKind === 'wholesale';
  const isSaleReturn = invoice.invoiceKind === 'sale_return';
  const isPurchaseReturn = invoice.invoiceKind === 'purchase_return';
  const branchId = invoice.branchId || 'br_mawan';
  const warehouseId = invoice.warehouseId || updated.warehouses[0]?.id || 'wh_mawan';

  const expectedSmType = isSaleReturn
    ? 'sale_return'
    : isPurchaseReturn
      ? 'purchase_return'
      : isPurchase
        ? 'purchase'
        : 'sale';
  const expectedTrPrefix = isPurchase
    ? `فاتورة مشتريات رقم ${invoiceNumber}`
    : `فاتورة مبيعات رقم ${invoiceNumber}`;

  // Guarantee strictly monotonic createdAt on same-date operations so FIFO preserves exact event order
  if (!invoice.createdAt) {
    const maxExistingMs = updated.invoices.reduce((mx, i) => {
      const t = i.createdAt ? Date.parse(i.createdAt) : 0;
      return Number.isFinite(t) && t > mx ? t : mx;
    }, 0);
    const nextMs = Math.max(Date.now(), maxExistingMs + 1);
    invoice.createdAt = new Date(nextMs).toISOString();
  }

  // 1. Remove previous linked items if updating an existing invoice to prevent stale orphaned records
  const previousInvIdx = (() => {
    const byId = updated.invoices.findIndex(i => i.id === invoiceId);
    return byId > -1 ? byId : updated.invoices.findIndex(i => i.number === invoiceNumber && i.type === invoice.type);
  })();
  if (previousInvIdx > -1) {
    const prev = updated.invoices[previousInvIdx];
    (prev.items || []).forEach(oldItem => {
      const prod = updated.products.find(p => p.id === oldItem.productId || p.code === oldItem.productCode);
      if (prod) {
        const bp = getProductForBranch(prod, prev.branchId || branchId);
        let revertedQty = bp.currentQty;
        if (isSale) revertedQty += oldItem.qty;
        else if (isPurchase) revertedQty -= oldItem.qty;
        else if (isSaleReturn) revertedQty -= oldItem.qty;
        else if (isPurchaseReturn) revertedQty += oldItem.qty;

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
    updated.invoices[previousInvIdx] = invoice;
  } else {
    updated.invoices.unshift(invoice);
  }

  // Pre-build FIFO ledger EXCLUDING this invoice so sales pull exact FIFO batch layers chronologically
  const priorFifoLedger = isSale ? buildProductFifoLedger(updated, branchId, invoiceId) : null;

  // 2. Validate & process stock movements + catalog updates
  const wh = updated.warehouses.find(w => w.id === warehouseId) || updated.warehouses[0];
  for (const item of invoice.items || []) {
    const matchRes = matchProductStrictly(updated, {
      id: item.productId,
      code: item.productCode,
      name: item.productName,
      unit: item.unit
    });
    let prod = matchRes.exactMatch;

    // Rule: Sales & Sale Returns MUST use existing catalog items — block phantom creation
    if (!prod && (isSale || isSaleReturn || invoice.invoiceKind === 'quote')) {
      return {
        success: false,
        db,
        message: `⚠️ لا يمكن ترحيل فاتورة البيع: الصنف "${item.productName || item.productCode || 'غير معروف'}" غير مسجل في دليل الأصناف. يرجى اختياره من الكتالوج المعتمد.`
      };
    }

    // Purchases: create new catalog item ONLY when strictly new (no auto-generated selling markups)
    if (!prod && item.productName && item.productName.trim()) {
      const newCode = item.productCode || `P-${100 + updated.products.length + 1}`;
      const unitBuy = isPurchase ? (Number(item.unitPrice) || 0) : 0;
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
        minStock: 5,
        currentQty: 0,
        avgCost: unitBuy,
        branchesData: {
          [branchId]: {
            currentQty: 0,
            buyPrice: unitBuy,
            sellPrice: 0,
            wholesalePrice: 0,
            minStock: 5,
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
        newQty -= item.qty;
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
        newBuyPrice = Number(item.unitPrice) || 0;
        newQty += item.qty;
        item.costPrice = newBuyPrice;
        item.hasVerifiedCost = newBuyPrice > 0;
        item.uncoveredQty = 0;
      } else if (isSaleReturn) {
        qtyChange = item.qty;
        newQty += item.qty;
      } else if (isPurchaseReturn) {
        qtyChange = -item.qty;
        newQty -= item.qty;
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
        date: invoice.date,
        productId: prod.id,
        productName: prod.name,
        warehouseId,
        warehouseName: wh ? wh.name : 'المخزن الرئيسي',
        qtyChange,
        balanceAfter: newQty,
        unitCost: isSale ? (item.hasVerifiedCost ? item.costPrice : 0) : (item.costPrice || item.unitPrice),
        type: (isSale ? 'sale' : isPurchase ? 'purchase' : isSaleReturn ? 'sale_return' : 'purchase_return') as any,
        refNumber: invoice.number,
        sourceId: invoiceId,
        branchId,
        branchName: invoice.branchName || 'الفرع الرئيسي'
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
  const finalPaid = Number(invoice.paid) || 0;
  const voucherType: 'receipt' | 'payment' = (isSale || isPurchaseReturn) ? 'receipt' : 'payment';
  const trDirection: 'in' | 'out' = (isPurchase || isSaleReturn) ? 'out' : 'in';

  if (finalPaid > 0) {
    const paymentRows = (invoice.payments && invoice.payments.length > 0)
      ? invoice.payments
      : [{ method: invoice.paymentMethod || 'نقدي', amount: finalPaid }];

    paymentRows.forEach((pLine, idx) => {
      if (pLine.amount > 0 && pLine.method !== 'آجل') {
        // 3.1 Single deterministic treasury entry
        const deterministicTrId = getDeterministicTreasuryId(
          isPurchase ? 'purchase' : 'sale',
          invoiceId,
          idx,
          trDirection
        );

        const trDescription = isPurchase
          ? `سداد فاتورة مشتريات رقم ${invoiceNumber} (${invoice.partyName}) عبر ${pLine.method}`
          : `تحصيل فاتورة مبيعات رقم ${invoiceNumber} (${invoice.partyName}) عبر ${pLine.method}`;

        const trEntry: TreasuryEntry = {
          id: deterministicTrId,
          date: invoice.date,
          direction: trDirection,
          amount: pLine.amount,
          method: pLine.method,
          description: trDescription,
          sourceType: isPurchase ? 'purchase' : 'sale',
          sourceId: invoiceId,
          branchId,
          branchName: invoice.branchName || 'الفرع الرئيسي'
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
    const autoPaidPortion = Math.max(0, Number((finalPaid - manualInstallmentsPaid).toFixed(2)));

    const deterministicVoucherId = getDeterministicVoucherId(invoiceId, 0, voucherType);
    if (autoPaidPortion > 0) {
      let linkedVoucher = updated.vouchers.find(v =>
        isAutoV(v) && (
          v.id === deterministicVoucherId ||
          (v as any).invoiceId === invoiceId ||
          ((v as any).referenceNumber === invoiceNumber && v.type === voucherType)
        )
      );

      const voucherDesc = voucherType === 'receipt'
        ? `سند قبض مقابل فاتورة مبيعات رقم ${invoiceNumber} (${invoice.partyName})`
        : `سند صرف مقابل فاتورة مشتريات رقم ${invoiceNumber} (${invoice.partyName})`;

      if (linkedVoucher) {
        linkedVoucher.id = deterministicVoucherId;
        linkedVoucher.type = voucherType;
        linkedVoucher.amount = autoPaidPortion;
        linkedVoucher.date = invoice.date;
        linkedVoucher.partyId = invoice.partyId;
        linkedVoucher.partyName = invoice.partyName || (voucherType === 'receipt' ? 'عميل نقدي' : 'مورد عام');
        linkedVoucher.paymentMethod = invoice.paymentMethod || 'نقدي';
        linkedVoucher.description = voucherDesc;
        linkedVoucher.branchId = branchId;
        linkedVoucher.branchName = invoice.branchName || 'الفرع الرئيسي';
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
          date: invoice.date,
          partyId: invoice.partyId,
          partyName: invoice.partyName || (voucherType === 'receipt' ? 'عميل نقدي' : 'مورد عام'),
          amount: autoPaidPortion,
          paymentMethod: invoice.paymentMethod || 'نقدي',
          description: voucherDesc,
          referenceNumber: invoiceNumber,
          invoiceId,
          isAutoFromInvoice: true,
          branchId,
          branchName: invoice.branchName || 'الفرع الرئيسي',
          createdAt: invoice.createdAt || new Date().toISOString(),
          createdBy: invoice.createdBy || operatorName
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
  const freshJournal = createInvoiceJournal(updated, invoice);
  freshJournal.id = deterministicJournalId;
  freshJournal.sourceId = invoiceId;
  invoice.journalEntryId = deterministicJournalId;

  const existingJournalIdx = updated.journals.findIndex(j => j.id === deterministicJournalId || j.sourceId === invoiceId);
  if (existingJournalIdx > -1) {
    updated.journals[existingJournalIdx] = freshJournal;
  } else {
    updated.journals.unshift(freshJournal);
  }

  // 5. Update party balance
  if (invoice.partyId) {
    if (isSale) {
      const cust = updated.customers.find(c => c.id === invoice.partyId);
      if (cust) cust.balance = calculateCustomerBalance(updated, cust.id);
    } else {
      const supp = updated.suppliers.find(s => s.id === invoice.partyId);
      if (supp) supp.balance = calculateSupplierBalance(updated, supp.id);
    }
  }

  logAudit(
    updated,
    previousInvIdx > -1 ? 'تعديل وترحيل فاتورة' : 'إنشاء وترحيل فاتورة',
    `فاتورة ${isPurchase ? 'مشتريات' : 'مبيعات'} رقم ${invoiceNumber} بمبلغ ${formatMoney(invoice.total, updated.settings.currency)} (مدفوع: ${finalPaid})`
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
    ...voucher,
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
      const otherPaid = updated.vouchers
        .filter(v =>
          v.id !== voucherId &&
          (v.invoiceId === targetInv.id || ((v as any).referenceNumber === targetInv.number && v.type === (targetInv.type === 'sale' ? 'receipt' : 'payment')))
        )
        .reduce((s, v) => s + (Number(v.amount) || 0), 0);
      const maxAllowable = Math.max(0, Number((targetInv.total - otherPaid).toFixed(2)));
      if (voucherToSave.amount > maxAllowable + 0.01) {
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
    const totalPaidOnVouchers = Number(allVouchersForInv.reduce((s, v) => s + (Number(v.amount) || 0), 0).toFixed(2));
    inv.paid = totalPaidOnVouchers;
    inv.remaining = Math.max(0, Number((inv.total - totalPaidOnVouchers).toFixed(2)));
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
      linkedInv.paid = Number(remainingVouchersPaid.toFixed(2));
      linkedInv.remaining = Math.max(0, Number((linkedInv.total - linkedInv.paid).toFixed(2)));
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
} {
  if (!db) return { db, duplicateVouchersRemoved: 0, duplicateTreasuryRemoved: 0, fixedInvoicesCount: 0 };
  const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
  if (!updated.invoices) updated.invoices = [];
  if (!updated.vouchers) updated.vouchers = [];
  if (!updated.treasury) updated.treasury = [];
  if (!updated.products) updated.products = [];
  if (!updated.stockMovements) updated.stockMovements = [];

  let duplicateVouchersRemoved = 0;
  let duplicateTreasuryRemoved = 0;
  let fixedInvoicesCount = 0;

  // 1. Audit each invoice
  updated.invoices.forEach(inv => {
    const paid = Number(inv.paid) || 0;
    const isPurchase = inv.type === 'purchase' || inv.invoiceKind === 'purchase';
    const isSale = inv.type === 'sale' || inv.invoiceKind === 'sale' || inv.invoiceKind === 'wholesale';
    const expectedVoucherType: 'receipt' | 'payment' = (isSale || inv.invoiceKind === 'purchase_return') ? 'receipt' : 'payment';
    const expectedTrDirection: 'in' | 'out' = (isPurchase || inv.invoiceKind === 'sale_return') ? 'out' : 'in';

    // 1.1 Find all AUTO vouchers linked to this invoice (NEVER delete manual installment vouchers!)
    const isAutoV = (v: Voucher) => !v.isManualInstallment && (v.isAutoFromInvoice || v.id.startsWith('vch_'));
    const autoLinkedVouchers = updated.vouchers.filter(v =>
      isAutoV(v) && (
        v.invoiceId === inv.id ||
        (v as any).sourceId === inv.id ||
        ((v as any).referenceNumber === inv.number && v.type === expectedVoucherType) ||
        (v.description && v.description.includes(`رقم ${inv.number}`) && v.type === expectedVoucherType)
      )
    );
    const manualInstallmentsPaid = updated.vouchers
      .filter(v => v.invoiceId === inv.id && !isAutoV(v))
      .reduce((s, v) => s + (Number(v.amount) || 0), 0);
    const autoExpectedPaid = Math.max(0, Number((paid - manualInstallmentsPaid).toFixed(2)));

    if (autoExpectedPaid <= 0) {
      if (autoLinkedVouchers.length > 0) {
        duplicateVouchersRemoved += autoLinkedVouchers.length;
        const removeIds = new Set(autoLinkedVouchers.map(v => v.id));
        updated.vouchers = updated.vouchers.filter(v => !removeIds.has(v.id));
      }
    } else {
      if (autoLinkedVouchers.length > 1) {
        const primary = autoLinkedVouchers[0];
        primary.amount = autoExpectedPaid;
        primary.id = getDeterministicVoucherId(inv.id, 0, expectedVoucherType);
        primary.invoiceId = inv.id;
        primary.referenceNumber = inv.number;
        primary.isAutoFromInvoice = true;

        const duplicates = autoLinkedVouchers.slice(1);
        const dupIds = new Set(duplicates.map(d => d.id));
        updated.vouchers = updated.vouchers.filter(v => !dupIds.has(v.id));
        duplicateVouchersRemoved += duplicates.length;
        fixedInvoicesCount++;
      } else if (autoLinkedVouchers.length === 1) {
        const v = autoLinkedVouchers[0];
        v.id = getDeterministicVoucherId(inv.id, 0, expectedVoucherType);
        v.invoiceId = inv.id;
        v.referenceNumber = inv.number;
        v.isAutoFromInvoice = true;
        v.amount = autoExpectedPaid;
      }
    }

    // 1.2 Find all treasury entries linked to this invoice
    const linkedTreasury = updated.treasury.filter(tr =>
      tr.sourceId === inv.id ||
      (tr as any).invoiceId === inv.id ||
      tr.id.startsWith(`tr_purchase_${inv.id}`) ||
      tr.id.startsWith(`tr_sale_${inv.id}`) ||
      (inv.number && tr.description && (
        tr.description.includes(`سداد فاتورة مشتريات رقم ${inv.number}`) ||
        tr.description.includes(`تحصيل فاتورة مبيعات رقم ${inv.number}`) ||
        tr.description.includes(`فاتورة مشتريات رقم ${inv.number}`) ||
        tr.description.includes(`فاتورة مبيعات رقم ${inv.number}`)
      ))
    );

    if (autoExpectedPaid <= 0) {
      if (linkedTreasury.length > 0) {
        duplicateTreasuryRemoved += linkedTreasury.length;
        const removeIds = new Set(linkedTreasury.map(t => t.id));
        updated.treasury = updated.treasury.filter(t => !removeIds.has(t.id));
      }
    } else {
      // Should have exactly ONE treasury entry for the direct invoice payment portion
      if (linkedTreasury.length > 1) {
        const primaryTr = linkedTreasury[0];
        primaryTr.amount = autoExpectedPaid;
        primaryTr.direction = expectedTrDirection;
        primaryTr.id = getDeterministicTreasuryId(isPurchase ? 'purchase' : 'sale', inv.id, 0, expectedTrDirection);
        primaryTr.sourceId = inv.id;

        const duplicates = linkedTreasury.slice(1);
        const dupIds = new Set(duplicates.map(d => d.id));
        updated.treasury = updated.treasury.filter(t => !dupIds.has(t.id));
        duplicateTreasuryRemoved += duplicates.length;
        fixedInvoicesCount++;
      } else if (linkedTreasury.length === 1) {
        const t = linkedTreasury[0];
        t.amount = autoExpectedPaid;
        t.direction = expectedTrDirection;
        t.id = getDeterministicTreasuryId(isPurchase ? 'purchase' : 'sale', inv.id, 0, expectedTrDirection);
        t.sourceId = inv.id;
      }
    }
  });

  // 2. Global deduplication of treasury entries:
  // If multiple treasury entries share the exact same id or exact same (sourceType + sourceId + direction), keep only one!
  const seenTreasuryKeys = new Set<string>();
  const cleanTreasury: TreasuryEntry[] = [];
  (updated.treasury || []).forEach(tr => {
    let key = tr.id;
    if (tr.sourceId && tr.sourceType) {
      key = `${tr.sourceType}_${tr.sourceId}_${tr.direction}`;
    }
    if (!seenTreasuryKeys.has(key)) {
      seenTreasuryKeys.add(key);
      cleanTreasury.push(tr);
    } else {
      duplicateTreasuryRemoved++;
    }
  });
  updated.treasury = cleanTreasury;

  // 3. Global deduplication of vouchers (preserve distinct manual installment vouchers on same invoice):
  const seenVoucherKeys = new Set<string>();
  const cleanVouchers: Voucher[] = [];
  (updated.vouchers || []).forEach(v => {
    let key = v.id;
    const isAuto = !v.isManualInstallment && (v.isAutoFromInvoice || v.id.startsWith('vch_'));
    if (v.invoiceId && isAuto) {
      key = `vch_auto_inv_${v.invoiceId}_${v.type}`;
    }
    if (!seenVoucherKeys.has(key)) {
      seenVoucherKeys.add(key);
      cleanVouchers.push(v);
    } else {
      duplicateVouchersRemoved++;
    }
  });
  updated.vouchers = cleanVouchers;

  return {
    db: updated,
    duplicateVouchersRemoved,
    duplicateTreasuryRemoved,
    fixedInvoicesCount
  };
}
