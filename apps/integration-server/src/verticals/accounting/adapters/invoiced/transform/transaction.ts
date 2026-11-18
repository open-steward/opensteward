/**
 * Invoiced Payment → canonical Transaction transform.
 *
 * Docs: https://developer.invoiced.com/api/payments
 */
import type { Transaction, TransactionContact } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface InvoicedPayment {
  id: number
  object: string
  customer: number
  amount: number
  balance: number
  currency: string
  date: number | null
  method: string | null
  reference: string | null
  notes: string | null
  voided: boolean
  source: string | null
  metadata: Record<string, unknown>
  created_at: number
  updated_at: number
  [key: string]: unknown
}

export function transformTransaction(raw: InvoicedPayment): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.customer) {
    contacts.push({ id: String(raw.customer) })
  }

  const lineItems: TransactionLineitem[] = [
    {
      totalAmount: raw.amount,
      name: raw.method || undefined,
    },
  ]

  return {
    id: String(raw.id),
    type: raw.method || undefined,
    reference: raw.reference || undefined,
    memo: raw.notes || undefined,
    paymentMethod: raw.method || undefined,
    currency: raw.currency ? raw.currency.toUpperCase() : undefined,
    totalAmount: raw.amount,
    contacts: contacts.length > 0 ? contacts : undefined,
    lineItems,
    createdAt: raw.date ? new Date(raw.date * 1000) : (raw.created_at ? new Date(raw.created_at * 1000) : undefined),
    updatedAt: raw.updated_at ? new Date(raw.updated_at * 1000) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
