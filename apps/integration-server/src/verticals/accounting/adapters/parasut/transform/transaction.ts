import type { Transaction } from '../../../schema/transaction'

export interface ParasutTransaction {
  id: string
  type: string
  attributes: {
    description?: string
    amount?: number
    date?: string
    currency?: string
    debit_credit?: string
  }
  [key: string]: unknown
}

export function transformTransaction(raw: ParasutTransaction): Transaction {
  const attrs = raw.attributes ?? {}
  return {
    id: raw.id,
    memo: attrs.description || undefined,
    totalAmount: attrs.amount,
    currency: attrs.currency || undefined,
    createdAt: attrs.date ? new Date(attrs.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
