import type { Transaction } from '../../../schema/transaction'

export interface AccurateTransaction {
  id: number
  date: string
  description: string | null
  amount: number
  currencyCode: string | null
  [key: string]: unknown
}

export function transformTransaction(raw: AccurateTransaction): Transaction {
  return {
    id: String(raw.id),
    memo: raw.description || undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.amount,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
