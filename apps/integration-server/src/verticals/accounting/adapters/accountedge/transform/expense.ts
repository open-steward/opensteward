/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Expense } from '../../../schema/expense'

export interface AccountEdgeExpense {
  id: string
  name: string
  account_id: string
  contact_id: string
  currency: string
  tax_amount: number
  total: number
  date: string
  [key: string]: unknown
}

export function transformExpense(raw: AccountEdgeExpense): Expense {
  return {
    id: raw.id,
    name: raw.name || undefined,
    accountId: raw.account_id || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.tax_amount || undefined,
    totalAmount: raw.total,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
