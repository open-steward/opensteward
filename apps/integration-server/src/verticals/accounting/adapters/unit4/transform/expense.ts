/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Expense } from '../../../schema/expense'

export interface Unit4Expense {
  expenseId: string | number
  postingDate: string
  description?: string
  amount: number
  currencyCode?: string
  employeeId?: string | number
  costCenterId?: string | number
  companyId?: string | number
  [key: string]: unknown
}

export function transformExpense(raw: Unit4Expense): Expense {
  return {
    id: String(raw.expenseId),
    name: raw.description || undefined,
    totalAmount: raw.amount,
    currency: raw.currencyCode || undefined,
    contactId: raw.employeeId ? String(raw.employeeId) : undefined,
    postedAt: raw.postingDate ? new Date(raw.postingDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
