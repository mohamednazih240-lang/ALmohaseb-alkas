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

import { tafqeetCurrency } from '../services/tafqeetService';

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
  const voucherTitle = isReceipt ? 'سند قبض مالي' : 'سند صرف مالي';
  const partyLabel = isReceipt ? 'المستلم منه' : 'المستفيد / يصرف إلى';
  const tafqeetWords = tafqeetCurrency(voucher.amount, settings.currency || 'ج.م');

  const docBlock: MovementPrintBlock = {
    title: voucherTitle,
    serialNo: voucher.number,
    date: voucher.date,
    time: '12:00',
    partyLabel,
    partyName: voucher.partyName || 'طرف نقدي عام',
    partySubId: voucher.partyId,
    statement: `البيان: ${voucher.description || (isReceipt ? 'دفعة نقدية تحت الحساب' : 'مصروفات / دفعة نقدية')} — ${tafqeetWords}`,
    badge: voucher.paymentMethod,
    typeTitle: voucherTitle,
    tableHeaders: [
      { label: 'البيان / تفاصيل السند والحركة', width: '50%', align: 'right' },
      { label: 'المبلغ كتابةً (تفقيط)', width: '30%', align: 'center' },
      { label: 'المبلغ رقماً', width: '20%', align: 'center' }
    ],
    tableRows: [
      {
        cols: [
          voucher.description || (isReceipt ? 'دفعة نقدية تحت الحساب' : 'مصروفات / دفعة نقدية'),
          tafqeetWords,
          `${formatCleanNumber(voucher.amount)} ${voucher.currencyCode || settings.currency || 'ج.م'}`
        ],
        isBold: true
      }
    ],
    summaryLines: [
      {
        label: 'طريقة السداد / الخزينة',
        value: voucher.paymentMethod || 'نقدي'
      },
      {
        label: 'المبلغ كتابةً',
        value: tafqeetWords
      },
      {
        label: 'صافي قيمة السند الإجمالية',
        value: `${formatCleanNumber(voucher.amount)} ${voucher.currencyCode || settings.currency || 'ج.م'}`,
        isTotal: true
      }
    ],
    footerNotes: settings.notes || 'البضاعة المباعة ترد وتستبدل خلال 14 يوماً وفقاً للشروط والأحكام',
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
