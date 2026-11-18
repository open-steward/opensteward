import type { Invoice, InvoiceStatus } from '../../../schema/invoice';
import type { Lineitem } from '../../../schema/shared';

export interface BuchhaltungsbutzeInvoiceItem {
  description?: string;
  quantity?: number;
  unit_price?: number;
  tax?: number;
  gross?: number;
  [key: string]: unknown;
}

export interface BuchhaltungsbutzeInvoice {
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
  customer_id?: string | number;
  items?: BuchhaltungsbutzeInvoiceItem[];
  [key: string]: unknown;
}

function toInvoiceStatus(status: string | undefined): InvoiceStatus {
  switch (status) {
    case 'draft': return 'DRAFT';
    case 'open': return 'AUTHORIZED';
    case 'paid': return 'PAID';
    case 'cancelled': return 'VOIDED';
    default: return 'DRAFT';
  }
}

export function transformInvoice(raw: BuchhaltungsbutzeInvoice): Invoice {
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
    type: 'INVOICE' as const,
    invoiceNumber: raw.receipt_no,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    totalAmount: raw.gross,
    taxAmount: raw.tax,
    balanceAmount: raw.unpaid,
    status: toInvoiceStatus(raw.status),
    currency: raw.currency,
    contactId: raw.customer_id !== undefined ? String(raw.customer_id) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type BuchhaltungsButzeInvoice = BuchhaltungsbutzeInvoice
