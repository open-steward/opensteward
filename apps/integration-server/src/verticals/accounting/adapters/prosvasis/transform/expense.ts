import type { Expense } from '../../../schema/expense'

export interface ProsvasisExpense {
  id: string | number
  Date: string
  Description: string
  Amount: number
  CategoryId: string | number
  [key: string]: unknown
}

export function transformExpense(raw: ProsvasisExpense): Expense {
  return {
    id: String(raw.id),
    totalAmount: raw.Amount,
    name: raw.Description || undefined,
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
