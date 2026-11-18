import type { Transaction } from '../../../schema/transaction'

export interface MorningIncome {
  id: string
  date: string
  amount: number
  currency?: string
  description?: string
  clientId?: string
  [key: string]: unknown
}

export function transformTransaction(raw: MorningIncome): Transaction {
  return {
    id: raw.id,
    totalAmount: raw.amount,
    currency: raw.currency || undefined,
    memo: raw.description as string | undefined,
    contacts: raw.clientId ? [{ id: raw.clientId }] : undefined,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
