import type { Expense } from '../../../schema/expense'

/**
 * Calxa expense record as returned by GET /expenses and GET /expenses/:id.
 *
 * Expenses represent spend transactions synced from the connected accounting
 * system (e.g. receipts, reimbursements).
 */
export interface CalxaExpense {
  id: string
  /** Display name or title of the expense. */
  name?: string
  /** Identifier of the contact (supplier/payee) associated with the expense. */
  contactId?: string
  /** ISO 4217 currency code. */
  currency?: string
  /** Total tax component. */
  taxAmount?: number
  /** Grand total amount of the expense. */
  total?: number
  /** ISO 8601 expense date. */
  date?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformExpense(raw: CalxaExpense): Expense {
  return {
    id: raw.id,
    name: raw.name || undefined,
    contactId: raw.contactId || undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.taxAmount ?? undefined,
    totalAmount: raw.total ?? undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
