import type { Expense } from '../../../schema/expense'
import { toMinorUnits } from '../../shared/transform'

export interface InvoiceXpressExpense {
  id: number
  date: string
  description: string
  total: number
  currency: string
  [key: string]: unknown
}

export function transformExpense(raw: InvoiceXpressExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: toMinorUnits(raw.total),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
