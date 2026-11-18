import type { Transaction } from '../../../schema/transaction'

export interface FreeeBankTransaction {
  id: number
  date: string
  amount: number
  description: string | null
  balance: number
  [key: string]: unknown
}

export function transformTransaction(raw: FreeeBankTransaction): Transaction {
  return {
    id: String(raw.id),
    memo: raw.description || undefined,
    totalAmount: raw.amount,
    lineItems: [
      {
        totalAmount: raw.amount,
        description: raw.description || undefined,
      },
    ],
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
