import type { Invoice, InvoiceStatus } from '../../../schema/invoice';
import type { Lineitem } from '../../../schema/shared';

export interface AccountableInvoiceItem {
  id?: string | number;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  vatAmount?: number;
  [key: string]: unknown;
}

export interface AccountableInvoice {
  id: string | number;
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  netAmount?: number;
  vatAmount?: number;
  totalAmount?: number;
  remainingAmount?: number;
  status?: string;
  currency?: string;
  clientId?: string | number;
  items?: AccountableInvoiceItem[];
  [key: string]: unknown;
}

function toInvoiceStatus(status: string | undefined): InvoiceStatus {
  switch (status) {
    case 'DRAFT': return 'DRAFT';
    case 'SENT': return 'AUTHORIZED';
    case 'PAID': return 'PAID';
    case 'CANCELLED': return 'VOIDED';
    default: return 'DRAFT';
  }
}

export function transformInvoice(raw: AccountableInvoice): Invoice {
  const lineItems: Lineitem[] = (raw.items ?? []).map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitAmount: item.unitPrice,
    taxAmount: item.vatAmount,
    totalAmount: item.totalPrice,
    metadata: item as Record<string, unknown>,
  }));

  return {
    id: String(raw.id),
    type: 'INVOICE' as const,
    invoiceNumber: raw.invoiceNumber,
    postedAt: raw.issueDate ? new Date(raw.issueDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.vatAmount,
    balanceAmount: raw.remainingAmount,
    status: toInvoiceStatus(raw.status),
    currency: raw.currency,
    contactId: raw.clientId !== undefined ? String(raw.clientId) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}
