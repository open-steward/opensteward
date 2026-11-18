import type { Transaction, TransactionContact } from '../../../schema/transaction'

export interface LexofficeTransaction {
  id: string
  createdDate: string
  bookingDate: string
  amount: number
  currency: string
  purpose: string
  creditorId: string
  debtorId: string
  [key: string]: unknown
}

export function transformTransaction(raw: LexofficeTransaction): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.creditorId) contacts.push({ id: raw.creditorId })
  if (raw.debtorId) contacts.push({ id: raw.debtorId })

  return {
    id: raw.id,
    memo: raw.purpose || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    contacts: contacts.length ? contacts : undefined,
    createdAt: raw.createdDate ? new Date(raw.createdDate) : undefined,
    updatedAt: raw.bookingDate ? new Date(raw.bookingDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
