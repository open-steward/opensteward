import type { Expense } from '../../../schema/expense'

export interface VismaNetExpense {
  id: string
  date?: string
  description?: string
  total?: number
  currency?: string
  status?: string
  [key: string]: unknown
}

export function transformExpense(raw: VismaNetExpense): Expense {
  return {
    id: raw.id,
    name: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
