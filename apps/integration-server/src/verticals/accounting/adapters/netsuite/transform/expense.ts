import type { Expense } from '../../../schema/expense'

export interface NetSuiteExpense {
  id?: string | number
  tranId?: string
  entity?: string | number
  total?: number
  currency?: string
  tranDate?: string
  [key: string]: unknown
}

export function transformExpense(raw: NetSuiteExpense): Expense {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    userId: raw.entity !== undefined ? String(raw.entity) : undefined,
    totalAmount: raw.total,
    currency: raw.currency || undefined,
    postedAt: raw.tranDate ? new Date(raw.tranDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
