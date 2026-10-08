import React, { useState } from 'react';
import {
  Barcode,
  Printer,
  Download,
  Search,
  Settings2,
  Check,
  CheckCircle2,
  Package,
  Layers,
  Sparkles,
  Sliders,
  FileSpreadsheet
} from 'lucide-react';
import { AccountingDB, Product } from '../types/accounting';
import { formatMoney } from '../services/accountingStorage';
import { downloadElementAsPdf, generateBarcodePattern } from '../services/printAndPdfService';

interface BarcodePrintingViewProps {
  db: AccountingDB;
  onUpdateDb: (updated: AccountingDB) => void;
}

export const BarcodePrintingView: React.FC<BarcodePrintingViewProps> = ({ db }) => {
  const [selectedProductId, setSelectedProductId] = useState<string>(
    db.products[0]?.id || ''
  );
  const [labelCount, setLabelCount] = useState<number>(12);
  const [labelSize, setLabelSize] = useState<'standard' | 'medium' | 'sheet'>('standard');
  const [showCompany, setShowCompany] = useState(true);
  const [showName, setShowName] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [showCode, setShowCode] = useState(true);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedProduct = db.products.find(p => p.id === selectedProductId) || db.products[0];

  const barcodeText = selectedProduct?.barcode || selectedProduct?.code || '10000001';
  const barcodePattern = generateBarcodePattern(barcodeText);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    setIsExportingPdf(true);
    try {
      await downloadElementAsPdf('barcode-print-canvas', {
        format: labelSize === 'sheet' ? 'a4' : 'barcode',
        filename: `barcodes_${selectedProduct?.code || 'items'}.pdf`
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const filteredProducts = db.products.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.barcode.includes(searchQuery)
  );

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-slate-900 text-white rounded-xl">
              <Barcode className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-black text-slate-900">
              استوديو طباعة باركود الأصناف والملصقات الحرارية
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            توليد وتصميم ملصقات الباركود بمقاسات مختلفة (38×25mm، 50×30mm، وصفحات A4) للطباعة المباشرة والتصدير كـ PDF
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={handleDownloadPdf}
            disabled={isExportingPdf || !selectedProduct}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>تحميل الملصقات PDF</span>
          </button>
          <button
            onClick={handlePrint}
            disabled={!selectedProduct}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة فورية</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Product Selection & Controls */}
        <div className="lg:col-span-1 space-y-4">
          {/* Product Picker */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
            <h3 className="text-xs font-black text-slate-900 flex items-center justify-between">
              <span>اختر الصنف المراد طباعة باركوده</span>
              <span className="text-[10px] text-slate-500 font-mono">{db.products.length} صنف</span>
            </h3>

            <div className="relative">
              <input
                type="text"
                placeholder="بحث باسم الصنف أو الكود..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            </div>

            <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
              {filteredProducts.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  لا توجد أصناف مطابقة. أضف أصنافاً أولاً من دليل الأصناف.
                </div>
              ) : (
                filteredProducts.map(p => (
                  <div
                    key={p.id}
                    onClick={() => setSelectedProductId(p.id)}
                    className={`p-2.5 rounded-xl border cursor-pointer text-xs transition-all ${
                      p.id === selectedProductId
                        ? 'border-slate-900 bg-slate-50 font-black'
                        : 'border-slate-100 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="truncate">{p.name}</span>
                      <span className="font-mono text-[10px] text-slate-500 font-normal">{p.code}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 flex justify-between">
                      <span>الباركود: <strong className="font-mono">{p.barcode || p.code}</strong></span>
                      <span className="font-bold text-slate-900">{formatMoney(p.sellPrice, db.settings.currency)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Label Printing Options */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" />
              <span>إعدادات وتخصيص الملصق</span>
            </h3>

            {/* Label Size */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">مقاس ونوع الملصق:</label>
              <div className="grid grid-cols-3 gap-1.5 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setLabelSize('standard')}
                  className={`p-2 rounded-xl border text-center transition-all ${
                    labelSize === 'standard' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  38 × 25 مم
                  <span className="block text-[9px] font-normal opacity-70">عادي</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLabelSize('medium')}
                  className={`p-2 rounded-xl border text-center transition-all ${
                    labelSize === 'medium' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  50 × 30 مم
                  <span className="block text-[9px] font-normal opacity-70">متوسط</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLabelSize('sheet')}
                  className={`p-2 rounded-xl border text-center transition-all ${
                    labelSize === 'sheet' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  ورقة A4
                  <span className="block text-[9px] font-normal opacity-70">شبكة 30 ملصق</span>
                </button>
              </div>
            </div>

            {/* Number of Labels */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">عدد الملصقات المطلوب طباعتها:</label>
              <input
                type="number"
                min="1"
                max="120"
                value={labelCount}
                onChange={e => setLabelCount(Math.max(1, Number(e.target.value)))}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            {/* Content Toggles */}
            <div className="space-y-2 pt-1 border-t border-slate-100 text-xs font-bold text-slate-700">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCompany}
                  onChange={e => setShowCompany(e.target.checked)}
                  className="rounded border-slate-300 text-slate-900"
                />
                <span>اسم المنشأة ({db.settings.company})</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showName}
                  onChange={e => setShowName(e.target.checked)}
                  className="rounded border-slate-300 text-slate-900"
                />
                <span>اسم الصنف</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPrice}
                  onChange={e => setShowPrice(e.target.checked)}
                  className="rounded border-slate-300 text-slate-900"
                />
                <span>سعر البيع للجمهور</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCode}
                  onChange={e => setShowCode(e.target.checked)}
                  className="rounded border-slate-300 text-slate-900"
                />
                <span>أرقام الباركود / الكود</span>
              </label>
            </div>
          </div>
        </div>

        {/* Right 2 Columns: Barcode Live Preview & Print Grid */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 text-xs">
              <div className="flex items-center gap-2">
                <Barcode className="w-4 h-4 text-slate-900" />
                <span className="font-black text-slate-900">
                  معاينة ملصقات الباركود قبل الطباعة ({labelCount} ملصق)
                </span>
              </div>
              <span className="text-slate-500 font-mono text-[11px]">
                {labelSize === 'standard' ? '38mm x 25mm' : labelSize === 'medium' ? '50mm x 30mm' : 'A4 Grid'}
              </span>
            </div>

            {selectedProduct ? (
              <div
                id="barcode-print-canvas"
                className={`p-4 bg-white border border-slate-200 rounded-xl max-h-[600px] overflow-y-auto ${
                  labelSize === 'sheet'
                    ? 'grid grid-cols-3 gap-3'
                    : 'flex flex-wrap gap-3 justify-center'
                }`}
              >
                {Array.from({ length: labelCount }).map((_, index) => (
                  <div
                    key={index}
                    className={`border border-black bg-white flex flex-col justify-between items-center text-center p-2 rounded print-card ${
                      labelSize === 'standard'
                        ? 'w-[145px] h-[95px]'
                        : labelSize === 'medium'
                        ? 'w-[190px] h-[115px]'
                        : 'w-full h-[105px]'
                    }`}
                  >
                    {/* Company name */}
                    {showCompany && (
                      <div className="text-[9px] font-black tracking-tight truncate w-full text-black">
                        {db.settings.company}
                      </div>
                    )}

                    {/* Product Name */}
                    {showName && (
                      <div className="text-[10px] font-bold truncate w-full text-black">
                        {selectedProduct.name}
                      </div>
                    )}

                    {/* Vector Barcode SVG Bars */}
                    <div className="flex items-center h-8 gap-[1px] my-0.5">
                      {barcodePattern.map((bar, i) => (
                        <span
                          key={i}
                          className={`inline-block h-full ${bar ? 'w-[1.5px] bg-black' : 'w-[1px] bg-transparent'}`}
                        />
                      ))}
                    </div>

                    {/* Code & Price */}
                    <div className="flex justify-between items-center w-full px-1 text-[9px] font-mono font-bold text-black border-t border-black/40 pt-0.5">
                      {showCode && <span>{barcodeText}</span>}
                      {showPrice && (
                        <span className="font-black text-[10px]">
                          {formatMoney(selectedProduct.sellPrice, db.settings.currency)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center text-slate-400 text-xs">
                لا توجد أصناف في النظام حالياً لعرض الباركود. أضف صنفاً جديداً للبدء.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
