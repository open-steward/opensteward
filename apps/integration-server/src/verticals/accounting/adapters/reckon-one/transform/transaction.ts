/**
 * Reckon One v2 payment / transaction transforms.
 *
 * Payments record receipts from customers and payments to suppliers.
 * API endpoint: GET /R1/{cashbookId}/payments[/{paymentId}]
 *
 * Key fields: id, date, amount, currency, accountId,
 *             customer.id, supplier.id, paymentMethod, reference
 */

import type { Transaction, TransactionContact } from '../../../schema/transaction'

export interface ReckonOnePayment {
  id: string
  date?: string
  amount?: number
  currency?: string
  /** Deposit/clearing account */
  account?: { id: string; name?: string }
  customer?: { id: string; name?: string }
  supplier?: { id: string; name?: string }
  paymentMethod?: string
  reference?: string
  memo?: string
  createdDateTime?: string
  modifiedDateTime?: string
  [key: string]: unknown
}

export function transformTransaction(raw: ReckonOnePayment): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.customer?.id) contacts.push({ id: raw.customer.id, name: raw.customer.name })
  if (raw.supplier?.id) contacts.push({ id: raw.supplier.id, name: raw.supplier.name })

  return {
    id: raw.id,
    accountId: raw.account?.id || undefined,
    currency: raw.currency || undefined,
    paymentMethod: raw.paymentMethod || undefined,
    reference: raw.reference || undefined,
    memo: raw.memo || undefined,
    totalAmount: raw.amount != null ? Math.round(raw.amount * 100) : undefined,
    contacts: contacts.length > 0 ? contacts : undefined,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    updatedAt: raw.modifiedDateTime ? new Date(raw.modifiedDateTime) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
