import type { Transaction } from '../../../schema/transaction'

export interface WafeqTransaction {
  id: string
  date?: string
  amount?: number
  currency?: string
  type?: string
  description?: string
  status?: string
  contact_id?: string
  account_id?: string
  [key: string]: unknown
}

export function transformTransaction(raw: WafeqTransaction): Transaction {
  return {
    id: String(raw.id),
    accountId: raw.account_id ? String(raw.account_id) : undefined,
    contacts: raw.contact_id
      ? [{ id: String(raw.contact_id) }]
      : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    memo: raw.description || undefined,
    type: raw.type || undefined,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
