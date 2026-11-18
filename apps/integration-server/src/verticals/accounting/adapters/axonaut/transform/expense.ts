import type { Expense } from '../../../schema/expense'

export interface AxonautExpense {
  id: string
  title: string
  supplier_id: string
  pre_tax_amount: number
  tax_amount: number
  total_amount: number
  currency: string
  date: string
  accounting_code: string
  [key: string]: unknown
}

export function transformExpense(raw: AxonautExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.title || undefined,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.tax_amount || undefined,
    totalAmount: raw.total_amount,
    lineItems: [],
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
