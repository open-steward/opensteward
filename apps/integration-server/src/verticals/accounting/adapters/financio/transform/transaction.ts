import type { Transaction, TransactionContact } from '../../../schema/transaction'

export interface FinancioPayment {
  id: string | number
  payment_date: string
  amount: number
  reference: string
  type: string
  account_code: string
  contact_id: string | number
  contact_name: string
  [key: string]: unknown
}

export function transformTransaction(raw: FinancioPayment): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.contact_id) {
    contacts.push({ id: String(raw.contact_id), name: raw.contact_name || undefined })
  }

  return {
    id: String(raw.id),
    type: raw.type || undefined,
    reference: raw.reference || undefined,
    totalAmount: raw.amount,
    contacts: contacts.length > 0 ? contacts : undefined,
    createdAt: raw.payment_date ? new Date(raw.payment_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
