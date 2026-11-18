import type { Expense } from '../../../schema/expense'

export interface AppFolioExpense {
  id: string | number
  date: string
  description: string
  amount: number
  tax_amount: number
  currency: string
  vendor_id: string | number
  property_id: string | number
  [key: string]: unknown
}

export function transformExpense(raw: AppFolioExpense): Expense {
  return {
    id: String(raw.id),
    totalAmount: raw.amount,
    taxAmount: raw.tax_amount || undefined,
    name: raw.description || undefined,
    contactId: raw.vendor_id ? String(raw.vendor_id) : undefined,
    currency: raw.currency || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
