import type { Expense } from '../../../schema/expense'

export interface MasteraccountingExpense {
  id: string
  date: string
  totalSum: number
  taxSum?: number
  currency?: string
  partnerId?: string
  [key: string]: unknown
}

export function transformExpense(raw: MasteraccountingExpense): Expense {
  return {
    id: String(raw.id),
    contactId: raw.partnerId || undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.taxSum || undefined,
    totalAmount: raw.totalSum,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
