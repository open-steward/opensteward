import type { Transaction } from '../../../schema/transaction'

export interface KingdeeTransaction {
  id?: string
  date?: string
  amount?: number
  currency?: string
  description?: string
  type?: string
  acctId?: string
  taxAmount?: number
  [key: string]: unknown
}

export function transformTransaction(raw: KingdeeTransaction): Transaction {
  return {
    id: raw.id ? String(raw.id) : '',
    accountId: raw.acctId ? String(raw.acctId) : undefined,
    type: raw.type || undefined,
    memo: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    taxAmount: raw.taxAmount,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
