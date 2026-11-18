import type { Expense } from '../../../schema/expense'
import { toMinorUnits } from '../../shared/transform'

export interface BexioExpense {
  id: number
  name: string
  account_id: number
  contact_id: number | null
  currency_code: string
  tax_amount: number
  total_amount: number
  date: string
  [key: string]: unknown
}

export function transformExpense(raw: BexioExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    accountId: raw.account_id ? String(raw.account_id) : undefined,
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    currency: raw.currency_code || undefined,
    taxAmount: toMinorUnits(raw.tax_amount) || undefined,
    totalAmount: toMinorUnits(raw.total_amount),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
