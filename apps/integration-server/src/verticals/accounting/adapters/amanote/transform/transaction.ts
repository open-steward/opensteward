import type { Transaction } from '../../../schema/transaction'

export interface AmanoteTransaction {
  id: string | number
  date?: string
  description?: string
  total?: number
  contact_id?: string | number
  contact_name?: string
  [key: string]: unknown
}

export function transformTransaction(raw: AmanoteTransaction): Transaction {
  return {
    id: String(raw.id),
    memo: raw.description,
    totalAmount: raw.total,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    contacts: raw.contact_id !== undefined
      ? [{ id: String(raw.contact_id), name: raw.contact_name }]
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
