import type { Transaction } from '../../../schema/transaction';

export interface PaperlessngxTransaction {
  id: string | number;
  title: string;
  created: string;
  [key: string]: unknown;
}

export function transformTransaction(raw: PaperlessngxTransaction): Transaction {
  return {
    id: String(raw.id),
    memo: raw.title,
    totalAmount: 0,
    createdAt: raw.created ? new Date(raw.created) : undefined,
    metadata: raw as Record<string, unknown>,
  };
}
