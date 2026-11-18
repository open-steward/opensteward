import type { Transaction } from '../../../schema/transaction'

export interface AppFolioTransaction {
  id: string | number
  date: string
  description: string
  amount: number
  currency: string
  property_id: string | number
  lease_id: string | number
  [key: string]: unknown
}

export function transformTransaction(raw: AppFolioTransaction): Transaction {
  return {
    id: String(raw.id),
    memo: raw.description || undefined,
    totalAmount: raw.amount,
    currency: raw.currency || undefined,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
