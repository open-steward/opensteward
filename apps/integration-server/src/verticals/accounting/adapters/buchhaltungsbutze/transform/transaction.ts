import type { Transaction } from '../../../schema/transaction';

export interface BuchhaltungsbutzeTransaction {
  id: string | number;
  date?: string;
  amount?: number;
  description?: string;
  reference?: string;
  account_id?: string | number;
  contact_id?: string | number;
  contact_name?: string;
  [key: string]: unknown;
}

export function transformTransaction(raw: BuchhaltungsbutzeTransaction): Transaction {
  return {
    id: String(raw.id),
    memo: raw.description,
    totalAmount: raw.amount,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    accountId: raw.account_id !== undefined ? String(raw.account_id) : undefined,
    contacts: raw.contact_id !== undefined
      ? [{ id: String(raw.contact_id), name: raw.contact_name }]
      : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type BuchhaltungsButzeTransaction = BuchhaltungsbutzeTransaction
