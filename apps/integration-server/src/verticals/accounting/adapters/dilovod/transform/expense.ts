import type { Expense } from '../../../schema/expense'

export interface DilovodExpense {
  id: string
  date: string
  total: number
  tax?: number
  status?: string
  currency?: string
  [key: string]: unknown
}

export function transformExpense(raw: DilovodExpense): Expense {
  return {
    id: String(raw.id),
    currency: raw.currency || undefined,
    taxAmount: raw.tax || undefined,
    totalAmount: raw.total,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
