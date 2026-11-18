import type { Transaction } from '../../../schema/transaction'

export interface FatouaPayment {
  id: string
  date?: string
  amount?: number
  currency?: string
  type?: string
  description?: string
  status?: string
  [key: string]: unknown
}

export function transformTransaction(raw: FatouaPayment): Transaction {
  return {
    id: String(raw.id),
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    memo: raw.description || undefined,
    type: raw.type || undefined,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
