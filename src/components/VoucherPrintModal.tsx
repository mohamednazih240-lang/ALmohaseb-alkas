import React from 'react';
import {
  Voucher,
  AppSettings
} from '../types/accounting';
import {
  UniversalPrintModal,
  MovementPrintBlock,
  formatCleanNumber
} from './UniversalPrintModal';

interface VoucherPrintModalProps {
  voucher: Voucher | null;
  settings: AppSettings;
  onClose: () => void;
}

export const VoucherPrintModal: React.FC<VoucherPrintModalProps> = ({
  voucher,
  settings,
  onClose
}) => {
  if (!voucher) return null;

  const isReceipt = voucher.type === 'receipt';
  const voucherTitle = isReceipt ? 'سند قبض نقدية وشيكات' : 'سند صرف نقدية وشيكات';
  const partyLabel = isReceipt ? 'استلمنا من السيد / السادة:' : 'اصرفوا إلى السيد / السادة:';

  const docBlock: MovementPrintBlock = {
    title: voucherTitle,
    serialNo: voucher.number,
    date: voucher.date,
    time: '12:00',
    partyLabel,
    partyName: voucher.partyName || 'طرف نقدي عام',
    partySubId: `طريقة السداد: ${voucher.paymentMethod}`,
    badge: voucher.paymentMethod,
    typeTitle: voucherTitle,
    tableHeaders: [
      { label: 'البيان / تفاصيل السند', width: '60%', align: 'right' },
      { label: 'طريقة الدفع', width: '20%', align: 'center' },
      { label: 'المبلغ المسدد', width: '20%', align: 'center' }
    ],
    tableRows: [
      {
        cols: [
          voucher.description || (isReceipt ? 'دفعة نقدية تحت الحساب' : 'مصروفات / دفعة نقدية'),
          voucher.paymentMethod,
          `${formatCleanNumber(voucher.amount)} ${voucher.currencyCode || settings.currency}`
        ],
        isBold: true
      }
    ],
    summaryLines: [
      {
        label: 'صافي قيمة السند الإجمالية',
        value: `${formatCleanNumber(voucher.amount)} ${voucher.currencyCode || settings.currency}`,
        isTotal: true
      }
    ],
    footerNotes: settings.notes || 'سند رسمي معتمد وموثق بالسجلات المالية.',
    createdBy: settings.company || 'المسؤول المالي'
  };

  return (
    <UniversalPrintModal
      isOpen={!!voucher}
      onClose={onClose}
      documentTitle={`${voucherTitle}_${voucher.number}`}
      documents={[docBlock]}
      settings={settings}
      defaultPaperSize="A5"
    />
  );
};
