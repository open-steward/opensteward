import type { Transaction } from '../../../schema/transaction'

export interface LucaTransaction {
  id: string
  date?: string
  description?: string
  amount?: number
  currency?: string
  account_no?: string
  [key: string]: unknown
}

export function transformTransaction(raw: LucaTransaction): Transaction {
  return {
    id: raw.id,
    accountId: raw.account_no || undefined,
    memo: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
