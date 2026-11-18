import type { Transaction } from '../../../schema/transaction'

export interface CenterTransaction {
  id: string
  accountId: string
  type: string
  reference: string
  description: string
  currency: string
  amount: number
  taxAmount: number
  createdAt: string
  [key: string]: unknown
}

export function transformTransaction(raw: CenterTransaction): Transaction {
  return {
    id: raw.id,
    accountId: raw.accountId || undefined,
    type: raw.type || undefined,
    reference: raw.reference || undefined,
    memo: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    taxAmount: raw.taxAmount || undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
