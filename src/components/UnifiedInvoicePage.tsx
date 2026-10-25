import React, { useState, useEffect, useRef } from 'react';
import {
  Receipt,
  ShoppingCart,
  ShoppingBag,
  RotateCcw,
  FileText,
  Boxes,
  Sliders,
  Plus,
  PenSquare,
  Trash2,
  Save,
  Printer,
  X,
  Check,
  Search,
  Layers,
  Clock,
  ArrowRight,
  Maximize2,
  Minimize2,
  ShieldCheck,
  History,
  Building2,
  Tag,
  CheckCircle2,
  AlertCircle,
  Minus,
  Edit3,
  Wallet,
  CreditCard
} from 'lucide-react';
import {
  AccountingDB,
  Invoice,
  InvoiceItem,
  InvoicePaymentLine,
  InvoiceAuditEntry,
  PaymentMethod,
  Product,
  Party
} from '../types/accounting';
import { InvoiceAuditLogModal } from './InvoiceAuditLogModal';
import {
  formatMoney,
  PAYMENT_METHODS,
  generateId,
  getTodayDate,
  calculateCustomerBalance,
  calculateSupplierBalance,
  createInvoiceJournal,
  logAudit,
  getProductForBranch,
  updateProductBranchData,
  isDuplicateInvoiceNumber,
  getNextUniqueInvoiceNumber,
  isDuplicateParty,
  getNextUniquePartyCode
} from '../services/accountingStorage';

export type InvoiceMode = 'sale' | 'wholesale' | 'purchase' | 'sale_return' | 'purchase_return' | 'quote';

const InvoiceLiveClock = React.memo(() => {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
  );
  useEffect(() => {
    const updateTime = () => {
      setTime(new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }));
    };
    const timer = setInterval(updateTime, 10000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span className="text-[10px] font-mono font-medium text-white/90 bg-black/20 px-1.5 py-0.5 rounded" id="liveTime">
      {time}
    </span>
  );
});

interface UnifiedInvoicePageProps {
  mode: InvoiceMode;
  db: AccountingDB;
  onUpdateDb: (updated: AccountingDB) => void;
  onPreviewInvoice: (invoice: Invoice) => void;
  editingInvoice?: Invoice | null;
  onCloseEdit?: () => void;
  onClose?: () => void;
  activeBranchId?: string;
}

export const UnifiedInvoicePage: React.FC<UnifiedInvoicePageProps> = ({
  mode,
  db,
  onUpdateDb,
  onPreviewInvoice,
  editingInvoice,
  onCloseEdit,
  onClose,
  activeBranchId
}) => {
  const invoiceBranchId = editingInvoice?.branchId || activeBranchId || db.currentUser?.branchId || db.branches?.[0]?.id || 'br_main';
  const invoiceBranch = (db.branches || []).find(b => b.id === invoiceBranchId) || { id: 'br_main', name: 'الفرع الرئيسي' };
  // Theme configuration based on mode
  const getTheme = () => {
    switch (mode) {
      case 'sale':
        return {
          title: 'نظام فواتير المبيعات',
          icon: ShoppingCart,
          primary: '#1e293b',
          accent: '#16a34a',
          secondary: '#2563eb',
          netBg: '#166534',
          headerBg: '#1e293b',
          badgeColor: '#16a34a',
          partyRole: 'customer' as const,
          partyLabel: 'العميل',
          defaultPriceType: 'cash' as const
        };
      case 'wholesale':
        return {
          title: 'نظام مبيعات الجملة والتوزيع',
          icon: Boxes,
          primary: '#78350f',
          accent: '#d97706',
          secondary: '#b45309',
          netBg: '#92400e',
          headerBg: '#78350f',
          badgeColor: '#d97706',
          partyRole: 'customer' as const,
          partyLabel: 'العميل (جملة)',
          defaultPriceType: 'wholesale' as const
        };
      case 'purchase':
        return {
          title: 'نظام فواتير المشتريات والتوريدات',
          icon: ShoppingBag,
          primary: '#1e3a8a',
          accent: '#2563eb',
          secondary: '#1d4ed8',
          netBg: '#1e40af',
          headerBg: '#1e3a8a',
          badgeColor: '#2563eb',
          partyRole: 'supplier' as const,
          partyLabel: 'المورد',
          defaultPriceType: 'buy' as const
        };
      case 'sale_return':
        return {
          title: 'نظام مرتجعات المبيعات (من عميل)',
          icon: RotateCcw,
          primary: '#881337',
          accent: '#e11d48',
          secondary: '#be123c',
          netBg: '#9f1239',
          headerBg: '#881337',
          badgeColor: '#e11d48',
          partyRole: 'customer' as const,
          partyLabel: 'العميل',
          defaultPriceType: 'cash' as const
        };
      case 'purchase_return':
        return {
          title: 'نظام مرتجعات المشتريات (إلى مورد)',
          icon: RotateCcw,
          primary: '#581c87',
          accent: '#9333ea',
          secondary: '#7e22ce',
          netBg: '#6b21a8',
          headerBg: '#581c87',
          badgeColor: '#9333ea',
          partyRole: 'supplier' as const,
          partyLabel: 'المورد',
          defaultPriceType: 'buy' as const
        };
      case 'quote':
        return {
          title: 'نظام عروض الأسعار والمقايسات',
          icon: FileText,
          primary: '#134e4a',
          accent: '#0d9488',
          secondary: '#0f766e',
          netBg: '#115e59',
          headerBg: '#134e4a',
          badgeColor: '#0d9488',
          partyRole: 'customer' as const,
          partyLabel: 'العميل',
          defaultPriceType: 'cash' as const
        };
      default:
        return {
          title: 'فاتورة جديدة',
          icon: Receipt,
          primary: '#1e293b',
          accent: '#16a34a',
          secondary: '#2563eb',
          netBg: '#166534',
          headerBg: '#1e293b',
          badgeColor: '#16a34a',
          partyRole: 'customer' as const,
          partyLabel: 'الطرف',
          defaultPriceType: 'cash' as const
        };
    }
  };

  const theme = getTheme();
  const HeaderIcon = theme.icon;

  // View Layout Mode: Mobile compact vs Expanded desktop
  const [layoutWidth, setLayoutWidth] = useState<'mobile' | 'expanded'>('expanded');

  // Form States
  const [invNum, setInvNum] = useState<string>('1');
  const [invDate, setInvDate] = useState<string>(getTodayDate());
  const [invTime, setInvTime] = useState<string>('12:00');
  const [custCode, setCustCode] = useState<string>('1');
  const [custSearchInput, setCustSearchInput] = useState<string>('');
  const [custPhone, setCustPhone] = useState<string>('');
  const [jobSite, setJobSite] = useState<string>('');
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);

  // Pricing mode state: 'cash' | 'wholesale' | 'buy'
  const [priceType, setPriceType] = useState<'cash' | 'wholesale' | 'buy'>(theme.defaultPriceType);

  // Invoice Items
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);

  // Modals state
  const [showOptionsModal, setShowOptionsModal] = useState<boolean>(false);
  const [showLookupModal, setShowLookupModal] = useState<boolean>(false);
  const [showEditItemModal, setShowEditItemModal] = useState<boolean>(false);
  const [showModifyModal, setShowModifyModal] = useState<boolean>(false);

  // Autocomplete dropdowns
  const [showCustDropdown, setShowCustDropdown] = useState<boolean>(false);
  const [showPhoneDropdown, setShowPhoneDropdown] = useState<boolean>(false);

  // Options modal states
  const [invDiscType, setInvDiscType] = useState<'val' | 'percent'>('val');
  const [globalInvDisc, setGlobalInvDisc] = useState<string>('');
  const [invTaxType, setInvTaxType] = useState<'val' | 'percent'>('percent');
  const [globalInvTax, setGlobalInvTax] = useState<string>('');
  const [extraIncomeName, setExtraIncomeName] = useState<string>('خدمات شحن ونقل');
  const [extraIncomeVal, setExtraIncomeVal] = useState<string>('');
  const [paymentRows, setPaymentRows] = useState<{ method: PaymentMethod; amount: number }[]>([]);

  // Lookup modal states
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [lookupSearch, setLookupSearch] = useState<string>('');
  const [lookupPageLimit, setLookupPageLimit] = useState<number>(40);

  // Inline Quick Product Search above items table
  const [inlineProductSearch, setInlineProductSearch] = useState<string>('');
  const [showInlineDropdown, setShowInlineDropdown] = useState<boolean>(false);

  // Modify modal states
  const [modifyIndex, setModifyIndex] = useState<number>(-1);
  const [modifyName, setModifyName] = useState<string>('');
  const [modifyQty, setModifyQty] = useState<number>(1);
  const [modifyPrice, setModifyPrice] = useState<number>(0);
  const [modifySpec, setModifySpec] = useState<string>('');

  // New item modal states
  const [newItemName, setNewItemName] = useState<string>('');
  const [newItemCode, setNewItemCode] = useState<string>('');
  const [newBuyPrice, setNewBuyPrice] = useState<string>('');
  const [newCashMargin, setNewCashMargin] = useState<string>('20');
  const [newCashPriceManual, setNewCashPriceManual] = useState<string>('');
  const [newWholesaleMargin, setNewWholesaleMargin] = useState<string>('10');
  const [newWholesalePriceManual, setNewWholesalePriceManual] = useState<string>('');
  const [newCategory, setNewCategory] = useState<string>('عامة');
  const [newStockQty, setNewStockQty] = useState<string>('10');
  const [showAuditModal, setShowAuditModal] = useState<boolean>(false);

  // Settlement / Payment Type Choice (نقدي كاش vs آجل ذمم vs سداد جزئي)
  const [settlementType, setSettlementType] = useState<'cash' | 'credit' | 'partial'>('cash');
  const [partialPaidInput, setPartialPaidInput] = useState<string>('');

  // Fast on-the-fly item creation modal states (إضافة صنف غير موجود فوراً بالمخزون والفاتورة)
  const [showFastCreateModal, setShowFastCreateModal] = useState<boolean>(false);
  const [fastItemName, setFastItemName] = useState<string>('');
  const [fastItemQty, setFastItemQty] = useState<string>('');
  const [fastItemPrice, setFastItemPrice] = useState<string>('');
  const [fastItemUnit, setFastItemUnit] = useState<string>('قطعة');
  const [fastItemCategory, setFastItemCategory] = useState<string>('عامة');

  // Detailed Item Card Modal states (كارت تفاصيل الصنف لتحديد الكمية وتعديل/تأكيد السعر قبل الإضافة)
  const [selectedCardProduct, setSelectedCardProduct] = useState<Product | null>(null);
  const [itemCardQty, setItemCardQty] = useState<string>('');
  const [itemCardPrice, setItemCardPrice] = useState<string>('');
  const [itemCardDefaultPrice, setItemCardDefaultPrice] = useState<number>(0);
  const [itemCardSpec, setItemCardSpec] = useState<string>('');
  const [showItemCardModal, setShowItemCardModal] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };
  const itemQtyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showItemCardModal) {
      setTimeout(() => {
        itemQtyInputRef.current?.focus();
      }, 50);
    }
  }, [showItemCardModal]);

  // Initialize or load editing invoice
  useEffect(() => {
    if (editingInvoice) {
      setInvNum(editingInvoice.number);
      setInvDate(editingInvoice.date);
      setInvTime(editingInvoice.time || '12:00');
      setJobSite(editingInvoice.jobSite || '');
      setPriceType(editingInvoice.priceType || theme.defaultPriceType);
      setCustCode(editingInvoice.partyCode || '1');
      setCustSearchInput(editingInvoice.partyName || '');
      setCustPhone(editingInvoice.partyPhone || '');
      setInvoiceItems([...editingInvoice.items]);

      setGlobalInvDisc(editingInvoice.discount > 0 ? String(editingInvoice.discount) : '');
      setInvDiscType(editingInvoice.discountType || 'val');
      setGlobalInvTax(editingInvoice.tax > 0 ? String(editingInvoice.tax) : '');
      setInvTaxType(editingInvoice.taxType || 'percent');
      setExtraIncomeName(editingInvoice.extraIncomeName || '');
      setExtraIncomeVal(editingInvoice.extraIncomeVal ? String(editingInvoice.extraIncomeVal) : '');

      if (editingInvoice.remaining > 0 && editingInvoice.paid === 0) {
        setSettlementType('credit');
        setPartialPaidInput('');
      } else if (editingInvoice.remaining > 0 && editingInvoice.paid > 0) {
        setSettlementType('partial');
        setPartialPaidInput(String(editingInvoice.paid));
      } else {
        setSettlementType('cash');
        setPartialPaidInput('');
      }

      if (editingInvoice.payments && editingInvoice.payments.length > 0) {
        setPaymentRows([...editingInvoice.payments]);
      } else if (editingInvoice.paid > 0) {
        setPaymentRows([{ method: editingInvoice.paymentMethod, amount: editingInvoice.paid }]);
      } else {
        setPaymentRows([]);
      }

      const partyList = theme.partyRole === 'customer' ? db.customers : db.suppliers;
      const found = partyList.find(p => p.id === editingInvoice.partyId);
      if (found) setSelectedParty(found);
    } else {
      // Guaranteed unique invoice number with zero collisions
      const { number: uniqueInvNum } = getNextUniqueInvoiceNumber(db, mode);
      setInvNum(uniqueInvNum);
      setInvDate(getTodayDate());
      const now = new Date();
      setInvTime(String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'));
      setJobSite('');
      setPriceType(theme.defaultPriceType);
      setInvoiceItems([]);
      setGlobalInvDisc('');
      setGlobalInvTax('');
      setExtraIncomeVal('');
      setPaymentRows([]);

      // Default party: ALWAYS "نقدي" (Cash) as strictly requested
      setCustSearchInput('نقدي');
      setCustCode('1');
      setCustPhone('');
      const partyList = theme.partyRole === 'customer' ? db.customers : db.suppliers;
      const cashParty = partyList.find(
        p => p.name.trim() === 'نقدي' ||
             p.name.trim() === (theme.partyRole === 'customer' ? 'عميل نقدي' : 'مورد نقدي') ||
             p.code === 'CASH'
      );
      if (cashParty) {
        setSelectedParty(cashParty);
        setCustCode(cashParty.code || '1');
      } else {
        setSelectedParty(null);
      }
    }
  }, [editingInvoice, mode]);

  // Parties list based on role (memoized to prevent recomputing on every keystroke)
  const partiesList = React.useMemo(
    () => (theme.partyRole === 'customer' ? db.customers : db.suppliers),
    [theme.partyRole, db.customers, db.suppliers]
  );

  // Categories list (memoized across 1000+ products)
  const categoriesList = React.useMemo(
    () => Array.from(new Set(db.products.map(p => p.category || 'عامة'))).filter(Boolean),
    [db.products]
  );

  // Sync Party by code
  const syncPartyByCode = (codeValue: string) => {
    setCustCode(codeValue);
    const found = partiesList.find(p => p.code === codeValue.trim());
    if (found) {
      setSelectedParty(found);
      setCustSearchInput(found.name);
      setCustPhone(found.phone || '');
    } else {
      setSelectedParty(null);
    }
  };

  const selectParty = (party: Party) => {
    setSelectedParty(party);
    setCustCode(party.code || '1');
    setCustSearchInput(party.name);
    setCustPhone(party.phone || '');
    setShowCustDropdown(false);
    setShowPhoneDropdown(false);
  };

  // Pricing switch: updates priceType and recalculates existing items
  const handleSetPriceType = (newType: 'cash' | 'wholesale' | 'buy') => {
    setPriceType(newType);
    setInvoiceItems(prev =>
      prev.map(item => {
        const prod = db.products.find(p => p.code === item.productCode || p.id === item.productId);
        if (!prod) return item;
        const bp = getProductForBranch(prod, invoiceBranchId);
        let newPrice = bp.sellPrice;
        if (newType === 'wholesale') newPrice = bp.wholesalePrice;
        else if (newType === 'buy') newPrice = bp.buyPrice;
        else newPrice = bp.sellPrice;

        return {
          ...item,
          unitPrice: newPrice,
          total: Math.max(0, item.qty * newPrice - (item.discount || 0))
        };
      })
    );
  };

  // Calculations
  const totalQtySum = invoiceItems.reduce((s, it) => s + (Number(it.qty) || 0), 0);
  const itemsSubTotal = invoiceItems.reduce((s, it) => s + (Number(it.total) || 0), 0);

  const discNum = parseFloat(globalInvDisc) || 0;
  const globalDiscCalculated = invDiscType === 'percent'
    ? itemsSubTotal * (discNum / 100)
    : discNum;

  const taxNum = parseFloat(globalInvTax) || 0;
  const globalTaxCalculated = invTaxType === 'percent'
    ? Math.max(0, itemsSubTotal - globalDiscCalculated) * (taxNum / 100)
    : taxNum;

  const extraIncome = parseFloat(extraIncomeVal) || 0;
  const netTotal = Math.max(0, itemsSubTotal - globalDiscCalculated + globalTaxCalculated + extraIncome);

  let paidTotal = 0;
  if (settlementType === 'cash') {
    paidTotal = netTotal;
  } else if (settlementType === 'credit') {
    paidTotal = 0;
  } else if (settlementType === 'partial') {
    const p = parseFloat(partialPaidInput) || 0;
    paidTotal = Math.min(netTotal, Math.max(0, p));
  } else {
    if (paymentRows.length === 0) {
      paidTotal = netTotal;
    } else {
      paidTotal = paymentRows.reduce((s, r) => s + Math.max(0, Number(r.amount) || 0), 0);
    }
  }
  const remainTotal = Math.max(0, netTotal - paidTotal);

  // Quick add from lookup card
  const quickAddItem = (prod: Product) => {
    const branchProd = getProductForBranch(prod, invoiceBranchId);
    let activePrice = branchProd.sellPrice;
    if (mode === 'purchase' || mode === 'purchase_return') activePrice = branchProd.buyPrice;
    else if (mode === 'wholesale' || priceType === 'wholesale') activePrice = branchProd.wholesalePrice;
    else if (priceType === 'buy') activePrice = branchProd.buyPrice;

    if (mode === 'sale' && branchProd.currentQty <= 0) {
      const confirmNeg = confirm(`⚠️ تنبيه: رصيد الصنف "${prod.name}" بفرع (${invoiceBranch.name}) هو (${branchProd.currentQty}). هل ترغب في إتمام البيع بالسالب؟`);
      if (!confirmNeg) return;
    }

    setInvoiceItems(prev => {
      const existingIdx = prev.findIndex(it => it.productId === prod.id && (!it.spec || it.spec === ''));
      if (existingIdx > -1) {
        const copy = [...prev];
        const newQty = copy[existingIdx].qty + 1;
        copy[existingIdx] = {
          ...copy[existingIdx],
          qty: newQty,
          total: newQty * copy[existingIdx].unitPrice
        };
        return copy;
      } else {
        const newItem: InvoiceItem = {
          productId: prod.id,
          productCode: prod.code,
          productName: prod.name,
          unit: prod.unit,
          spec: '',
          qty: 1,
          unitPrice: activePrice,
          costPrice: branchProd.avgCost || branchProd.buyPrice,
          discount: 0,
          taxRate: 0,
          total: activePrice * 1
        };
        return [...prev, newItem];
      }
    });

    setShowLookupModal(false);
  };

  // Open detailed card for selected product to specify quantity & verify/modify price
  const openItemCard = (prod: Product) => {
    const branchProd = getProductForBranch(prod, invoiceBranchId);
    let defPrice = branchProd.sellPrice;
    if (mode === 'purchase' || mode === 'purchase_return') {
      defPrice = branchProd.buyPrice;
    } else if (mode === 'wholesale' || priceType === 'wholesale') {
      defPrice = branchProd.wholesalePrice;
    } else if (priceType === 'buy') {
      defPrice = branchProd.buyPrice;
    }

    setSelectedCardProduct(prod);
    setItemCardQty(''); // Empty string! No pre-filled numbers or zeroes!
    setItemCardPrice(''); // Empty string! No pre-filled numbers or zeroes!
    setItemCardDefaultPrice(defPrice);
    setItemCardSpec('');
    setShowItemCardModal(true);
  };

  // Confirm adding the item from the detailed card into invoice items
  const confirmAddItemFromCard = (closeCatalog: boolean = false) => {
    if (!selectedCardProduct) return;
    const qty = parseFloat(itemCardQty);
    let unitPrice = itemCardPrice.trim() !== '' ? parseFloat(itemCardPrice) : itemCardDefaultPrice;

    if (isNaN(qty) || qty <= 0) {
      alert('يرجى إدخال الكمية أو العدد للصنف (الخانة خالية حالياً)');
      return;
    }
    if (isNaN(unitPrice) || unitPrice < 0) {
      alert('يرجى إدخال سعر الصنف (الخانة خالية حالياً)');
      return;
    }

    const branchProd = getProductForBranch(selectedCardProduct, invoiceBranchId);

    // Negative stock check if sale mode
    if ((mode === 'sale' || mode === 'wholesale') && branchProd.currentQty < qty) {
      const confirmNeg = confirm(
        `⚠️ تنبيه: رصيد الصنف "${selectedCardProduct.name}" بفرع (${invoiceBranch.name}) هو (${branchProd.currentQty}) والكمية المطلوبة هي (${qty}). هل ترغب في المتابعة؟`
      );
      if (!confirmNeg) return;
    }

    setInvoiceItems(prev => {
      const existingIdx = prev.findIndex(
        it => it.productId === selectedCardProduct.id && (it.spec || '') === itemCardSpec.trim() && Math.abs(it.unitPrice - unitPrice) < 0.001
      );
      if (existingIdx > -1) {
        const copy = [...prev];
        const newQty = copy[existingIdx].qty + qty;
        copy[existingIdx] = {
          ...copy[existingIdx],
          qty: newQty,
          total: newQty * copy[existingIdx].unitPrice - (copy[existingIdx].discount || 0)
        };
        return copy;
      } else {
        const newItem: InvoiceItem = {
          productId: selectedCardProduct.id,
          productCode: selectedCardProduct.code,
          productName: selectedCardProduct.name,
          unit: selectedCardProduct.unit,
          spec: itemCardSpec.trim(),
          qty: qty,
          unitPrice: unitPrice,
          costPrice: branchProd.avgCost || branchProd.buyPrice,
          discount: 0,
          taxRate: 0,
          total: qty * unitPrice
        };
        return [...prev, newItem];
      }
    });

    const isPriceModified = Math.abs(unitPrice - itemCardDefaultPrice) >= 0.01;
    const toastText = `✓ تمت إضافة "${selectedCardProduct.name}" (العدد: ${qty} - السعر: ${unitPrice.toFixed(2)} ${db.settings.currency})${isPriceModified ? ' [سعر معدل]' : ''} إلى الفاتورة`;
    setToastMessage(toastText);
    setTimeout(() => {
      setToastMessage(prev => (prev === toastText ? null : prev));
    }, 3000);

    setShowItemCardModal(false);
    setSelectedCardProduct(null);

    if (closeCatalog) {
      setShowLookupModal(false);
    }
  };

  // Fast on-the-fly item creation & registration into DB and invoice
  const confirmFastCreateItem = () => {
    const name = fastItemName.trim();
    if (!name) {
      alert('يرجى إدخال اسم الصنف أو البند');
      return;
    }
    const qty = parseFloat(fastItemQty);
    const price = parseFloat(fastItemPrice);

    if (isNaN(qty) || qty <= 0) {
      alert('يرجى إدخال كمية أو عدد الصنف');
      return;
    }
    if (isNaN(price) || price < 0) {
      alert('يرجى إدخال سعر الصنف');
      return;
    }

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const newCode = `P-${String(1000 + updated.products.length + 1)}`;
    const newId = generateId('prod');

    // The product starts with 0 stock in inventory, and saving the invoice will record the movement (negative for sale, positive for purchase)
    const isSale = mode === 'sale' || mode === 'wholesale';
    const initialQty = 0;

    const newProd: Product = {
      id: newId,
      code: newCode,
      barcode: '',
      name,
      category: fastItemCategory || 'عامة',
      unit: fastItemUnit || 'قطعة',
      buyPrice: mode === 'purchase' ? price : (price * 0.8),
      sellPrice: mode === 'purchase' ? (price * 1.25) : price,
      wholesalePrice: mode === 'purchase' ? (price * 1.15) : (price * 0.9),
      minStock: 5,
      currentQty: initialQty,
      avgCost: mode === 'purchase' ? price : (price * 0.8),
      branchesData: {
        [invoiceBranchId]: {
          currentQty: initialQty,
          buyPrice: mode === 'purchase' ? price : (price * 0.8),
          sellPrice: mode === 'purchase' ? (price * 1.25) : price,
          wholesalePrice: mode === 'purchase' ? (price * 1.15) : (price * 0.9),
          minStock: 5,
          avgCost: mode === 'purchase' ? price : (price * 0.8)
        }
      }
    };

    updated.products.push(newProd);
    logAudit(updated, `إثبات صنف جديد أثناء البحث بالفاتورة (${invoiceBranch.name})`, `${newProd.name} (كود: ${newProd.code}) - الرصيد: ${initialQty}`);
    onUpdateDb(updated);

    const newItem: InvoiceItem = {
      productId: newProd.id,
      productCode: newProd.code,
      productName: newProd.name,
      unit: newProd.unit,
      spec: isSale ? 'صنف جديد مضاف أثناء البيع (بالسالب)' : 'صنف جديد مضاف أثناء الشراء',
      qty,
      unitPrice: price,
      costPrice: newProd.buyPrice,
      discount: 0,
      taxRate: 0,
      total: qty * price
    };

    setInvoiceItems(prev => [...prev, newItem]);
    setShowFastCreateModal(false);
    setInlineProductSearch('');
    setShowInlineDropdown(false);
    setShowLookupModal(false);

    showToast(`✓ تم إثبات الصنف "${name}" بالمخزون بنجاح وتسجيله${isSale ? ` بالسالب (${initialQty})` : ` (+${initialQty})`} وإدراجه بالفاتورة`);
  };

  // Quick Register Party (عميل / مورد / شركة)
  const quickRegisterParty = (partyNameInput?: string) => {
    const pName = (partyNameInput || custSearchInput).trim();
    if (!pName) {
      alert(`يرجى كتابة اسم ${theme.partyLabel} / الشركة أولاً`);
      return;
    }

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const isCust = theme.partyRole === 'customer';
    const targetType = isCust ? 'customer' : 'supplier';
    const list = isCust ? updated.customers : updated.suppliers;

    // Duplicate check
    const dupCheck = isDuplicateParty(updated, targetType, pName, custPhone.trim());
    if (dupCheck.isDuplicate) {
      if (dupCheck.existing) {
        selectParty(dupCheck.existing);
        showToast(`✓ الشركة مسجلة مسبقاً: "${dupCheck.existing.name}" (كود: ${dupCheck.existing.code || '—'}) تم اختيارها تلقائياً`);
        setShowCustDropdown(false);
        return;
      }
      alert(`⚠️ منع التكرار: ${dupCheck.reason}`);
      return;
    }

    const newCode = getNextUniquePartyCode(updated, targetType);
    const newId = generateId('party');

    const newParty: Party = {
      id: newId,
      code: newCode,
      name: pName,
      company: pName,
      phone: custPhone.trim() || '',
      address: '',
      type: targetType,
      balance: 0,
      openingBalance: 0,
      creditLimit: 0,
      notes: 'تم التسجيل والإثبات أثناء إنشاء الفاتورة'
    };

    list.push(newParty);
    logAudit(updated, `إثبات ${theme.partyLabel} / شركة جديدة`, `${newParty.name} (${newParty.code})`);
    onUpdateDb(updated);

    setSelectedParty(newParty);
    setCustCode(newParty.code || '');
    setCustSearchInput(newParty.name);
    setShowCustDropdown(false);
    showToast(`✓ تم إثبات وتسجيل شركة جديدة: "${newParty.name}" (كود: ${newParty.code})`);
  };

  // Modify row modal
  const openModifyItem = (index: number) => {
    const it = invoiceItems[index];
    setModifyIndex(index);
    setModifyName(it.productName);
    setModifyQty(it.qty);
    setModifyPrice(it.unitPrice);
    setModifySpec(it.spec || '');
    setShowModifyModal(true);
  };

  const saveModifiedItem = () => {
    if (modifyIndex < 0 || modifyQty <= 0) return alert('الكمية غير صحيحة');
    setInvoiceItems(prev => {
      const copy = [...prev];
      copy[modifyIndex] = {
        ...copy[modifyIndex],
        qty: modifyQty,
        unitPrice: modifyPrice,
        spec: modifySpec,
        total: modifyQty * modifyPrice - (copy[modifyIndex].discount || 0)
      };
      return copy;
    });
    setShowModifyModal(false);
  };

  const removeInvoiceItem = (index: number) => {
    setInvoiceItems(prev => prev.filter((_, i) => i !== index));
  };

  // Multi-Payment management
  const addPaymentRow = (method: PaymentMethod = 'نقدي', amount: number = 0) => {
    setPaymentRows(prev => [...prev, { method, amount }]);
  };

  const removePaymentRow = (idx: number) => {
    setPaymentRows(prev => prev.filter((_, i) => i !== idx));
  };

  const updatePaymentRow = (idx: number, field: 'method' | 'amount', value: any) => {
    setPaymentRows(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  };

  // Add new item into database
  const saveNewItemToDB = () => {
    if (!newItemName.trim()) return alert('أدخل اسم الصنف');
    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;

    const buy = parseFloat(newBuyPrice) || 0;
    const cash = parseFloat(newCashPriceManual) || (buy > 0 ? buy * 1.2 : 100);
    const wholesale = parseFloat(newWholesalePriceManual) || (buy > 0 ? buy * 1.1 : 90);
    const stock = parseFloat(newStockQty) || 0;

    const newProd: Product = {
      id: generateId('prod'),
      name: newItemName.trim(),
      code: newItemCode.trim() || `PRD-${100 + updated.products.length + 1}`,
      barcode: '',
      category: newCategory || 'عامة',
      unit: 'قطعة',
      buyPrice: invoiceBranchId === 'br_main' ? buy : 0,
      sellPrice: invoiceBranchId === 'br_main' ? cash : 0,
      wholesalePrice: invoiceBranchId === 'br_main' ? wholesale : 0,
      minStock: 5,
      currentQty: invoiceBranchId === 'br_main' ? stock : 0,
      avgCost: buy > 0 ? buy : cash * 0.8,
      branchesData: {
        [invoiceBranchId]: {
          currentQty: stock,
          buyPrice: buy,
          sellPrice: cash,
          wholesalePrice: wholesale,
          minStock: 5,
          avgCost: buy > 0 ? buy : cash * 0.8
        }
      }
    };

    updated.products.push(newProd);
    logAudit(updated, `إضافة صنف من شاشة الفاتورة بفرع (${invoiceBranch.name})`, newProd.name);
    onUpdateDb(updated);

    setShowEditItemModal(false);
    setShowLookupModal(false);
    quickAddItem(newProd);
  };

  // Calculations for margins in new item modal
  const handleNewBuyPriceChange = (val: string) => {
    setNewBuyPrice(val);
    const b = parseFloat(val) || 0;
    const cMargin = parseFloat(newCashMargin) || 0;
    const wMargin = parseFloat(newWholesaleMargin) || 0;
    if (b > 0) {
      setNewCashPriceManual((b * (1 + cMargin / 100)).toFixed(2));
      setNewWholesalePriceManual((b * (1 + wMargin / 100)).toFixed(2));
    }
  };

  // SAVE INVOICE WITH COMPLETE ACCOUNTING IMPACT
  const handleSaveInvoice = () => {
    if (invoiceItems.length === 0) {
      alert('الفاتورة فارغة! أضف أصنافاً أولاً.');
      return;
    }

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;

    // Strict duplicate check for invoice number
    if (isDuplicateInvoiceNumber(updated, invNum, editingInvoice?.id)) {
      alert(`⚠️ منع التكرار: رقم الفاتورة (${invNum}) مسجل مسبقاً في النظام ولا يمكن تكراره نهائياً.`);
      return;
    }

    // Check Party and auto-register if new
    const isCust = theme.partyRole === 'customer';
    const targetType = isCust ? 'customer' : 'supplier';
    const targetPartyList = isCust ? updated.customers : updated.suppliers;

    const trimmedInput = custSearchInput.trim();
    const isCash = !trimmedInput ||
                   trimmedInput === 'نقدي' ||
                   trimmedInput === 'عميل نقدي' ||
                   trimmedInput === 'مورد نقدي';

    let partyName = isCash ? (isCust ? 'عميل نقدي' : 'مورد نقدي') : trimmedInput;
    let activePartyId = selectedParty?.id;
    let activePartyCode = custCode;

    if (!isCash && !activePartyId && trimmedInput) {
      const existing = targetPartyList.find(p => p.name.trim().toLowerCase() === trimmedInput.toLowerCase());
      if (existing) {
        activePartyId = existing.id;
        activePartyCode = existing.code || '';
        partyName = existing.name;
      } else {
        const dupCheck = isDuplicateParty(updated, targetType, trimmedInput, custPhone.trim());
        if (dupCheck.isDuplicate && dupCheck.existing) {
          activePartyId = dupCheck.existing.id;
          activePartyCode = dupCheck.existing.code || '';
          partyName = dupCheck.existing.name;
        } else {
          const newCode = getNextUniquePartyCode(updated, targetType);
          const newPartyId = generateId('party');
          const newlyCreated: Party = {
            id: newPartyId,
            code: newCode,
            name: trimmedInput,
            company: trimmedInput,
            phone: custPhone.trim() || '',
            address: '',
            type: targetType,
            balance: 0,
            openingBalance: 0,
            creditLimit: 0,
            notes: 'تم الإثبات والتسجيل أثناء حفظ الفاتورة'
          };
          targetPartyList.push(newlyCreated);
          activePartyId = newPartyId;
          activePartyCode = newCode;
        }
      }
    }

    // Determine final status & payment method based on settlementType
    let finalPaid = paidTotal;
    let finalRemaining = remainTotal;
    let mainPaymentMethod: PaymentMethod = 'نقدي';

    if (settlementType === 'credit') {
      mainPaymentMethod = 'آجل';
      finalPaid = 0;
      finalRemaining = netTotal;
    } else if (settlementType === 'cash') {
      mainPaymentMethod = 'نقدي';
      finalPaid = netTotal;
      finalRemaining = 0;
    } else {
      mainPaymentMethod = finalPaid > 0 ? 'نقدي' : 'آجل';
    }

    if (paymentRows.length > 0) {
      mainPaymentMethod = paymentRows[0].method;
    }

    let status: 'مدفوع' | 'جزئي' | 'آجل' = 'مدفوع';
    if (finalPaid <= 0) status = 'آجل';
    else if (finalRemaining > 0) status = 'جزئي';

    // Reverse previous effects if editing
    if (editingInvoice) {
      // Revert stock specifically for the branch of that invoice
      const prevBranchId = editingInvoice.branchId || 'br_main';
      editingInvoice.items.forEach(oldItem => {
        const prod = updated.products.find(p => p.id === oldItem.productId);
        if (prod) {
          const bp = getProductForBranch(prod, prevBranchId);
          let revertedQty = bp.currentQty;
          if (editingInvoice.type === 'sale' || editingInvoice.invoiceKind === 'sale' || editingInvoice.invoiceKind === 'wholesale') {
            revertedQty += oldItem.qty;
          } else if (editingInvoice.type === 'purchase' || editingInvoice.invoiceKind === 'purchase') {
            revertedQty -= oldItem.qty;
          } else if (editingInvoice.invoiceKind === 'sale_return') {
            revertedQty -= oldItem.qty;
          } else if (editingInvoice.invoiceKind === 'purchase_return') {
            revertedQty += oldItem.qty;
          }
          const updatedProd = updateProductBranchData(prod, prevBranchId, { currentQty: revertedQty });
          const pIdx = updated.products.findIndex(p => p.id === prod.id);
          if (pIdx > -1) updated.products[pIdx] = updatedProd;
        }
      });
      updated.stockMovements = updated.stockMovements.filter(sm => sm.sourceId !== editingInvoice.id);
      updated.treasury = updated.treasury.filter(tr => tr.sourceId !== editingInvoice.id);
      updated.journals = updated.journals.filter(j => j.sourceId !== editingInvoice.id);
      updated.invoices = updated.invoices.filter(i => i.id !== editingInvoice.id);
    }

    const invId = editingInvoice ? editingInvoice.id : generateId('inv');
    const isSale = mode === 'sale' || mode === 'wholesale';
    const isReturn = mode === 'sale_return' || mode === 'purchase_return';

    // Audit Logging: Capture exact who, when, role and details
    const nowIso = new Date().toISOString();
    const currentUserName = db.currentUser?.name || 'مدير النظام';
    const currentUserId = db.currentUser?.id || 'usr_admin';
    const currentUserRole = db.currentUser?.role || 'مدير';
    const formattedNowDate = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
    const formattedNowTime = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    let invoiceAuditLog: InvoiceAuditEntry[] = [];

    if (editingInvoice) {
      const existingLogs: InvoiceAuditEntry[] = (editingInvoice.auditLog && editingInvoice.auditLog.length > 0)
        ? [...editingInvoice.auditLog]
        : [
            {
              id: generateId('aud'),
              action: 'create',
              actionTitle: 'إنشاء الفاتورة الأصلية',
              userName: editingInvoice.createdBy || 'مدير النظام',
              userId: editingInvoice.createdById || 'usr_admin',
              userRole: 'مدير',
              timestamp: editingInvoice.createdAt || `${editingInvoice.date}T12:00:00Z`,
              formattedDate: editingInvoice.date,
              formattedTime: editingInvoice.time || '12:00',
              summary: `تم إنشاء الفاتورة لأول مرة بقيمة ${editingInvoice.total.toLocaleString()} ${db.settings.currency || 'ر.س'} (${editingInvoice.items.length} أصناف)`,
              newTotal: editingInvoice.total,
              itemsCount: editingInvoice.items.length
            }
          ];

      const changeNotes: string[] = [];
      if (Math.abs(editingInvoice.total - netTotal) > 0.01) {
        changeNotes.push(`تعديل الإجمالي: من ${editingInvoice.total.toLocaleString()} إلى ${netTotal.toLocaleString()} ${db.settings.currency || 'ر.س'}`);
      }
      if (editingInvoice.items.length !== invoiceItems.length) {
        changeNotes.push(`تعديل عدد الأصناف: من ${editingInvoice.items.length} إلى ${invoiceItems.length}`);
      }
      if (editingInvoice.partyName !== partyName) {
        changeNotes.push(`تغيير الطرف: إلى "${partyName}"`);
      }
      if (Math.abs(editingInvoice.paid - finalPaid) > 0.01) {
        changeNotes.push(`تعديل المدفوع: ${finalPaid.toLocaleString()} ${db.settings.currency || 'ر.س'} (المتبقي: ${finalRemaining.toLocaleString()})`);
      }
      if (editingInvoice.date !== invDate) {
        changeNotes.push(`تعديل تاريخ الفاتورة: إلى ${invDate}`);
      }
      if (changeNotes.length === 0) {
        changeNotes.push('تحديث وحفظ تفاصيل الفاتورة ومراجعة بنودها');
      }

      const newAuditItem: InvoiceAuditEntry = {
        id: generateId('aud'),
        action: 'edit',
        actionTitle: 'تعديل الفاتورة',
        userName: currentUserName,
        userId: currentUserId,
        userRole: currentUserRole,
        timestamp: nowIso,
        formattedDate: formattedNowDate,
        formattedTime: formattedNowTime,
        summary: changeNotes.join(' • '),
        previousTotal: editingInvoice.total,
        newTotal: netTotal,
        itemsCount: invoiceItems.length
      };

      invoiceAuditLog = [newAuditItem, ...existingLogs];
    } else {
      invoiceAuditLog = [
        {
          id: generateId('aud'),
          action: 'create',
          actionTitle: 'إنشاء الفاتورة',
          userName: currentUserName,
          userId: currentUserId,
          userRole: currentUserRole,
          timestamp: nowIso,
          formattedDate: formattedNowDate,
          formattedTime: formattedNowTime,
          summary: `تم إنشاء الفاتورة بواسطة ${currentUserName} (${currentUserRole}) بقيمة إجمالية ${netTotal.toLocaleString()} ${db.settings.currency || 'ر.س'} (${status})`,
          newTotal: netTotal,
          itemsCount: invoiceItems.length
        }
      ];
    }

    const savedInvoice: Invoice = {
      id: invId,
      number: invNum,
      type: isSale ? 'sale' : (mode === 'purchase' ? 'purchase' : (mode === 'sale_return' ? 'sale' : 'purchase')),
      invoiceKind: mode,
      date: invDate,
      time: invTime,
      jobSite,
      priceType,
      partyId: activePartyId,
      partyCode: activePartyCode,
      partyName,
      partyPhone: custPhone,
      warehouseId: updated.warehouses[0]?.id || 'wh_main',
      paymentMethod: mainPaymentMethod,
      payments: paymentRows.length > 0 ? paymentRows : [{ method: mainPaymentMethod, amount: finalPaid }],
      subtotal: itemsSubTotal,
      discount: globalDiscCalculated,
      discountType: invDiscType,
      tax: globalTaxCalculated,
      taxType: invTaxType,
      extraIncomeName: extraIncome > 0 ? extraIncomeName : undefined,
      extraIncomeVal: extraIncome > 0 ? extraIncome : undefined,
      total: netTotal,
      paid: finalPaid,
      remaining: finalRemaining,
      status,
      notes: jobSite ? `جهة العمل: ${jobSite}` : undefined,
      createdBy: editingInvoice?.createdBy || currentUserName,
      createdById: editingInvoice?.createdById || currentUserId,
      createdAt: editingInvoice?.createdAt || (editingInvoice ? `${editingInvoice.date}T12:00:00Z` : nowIso),
      updatedBy: editingInvoice ? currentUserName : undefined,
      updatedById: editingInvoice ? currentUserId : undefined,
      updatedAt: editingInvoice ? nowIso : undefined,
      auditLog: invoiceAuditLog,
      branchId: invoiceBranchId,
      branchName: invoiceBranch.name,
      items: JSON.parse(JSON.stringify(invoiceItems))
    };

    // 1. Stock movements & inventory balance update specifically for this branch
    const whId = updated.warehouses[0]?.id || 'wh_main';
    const wh = updated.warehouses.find(w => w.id === whId);

    savedInvoice.items.forEach(item => {
      const prod = updated.products.find(p => p.id === item.productId || p.code === item.productCode);
      if (prod) {
        const bp = getProductForBranch(prod, invoiceBranchId);
        let qtyChange = 0;
        let newQty = bp.currentQty;
        let newAvgCost = bp.avgCost || bp.buyPrice;
        let newBuyPrice = bp.buyPrice;

        if (mode === 'sale' || mode === 'wholesale') {
          qtyChange = -item.qty;
          newQty -= item.qty;
        } else if (mode === 'purchase') {
          qtyChange = item.qty;
          const oldQty = Math.max(0, bp.currentQty);
          const oldCost = bp.avgCost || bp.buyPrice;
          const newQ = item.qty;
          const newCost = item.unitPrice;
          const totalQ = oldQty + newQ;
          newAvgCost = totalQ > 0 ? ((oldQty * oldCost) + (newQ * newCost)) / totalQ : newCost;
          newBuyPrice = newCost;
          newQty += item.qty;
        } else if (mode === 'sale_return') {
          qtyChange = item.qty;
          newQty += item.qty;
        } else if (mode === 'purchase_return') {
          qtyChange = -item.qty;
          newQty -= item.qty;
        }

        const updatedProd = updateProductBranchData(prod, invoiceBranchId, {
          currentQty: newQty,
          avgCost: newAvgCost,
          buyPrice: newBuyPrice
        });
        const pIdx = updated.products.findIndex(p => p.id === prod.id);
        if (pIdx > -1) updated.products[pIdx] = updatedProd;

        updated.stockMovements.unshift({
          id: generateId('sm'),
          date: savedInvoice.date,
          productId: prod.id,
          productName: prod.name,
          warehouseId: whId,
          warehouseName: wh ? wh.name : 'المخزن الرئيسي',
          qtyChange,
          balanceAfter: newQty,
          unitCost: item.costPrice,
          type: mode === 'sale' || mode === 'wholesale' ? 'sale' :
                mode === 'purchase' ? 'purchase' :
                mode === 'sale_return' ? 'sale_return' : 'purchase_return',
          refNumber: savedInvoice.number,
          sourceId: invId,
          branchId: invoiceBranchId,
          branchName: invoiceBranch.name
        });
      }
    });

    // 2. Treasury entries for each payment belonging to this branch
    if (finalPaid > 0) {
      if (savedInvoice.payments && savedInvoice.payments.length > 0) {
        savedInvoice.payments.forEach(pLine => {
          if (pLine.amount > 0 && pLine.method !== 'آجل') {
            updated.treasury.unshift({
              id: generateId('tr'),
              date: savedInvoice.date,
              direction: (mode === 'sale' || mode === 'wholesale' || mode === 'purchase_return') ? 'in' : 'out',
              amount: pLine.amount,
              method: pLine.method,
              description: `تحصيل فاتورة ${savedInvoice.number} (${invoiceBranch.name}) - ${partyName}`,
              sourceType: mode,
              sourceId: invId,
              branchId: invoiceBranchId,
              branchName: invoiceBranch.name
            });
          }
        });
      } else if (mainPaymentMethod !== 'آجل') {
        updated.treasury.unshift({
          id: generateId('tr'),
          date: savedInvoice.date,
          direction: (mode === 'sale' || mode === 'wholesale' || mode === 'purchase_return') ? 'in' : 'out',
          amount: finalPaid,
          method: mainPaymentMethod,
          description: `تحصيل فاتورة ${savedInvoice.number} (${invoiceBranch.name}) - ${partyName}`,
          sourceType: mode,
          sourceId: invId,
          branchId: invoiceBranchId,
          branchName: invoiceBranch.name
        });
      }
    }

    // 3. Automated balanced double-entry journal
    const journal = createInvoiceJournal(updated, savedInvoice);
    savedInvoice.journalEntryId = journal.id;
    updated.journals.unshift(journal);

    // 4. Increment sequence if new
    if (!editingInvoice) {
      const numDigits = parseInt(savedInvoice.number.replace(/\D/g, '')) || 0;
      if (mode === 'sale' || mode === 'wholesale') {
        updated.settings.nextSale = Math.max(updated.settings.nextSale || 1, numDigits + 1);
      } else if (mode === 'purchase') {
        updated.settings.nextPurchase = Math.max(updated.settings.nextPurchase || 1, numDigits + 1);
      } else if (mode === 'quote') {
        updated.settings.nextQuote = Math.max(updated.settings.nextQuote || 1, numDigits + 1);
      }
    }

    // 5. Save to invoices array
    updated.invoices.unshift(savedInvoice);

    // If this is a return invoice, also populate db.returns items for individual return tracking
    if (mode === 'sale_return' || mode === 'purchase_return') {
      if (!updated.returns) updated.returns = [];
      savedInvoice.items.forEach(it => {
        updated.returns.unshift({
          id: generateId('ret'),
          number: savedInvoice.number,
          type: mode === 'sale_return' ? 'sale' : 'purchase',
          date: savedInvoice.date,
          originalInvoiceId: savedInvoice.id,
          originalInvoiceNumber: savedInvoice.number,
          partyId: savedInvoice.partyId,
          partyName: savedInvoice.partyName,
          warehouseId: savedInvoice.warehouseId,
          paymentMethod: savedInvoice.paymentMethod,
          productId: it.productId,
          productName: it.productName,
          qty: it.qty,
          price: it.unitPrice,
          total: it.total,
          notes: savedInvoice.notes,
          journalEntryId: savedInvoice.journalEntryId
        });
      });
    }

    // 6. Audit
    logAudit(
      updated,
      editingInvoice ? `تعديل ${theme.title}` : `إنشاء ${theme.title}`,
      `فاتورة رقم ${savedInvoice.number} بواسطة [${currentUserName}] (${currentUserRole}) - بقيمة ${formatMoney(savedInvoice.total, updated.settings.currency)} للطرف ${partyName}`
    );

    onUpdateDb(updated);

    alert(`✓ تم حفظ الفاتورة رقم ${savedInvoice.number} بنجاح وترحيل جميع الحركات المحاسبية للمخزن والخزينة!`);

    if (onCloseEdit) {
      onCloseEdit();
    } else {
      // Reset for next invoice
      setInvoiceItems([]);
      setPaymentRows([]);
      setJobSite('');
      setGlobalInvDisc('');
      setGlobalInvTax('');
      setExtraIncomeVal('');
      setCustSearchInput('نقدي');
      setCustCode('1');
      setCustPhone('');
      const cashParty = (isCust ? updated.customers : updated.suppliers).find(
        p => p.name.trim() === 'نقدي' ||
             p.name.trim() === (isCust ? 'عميل نقدي' : 'مورد نقدي') ||
             p.code === 'CASH'
      );
      setSelectedParty(cashParty || null);
      const { number: nextUniqueNum } = getNextUniqueInvoiceNumber(updated, mode);
      setInvNum(nextUniqueNum);
    }
  };

  // Current balance display of selected party
  const partyBalance = selectedParty
    ? (theme.partyRole === 'customer'
        ? calculateCustomerBalance(db, selectedParty.id)
        : calculateSupplierBalance(db, selectedParty.id))
    : 0;

  return (
    <div className="w-full flex justify-center p-0 transition-all select-none">
      {/* Container: exact compact mobile dimensions on phone, responsive on larger viewports */}
      <div
        className={`w-full bg-white rounded-lg border border-slate-300 shadow-md flex flex-col relative transition-all ${
          layoutWidth === 'mobile' ? 'max-w-[480px]' : 'max-w-4xl'
        }`}
        style={{ minHeight: '80vh' }}
      >
        {/* Header Title with live time, responsive toggle, and prominent Close X button */}
        <div
          className="text-white px-2.5 py-1.5 text-xs font-bold flex items-center justify-between rounded-t-lg shadow-2xs"
          style={{ backgroundColor: theme.headerBg }}
        >
          <div className="flex items-center gap-2">
            <HeaderIcon className="w-3.5 h-3.5" />
            <span>{theme.title}</span>
            {editingInvoice && (
              <span className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded font-mono">
                تعديل: {editingInvoice.number}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Audit Log Button */}
            {editingInvoice && (
              <button
                type="button"
                onClick={() => setShowAuditModal(true)}
                className="flex items-center gap-1 text-[10px] bg-white/20 hover:bg-white/30 text-white px-2 py-0.5 rounded transition-colors cursor-pointer"
                title="سجل الرقابة المالية والتدقيق (من أنشأ ومن عدل)"
              >
                <ShieldCheck className="w-3 h-3 text-emerald-300" />
                <span>سجل التدقيق</span>
              </button>
            )}

            {/* Layout switch for tablet/desktop */}
            <button
              onClick={() => setLayoutWidth(prev => (prev === 'mobile' ? 'expanded' : 'mobile'))}
              className="hidden sm:flex items-center gap-1 text-[10px] text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded transition-colors cursor-pointer"
              title="تبديل العرض بين الموبايل والشاشة الواسعة"
            >
              {layoutWidth === 'mobile' ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
              <span>{layoutWidth === 'mobile' ? 'شاشة واسعة' : 'شاشة مدمجة'}</span>
            </button>

            <InvoiceLiveClock />

            {/* Close Button X (requested by user) */}
            {(onClose || onCloseEdit) && (
              <button
                type="button"
                onClick={onClose || onCloseEdit}
                className="p-1 rounded bg-black/20 hover:bg-rose-600 text-white transition-colors flex items-center justify-center cursor-pointer ml-0.5"
                title="إغلاق الفاتورة والعودة للقائمة (X)"
                aria-label="إغلاق الفاتورة"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Main Workspace Content */}
        <div className="p-1.5 sm:p-2 flex flex-col gap-1.5 flex-1">
          {/* Financial Audit & Governance Bar */}
          <div className="bg-slate-100 border border-slate-300 rounded p-1.5 flex flex-wrap items-center justify-between gap-1.5 text-[9px]">
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="flex items-center gap-1 font-bold text-slate-800">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                <span>الرقابة والفرع:</span>
              </div>
              <span className="bg-blue-100/80 text-blue-900 border border-blue-300 px-2 py-0.5 rounded font-black flex items-center gap-1">
                <Building2 className="w-3 h-3 text-blue-700" />
                فرع الفاتورة: {invoiceBranch.name}
              </span>
              <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 rounded font-bold">
                المنشئ: {editingInvoice?.createdBy || db.currentUser?.name || 'مدير النظام'}
              </span>
              {editingInvoice?.updatedBy ? (
                <span className="bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.2 rounded font-bold">
                  آخر تعديل: {editingInvoice.updatedBy}
                </span>
              ) : (
                <span className="bg-slate-50 text-slate-600 border border-slate-200 px-1.5 py-0.2 rounded font-medium">
                  {editingInvoice ? 'الحالة: أصلية (لم تُعدل)' : 'فاتورة جديدة قيد الإنشاء'}
                </span>
              )}
            </div>

            {editingInvoice && (
              <button
                type="button"
                onClick={() => setShowAuditModal(true)}
                className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-300 rounded font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                title="عرض سجل تاريخ وإنشاء وتعديل الفاتورة بالكامل مع التواريخ والأوقات"
              >
                <History className="w-3 h-3 text-blue-600" />
                <span>سجل التدقيق (Audit Log)</span>
                {editingInvoice.auditLog && editingInvoice.auditLog.length > 0 && (
                  <span className="bg-blue-600 text-white rounded-full px-1 text-[8px] font-mono">
                    {editingInvoice.auditLog.length}
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Invoice Card: 3 Columns Grid (matches user HTML code) */}
          <div className="bg-slate-50 border border-slate-300 rounded p-1.5 grid grid-cols-3 sm:grid-cols-6 gap-1 text-[9px]">
            <div className="flex flex-col gap-0.5">
              <label className="font-bold text-slate-600 text-[8px]">رقم الفاتورة</label>
              <input
                type="text"
                value={invNum}
                readOnly
                className="px-1.5 py-0.5 border border-slate-300 rounded text-[9px] bg-slate-100 font-mono font-bold h-[22px]"
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <label className="font-bold text-slate-600 text-[8px]">التاريخ</label>
              <input
                type="date"
                value={invDate}
                onChange={e => setInvDate(e.target.value)}
                className="px-1.5 py-0.5 border border-slate-300 rounded text-[9px] bg-white font-mono h-[22px]"
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <label className="font-bold text-slate-600 text-[8px]">الوقت</label>
              <input
                type="time"
                value={invTime}
                onChange={e => setInvTime(e.target.value)}
                className="px-1.5 py-0.5 border border-slate-300 rounded text-[9px] bg-white font-mono h-[22px]"
              />
            </div>

            <div className="flex flex-col gap-0.5 relative">
              <label className="font-bold text-slate-600 text-[8px]">كود {theme.partyLabel}</label>
              <input
                type="text"
                value={custCode}
                placeholder="الكود..."
                onChange={e => syncPartyByCode(e.target.value)}
                className="px-1.5 py-0.5 border border-slate-300 rounded text-[9px] bg-white font-bold h-[22px]"
              />
            </div>

            <div className="flex flex-col gap-0.5 relative col-span-1 sm:col-span-2">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-600 text-[8px]">اسم {theme.partyLabel} / الشركة (بحث)</label>
                {custSearchInput.trim().length > 0 && custSearchInput.trim() !== 'نقدي' && (
                  <button
                    type="button"
                    onClick={() => quickRegisterParty(custSearchInput)}
                    className="text-[7.5px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-0.5 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-300"
                    title="تسجيل هذه الشركة في الدليل"
                  >
                    <Plus className="w-2.5 h-2.5" />
                    <span>+ إثبات جديد</span>
                  </button>
                )}
              </div>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={custSearchInput}
                  placeholder="ابحث بالاسم أو احذف نقدي لكتابة اسم الشركة..."
                  onFocus={() => setShowCustDropdown(true)}
                  onChange={e => {
                    setCustSearchInput(e.target.value);
                    setShowCustDropdown(true);
                  }}
                  className="w-full pl-6 pr-1.5 py-0.5 border border-slate-300 rounded text-[9px] bg-white font-bold h-[22px] focus:ring-1 focus:ring-emerald-500"
                />
                {custSearchInput.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustSearchInput('');
                      setSelectedParty(null);
                      setCustCode('');
                      setCustPhone('');
                      setShowCustDropdown(true);
                    }}
                    className="absolute left-1 text-slate-400 hover:text-rose-600 p-0.5 rounded cursor-pointer"
                    title="مسح للبحث عن شركة أخرى"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Backdrop to close dropdown on click outside */}
              {showCustDropdown && (
                <div
                  className="fixed inset-0 z-[90] bg-black/10"
                  onClick={() => setShowCustDropdown(false)}
                />
              )}

              {/* Wide & Tall Autocomplete Dropdown (طويل وعريض) */}
              {showCustDropdown && (
                <div className="absolute top-full right-0 w-[92vw] sm:w-[500px] md:w-[620px] max-w-[640px] bg-white border-2 border-emerald-600 rounded-xl max-h-[380px] overflow-hidden z-[100] shadow-2xl mt-1 flex flex-col">
                  {/* Dropdown Header */}
                  <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-2 flex items-center justify-between text-[11px] font-bold">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>دليل {theme.partyLabel === 'العميل' ? 'الشركات والعملاء' : 'الشركات والموردين'} ({partiesList.length})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowCustDropdown(false)}
                      className="p-1 hover:bg-white/20 rounded cursor-pointer transition-colors"
                      title="إغلاق القائمة"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Cash Option Button (Quick Select) */}
                  <div className="p-1.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCustSearchInput('نقدي');
                        setCustCode('1');
                        setCustPhone('');
                        const cashParty = partiesList.find(
                          p => p.name.trim() === 'نقدي' ||
                               p.name.trim() === (theme.partyRole === 'customer' ? 'عميل نقدي' : 'مورد نقدي') ||
                               p.code === 'CASH'
                        );
                        setSelectedParty(cashParty || null);
                        setShowCustDropdown(false);
                      }}
                      className="flex-1 py-1 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
                    >
                      <CheckCircle2 className="w-3 h-3 text-emerald-200" />
                      <span>اختيار سريع: «نقدي / كاش» (بدون تسجيل حساب آجل)</span>
                    </button>
                  </div>

                  {/* Quick Register New Company Bar if typed name is not empty and not "نقدي" */}
                  {custSearchInput.trim().length > 0 &&
                   custSearchInput.trim() !== 'نقدي' &&
                   custSearchInput.trim() !== 'عميل نقدي' &&
                   custSearchInput.trim() !== 'مورد نقدي' && (
                    <div className="p-2 bg-emerald-50 border-b border-emerald-200 flex flex-col sm:flex-row items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 text-emerald-950 text-[10px] font-bold">
                        <Plus className="w-4 h-4 text-emerald-700 shrink-0" />
                        <span>تسجيل <strong>«{custSearchInput.trim()}»</strong> كشركة / جهة جديدة فوراً بالنظام</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => quickRegisterParty(custSearchInput)}
                        className="w-full sm:w-auto px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[9px] shadow-xs cursor-pointer flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
                      >
                        <Check className="w-3 h-3" />
                        <span>إثبات وحفظ بالدليل الآن</span>
                      </button>
                    </div>
                  )}

                  {/* Scrollable Parties List */}
                  <div className="overflow-y-auto max-h-[260px] divide-y divide-slate-100 p-1">
                    {partiesList
                      .filter(p => {
                        const q = custSearchInput.trim().toLowerCase();
                        if (!q || q === 'نقدي') return true;
                        return (
                          p.name.toLowerCase().includes(q) ||
                          (p.code && p.code.toLowerCase().includes(q)) ||
                          (p.phone && p.phone.includes(q)) ||
                          (p.company && p.company.toLowerCase().includes(q))
                        );
                      })
                      .map(p => {
                        const bal = theme.partyRole === 'customer'
                          ? calculateCustomerBalance(db, p.id)
                          : calculateSupplierBalance(db, p.id);
                        return (
                          <div
                            key={p.id}
                            onClick={() => selectParty(p)}
                            className="p-2 hover:bg-blue-50/80 cursor-pointer flex items-center justify-between transition-colors rounded-md group"
                          >
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-900 text-[11px] group-hover:text-blue-700">
                                  {p.name}
                                </span>
                                {p.code && (
                                  <span className="bg-slate-100 group-hover:bg-blue-100 text-slate-700 group-hover:text-blue-800 text-[8.5px] px-1.5 py-0.2 rounded font-mono font-bold">
                                    [{p.code}]
                                  </span>
                                )}
                                {p.company && p.company !== p.name && (
                                  <span className="text-[9px] text-slate-500 bg-slate-100 px-1 rounded">
                                    {p.company}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-[9px] text-slate-500">
                                {p.phone && (
                                  <span className="font-mono flex items-center gap-0.5">
                                    📞 {p.phone}
                                  </span>
                                )}
                                {p.address && (
                                  <span className="truncate max-w-[160px]">
                                    📍 {p.address}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-left shrink-0">
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ${
                                  bal > 0
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : bal < 0
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                }`}
                              >
                                {bal !== 0 ? `الرصيد: ${bal.toLocaleString()} ${db.settings.currency || 'ر.س'}` : 'الحساب خالص'}
                              </span>
                            </div>
                          </div>
                        );
                      })}

                    {partiesList.filter(p => {
                      const q = custSearchInput.trim().toLowerCase();
                      if (!q || q === 'نقدي') return true;
                      return (
                        p.name.toLowerCase().includes(q) ||
                        (p.code && p.code.toLowerCase().includes(q)) ||
                        (p.phone && p.phone.includes(q)) ||
                        (p.company && p.company.toLowerCase().includes(q))
                      );
                    }).length === 0 && (
                      <div className="p-4 text-center text-slate-500 text-[10px] flex flex-col items-center gap-2">
                        <span>لا توجد شركة أو عميل مسجل بهذا الاسم: «{custSearchInput}»</span>
                        <button
                          type="button"
                          onClick={() => quickRegisterParty(custSearchInput)}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[9px] shadow-xs cursor-pointer flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>إضافة «{custSearchInput}» كشركة جديدة الآن</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-0.5 relative col-span-1 sm:col-span-2">
              <label className="font-bold text-slate-600 text-[8px]">رقم الهاتف</label>
              <input
                type="text"
                value={custPhone}
                placeholder="ابحث برقم الهاتف..."
                onFocus={() => setShowPhoneDropdown(true)}
                onChange={e => {
                  setCustPhone(e.target.value);
                  setShowPhoneDropdown(true);
                }}
                className="px-1.5 py-0.5 border border-slate-300 rounded text-[9px] bg-white font-mono h-[22px]"
              />
              {showPhoneDropdown && (
                <>
                  <div className="fixed inset-0 z-[90] bg-black/10" onClick={() => setShowPhoneDropdown(false)} />
                  <div className="absolute top-full right-0 w-[80vw] sm:w-[380px] max-w-[400px] bg-white border border-blue-600 rounded-lg max-h-48 overflow-y-auto z-[100] shadow-xl mt-0.5 divide-y divide-slate-100 p-1">
                    {partiesList
                      .filter(p => p.phone && p.phone.includes(custPhone.trim()))
                      .map(p => (
                        <div
                          key={p.id}
                          onClick={() => selectParty(p)}
                          className="p-1.5 text-[9px] hover:bg-blue-50 cursor-pointer flex items-center justify-between rounded"
                        >
                          <span className="font-bold text-slate-900">{p.name} {p.code ? `[${p.code}]` : ''}</span>
                          <span className="text-[8.5px] font-mono text-blue-700 font-bold">{p.phone}</span>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-col gap-0.5 col-span-3 sm:col-span-4">
              <label className="font-bold text-slate-600 text-[8px]">البيان / جهة العمل</label>
              <input
                type="text"
                value={jobSite}
                placeholder="جهة العمل أو ملاحظات الفاتورة..."
                onChange={e => setJobSite(e.target.value)}
                className="px-1.5 py-0.5 border border-slate-300 rounded text-[9px] bg-white h-[22px]"
              />
            </div>

            {/* Account Status and Debt Display */}
            <div className="col-span-3 sm:col-span-6 bg-amber-50 border border-amber-200 p-1 rounded flex items-center justify-between text-[8.5px] font-bold text-slate-900">
              <div className="flex items-center gap-1.5">
                <span>حالة الحساب:</span>
                <span className={`font-black ${partyBalance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {selectedParty ? (partyBalance > 0 ? 'آجل (عليه مديونية)' : 'نقدي / خالص') : 'نقدي'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span>الرصيد الجاري:</span>
                <span className="font-mono font-black text-slate-950">
                  {formatMoney(partyBalance, db.settings.currency)}
                </span>
              </div>
            </div>

            {/* Settlement / Payment Choice Bar (نقدي كاش vs آجل ذمم vs سداد جزئي) */}
            <div className="col-span-3 sm:col-span-6 bg-slate-900 text-white p-2 rounded-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2 shadow-xs">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <span className="text-[10px] font-bold block">
                    طريقة السداد / نوع التسوية ({mode === 'purchase' ? 'مع المورد' : 'مع العميل'}):
                  </span>
                  <span className="text-[8.5px] text-slate-300">
                    {settlementType === 'cash' ? '✓ نقدي - سداد كامل بالصندوق والخزينة' :
                     settlementType === 'credit' ? '✓ آجل ذمم - قيد المبلغ على حساب الطرف (غير مسدد)' :
                     '✓ سداد جزئي - جزء نقدي والمتبقي آجل على الحساب'}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setSettlementType('cash');
                    setPartialPaidInput('');
                  }}
                  className={`px-3 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    settlementType === 'cash'
                      ? 'bg-emerald-600 text-white shadow ring-2 ring-emerald-400 font-black'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>نقدي (كاش)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSettlementType('credit');
                    setPartialPaidInput('');
                  }}
                  className={`px-3 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    settlementType === 'credit'
                      ? 'bg-amber-600 text-white shadow ring-2 ring-amber-400 font-black'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>آجل ذمم (على الحساب)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSettlementType('partial');
                    setPartialPaidInput(partialPaidInput || String(Math.round(netTotal / 2)));
                  }}
                  className={`px-3 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    settlementType === 'partial'
                      ? 'bg-blue-600 text-white shadow ring-2 ring-blue-400 font-black'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>سداد جزئي</span>
                </button>

                {settlementType === 'partial' && (
                  <div className="flex items-center gap-1 bg-white text-slate-900 px-2 py-0.5 rounded text-[10px]">
                    <span className="font-bold text-slate-700">المسدد نقداً:</span>
                    <input
                      type="number"
                      min="0"
                      max={netTotal}
                      step="any"
                      value={partialPaidInput}
                      onChange={e => setPartialPaidInput(e.target.value)}
                      placeholder="0.00"
                      className="w-16 text-center font-mono font-bold text-xs text-blue-700 outline-none"
                    />
                    <span className="font-bold text-slate-500">{db.settings.currency}</span>
                    <span className="text-[9px] text-rose-600 font-bold mr-1">
                      (المتبقي: {(Math.max(0, netTotal - (parseFloat(partialPaidInput) || 0))).toFixed(2)})
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Top Actions & Dynamic Product Search Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setShowLookupModal(true)}
              className="py-1.5 px-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>دليل الأصناف الكلي (1001 صنف)</span>
            </button>
            <button
              type="button"
              onClick={() => setShowOptionsModal(true)}
              className="py-1.5 px-2 bg-slate-700 hover:bg-slate-800 text-white rounded text-[10px] font-bold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>الخصم، الضريبة والدفع</span>
            </button>
          </div>

          {/* Dynamic Instant Product Search & Quick Add Field */}
          <div className="relative">
            <div className="flex items-center gap-1 bg-white border border-blue-400 rounded p-1 shadow-2xs">
              <Search className="w-3.5 h-3.5 text-blue-600 shrink-0 mr-1" />
              <input
                type="text"
                placeholder="بحث ديناميكي لإضافة صنف فوراً بالاسم أو الكود (أكثر من 1000 صنف)..."
                value={inlineProductSearch}
                onFocus={() => setShowInlineDropdown(true)}
                onChange={e => {
                  setInlineProductSearch(e.target.value);
                  setShowInlineDropdown(true);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const trimmed = inlineProductSearch.trim().toLowerCase();
                    if (!trimmed) return;
                    const match = db.products.find(p =>
                      p.name.toLowerCase().includes(trimmed) ||
                      p.code.toLowerCase() === trimmed ||
                      (p.barcode && p.barcode === trimmed)
                    );
                    if (match) {
                      openItemCard(match);
                      setInlineProductSearch('');
                      setShowInlineDropdown(false);
                    } else {
                      setFastItemName(inlineProductSearch.trim());
                      setFastItemQty('');
                      setFastItemPrice('');
                      setShowFastCreateModal(true);
                      setShowInlineDropdown(false);
                    }
                  }
                }}
                className="flex-1 text-[10px] outline-none font-bold bg-transparent"
              />
              {inlineProductSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setInlineProductSearch('');
                    setShowInlineDropdown(false);
                  }}
                  className="p-0.5 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Instant Product Search Suggestions Dropdown */}
            {showInlineDropdown && inlineProductSearch.trim().length > 0 && (
              <div className="absolute top-full right-0 left-0 bg-white border border-blue-500 rounded-lg max-h-56 overflow-y-auto z-50 shadow-xl mt-0.5 divide-y divide-slate-100">
                {(() => {
                  const s = inlineProductSearch.trim().toLowerCase();
                  const matches = db.products.filter(p =>
                    p.name.toLowerCase().includes(s) ||
                    p.code.toLowerCase().includes(s) ||
                    (p.barcode && p.barcode.toLowerCase().includes(s))
                  ).slice(0, 10);

                  if (matches.length === 0) {
                    return (
                      <div className="p-3 text-center text-[9.5px] text-slate-600 space-y-2">
                        <div>لا توجد أصناف مطابقة لـ "{inlineProductSearch}"</div>
                        <button
                          type="button"
                          onClick={() => {
                            setFastItemName(inlineProductSearch.trim());
                            setFastItemQty('');
                            setFastItemPrice('');
                            setShowFastCreateModal(true);
                            setShowInlineDropdown(false);
                          }}
                          className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[9.5px] font-bold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>+ إثبات وإضافة "{inlineProductSearch}" كصنف جديد فوراً</span>
                        </button>
                      </div>
                    );
                  }

                  return (
                    <>
                      <div
                        onClick={() => {
                          setFastItemName(inlineProductSearch.trim());
                          setFastItemQty('');
                          setFastItemPrice('');
                          setShowFastCreateModal(true);
                          setShowInlineDropdown(false);
                        }}
                        className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 cursor-pointer flex items-center justify-between text-[8.5px] font-bold border-b border-emerald-200 transition-colors"
                      >
                        <span className="flex items-center gap-1">
                          <Plus className="w-3 h-3 text-emerald-700" />
                          <span>+ إضافة بند جديد غير موجود باسم "{inlineProductSearch}"</span>
                        </span>
                        <span className="text-[7.5px] bg-emerald-600 text-white px-1.5 py-0.2 rounded">صنف جديد</span>
                      </div>
                      {matches.map(p => {
                    const bp = getProductForBranch(p, invoiceBranchId);
                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          openItemCard(p);
                          setInlineProductSearch('');
                          setShowInlineDropdown(false);
                        }}
                        className="p-2 hover:bg-blue-50 cursor-pointer flex items-center justify-between text-[9px] transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-900 truncate">
                            {p.name}
                          </div>
                          <div className="text-[8px] text-slate-500 flex items-center gap-2 mt-0.5 font-mono">
                            <span>كود: {p.code}</span>
                            <span className={bp.currentQty <= 0 ? 'text-rose-600 font-bold' : 'text-blue-600'}>
                              متاح بالفرع: {bp.currentQty}
                            </span>
                          </div>
                        </div>
                        <div className="text-left shrink-0 mr-2">
                          <span className="font-bold text-emerald-700 font-mono text-[10px]">
                            {mode === 'purchase' ? bp.buyPrice.toFixed(2) : (mode === 'wholesale' ? bp.wholesalePrice.toFixed(2) : bp.sellPrice.toFixed(2))}
                          </span>
                          <span className="block text-[7.5px] text-blue-600 font-bold">+ إضافة</span>
                        </div>
                      </div>
                    );
                  })}
                </>
              );
            })()}
              </div>
            )}
          </div>

          {/* Invoice Items Table */}
          <div className="flex-1 border border-slate-300 rounded bg-white overflow-y-auto max-h-[360px] min-h-[160px]">
            <table className="w-full text-center text-[8.5px] border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300 sticky top-0 z-10">
                  <th className="py-1 px-1 border-l border-slate-300 w-6">م</th>
                  <th className="py-1 px-1 border-l border-slate-300 text-right w-1/3">الصنف</th>
                  <th className="py-1 px-1 border-l border-slate-300 text-right">الوصف</th>
                  <th className="py-1 px-1 border-l border-slate-300 w-12">الكمية</th>
                  <th className="py-1 px-1 border-l border-slate-300 w-14">السعر</th>
                  <th className="py-1 px-1 border-l border-slate-300 w-16">الإجمالي</th>
                  <th className="py-1 px-1 w-14">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {invoiceItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 text-[9px]">
                      لم يتم إدراج أصناف بعد (اضغط على "دليل الأصناف" للإضافة السريعة)
                    </td>
                  </tr>
                ) : (
                  invoiceItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-1 px-1 border-l border-slate-200 font-mono">{idx + 1}</td>
                      <td className="py-1 px-1 border-l border-slate-200 text-right font-bold text-slate-900">
                        {item.productName}
                      </td>
                      <td className="py-1 px-1 border-l border-slate-200 text-right text-slate-500 truncate max-w-[90px]">
                        {item.spec || '—'}
                      </td>
                      <td className="py-1 px-1 border-l border-slate-200 font-mono font-bold text-slate-950">
                        {item.qty}
                      </td>
                      <td className="py-1 px-1 border-l border-slate-200 font-mono text-slate-800">
                        {item.unitPrice.toFixed(2)}
                      </td>
                      <td className="py-1 px-1 border-l border-slate-200 font-mono font-bold text-slate-950">
                        {item.total.toFixed(2)}
                      </td>
                      <td className="py-1 px-1 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openModifyItem(idx)}
                            className="p-0.5 text-blue-600 hover:text-blue-800"
                            title="تعديل"
                          >
                            <PenSquare className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeInvoiceItem(idx)}
                            className="p-0.5 text-rose-600 hover:text-rose-800"
                            title="حذف"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom Fixed Area: Summary bar + Action buttons */}
        <div className="bg-white border-t border-slate-300 p-1.5 flex flex-col gap-1 sticky bottom-0 z-20 rounded-b-lg">
          {/* Summary Grid Bar (7 stats) */}
          <div className="bg-slate-900 text-white rounded p-1 grid grid-cols-3 sm:grid-cols-6 gap-1 text-center text-[8px]">
            <div className="bg-white/10 p-1 rounded">
              إجمالي الكميات: <span className="block font-bold text-emerald-400 font-mono">{totalQtySum.toFixed(2)}</span>
            </div>
            <div className="bg-white/10 p-1 rounded">
              الخصومات: <span className="block font-bold text-emerald-400 font-mono">{globalDiscCalculated.toFixed(2)}</span>
            </div>
            <div className="bg-white/10 p-1 rounded">
              الضرائب: <span className="block font-bold text-emerald-400 font-mono">{globalTaxCalculated.toFixed(2)}</span>
            </div>
            <div className="bg-white/10 p-1 rounded">
              الإيراد الإضافي: <span className="block font-bold text-emerald-400 font-mono">{extraIncome.toFixed(2)}</span>
            </div>
            <div className="bg-white/10 p-1 rounded">
              المدفوع: <span className="block font-bold text-blue-400 font-mono">{paidTotal.toFixed(2)}</span>
            </div>
            <div className="bg-white/10 p-1 rounded">
              المتبقي: <span className="block font-bold text-rose-400 font-mono">{remainTotal.toFixed(2)}</span>
            </div>
            {/* Big Net Total Banner */}
            <div
              className="col-span-3 sm:col-span-6 p-1.5 rounded text-white font-black text-[10px] flex items-center justify-between px-3"
              style={{ backgroundColor: theme.netBg }}
            >
              <span>الصافي النهائي:</span>
              <span className="font-mono text-sm text-yellow-300">
                {formatMoney(netTotal, db.settings.currency)}
              </span>
            </div>
          </div>

          {/* Action Buttons Bar */}
          <div className="flex gap-1">
            <button
              type="button"
              onClick={handleSaveInvoice}
              className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[10px] flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>حفظ وترحيل الحسابات</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (invoiceItems.length === 0) return alert('الفاتورة فارغة');
                onPreviewInvoice({
                  id: 'temp',
                  number: invNum,
                  type: mode === 'purchase' ? 'purchase' : 'sale',
                  date: invDate,
                  partyName: custSearchInput || 'عميل نقدي',
                  warehouseId: 'wh_main',
                  paymentMethod: 'نقدي',
                  subtotal: itemsSubTotal,
                  discount: globalDiscCalculated,
                  tax: globalTaxCalculated,
                  total: netTotal,
                  paid: paidTotal,
                  remaining: remainTotal,
                  status: remainTotal === 0 ? 'مدفوع' : 'آجل',
                  items: invoiceItems
                });
              }}
              className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-[10px] flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>معاينة وطباعة</span>
            </button>
          </div>
        </div>
      </div>

      {/* MODAL 1: Options Modal (الخصم والضريبة والدفع المتعدد) */}
      {showOptionsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-2">
          <div className="bg-white rounded-lg w-full max-w-[390px] border border-slate-300 shadow-2xl overflow-hidden flex flex-col">
            <div className="bg-blue-600 text-white px-3 py-1.5 flex items-center justify-between text-xs font-bold">
              <span>خصومات، ضرائب، إيرادات وطرق الدفع</span>
              <button onClick={() => setShowOptionsModal(false)} className="hover:opacity-75">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 space-y-2.5 text-[9.5px]">
              {/* Pricing System Option */}
              <div className="space-y-1 bg-slate-50 p-2 rounded border border-slate-200">
                <label className="font-bold text-slate-700 block">نظام التسعير للفاتورة</label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSetPriceType('cash')}
                    className={`flex-1 py-1 rounded text-[9px] font-bold transition-all border ${
                      priceType === 'cash'
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    سعر نقدي
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPriceType('wholesale')}
                    className={`flex-1 py-1 rounded text-[9px] font-bold transition-all border ${
                      priceType === 'wholesale'
                        ? 'bg-amber-600 text-white border-amber-700 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    سعر جملة
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPriceType('buy')}
                    className={`flex-1 py-1 rounded text-[9px] font-bold transition-all border ${
                      priceType === 'buy'
                        ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    سعر شراء
                  </button>
                </div>
              </div>

              {/* Global Discount */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700">خصم الفاتورة الكلية</label>
                  <div className="flex border border-blue-600 rounded overflow-hidden h-5">
                    <button
                      type="button"
                      onClick={() => setInvDiscType('val')}
                      className={`px-2 text-[9px] font-bold ${invDiscType === 'val' ? 'bg-blue-600 text-white' : 'bg-white text-blue-600'}`}
                    >
                      ج.م
                    </button>
                    <button
                      type="button"
                      onClick={() => setInvDiscType('percent')}
                      className={`px-2 text-[9px] font-bold ${invDiscType === 'percent' ? 'bg-blue-600 text-white' : 'bg-white text-blue-600'}`}
                    >
                      %
                    </button>
                  </div>
                </div>
                <input
                  type="number"
                  placeholder="أدخل قيمة أو نسبة الخصم..."
                  value={globalInvDisc}
                  onChange={e => setGlobalInvDisc(e.target.value)}
                  className="w-full px-2 py-1 border border-slate-300 rounded text-[10px] h-[26px]"
                />
              </div>

              {/* Global Tax */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700">ضريبة الفاتورة الكلية</label>
                  <div className="flex border border-blue-600 rounded overflow-hidden h-5">
                    <button
                      type="button"
                      onClick={() => setInvTaxType('percent')}
                      className={`px-2 text-[9px] font-bold ${invTaxType === 'percent' ? 'bg-blue-600 text-white' : 'bg-white text-blue-600'}`}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick={() => setInvTaxType('val')}
                      className={`px-2 text-[9px] font-bold ${invTaxType === 'val' ? 'bg-blue-600 text-white' : 'bg-white text-blue-600'}`}
                    >
                      ج.م
                    </button>
                  </div>
                </div>
                <input
                  type="number"
                  placeholder="أدخل قيمة أو نسبة الضريبة..."
                  value={globalInvTax}
                  onChange={e => setGlobalInvTax(e.target.value)}
                  className="w-full px-2 py-1 border border-slate-300 rounded text-[10px] h-[26px]"
                />
              </div>

              {/* Extra Income / Fees */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-0.5">اسم الإيراد / الخدمة</label>
                  <input
                    type="text"
                    value={extraIncomeName}
                    onChange={e => setExtraIncomeName(e.target.value)}
                    className="w-full px-2 py-1 border border-slate-300 rounded text-[9.5px] h-[25px]"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-0.5">مبلغ الإيراد</label>
                  <input
                    type="number"
                    value={extraIncomeVal}
                    placeholder="0.00"
                    onChange={e => setExtraIncomeVal(e.target.value)}
                    className="w-full px-2 py-1 border border-slate-300 rounded text-[9.5px] h-[25px] font-bold"
                  />
                </div>
              </div>

              {/* Multi-Payment Methods Split */}
              <div className="space-y-1 pt-1 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700">طرق الدفع المتعددة</label>
                  <button
                    type="button"
                    onClick={() => addPaymentRow('نقدي', Math.max(0, netTotal - paidTotal))}
                    className="px-2 py-0.5 text-[8.5px] bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold"
                  >
                    + إضافة دفع
                  </button>
                </div>

                <div className="space-y-1.5 max-h-24 overflow-y-auto pt-1">
                  {paymentRows.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 bg-slate-50 p-1 border border-slate-200 rounded">
                      <select
                        value={p.method}
                        onChange={e => updatePaymentRow(idx, 'method', e.target.value as PaymentMethod)}
                        className="px-1 py-0.5 border border-slate-300 rounded text-[9px] h-6 bg-white"
                      >
                        {PAYMENT_METHODS.filter(m => m !== 'آجل').map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={p.amount || ''}
                        placeholder="المبلغ..."
                        onChange={e => updatePaymentRow(idx, 'amount', parseFloat(e.target.value) || 0)}
                        className="flex-1 px-1.5 py-0.5 border border-slate-300 rounded text-[9.5px] font-mono font-bold h-6"
                      />
                      <button
                        type="button"
                        onClick={() => removePaymentRow(idx)}
                        className="text-rose-600 hover:text-rose-800 p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowOptionsModal(false)}
                className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[10px] mt-2"
              >
                ✓ تم وحفظ الخيارات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Lookup Modal (دليل الأصناف - إضافة سريعة) */}
      {showLookupModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-2">
          <div className="bg-slate-200 rounded-lg w-[96vw] max-w-4xl h-[92vh] border-2 border-slate-500 shadow-2xl flex flex-col overflow-hidden">
            <div className="bg-blue-600 text-white px-3 py-1.5 flex items-center justify-between text-xs font-bold">
              <div className="flex items-center gap-2">
                <Boxes className="w-4 h-4" />
                <span>دليل الأصناف (اضغط على أي صنف لتحديد الكمية والسعر)</span>
                <span className="bg-white/20 text-white px-2 py-0.5 rounded text-[9px] font-normal">
                  مدرج بالفاتورة: {invoiceItems.length} صنف ({formatMoney(itemsSubTotal, db.settings.currency)})
                </span>
              </div>
              <button onClick={() => setShowLookupModal(false)} className="hover:opacity-75">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-1 p-1 gap-1 overflow-hidden">
              {/* Categories Sidebar */}
              <div className="w-24 bg-slate-50 border border-slate-400 rounded flex flex-col flex-shrink-0 overflow-hidden">
                <div className="bg-slate-200 p-1 text-[8px] font-bold text-center border-b border-slate-300 flex flex-col gap-1">
                  <span>المجموعات</span>
                  <button
                    type="button"
                    onClick={() => {
                      setNewItemName('');
                      setNewItemCode(`1${String(db.products.length + 1).padStart(3, '0')}`);
                      setNewBuyPrice('');
                      setShowEditItemModal(true);
                    }}
                    className="bg-emerald-600 text-white text-[7.5px] py-0.5 px-1 rounded font-bold"
                  >
                    + صنف جديد
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                  <div
                    onClick={() => setSelectedCategory('all')}
                    className={`py-1.5 px-1 text-[8px] font-bold text-center border-b border-slate-200 cursor-pointer ${
                      selectedCategory === 'all' ? 'bg-sky-600 text-white' : 'text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    الكل
                  </div>
                  {categoriesList.map(cat => (
                    <div
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`py-1.5 px-1 text-[8px] font-bold text-center border-b border-slate-200 cursor-pointer truncate ${
                        selectedCategory === cat ? 'bg-sky-600 text-white' : 'text-slate-800 hover:bg-slate-100'
                      }`}
                    >
                      {cat}
                    </div>
                  ))}
                </div>
              </div>

              {/* Items Panel */}
              <div className="flex-1 bg-slate-50 border border-slate-400 rounded p-1 flex flex-col gap-1 overflow-hidden">
                <div className="bg-white p-1 border border-slate-300 rounded flex items-center gap-1">
                  <Search className="w-3 h-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="بحث ديناميكي بالاسم، الكود، أو الباركود..."
                    value={lookupSearch}
                    onChange={e => {
                      setLookupSearch(e.target.value);
                      setLookupPageLimit(40);
                    }}
                    className="flex-1 text-[9.5px] border-0 focus:outline-hidden"
                  />
                  {lookupSearch && (
                    <button
                      type="button"
                      onClick={() => setLookupSearch('')}
                      className="p-0.5 text-slate-400 hover:text-slate-700"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto flex flex-col gap-1 p-0.5">
                  {(() => {
                    const filtered = db.products
                      .filter(p => selectedCategory === 'all' || p.category === selectedCategory)
                      .filter(p => !lookupSearch || p.name.toLowerCase().includes(lookupSearch.toLowerCase()) || p.code.toLowerCase().includes(lookupSearch.toLowerCase()) || (p.barcode && p.barcode.toLowerCase().includes(lookupSearch.toLowerCase())));

                    const visible = filtered.slice(0, lookupPageLimit);

                    if (visible.length === 0) {
                      return (
                        <div className="p-6 text-center text-slate-500 text-[10px] space-y-2.5">
                          <div className="font-bold">لا توجد أصناف مطابقة لـ "{lookupSearch}" في الدليل</div>
                          <button
                            type="button"
                            onClick={() => {
                              setFastItemName(lookupSearch.trim());
                              setFastItemQty('');
                              setFastItemPrice('');
                              setShowFastCreateModal(true);
                            }}
                            className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>+ إثبات وإضافة "{lookupSearch}" كصنف جديد فوراً بالعدد والسعر</span>
                          </button>
                        </div>
                      );
                    }

                    return (
                      <>
                        <div className="text-[8px] text-slate-500 font-bold px-1 flex justify-between items-center">
                          <span>إجمالي النتائج: {filtered.length} صنف</span>
                          {filtered.length > lookupPageLimit && (
                            <span>معروض {visible.length} من {filtered.length}</span>
                          )}
                        </div>

                        {visible.map(rawItem => {
                          const item = getProductForBranch(rawItem, invoiceBranchId);
                          const isLow = item.currentQty <= item.minStock;
                          const inInvoiceItems = invoiceItems.filter(it => it.productId === rawItem.id);
                          const inInvoiceQty = inInvoiceItems.reduce((acc, it) => acc + it.qty, 0);

                          return (
                            <div
                              key={item.id}
                              onClick={() => openItemCard(rawItem)}
                              className={`bg-white border rounded p-1.5 flex flex-col gap-1 cursor-pointer shadow-2xs hover:border-blue-500 hover:bg-blue-50/40 hover:shadow-xs transition-all ${
                                isLow ? 'border-rose-300 bg-rose-50/30' : 'border-slate-300'
                              }`}
                            >
                              <div className="flex justify-between items-center text-[9.5px] font-bold text-slate-900 border-b border-slate-100 pb-0.5">
                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                  <span className="truncate">
                                    {item.name} <small className="font-normal text-slate-500 text-[8px]">({item.category || 'عامة'})</small>
                                  </span>
                                  {inInvoiceQty > 0 && (
                                    <span className="bg-emerald-100 text-emerald-800 text-[7.5px] px-1.5 py-0.2 rounded font-mono font-bold shrink-0">
                                      مدرج بالفاتورة: {inInvoiceQty}
                                    </span>
                                  )}
                                </div>
                                <span className="text-sky-600 font-mono text-[8.5px] shrink-0 mr-1">{item.code}</span>
                              </div>

                              <div className="grid grid-cols-4 gap-1 text-[8px] text-center pt-0.5">
                                <div className="bg-slate-50 p-0.5 rounded border border-slate-200">
                                  <span className="block text-[6.5px] text-slate-500">متاح بالفرع</span>
                                  <strong className={`font-mono text-[9px] ${item.currentQty <= 0 ? 'text-rose-600' : 'text-blue-600'}`}>
                                    {item.currentQty} {item.unit || ''}
                                  </strong>
                                </div>
                                <div className={`p-0.5 rounded border ${mode === 'sale' && priceType === 'cash' ? 'bg-emerald-50 border-emerald-400 font-bold' : 'bg-slate-50 border-slate-200'}`}>
                                  <span className="block text-[6.5px] text-slate-500">نقدي</span>
                                  <strong className="font-mono text-emerald-600">{item.sellPrice.toFixed(2)}</strong>
                                </div>
                                <div className={`p-0.5 rounded border ${mode === 'wholesale' || priceType === 'wholesale' ? 'bg-amber-50 border-amber-400 font-bold' : 'bg-slate-50 border-slate-200'}`}>
                                  <span className="block text-[6.5px] text-slate-500">جملة</span>
                                  <strong className="font-mono text-amber-600">{item.wholesalePrice.toFixed(2)}</strong>
                                </div>
                                <div className={`p-0.5 rounded border ${mode === 'purchase' || mode === 'purchase_return' || priceType === 'buy' ? 'bg-blue-50 border-blue-400 font-bold' : 'bg-slate-50 border-slate-200'}`}>
                                  <span className="block text-[6.5px] text-slate-500">شراء</span>
                                  <strong className="font-mono text-blue-600">{item.buyPrice.toFixed(2)}</strong>
                                </div>
                              </div>

                              <div className="flex items-center justify-between text-[7.5px] text-slate-400 pt-0.5">
                                <span className="text-blue-600 font-bold flex items-center gap-1">
                                  <span>اضغط لتحديد الكمية وتأكيد/تعديل السعر</span>
                                </span>
                                <span>الوحدة: {item.unit || 'قطعة'}</span>
                              </div>
                            </div>
                          );
                        })}

                        {filtered.length > lookupPageLimit && (
                          <button
                            type="button"
                            onClick={() => setLookupPageLimit(prev => prev + 50)}
                            className="w-full py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[9px] rounded border border-blue-200 my-1 transition-colors"
                          >
                            + عرض 50 صنفاً إضافياً (متبقي {filtered.length - visible.length} صنف)
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Add New Item Modal (إضافة صنف جديد للمخزون) */}
      {showEditItemModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-2">
          <div className="bg-white rounded-lg w-full max-w-[390px] border border-slate-300 shadow-2xl overflow-hidden flex flex-col">
            <div className="bg-blue-600 text-white px-3 py-1.5 flex items-center justify-between text-xs font-bold">
              <span>إضافة صنف جديد للمخزون</span>
              <button onClick={() => setShowEditItemModal(false)} className="hover:opacity-75">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 space-y-2 text-[9.5px]">
              <div className="bg-blue-50 text-blue-800 p-1 rounded font-bold text-[8.5px]">
                إضافة مباشرة للمخزون
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-0.5">اسم الصنف الجديد *</label>
                <input
                  type="text"
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  className="w-full px-2 py-1 border border-slate-300 rounded text-[9.5px] h-6 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-0.5">كود الصنف (تلقائي)</label>
                  <input
                    type="text"
                    value={newItemCode}
                    readOnly
                    className="w-full px-2 py-1 border border-slate-300 rounded text-[9.5px] h-6 bg-slate-100 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-0.5">المجموعة</label>
                  <select
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    className="w-full px-1.5 py-0.5 border border-slate-300 rounded text-[9.5px] h-6 bg-white"
                  >
                    {categoriesList.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="عامة">عامة</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-0.5">سعر الشراء الأساسي</label>
                <input
                  type="number"
                  value={newBuyPrice}
                  placeholder="0.00"
                  onChange={e => handleNewBuyPriceChange(e.target.value)}
                  className="w-full px-2 py-1 border border-slate-300 rounded text-[9.5px] h-6 font-mono font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-0.5">ربح القطاعي (% أو ج.م)</label>
                  <div className="flex gap-1">
                    <input
                      type="number"
                      placeholder="%"
                      value={newCashMargin}
                      onChange={e => {
                        setNewCashMargin(e.target.value);
                        const b = parseFloat(newBuyPrice) || 0;
                        const m = parseFloat(e.target.value) || 0;
                        if (b > 0) setNewCashPriceManual((b * (1 + m / 100)).toFixed(2));
                      }}
                      className="w-12 px-1 border border-slate-300 rounded text-[9px] h-6 font-mono"
                    />
                    <input
                      type="number"
                      placeholder="ج.م"
                      value={newCashPriceManual}
                      onChange={e => setNewCashPriceManual(e.target.value)}
                      className="flex-1 px-1 border border-slate-300 rounded text-[9px] h-6 font-mono font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-0.5">ربح الجملة (% أو ج.م)</label>
                  <div className="flex gap-1">
                    <input
                      type="number"
                      placeholder="%"
                      value={newWholesaleMargin}
                      onChange={e => {
                        setNewWholesaleMargin(e.target.value);
                        const b = parseFloat(newBuyPrice) || 0;
                        const m = parseFloat(e.target.value) || 0;
                        if (b > 0) setNewWholesalePriceManual((b * (1 + m / 100)).toFixed(2));
                      }}
                      className="w-12 px-1 border border-slate-300 rounded text-[9px] h-6 font-mono"
                    />
                    <input
                      type="number"
                      placeholder="ج.م"
                      value={newWholesalePriceManual}
                      onChange={e => setNewWholesalePriceManual(e.target.value)}
                      className="flex-1 px-1 border border-slate-300 rounded text-[9px] h-6 font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-0.5">الكمية بالمخزون</label>
                <input
                  type="number"
                  value={newStockQty}
                  onChange={e => setNewStockQty(e.target.value)}
                  className="w-full px-2 py-1 border border-slate-300 rounded text-[9.5px] h-6 font-mono font-bold"
                />
              </div>

              <button
                type="button"
                onClick={saveNewItemToDB}
                className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[10px] mt-2"
              >
                ✓ حفظ والرجوع للفاتورة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Modify Item Inside Invoice (تعديل صنف في الفاتورة) */}
      {showModifyModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-2">
          <div className="bg-white rounded-lg w-full max-w-[340px] border border-slate-300 shadow-2xl overflow-hidden flex flex-col">
            <div className="bg-blue-600 text-white px-3 py-1.5 flex items-center justify-between text-xs font-bold">
              <span>تعديل صنف في الفاتورة</span>
              <button onClick={() => setShowModifyModal(false)} className="hover:opacity-75">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 space-y-2 text-[9.5px]">
              <div>
                <label className="font-bold text-slate-700 block mb-0.5">اسم الصنف</label>
                <input
                  type="text"
                  value={modifyName}
                  readOnly
                  className="w-full px-2 py-1 border border-slate-300 rounded text-[9.5px] h-6 bg-slate-100 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-0.5">الكمية</label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={modifyQty}
                    onChange={e => setModifyQty(parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 border border-slate-300 rounded text-[9.5px] h-6 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-0.5">سعر الوحدة</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={modifyPrice}
                    onChange={e => setModifyPrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 border border-slate-300 rounded text-[9.5px] h-6 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-0.5">الوصف / البيان (اختياري)</label>
                <input
                  type="text"
                  value={modifySpec}
                  placeholder="ملاحظات الصنف..."
                  onChange={e => setModifySpec(e.target.value)}
                  className="w-full px-2 py-1 border border-slate-300 rounded text-[9.5px] h-6"
                />
              </div>

              <button
                type="button"
                onClick={saveModifiedItem}
                className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[10px] mt-1"
              >
                ✓ حفظ التعديل والرجوع للفاتورة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-slate-900/95 backdrop-blur-md text-white px-4 py-2.5 rounded-xl shadow-2xl border border-emerald-500/80 flex items-center gap-2.5 text-xs font-bold animate-in fade-in slide-in-from-top-2 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white p-0.5 mr-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* MODAL 5: Detailed Product Card Modal for Adding to Invoice */}
      {showItemCardModal && selectedCardProduct && (() => {
        const branchProd = getProductForBranch(selectedCardProduct, invoiceBranchId);
        const qtyNum = parseFloat(itemCardQty) || 0;
        const priceNum = parseFloat(itemCardPrice) || 0;
        const lineTotal = Math.max(0, qtyNum * priceNum);
        const isPriceModified = Math.abs(priceNum - itemCardDefaultPrice) >= 0.01;
        const isNegativeStock = (mode === 'sale' || mode === 'wholesale') && branchProd.currentQty < qtyNum;

        // Existing quantity in invoice
        const existingRow = invoiceItems.find(
          it => it.productId === selectedCardProduct.id && (it.spec || '') === itemCardSpec.trim()
        );

        return (
          <div
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-3 animate-in fade-in duration-150"
            onKeyDown={e => {
              if (e.key === 'Escape') {
                setShowItemCardModal(false);
                setSelectedCardProduct(null);
              }
            }}
          >
            <div className="bg-white rounded-xl w-full max-w-lg border-2 border-blue-600 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                    <Boxes className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold leading-tight">كارت إدراج الصنف في الفاتورة</h3>
                    <p className="text-[10px] text-blue-100 flex items-center gap-1.5 mt-0.5">
                      <span className="font-semibold">
                        {mode === 'purchase' ? 'فاتورة مشتريات' :
                         mode === 'purchase_return' ? 'مرتجع مشتريات' :
                         mode === 'sale_return' ? 'مرتجع مبيعات' :
                         mode === 'wholesale' ? 'فاتورة بيع جملة' :
                         mode === 'quote' ? 'عرض أسعار' : 'فاتورة مبيعات'}
                      </span>
                      <span>•</span>
                      <span>الفرع: {invoiceBranch.name}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowItemCardModal(false);
                    setSelectedCardProduct(null);
                  }}
                  className="p-1 text-white/80 hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer"
                  title="إلغاء وإغلاق"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-4 space-y-3.5 overflow-y-auto flex-1">
                {/* Product Info Bar */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-base font-bold text-slate-900 leading-snug">
                        {selectedCardProduct.name}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] text-slate-600">
                        <span className="bg-white px-2 py-0.5 rounded border border-slate-200 font-mono font-bold text-blue-700">
                          كود: {selectedCardProduct.code}
                        </span>
                        {selectedCardProduct.barcode && (
                          <span className="bg-white px-2 py-0.5 rounded border border-slate-200 font-mono text-slate-700">
                            باركود: {selectedCardProduct.barcode}
                          </span>
                        )}
                        <span className="bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700">
                          المجموعة: {selectedCardProduct.category || 'عامة'}
                        </span>
                        <span className="bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700">
                          الوحدة: {selectedCardProduct.unit || 'قطعة'}
                        </span>
                      </div>
                    </div>

                    {/* Stock badge */}
                    <div className="text-left shrink-0">
                      <div className={`px-2.5 py-1 rounded-md text-[10px] font-bold border ${
                        branchProd.currentQty <= 0 
                          ? 'bg-rose-50 text-rose-700 border-rose-300' 
                          : 'bg-emerald-50 text-emerald-700 border-emerald-300'
                      }`}>
                        <span className="block text-[8px] text-slate-500 font-normal">الرصيد المتاح بالفرع</span>
                        <span className="font-mono text-xs">{branchProd.currentQty}</span> {selectedCardProduct.unit || 'قطعة'}
                      </div>
                      {existingRow && (
                        <div className="mt-1 text-[8.5px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 text-center">
                          مدرج حالياً: {existingRow.qty}
                        </div>
                      )}
                    </div>
                  </div>

                  {isNegativeStock && (
                    <div className="mt-2 text-[10px] bg-rose-100 text-rose-800 p-2 rounded-md border border-rose-300 flex items-center gap-1.5 font-bold">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                      <span>تنبيه: الرصيد المتاح غير كافٍ للكمية المطلوبة (سيتم البيع بالسالب إذا أكدت الإضافة).</span>
                    </div>
                  )}
                </div>

                {/* Preset System Prices quick clickable pills */}
                <div>
                  <div className="text-[10px] font-bold text-slate-600 mb-1 flex items-center justify-between">
                    <span>الأسعار المسجلة في النظام (اضغط لاختيار سعر فوري):</span>
                    <span className="text-[9px] text-slate-400">السعر المحدد: {itemCardPrice || 0} {db.settings.currency}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setItemCardPrice(branchProd.sellPrice.toString())}
                      className={`p-2 rounded-lg border text-right transition-all flex flex-col gap-0.5 cursor-pointer ${
                        Math.abs(priceNum - branchProd.sellPrice) < 0.001
                          ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-[9px] text-slate-500 font-semibold">سعر البيع (نقدي)</span>
                      <span className="font-mono font-bold text-xs text-emerald-700">
                        {branchProd.sellPrice.toFixed(2)} <small className="text-[8px] font-normal">{db.settings.currency}</small>
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setItemCardPrice(branchProd.wholesalePrice.toString())}
                      className={`p-2 rounded-lg border text-right transition-all flex flex-col gap-0.5 cursor-pointer ${
                        Math.abs(priceNum - branchProd.wholesalePrice) < 0.001
                          ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-500/20 shadow-xs'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-[9px] text-slate-500 font-semibold">سعر الجملة</span>
                      <span className="font-mono font-bold text-xs text-amber-700">
                        {branchProd.wholesalePrice.toFixed(2)} <small className="text-[8px] font-normal">{db.settings.currency}</small>
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setItemCardPrice(branchProd.buyPrice.toString())}
                      className={`p-2 rounded-lg border text-right transition-all flex flex-col gap-0.5 cursor-pointer ${
                        Math.abs(priceNum - branchProd.buyPrice) < 0.001
                          ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-[9px] text-slate-500 font-semibold">سعر الشراء (التكلفة)</span>
                      <span className="font-mono font-bold text-xs text-blue-700">
                        {branchProd.buyPrice.toFixed(2)} <small className="text-[8px] font-normal">{db.settings.currency}</small>
                      </span>
                    </button>
                  </div>
                </div>

                {/* Primary Inputs: Quantity & Price */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Field 1: Quantity */}
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-300 flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                      <span>الكمية أو العدد للصنف *</span>
                      <span className="text-[10px] text-slate-500 font-normal">({selectedCardProduct.unit || 'قطعة'})</span>
                    </label>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const current = parseFloat(itemCardQty) || 0;
                          setItemCardQty(String(Math.max(1, current - 1)));
                        }}
                        className="w-8 h-8 rounded bg-slate-200 hover:bg-slate-300 font-bold text-slate-700 flex items-center justify-center shrink-0 text-sm cursor-pointer"
                        title="نقصان 1"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>

                      <input
                        ref={itemQtyInputRef}
                        type="number"
                        min="0.01"
                        step="any"
                        value={itemCardQty}
                        onChange={e => setItemCardQty(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            confirmAddItemFromCard(false);
                          }
                        }}
                        className="w-full text-center font-mono font-bold text-base h-8 rounded border border-slate-300 bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        placeholder="أدخل الكمية..."
                      />

                      <button
                        type="button"
                        onClick={() => {
                          const current = parseFloat(itemCardQty) || 0;
                          setItemCardQty(String(current + 1));
                        }}
                        className="w-8 h-8 rounded bg-slate-200 hover:bg-slate-300 font-bold text-slate-700 flex items-center justify-center shrink-0 text-sm cursor-pointer"
                        title="زيادة 1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Quick quantity chips */}
                    <div className="flex items-center justify-between gap-1 pt-0.5">
                      {[1, 2, 5, 10, 20, 50].map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setItemCardQty(String(n))}
                          className={`flex-1 py-0.5 rounded text-[9px] font-bold border transition-colors cursor-pointer ${
                            parseFloat(itemCardQty) === n
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Field 2: Price */}
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-300 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-800">
                        سعر الصنف (الوحدة) *
                      </label>
                      {itemCardPrice.trim() !== '' && isPriceModified ? (
                        <span className="text-[8.5px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <Edit3 className="w-2.5 h-2.5" />
                          <span>سعر يدوي معدل</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setItemCardPrice(String(itemCardDefaultPrice))}
                          className="text-[8.5px] font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-1.5 py-0.5 rounded flex items-center gap-1 cursor-pointer"
                          title="اضغط لتأكيد السعر المسجل"
                        >
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>السعر مضبوط ({itemCardDefaultPrice.toFixed(2)})</span>
                        </button>
                      )}
                    </div>

                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={itemCardPrice}
                        onChange={e => setItemCardPrice(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            confirmAddItemFromCard(false);
                          }
                        }}
                        className={`w-full text-center font-mono font-bold text-base h-8 rounded border bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 ${
                          itemCardPrice.trim() !== '' && isPriceModified ? 'border-amber-400 text-amber-800' : 'border-slate-300 text-emerald-700'
                        }`}
                        placeholder="أدخل السعر يدوياً..."
                      />
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold pointer-events-none">
                        {db.settings.currency}
                      </span>
                    </div>

                    <div className="text-[8.5px] text-slate-500 text-center flex items-center justify-center gap-1">
                      {itemCardPrice.trim() !== '' ? (
                        isPriceModified ? (
                          <span>السعر الأصلي: <strong>{itemCardDefaultPrice.toFixed(2)}</strong> (اضغط لاستعادته: <button type="button" onClick={() => setItemCardPrice(String(itemCardDefaultPrice))} className="text-blue-600 underline font-bold cursor-pointer">استعادة</button>)</span>
                        ) : (
                          <span className="text-emerald-700 font-semibold">✓ السعر المدخل يطابق السعر المسجل</span>
                        )
                      ) : (
                        <span className="text-slate-600">
                          الخانة خالية. يمكنك إدخال السعر يدوياً أو سيتم اعتماد السعر المضبوط تلقائياً: <strong>{itemCardDefaultPrice.toFixed(2)} {db.settings.currency}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Optional Spec / Note */}
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">
                    ملاحظات أو مواصفات خاصة للصنف (اختياري)
                  </label>
                  <input
                    type="text"
                    value={itemCardSpec}
                    onChange={e => setItemCardSpec(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        confirmAddItemFromCard(false);
                      }
                    }}
                    placeholder="مثال: مقاس خاص، لون، رقم شحنة، تاريخ انتهاء..."
                    className="w-full px-2.5 py-1 text-xs border border-slate-300 rounded bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Real-time Total Display Box */}
                <div className="bg-gradient-to-r from-slate-900 to-blue-950 text-white rounded-lg p-3 flex items-center justify-between shadow-inner">
                  <div>
                    <span className="text-[10px] text-slate-300 block">إجمالي هذا الصنف (الكمية × السعر):</span>
                    <div className="flex items-center gap-1 text-[11px] text-blue-200 mt-0.5 font-mono">
                      <span>{qtyNum}</span>
                      <span>×</span>
                      <span>{priceNum.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="text-left font-mono">
                    <span className="text-xl font-extrabold text-emerald-400 block leading-tight">
                      {lineTotal.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-300">{db.settings.currency}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons Footer */}
              <div className="bg-slate-100 border-t border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowItemCardModal(false);
                    setSelectedCardProduct(null);
                  }}
                  className="px-3 py-1.5 bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  إلغاء (Esc)
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => confirmAddItemFromCard(false)}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>✓ إضافة ومتابعة تصفح الدليل (Enter)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => confirmAddItemFromCard(true)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span>✓ إضافة وإنهاء</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL 6: Fast On-the-fly Item Creation (إضافة صنف غير موجود فوراً بالمخزون والفاتورة) */}
      {showFastCreateModal && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-3 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl w-full max-w-md border-2 border-emerald-600 shadow-2xl overflow-hidden flex flex-col">
            <div className="bg-gradient-to-r from-emerald-700 to-teal-800 text-white px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Boxes className="w-5 h-5 text-white" />
                <div>
                  <h3 className="text-sm font-bold">إثبات وإضافة صنف غير موجود فوراً</h3>
                  <p className="text-[10px] text-emerald-100">
                    تسجيل الصنف في المخزون وإدراجه مباشرة بالفاتورة الحالية
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFastCreateModal(false)}
                className="text-white/80 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              {/* Notice regarding stock */}
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-2.5 text-[10px] text-amber-900 leading-relaxed font-medium">
                {mode === 'sale' || mode === 'wholesale' ? (
                  <span>
                    💡 <strong>تنبيه المخزون:</strong> يتم إثبات هذا الصنف الجديد بدليل الأصناف وتسجيل حركته ورصيده بالسالب (<strong>-{(parseFloat(fastItemQty) || 0)}</strong>) في المخزن تلقائياً، لحين توريده وشراء بضاعته لاحقاً فتتم التسوية.
                  </span>
                ) : (
                  <span>
                    💡 <strong>تنبيه المخزون:</strong> سيتم إثبات هذا الصنف الجديد بدليل الأصناف وإضافة رصيده (+{(parseFloat(fastItemQty) || 0)}) وتكلفة شرائه تلقائياً للمخزن.
                  </span>
                )}
              </div>

              {/* Item Name */}
              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-1">
                  اسم الصنف أو البند الجديد *
                </label>
                <input
                  type="text"
                  value={fastItemName}
                  onChange={e => setFastItemName(e.target.value)}
                  placeholder="اكتب اسم الصنف أو البند بدقة..."
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  autoFocus
                />
              </div>

              {/* Qty & Price Row (Empty inputs with no pre-filled zeroes or forced numbers!) */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-800 mb-1">
                    العدد أو الكمية *
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={fastItemQty}
                    onChange={e => setFastItemQty(e.target.value)}
                    placeholder="أدخل الكمية أو العدد..."
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-bold font-mono text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-center"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-800 mb-1">
                    سعر الصنف (الوحدة) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={fastItemPrice}
                      onChange={e => setFastItemPrice(e.target.value)}
                      placeholder="أدخل السعر يدوياً..."
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-bold font-mono text-emerald-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-center"
                    />
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 font-bold pointer-events-none">
                      {db.settings.currency}
                    </span>
                  </div>
                </div>
              </div>

              {/* Unit & Category */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 mb-1">الوحدة</label>
                  <select
                    value={fastItemUnit}
                    onChange={e => setFastItemUnit(e.target.value)}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800"
                  >
                    <option value="قطعة">قطعة</option>
                    <option value="كيلو">كيلو</option>
                    <option value="متر">متر</option>
                    <option value="كرتونة">كرتونة</option>
                    <option value="علبة">علبة</option>
                    <option value="لتر">لتر</option>
                    <option value="طقم">طقم</option>
                    <option value="طن">طن</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 mb-1">المجموعة / القسم</label>
                  <select
                    value={fastItemCategory}
                    onChange={e => setFastItemCategory(e.target.value)}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800"
                  >
                    {categoriesList.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="عامة">عامة</option>
                  </select>
                </div>
              </div>

              {/* Realtime Line Total Preview */}
              {fastItemQty && fastItemPrice && (
                <div className="bg-slate-900 text-white p-2 rounded-lg flex items-center justify-between text-xs font-bold">
                  <span>إجمالي البند بالفاتورة:</span>
                  <span className="font-mono text-emerald-400 text-sm">
                    {((parseFloat(fastItemQty) || 0) * (parseFloat(fastItemPrice) || 0)).toFixed(2)} {db.settings.currency}
                  </span>
                </div>
              )}
            </div>

            <div className="bg-slate-100 border-t border-slate-200 px-4 py-2.5 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowFastCreateModal(false)}
                className="px-3 py-1.5 bg-white text-slate-700 border border-slate-300 rounded-lg text-xs font-bold hover:bg-slate-200"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={confirmFastCreateItem}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>✓ إثبات الصنف بالمخزون وإدراجه بالفاتورة</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Audit Log Modal */}
      {showAuditModal && editingInvoice && (
        <InvoiceAuditLogModal
          invoice={editingInvoice}
          isOpen={showAuditModal}
          onClose={() => setShowAuditModal(false)}
          currency={db.settings.currency}
        />
      )}
    </div>
  );
};
