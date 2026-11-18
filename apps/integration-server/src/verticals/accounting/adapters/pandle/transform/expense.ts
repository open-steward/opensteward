import type { Expense } from '../../../schema/expense'

export interface PandleExpense {
  id: number
  description: string
  supplier_id: number
  currency: string
  net_amount: number
  tax_amount: number
  total_amount: number
  date: string
  [key: string]: unknown
}

export function transformExpense(raw: PandleExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    contactId: raw.supplier_id ? String(raw.supplier_id) : undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.tax_amount || undefined,
    totalAmount: raw.total_amount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
