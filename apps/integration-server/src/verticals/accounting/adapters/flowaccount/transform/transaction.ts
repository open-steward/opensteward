import type { Transaction } from '../../../schema/transaction'

export interface FlowAccountTransaction {
  id: string | number
  transactionDate: string
  description: string
  amount: number
  currencyCode: string
  accountId: string | number
  [key: string]: unknown
}

export function transformTransaction(raw: FlowAccountTransaction): Transaction {
  return {
    id: String(raw.id),
    accountId: raw.accountId ? String(raw.accountId) : undefined,
    memo: raw.description || undefined,
    totalAmount: raw.amount,
    currency: raw.currencyCode || undefined,
    createdAt: raw.transactionDate ? new Date(raw.transactionDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
