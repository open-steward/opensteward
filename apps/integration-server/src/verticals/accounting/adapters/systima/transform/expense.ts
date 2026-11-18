import type { Expense } from '../../../schema/expense'

export interface SystimaExpense {
  id: string
  date?: string
  description?: string
  totalAmount?: number
  currency?: string
  status?: string
  [key: string]: unknown
}

export function transformExpense(raw: SystimaExpense): Expense {
  return {
    id: raw.id,
    name: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
