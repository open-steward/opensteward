import { toCalendarDate } from '../../shared/transform'
import type { Expense } from '../../../schema/expense'

export interface ManagerioExpense {
  Key: string
  Date: string
  Description: string
  Amount: number
  TaxAmount: number
  Currency: string
  Contact: string
  Account: string
  [key: string]: unknown
}

export function transformExpense(raw: ManagerioExpense): Expense {
  return {
    id: String(raw.Key),
    name: raw.Description || undefined,
    accountId: raw.Account || undefined,
    contactId: raw.Contact || undefined,
    currency: raw.Currency || undefined,
    taxAmount: raw.TaxAmount,
    totalAmount: raw.Amount,
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformExpense(expense: Partial<Expense>): Record<string, unknown> {
  return {
    Date: toCalendarDate(expense.postedAt),
    Description: expense.name,
    Amount: expense.totalAmount,
    TaxAmount: expense.taxAmount,
    Currency: expense.currency,
    Contact: expense.contactId,
    Account: expense.accountId,
  }
}
