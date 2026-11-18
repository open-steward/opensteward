import type { Transaction } from '../../../schema/transaction';

export interface AccountableTransaction {
  id: string | number;
  date?: string;
  amount?: number;
  description?: string;
  type?: string;
  clientId?: string | number;
  clientName?: string;
  [key: string]: unknown;
}

export function transformTransaction(raw: AccountableTransaction): Transaction {
  return {
    id: String(raw.id),
    memo: raw.description,
    totalAmount: raw.amount,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    contacts: raw.clientId !== undefined
      ? [{ id: String(raw.clientId), name: raw.clientName }]
      : undefined,
    metadata: raw as Record<string, unknown>,
  };
}
