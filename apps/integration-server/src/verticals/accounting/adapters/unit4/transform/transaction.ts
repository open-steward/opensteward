/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Transaction } from '../../../schema/transaction'

export interface Unit4Transaction {
  transactionId: string | number
  postingDate: string
  description?: string
  amount: number
  currencyCode?: string
  supplierId?: string | number
  companyId?: string | number
  [key: string]: unknown
}

export function transformTransaction(raw: Unit4Transaction): Transaction {
  return {
    id: String(raw.transactionId),
    memo: raw.description || undefined,
    totalAmount: raw.amount,
    currency: raw.currencyCode || undefined,
    contacts: raw.supplierId ? [{ id: String(raw.supplierId) }] : undefined,
    createdAt: raw.postingDate ? new Date(raw.postingDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
