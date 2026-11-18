/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Primary API is XML-based; REST API availability unconfirmed.
 */

import type { Expense } from '../../../schema/expense'

export interface SzamlazzhuExpense {
  id: string | number
  date?: string
  total?: number
  tax?: number
  status?: string
  currency?: string
  [key: string]: unknown
}

export function transformExpense(raw: SzamlazzhuExpense): Expense {
  return {
    id: String(raw.id),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax,
    currency: raw.currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
