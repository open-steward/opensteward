import type { Expense } from '../../../schema/expense'

export interface ICountExpense {
  doc_id: string
  date: string
  description?: string
  sum: number
  currency_code?: string
  client_id?: string
  [key: string]: unknown
}

export function transformExpense(raw: ICountExpense): Expense {
  return {
    id: raw.doc_id,
    name: raw.description as string | undefined,
    contactId: raw.client_id as string | undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.sum,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
