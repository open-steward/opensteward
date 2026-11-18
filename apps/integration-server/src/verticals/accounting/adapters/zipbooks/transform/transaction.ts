import type { Transaction } from '../../../schema/transaction'

export interface ZipBooksTransaction {
  id: string
  account_id: string
  type: string
  reference: string
  description: string
  currency: string
  amount: number
  tax_amount: number
  created_at: string
  [key: string]: unknown
}

export function transformTransaction(raw: ZipBooksTransaction): Transaction {
  return {
    id: raw.id,
    accountId: raw.account_id || undefined,
    type: raw.type || undefined,
    reference: raw.reference || undefined,
    memo: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    taxAmount: raw.tax_amount || undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
