import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo';
import type { Lineitem } from '../../../schema/shared';

export interface AccountableCreditMemoItem {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  vatAmount?: number;
  totalPrice?: number;
  [key: string]: unknown;
}

export interface AccountableCreditMemo {
  id: string | number;
  creditNoteNumber?: string;
  issueDate?: string;
  totalAmount?: number;
  vatAmount?: number;
  remainingAmount?: number;
  status?: string;
  clientId?: string | number;
  items?: AccountableCreditMemoItem[];
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

export function transformCreditMemo(raw: AccountableCreditMemo): CreditMemo {
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
    creditmemoNumber: raw.creditNoteNumber,
    postedAt: raw.issueDate ? new Date(raw.issueDate) : undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.vatAmount,
    balanceAmount: raw.remainingAmount,
    status: toCreditMemoStatus(raw.status),
    contactId: raw.clientId !== undefined ? String(raw.clientId) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}
