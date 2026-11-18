import type { Transaction } from '../../../schema/transaction'

export interface SuperfakturaTransaction {
  id: string | number
  date?: string
  amount?: number
  currency?: string
  description?: string
  type?: string
  account_id?: string
  tax?: number
  [key: string]: unknown
}

export function transformTransaction(raw: SuperfakturaTransaction): Transaction {
  return {
    id: String(raw.id),
    accountId: raw.account_id ? String(raw.account_id) : undefined,
    type: raw.type || undefined,
    memo: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    taxAmount: raw.tax,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
