import type { Expense } from '../../../schema/expense'

export interface MeritaktivaExpense {
  id: string | number
  date?: string
  total?: number
  tax?: number
  status?: string
  currency?: string
  [key: string]: unknown
}

export function transformExpense(raw: MeritaktivaExpense): Expense {
  return {
    id: String(raw.id),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax,
    currency: raw.currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
