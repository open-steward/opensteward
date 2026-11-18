import type { Expense } from '../../../schema/expense'
import { toMinorUnits } from '../../shared/transform'

export interface SellsyExpense {
  id: string
  title: string
  contact_id: string
  currency: string
  date: string
  total_amount: number
  tax_amount: number
  account_id: string
  [key: string]: unknown
}

export function transformExpense(raw: SellsyExpense): Expense {
  return {
    id: raw.id,
    name: raw.title || undefined,
    contactId: raw.contact_id || undefined,
    accountId: raw.account_id || undefined,
    currency: raw.currency || undefined,
    taxAmount: toMinorUnits(raw.tax_amount) || undefined,
    totalAmount: toMinorUnits(raw.total_amount),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
