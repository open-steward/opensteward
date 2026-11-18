/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice';
import type { Lineitem } from '../../../schema/shared';

export interface WisomeinbueroInvoiceItem {
  id?: string | number;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  totalAmount?: number;
  vatAmount?: number;
  [key: string]: unknown;
}

export interface WisomeinbueroInvoice {
  id: string | number;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  netAmount?: number;
  vatAmount?: number;
  grossAmount?: number;
  openAmount?: number;
  status?: string;
  currencyCode?: string;
  customerId?: string | number;
  items?: WisomeinbueroInvoiceItem[];
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

export function transformInvoice(raw: WisomeinbueroInvoice): Invoice {
  const lineItems: Lineitem[] = (raw.items ?? []).map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitAmount: item.unitPrice,
    taxAmount: item.vatAmount,
    totalAmount: item.totalAmount,
    metadata: item as Record<string, unknown>,
  }));

  return {
    id: String(raw.id),
    type: 'INVOICE' as const,
    invoiceNumber: raw.invoiceNumber,
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    totalAmount: raw.grossAmount,
    taxAmount: raw.vatAmount,
    balanceAmount: raw.openAmount,
    status: toInvoiceStatus(raw.status),
    currency: raw.currencyCode,
    contactId: raw.customerId !== undefined ? String(raw.customerId) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type WisoInvoice = WisomeinbueroInvoice
