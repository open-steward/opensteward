import type { Transaction } from '../../../schema/transaction'

export interface PeakAccountTransaction {
  id: string | number
  date: string
  description: string
  amount: number
  currency: string
  accountId: string | number
  [key: string]: unknown
}

export function transformTransaction(raw: PeakAccountTransaction): Transaction {
  return {
    id: String(raw.id),
    accountId: raw.accountId ? String(raw.accountId) : undefined,
    memo: raw.description || undefined,
    totalAmount: raw.amount,
    currency: raw.currency || undefined,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
