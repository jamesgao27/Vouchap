/**
 * 四张主表（Expenses/Incomes/Inbound/Outbound）的表格列配置。
 * 表头文案：支出 Payee / 收入 Payer / 入库 Sender / 出库 Receiver。
 */
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DataTableColumn } from './DataTable';
import type { Receipt, Invoice, Inbound, Outbound } from '@/types';
import type { ReceiptStatus } from '@/types';
import type { VoucherStatus } from '@/types';

const getCurrencySymbol = (currency?: string): string => {
  const symbols: Record<string, string> = {
    USD: '$', CAD: 'C$', CNY: '¥', JPY: '¥', EUR: '€', GBP: '£', AUD: 'A$',
    HKD: 'HK$', TWD: 'NT$', KRW: '₩', SGD: 'S$', MXN: 'MX$', INR: '₹',
    THB: '฿', VND: '₫', PHP: '₱', MYR: 'RM', IDR: 'Rp',
  };
  return symbols[currency || 'USD'] || (currency ? `${currency} ` : '$');
};

/** 支出金额色（紫）、收入金额色（橙红），与移动端列表一致 */
export const AMOUNT_COLOR_EXPENSE = '#6C5CE7';
export const AMOUNT_COLOR_INCOME = '#D35400';

/** 金额：币种符号弱化、数字突出；amountColor 与移动端一致：支出紫、收入橙红 */
function AmountCell({ amount, currency, amountColor = AMOUNT_COLOR_EXPENSE }: { amount: number; currency?: string; amountColor?: string }) {
  const symbol = getCurrencySymbol(currency);
  return (
    <Text style={{ fontSize: 14 }}>
      <Text style={{ color: '#A0A0A0', fontSize: 12 }}>{symbol}</Text>
      <Text style={{ fontWeight: '600', color: amountColor }}>{amount.toFixed(2)}</Text>
    </Text>
  );
}

/** 状态：底色标签样式，宽度随文字自适应（不占满单元格） */
function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignSelf: 'flex-start' }}>
      <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: color }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: '#fff' }} numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
}

/** 提交方式：四类 icon（camera/voice/text/attachment）。图片与拍照统一用 camera icon；attachment 仅 document 用 📎，尾随文案 Image/Doc */
function InputTypeCell({ type }: { type?: import('@/types').InputType }) {
  const row = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 };
  const textStyle = { fontSize: 13, color: '#636E72' };
  if (type === 'audio') return <View style={row}><Ionicons name="mic" size={16} color="#636E72" /><Text style={textStyle}>Voice</Text></View>;
  if (type === 'text') return <View style={row}><Ionicons name="document-text" size={16} color="#636E72" /><Text style={textStyle}>Text</Text></View>;
  if (type === 'camera') return <View style={row}><Ionicons name="camera" size={16} color="#636E72" /><Text style={textStyle}>Camera</Text></View>;
  if (type === 'document') return <View style={row}><Ionicons name="attach" size={16} color="#636E72" /><Text style={textStyle}>Doc</Text></View>;
  // image 或未设置（含旧数据）：统一用相机 icon + Image
  return <View style={row}><Ionicons name="camera" size={16} color="#636E72" /><Text style={textStyle}>Image</Text></View>;
}

export interface ReceiptColumnOptions {
  formatDate: (dateString: string) => string;
  formatTimeAgo: (dateString: string) => string;
  statusLabels: Record<ReceiptStatus, string>;
  statusColors: Record<ReceiptStatus, string>;
}

/** 支出单：关联方列表头为 Payee */
export function getReceiptColumns(opts: ReceiptColumnOptions): DataTableColumn<Receipt>[] {
  const { formatDate, formatTimeAgo, statusLabels, statusColors } = opts;
  return [
    { id: 'supplier', label: 'Payee', minWidth: 140, getValue: r => <Text style={{ fontSize: 14 }} numberOfLines={1}>{r.entity?.name || r.supplierName || '—'}</Text>, getSortValue: r => (r.entity?.name || r.supplierName || '').toLowerCase() },
    { id: 'amount', label: 'Amount', minWidth: 100, getValue: r => <AmountCell amount={r.totalAmount} currency={r.currency} amountColor={AMOUNT_COLOR_EXPENSE} />, getSortValue: r => r.totalAmount ?? -Infinity },
    { id: 'account', label: 'Account', minWidth: 100, getValue: r => <Text style={{ fontSize: 14 }}>{r.account?.name || '—'}</Text>, getSortValue: r => (r.account?.name || '').toLowerCase() },
    { id: 'date', label: 'Date', minWidth: 100, getValue: r => <Text style={{ fontSize: 14 }}>{formatDate(r.date)}</Text>, getSortValue: r => r.date || '' },
    { id: 'status', label: 'Status', minWidth: 100, getValue: r => <StatusBadge label={statusLabels[r.status]} color={statusColors[r.status]} />, getSortValue: r => statusLabels[r.status] || '' },
    { id: 'createdBy', label: 'Recorder', minWidth: 90, getValue: r => <Text style={{ fontSize: 14 }} numberOfLines={1}>{r.createdByUser?.name || r.createdByUser?.email?.split('@')[0] || '—'}</Text>, getSortValue: r => (r.createdByUser?.name || r.createdByUser?.email?.split('@')[0] || '').toLowerCase() },
    { id: 'inputType', label: 'Camera', minWidth: 72, getValue: r => <InputTypeCell type={r.inputType} />, getSortValue: r => r.inputType || '' },
    { id: 'createdAt', label: 'Record date', minWidth: 100, getValue: r => <Text style={{ fontSize: 14, color: '#636E72' }}>{r.createdAt ? formatTimeAgo(r.createdAt) : formatDate(r.date)}</Text>, getSortValue: r => r.createdAt || r.date || '' },
  ];
}

export interface InvoiceColumnOptions {
  formatDate: (dateString: string) => string;
  formatTimeAgo: (dateString: string) => string;
  statusLabels: Record<VoucherStatus, string>;
  statusColors: Record<VoucherStatus, string>;
}

/** 收入单：关联方列表头为 Payer */
export function getInvoiceColumns(opts: InvoiceColumnOptions): DataTableColumn<Invoice>[] {
  const { formatDate, formatTimeAgo, statusLabels, statusColors } = opts;
  return [
    { id: 'customer', label: 'Payer', minWidth: 140, getValue: r => <Text style={{ fontSize: 14 }} numberOfLines={1}>{r.entity?.name || r.customerName || '—'}</Text>, getSortValue: r => (r.entity?.name || r.customerName || '').toLowerCase() },
    { id: 'amount', label: 'Amount', minWidth: 100, getValue: r => <AmountCell amount={r.totalAmount} currency={r.currency} amountColor={AMOUNT_COLOR_INCOME} />, getSortValue: r => r.totalAmount ?? -Infinity },
    { id: 'account', label: 'Account', minWidth: 100, getValue: r => <Text style={{ fontSize: 14 }}>{r.account?.name || '—'}</Text>, getSortValue: r => (r.account?.name || '').toLowerCase() },
    { id: 'date', label: 'Date', minWidth: 100, getValue: r => <Text style={{ fontSize: 14 }}>{formatDate(r.date)}</Text>, getSortValue: r => r.date || '' },
    { id: 'status', label: 'Status', minWidth: 100, getValue: r => <StatusBadge label={statusLabels[r.status]} color={statusColors[r.status]} />, getSortValue: r => statusLabels[r.status] || '' },
    { id: 'createdBy', label: 'Recorder', minWidth: 90, getValue: r => <Text style={{ fontSize: 14 }} numberOfLines={1}>{r.createdByUser?.name || r.createdByUser?.email?.split('@')[0] || '—'}</Text>, getSortValue: r => (r.createdByUser?.name || r.createdByUser?.email?.split('@')[0] || '').toLowerCase() },
    { id: 'inputType', label: 'Camera', minWidth: 72, getValue: r => <InputTypeCell type={r.inputType} />, getSortValue: r => r.inputType || '' },
    { id: 'createdAt', label: 'Record date', minWidth: 100, getValue: r => <Text style={{ fontSize: 14, color: '#636E72' }}>{r.createdAt ? formatTimeAgo(r.createdAt) : formatDate(r.date)}</Text>, getSortValue: r => r.createdAt || r.date || '' },
  ];
}

export interface InboundColumnOptions {
  formatDate: (dateString: string) => string;
  formatTimeAgo: (dateString: string) => string;
  statusLabels: Record<VoucherStatus, string>;
  statusColors: Record<VoucherStatus, string>;
}

/** 入库单：关联方列表头为 Sender */
export function getInboundColumns(opts: InboundColumnOptions): DataTableColumn<Inbound>[] {
  const { formatDate, formatTimeAgo, statusLabels, statusColors } = opts;
  return [
    { id: 'supplier', label: 'Sender', minWidth: 120, getValue: r => <Text style={{ fontSize: 14 }} numberOfLines={1}>{r.entity?.name || r.supplierName || '—'}</Text>, getSortValue: r => (r.entity?.name || r.supplierName || '').toLowerCase() },
    { id: 'amount', label: 'Amount', minWidth: 100, getValue: r => (
      r.totalAmount != null
        ? <AmountCell amount={Number(r.totalAmount)} currency={r.currency} />
        : <Text style={{ fontSize: 14, color: '#95A5A6' }}>—</Text>
    ), getSortValue: r => r.totalAmount != null ? Number(r.totalAmount) : -Infinity },
    { id: 'date', label: 'Date', minWidth: 100, getValue: r => <Text style={{ fontSize: 14 }}>{formatDate(r.date)}</Text>, getSortValue: r => r.date || '' },
    { id: 'status', label: 'Status', minWidth: 100, getValue: r => <StatusBadge label={statusLabels[r.status]} color={statusColors[r.status]} />, getSortValue: r => statusLabels[r.status] || '' },
    { id: 'createdBy', label: 'Recorder', minWidth: 90, getValue: r => <Text style={{ fontSize: 14 }} numberOfLines={1}>{(r as any).createdByUser?.name ?? (r as any).createdByUser?.email?.split('@')[0] ?? (r.createdBy ? '…' : '—')}</Text>, getSortValue: r => ((r as any).createdByUser?.name ?? (r as any).createdByUser?.email?.split('@')[0] ?? '').toLowerCase() },
    { id: 'createdAt', label: 'Record date', minWidth: 100, getValue: r => <Text style={{ fontSize: 14, color: '#636E72' }}>{r.createdAt ? formatTimeAgo(r.createdAt) : formatDate(r.date)}</Text>, getSortValue: r => r.createdAt || r.date || '' },
    { id: 'documentNo', label: 'Doc No', minWidth: 90, getValue: r => <Text style={{ fontSize: 14 }}>{r.documentNo || '—'}</Text>, getSortValue: r => (r.documentNo || '').toLowerCase() },
    { id: 'handler', label: 'Handler', minWidth: 80, getValue: r => <Text style={{ fontSize: 14 }} numberOfLines={1}>{r.handlerName || '—'}</Text>, getSortValue: r => (r.handlerName || '').toLowerCase() },
    { id: 'warehouseKeeper', label: 'Keeper', minWidth: 80, getValue: r => <Text style={{ fontSize: 14 }} numberOfLines={1}>{r.warehouseKeeperName || '—'}</Text>, getSortValue: r => (r.warehouseKeeperName || '').toLowerCase() },
  ];
}

export interface OutboundColumnOptions {
  formatDate: (dateString: string) => string;
  formatTimeAgo: (dateString: string) => string;
  statusLabels: Record<VoucherStatus, string>;
  statusColors: Record<VoucherStatus, string>;
}

/** 出库单：关联方列表头为 Receiver */
export function getOutboundColumns(opts: OutboundColumnOptions): DataTableColumn<Outbound>[] {
  const { formatDate, formatTimeAgo, statusLabels, statusColors } = opts;
  return [
    { id: 'customer', label: 'Receiver', minWidth: 120, getValue: r => <Text style={{ fontSize: 14 }} numberOfLines={1}>{r.entity?.name || r.customerName || '—'}</Text>, getSortValue: r => (r.entity?.name || r.customerName || '').toLowerCase() },
    { id: 'amount', label: 'Amount', minWidth: 100, getValue: r => (
      r.totalAmount != null
        ? <AmountCell amount={Number(r.totalAmount)} currency={r.currency} amountColor={AMOUNT_COLOR_INCOME} />
        : <Text style={{ fontSize: 14, color: '#95A5A6' }}>—</Text>
    ), getSortValue: r => r.totalAmount != null ? Number(r.totalAmount) : -Infinity },
    { id: 'date', label: 'Date', minWidth: 100, getValue: r => <Text style={{ fontSize: 14 }}>{formatDate(r.date)}</Text>, getSortValue: r => r.date || '' },
    { id: 'status', label: 'Status', minWidth: 100, getValue: r => <StatusBadge label={statusLabels[r.status]} color={statusColors[r.status]} />, getSortValue: r => statusLabels[r.status] || '' },
    { id: 'createdBy', label: 'Recorder', minWidth: 90, getValue: r => <Text style={{ fontSize: 14 }} numberOfLines={1}>{(r as any).createdByUser?.name ?? (r as any).createdByUser?.email?.split('@')[0] ?? (r.createdBy ? '…' : '—')}</Text>, getSortValue: r => ((r as any).createdByUser?.name ?? (r as any).createdByUser?.email?.split('@')[0] ?? '').toLowerCase() },
    { id: 'createdAt', label: 'Record date', minWidth: 100, getValue: r => <Text style={{ fontSize: 14, color: '#636E72' }}>{r.createdAt ? formatTimeAgo(r.createdAt) : formatDate(r.date)}</Text>, getSortValue: r => r.createdAt || r.date || '' },
    { id: 'documentNo', label: 'Doc No', minWidth: 90, getValue: r => <Text style={{ fontSize: 14 }}>{r.documentNo || '—'}</Text>, getSortValue: r => (r.documentNo || '').toLowerCase() },
    { id: 'handler', label: 'Handler', minWidth: 80, getValue: r => <Text style={{ fontSize: 14 }} numberOfLines={1}>{r.handlerName || '—'}</Text>, getSortValue: r => (r.handlerName || '').toLowerCase() },
    { id: 'preparer', label: 'Preparer', minWidth: 80, getValue: r => <Text style={{ fontSize: 14 }} numberOfLines={1}>{r.preparerName || '—'}</Text>, getSortValue: r => (r.preparerName || '').toLowerCase() },
  ];
}
