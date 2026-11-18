import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo';
import type { Lineitem } from '../../../schema/shared';

export interface FastbillCreditMemoItem {
  DESCRIPTION?: string;
  QUANTITY?: number;
  UNIT_PRICE?: number;
  VAT_VALUE?: number;
  COMPLETE_GROSS?: number;
  [key: string]: unknown;
}

export interface FastbillCreditMemo {
  CREDIT_ID: string | number;
  CREDIT_NUMBER?: string;
  CREDIT_DATE?: string;
  TOTAL?: number;
  VAT_AMOUNT?: number;
  OUTSTANDING?: number;
  STATUS?: string;
  CUSTOMER_ID?: string | number;
  ITEMS?: FastbillCreditMemoItem[];
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

export function transformCreditMemo(raw: FastbillCreditMemo): CreditMemo {
  const lineItems: Lineitem[] = (raw.ITEMS ?? []).map((item) => ({
    description: item.DESCRIPTION,
    quantity: item.QUANTITY,
    unitAmount: item.UNIT_PRICE,
    taxAmount: item.VAT_VALUE,
    totalAmount: item.COMPLETE_GROSS,
    metadata: item as Record<string, unknown>,
  }));

  return {
    id: String(raw.CREDIT_ID),
    creditmemoNumber: raw.CREDIT_NUMBER,
    postedAt: raw.CREDIT_DATE ? new Date(raw.CREDIT_DATE) : undefined,
    totalAmount: raw.TOTAL,
    taxAmount: raw.VAT_AMOUNT,
    balanceAmount: raw.OUTSTANDING,
    status: toCreditMemoStatus(raw.STATUS),
    contactId: raw.CUSTOMER_ID !== undefined ? String(raw.CUSTOMER_ID) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type FastBillCreditMemo = FastbillCreditMemo
