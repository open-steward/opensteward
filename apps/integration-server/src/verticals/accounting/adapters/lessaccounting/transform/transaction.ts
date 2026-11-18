import type { Transaction } from '../../../schema/transaction'

export interface LessAccountingTransaction {
  id: string
  account_id: string
  type: string
  reference: string
  description: string
  currency: string
  amount: number
  tax_amount: number
  date: string
  [key: string]: unknown
}

export function transformTransaction(raw: LessAccountingTransaction): Transaction {
  return {
    id: raw.id,
    accountId: raw.account_id || undefined,
    type: raw.type || undefined,
    reference: raw.reference || undefined,
    memo: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    taxAmount: raw.tax_amount || undefined,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
