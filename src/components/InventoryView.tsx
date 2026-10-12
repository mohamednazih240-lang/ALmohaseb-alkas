import React, { useState } from 'react';
import {
  Package,
  Warehouse,
  ArrowLeftRight,
  Calculator,
  TrendingDown,
  Plus,
  Search,
  Edit,
  Trash2,
  AlertTriangle,
  X,
  FileSpreadsheet,
  Boxes,
  Sparkles,
  Filter,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  CheckCircle2,
  Printer,
  Download,
  History,
  Eye
} from 'lucide-react';
import {
  AccountingDB,
  Product,
  Warehouse as WarehouseType,
  StockAdjustment,
  StockTransfer
} from '../types/accounting';
import { mergeCatalogIntoDb } from '../data/defaultCatalog1001';
import {
  formatMoney,
  generateId,
  getTodayDate,
  logAudit
} from '../services/accountingStorage';
import { useModalBackHandler } from '../hooks/useModalBackHandler';
import {
  UniversalPrintModal,
  MovementPrintBlock,
  formatCleanNumber
} from './UniversalPrintModal';
import { exportTableToCsv } from '../services/exportService';

interface InventoryViewProps {
  subPage: 'products' | 'warehouses' | 'stock' | 'inventory' | 'prices';
  db: AccountingDB;
  onUpdateDb: (updated: AccountingDB) => void;
  onOpenProductModal: (p?: Product) => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  subPage,
  db,
  onUpdateDb,
  onOpenProductModal
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [showWhModal, setShowWhModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);

  // Mobile back buttons: close open modal without leaving the view
  useModalBackHandler(showWhModal, () => setShowWhModal(false), 'inventory_wh_modal');
  useModalBackHandler(showTransferModal, () => setShowTransferModal(false), 'inventory_transfer_modal');
  useModalBackHandler(showAdjustModal, () => setShowAdjustModal(false), 'inventory_adjust_modal');

  // Warehouse form state
  const [whName, setWhName] = useState('');
  const [whLocation, setWhLocation] = useState('');

  // Transfer form state
  const [transferProductId, setTransferProductId] = useState(db.products[0]?.id || '');
  const [fromWhId, setFromWhId] = useState(db.warehouses[0]?.id || '');
  const [toWhId, setToWhId] = useState(db.warehouses[1]?.id || db.warehouses[0]?.id || '');
  const [transferQty, setTransferQty] = useState<number>(1);
  const [transferNotes, setTransferNotes] = useState('');

  // Adjust form state
  const [adjustProductId, setAdjustProductId] = useState(db.products[0]?.id || '');
  const [actualQty, setActualQty] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState('مطابقة الجرد الدوري');

  // Filter & Search states for Products
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'in_stock' | 'out_of_stock' | 'low_stock'>('all');
  const [sortBy, setSortBy] = useState<'name_asc' | 'name_desc' | 'code_asc' | 'qty_desc' | 'qty_asc' | 'price_desc' | 'price_asc'>('name_asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(36);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Universal Print Modal State
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printDocuments, setPrintDocuments] = useState<MovementPrintBlock[]>([]);
  const [printDocTitle, setPrintDocTitle] = useState('طباعة المخزون');

  // Statistics
  const inStockCount = db.products.filter(p => p.currentQty > 0).length;
  const zeroStockCount = db.products.filter(p => p.currentQty === 0).length;
  const lowStockCount = db.products.filter(p => p.currentQty <= p.minStock && p.currentQty > 0).length;
  const totalStockValue = db.products.reduce((acc, p) => acc + (p.currentQty * (p.avgCost || p.buyPrice)), 0);

  // Filtered and sorted products
  const filteredProducts = db.products.filter(p => {
    const s = searchTerm.trim().toLowerCase();
    const matchSearch = !s ||
      p.name.toLowerCase().includes(s) ||
      p.code.toLowerCase().includes(s) ||
      (p.barcode && p.barcode.toLowerCase().includes(s)) ||
      (p.notes && p.notes.toLowerCase().includes(s));

    let matchStock = true;
    if (stockStatusFilter === 'in_stock') matchStock = p.currentQty > 0;
    else if (stockStatusFilter === 'out_of_stock') matchStock = p.currentQty === 0;
    else if (stockStatusFilter === 'low_stock') matchStock = p.currentQty <= p.minStock && p.currentQty > 0;

    return matchSearch && matchStock;
  }).sort((a, b) => {
    if (sortBy === 'name_asc') return a.name.localeCompare(b.name, 'ar');
    if (sortBy === 'name_desc') return b.name.localeCompare(a.name, 'ar');
    if (sortBy === 'code_asc') return a.code.localeCompare(b.code);
    if (sortBy === 'qty_desc') return b.currentQty - a.currentQty;
    if (sortBy === 'qty_asc') return a.currentQty - b.currentQty;
    if (sortBy === 'price_desc') return b.sellPrice - a.sellPrice;
    if (sortBy === 'price_asc') return a.sellPrice - b.sellPrice;
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
  const currentSafePage = Math.min(currentPage, totalPages);
  const paginatedProducts = filteredProducts.slice((currentSafePage - 1) * itemsPerPage, currentSafePage * itemsPerPage);

  const handleMergeCatalogAction = () => {
    const { db: updatedDb, addedCount } = mergeCatalogIntoDb(db);
    if (addedCount > 0) {
      logAudit(updatedDb, 'دمج كتالوج الأصناف', `تم استيراد ودمج ${addedCount} صنف من كتالوج المؤسسة بنجاح`);
      onUpdateDb(updatedDb);
      setToastMsg(`✓ تم دمج وإضافة ${addedCount} صنف جديد من كتالوج المؤسسة بنجاح! إجمالي الأصناف الآن: ${updatedDb.products.length} صنف.`);
      setTimeout(() => setToastMsg(null), 5000);
    } else {
      setToastMsg(`جميع أصناف الكتالوج الـ 1001 مدرجة ومحدثة بالفعل في النظام (${db.products.length} صنف).`);
      setTimeout(() => setToastMsg(null), 4000);
    }
  };

  // Save new Warehouse
  const handleSaveWarehouse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!whName.trim()) return alert('اكتب اسم المخزن');
    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const newWh: WarehouseType = {
      id: generateId('wh'),
      name: whName.trim(),
      location: whLocation.trim()
    };
    updated.warehouses.push(newWh);
    logAudit(updated, 'إضافة مخزن جديد', whName);
    onUpdateDb(updated);
    setWhName('');
    setWhLocation('');
    setShowWhModal(false);
  };

  // Stock Transfer between Warehouses
  const handleSaveTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (fromWhId === toWhId) return alert('اختر مخزنين مختلفين للتحويل');
    if (transferQty <= 0) return alert('الكمية يجب أن تكون أكبر من صفر');

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const prod = updated.products.find(p => p.id === transferProductId);
    if (!prod) return;

    if (prod.currentQty < transferQty) {
      alert('الرصيد الإجمالي للصنف لا يكفي لإتمام هذا التحويل');
      return;
    }

    const fromWh = updated.warehouses.find(w => w.id === fromWhId);
    const toWh = updated.warehouses.find(w => w.id === toWhId);
    const tId = generateId('trf');

    const transferRecord: StockTransfer = {
      id: tId,
      date: getTodayDate(),
      productId: prod.id,
      productName: prod.name,
      fromWarehouseId: fromWhId,
      toWarehouseId: toWhId,
      qty: transferQty,
      notes: transferNotes
    };

    updated.transfers.unshift(transferRecord);

    // Stock movements (out from source, in to destination)
    updated.stockMovements.unshift({
      id: generateId('sm'),
      date: getTodayDate(),
      productId: prod.id,
      productName: prod.name,
      warehouseId: fromWhId,
      warehouseName: fromWh ? fromWh.name : 'مخزن المصدر',
      qtyChange: -transferQty,
      balanceAfter: prod.currentQty,
      unitCost: prod.avgCost || prod.buyPrice,
      type: 'transfer_out',
      refNumber: `TRF-${tId.slice(-4)}`,
      sourceId: tId
    });

    updated.stockMovements.unshift({
      id: generateId('sm'),
      date: getTodayDate(),
      productId: prod.id,
      productName: prod.name,
      warehouseId: toWhId,
      warehouseName: toWh ? toWh.name : 'مخزن الوجهة',
      qtyChange: transferQty,
      balanceAfter: prod.currentQty,
      unitCost: prod.avgCost || prod.buyPrice,
      type: 'transfer_in',
      refNumber: `TRF-${tId.slice(-4)}`,
      sourceId: tId
    });

    logAudit(updated, 'تحويل مخزون بين مستودعين', `${prod.name} كمية ${transferQty} من ${fromWh?.name} إلى ${toWh?.name}`);
    onUpdateDb(updated);
    setShowTransferModal(false);
  };

  // Stock Adjustment (الجرد والتسويات)
  const handleSaveAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    const prod = updated.products.find(p => p.id === adjustProductId);
    if (!prod) return;

    const systemQty = prod.currentQty;
    const diff = actualQty - systemQty;
    if (diff === 0) return alert('الرصيد الفعلي مطابق للرصيد الدفتري، لا يوجد فرق تسوية');

    const adjId = generateId('adj');
    const unitCost = prod.avgCost || prod.buyPrice;
    const diffValue = Math.abs(diff) * unitCost;

    const adjustmentRecord: StockAdjustment = {
      id: adjId,
      date: getTodayDate(),
      productId: prod.id,
      productName: prod.name,
      systemQty,
      actualQty,
      diffQty: diff,
      unitCost,
      reason: adjustReason
    };

    // Update physical product qty
    prod.currentQty = actualQty;
    updated.adjustments.unshift(adjustmentRecord);

    // Stock Movement
    updated.stockMovements.unshift({
      id: generateId('sm'),
      date: getTodayDate(),
      productId: prod.id,
      productName: prod.name,
      warehouseId: updated.warehouses[0]?.id || 'wh_main',
      warehouseName: 'المخزن الرئيسي',
      qtyChange: diff,
      balanceAfter: prod.currentQty,
      unitCost,
      type: 'adjustment',
      refNumber: `ADJ-${adjId.slice(-4)}`,
      sourceId: adjId
    });

    // Accounting Journal Entry:
    // If deficit (diff < 0): Debit Inventory Variance / Loss (5301), Credit Inventory (1301)
    // If surplus (diff > 0): Debit Inventory (1301), Credit Other Revenue (4201)
    const invAcc = updated.accounts.find(a => a.id === 'acc_inv')!;
    const adjAcc = updated.accounts.find(a => a.id === 'acc_adj') || updated.accounts.find(a => a.id === 'acc_exp')!;
    const revAcc = updated.accounts.find(a => a.id === 'acc_other_rev')!;

    const lines = [];
    if (diff < 0) {
      lines.push({
        accountId: adjAcc.id,
        accountCode: adjAcc.code,
        accountName: adjAcc.name,
        debit: diffValue,
        credit: 0,
        notes: `عجز تسوية جرد للصنف ${prod.name}`
      });
      lines.push({
        accountId: invAcc.id,
        accountCode: invAcc.code,
        accountName: invAcc.name,
        debit: 0,
        credit: diffValue,
        notes: `تخفيض قيمة المخزون الدفتري`
      });
    } else {
      lines.push({
        accountId: invAcc.id,
        accountCode: invAcc.code,
        accountName: invAcc.name,
        debit: diffValue,
        credit: 0,
        notes: `زيادة وفائض جرد للصنف ${prod.name}`
      });
      lines.push({
        accountId: revAcc.id,
        accountCode: revAcc.code,
        accountName: revAcc.name,
        debit: 0,
        credit: diffValue,
        notes: `أرباح فروق جرد`
      });
    }

    updated.journals.unshift({
      id: generateId('j'),
      number: `J-${Date.now().toString().slice(-6)}`,
      date: getTodayDate(),
      description: `قيد تسوية جرد للصنف ${prod.name} (${diff > 0 ? 'زيادة' : 'عجز'} ${Math.abs(diff)} ${prod.unit})`,
      sourceType: 'adjustment',
      sourceId: adjId,
      lines,
      createdAt: new Date().toISOString()
    });

    logAudit(updated, 'تسوية جرد مخزني', `${prod.name}: الرصيد السابق ${systemQty} -> الرصيد الفعلي ${actualQty} (فرق: ${diff})`);
    onUpdateDb(updated);
    setShowAdjustModal(false);
  };

  const handleDeleteProduct = (p: Product) => {
    const hasMovements = db.stockMovements.some(sm => sm.productId === p.id);
    if (hasMovements) {
      alert('لا يمكن حذف الصنف لوجود حركات وفواتير سابقة مرتبطة به.');
      return;
    }
    if (!confirm(`هل ترغب في حذف الصنف "${p.name}"؟`)) return;

    const updated = JSON.parse(JSON.stringify(db)) as AccountingDB;
    updated.products = updated.products.filter(item => item.id !== p.id);
    onUpdateDb(updated);
  };

  // Export Products to CSV / Excel
  const handleExportProductsCsv = () => {
    if (filteredProducts.length === 0) {
      alert('لا توجد أصناف للتصدير');
      return;
    }
    const headers = ['كود الصنف', 'اسم الصنف', 'الباركود', 'الوحدة', 'الرصيد الحالي', 'سعر التكلفة', 'سعر البيع', 'سعر الجملة', 'الحد الأدنى', 'القيمة الإجمالية'];
    const rows = filteredProducts.map(p => [
      p.code,
      p.name,
      p.barcode || '',
      p.unit,
      p.currentQty.toString(),
      (p.avgCost || p.buyPrice).toString(),
      p.sellPrice.toString(),
      (p.wholesalePrice || p.sellPrice).toString(),
      p.minStock.toString(),
      (p.currentQty * (p.avgCost || p.buyPrice)).toString()
    ]);
    exportTableToCsv(`inventory_products_${getTodayDate()}.csv`, headers, rows);
  };

  // Print Products Catalog & Prices
  const handlePrintCatalog = () => {
    if (filteredProducts.length === 0) {
      alert('لا توجد أصناف للطباعة');
      return;
    }
    const today = getTodayDate();
    const curr = db.settings.currency;
    const doc: MovementPrintBlock = {
      title: 'كتالوج وقائمة أسعار الأصناف المعتمدة',
      serialNo: `#CAT-${today}`,
      date: today,
      partyLabel: 'عدد الأصناف:',
      partyName: `${filteredProducts.length} صنف مسجل`,
      badge: 'كتالوج أسعار',
      tableHeaders: [
        { label: 'الكود', width: '12%', align: 'center' },
        { label: 'اسم الصنف والمواصفات', width: '38%', align: 'right' },
        { label: 'الوحدة', width: '10%', align: 'center' },
        { label: 'الرصيد', width: '10%', align: 'center' },
        { label: 'سعر التجزئة', width: '15%', align: 'center' },
        { label: 'سعر الجملة', width: '15%', align: 'center' }
      ],
      tableRows: filteredProducts.map(p => ({
        cols: [
          p.code,
          p.name,
          p.unit,
          `${p.currentQty}`,
          formatMoney(p.sellPrice, curr),
          formatMoney(p.wholesalePrice || p.sellPrice, curr)
        ]
      })),
      summaryLines: [
        { label: 'إجمالي عدد الأصناف المعروضة', value: `${filteredProducts.length} صنف` },
        { label: 'إجمالي قيمة المخزون التقديرية', value: formatMoney(totalStockValue, curr), isTotal: true, highlight: true }
      ],
      footerNotes: 'الأسعار شاملة الضريبة إن وجدت وقابلة للتعديل بحسب تحديثات الإدارة.'
    };
    setPrintDocTitle('كتالوج وقائمة الأسعار');
    setPrintDocuments([doc]);
    setPrintModalOpen(true);
  };

  // Print Stock Valuation & Physical Count
  const handlePrintStockValuation = () => {
    if (filteredProducts.length === 0) {
      alert('لا توجد أصناف للطباعة');
      return;
    }
    const today = getTodayDate();
    const curr = db.settings.currency;
    const totalSell = filteredProducts.reduce((s, p) => s + (p.currentQty * p.sellPrice), 0);
    const totalCost = filteredProducts.reduce((s, p) => s + (p.currentQty * (p.avgCost || p.buyPrice)), 0);

    const doc: MovementPrintBlock = {
      title: 'تقرير جرد وتقييم المخزون المالي',
      serialNo: `#VAL-${today}`,
      date: today,
      partyLabel: 'عدد الأصناف:',
      partyName: `${filteredProducts.length} صنف`,
      badge: 'تقييم مخزون',
      tableHeaders: [
        { label: 'الكود', width: '12%', align: 'center' },
        { label: 'اسم الصنف', width: '30%', align: 'right' },
        { label: 'الرصيد', width: '12%', align: 'center' },
        { label: 'التكلفة', width: '14%', align: 'center' },
        { label: 'إجمالي التكلفة', width: '16%', align: 'center' },
        { label: 'قيمة البيع', width: '16%', align: 'center' }
      ],
      tableRows: filteredProducts.map(p => {
        const cost = p.avgCost || p.buyPrice;
        return {
          cols: [
            p.code,
            p.name,
            `${p.currentQty} ${p.unit}`,
            formatMoney(cost, curr),
            formatMoney(p.currentQty * cost, curr),
            formatMoney(p.currentQty * p.sellPrice, curr)
          ],
          highlight: p.currentQty <= p.minStock
        };
      }),
      summaryLines: [
        { label: 'إجمالي قيمة المخزون بالتكلفة', value: formatMoney(totalCost, curr) },
        { label: 'إجمالي قيمة المخزون بالبيع', value: formatMoney(totalSell, curr) },
        { label: 'الأرباح المتوقعة للمخزون', value: formatMoney(totalSell - totalCost, curr), isTotal: true, highlight: true }
      ],
      footerNotes: 'تم احتساب التكلفة وفقاً لمتوسط التكلفة المرجح للواردات.'
    };
    setPrintDocTitle('تقرير تقييم المخزون والجرد');
    setPrintDocuments([doc]);
    setPrintModalOpen(true);
  };

  // Detailed Product Movement Card (كارت صنف)
  const handlePrintItemCard = (product: Product) => {
    const today = getTodayDate();
    const curr = db.settings.currency;
    const moves: { date: string; desc: string; type: string; inQty: number; outQty: number; balance: number; unitPrice: number }[] = [];

    // 1. Stock Movements log if present
    const smList = db.stockMovements.filter(sm => sm.productId === product.id);
    if (smList.length > 0) {
      smList.forEach(sm => {
        moves.push({
          date: sm.date,
          desc: `${sm.refNumber ? `[${sm.refNumber}] ` : ''}${sm.warehouseName || 'المخزن'} - حركة ${sm.type}`,
          type: sm.type,
          inQty: sm.qtyChange > 0 ? sm.qtyChange : 0,
          outQty: sm.qtyChange < 0 ? Math.abs(sm.qtyChange) : 0,
          balance: sm.balanceAfter,
          unitPrice: sm.unitCost
        });
      });
    } else {
      // Fallback: Invoices, Returns, Adjustments
      db.invoices.filter(inv => inv.type === 'purchase').forEach(inv => {
        inv.items.filter(item => item.productId === product.id).forEach(item => {
          moves.push({
            date: inv.date,
            desc: `فاتورة شراء رقم ${inv.number} (${inv.partyName || 'مورد'})`,
            type: 'purchase',
            inQty: item.qty,
            outQty: 0,
            balance: 0,
            unitPrice: item.unitPrice
          });
        });
      });

      db.invoices.filter(inv => inv.type === 'sale').forEach(inv => {
        inv.items.filter(item => item.productId === product.id).forEach(item => {
          moves.push({
            date: inv.date,
            desc: `فاتورة بيع رقم ${inv.number} (${inv.partyName || 'عميل'})`,
            type: 'sale',
            inQty: 0,
            outQty: item.qty,
            balance: 0,
            unitPrice: item.unitPrice
          });
        });
      });

      db.returns.filter(ret => ret.productId === product.id).forEach(ret => {
        if (ret.type === 'purchase') {
          moves.push({
            date: ret.date,
            desc: `مرتجع مشتريات رقم ${ret.number}`,
            type: 'purchase_return',
            inQty: 0,
            outQty: ret.qty,
            balance: 0,
            unitPrice: ret.price
          });
        } else {
          moves.push({
            date: ret.date,
            desc: `مرتجع مبيعات رقم ${ret.number}`,
            type: 'sale_return',
            inQty: ret.qty,
            outQty: 0,
            balance: 0,
            unitPrice: ret.price
          });
        }
      });

      db.adjustments.filter(adj => adj.productId === product.id).forEach(adj => {
        moves.push({
          date: adj.date,
          desc: `تسوية جردية (${adj.reason})`,
          type: 'adj',
          inQty: adj.diffQty > 0 ? adj.diffQty : 0,
          outQty: adj.diffQty < 0 ? Math.abs(adj.diffQty) : 0,
          balance: adj.actualQty,
          unitPrice: adj.unitCost
        });
      });
    }

    moves.sort((a, b) => (a.date > b.date ? 1 : -1));

    let run = 0;
    moves.forEach(m => {
      run = run + m.inQty - m.outQty;
      if (!m.balance) {
        m.balance = run;
      }
    });

    const totalIn = moves.reduce((s, m) => s + m.inQty, 0);
    const totalOut = moves.reduce((s, m) => s + m.outQty, 0);

    const doc: MovementPrintBlock = {
      title: `كارت حركة صنف: ${product.name}`,
      serialNo: `#CARD-${product.code}-${today}`,
      date: today,
      partyLabel: 'الصنف / الكود:',
      partyName: `${product.name} (${product.code})`,
      badge: 'سجل حركة صنف',
      tableHeaders: [
        { label: 'التاريخ', width: '14%', align: 'center' },
        { label: 'البيان والمستند', width: '38%', align: 'right' },
        { label: 'الوارد (+)', width: '12%', align: 'center' },
        { label: 'المنصرف (-)', width: '12%', align: 'center' },
        { label: 'السعر', width: '12%', align: 'center' },
        { label: 'الرصيد', width: '12%', align: 'center' }
      ],
      tableRows: moves.map(m => ({
        cols: [
          m.date,
          m.desc,
          m.inQty > 0 ? `+${m.inQty}` : '—',
          m.outQty > 0 ? `-${m.outQty}` : '—',
          formatMoney(m.unitPrice, curr),
          `${m.balance} ${product.unit}`
        ],
        highlight: m.balance <= product.minStock,
        isBold: m.inQty > 0 || m.outQty > 0
      })),
      summaryLines: [
        { label: 'إجمالي الكميات الواردة', value: `${totalIn} ${product.unit}` },
        { label: 'إجمالي الكميات المنصرفة', value: `${totalOut} ${product.unit}` },
        { label: 'الرصيد الحالي بالمخزن', value: `${product.currentQty} ${product.unit}`, isTotal: true, highlight: true }
      ],
      footerNotes: `باركود: ${product.barcode || '—'} | الحد الأدنى: ${product.minStock} | متوسط التكلفة: ${formatMoney(product.avgCost || product.buyPrice, curr)}`
    };

    setPrintDocTitle(`كارت صنف - ${product.name}`);
    setPrintDocuments([doc]);
    setPrintModalOpen(true);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. PRODUCTS SUBPAGE */}
      {subPage === 'products' && (
        <>
          {/* Toast Notification */}
          {toastMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs rounded-xl flex items-center justify-between font-bold shadow-xs animate-in fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{toastMsg}</span>
              </div>
              <button onClick={() => setToastMsg(null)} className="text-emerald-700 hover:text-emerald-950 p-1">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Top Header & Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <Package className="w-6 h-6" />
                <span>دليل الأصناف والمستودعات</span>
                <span className="text-xs bg-slate-900 text-white font-bold px-2.5 py-0.5 rounded-full font-mono">
                  {db.products.length} صنف
                </span>
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                كتالوج الأصناف الكامل، المشتريات، باركودات الأصناف، الأسعار ومتابعة الأرصدة
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleExportProductsCsv}
                className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
                title="تصدير كشف الأصناف إكسل"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>تصدير Excel</span>
              </button>

              <button
                type="button"
                onClick={handlePrintCatalog}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
                title="طباعة كتالوج وقائمة الأسعار"
              >
                <Printer className="w-4 h-4 text-slate-600" />
                <span>طباعة الكتالوج</span>
              </button>

              <button
                type="button"
                onClick={handlePrintStockValuation}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
                title="طباعة تقييم وجرد المخزون"
              >
                <Calculator className="w-4 h-4 text-slate-600" />
                <span>تقييم وجرد</span>
              </button>

              <button
                type="button"
                onClick={handleMergeCatalogAction}
                className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                title="دمج كتالوج الـ 1001 صنف المرفق في ملف المؤسسة"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>دمج كتالوج الـ 1001 صنف</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenProductModal()}
                className="px-4 py-2 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة صنف يدوي</span>
              </button>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 block mb-0.5">إجمالي الأصناف</span>
              <span className="text-base sm:text-lg font-black font-mono text-slate-950">
                {db.products.length} <span className="text-xs font-normal text-slate-500">صنف</span>
              </span>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 block mb-0.5">جاهزة للتوريد (رصيد 0)</span>
              <span className="text-base sm:text-lg font-black font-mono text-blue-700">
                {zeroStockCount} <span className="text-xs font-normal text-slate-500">صنف</span>
              </span>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 block mb-0.5">أصناف متوفرة بالمخزن</span>
              <span className="text-base sm:text-lg font-black font-mono text-emerald-700">
                {inStockCount} <span className="text-xs font-normal text-slate-500">صنف</span>
              </span>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 block mb-0.5">إجمالي قيمة المخزون</span>
              <span className="text-base sm:text-lg font-black font-mono text-slate-950">
                {formatMoney(totalStockValue, db.settings.currency)}
              </span>
            </div>
          </div>

          {/* Dynamic Search & Advanced Filter Toolbar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              {/* Search input */}
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                <input
                  type="text"
                  placeholder="بحث سريع بالاسم، الكود، الباركود، أو الوصف..."
                  value={searchTerm}
                  onChange={e => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pr-9 pl-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-hidden focus:border-black focus:bg-white transition-all"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm('');
                      setCurrentPage(1);
                    }}
                    className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Sort selector */}
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1 shrink-0">
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  <span>الترتيب:</span>
                </label>
                <select
                  value={sortBy}
                  onChange={e => {
                    setSortBy(e.target.value as any);
                    setCurrentPage(1);
                  }}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none cursor-pointer"
                >
                  <option value="name_asc">الاسم (أ - ي)</option>
                  <option value="name_desc">الاسم (ي - أ)</option>
                  <option value="code_asc">الكود التسلسلي</option>
                  <option value="qty_desc">الأعلى رصيداً</option>
                  <option value="qty_asc">الأقل رصيداً</option>
                  <option value="price_desc">الأعلى سعراً</option>
                  <option value="price_asc">الأقل سعراً</option>
                </select>

                <select
                  value={itemsPerPage}
                  onChange={e => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none cursor-pointer"
                  title="عدد الأصناف بالصفحة"
                >
                  <option value={24}>24 صنف</option>
                  <option value={36}>36 صنف</option>
                  <option value={60}>60 صنف</option>
                  <option value={120}>120 صنف</option>
                  <option value={500}>500 صنف</option>
                </select>
              </div>
            </div>

            {/* Filter chips */}
            <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold text-slate-500 ml-1">حالة الرصيد:</span>
                <button
                  type="button"
                  onClick={() => { setStockStatusFilter('all'); setCurrentPage(1); }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    stockStatusFilter === 'all'
                      ? 'bg-black text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  الكل ({db.products.length})
                </button>
                <button
                  type="button"
                  onClick={() => { setStockStatusFilter('out_of_stock'); setCurrentPage(1); }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    stockStatusFilter === 'out_of_stock'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  بدون رصيد (جاهزة للتوريد) ({zeroStockCount})
                </button>
                <button
                  type="button"
                  onClick={() => { setStockStatusFilter('in_stock'); setCurrentPage(1); }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    stockStatusFilter === 'in_stock'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  متوفر بالمستودع ({inStockCount})
                </button>
                {lowStockCount > 0 && (
                  <button
                    type="button"
                    onClick={() => { setStockStatusFilter('low_stock'); setCurrentPage(1); }}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      stockStatusFilter === 'low_stock'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    قارب على النفاد ({lowStockCount})
                  </button>
                )}
              </div>

              <div className="text-[11px] font-bold text-slate-500 font-mono">
                نتائج البحث: <span className="text-slate-900 font-black">{filteredProducts.length}</span> صنف
                {filteredProducts.length > itemsPerPage && (
                  <span> (صفحة {currentSafePage} من {totalPages})</span>
                )}
              </div>
            </div>
          </div>

          {/* Products Responsive Card Grid */}
          {filteredProducts.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-2xs">
              <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <div className="text-sm font-bold text-slate-700">لا توجد أصناف تطابق البحث والفلاتر المحددة</div>
              <p className="text-xs text-slate-400 mt-1">جرّب تغيير عبارة البحث أو اختيار تصفية أخرى</p>
              <div className="mt-3 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => { setSearchTerm(''); setStockStatusFilter('all'); }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition-all"
                >
                  إعادة ضبط الفلاتر
                </button>
                <button
                  type="button"
                  onClick={handleMergeCatalogAction}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>دمج كتالوج الـ 1001 صنف</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {paginatedProducts.map(p => {
                const isZero = p.currentQty === 0;
                const isLow = !isZero && p.currentQty <= p.minStock;
                const val = p.currentQty * (p.avgCost || p.buyPrice);

                return (
                  <div
                    key={p.id}
                    className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between p-3.5"
                  >
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                      <div>
                        <h3 className="font-black text-sm text-slate-900 leading-snug">
                          {p.name}
                        </h3>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-2">
                          <span>كود: {p.code}</span>
                          {p.barcode && <span>| باركود: {p.barcode}</span>}
                        </div>
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border shrink-0 ${
                          isZero
                            ? 'bg-slate-100 text-slate-600 border-slate-200'
                            : isLow
                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        }`}
                      >
                        {isZero ? 'رصيد صفر (جاهز للتوريد)' : isLow ? 'منخفض الرصيد' : 'متوفر بالمستودع'}
                      </span>
                    </div>

                    {/* Card Body */}
                    <div className="py-2.5 space-y-2 text-xs">
                      {/* Price Grid */}
                      <div className="grid grid-cols-3 gap-1.5 text-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <div>
                          <span className="text-[10px] text-slate-500 block">سعر القطاعي</span>
                          <span className="font-bold font-mono text-slate-950">
                            {p.sellPrice > 0 ? formatMoney(p.sellPrice, db.settings.currency) : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">سعر الجملة</span>
                          <span className="font-bold font-mono text-slate-700">
                            {p.wholesalePrice > 0 ? formatMoney(p.wholesalePrice, db.settings.currency) : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">التكلفة / شراء</span>
                          <span className="font-bold font-mono text-slate-600">
                            {p.buyPrice > 0 ? formatMoney(p.buyPrice, db.settings.currency) : '—'}
                          </span>
                        </div>
                      </div>

                      {/* Stock & Valuation */}
                      <div className="flex items-center justify-between pt-1">
                        <div>
                          <span className="text-slate-500 text-[11px] block">الرصيد الفعلي:</span>
                          <span className="text-base font-black font-mono text-slate-950">
                            {p.currentQty} <span className="text-xs font-normal text-slate-500">{p.unit}</span>
                          </span>
                        </div>

                        <div className="text-left">
                          <span className="text-slate-500 text-[11px] block">قيمة المخزون:</span>
                          <span className="text-xs font-bold font-mono text-slate-800">
                            {formatMoney(val, db.settings.currency)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                        الوحدة: {p.unit || 'عدد'}
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handlePrintItemCard(p)}
                          className="px-2 py-1 text-slate-700 hover:text-black hover:bg-slate-100 rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                          title="عرض وطباعة كارت حركة الصنف"
                        >
                          <History className="w-3.5 h-3.5 text-blue-600" />
                          <span>كارت حركة</span>
                        </button>
                        <button
                          onClick={() => onOpenProductModal(p)}
                          className="px-2.5 py-1 text-slate-700 hover:text-black hover:bg-slate-100 rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                          title="تعديل بيانات الصنف أو تسجيل سعر/رصيد"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>تعديل</span>
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(p)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                          title="حذف الصنف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs font-bold text-slate-600 font-mono">
                عرض {((currentSafePage - 1) * itemsPerPage) + 1} - {Math.min(currentSafePage * itemsPerPage, filteredProducts.length)} من أصل {filteredProducts.length} صنف
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentSafePage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                  <span>السابق</span>
                </button>

                <div className="flex items-center gap-1 px-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum = i + 1;
                    if (totalPages > 5 && currentSafePage > 3) {
                      pageNum = currentSafePage - 2 + i;
                      if (pageNum > totalPages) pageNum = totalPages - 4 + i;
                    }
                    if (pageNum < 1 || pageNum > totalPages) return null;

                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-8 h-8 rounded-lg text-xs font-black transition-all cursor-pointer ${
                          currentSafePage === pageNum
                            ? 'bg-black text-white shadow-xs'
                            : 'bg-slate-50 text-slate-700 hover:bg-slate-200 border border-slate-200'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  disabled={currentSafePage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
                >
                  <span>التالي</span>
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 2. WAREHOUSES SUBPAGE */}
      {subPage === 'warehouses' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <Warehouse className="w-6 h-6" />
                <span>إدارة الفروع والمخازن والتحويلات</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                توزيع البضائع على المستودعات وتحويل الأرصدة الداخلية
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowTransferModal(true)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <ArrowLeftRight className="w-4 h-4" />
                <span>تحويل بين المخازن</span>
              </button>
              <button
                onClick={() => setShowWhModal(true)}
                className="px-3.5 py-2 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>مخزن جديد</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {db.warehouses.map(w => (
              <div key={w.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <Warehouse className="w-4 h-4 text-slate-500" />
                    <span>{w.name}</span>
                    {w.isDefault && (
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-800 text-[9px] font-bold rounded">
                        افتراضي
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">{w.location || 'لا يوجد موقع مسجل'}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Transfers History (Responsive Card System) */}
          <div className="mt-6 space-y-3">
            <h3 className="text-xs font-bold text-slate-800">
              سجل التحويلات بين المخازن
            </h3>
            {db.transfers.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-slate-200 shadow-2xs text-slate-400 text-xs">
                لا توجد تحويلات بين المخازن بعد
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {db.transfers.map(t => (
                  <div key={t.id} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="font-bold text-xs text-slate-900">{t.productName}</span>
                      <span className="font-mono text-[11px] text-slate-500">{t.date}</span>
                    </div>
                    <div className="text-xs space-y-1">
                      <div className="flex items-center justify-between text-slate-600">
                        <span>من مستودع:</span>
                        <span className="font-medium text-slate-900">{db.warehouses.find(w => w.id === t.fromWarehouseId)?.name || 'مخزن'}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>إلى مستودع:</span>
                        <span className="font-medium text-slate-900">{db.warehouses.find(w => w.id === t.toWarehouseId)?.name || 'مخزن'}</span>
                      </div>
                      <div className="bg-slate-50 p-1.5 rounded flex items-center justify-between">
                        <span className="text-[11px] text-slate-500">الكمية المحولة:</span>
                        <span className="font-mono font-black text-xs text-slate-950">{t.qty}</span>
                      </div>
                    </div>
                    {t.notes && <p className="text-[10px] text-slate-400 truncate">{t.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* 3. STOCK MOVEMENTS (كارت حركة الصنف - Responsive Card System) */}
      {subPage === 'stock' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <ArrowLeftRight className="w-6 h-6" />
                <span>كارت حركة المخزون الشامل</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                تتبع كل صادر ووارد مع الرصيد التراكمي الدقيق بنظام الكروت
              </p>
            </div>
          </div>

          {db.stockMovements.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-2xs text-slate-400 text-xs">
              لا توجد حركات مخزنية مسجلة حتى الآن
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {db.stockMovements.map(sm => {
                const isPositive = sm.qtyChange > 0;
                return (
                  <div
                    key={sm.id}
                    className="bg-white p-3.5 rounded-xl border border-slate-200 hover:border-slate-300 shadow-2xs hover:shadow-xs transition-all space-y-2"
                  >
                    <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                      <div>
                        <span className="font-bold text-xs text-slate-900 block">{sm.productName}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{sm.date} • {sm.refNumber}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        sm.type === 'sale' ? 'bg-slate-100 text-slate-900' :
                        sm.type === 'purchase' ? 'bg-emerald-100 text-emerald-800' :
                        sm.type === 'adjustment' ? 'bg-purple-100 text-purple-800' :
                        'bg-slate-200 text-slate-800'
                      }`}>
                        {sm.type === 'sale' ? 'فاتورة بيع' :
                         sm.type === 'purchase' ? 'فاتورة شراء' :
                         sm.type === 'sale_return' ? 'مرتجع مبيعات' :
                         sm.type === 'purchase_return' ? 'مرتجع مشتريات' :
                         sm.type === 'adjustment' ? 'تسوية جرد' : sm.type}
                      </span>
                    </div>

                    <div className="text-xs space-y-1.5">
                      <div className="flex items-center justify-between text-slate-600">
                        <span>المستودع:</span>
                        <span className="font-medium text-slate-800">{sm.warehouseName}</span>
                      </div>

                      <div className="bg-slate-50 p-2 rounded-lg grid grid-cols-3 gap-1 text-center border border-slate-100">
                        <div>
                          <span className="text-[10px] text-slate-500 block">حركة الكمية</span>
                          <span className={`font-mono font-black text-xs ${isPositive ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {isPositive ? `+${sm.qtyChange}` : sm.qtyChange}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">الرصيد بعدها</span>
                          <span className="font-mono font-bold text-xs text-slate-950">{sm.balanceAfter}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">تكلفة الوحدة</span>
                          <span className="font-mono text-xs text-slate-700">{formatMoney(sm.unitCost, db.settings.currency)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 4. PHYSICAL INVENTORY & ADJUSTMENT (الجرد والتسويات) */}
      {subPage === 'inventory' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <Calculator className="w-6 h-6" />
                <span>الجرد الفعلي والتسويات المخزنية</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                مطابقة الرصيد الدفتري مع العد الفعلي بالمستودع وإثبات العجز أو الزيادة بقيد محاسبي
              </p>
            </div>
            <button
              onClick={() => {
                setAdjustProductId(db.products[0]?.id || '');
                setActualQty(db.products[0]?.currentQty || 0);
                setShowAdjustModal(true);
              }}
              className="px-4 py-2 bg-black hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>إجراء تسوية جردية جديدة</span>
            </button>
          </div>

          {/* Adjustments Responsive Card System */}
          {db.adjustments.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-2xs text-slate-400 text-xs">
              لا توجد تسويات جرد مسجلة
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {db.adjustments.map(adj => {
                const isShortage = adj.diffQty < 0;
                return (
                  <div key={adj.id} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                    <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                      <div>
                        <span className="font-bold text-xs text-slate-900 block">{adj.productName}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{adj.date}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        isShortage ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {isShortage ? 'عجز مخزني' : 'زيادة مخزنية'}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-2 rounded-lg grid grid-cols-3 gap-1 text-center border border-slate-100 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 block">الدفتري</span>
                        <span className="font-mono text-slate-700">{adj.systemQty}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">الفعلي</span>
                        <span className="font-mono font-bold text-slate-900">{adj.actualQty}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">الفرق</span>
                        <span className={`font-mono font-black ${isShortage ? 'text-rose-700' : 'text-emerald-700'}`}>
                          {adj.diffQty > 0 ? `+${adj.diffQty}` : adj.diffQty}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-slate-500">قيمة فرق الجرد:</span>
                      <span className="font-mono font-black text-slate-950">
                        {formatMoney(Math.abs(adj.diffQty) * adj.unitCost, db.settings.currency)}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600 bg-slate-50 p-1.5 rounded">{adj.reason}</p>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 5. PRICES SUBPAGE (Responsive Card System) */}
      {subPage === 'prices' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <TrendingDown className="w-6 h-6" />
                <span>مقارنة وتقلبات أسعار الشراء</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                تتبع التغيرات في أسعار توريد المنتجات عبر الزمن ومتوسط التكلفة
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {db.products.map(p => {
              const hist = p.priceHistory || [];
              const lastPrice = hist.length > 0 ? hist[hist.length - 1].price : p.buyPrice;
              const prevPrice = hist.length > 1 ? hist[hist.length - 2].price : lastPrice;
              const margin = p.sellPrice > 0 ? (((p.sellPrice - (p.avgCost || p.buyPrice)) / p.sellPrice) * 100).toFixed(1) : '0';

              return (
                <div key={p.id} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="font-bold text-xs text-slate-900">{p.name}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      هامش: {margin}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-50 p-2 rounded border border-slate-100">
                      <span className="text-[10px] text-slate-500 block">آخر سعر توريد</span>
                      <span className="font-mono font-bold text-slate-900">{formatMoney(lastPrice, db.settings.currency)}</span>
                    </div>
                    <div className="bg-slate-50 p-2 rounded border border-slate-100">
                      <span className="text-[10px] text-slate-500 block">السعر السابق</span>
                      <span className="font-mono text-slate-600">{formatMoney(prevPrice, db.settings.currency)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-slate-500">متوسط التكلفة:</span>
                    <span className="font-mono font-bold text-slate-800">{formatMoney(p.avgCost || p.buyPrice, db.settings.currency)}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-1.5">
                    <span className="text-slate-500">سعر البيع الحالي:</span>
                    <span className="font-mono font-black text-slate-950">{formatMoney(p.sellPrice, db.settings.currency)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Warehouse Modal */}
      {showWhModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl w-full max-w-sm p-4 space-y-3">
            <h2 className="text-sm font-black text-slate-900">إضافة مستودع / فرع جديد</h2>
            <form onSubmit={handleSaveWarehouse} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">اسم المخزن</label>
                <input
                  type="text"
                  required
                  value={whName}
                  onChange={e => setWhName(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">الموقع / العنوان</label>
                <input
                  type="text"
                  value={whLocation}
                  onChange={e => setWhLocation(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowWhModal(false)} className="px-3 py-1.5 bg-slate-100 rounded text-xs">إلغاء</button>
                <button type="submit" className="px-4 py-1.5 bg-black text-white rounded text-xs font-bold">حفظ</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl w-full max-w-md p-4 space-y-3">
            <h2 className="text-sm font-black text-slate-900">تحويل بضاعة بين المستودعات</h2>
            <form onSubmit={handleSaveTransfer} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">الصنف المراد تحويله</label>
                <select
                  value={transferProductId}
                  onChange={e => setTransferProductId(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  {db.products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (رصيد: {p.currentQty})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">من مخزن</label>
                  <select
                    value={fromWhId}
                    onChange={e => setFromWhId(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    {db.warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">إلى مخزن</label>
                  <select
                    value={toWhId}
                    onChange={e => setToWhId(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    {db.warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">الكمية المحولة</label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={transferQty}
                  onChange={e => setTransferQty(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowTransferModal(false)} className="px-3 py-1.5 bg-slate-100 rounded text-xs">إلغاء</button>
                <button type="submit" className="px-4 py-1.5 bg-black text-white rounded text-xs font-bold">تنفيذ التحويل</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjustment Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl w-full max-w-md p-4 space-y-3">
            <h2 className="text-sm font-black text-slate-900">تسوية جردية لمطابقة الرصيد الفعلي</h2>
            <form onSubmit={handleSaveAdjustment} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">الصنف</label>
                <select
                  value={adjustProductId}
                  onChange={e => {
                    setAdjustProductId(e.target.value);
                    const prod = db.products.find(p => p.id === e.target.value);
                    if (prod) setActualQty(prod.currentQty);
                  }}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  {db.products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (دفتري: {p.currentQty} {p.unit})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">الرصيد الفعلي بعد الجرد</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={actualQty}
                  onChange={e => setActualQty(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-black"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">سبب التسوية</label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAdjustModal(false)} className="px-3 py-1.5 bg-slate-100 rounded text-xs">إلغاء</button>
                <button type="submit" className="px-4 py-1.5 bg-black text-white rounded text-xs font-bold">تسوية وإصدار قيد</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Universal Print Modal for Inventory & Products */}
      <UniversalPrintModal
        isOpen={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        documentTitle={printDocTitle}
        documents={printDocuments}
        settings={db.settings}
      />
    </div>
  );
};
