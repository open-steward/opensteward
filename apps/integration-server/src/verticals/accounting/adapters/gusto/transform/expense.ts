import type { Expense } from '../../../schema/expense'

export interface GustoExpense {
  id: string | number
  date: string
  description: string
  amount: number
  employee_id?: string | number
  category?: string
  [key: string]: unknown
}

export function transformExpense(raw: GustoExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    totalAmount: raw.amount,
    contactId: raw.employee_id ? String(raw.employee_id) : undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
