import type { Invoice, InvoiceStatus } from '../../../schema/invoice';
import type { Lineitem } from '../../../schema/shared';

export interface InvoiceportalInvoiceItem {
  description?: string;
  quantity?: number;
  unit_price?: number;
  tax_amount?: number;
  total_amount?: number;
  [key: string]: unknown;
}

export interface InvoiceportalInvoice {
  id: string | number;
  invoice_number?: string;
  invoice_date?: string;
  due_date?: string;
  amount_net?: number;
  amount_tax?: number;
  amount_gross?: number;
  amount_open?: number;
  status?: string;
  currency_code?: string;
  recipient_id?: string | number;
  items?: InvoiceportalInvoiceItem[];
  [key: string]: unknown;
}

function toInvoiceStatus(status: string | undefined): InvoiceStatus {
  switch (status) {
    case 'draft': return 'DRAFT';
    case 'sent': return 'AUTHORIZED';
    case 'paid': return 'PAID';
    case 'cancelled': return 'VOIDED';
    default: return 'DRAFT';
  }
}

export function transformInvoice(raw: InvoiceportalInvoice): Invoice {
  const lineItems: Lineitem[] = (raw.items ?? []).map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitAmount: item.unit_price,
    taxAmount: item.tax_amount,
    totalAmount: item.total_amount,
    metadata: item as Record<string, unknown>,
  }));

  return {
    id: String(raw.id),
    type: 'INVOICE' as const,
    invoiceNumber: raw.invoice_number,
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    totalAmount: raw.amount_gross,
    taxAmount: raw.amount_tax,
    balanceAmount: raw.amount_open,
    status: toInvoiceStatus(raw.status),
    currency: raw.currency_code,
    contactId: raw.recipient_id !== undefined ? String(raw.recipient_id) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type InvoicePortalInvoice = InvoiceportalInvoice
