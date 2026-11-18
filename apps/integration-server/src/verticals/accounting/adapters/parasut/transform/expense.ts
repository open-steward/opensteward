import type { Expense } from '../../../schema/expense'

export interface ParasutExpense {
  id: string
  type: string
  attributes: {
    description?: string
    amount?: number
    date?: string
    currency?: string
    employee_id?: string
    category?: string
  }
  [key: string]: unknown
}

export function transformExpense(raw: ParasutExpense): Expense {
  const attrs = raw.attributes ?? {}
  return {
    id: raw.id,
    name: attrs.description || undefined,
    currency: attrs.currency || undefined,
    totalAmount: attrs.amount,
    postedAt: attrs.date ? new Date(attrs.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
