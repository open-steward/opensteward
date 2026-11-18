import type { Expense } from '../../../schema/expense'

export interface MorningExpense {
  id: string
  date: string
  description?: string
  sum: number
  currency?: string
  clientId?: string
  [key: string]: unknown
}

export function transformExpense(raw: MorningExpense): Expense {
  return {
    id: raw.id,
    name: raw.description as string | undefined,
    contactId: raw.clientId as string | undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.sum,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
