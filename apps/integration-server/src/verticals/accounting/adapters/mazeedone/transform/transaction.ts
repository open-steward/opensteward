import type { Transaction } from '../../../schema/transaction'

export interface MazeedOneTransaction {
  id: string | number
  date: string
  amount: number
  currency: string
  type: string
  description: string
  status: string
  account_id: string | number
  contact_id: string | number
  [key: string]: unknown
}

export function transformTransaction(raw: MazeedOneTransaction): Transaction {
  return {
    id: String(raw.id),
    accountId: raw.account_id ? String(raw.account_id) : undefined,
    type: raw.type || undefined,
    memo: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    contacts: raw.contact_id
      ? [{ id: String(raw.contact_id) }]
      : undefined,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
