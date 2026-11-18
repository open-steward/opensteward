import type { Expense } from '../../../schema/expense'
import { toMinorUnits } from '../../shared/transform'

export interface CenterExpense {
  id: string
  name: string
  accountId: string
  contactId: string
  currency: string
  taxAmount: number
  total: number
  date: string
  [key: string]: unknown
}

export function transformExpense(raw: CenterExpense): Expense {
  return {
    id: raw.id,
    name: raw.name || undefined,
    accountId: raw.accountId || undefined,
    contactId: raw.contactId || undefined,
    currency: raw.currency || undefined,
    taxAmount: toMinorUnits(raw.taxAmount) || undefined,
    totalAmount: toMinorUnits(raw.total),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
