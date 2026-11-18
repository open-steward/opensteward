import type { Expense } from '../../../schema/expense'

export interface FinmapExpense {
  id: string
  date: string
  amount: number
  currency?: string
  status?: string
  [key: string]: unknown
}

export function transformExpense(raw: FinmapExpense): Expense {
  return {
    id: String(raw.id),
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
