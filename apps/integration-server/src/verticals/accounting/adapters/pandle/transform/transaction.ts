import type { Transaction } from '../../../schema/transaction'

export interface PandleTransaction {
  id: number
  date: string
  amount: number
  transaction_type: string
  account_id: number
  currency: string
  description: string
  reference: string
  [key: string]: unknown
}

export function transformTransaction(raw: PandleTransaction): Transaction {
  return {
    id: String(raw.id),
    accountId: raw.account_id ? String(raw.account_id) : undefined,
    type: raw.transaction_type || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    reference: raw.description || undefined,
    memo: raw.reference || undefined,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
