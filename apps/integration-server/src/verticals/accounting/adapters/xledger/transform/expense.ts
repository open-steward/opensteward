import type { Expense } from '../../../schema/expense'

export interface XledgerExpense {
  id: string
  transactionDate?: string
  description?: string
  amount?: number
  currency?: string
  status?: number
  [key: string]: unknown
}

// Status codes: 10=DRAFT, 20=SUBMITTED, 30=APPROVED, 40=PAID
// (stored in metadata; Expense canonical type carries no status field)

export function transformExpense(raw: XledgerExpense): Expense {
  return {
    id: raw.id,
    name: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    postedAt: raw.transactionDate ? new Date(raw.transactionDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
