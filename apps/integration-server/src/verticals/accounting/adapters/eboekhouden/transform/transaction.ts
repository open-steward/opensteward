import type { Transaction } from '../../../schema/transaction'

export interface EBoekhoudenTransaction {
  id?: number | string
  date?: string
  amount?: number
  description?: string
  ledgerId?: number | string
  currency?: string
  [key: string]: unknown
}

export function transformTransaction(raw: EBoekhoudenTransaction): Transaction {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    accountId: raw.ledgerId !== undefined ? String(raw.ledgerId) : undefined,
    memo: raw.description || undefined,
    totalAmount: raw.amount,
    currency: raw.currency || undefined,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
