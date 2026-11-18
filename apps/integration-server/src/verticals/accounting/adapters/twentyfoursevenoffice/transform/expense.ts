import type { Expense } from '../../../schema/expense'

export interface TwentyFourSevenExpense {
  id: string
  description: string
  contactId: string
  currency: string
  date: string
  totalAmount: number
  taxAmount: number
  [key: string]: unknown
}

export function transformExpense(raw: TwentyFourSevenExpense): Expense {
  return {
    id: raw.id,
    name: raw.description || undefined,
    contactId: raw.contactId || undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.taxAmount || undefined,
    totalAmount: raw.totalAmount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
