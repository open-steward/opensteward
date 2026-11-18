import type { Expense } from '../../../schema/expense'

export interface EpsilonNetExpense {
  id: string | number
  date: string
  description: string
  amount: number
  categoryId: string | number
  [key: string]: unknown
}

export function transformExpense(raw: EpsilonNetExpense): Expense {
  return {
    id: String(raw.id),
    totalAmount: raw.amount,
    name: raw.description || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
