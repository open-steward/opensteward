import type { Transaction } from '../../../schema/transaction'

export interface FATransaction {
  id?: number | string
  reference?: string
  tran_date?: string
  account?: string
  memo?: string
  amount?: number
  [key: string]: unknown
}

export function transformTransaction(raw: FATransaction): Transaction {
  return {
    id: raw.id !== undefined ? String(raw.id) : '',
    accountId: raw.account || undefined,
    reference: raw.reference || undefined,
    memo: raw.memo || undefined,
    totalAmount: raw.amount ?? 0,
    createdAt: raw.tran_date ? new Date(raw.tran_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
