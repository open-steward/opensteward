import type { Transaction } from '../../../schema/transaction'

export interface HorizonErpTransaction {
  id: string
  date: string
  amount: number
  currency: string
  type: string
  description: string
  status: string
  [key: string]: unknown
}

export function transformTransaction(raw: HorizonErpTransaction): Transaction {
  return {
    id: String(raw.id),
    type: raw.type || undefined,
    memo: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
