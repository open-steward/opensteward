import type { Expense } from '../../../schema/expense'

export interface FinlyExpense {
  id: string
  name: string
  account_id: string
  vendor_id: string
  currency: string
  tax_amount: number
  total_amount: number
  date: string
  [key: string]: unknown
}

export function transformExpense(raw: FinlyExpense): Expense {
  return {
    id: raw.id,
    name: raw.name || undefined,
    accountId: raw.account_id || undefined,
    contactId: raw.vendor_id || undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.tax_amount || undefined,
    totalAmount: raw.total_amount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
