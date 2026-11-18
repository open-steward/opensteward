import type { Transaction } from '../../../schema/transaction'

export interface BexioTransaction {
  id: number
  date: string
  account_id: number
  type: string
  reference: string
  memo: string
  currency_code: string
  total_amount: number
  tax_amount: number
  [key: string]: unknown
}

export function transformTransaction(raw: BexioTransaction): Transaction {
  return {
    id: String(raw.id),
    accountId: raw.account_id ? String(raw.account_id) : undefined,
    type: raw.type || undefined,
    reference: raw.reference || undefined,
    memo: raw.memo || undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount || undefined,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
