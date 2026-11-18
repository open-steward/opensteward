import type { Transaction } from '../../../schema/transaction'

export interface InvoiceXpressTransaction {
  id: number
  date: string
  description: string
  value: number
  currency: string
  [key: string]: unknown
}

export function transformTransaction(raw: InvoiceXpressTransaction): Transaction {
  return {
    id: String(raw.id),
    memo: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.value,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
