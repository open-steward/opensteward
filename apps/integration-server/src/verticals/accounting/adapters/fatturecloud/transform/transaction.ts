import type { Transaction } from '../../../schema/transaction'

export interface FattureCloudTransaction {
  id?: number | string
  date?: string
  amount?: number
  description?: string
  currency?: { id?: string }
  [key: string]: unknown
}

export function transformTransaction(raw: FattureCloudTransaction): Transaction {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    memo: raw.description || undefined,
    totalAmount: raw.amount,
    currency: raw.currency?.id || undefined,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
