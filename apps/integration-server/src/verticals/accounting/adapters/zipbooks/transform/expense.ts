import type { Expense } from '../../../schema/expense'
import { toMinorUnits } from '../../shared/transform'

export interface ZipBooksExpense {
  id: string
  name: string
  account_id: string
  contact_id: string
  currency: string
  tax_amount: number
  total: number
  date: string
  [key: string]: unknown
}

export function transformExpense(raw: ZipBooksExpense): Expense {
  return {
    id: raw.id,
    name: raw.name || undefined,
    accountId: raw.account_id || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    taxAmount: toMinorUnits(raw.tax_amount) || undefined,
    totalAmount: toMinorUnits(raw.total),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
