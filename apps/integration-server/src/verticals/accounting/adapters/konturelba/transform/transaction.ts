import type { Transaction } from '../../../schema/transaction'

export interface KonturelbaTransaction {
  id?: string
  date?: string
  amount?: number
  currency?: string
  description?: string
  type?: string
  accountId?: string
  vatAmount?: number
  [key: string]: unknown
}

export function transformTransaction(raw: KonturelbaTransaction): Transaction {
  return {
    id: raw.id ? String(raw.id) : '',
    accountId: raw.accountId ? String(raw.accountId) : undefined,
    type: raw.type || undefined,
    memo: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    taxAmount: raw.vatAmount,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
