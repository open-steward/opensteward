import type { Expense } from '../../../schema/expense'

export interface FreshBooksExpense {
  id: number
  vendor: string
  account_name: string
  date: string
  currency_code: string
  amount: { amount: string; code: string }
  tax_amount1: { amount: string; code: string }
  notes: string
  status: number
  category: { name: string }
  [key: string]: unknown
}

export function transformExpense(raw: FreshBooksExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.notes || undefined,
    contactId: raw.vendor || undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.amount?.amount ? parseFloat(raw.amount.amount) : undefined,
    taxAmount: raw.tax_amount1?.amount ? parseFloat(raw.tax_amount1.amount) : undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
