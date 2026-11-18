import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo';
import type { Lineitem } from '../../../schema/shared';

export interface BuchhaltungsbutzeCreditMemoItem {
  description?: string;
  quantity?: number;
  unit_price?: number;
  tax?: number;
  gross?: number;
  [key: string]: unknown;
}

export interface BuchhaltungsbutzeCreditMemo {
  id: string | number;
  credit_no?: string;
  date?: string;
  total?: number;
  tax?: number;
  outstanding?: number;
  status?: string;
  customer_id?: string | number;
  items?: BuchhaltungsbutzeCreditMemoItem[];
  [key: string]: unknown;
}

function toCreditMemoStatus(status: string | undefined): CreditMemoStatus {
  switch (status) {
    case 'draft': return 'DRAFT';
    case 'open': return 'AUTHORIZED';
    case 'paid': return 'PAID';
    case 'cancelled': return 'VOIDED';
    default: return 'DRAFT';
  }
}

export function transformCreditMemo(raw: BuchhaltungsbutzeCreditMemo): CreditMemo {
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
    creditmemoNumber: raw.credit_no,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax,
    balanceAmount: raw.outstanding,
    status: toCreditMemoStatus(raw.status),
    contactId: raw.customer_id !== undefined ? String(raw.customer_id) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type BuchhaltungsButzeCreditMemo = BuchhaltungsbutzeCreditMemo
