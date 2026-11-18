import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo';
import type { Lineitem } from '../../../schema/shared';

export interface InvoiceportalCreditMemoItem {
  description?: string;
  quantity?: number;
  unit_price?: number;
  tax_amount?: number;
  total_amount?: number;
  [key: string]: unknown;
}

export interface InvoiceportalCreditMemo {
  id: string | number;
  credit_number?: string;
  date?: string;
  total_amount?: number;
  tax_amount?: number;
  open_amount?: number;
  status?: string;
  recipient_id?: string | number;
  items?: InvoiceportalCreditMemoItem[];
  [key: string]: unknown;
}

function toCreditMemoStatus(status: string | undefined): CreditMemoStatus {
  switch (status) {
    case 'draft': return 'DRAFT';
    case 'sent': return 'AUTHORIZED';
    case 'paid': return 'PAID';
    case 'cancelled': return 'VOIDED';
    default: return 'DRAFT';
  }
}

export function transformCreditMemo(raw: InvoiceportalCreditMemo): CreditMemo {
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
    creditmemoNumber: raw.credit_number,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.open_amount,
    status: toCreditMemoStatus(raw.status),
    contactId: raw.recipient_id !== undefined ? String(raw.recipient_id) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type InvoicePortalCreditMemo = InvoiceportalCreditMemo
