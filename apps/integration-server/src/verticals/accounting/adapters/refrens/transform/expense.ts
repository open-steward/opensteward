/**
 * Refrens expense transform.
 *
 * Refrens expenditures (purchase invoices) are mapped to the canonical Bill
 * type. There is no separate "expense" resource in the Refrens API.
 * This file is present for interface completeness; the adapter does not
 * implement listExpenses / getExpense / createExpense.
 */

import type { Expense } from '../../../schema/expense'

// Placeholder shape
export interface RefrensExpense {
  _id: string
  [key: string]: unknown
}

export function transformExpense(raw: RefrensExpense): Expense {
  return {
    id: raw._id,
    metadata: raw as Record<string, unknown>,
  }
}
