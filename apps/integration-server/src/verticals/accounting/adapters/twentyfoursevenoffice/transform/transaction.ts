import type { Transaction } from '../../../schema/transaction'

export interface TwentyFourSevenTransaction {
  id: string
  date: string
  amount: number
  type: string
  accountId: string
  currency: string
  reference: string
  [key: string]: unknown
}

export function transformTransaction(raw: TwentyFourSevenTransaction): Transaction {
  return {
    id: raw.id,
    accountId: raw.accountId || undefined,
    type: raw.type || undefined,
    reference: raw.reference || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
