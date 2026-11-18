import type { Expense } from '../../../schema/expense'

export interface PeakAccountExpense {
  id: string | number
  date: string
  description: string
  amount: number
  categoryId: string | number
  currency: string
  [key: string]: unknown
}

export function transformExpense(raw: PeakAccountExpense): Expense {
  return {
    id: String(raw.id),
    totalAmount: raw.amount,
    currency: raw.currency || undefined,
    name: raw.description || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
