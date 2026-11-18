import type { Transaction } from '../../../schema/transaction'

export interface FikenTransaction {
  transactionId: number
  date: string
  description: string
  type: string
  accountCode: string
  amount: number
  currency: string
  [key: string]: unknown
}

export function transformTransaction(raw: FikenTransaction): Transaction {
  return {
    id: String(raw.transactionId),
    accountId: raw.accountCode || undefined,
    type: raw.type || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
