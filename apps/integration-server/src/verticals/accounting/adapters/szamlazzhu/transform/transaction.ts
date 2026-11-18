/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Primary API is XML-based; REST API availability unconfirmed.
 */

import type { Transaction } from '../../../schema/transaction'

export interface SzamlazzhuTransaction {
  id: string | number
  date?: string
  amount?: number
  currency?: string
  description?: string
  type?: string
  [key: string]: unknown
}

export function transformTransaction(raw: SzamlazzhuTransaction): Transaction {
  return {
    id: String(raw.id),
    totalAmount: raw.amount,
    currency: raw.currency || undefined,
    memo: raw.description || undefined,
    type: raw.type?.toUpperCase() === 'CREDIT' ? 'CREDIT' : 'DEBIT',
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
