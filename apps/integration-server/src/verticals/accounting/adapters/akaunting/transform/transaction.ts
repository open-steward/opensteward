import type { Transaction } from '../../../schema/transaction'

export interface AkauntingTransaction {
  id: number
  account_id: number
  paid_at: string
  amount: number
  currency_code: string
  type: string
  category_id: number
  reference: string
  description: string
  [key: string]: unknown
}

export function transformTransaction(raw: AkauntingTransaction): Transaction {
  return {
    id: String(raw.id),
    accountId: raw.account_id ? String(raw.account_id) : undefined,
    type: raw.type || undefined,
    reference: raw.reference || undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.amount,
    createdAt: raw.paid_at ? new Date(raw.paid_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
