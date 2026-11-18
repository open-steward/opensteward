/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo';
import type { Lineitem } from '../../../schema/shared';

export interface WisomeinbueroCreditMemoItem {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  vatAmount?: number;
  totalAmount?: number;
  [key: string]: unknown;
}

export interface WisomeinbueroCreditMemo {
  id: string | number;
  creditMemoNumber?: string;
  date?: string;
  totalAmount?: number;
  vatAmount?: number;
  openAmount?: number;
  status?: string;
  customerId?: string | number;
  items?: WisomeinbueroCreditMemoItem[];
  [key: string]: unknown;
}

function toCreditMemoStatus(status: string | undefined): CreditMemoStatus {
  switch (status) {
    case 'DRAFT': return 'DRAFT';
    case 'SENT': return 'AUTHORIZED';
    case 'PAID': return 'PAID';
    case 'CANCELLED': return 'VOIDED';
    default: return 'DRAFT';
  }
}

export function transformCreditMemo(raw: WisomeinbueroCreditMemo): CreditMemo {
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
    creditmemoNumber: raw.creditMemoNumber,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.vatAmount,
    balanceAmount: raw.openAmount,
    status: toCreditMemoStatus(raw.status),
    contactId: raw.customerId !== undefined ? String(raw.customerId) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type WisoCreditMemo = WisomeinbueroCreditMemo
