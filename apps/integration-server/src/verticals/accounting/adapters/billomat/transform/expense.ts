import type { Expense } from '../../../schema/expense'

export interface BillomatExpense {
  id: string
  description: string
  supplier_id: string
  currency_code: string
  total_gross: number
  tax_amount: number
  date: string
  [key: string]: unknown
}

export function transformExpense(raw: BillomatExpense): Expense {
  return {
    id: raw.id,
    name: raw.description || undefined,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency_code || undefined,
    taxAmount: raw.tax_amount || undefined,
    totalAmount: raw.total_gross,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
