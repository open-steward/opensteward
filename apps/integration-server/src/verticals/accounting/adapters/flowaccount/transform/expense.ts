import type { Expense } from '../../../schema/expense'

export interface FlowAccountExpense {
  id: string | number
  date: string
  description: string
  amount: number
  categoryName: string
  [key: string]: unknown
}

export function transformExpense(raw: FlowAccountExpense): Expense {
  return {
    id: String(raw.id),
    totalAmount: raw.amount,
    name: raw.description || raw.categoryName || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
