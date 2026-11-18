import type { Transaction } from '../../../schema/transaction'

export interface BillingoTransaction {
  id: string | number
  date?: string
  amount?: number
  currency?: string
  description?: string
  type?: string
  [key: string]: unknown
}

export function transformTransaction(raw: BillingoTransaction): Transaction {
  return {
    id: String(raw.id),
    totalAmount: raw.amount,
    currency: raw.currency || undefined,
    memo: raw.description || undefined,
    type: raw.type?.toUpperCase() === 'CREDIT' ? 'CREDIT' : 'DEBIT',
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
