import type { Transaction } from '../../../schema/transaction'

export interface BlacklineTransaction {
  transactionId: string
  description: string
  amount: number
  currency: string
  transactionDate: string
  accountId: string
  createdAt: string
  modifiedAt: string
  [key: string]: unknown
}

export function transformTransaction(raw: BlacklineTransaction): Transaction {
  return {
    id: String(raw.transactionId),
    memo: raw.description || undefined,
    totalAmount: raw.amount,
    currency: raw.currency || undefined,
    accountId: raw.accountId || undefined,
    createdAt: raw.transactionDate ? new Date(raw.transactionDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
