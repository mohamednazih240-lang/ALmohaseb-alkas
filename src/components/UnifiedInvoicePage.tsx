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
  Minimize2
} from 'lucide-react';
import {
  AccountingDB,
  Invoice,
  InvoiceItem,
  InvoicePaymentLine,
  PaymentMethod,
  Product,
  Party
} from '../types/accounting';
import {
  formatMoney,
  PAYMENT_METHODS,
  generateId,
  getTodayDate,
  calculateCustomerBalance,
  calculateSupplierBalance,
  createInvoiceJournal,
  logAudit
} from '../services/accountingStorage';

export type InvoiceMode = 'sale' | 'wholesale' | 'purchase' | 'sale_return' | 'purchase_return' | 'quote';

interface UnifiedInvoicePageProps {
  mode: InvoiceMode;
  db: AccountingDB;
  onUpdateDb: (updated: AccountingDB) => void;
  onPreviewInvoice: (invoice: Invoice) => void;
  editingInvoice?: Invoice | null;
  onCloseEdit?: () => void;
  onClose?: () => void;
}

export const UnifiedInvoicePage: React.FC<UnifiedInvoicePageProps> = ({
  mode,
  db,
  onUpdateDb,
  onPreviewInvoice,
  editingInvoice,
  onCloseEdit,
  onClose
}) => {
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

  // Live Time clock
  const [liveTime, setLiveTime] = useState<string>('00:00');

  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setLiveTime(d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

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
      // New invoice sequence
      const prefix = mode === 'sale' ? 'INV-' :
                     mode === 'wholesale' ? 'WHL-' :
                     mode === 'purchase' ? 'PUR-' :
                     mode === 'sale_return' ? 'RET-S-' :
                     mode === 'purchase_return' ? 'RET-P-' : 'QUO-';
      const seq = mode === 'sale' ? db.settings.nextSale :
                  mode === 'wholesale' ? db.settings.nextSale :
                  mode === 'purchase' ? db.settings.nextPurchase :
                  mode === 'quote' ? db.settings.nextQuote : Date.now().toString().slice(-4);
      setInvNum(`${prefix}${String(seq).padStart(6, '0')}`);
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

      // Default party
      const partyList = theme.partyRole === 'customer' ? db.customers : db.suppliers;
      if (partyList.length > 0) {
        const first = partyList[0];
        setSelectedParty(first);
        setCustCode(first.code || '1');
        setCustSearchInput(first.name);
        setCustPhone(first.phone || '');
      } else {
        setSelectedParty(null);
        setCustCode('1');
        setCustSearchInput('عميل نقدي');
        setCustPhone('');
      }
    }
  }, [editingInvoice, mode]);

  // Parties list based on role
  const partiesList = theme.partyRole === 'customer' ? db.customers : db.suppliers;

  // Categories list
  const categoriesList = Array.from(new Set(db.products.map(p => p.category || 'عامة'))).filter(Boolean);

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
        let newPrice = prod.sellPrice;
        if (newType === 'wholesale') newPrice = prod.wholesalePrice;
        else if (newType === 'buy') newPrice = prod.buyPrice;
        else newPrice = prod.sellPrice;

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
  if (paymentRows.length === 0) {
    paidTotal = netTotal;
  } else {
    paidTotal = paymentRows.reduce((s, r) => s + Math.max(0, Number(r.amount) || 0), 0);
  }
  const remainTotal = Math.max(0, netTotal - paidTotal);

  // Quick add from lookup card
  const quickAddItem = (prod: Product) => {
    let activePrice = prod.sellPrice;
    if (priceType === 'wholesale') activePrice = prod.wholesalePrice;
    else if (priceType === 'buy') activePrice = prod.buyPrice;

    if (mode === 'sale' && prod.currentQty <= 0) {
      const confirmNeg = confirm(`⚠️ تنبيه: رصيد الصنف "${prod.name}" منتهٍ أو صفر. هل ترغب في إتمام البيع بالسالب؟`);
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
          costPrice: prod.avgCost || prod.buyPrice,
          discount: 0,
          taxRate: 0,
          total: activePrice * 1
        };
        return [...prev, newItem];
      }
    });

    setShowLookupModal(false);
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
      buyPrice: buy,
      sellPrice: cash,
      wholesalePrice: wholesale,
      minStock: 5,
      currentQty: stock,
      avgCost: buy > 0 ? buy : cash * 0.8
    };

    updated.products.push(newProd);
    logAudit(updated, 'إضافة صنف من شاشة الفاتورة', newProd.name);
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

    // Check Party
    const partyName = custSearchInput.trim() || (theme.partyRole === 'customer' ? 'عميل نقدي' : 'مورد عام');
    const partyId = selectedParty?.id;

    // Determine final status & payment method
    let finalPaid = paidTotal;
    let finalRemaining = remainTotal;
    let mainPaymentMethod: PaymentMethod = 'نقدي';

    if (paymentRows.length === 1) {
      mainPaymentMethod = paymentRows[0].method;
    } else if (paymentRows.length > 1) {
      mainPaymentMethod = paymentRows[0].method;
    } else {
      mainPaymentMethod = finalRemaining > 0 && finalPaid === 0 ? 'آجل' : 'نقدي';
    }

    let status: 'مدفوع' | 'جزئي' | 'آجل' = 'مدفوع';
    if (finalPaid <= 0) status = 'آجل';
    else if (finalRemaining > 0) status = 'جزئي';

    // Reverse previous effects if editing
    if (editingInvoice) {
      // Revert stock
      editingInvoice.items.forEach(oldItem => {
        const prod = updated.products.find(p => p.id === oldItem.productId);
        if (prod) {
          if (editingInvoice.type === 'sale') prod.currentQty += oldItem.qty;
          else prod.currentQty = Math.max(0, prod.currentQty - oldItem.qty);
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

    const savedInvoice: Invoice = {
      id: invId,
      number: invNum,
      type: isSale ? 'sale' : (mode === 'purchase' ? 'purchase' : (mode === 'sale_return' ? 'sale' : 'purchase')),
      invoiceKind: mode,
      date: invDate,
      time: invTime,
      jobSite,
      priceType,
      partyId,
      partyCode: custCode,
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
      items: JSON.parse(JSON.stringify(invoiceItems))
    };

    // 1. Stock movements & inventory balance update
    const whId = updated.warehouses[0]?.id || 'wh_main';
    const wh = updated.warehouses.find(w => w.id === whId);

    savedInvoice.items.forEach(item => {
      const prod = updated.products.find(p => p.id === item.productId || p.code === item.productCode);
      if (prod) {
        let qtyChange = 0;
        if (mode === 'sale' || mode === 'wholesale') {
          qtyChange = -item.qty;
          prod.currentQty -= item.qty;
        } else if (mode === 'purchase') {
          qtyChange = item.qty;
          // Weighted average costing
          const oldQty = Math.max(0, prod.currentQty);
          const oldCost = prod.avgCost || prod.buyPrice;
          const newQty = item.qty;
          const newCost = item.unitPrice;
          const totalQty = oldQty + newQty;
          prod.avgCost = totalQty > 0 ? ((oldQty * oldCost) + (newQty * newCost)) / totalQty : newCost;
          prod.buyPrice = newCost;
          prod.currentQty += item.qty;
        } else if (mode === 'sale_return') {
          qtyChange = item.qty;
          prod.currentQty += item.qty;
        } else if (mode === 'purchase_return') {
          qtyChange = -item.qty;
          prod.currentQty = Math.max(0, prod.currentQty - item.qty);
        }

        updated.stockMovements.unshift({
          id: generateId('sm'),
          date: savedInvoice.date,
          productId: prod.id,
          productName: prod.name,
          warehouseId: whId,
          warehouseName: wh ? wh.name : 'المخزن الرئيسي',
          qtyChange,
          balanceAfter: prod.currentQty,
          unitCost: item.costPrice,
          type: mode === 'sale' || mode === 'wholesale' ? 'sale' :
                mode === 'purchase' ? 'purchase' :
                mode === 'sale_return' ? 'sale_return' : 'purchase_return',
          refNumber: savedInvoice.number,
          sourceId: invId
        });
      }
    });

    // 2. Treasury entries for each payment
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
              description: `تحصيل فاتورة ${savedInvoice.number} - ${partyName}`,
              sourceType: mode,
              sourceId: invId
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
          description: `تحصيل فاتورة ${savedInvoice.number} - ${partyName}`,
          sourceType: mode,
          sourceId: invId
        });
      }
    }

    // 3. Automated balanced double-entry journal
    const journal = createInvoiceJournal(updated, savedInvoice);
    savedInvoice.journalEntryId = journal.id;
    updated.journals.unshift(journal);

    // 4. Increment sequence if new
    if (!editingInvoice) {
      if (mode === 'sale' || mode === 'wholesale') updated.settings.nextSale += 1;
      else if (mode === 'purchase') updated.settings.nextPurchase += 1;
      else if (mode === 'quote') updated.settings.nextQuote += 1;
    }

    // 5. Save to invoices array
    updated.invoices.unshift(savedInvoice);

    // 6. Audit
    logAudit(
      updated,
      `حفظ ${theme.title}`,
      `فاتورة رقم ${savedInvoice.number} بقيمة ${formatMoney(savedInvoice.total, updated.settings.currency)} للطرف ${partyName}`
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
      const prefix = mode === 'sale' ? 'INV-' :
                     mode === 'wholesale' ? 'WHL-' :
                     mode === 'purchase' ? 'PUR-' :
                     mode === 'sale_return' ? 'RET-S-' :
                     mode === 'purchase_return' ? 'RET-P-' : 'QUO-';
      const nextSeq = mode === 'sale' ? updated.settings.nextSale :
                      mode === 'wholesale' ? updated.settings.nextSale :
                      mode === 'purchase' ? updated.settings.nextPurchase : updated.settings.nextQuote;
      setInvNum(`${prefix}${String(nextSeq).padStart(6, '0')}`);
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
            {/* Layout switch for tablet/desktop */}
            <button
              onClick={() => setLayoutWidth(prev => (prev === 'mobile' ? 'expanded' : 'mobile'))}
              className="hidden sm:flex items-center gap-1 text-[10px] text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded transition-colors cursor-pointer"
              title="تبديل العرض بين الموبايل والشاشة الواسعة"
            >
              {layoutWidth === 'mobile' ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
              <span>{layoutWidth === 'mobile' ? 'شاشة واسعة' : 'شاشة مدمجة'}</span>
            </button>

            <span className="text-[10px] font-mono font-medium text-white/90 bg-black/20 px-1.5 py-0.5 rounded" id="liveTime">
              {liveTime}
            </span>

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
              <label className="font-bold text-slate-600 text-[8px]">اسم {theme.partyLabel} (بحث)</label>
              <input
                type="text"
                value={custSearchInput}
                placeholder="اكتب للبحث..."
                onFocus={() => setShowCustDropdown(true)}
                onChange={e => {
                  setCustSearchInput(e.target.value);
                  setShowCustDropdown(true);
                }}
                className="px-1.5 py-0.5 border border-slate-300 rounded text-[9px] bg-white font-bold h-[22px]"
              />
              {/* Autocomplete Dropdown */}
              {showCustDropdown && (
                <div className="absolute top-full right-0 left-0 bg-white border border-blue-600 rounded max-h-28 overflow-y-auto z-50 shadow-lg mt-0.5">
                  {partiesList
                    .filter(p => p.name.toLowerCase().includes(custSearchInput.toLowerCase()) || (p.code && p.code.includes(custSearchInput)))
                    .map(p => (
                      <div
                        key={p.id}
                        onClick={() => selectParty(p)}
                        className="p-1 text-[9px] hover:bg-blue-50 cursor-pointer border-b border-slate-100 flex items-center justify-between"
                      >
                        <span className="font-bold text-slate-900">{p.code || '—'} - {p.name}</span>
                        <span className="text-[8px] text-slate-400 font-mono">{p.phone}</span>
                      </div>
                    ))}
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
                <div className="absolute top-full right-0 left-0 bg-white border border-blue-600 rounded max-h-24 overflow-y-auto z-50 shadow-lg mt-0.5">
                  {partiesList
                    .filter(p => p.phone && p.phone.includes(custPhone))
                    .map(p => (
                      <div
                        key={p.id}
                        onClick={() => selectParty(p)}
                        className="p-1 text-[9px] hover:bg-blue-50 cursor-pointer border-b border-slate-100 flex items-center justify-between"
                      >
                        <span className="font-bold text-slate-900">{p.name}</span>
                        <span className="text-[8px] font-mono">{p.phone}</span>
                      </div>
                    ))}
                </div>
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
          </div>

          {/* Top Actions Grid (2 Buttons) */}
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => setShowLookupModal(true)}
              className="py-1.5 px-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>دليل الأصناف (إضافة سريعة)</span>
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
              <span>دليل الأصناف (اختر صنفاً للإضافة السريعة)</span>
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
                    placeholder="بحث بالاسم أو الكود..."
                    value={lookupSearch}
                    onChange={e => setLookupSearch(e.target.value)}
                    className="flex-1 text-[9.5px] border-0 focus:outline-hidden"
                  />
                </div>

                <div className="flex-1 overflow-y-auto flex flex-col gap-1 p-0.5">
                  {db.products
                    .filter(p => selectedCategory === 'all' || p.category === selectedCategory)
                    .filter(p => !lookupSearch || p.name.toLowerCase().includes(lookupSearch.toLowerCase()) || p.code.toLowerCase().includes(lookupSearch.toLowerCase()))
                    .map(item => {
                      const isLow = item.currentQty <= item.minStock;
                      return (
                        <div
                          key={item.id}
                          onClick={() => quickAddItem(item)}
                          className={`bg-white border rounded p-1.5 flex flex-col gap-0.5 cursor-pointer shadow-2xs hover:border-blue-500 hover:bg-blue-50/40 transition-colors ${
                            isLow ? 'border-rose-400 bg-rose-50/30' : 'border-slate-300'
                          }`}
                        >
                          <div className="flex justify-between items-center text-[9.5px] font-bold text-slate-900 border-b border-slate-100 pb-0.5">
                            <span>
                              {item.name} <small className="font-normal text-slate-500 text-[8px]">({item.category || 'عامة'})</small>
                            </span>
                            <span className="text-sky-600 font-mono text-[8.5px]">{item.code}</span>
                          </div>

                          <div className="grid grid-cols-4 gap-1 text-[8px] text-center pt-0.5">
                            <div className="bg-slate-50 p-0.5 rounded border border-slate-200">
                              <span className="block text-[6.5px] text-slate-500">المتاح</span>
                              <strong className={`font-mono text-[9px] ${item.currentQty <= 0 ? 'text-rose-600' : 'text-blue-600'}`}>
                                {item.currentQty}
                              </strong>
                            </div>
                            <div className="bg-slate-50 p-0.5 rounded border border-slate-200">
                              <span className="block text-[6.5px] text-slate-500">نقدي</span>
                              <strong className="font-mono text-emerald-600">{item.sellPrice.toFixed(2)}</strong>
                            </div>
                            <div className="bg-slate-50 p-0.5 rounded border border-slate-200">
                              <span className="block text-[6.5px] text-slate-500">جملة</span>
                              <strong className="font-mono text-amber-600">{item.wholesalePrice.toFixed(2)}</strong>
                            </div>
                            <div className="bg-slate-50 p-0.5 rounded border border-slate-200">
                              <span className="block text-[6.5px] text-slate-500">شراء</span>
                              <strong className="font-mono text-rose-600">{item.buyPrice.toFixed(2)}</strong>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
    </div>
  );
};
