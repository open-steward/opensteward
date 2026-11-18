/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Transaction } from '../../../schema/transaction'

export interface PohodaTransaction {
  id: string | number
  date?: string
  amount?: number
  currency?: string
  description?: string
  type?: string
  accountId?: string
  vatAmount?: number
  [key: string]: unknown
}

export function transformTransaction(raw: PohodaTransaction): Transaction {
  return {
    id: String(raw.id),
    accountId: raw.accountId ? String(raw.accountId) : undefined,
    type: raw.type || undefined,
    memo: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    taxAmount: raw.vatAmount,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
