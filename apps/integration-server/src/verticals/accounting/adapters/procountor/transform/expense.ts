import type { Expense } from '../../../schema/expense'

export interface ProcountorExpense {
  id: number
  description: string
  partnerId: number
  currency: string
  sum: number
  vatAmount: number
  date: string
  [key: string]: unknown
}

export function transformExpense(raw: ProcountorExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    contactId: raw.partnerId ? String(raw.partnerId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.sum,
    taxAmount: raw.vatAmount || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
