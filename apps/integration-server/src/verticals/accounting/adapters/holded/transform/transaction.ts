import type { Transaction } from '../../../schema/transaction'

export interface HoldedTransaction {
  id: string
  accountId: string
  type: string
  reference: string
  description: string
  currency: string
  amount: number
  taxAmount: number
  date: number
  [key: string]: unknown
}

export function transformTransaction(raw: HoldedTransaction): Transaction {
  return {
    id: raw.id,
    accountId: raw.accountId || undefined,
    type: raw.type || undefined,
    reference: raw.reference || undefined,
    memo: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    taxAmount: raw.taxAmount || undefined,
    createdAt: raw.date ? new Date(raw.date * 1000) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
