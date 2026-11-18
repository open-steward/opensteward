import type { Expense } from '../../../schema/expense'

export interface BlacklineExpense {
  expenseId: string
  description: string
  amount: number
  currency: string
  expenseDate: string
  categoryId: string
  submittedBy: string
  createdAt: string
  modifiedAt: string
  [key: string]: unknown
}

export function transformExpense(raw: BlacklineExpense): Expense {
  return {
    id: String(raw.expenseId),
    totalAmount: raw.amount,
    currency: raw.currency || undefined,
    name: raw.description || undefined,
    postedAt: raw.expenseDate ? new Date(raw.expenseDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
