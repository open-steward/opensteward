import type { Transaction } from '../../../schema/transaction'

export interface FakturoidTransaction {
  id: number
  account_id: number
  date: string
  amount: number
  currency: string
  type: string
  description: string
  [key: string]: unknown
}

export function transformTransaction(raw: FakturoidTransaction): Transaction {
  return {
    id: String(raw.id),
    accountId: raw.account_id ? String(raw.account_id) : undefined,
    type: raw.type || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
