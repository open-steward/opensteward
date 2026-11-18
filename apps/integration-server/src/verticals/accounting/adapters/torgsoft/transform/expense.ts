import type { Expense } from '../../../schema/expense'

export interface TorgsoftExpense {
  id: string
  date: string
  total_amount: number
  tax_amount?: number
  currency?: string
  client_id?: string
  [key: string]: unknown
}

export function transformExpense(raw: TorgsoftExpense): Expense {
  return {
    id: String(raw.id),
    contactId: raw.client_id || undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.tax_amount || undefined,
    totalAmount: raw.total_amount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
