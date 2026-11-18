/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Desktop software — no public REST API.
 */

import type { Transaction } from '../../../schema/transaction'

export interface Sage50DeTransaction {
  id: string
  date?: string
  description?: string
  reference?: string
  total?: number
  contact?: { id?: string; displayed_as?: string }
  [key: string]: unknown
}

export function transformTransaction(raw: Sage50DeTransaction): Transaction {
  return {
    id: String(raw.id),
    memo: raw.description,
    totalAmount: raw.total,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    contacts: raw.contact?.id
      ? [{ id: raw.contact.id, name: raw.contact.displayed_as }]
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
