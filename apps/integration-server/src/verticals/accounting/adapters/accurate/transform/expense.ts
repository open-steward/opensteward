import type { Expense } from '../../../schema/expense'

export interface AccurateExpense {
  id: number
  date: string
  description: string | null
  totalAmount: number
  employeeNo: string | null
  [key: string]: unknown
}

export function transformExpense(raw: AccurateExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    userId: raw.employeeNo || undefined,
    totalAmount: raw.totalAmount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
