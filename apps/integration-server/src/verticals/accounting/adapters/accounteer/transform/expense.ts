import type { Expense } from '../../../schema/expense'
import { parseDecimal } from '../../shared/transform'

export interface AccounteerExpense {
  id: string
  description?: string
  amount?: number
  tax_amount?: number
  currency?: string
  date?: string
  contact_id?: string
  account_id?: string
  reference?: string
  [key: string]: unknown
}

export function transformExpense(raw: AccounteerExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    accountId: raw.account_id ? String(raw.account_id) : undefined,
    totalAmount: parseDecimal(raw.amount),
    taxAmount: parseDecimal(raw.tax_amount),
    currency: raw.currency || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
