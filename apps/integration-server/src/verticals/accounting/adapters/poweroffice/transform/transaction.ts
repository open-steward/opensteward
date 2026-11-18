import type { Transaction } from '../../../schema/transaction'

export interface PowerOfficeTransaction {
  id: number
  transactionDate: string
  description: string
  amount: number
  currencyCode: string
  bankAccountCode: string
  [key: string]: unknown
}

export function transformTransaction(raw: PowerOfficeTransaction): Transaction {
  return {
    id: String(raw.id),
    accountId: raw.bankAccountCode || undefined,
    memo: raw.description || undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.amount,
    createdAt: raw.transactionDate ? new Date(raw.transactionDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
