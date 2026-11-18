import type { Expense } from '../../../schema/expense'
import { parseDecimal } from '../../shared/transform'

export interface UhasibuExpense {
  id: string
  date?: string
  name?: string
  amount?: number
  currency?: string
  account_id?: string
  contact_id?: string
  [key: string]: unknown
}

export function transformExpense(raw: UhasibuExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    totalAmount: parseDecimal(raw.amount),
    currency: raw.currency || undefined,
    accountId: raw.account_id ? String(raw.account_id) : undefined,
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
