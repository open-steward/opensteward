import type { Bill, BillStatus } from '../../../schema/bill';
import type { Lineitem } from '../../../schema/shared';

export interface BuchhaltungsbutzeBillItem {
  description?: string;
  quantity?: number;
  unit_price?: number;
  tax?: number;
  gross?: number;
  [key: string]: unknown;
}

export interface BuchhaltungsbutzeBill {
  id: string | number;
  receipt_no?: string;
  date?: string;
  due_date?: string;
  net?: number;
  tax?: number;
  gross?: number;
  unpaid?: number;
  status?: string;
  currency?: string;
  supplier_id?: string | number;
  items?: BuchhaltungsbutzeBillItem[];
  [key: string]: unknown;
}

function toBillStatus(status: string | undefined): BillStatus {
  switch (status) {
    case 'draft': return 'DRAFT';
    case 'open': return 'AUTHORIZED';
    case 'paid': return 'PAID';
    case 'cancelled': return 'VOIDED';
    default: return 'DRAFT';
  }
}

export function transformBill(raw: BuchhaltungsbutzeBill): Bill {
  const lineItems: Lineitem[] = (raw.items ?? []).map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitAmount: item.unit_price,
    taxAmount: item.tax,
    totalAmount: item.gross,
    metadata: item as Record<string, unknown>,
  }));

  return {
    id: String(raw.id),
    billNumber: raw.receipt_no,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    totalAmount: raw.gross,
    taxAmount: raw.tax,
    balanceAmount: raw.unpaid,
    status: toBillStatus(raw.status),
    currency: raw.currency,
    contactId: raw.supplier_id !== undefined ? String(raw.supplier_id) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type BuchhaltungsButzeBill = BuchhaltungsbutzeBill
