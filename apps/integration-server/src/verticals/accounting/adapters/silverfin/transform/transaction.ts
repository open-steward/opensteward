import type { Transaction } from '../../../schema/transaction'

export interface SilverfinTransaction {
  id: string | number
  period: string
  description: string
  value: number
  currency: string
  [key: string]: unknown
}

export function transformTransaction(raw: SilverfinTransaction): Transaction {
  return {
    id: String(raw.id),
    memo: raw.description || undefined,
    totalAmount: raw.value,
    currency: raw.currency || undefined,
    createdAt: raw.period ? new Date(raw.period) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
