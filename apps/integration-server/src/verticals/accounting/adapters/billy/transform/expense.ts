import type { Expense } from '../../../schema/expense'

export interface BillyExpense {
  id: string
  contactId: string
  currencyId: string
  entryDate: string
  grossAmount: number
  taxAmount: number
  description: string
  [key: string]: unknown
}

export function transformExpense(raw: BillyExpense): Expense {
  return {
    id: raw.id,
    name: raw.description || undefined,
    contactId: raw.contactId || undefined,
    currency: raw.currencyId || undefined,
    taxAmount: raw.taxAmount || undefined,
    totalAmount: raw.grossAmount,
    postedAt: raw.entryDate ? new Date(raw.entryDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
