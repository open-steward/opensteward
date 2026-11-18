import type { Transaction } from '../../../schema/transaction'

export interface ClearLedgerEntry {
  id: string
  date: string
  amount: number
  transaction_type: string
  description: string
  account_id: string
  contact_id: string
  reference: string
  [key: string]: unknown
}

export function transformTransaction(raw: ClearLedgerEntry): Transaction {
  return {
    id: raw.id,
    accountId: raw.account_id || undefined,
    type: raw.transaction_type || undefined,
    reference: raw.reference || undefined,
    memo: raw.description || undefined,
    totalAmount: raw.amount,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
