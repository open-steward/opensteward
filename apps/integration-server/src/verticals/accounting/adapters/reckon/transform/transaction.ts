import type { Transaction, TransactionContact } from '../../../schema/transaction'

export interface ReckonTransaction {
  id: string
  date: string
  amount: number
  type: string
  description: string
  reference: string
  contactId: string
  accountId: string
  [key: string]: unknown
}

export function transformTransaction(raw: ReckonTransaction): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.contactId) {
    contacts.push({ id: raw.contactId })
  }

  return {
    id: raw.id,
    accountId: raw.accountId || undefined,
    type: raw.type || undefined,
    reference: raw.reference || undefined,
    memo: raw.description || undefined,
    totalAmount: raw.amount,
    contacts: contacts.length > 0 ? contacts : undefined,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
