/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Transaction, TransactionContact } from '../../../schema/transaction'

export interface DatevTransaction {
  id: string | number
  booking_date: string
  amount: number
  description: string
  document_number: string
  account_number: string
  partner_id: string | number
  partner_name: string
  [key: string]: unknown
}

export function transformTransaction(raw: DatevTransaction): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.partner_id) {
    contacts.push({ id: String(raw.partner_id), name: raw.partner_name || undefined })
  }

  return {
    id: String(raw.id),
    type: undefined,
    reference: raw.document_number || undefined,
    memo: raw.description || undefined,
    totalAmount: raw.amount,
    contacts: contacts.length > 0 ? contacts : undefined,
    createdAt: raw.booking_date ? new Date(raw.booking_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
