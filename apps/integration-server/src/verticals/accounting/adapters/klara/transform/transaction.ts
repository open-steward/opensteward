/**
 * KLARA payment/transaction transform.
 *
 * KLARA payment records represent money movements (Zahlungen).
 * Fields: id, account_id, contact_id, type, reference, currency,
 *         total_amount, payment_method, payment_date
 */

import type { Transaction, TransactionContact } from '../../../schema/transaction'

export interface KlaraPayment {
  id: string
  account_id?: string
  contact_id?: string
  type?: string
  reference?: string
  currency?: string
  total_amount?: number
  payment_method?: string
  payment_date?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformTransaction(raw: KlaraPayment): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.contact_id) {
    contacts.push({ id: raw.contact_id })
  }

  return {
    id: raw.id || undefined,
    accountId: raw.account_id || undefined,
    type: raw.type || undefined,
    reference: raw.reference || undefined,
    currency: raw.currency || undefined,
    paymentMethod: raw.payment_method || undefined,
    totalAmount: raw.total_amount,
    contacts: contacts.length > 0 ? contacts : undefined,
    createdAt: raw.payment_date ? new Date(raw.payment_date) : (raw.created_at ? new Date(raw.created_at) : undefined),
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
