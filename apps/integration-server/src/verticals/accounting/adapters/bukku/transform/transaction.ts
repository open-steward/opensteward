import type { Transaction, TransactionContact } from '../../../schema/transaction'

export interface BukkuPayment {
  id: string | number
  date: string
  amount: number
  reference: string
  description: string
  type: string
  account_id: string | number
  contact_id: string | number
  contact_name: string
  [key: string]: unknown
}

export function transformTransaction(raw: BukkuPayment): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.contact_id) {
    contacts.push({ id: String(raw.contact_id), name: raw.contact_name || undefined })
  }

  return {
    id: String(raw.id),
    accountId: raw.account_id ? String(raw.account_id) : undefined,
    type: raw.type || undefined,
    reference: raw.reference || undefined,
    memo: raw.description || undefined,
    totalAmount: raw.amount,
    contacts: contacts.length > 0 ? contacts : undefined,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
