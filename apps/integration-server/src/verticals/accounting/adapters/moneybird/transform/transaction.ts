import type { Transaction } from '../../../schema/transaction'

export interface MoneybirdTransaction {
  id?: number | string
  date?: string
  amount?: string | number
  message?: string
  financial_account_id?: number | string
  [key: string]: unknown
}

export function transformTransaction(raw: MoneybirdTransaction): Transaction {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    accountId: raw.financial_account_id !== undefined ? String(raw.financial_account_id) : undefined,
    memo: raw.message || undefined,
    totalAmount: raw.amount !== undefined ? Number(raw.amount) : undefined,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
