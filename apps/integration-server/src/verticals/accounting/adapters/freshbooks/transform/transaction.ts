import type { Transaction, TransactionContact } from '../../../schema/transaction'

export interface FreshBooksPayment {
  id: number
  client_id: number
  invoice_id: number
  amount: { amount: string; code: string }
  currency_code: string
  date: string
  note: string
  type: string
  [key: string]: unknown
}

export function transformTransaction(raw: FreshBooksPayment): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.client_id) {
    contacts.push({ id: String(raw.client_id) })
  }

  return {
    id: String(raw.id),
    reference: raw.invoice_id ? String(raw.invoice_id) : undefined,
    type: raw.type || undefined,
    memo: raw.note || undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.amount?.amount ? parseFloat(raw.amount.amount) : undefined,
    contacts: contacts.length ? contacts : undefined,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
