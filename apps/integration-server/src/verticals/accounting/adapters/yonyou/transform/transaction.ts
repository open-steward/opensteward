import type { Transaction } from '../../../schema/transaction'

export interface YonyouTransaction {
  id?: string
  vouchdate?: string
  amount?: number
  currency?: string
  description?: string
  type?: string
  accountId?: string
  taxAmount?: number
  [key: string]: unknown
}

export function transformTransaction(raw: YonyouTransaction): Transaction {
  return {
    id: raw.id ? String(raw.id) : '',
    accountId: raw.accountId ? String(raw.accountId) : undefined,
    type: raw.type || undefined,
    memo: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    taxAmount: raw.taxAmount,
    createdAt: raw.vouchdate ? new Date(raw.vouchdate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
