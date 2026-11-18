import type { Transaction } from '../../../schema/transaction'

export interface SystimaTransaction {
  id: string
  date?: string
  description?: string
  amount?: number
  currency?: string
  accountNumber?: string
  [key: string]: unknown
}

export function transformTransaction(raw: SystimaTransaction): Transaction {
  return {
    id: raw.id,
    accountId: raw.accountNumber || undefined,
    memo: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
