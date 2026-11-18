import type { Expense } from '../../../schema/expense'

export interface PowerOfficeExpense {
  id: number
  employeeId: number
  description: string
  transactionDate: string
  currencyCode: string
  grossAmount: number
  vatAmount: number
  status: number
  [key: string]: unknown
}

export function transformExpense(raw: PowerOfficeExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    userId: raw.employeeId ? String(raw.employeeId) : undefined,
    currency: raw.currencyCode || undefined,
    taxAmount: raw.vatAmount || undefined,
    totalAmount: raw.grossAmount,
    postedAt: raw.transactionDate ? new Date(raw.transactionDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
