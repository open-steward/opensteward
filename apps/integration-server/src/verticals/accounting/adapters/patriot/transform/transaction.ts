import type { Transaction } from '../../../schema/transaction'

export interface PatriotTransaction {
  id: string
  date: string
  amount: number
  type: string
  account_id: string
  currency: string
  reference: string
  [key: string]: unknown
}

export function transformTransaction(raw: PatriotTransaction): Transaction {
  return {
    id: raw.id,
    accountId: raw.account_id || undefined,
    type: raw.type || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    reference: raw.reference || undefined,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
