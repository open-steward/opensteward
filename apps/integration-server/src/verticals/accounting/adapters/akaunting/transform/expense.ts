import type { Expense } from '../../../schema/expense'

export interface AkauntingExpense {
  id: number
  contact_id: number
  currency_code: string
  issued_at: string
  amount: number
  tax_total: number
  description: string
  category_name: string
  [key: string]: unknown
}

export function transformExpense(raw: AkauntingExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.description || raw.category_name || undefined,
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    currency: raw.currency_code || undefined,
    taxAmount: raw.tax_total || undefined,
    totalAmount: raw.amount,
    postedAt: raw.issued_at ? new Date(raw.issued_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
