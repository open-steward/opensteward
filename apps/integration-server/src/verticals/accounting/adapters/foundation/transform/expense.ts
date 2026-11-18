/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Expense } from '../../../schema/expense'

export interface FoundationExpense {
  ExpenseId: string | number
  ExpenseDate: string
  Description: string
  Amount: number
  JobNumber: string
  VendorId: string
  [key: string]: unknown
}

export function transformExpense(raw: FoundationExpense): Expense {
  return {
    id: String(raw.ExpenseId),
    totalAmount: raw.Amount,
    name: raw.Description || undefined,
    contactId: raw.VendorId || undefined,
    postedAt: raw.ExpenseDate ? new Date(raw.ExpenseDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
