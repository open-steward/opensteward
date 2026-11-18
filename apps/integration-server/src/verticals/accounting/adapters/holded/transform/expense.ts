import type { Expense } from '../../../schema/expense'
import { toMinorUnits } from '../../shared/transform'

export interface HoldedExpense {
  id: string
  name: string
  accountId: string
  contact: string
  currency: string
  tax: number
  total: number
  date: number
  [key: string]: unknown
}

export function transformExpense(raw: HoldedExpense): Expense {
  return {
    id: raw.id,
    name: raw.name || undefined,
    accountId: raw.accountId || undefined,
    contactId: raw.contact || undefined,
    currency: raw.currency || undefined,
    taxAmount: toMinorUnits(raw.tax) || undefined,
    totalAmount: toMinorUnits(raw.total),
    postedAt: raw.date ? new Date(raw.date * 1000) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
