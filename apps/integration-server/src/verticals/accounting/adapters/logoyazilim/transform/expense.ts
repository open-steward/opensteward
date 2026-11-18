import type { Expense } from '../../../schema/expense'

export interface LogoExpense {
  id: string
  Date?: string
  Description?: string
  Amount?: number
  CategoryId?: string
  ContactId?: string
  Currency?: string
  [key: string]: unknown
}

export function transformExpense(raw: LogoExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.Description || undefined,
    contactId: raw.ContactId ? String(raw.ContactId) : undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Amount,
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
