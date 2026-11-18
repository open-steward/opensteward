import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo';

export interface PaperlessngxCreditMemo {
  id: string | number;
  title: string;
  created: string;
  [key: string]: unknown;
}

export function transformCreditMemo(raw: PaperlessngxCreditMemo): CreditMemo {
  const status: CreditMemoStatus = 'DRAFT';

  return {
    id: String(raw.id),
    creditmemoNumber: raw.title,
    postedAt: raw.created ? new Date(raw.created) : undefined,
    totalAmount: 0,
    status,
    metadata: raw as Record<string, unknown>,
  };
}
