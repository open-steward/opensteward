import { toCalendarDate } from '../../shared/transform'
import type { Expense } from '../../../schema/expense'

export interface HorizonErpExpense {
  id: string
  date: string
  description: string
  total_amount: number
  tax_amount: number
  currency: string
  account_id: string
  contact_id: string
  [key: string]: unknown
}

export function transformExpense(raw: HorizonErpExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    accountId: raw.account_id || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.tax_amount,
    totalAmount: raw.total_amount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformExpense(expense: Partial<Expense>): Record<string, unknown> {
  return {
    account_id: expense.accountId,
    contact_id: expense.contactId,
    currency: expense.currency,
    date: toCalendarDate(expense.postedAt),
    total_amount: expense.totalAmount,
    tax_amount: expense.taxAmount,
    description: expense.name,
  }
}
