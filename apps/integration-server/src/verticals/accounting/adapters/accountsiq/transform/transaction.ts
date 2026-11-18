import type { Transaction } from '../../../schema/transaction'

export interface AccountsIQTransaction {
  transactionId: string | number
  entityId: string | number
  transactionDate: string
  description: string
  totalAmount: number
  currency: string
  [key: string]: unknown
}

export function transformTransaction(raw: AccountsIQTransaction): Transaction {
  return {
    id: String(raw.transactionId),
    memo: raw.description || undefined,
    totalAmount: raw.totalAmount,
    currency: raw.currency || undefined,
    createdAt: raw.transactionDate ? new Date(raw.transactionDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
