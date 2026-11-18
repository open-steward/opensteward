import type { Expense } from '../../../schema/expense'

export interface AccountsIQExpense {
  expenseId: string | number
  entityId: string | number
  expenseDate: string
  description: string
  totalAmount: number
  contactId: string | number
  [key: string]: unknown
}

export function transformExpense(raw: AccountsIQExpense): Expense {
  return {
    id: String(raw.expenseId),
    totalAmount: raw.totalAmount,
    name: raw.description || undefined,
    contactId: raw.contactId ? String(raw.contactId) : undefined,
    postedAt: raw.expenseDate ? new Date(raw.expenseDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
