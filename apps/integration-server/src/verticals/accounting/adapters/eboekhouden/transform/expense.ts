import type { Expense } from '../../../schema/expense'

export interface EBoekhoudenExpense {
  id?: number | string
  invoiceNumber?: string
  relationId?: number | string
  totalInclTax?: number
  taxAmount?: number
  date?: string
  currency?: string
  description?: string
  [key: string]: unknown
}

export function transformExpense(raw: EBoekhoudenExpense): Expense {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    contactId: raw.relationId !== undefined ? String(raw.relationId) : undefined,
    name: raw.description || undefined,
    totalAmount: raw.totalInclTax,
    taxAmount: raw.taxAmount,
    currency: raw.currency || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
