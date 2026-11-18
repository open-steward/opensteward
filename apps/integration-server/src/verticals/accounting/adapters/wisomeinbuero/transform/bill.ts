/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Bill, BillStatus } from '../../../schema/bill';
import type { Lineitem } from '../../../schema/shared';

export interface WisomeinbueroBillItem {
  id?: string | number;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  totalAmount?: number;
  vatAmount?: number;
  [key: string]: unknown;
}

export interface WisomeinbueroBill {
  id: string | number;
  billNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  netAmount?: number;
  vatAmount?: number;
  grossAmount?: number;
  openAmount?: number;
  status?: string;
  currencyCode?: string;
  supplierId?: string | number;
  items?: WisomeinbueroBillItem[];
  [key: string]: unknown;
}

function toBillStatus(status: string | undefined): BillStatus {
  switch (status) {
    case 'DRAFT': return 'DRAFT';
    case 'SENT': return 'AUTHORIZED';
    case 'PAID': return 'PAID';
    case 'CANCELLED': return 'VOIDED';
    default: return 'DRAFT';
  }
}

export function transformBill(raw: WisomeinbueroBill): Bill {
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
    billNumber: raw.billNumber,
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    totalAmount: raw.grossAmount,
    taxAmount: raw.vatAmount,
    balanceAmount: raw.openAmount,
    status: toBillStatus(raw.status),
    currency: raw.currencyCode,
    contactId: raw.supplierId !== undefined ? String(raw.supplierId) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type WisoBill = WisomeinbueroBill
